import type { Db } from "@sunmarke/db";
import { isUniqueViolation } from "@sunmarke/db";
import {
  alternatives,
  blockInterval,
  canCancel,
  evaluate,
  timetableForDate,
  type Alternative,
  type Block,
  type BlockedCode,
  weekRange, blockOn } from "@sunmarke/rules";
import type { BookingInput, BookingPatch } from "../shared/schemas";
import { audit } from "./audit";
import { enqueue, runJobs } from "./jobs";
import { loadWorld, getSettings, getTimetables } from "./world";
import { newId, now } from "./util";
import { sendBookingEmail, sendWaitlistOffer } from "./notify";

export interface Actor {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "incharge" | "admin" | "viewer";
  department: string;
  /** Release 2: the campus this person is working in now (their own, or the one a group admin picked). Unset = the default campus. */
  campusId?: string;
  /** The campus they belong to. */
  homeCampusId?: string;
  /** Group admins and leadership who may switch between campuses. */
  allCampuses?: boolean;
}

export const DEFAULT_CAMPUS = "sunmarke";
export function campusOf(actor: Pick<Actor, "campusId">): string {
  return actor.campusId ?? DEFAULT_CAMPUS;
}

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show" | "declined";

export interface BookingDetail {
  id: string;
  resourceId: string;
  resourceName: string;
  resourceType: "room" | "cart_pool";
  resourceColour: string;
  date: string;
  blockIds: string[];
  blockLabel: string; // "P3" or "P3–P4"
  timeLabel: string; // "09:55–10:50"
  start: Date;
  end: Date;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  department: string;
  inchargeId: string;
  inchargeName: string;
  inchargeEmail: string;
  crossCover: boolean;
  subject: string;
  yearGroup: string;
  section: string;
  classLabel: string; // "Y8 B"
  studentCount: number;
  cartCount: number | null;
  classroom: string | null;
  objective: string;
  lessonPlanUrl: string | null;
  specialRequirements: string;
  status: BookingStatus;
  statusReason: string | null;
  createdAt: Date;
  recurrenceId: string | null;
  checkedInAt: Date | null;
  rating: number | null;
  /** Release 2: KS3 progressive plan levels this lesson covers. */
  curriculumIds: string[];
  /** AI Carts: the other in-charges going with the carts (one per cart, lead excluded). */
  supportIds: string[];
  supportNames: string[];
  supportEmails: string[];
  /** Lead plus support: everyone this booking keeps busy. */
  staffIds: string[];
}

type Row = {
  id: string; resource_id: string; resource_name: string; resource_type: "room" | "cart_pool"; colour: string; date: string; block_ids: string[];
  teacher_id: string; teacher_name: string; teacher_email: string; department: string; incharge_id: string; incharge_name: string; incharge_email: string;
  cross_cover: boolean; subject: string; year_group: string; section: string; student_count: number; cart_count: number | null; classroom: string | null;
  objective: string; lesson_plan_url: string | null; special_requirements: string; status: BookingStatus; status_reason: string | null; created_at: Date;
  recurrence_id: string | null; checked_in_at: Date | null; rating: number | null; curriculum_ids: string[] | null;
  support_ids: string[] | null; support_names: string[] | null; support_emails: string[] | null;
};

const SELECT = `
SELECT b.*, r.name AS resource_name, r.type AS resource_type, r.colour,
  t.name AS teacher_name, t.email AS teacher_email, t.department,
  i.name AS incharge_name, i.email AS incharge_email,
  (SELECT f.rating FROM feedback f WHERE f.booking_id = b.id) AS rating,
  ARRAY(SELECT s.name FROM unnest(b.support_ids) WITH ORDINALITY u(id, n) JOIN staff s ON s.id = u.id ORDER BY u.n) AS support_names,
  ARRAY(SELECT s.email FROM unnest(b.support_ids) WITH ORDINALITY u(id, n) JOIN staff s ON s.id = u.id ORDER BY u.n) AS support_emails
FROM bookings b
JOIN resources r ON r.id = b.resource_id
JOIN staff t ON t.id = b.teacher_id
JOIN staff i ON i.id = b.incharge_id`;

