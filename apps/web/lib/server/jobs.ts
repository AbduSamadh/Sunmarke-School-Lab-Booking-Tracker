import type { Db, Tx } from "@sunmarke/db";
import { getCalendar } from "./calendar";
import { sendBookingEmail, sendAdminAlert, type EmailTemplate } from "./notify";
import { getBookingDetail } from "./bookings";
import { newId, now } from "./util";

/**
 * Postgres-backed job queue. Calendar writes and emails run here so a slow or
 * failing provider never blocks or undoes a booking (T17). Each job is keyed for
 * idempotency, retried with backoff, and admin is alerted after 3 failures.
 */
export type JobPayload =
  | { kind: "calendar.upsert"; bookingId: string }
  | { kind: "calendar.delete"; bookingId: string }
  | { kind: "email"; template: EmailTemplate; bookingId: string; to: "teacher" | "incharge" | "both"; extra?: Record<string, string> };

const BACKOFF_MIN = [1, 5, 15, 60, 240];
const ALERT_AFTER = 3;
const GIVE_UP_AFTER = 6;

export async function enqueue(q: Db | Tx, job: JobPayload, key?: string) {
  await q.query(
    "INSERT INTO jobs (id, kind, payload, idempotency_key, run_after) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (idempotency_key) DO NOTHING",
    [newId("job"), job.kind, JSON.stringify(job), key ?? null, now().toISOString()],
  );
}

async function execute(db: Db, job: JobPayload) {
  const cal = getCalendar(db);
  if (job.kind === "calendar.delete") return cal.deleteBookingEvents(job.bookingId);
  const b = await getBookingDetail(db, job.bookingId);
  if (!b) return;
  if (job.kind === "calendar.upsert") {
    if (b.status !== "confirmed") return;
    const title = `${b.resourceName} · ${b.teacherName} · ${b.classLabel}`;
    await cal.upsertBookingEvent({ bookingId: b.id, staffId: b.inchargeId, start: b.start, end: b.end, title });
    // Teacher invite: with Google/Microsoft the teacher is an attendee on the same event.
    await cal.upsertBookingEvent({ bookingId: b.id, staffId: b.teacherId, start: b.start, end: b.end, title: `${b.resourceName} · ${b.classLabel}` });
    return;
  }
  if (job.kind === "email") return sendBookingEmail(db, job.template, b, job.to, job.extra);
}

export async function runJobs(db: Db, limit = 50): Promise<{ done: number; failed: number }> {
  const t = now();
  const pending = await db.query<{ id: string; payload: JobPayload; attempts: number; alerted: boolean }>(
    "SELECT id, payload, attempts, alerted FROM jobs WHERE status = 'pending' AND run_after <= $1 ORDER BY created_at LIMIT $2",
    [t.toISOString(), limit],
  );
  let done = 0;
  let failed = 0;
  for (const j of pending) {
    try {
      await execute(db, j.payload);
      await db.query("UPDATE jobs SET status = 'done', attempts = attempts + 1, updated_at = now(), last_error = NULL WHERE id = $1", [j.id]);
      done++;
    } catch (e) {
      failed++;
      const attempts = j.attempts + 1;
      const msg = e instanceof Error ? e.message : String(e);
      const next = new Date(t.getTime() + (BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] ?? 60) * 60_000);
      await db.query(
        "UPDATE jobs SET attempts = $2, last_error = $3, run_after = $4, status = $5, updated_at = now() WHERE id = $1",
        [j.id, attempts, msg, next.toISOString(), attempts >= GIVE_UP_AFTER ? "failed" : "pending"],
      );
      if (attempts >= ALERT_AFTER && !j.alerted) {
        await db.query("UPDATE jobs SET alerted = true WHERE id = $1", [j.id]);
        await sendAdminAlert(db, `${j.payload.kind} failed ${attempts} times`, [
          ["Job", j.payload.kind],
          ["Booking", "bookingId" in j.payload ? j.payload.bookingId : "-"],
          ["Last error", msg],
        ]);
      }
    }
  }
  return { done, failed };
}

/** Admin/test helper: make every pending job due now. */
export async function makeJobsDue(db: Db) {
  await db.query("UPDATE jobs SET run_after = $1 WHERE status = 'pending'", [new Date(now().getTime() - 1000).toISOString()]);
}
