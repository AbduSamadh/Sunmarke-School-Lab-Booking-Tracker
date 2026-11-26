/**
 * Server-side rule tests from the plan's matrix that need the database, the
 * calendar adapter or authorisation: T8, T9, T10, T15, T16, T17.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@sunmarke/db";
import { addDays, localToInstant, DEFAULT_SETTINGS } from "@sunmarke/rules";
import { seed } from "../lib/server/seed";
import { createBooking, cancelBooking, updateBooking, type Actor } from "../lib/server/bookings";
import { signInByEmail } from "../lib/server/auth";
import { addExternalEvent } from "../lib/server/calendar";
import { makeJobsDue, runJobs } from "../lib/server/jobs";
import { syncConflicts, sendDailyDigest } from "../lib/server/scheduled";
import { buildReport } from "../lib/server/reports";

process.env.FAKE_NOW = "2026-11-30T04:00:00.000Z"; // Mon 30 Nov 08:00 Dubai
const TUE = "2026-12-08";
const P = (c: string) => `tt-standard-${c}`;
const sara: Actor = { id: "t-sara", name: "Sara Khan", email: "sara.khan@sunmarke.example", role: "teacher", department: "Science" };
const omar: Actor = { id: "t-omar", name: "Omar Haddad", email: "omar.haddad@sunmarke.example", role: "teacher", department: "Computing" };
const admin: Actor = { id: "abd", name: "Abd", email: "abd@sunmarke.example", role: "admin", department: "Labs" };
const base = { section: "B", objective: "", specialRequirements: "" };
const quantumP4 = { ...base, resourceId: "quantum", date: TUE, blockIds: [P("P4")], subject: "Science", yearGroup: "Y8", studentCount: 24 };

let db: Db;
beforeEach(async () => {
  db = await openDb();
  await seed(db);
});

describe("database-backed rules", () => {
  it("T8 two teachers submit the same slot at once: exactly one wins", async () => {
    const [a, b] = await Promise.all([createBooking(db, sara, quantumP4), createBooking(db, omar, quantumP4)]);
    const wins = [a, b].filter((r) => r.ok);
    const loss = [a, b].find((r) => !r.ok);
    expect(wins).toHaveLength(1);
    expect(loss).toMatchObject({ ok: false, code: "just_taken" });
    if (loss && !loss.ok) expect(loss.alternatives.length).toBeGreaterThan(0);
    const slots = await db.query("SELECT * FROM booking_slots WHERE active AND date = $1 AND block_id = $2 AND resource_id = 'quantum'", [TUE, P("P4")]);
    expect(slots).toHaveLength(1);
  });

  it("R7 the unique index alone rejects a second hold, even if code is bypassed", async () => {
    const r = await createBooking(db, sara, quantumP4);
    expect(r.ok).toBe(true);
    await expect(
      db.query("INSERT INTO booking_slots (booking_id, incharge_id, resource_id, room_key, date, block_id) SELECT id, 'abdul', 'quantum', 'quantum', date, $2 FROM bookings WHERE id = $1", [
        r.ok ? r.booking.id : "",
        P("P4"),
      ]),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("T9 cancel frees the slot, deletes calendar events, offers the waitlist, sends emails", async () => {
    const r = await createBooking(db, sara, quantumP4);
    if (!r.ok) throw new Error(r.reason);
    const ev = await db.query("SELECT * FROM calendar_events WHERE active AND booking_id = $1", [r.booking.id]);
    expect(ev.length).toBe(2); // in-charge event + teacher invite
    await db.query("INSERT INTO waitlist (id, resource_id, date, block_id, teacher_id) VALUES ('wl1','quantum',$1,$2,'t-omar')", [TUE, P("P4")]);
    await cancelBooking(db, sara, r.booking.id);
    const free = await createBooking(db, omar, quantumP4, { runJobsNow: false });
    expect(free.ok).toBe(true);
    const evAfter = await db.query("SELECT * FROM calendar_events WHERE active AND booking_id = $1", [r.booking.id]);
    expect(evAfter).toHaveLength(0);
    const mails = await db.query<{ template: string; recipient: string }>("SELECT template, recipient FROM notifications WHERE booking_id = $1", [r.booking.id]);
    expect(mails.map((m) => m.template)).toEqual(expect.arrayContaining(["confirmed", "cancelled"]));
    const offer = await db.query<{ recipient: string }>("SELECT recipient FROM notifications WHERE template = 'waitlist_offer'");
    expect(offer[0]?.recipient).toBe("omar.haddad@sunmarke.example");
  });

  it("T10 an outside meeting added after booking is flagged, booking unchanged", async () => {
    const r = await createBooking(db, sara, quantumP4);
    if (!r.ok) throw new Error(r.reason);
    await addExternalEvent(db, r.booking.inchargeId, localToInstant(TUE, "11:00", DEFAULT_SETTINGS), localToInstant(TUE, "11:30", DEFAULT_SETTINGS), "Parent meeting");
    const s = await syncConflicts(db);
    expect(s.newConflicts).toBe(1);
    expect((await syncConflicts(db)).newConflicts).toBe(0); // flagged once
    const b = await db.query<{ status: string }>("SELECT status FROM bookings WHERE id = $1", [r.booking.id]);
    expect(b[0].status).toBe("confirmed");
    const alerts = await db.query("SELECT * FROM notifications WHERE template = 'admin_alert'");
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("T15 someone not on the staff list is refused", async () => {
    const r = await signInByEmail(db, "stranger@gmail.com");
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.message).toContain("lab admin");
    expect((await signInByEmail(db, "SARA.KHAN@sunmarke.example")).ok).toBe(true);
  });

  it("T16 a teacher cannot cancel or edit another teacher's booking", async () => {
    const r = await createBooking(db, sara, quantumP4);
    if (!r.ok) throw new Error(r.reason);
    await expect(cancelBooking(db, omar, r.booking.id)).rejects.toMatchObject({ status: 403 });
    await expect(updateBooking(db, omar, r.booking.id, { subject: "Hacked" })).rejects.toMatchObject({ status: 403 });
    const log = await db.query("SELECT * FROM audit_log WHERE action = 'authz.denied'");
    expect(log).toHaveLength(2);
  });

  it("T17 calendar down: booking stored, write retried, admin alerted after 3 failures", async () => {
    await db.query("UPDATE settings SET value = 'true' WHERE key = 'mock_calendar_down'");
    const r = await createBooking(db, sara, quantumP4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calendarChecked).toBe(false);
    for (let i = 0; i < 2; i++) {
      await makeJobsDue(db);
      await runJobs(db);
    }
    const job = await db.query<{ attempts: number; status: string; alerted: boolean }>("SELECT attempts, status, alerted FROM jobs WHERE kind = 'calendar.upsert' AND payload->>'bookingId' = $1", [r.booking.id]);
    expect(job[0]).toMatchObject({ attempts: 3, status: "pending", alerted: true });
    expect(await db.query("SELECT * FROM notifications WHERE template = 'admin_alert'")).not.toHaveLength(0);
    await db.query("UPDATE settings SET value = 'false' WHERE key = 'mock_calendar_down'");
    await makeJobsDue(db);
    await runJobs(db);
    expect(await db.query("SELECT * FROM calendar_events WHERE active AND booking_id = $1", [r.booking.id])).toHaveLength(2);
  });

  it("cart booking requires a classroom and records cart count", async () => {
    await expect(createBooking(db, sara, { ...quantumP4, resourceId: "carts", cartCount: 2 })).rejects.toMatchObject({ status: 422 });
    const r = await createBooking(db, sara, { ...quantumP4, resourceId: "carts", cartCount: 2, classroom: "Room 2.14" });
    expect(r).toMatchObject({ ok: true, booking: { cartCount: 2, classroom: "Room 2.14", inchargeName: "Ram", supportNames: ["Nael"] } });
  });

  it("hybrid labs: timetabled ICT lessons block their periods; Nael comes after Ram for Quantum (abd, 25 Nov)", async () => {
    // TUE is a Tuesday: the sample ICT timetable has Strike at P1, P2 and P6.
    expect(await createBooking(db, omar, { ...quantumP4, resourceId: "strike", blockIds: [P("P2")] })).toMatchObject({ ok: false, code: "timetabled", reason: expect.stringMatching(/^Timetabled: ICT Y\d+ [A-D]$/) });
    const ok = await createBooking(db, omar, { ...quantumP4, resourceId: "strike", blockIds: [P("P5")], subject: "Computing" });
    expect(ok).toMatchObject({ ok: true, booking: { inchargeName: "Abdul" } });
    const order = await db.query<{ staff_id: string }>("SELECT staff_id FROM incharge_assignments WHERE resource_id = 'quantum' ORDER BY priority");
    expect(order.map((o) => o.staff_id)).toEqual(["ram", "nael", "abdul"]);
    const leaders = await db.query<{ id: string }>("SELECT id FROM staff WHERE role = 'viewer' ORDER BY id");
    expect(leaders.map((l) => l.id)).toEqual(["bod", "neil", "principal", "sreejit"]);
  });

  it("three carts take all three in-charges, so no lab can be booked that period (abd, 25 Nov)", async () => {
    const r = await createBooking(db, sara, { ...quantumP4, resourceId: "carts", cartCount: 3, classroom: "Room 2.14" });
    if (!r.ok) throw new Error(r.reason);
    expect(r.booking.staffIds).toEqual(["ram", "nael", "abdul"]);
    const slots = await db.query("SELECT incharge_id FROM booking_slots WHERE booking_id = $1 AND active", [r.booking.id]);
    expect(slots).toHaveLength(3);
    for (const lab of ["quantum", "dollarx", "xreal", "strike"])
      expect(await createBooking(db, omar, { ...quantumP4, resourceId: lab })).toMatchObject({ ok: false, code: "no_incharge" });
    expect(await createBooking(db, omar, { ...quantumP4, resourceId: "carts", cartCount: 4, classroom: "R1" })).toMatchObject({ ok: false, code: "invalid_units" });
    // Everyone going is told.
    const msgs = await db.query<{ recipient: string; channel: string }>("SELECT recipient, channel FROM notifications WHERE booking_id = $1 AND template = 'confirmed'", [r.booking.id]);
    expect(msgs.map((m) => m.recipient).sort()).toEqual(["abdul@sunmarke.example", "nael@sunmarke.example", "ram@sunmarke.example", "sara.khan@sunmarke.example"]);
    expect(msgs.every((m) => m.channel === "teams")).toBe(true);
  });

  it("one period per booking, and \"Other\" needs the subject written in", async () => {
    const { BookingInput } = await import("../lib/shared/schemas");
    expect(BookingInput.safeParse({ ...quantumP4, blockIds: [P("P4"), P("P5")] }).success).toBe(false);
    expect(BookingInput.safeParse({ ...quantumP4, subject: "Other" }).success).toBe(false);
    expect(BookingInput.safeParse({ ...quantumP4, subject: "Robotics club" }).success).toBe(true);
  });

  it("window: teachers cannot override, admin can", async () => {
    // P5: at P7 today all three in-charges are out with the seeded 3-cart booking.
    const soon = { ...quantumP4, date: "2026-11-30", blockIds: [P("P5")], overrideWindow: true };
    expect(await createBooking(db, sara, soon)).toMatchObject({ ok: false, code: "window_too_soon" });
    expect(await createBooking(db, admin, soon)).toMatchObject({ ok: true });
  });

  it("daily digest goes to each in-charge once per day", async () => {
    const n = await sendDailyDigest(db, "2026-12-08");
    expect(n).toBe(3); // Ram, Abdul and Nael
    expect(await sendDailyDigest(db, "2026-12-08")).toBe(0);
  });

  it("report utilisation uses bookable blocks only", async () => {
    const rep = await buildReport(db, { from: addDays("2026-11-30", -21), to: "2026-11-29" });
    expect(rep.kpis.sessions).toBeGreaterThan(10);
    for (const u of rep.utilisation) expect(u.pct).toBeLessThanOrEqual(1);
  });
});
