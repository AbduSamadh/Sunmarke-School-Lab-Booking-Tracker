import type { Db } from "@sunmarke/db";
import { addDays, findConflicts, localDate, timetableForDate, blockOn } from "@sunmarke/rules";
import { expireOffers, getBookingDetail, listBookings } from "./bookings";
import { markNoShows, sendFeedbackRequests } from "./release11";
import { buildReport } from "./reports";
import { enqueue, runJobs } from "./jobs";
import { getEmailSender, renderEmail } from "./email";
import { sendAdminAlert } from "./notify";
import { getSettings, loadWorld } from "./world";
import { now } from "./util";
import { fmtDateLong } from "../shared/format";

/**
 * Scheduled work. In production a cron (host scheduler or Inngest) calls
 * POST /api/v1/cron every 15 minutes; the admin page has a "Run now" button.
 */

/** 24 h reminder to the teacher, once per booking. */
export async function sendReminders(db: Db) {
  const t = now();
  const settings = await getSettings(db);
  const today = localDate(t, settings);
  const list = await listBookings(db, { from: today, to: addDays(today, 2), status: ["confirmed"] });
  const due = list.filter((b) => {
    const ms = b.start.getTime() - t.getTime();
    return ms > 0 && ms <= 24 * 3_600_000;
  });
  let n = 0;
  for (const b of due) {
    const r = await db.query("UPDATE bookings SET reminder_sent_at = $2 WHERE id = $1 AND reminder_sent_at IS NULL RETURNING id", [b.id, t.toISOString()]);
    if (r.length) {
      await enqueue(db, { kind: "email", template: "reminder", bookingId: b.id, to: "teacher" }, `reminder:${b.id}`);
      n++;
    }
  }
  await runJobs(db);
  return n;
}

/** 07:00 digest to each in-charge with today's sessions. Idempotent per day. */
export async function sendDailyDigest(db: Db, date?: string) {
  const settings = await getSettings(db);
  const day = date ?? localDate(now(), settings);
  const incharges = await db.query<{ id: string; name: string; email: string }>(
    "SELECT DISTINCT s.id, s.name, s.email FROM staff s JOIN incharge_assignments a ON a.staff_id = s.id WHERE s.active",
  );
  const sessions = await listBookings(db, { from: day, to: day, status: ["confirmed"] });
  let sent = 0;
  for (const ic of incharges) {
    const mine = sessions.filter((b) => b.staffIds.includes(ic.id));
    const already = await db.query("SELECT 1 FROM notifications WHERE template = 'digest' AND recipient = $1 AND subject LIKE $2", [ic.email, `%${fmtDateLong(day)}%`]);
    if (already.length) continue;
    const rows: [string, string][] = mine.length
      ? mine.map((b) => [
          `${b.blockLabel} ${b.timeLabel}`,
          `${b.resourceName} · ${b.classLabel} · ${b.teacherName}${b.cartCount ? ` · ${b.cartCount} carts to ${b.classroom}` : ""}${b.specialRequirements ? ` · Note: ${b.specialRequirements}` : ""}`,
        ])
      : [["Sessions", "None today"]];
    const subject = `Your lab sessions, ${fmtDateLong(day)} (${mine.length})`;
    const { html, text } = renderEmail({ heading: subject, rows, action: { label: "Open today", url: `${process.env.APP_URL ?? "http://localhost:3000"}/incharge` } });
    await getEmailSender(db).send({ template: "digest", to: ic.email, subject, html, text });
    sent++;
  }
  return sent;
}

