/**
 * Release 1.1 services: admin reassign, leave and cover, recurring series,
 * QR check-in and auto no-show, post-session feedback, equipment log.
 * Every availability decision still goes through packages/rules.
 */
import { randomBytes } from "node:crypto";
import type { Db } from "@sunmarke/db";
import { isUniqueViolation } from "@sunmarke/db";
import { addDays, canCover, evaluate, findCover, localDate, recurringDates, timetableForDate } from "@sunmarke/rules";
import type { IssueInput, SeriesInput } from "../shared/schemas";
import { audit } from "./audit";
import { AppError, cancelBooking, createBooking, getBookingDetail, listBookings, type Actor, type BookingDetail } from "./bookings";
import { enqueue, runJobs } from "./jobs";
import { sendAdminAlert } from "./notify";
import { getSettings, getTimetables, loadWorld } from "./world";
import { newId, now } from "./util";
import { fmtDateShort } from "../shared/format";

// ---------------------------------------------------------------------------
// Reassign (admin) and leave-and-cover
// ---------------------------------------------------------------------------

async function moveToIncharge(db: Db, actor: Actor | null, b: BookingDetail, staffId: string, reason: string) {
  const assignments = await db.query<{ priority: number }>("SELECT priority FROM incharge_assignments WHERE resource_id = $1 AND staff_id = $2", [b.resourceId, staffId]);
  const primary = await db.query<{ staff_id: string }>("SELECT staff_id FROM incharge_assignments WHERE resource_id = $1 ORDER BY priority LIMIT 1", [b.resourceId]);
  try {
    await db.transaction(async (tx) => {
      await tx.query("UPDATE booking_slots SET incharge_id = $2 WHERE booking_id = $1 AND active", [b.id, staffId]);
      await tx.query("UPDATE bookings SET incharge_id = $2, cross_cover = $3, updated_at = $4 WHERE id = $1", [
        b.id, staffId, primary[0]?.staff_id !== staffId, now().toISOString(),
      ]);
      await audit(tx, { actorId: actor?.id ?? null, action: "booking.reassign", entity: "booking", entityId: b.id, before: { inchargeId: b.inchargeId }, after: { inchargeId: staffId, reason, assigned: assignments.length > 0 } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(409, "busy", "That in-charge was just booked for this block.");
    throw e;
  }
  const after = (await getBookingDetail(db, b.id))!;
  await enqueue(db, { kind: "calendar.delete", bookingId: b.id });
  await enqueue(db, { kind: "calendar.upsert", bookingId: b.id });
  await enqueue(db, { kind: "email", template: "changed", bookingId: b.id, to: "both", extra: { what: `${after.inchargeName} is now coming instead of ${b.inchargeName}${reason ? ` (${reason})` : ""}` } });
  await enqueue(db, { kind: "email", template: "changed", bookingId: b.id, to: "incharge", extra: { inchargeEmail: b.inchargeEmail, what: `${after.inchargeName} now covers this session` } });
  return after;
}

/** Admin: move a booking to a named in-charge, or to whoever is free when staffId is omitted. */
export async function reassignBooking(db: Db, actor: Actor, id: string, staffId: string | undefined, reason: string) {
  if (actor.role !== "admin") throw new AppError(403, "forbidden", "Only the lab admin can reassign.");
  const b = await getBookingDetail(db, id);
  if (!b) throw new AppError(404, "not_found", "Booking not found.");
  if (b.status !== "confirmed") throw new AppError(409, "not_active", "This booking is not active.");
  const world = await loadWorld(db, b.date, b.date);
  let target = staffId;
  if (!target) {
    const c = findCover(world, b);
    if (!c) throw new AppError(409, "no_cover", "Nobody else is free for every block of this booking.");
    target = c.staffId;
  }
  if (target === b.inchargeId) return b;
  const staff = world.staffRows.find((s) => s.id === target && s.active && (s.role === "incharge" || s.role === "admin"));
  if (!staff) throw new AppError(422, "invalid", "Pick a lab in-charge.");
  const busy = canCover(world, target, b.date, b.blockIds, b.id);
  if (busy) throw new AppError(409, "busy", `${staff.name} is busy (${busy.text}).`);
  const after = await moveToIncharge(db, actor, b, target, reason);
  await runJobs(db).catch(() => undefined);
  return after;
}

export interface AbsenceInput {
  staffId: string;
  dateFrom: string;
  dateTo: string;
  blockCodes: string[] | null;
  reason: string;
}

/**
 * Record in-charge leave, then deal with every affected booking: hand it to the
 * other in-charge when they are free, otherwise tell the teacher and admin.
 */
export async function addAbsence(db: Db, actor: Actor, a: AbsenceInput) {
  if (actor.role !== "admin" && !(actor.role === "incharge" && actor.id === a.staffId)) throw new AppError(403, "forbidden", "You can only mark your own leave.");
  if (a.dateTo < a.dateFrom) throw new AppError(422, "invalid", "The end date is before the start date.");
  const id = newId("abs");
  await db.query("INSERT INTO absences (id, staff_id, date_from, date_to, block_codes, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
    id, a.staffId, a.dateFrom, a.dateTo, a.blockCodes, a.reason, actor.id,
  ]);
  await audit(db, { actorId: actor.id, action: "absence.create", entity: "absence", entityId: id, after: a });
  const result = await coverAbsence(db, actor, a);
  await runJobs(db).catch(() => undefined);
  return { id, ...result };
}

async function coverAbsence(db: Db, actor: Actor, a: AbsenceInput) {
  const tts = await getTimetables(db);
  const affected = (await listBookings(db, { inchargeId: a.staffId, from: a.dateFrom, to: a.dateTo, status: ["confirmed"] })).filter((b) => {
    if (b.end.getTime() < now().getTime()) return false;
    if (!a.blockCodes) return true;
    const codes = b.blockIds.map((id) => timetableForDate(tts, b.date)?.blocks.find((x) => x.id === id)?.code);
    return codes.some((c) => c && a.blockCodes!.includes(c));
  });
  const reassigned: string[] = [];
  const uncovered: string[] = [];
  for (const b of affected) {
    const world = await loadWorld(db, b.date, b.date);
    const c = findCover(world, b);
    if (c) {
      await moveToIncharge(db, actor, b, c.staffId, a.reason ? `${b.inchargeName}: ${a.reason}` : `${b.inchargeName} is away`);
      reassigned.push(b.id);
    } else {
      uncovered.push(b.id);
      await enqueue(db, { kind: "email", template: "no_cover", bookingId: b.id, to: "teacher", extra: { reason: a.reason } });
    }
  }
  if (uncovered.length) {
    const rows: [string, string][] = [];
    for (const id of uncovered) {
      const b = (await getBookingDetail(db, id))!;
      rows.push([`${fmtDateShort(b.date)} ${b.blockLabel}`, `${b.resourceName} · ${b.teacherName} · ${b.classLabel}`]);
    }
    await sendAdminAlert(db, `${uncovered.length} booking${uncovered.length > 1 ? "s" : ""} without an in-charge`, rows);
  }
  return { reassigned: reassigned.length, uncovered: uncovered.length };
}

export async function removeAbsence(db: Db, actor: Actor, id: string) {
  const r = await db.query<{ staff_id: string }>("SELECT staff_id FROM absences WHERE id = $1", [id]);
  if (!r[0]) throw new AppError(404, "not_found", "Not found.");
  if (actor.role !== "admin" && actor.id !== r[0].staff_id) throw new AppError(403, "forbidden", "Not allowed.");
  await db.query("UPDATE absences SET active = false WHERE id = $1", [id]);
  await audit(db, { actorId: actor.id, action: "absence.remove", entity: "absence", entityId: id });
}

// ---------------------------------------------------------------------------
// Recurring series with clash preview
// ---------------------------------------------------------------------------

export interface SeriesLine {
  date: string;
  ok: boolean;
  reason: string;
  inchargeName?: string;
  bookingId?: string;
}

export async function planSeries(db: Db, actor: Actor, input: SeriesInput): Promise<{ lines: SeriesLine[]; recurrenceId?: string }> {
  if (actor.role === "viewer") throw new AppError(403, "forbidden", "Leadership viewers cannot book.");
  if (input.onBehalfOf && actor.role !== "admin") throw new AppError(403, "forbidden", "Only the lab admin can book for someone else.");
  if (input.endDate < input.startDate) throw new AppError(422, "invalid", "The end date is before the start date.");
  const dates = recurringDates(input.startDate, input.endDate, input.everyWeeks);
  const tts = await getTimetables(db);
  const t = now();
  const teacherId = input.onBehalfOf ?? actor.id;
  const resolve = (date: string) => {
    const tt = timetableForDate(tts, date);
    const ids = input.blockCodes.map((c) => tt?.blocks.find((b) => b.code === c && b.bookable)?.id);
    return ids.every(Boolean) ? (ids as string[]) : null;
  };

  if (input.preview !== false) {
    const lines: SeriesLine[] = [];
    for (const date of dates) {
      const blockIds = resolve(date);
      if (!blockIds) {
        lines.push({ date, ok: false, reason: `${input.blockCodes.join("+")} is not on that day's timetable` });
        continue;
      }
      const world = await loadWorld(db, date, date);
      const ev = evaluate(world, { resourceId: input.resourceId, date, blockIds, units: input.cartCount ?? 1, now: t, teacherId, recurring: true });
      lines.push(ev.ok ? { date, ok: true, reason: "Free", inchargeName: ev.inchargeName } : { date, ok: false, reason: ev.reason });
    }
    return { lines };
  }

  const recurrenceId = newId("rec");
  await db.query(
    "INSERT INTO recurrences (id, teacher_id, resource_id, start_date, end_date, every_weeks, block_codes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [recurrenceId, teacherId, input.resourceId, input.startDate, input.endDate, input.everyWeeks, input.blockCodes, actor.id],
  );
  const lines: SeriesLine[] = [];
  for (const date of dates) {
    const blockIds = resolve(date);
    if (!blockIds) {
      lines.push({ date, ok: false, reason: `${input.blockCodes.join("+")} is not on that day's timetable` });
      continue;
    }
    const r = await createBooking(
      db,
      actor,
      {
        resourceId: input.resourceId, date, blockIds, subject: input.subject, yearGroup: input.yearGroup, section: input.section,
        studentCount: input.studentCount, cartCount: input.cartCount, classroom: input.classroom, objective: input.objective,
        specialRequirements: input.specialRequirements, lessonPlanUrl: "",
      },
      { onBehalfOf: input.onBehalfOf, recurrenceId, runJobsNow: false },
    );
    lines.push(r.ok ? { date, ok: true, reason: "Booked", inchargeName: r.booking.inchargeName, bookingId: r.booking.id } : { date, ok: false, reason: r.reason });
  }
  await audit(db, { actorId: actor.id, action: "series.create", entity: "recurrence", entityId: recurrenceId, after: { ...input, booked: lines.filter((l) => l.ok).length } });
  await runJobs(db).catch(() => undefined);
  return { lines, recurrenceId };
}

export async function cancelSeries(db: Db, actor: Actor, recurrenceId: string) {
  const r = await db.query<{ teacher_id: string }>("SELECT teacher_id FROM recurrences WHERE id = $1", [recurrenceId]);
  if (!r[0]) throw new AppError(404, "not_found", "Series not found.");
  if (actor.role !== "admin" && r[0].teacher_id !== actor.id) throw new AppError(403, "forbidden", "You can only cancel your own series.");
  const ids = await db.query<{ id: string }>("SELECT id FROM bookings WHERE recurrence_id = $1 AND status = 'confirmed'", [recurrenceId]);
  let n = 0;
  for (const { id } of ids) {
    try {
      await cancelBooking(db, actor, id);
      n++;
    } catch {
      /* too late to cancel this one; it stays */
    }
  }
  return { cancelled: n, kept: ids.length - n };
}

// ---------------------------------------------------------------------------
// QR check-in and auto no-show
// ---------------------------------------------------------------------------

export async function ensureCheckinCodes(db: Db) {
  const rows = await db.query<{ id: string }>("SELECT id FROM resources WHERE checkin_code IS NULL");
  for (const r of rows) await db.query("UPDATE resources SET checkin_code = $2 WHERE id = $1", [r.id, randomBytes(6).toString("base64url")]);
}

/** A teacher scans the lab-door QR code: marks their session attended. */
export async function checkIn(db: Db, actor: Actor, code: string) {
  const res = await db.query<{ id: string; name: string }>("SELECT id, name FROM resources WHERE checkin_code = $1 AND active", [code]);
  if (!res[0]) throw new AppError(404, "not_found", "This check-in code is not recognised.");
  const t = now();
  const settings = await getSettings(db);
  const today = localDate(t, settings);
  const list = await listBookings(db, { from: today, to: today, status: ["confirmed", "completed"] });
  const mine = list.filter((b) => b.resourceId === res[0].id && (b.teacherId === actor.id || actor.role === "incharge" || actor.role === "admin"));
  const current = mine.find((b) => t.getTime() >= b.start.getTime() - 15 * 60_000 && t.getTime() <= b.end.getTime());
  if (!current) return { ok: false as const, resourceName: res[0].name, message: `No session of yours in ${res[0].name} right now. Check-in opens 15 minutes before the start.` };
  if (current.status === "completed") return { ok: true as const, resourceName: res[0].name, booking: current, already: true };
  await db.query("UPDATE bookings SET status = 'completed', checked_in_at = $2, updated_at = $2 WHERE id = $1", [current.id, t.toISOString()]);
  await audit(db, { actorId: actor.id, action: "booking.checkin", entity: "booking", entityId: current.id });
  return { ok: true as const, resourceName: res[0].name, booking: (await getBookingDetail(db, current.id))!, already: false };
}

/** Cron: lab sessions with no check-in N minutes after the start become no-shows. Carts are delivered, so they are skipped. */
export async function markNoShows(db: Db) {
  const t = now();
  const settings = await getSettings(db);
  if (settings.autoNoShowMinutes <= 0) return 0;
  const today = localDate(t, settings);
  const list = await listBookings(db, { from: today, to: today, status: ["confirmed"] });
  let n = 0;
  for (const b of list) {
    if (b.resourceType !== "room") continue;
    if (t.getTime() < b.start.getTime() + settings.autoNoShowMinutes * 60_000) continue;
    const r = await db.query("UPDATE bookings SET status = 'no_show', status_reason = 'No check-in', updated_at = $2 WHERE id = $1 AND status = 'confirmed' AND checked_in_at IS NULL RETURNING id", [b.id, t.toISOString()]);
    if (r.length) {
      n++;
      await audit(db, { actorId: null, action: "booking.auto_no_show", entity: "booking", entityId: b.id });
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Post-session feedback and the equipment log
// ---------------------------------------------------------------------------

export async function submitFeedback(db: Db, actor: Actor, bookingId: string, f: { rating: number; comment: string; issue?: string; item?: string }) {
  const b = await getBookingDetail(db, bookingId);
  if (!b) throw new AppError(404, "not_found", "Booking not found.");
  if (b.teacherId !== actor.id) throw new AppError(403, "forbidden", "You can only rate your own sessions.");
  if (!["completed", "confirmed"].includes(b.status) || b.start.getTime() > now().getTime()) throw new AppError(409, "too_early", "You can rate a session once it has started.");
  let issueId: string | null = null;
  if (f.issue && f.issue.length >= 3) {
    issueId = (await reportIssue(db, actor, { resourceId: b.resourceId, item: f.item ?? "", title: f.issue, detail: `Reported after ${b.classLabel} on ${fmtDateShort(b.date)} ${b.blockLabel}`, severity: "medium" }, bookingId)).id;
  }
  await db.query(
    "INSERT INTO feedback (booking_id, teacher_id, rating, comment, issue_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (booking_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, issue_id = COALESCE(EXCLUDED.issue_id, feedback.issue_id)",
    [bookingId, actor.id, f.rating, f.comment, issueId],
  );
  await audit(db, { actorId: actor.id, action: "feedback.submit", entity: "booking", entityId: bookingId, after: { rating: f.rating } });
  return { ok: true, issueId };
}

/** Cron: one feedback email per session, sent after it ends. */
export async function sendFeedbackRequests(db: Db) {
  const t = now();
  const settings = await getSettings(db);
  const today = localDate(t, settings);
  const list = await listBookings(db, { from: addDays(today, -1), to: today, status: ["completed", "confirmed"] });
  let n = 0;
  for (const b of list) {
    if (b.end.getTime() > t.getTime()) continue;
    const r = await db.query("UPDATE bookings SET feedback_sent_at = $2 WHERE id = $1 AND feedback_sent_at IS NULL AND NOT EXISTS (SELECT 1 FROM feedback WHERE booking_id = $1) RETURNING id", [b.id, t.toISOString()]);
    if (r.length) {
      await enqueue(db, { kind: "email", template: "feedback", bookingId: b.id, to: "teacher" }, `feedback:${b.id}`);
      n++;
    }
  }
  return n;
}

export async function reportIssue(db: Db, actor: Actor, i: IssueInput, bookingId?: string) {
  if (actor.role === "viewer") throw new AppError(403, "forbidden", "Not allowed.");
  const res = await db.query("SELECT 1 FROM resources WHERE id = $1", [i.resourceId]);
  if (!res.length) throw new AppError(422, "invalid", "Unknown lab.");
  const id = newId("iss");
  let blackoutId: string | null = null;
  if (i.blockFrom && (actor.role === "incharge" || actor.role === "admin")) {
    blackoutId = newId("bo");
    const to = i.blockTo && i.blockTo >= i.blockFrom ? i.blockTo : i.blockFrom;
    await db.query("INSERT INTO blackouts (id, resource_id, date_from, date_to, block_codes, reason, note, created_by) VALUES ($1,$2,$3,$4,NULL,'maintenance',$5,$6)", [
      blackoutId, i.resourceId, i.blockFrom, to, `${i.item ? `${i.item}: ` : ""}${i.title}`.slice(0, 120), actor.id,
    ]);
  }
  await db.query(
    "INSERT INTO equipment_issues (id, resource_id, item, title, detail, severity, blackout_id, booking_id, reported_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [id, i.resourceId, i.item, i.title, i.detail, i.severity, blackoutId, bookingId ?? null, actor.id],
  );
  await audit(db, { actorId: actor.id, action: "issue.report", entity: "equipment_issue", entityId: id, after: i });
  if (i.severity === "high") await sendAdminAlert(db, `Equipment problem: ${i.title}`, [["Where", `${i.resourceId}${i.item ? ` · ${i.item}` : ""}`], ["Detail", i.detail || "-"], ["Reported by", actor.name]]);
  return { id, blackoutId };
}

export async function resolveIssue(db: Db, actor: Actor, id: string, note: string) {
  if (actor.role !== "incharge" && actor.role !== "admin") throw new AppError(403, "forbidden", "Only lab staff can close issues.");
  const r = await db.query<{ blackout_id: string | null }>("UPDATE equipment_issues SET status = 'resolved', resolved_by = $2, resolved_note = $3, resolved_at = $4 WHERE id = $1 AND status = 'open' RETURNING blackout_id", [
    id, actor.id, note, now().toISOString(),
  ]);
  if (!r[0]) throw new AppError(404, "not_found", "Issue not found or already closed.");
  if (r[0].blackout_id) await db.query("UPDATE blackouts SET active = false WHERE id = $1", [r[0].blackout_id]);
  await audit(db, { actorId: actor.id, action: "issue.resolve", entity: "equipment_issue", entityId: id, after: { note } });
}

export async function listIssues(db: Db, status: "open" | "all" = "open") {
  return db.query<{ id: string; resource_id: string; resource_name: string; item: string; title: string; detail: string; severity: string; status: string; blackout_id: string | null; reporter: string; created_at: Date; resolved_note: string | null }>(
    `SELECT i.*, r.name AS resource_name, s.name AS reporter FROM equipment_issues i JOIN resources r ON r.id = i.resource_id JOIN staff s ON s.id = i.reported_by
     ${status === "open" ? "WHERE i.status = 'open'" : ""} ORDER BY i.status, CASE i.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, i.created_at DESC LIMIT 200`,
  );
}