async function toDetails(db: Db, rows: Row[]): Promise<BookingDetail[]> {
  if (rows.length === 0) return [];
  const [timetables, settings] = await Promise.all([getTimetables(db), getSettings(db)]);
  const allBlocks = new Map<string, Block>();
  for (const t of timetables) for (const b of t.blocks) allBlocks.set(b.id, b);
  return rows.map((r) => {
    const blocks = r.block_ids.map((id) => allBlocks.get(id)).filter(Boolean) as Block[];
    blocks.sort((a, b) => a.start.localeCompare(b.start));
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    const start = first ? blockInterval(r.date, first, settings).start : new Date(`${r.date}T00:00:00Z`);
    const end = last ? blockInterval(r.date, last, settings).end : start;
    return {
      id: r.id,
      resourceId: r.resource_id,
      resourceName: r.resource_name,
      resourceType: r.resource_type,
      resourceColour: r.colour,
      date: r.date,
      blockIds: r.block_ids,
      blockLabel: blocks.length > 1 ? `${first.code}–${last.code}` : (first?.code ?? "?"),
      timeLabel: first ? `${first.start}–${last.end}` : "",
      start,
      end,
      teacherId: r.teacher_id,
      teacherName: r.teacher_name,
      teacherEmail: r.teacher_email,
      department: r.department,
      inchargeId: r.incharge_id,
      inchargeName: r.incharge_name,
      inchargeEmail: r.incharge_email,
      crossCover: r.cross_cover,
      subject: r.subject,
      yearGroup: r.year_group,
      section: r.section,
      classLabel: `${r.year_group}${r.section ? ` ${r.section}` : ""}`,
      studentCount: r.student_count,
      cartCount: r.cart_count,
      classroom: r.classroom,
      objective: r.objective,
      lessonPlanUrl: r.lesson_plan_url,
      specialRequirements: r.special_requirements,
      status: r.status,
      statusReason: r.status_reason,
      createdAt: new Date(r.created_at),
      recurrenceId: r.recurrence_id ?? null,
      checkedInAt: r.checked_in_at ? new Date(r.checked_in_at) : null,
      rating: r.rating ?? null,
      curriculumIds: r.curriculum_ids ?? [],
      supportIds: r.support_ids ?? [],
      supportNames: r.support_names ?? [],
      supportEmails: r.support_emails ?? [],
      staffIds: [r.incharge_id, ...(r.support_ids ?? [])],
    };
  });
}

export async function getBookingDetail(db: Db, id: string): Promise<BookingDetail | null> {
  const rows = await db.query<Row>(`${SELECT} WHERE b.id = $1`, [id]);
  return (await toDetails(db, rows))[0] ?? null;
}