/** R10: flag new outside-calendar clashes to admin and the in-charge; never cancel. */
export async function syncConflicts(db: Db) {
  const settings = await getSettings(db);
  const today = localDate(now(), settings);
  const world = await loadWorld(db, today, addDays(today, settings.maxLeadDays + 7));
  if (!world.calendarChecked) return { checked: false, newConflicts: 0 };
  const conflicts = findConflicts(world);
  let fresh = 0;
  for (const c of conflicts) {
    const key = `${c.bookingId}:${c.eventStart.toISOString()}:${c.eventTitle}`;
    const r = await db.query("INSERT INTO conflict_flags (key, booking_id, detail) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING key", [key, c.bookingId, c.eventTitle]);
    if (!r.length) continue;
    fresh++;
    const staff = world.staffRows.find((s) => s.id === c.inchargeId);
    const block = blockOn(world.timetables, c.date, c.blockId);
    const bk = await getBookingDetail(db, c.bookingId);
    await sendAdminAlert(
      db,
      `Calendar clash for ${staff?.name ?? "in-charge"} on ${fmtDateLong(c.date)} ${block?.code ?? ""}`,
      [
        ["Clashing event", c.eventTitle],
        ["Booking", bk ? `${bk.resourceName} · ${bk.teacherName} · ${bk.classLabel}` : c.bookingId],
        ["What to do", "Reassign the booking or ask the in-charge to move the meeting. The booking has not been changed."],
      ],
      staff ? [staff.email] : [],
    );
  }
  return { checked: true, newConflicts: fresh };
}

export async function currentConflicts(db: Db) {
  const settings = await getSettings(db);
  const today = localDate(now(), settings);
  const world = await loadWorld(db, today, addDays(today, settings.maxLeadDays + 7));
  return { conflicts: findConflicts(world), world };
}

/** Sunday evening: last week's lab use to admin and leadership. Idempotent per week. */
export async function sendWeeklyReport(db: Db) {
  const settings = await getSettings(db);
  const today = localDate(now(), settings);
  const to = addDays(today, -1);
  const from = addDays(today, -7);
  const subject = `Lab use, ${fmtDateLong(from)} to ${fmtDateLong(to)}`;
  const already = await db.query("SELECT 1 FROM notifications WHERE template = 'weekly' AND subject = $1", [subject]);
  if (already.length) return 0;
  const rep = await buildReport(db, { from, to });
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const rows: [string, string][] = [
    ["Sessions", String(rep.kpis.sessions)],
    ["Lab utilisation", pct(rep.kpis.roomUtilisation)],
    ["Cart utilisation", pct(rep.kpis.cartUtilisation)],
    ["Requests turned away", `${rep.kpis.turnedAway} (no in-charge free: ${rep.turnedAway.noIncharge})`],
    ["Teachers booking", String(rep.kpis.teachers)],
    ["No-show rate", pct(rep.kpis.noShowRate)],
    ...(rep.feedback.count ? ([["Session rating", `${rep.feedback.avg.toFixed(1)} / 5 from ${rep.feedback.count} ratings`]] as [string, string][]) : []),
    ...rep.utilisation.map((u) => [u.name, `${u.sessions} sessions, ${pct(u.pct)}`] as [string, string]),
  ];
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const { html, text } = renderEmail({ heading: subject, rows, action: { label: "Open the full report", url: `${appUrl}/reports?from=${from}&to=${to}` } });
  const recipients = await db.query<{ email: string }>("SELECT email FROM staff WHERE active AND role IN ('admin','viewer')");
  for (const r of recipients) await getEmailSender(db).send({ template: "weekly", to: r.email, subject, html, text });
  return recipients.length;
}

export async function runCron(db: Db, tasks: string[] = ["jobs", "reminders", "conflicts", "offers", "noshow", "feedback"]) {
  const out: Record<string, unknown> = {};
  if (tasks.includes("offers")) out.offers = await expireOffers(db);
  if (tasks.includes("noshow")) out.noShows = await markNoShows(db);
  if (tasks.includes("feedback")) out.feedback = await sendFeedbackRequests(db);
  if (tasks.includes("weekly")) out.weekly = await sendWeeklyReport(db);
  if (tasks.includes("jobs")) out.jobs = await runJobs(db);
  if (tasks.includes("reminders")) out.reminders = await sendReminders(db);
  if (tasks.includes("digest")) out.digest = await sendDailyDigest(db);
  if (tasks.includes("conflicts")) out.conflicts = await syncConflicts(db);
  return out;
}