export async function listBookings(db: Db, f: { teacherId?: string; inchargeId?: string; from?: string; to?: string; status?: BookingStatus[] } = {}) {
  const where: string[] = [];
  const p: unknown[] = [];
  if (f.teacherId) { p.push(f.teacherId); where.push(`b.teacher_id = $${p.length}`); }
  if (f.inchargeId) { p.push(f.inchargeId); where.push(`b.incharge_id = $${p.length}`); }
  if (f.from) { p.push(f.from); where.push(`b.date >= $${p.length}`); }
  if (f.to) { p.push(f.to); where.push(`b.date <= $${p.length}`); }
  if (f.status?.length) { p.push(f.status); where.push(`b.status = ANY($${p.length})`); }
  const rows = await db.query<Row>(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY b.date, b.block_ids[1]`, p);
  const d = await toDetails(db, rows);
  return d.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ---------------------------------------------------------------------------
// Create (R1–R8 via the rules engine, R7 via unique indexes in one transaction)
// ---------------------------------------------------------------------------

export type CreateResult =
  | { ok: true; booking: BookingDetail; calendarChecked: boolean }
  | { ok: false; code: BlockedCode | "just_taken"; reason: string; suggestion?: string; canWaitlist: boolean; alternatives: Alternative[] };

export async function createBooking(
  db: Db,
  actor: Actor,
  input: BookingInput,
  opts: { onBehalfOf?: string; runJobsNow?: boolean; recurrenceId?: string } = {},
): Promise<CreateResult> {
  if (actor.role === "viewer") throw new AppError(403, "forbidden", "Leadership viewers cannot book.");
  const override = actor.role === "admin" && input.overrideWindow === true;
  const onBehalf = opts.onBehalfOf ?? input.onBehalfOf;
  if (onBehalf && actor.role !== "admin") throw new AppError(403, "forbidden", "Only the lab admin can book for someone else.");
  const teacherId = actor.role === "admin" && onBehalf ? onBehalf : actor.id;
  if (teacherId !== actor.id) {
    const ok = await db.query("SELECT 1 FROM staff WHERE id = $1 AND active", [teacherId]);
    if (!ok.length) throw new AppError(422, "invalid", "That teacher is not on the staff list.");
  }
  const t = now();
  const req = {
    resourceId: input.resourceId,
    date: input.date,
    blockIds: input.blockIds,
    units: input.cartCount ?? 1,
    now: t,
    overrideWindow: override,
    teacherId,
    recurring: Boolean(opts.recurrenceId),
    usage: override ? undefined : await quotaUsage(db, teacherId, input.date),
  };

  const curriculumIds = await checkCurriculum(db, input.curriculumIds);

  // Live check with fresh calendar free/busy (R2).
  const world = await loadWorld(db, input.date, input.date);
  const resource = world.resourceRows.find((r) => r.id === input.resourceId);
  // Release 2: teachers book labs on their own campus; a group admin may book anywhere for themselves.
  if (resource) {
    const home = await db.query<{ campus_id: string }>("SELECT campus_id FROM staff WHERE id = $1", [teacherId]);
    const sameCampus = home[0]?.campus_id === resource.campusId;
    if (!sameCampus && !(actor.allCampuses && teacherId === actor.id))
      throw new AppError(403, "other_campus", "This lab belongs to another campus.");
  }
  if (resource?.type === "cart_pool") {
    if (!input.cartCount) throw new AppError(422, "invalid", "Say how many carts you need.");
    if (!input.classroom) throw new AppError(422, "invalid", "Say which classroom the carts go to.");
  }
  const pre = evaluate(world, req);
  if (!pre.ok) {
    await db.query("INSERT INTO booking_attempts (teacher_id, resource_id, date, block_id, code) VALUES ($1,$2,$3,$4,$5)", [
      teacherId, input.resourceId, input.date, input.blockIds[0], pre.code,
    ]);
    return { ...pre, alternatives: alternatives(world, req) };
  }

  const id = newId("bk");
  try {
    await db.transaction(async (tx) => {
      // Serialise writers on this resource, then re-check with the latest holds.
      await tx.query("SELECT id FROM resources WHERE id = $1 FOR UPDATE", [input.resourceId]);
      const fresh = await loadWorld(db, input.date, input.date, { tx, skipCalendar: true });
      const ev = evaluate({ ...fresh, busy: world.busy }, req);
      if (!ev.ok) throw new JustTaken(ev.reason);
      await tx.query(
        `INSERT INTO bookings (id, resource_id, date, block_ids, teacher_id, incharge_id, subject, year_group, section, student_count,
          cart_count, classroom, objective, lesson_plan_url, special_requirements, status, cross_cover, created_by, created_at, updated_at, recurrence_id, curriculum_ids, support_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'confirmed',$16,$17,$18,$18,$19,$20,$21)`,
        [
          id, input.resourceId, input.date, input.blockIds, teacherId, ev.inchargeId, input.subject, input.yearGroup, input.section,
          input.studentCount, resource?.type === "cart_pool" ? input.cartCount : null, resource?.type === "cart_pool" ? input.classroom : null,
          input.objective, input.lessonPlanUrl || null, input.specialRequirements, ev.crossCover, actor.id, t.toISOString(), opts.recurrenceId ?? null, curriculumIds,
          ev.inchargeIds.slice(1),
        ],
      );
      // One slot per in-charge per block: a cart booking holds one cart and one in-charge per row,
      // so the unique index on (incharge, date, block) keeps every in-charge in one place.
      for (const blockId of input.blockIds)
        for (const who of ev.inchargeIds)
          await tx.query(
            "INSERT INTO booking_slots (booking_id, incharge_id, resource_id, room_key, date, block_id, units) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            [id, who, input.resourceId, resource?.type === "room" ? input.resourceId : null, input.date, blockId, 1],
          );
      await audit(tx, { actorId: actor.id, action: override ? "booking.create.override" : "booking.create", entity: "booking", entityId: id, after: { ...input, inchargeIds: ev.inchargeIds } });
      await tx.query("UPDATE waitlist SET status = 'booked' WHERE teacher_id = $1 AND resource_id = $2 AND date = $3 AND block_id = ANY($4) AND status IN ('waiting','offered')", [
        teacherId, input.resourceId, input.date, input.blockIds,
      ]);
      await enqueue(tx, { kind: "calendar.upsert", bookingId: id });
      await enqueue(tx, { kind: "email", template: "confirmed", bookingId: id, to: "both" });
    });
  } catch (e) {
    if (e instanceof JustTaken || isUniqueViolation(e)) {
      await db.query("INSERT INTO booking_attempts (teacher_id, resource_id, date, block_id, code) VALUES ($1,$2,$3,$4,'just_taken')", [
        teacherId, input.resourceId, input.date, input.blockIds[0],
      ]);
      const w2 = await loadWorld(db, input.date, input.date);
      return {
        ok: false,
        code: "just_taken",
        reason: "Just taken: someone booked this a moment ago.",
        canWaitlist: true,
        alternatives: alternatives(w2, req),
      };
    }
    throw e;
  }
  if (opts.runJobsNow !== false) await runJobs(db).catch(() => undefined);
  const booking = (await getBookingDetail(db, id))!;
  return { ok: true, booking, calendarChecked: world.calendarChecked };
}

class JustTaken extends Error {}

// ---------------------------------------------------------------------------
// Authorisation helpers (T16)
// ---------------------------------------------------------------------------

async function loadForChange(db: Db, actor: Actor, id: string, allow: "owner" | "incharge") {
  const b = await getBookingDetail(db, id);
  if (!b) throw new AppError(404, "not_found", "Booking not found.");
  const isOwner = b.teacherId === actor.id;
  const isIncharge = b.staffIds.includes(actor.id) || actor.role === "incharge";
  const ok = actor.role === "admin" || (allow === "owner" ? isOwner : isIncharge && actor.role !== "teacher");
  if (!ok) {
    await audit(db, { actorId: actor.id, action: "authz.denied", entity: "booking", entityId: id, after: { allow } });
    throw new AppError(403, "forbidden", "You can only change your own bookings.");
  }
  return b;
}

async function releaseSlots(db: Db, id: string) {
  await db.query("UPDATE booking_slots SET active = false WHERE booking_id = $1", [id]);
}

/** R9: free the slot, tell calendars, offer the waitlist. */
async function afterRelease(db: Db, b: BookingDetail) {
  await enqueue(db, { kind: "calendar.delete", bookingId: b.id });
  for (const blockId of b.blockIds) await offerNext(db, b.resourceId, b.date, blockId);
}

/**
 * R1.1 waitlist: offer a freed slot to the first teacher waiting. The slot is held
 * for them for settings.waitlistHoldHours; expireOffers() passes it on after that.
 */
export async function offerNext(db: Db, resourceId: string, date: string, blockId: string) {
  const active = await db.query("SELECT 1 FROM waitlist WHERE resource_id = $1 AND date = $2 AND block_id = $3 AND status = 'offered'", [resourceId, date, blockId]);
  if (active.length) return null;
  const waiting = await db.query<{ id: string; email: string; teacher_id: string; units: number }>(
    `SELECT w.id, s.email, w.teacher_id, w.units FROM waitlist w JOIN staff s ON s.id = w.teacher_id
     WHERE w.resource_id = $1 AND w.date = $2 AND w.block_id = $3 AND w.status = 'waiting' ORDER BY w.created_at LIMIT 1`,
    [resourceId, date, blockId],
  );
  if (!waiting[0]) return null;
  const t = now();
  const settings = await getSettings(db);
  // Only offer when the teacher could actually book it now.
  const world = await loadWorld(db, date, date);
  const ev = evaluate(world, { resourceId, date, blockIds: [blockId], units: waiting[0].units, now: t, teacherId: waiting[0].teacher_id });
  if (!ev.ok) return null;
  const expires = new Date(t.getTime() + settings.waitlistHoldHours * 3_600_000);
  await db.query("UPDATE waitlist SET status = 'offered', offered_at = $2, expires_at = $3 WHERE id = $1", [waiting[0].id, t.toISOString(), expires.toISOString()]);
  await audit(db, { actorId: null, action: "waitlist.offer", entity: "waitlist", entityId: waiting[0].id, after: { expires } });
  await sendWaitlistOffer(db, { to: waiting[0].email, resourceId, date, blockId, expires });
  return waiting[0].id;
}

/** Cron: expired offers lapse and the slot goes to the next teacher waiting. */
export async function expireOffers(db: Db) {
  const t = now();
  const lapsed = await db.query<{ id: string; resource_id: string; date: string; block_id: string }>(
    "UPDATE waitlist SET status = 'expired' WHERE status = 'offered' AND expires_at <= $1 RETURNING id, resource_id, date, block_id",
    [t.toISOString()],
  );
  for (const w of lapsed) await offerNext(db, w.resource_id, w.date, w.block_id);
  return lapsed.length;
}

export async function quotaUsage(db: Db, teacherId: string, date: string) {
  const { from, to } = weekRange(date);
  const r = await db.query<{ teacher: number; dept: number }>(
    `SELECT
       count(*) FILTER (WHERE b.teacher_id = $1)::int AS teacher,
       count(*) FILTER (WHERE t.department = (SELECT department FROM staff WHERE id = $1) AND t.department <> '')::int AS dept
     FROM booking_slots s JOIN bookings b ON b.id = s.booking_id JOIN staff t ON t.id = b.teacher_id
     WHERE s.active AND s.date BETWEEN $2 AND $3`,
    [teacherId, from, to],
  );
  return { teacherWeek: r[0]?.teacher ?? 0, deptWeek: r[0]?.dept ?? 0 };
}

export async function cancelBooking(db: Db, actor: Actor, id: string, opts: { undo?: boolean } = {}) {
  const b = await loadForChange(db, actor, id, "owner");
  if (b.status !== "confirmed") throw new AppError(409, "not_active", "This booking is not active.");
  const t = now();
  const settings = await getSettings(db);
  const tts = await getTimetables(db);
  const first = blockOn(tts, b.date, b.blockIds[0]);
  const isUndo = opts.undo === true && t.getTime() - b.createdAt.getTime() < 15_000;
  if (actor.role !== "admin" && !isUndo && first && !canCancel(b.date, first, t, settings))
    throw new AppError(409, "too_late", `Bookings can be cancelled up to ${settings.cancelCutoffHours} h before. Contact the lab in-charge.`);
  await db.transaction(async (tx) => {
    await tx.query("UPDATE bookings SET status = 'cancelled', status_reason = $2, updated_at = $3 WHERE id = $1", [id, isUndo ? "undo" : null, t.toISOString()]);
    await tx.query("UPDATE booking_slots SET active = false WHERE booking_id = $1", [id]);
    await audit(tx, { actorId: actor.id, action: isUndo ? "booking.undo" : "booking.cancel", entity: "booking", entityId: id, before: { status: b.status } });
  });
  if (!isUndo) await enqueue(db, { kind: "email", template: "cancelled", bookingId: id, to: "both", extra: { by: actor.name } });
  await afterRelease(db, b);
  await runJobs(db).catch(() => undefined);
  return getBookingDetail(db, id);
}

export async function declineBooking(db: Db, actor: Actor, id: string, reason: string) {
  const b = await loadForChange(db, actor, id, "incharge");
  if (b.status !== "confirmed") throw new AppError(409, "not_active", "This booking is not active.");
  await db.transaction(async (tx) => {
    await tx.query("UPDATE bookings SET status = 'declined', status_reason = $2, updated_at = $3 WHERE id = $1", [id, reason, now().toISOString()]);
    await tx.query("UPDATE booking_slots SET active = false WHERE booking_id = $1", [id]);
    await audit(tx, { actorId: actor.id, action: "booking.decline", entity: "booking", entityId: id, after: { reason } });
  });
  await enqueue(db, { kind: "email", template: "declined", bookingId: id, to: "teacher", extra: { reason } });
  await afterRelease(db, b);
  await runJobs(db).catch(() => undefined);
  return getBookingDetail(db, id);
}

/** Release 2: only active KS3 plan levels can be tagged. Returns the de-duplicated ids. */
export async function checkCurriculum(db: Db, ids: string[] | undefined): Promise<string[]> {
  const want = [...new Set(ids ?? [])];
  if (want.length === 0) return [];
  const ok = await db.query<{ id: string }>("SELECT id FROM curriculum_levels WHERE active AND id = ANY($1)", [want]);
  if (ok.length !== want.length) throw new AppError(422, "invalid", "One of the curriculum levels is no longer in the plan. Pick again.");
  return want;
}

export async function updateBooking(db: Db, actor: Actor, id: string, patch: BookingPatch) {
  const b = await loadForChange(db, actor, id, "owner");
  if (b.status !== "confirmed") throw new AppError(409, "not_active", "This booking is not active.");
  const map: Record<keyof BookingPatch, string> = {
    subject: "subject", yearGroup: "year_group", section: "section", studentCount: "student_count", classroom: "classroom",
    objective: "objective", lessonPlanUrl: "lesson_plan_url", specialRequirements: "special_requirements", curriculumIds: "curriculum_ids",
  };
  if (patch.curriculumIds) patch = { ...patch, curriculumIds: await checkCurriculum(db, patch.curriculumIds) };
  const sets: string[] = [];
  const p: unknown[] = [id];
  const changed: string[] = [];
  for (const [k, v] of Object.entries(patch) as [keyof BookingPatch, unknown][]) {
    if (v === undefined) continue;
    p.push(v === "" && k === "lessonPlanUrl" ? null : v);
    sets.push(`${map[k]} = $${p.length}`);
    changed.push(k.replace(/([A-Z])/g, " $1").toLowerCase());
  }
  if (sets.length === 0) return b;
  p.push(now().toISOString());
  await db.query(`UPDATE bookings SET ${sets.join(", ")}, updated_at = $${p.length} WHERE id = $1`, p);
  await audit(db, { actorId: actor.id, action: "booking.update", entity: "booking", entityId: id, before: b, after: patch });
  await enqueue(db, { kind: "calendar.upsert", bookingId: id });
  await enqueue(db, { kind: "email", template: "changed", bookingId: id, to: "both", extra: { what: changed.join(", ") } });
  await runJobs(db).catch(() => undefined);
  return getBookingDetail(db, id);
}

export async function setAttendance(db: Db, actor: Actor, id: string, status: "completed" | "no_show") {
  const b = await loadForChange(db, actor, id, "incharge");
  if (!["confirmed", "completed", "no_show"].includes(b.status)) throw new AppError(409, "not_active", "This booking was cancelled.");
  if (b.start.getTime() > now().getTime() + 30 * 60_000) throw new AppError(409, "too_early", "Attendance can be marked from 30 minutes before the session.");
  await db.query("UPDATE bookings SET status = $2, updated_at = $3 WHERE id = $1", [id, status, now().toISOString()]);
  await audit(db, { actorId: actor.id, action: `booking.${status}`, entity: "booking", entityId: id, before: { status: b.status } });
  return getBookingDetail(db, id);
}

export async function joinWaitlist(db: Db, actor: Actor, input: { resourceId: string; date: string; blockId: string; units?: number }) {
  if (actor.role === "viewer") throw new AppError(403, "forbidden", "Leadership viewers cannot book.");
  const existing = await db.query<{ id: string }>(
    "SELECT id FROM waitlist WHERE teacher_id = $1 AND resource_id = $2 AND date = $3 AND block_id = $4 AND status = 'waiting'",
    [actor.id, input.resourceId, input.date, input.blockId],
  );
  if (existing[0]) return { id: existing[0].id, position: await waitPosition(db, existing[0].id) };
  const id = newId("wl");
  await db.query("INSERT INTO waitlist (id, resource_id, date, block_id, teacher_id, units) VALUES ($1,$2,$3,$4,$5,$6)", [
    id, input.resourceId, input.date, input.blockId, actor.id, input.units ?? 1,
  ]);
  await db.query("INSERT INTO booking_attempts (teacher_id, resource_id, date, block_id, code) VALUES ($1,$2,$3,$4,'waitlist_join')", [
    actor.id, input.resourceId, input.date, input.blockId,
  ]);
  await audit(db, { actorId: actor.id, action: "waitlist.join", entity: "waitlist", entityId: id, after: input });
  return { id, position: await waitPosition(db, id) };
}

async function waitPosition(db: Db, id: string) {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM waitlist w, waitlist me WHERE me.id = $1 AND w.resource_id = me.resource_id AND w.date = me.date
     AND w.block_id = me.block_id AND w.status = 'waiting' AND w.created_at <= me.created_at`,
    [id],
  );
  return r[0]?.n ?? 1;
}

export { releaseSlots };
