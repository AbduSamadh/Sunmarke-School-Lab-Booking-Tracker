/** Release 1.1 server features against a real (in-memory) database. */
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@sunmarke/db";
import { seed } from "../lib/server/seed";
import { cancelBooking, createBooking, expireOffers, joinWaitlist, type Actor } from "../lib/server/bookings";
import { addAbsence, checkIn, ensureCheckinCodes, markNoShows, planSeries, reassignBooking, reportIssue, resolveIssue, sendFeedbackRequests, submitFeedback, cancelSeries } from "../lib/server/release11";
import { sendWeeklyReport } from "../lib/server/scheduled";

const P = (c: string) => `tt-standard-${c}`;
const TUE = "2026-12-22"; // a week with no seed data
const sara: Actor = { id: "t-sara", name: "Sara Khan", email: "sara.khan@sunmarke.example", role: "teacher", department: "Science" };
const omar: Actor = { id: "t-omar", name: "Omar Haddad", email: "omar.haddad@sunmarke.example", role: "teacher", department: "Computing" };
const lucy: Actor = { id: "t-lucy", name: "Lucy Evans", email: "lucy.evans@sunmarke.example", role: "teacher", department: "Maths" };
const admin: Actor = { id: "abd", name: "Abd", email: "abd@sunmarke.example", role: "admin", department: "Labs" };
const ram: Actor = { id: "ram", name: "Ram", email: "ram@sunmarke.example", role: "incharge", department: "Labs" };
const base = { section: "B", objective: "", specialRequirements: "", subject: "Science", yearGroup: "Y8", studentCount: 24 };
const q = (block = "P4", date = TUE, resourceId = "quantum") => ({ ...base, resourceId, date, blockIds: [P(block)] });

let db: Db;
const at = (iso: string) => (process.env.FAKE_NOW = iso);
beforeEach(async () => {
  at("2026-11-30T04:00:00.000Z"); // Mon 30 Nov 08:00 Dubai
  db = await openDb();
  await seed(db);
});

describe("waitlist hold", () => {
  it("a freed slot is held for the first waiting teacher, then passed on when the hold lapses", async () => {
    const r = await createBooking(db, sara, q());
    if (!r.ok) throw new Error(r.reason);
    await joinWaitlist(db, omar, { resourceId: "quantum", date: TUE, blockId: P("P4") });
    await joinWaitlist(db, lucy, { resourceId: "quantum", date: TUE, blockId: P("P4") });
    await cancelBooking(db, sara, r.booking.id);
    expect(await createBooking(db, lucy, q())).toMatchObject({ ok: false, code: "held_for_waitlist" });
    const mail = await db.query<{ recipient: string; subject: string }>("SELECT recipient, subject FROM notifications WHERE template = 'waitlist_offer'");
    expect(mail[0].recipient).toBe("omar.haddad@sunmarke.example");
    at("2026-11-30T06:01:00.000Z"); // 2 h later
    expect(await expireOffers(db)).toBe(1);
    expect(await createBooking(db, omar, q())).toMatchObject({ ok: false, code: "held_for_waitlist" });
    expect(await createBooking(db, lucy, q())).toMatchObject({ ok: true });
  });
});

describe("fair-use quota", () => {
  it("blocks a teacher over the weekly limit; admin override ignores it", async () => {
    await db.query("UPDATE settings SET value = value || '{\"quotaPerTeacherWeek\": 2}'::jsonb WHERE key = 'rules'");
    expect((await createBooking(db, sara, q("P4"))).ok).toBe(true);
    expect((await createBooking(db, sara, q("P5"))).ok).toBe(true);
    expect(await createBooking(db, sara, q("P6"))).toMatchObject({ ok: false, code: "quota_reached" });
    expect(await createBooking(db, admin, { ...q("P6"), overrideWindow: true, onBehalfOf: "t-sara" })).toMatchObject({ ok: true, booking: { teacherId: "t-sara" } });
  });
});

describe("admin", () => {
  it("books on behalf of a teacher; teachers cannot", async () => {
    expect(await createBooking(db, admin, { ...q(), onBehalfOf: "t-omar" })).toMatchObject({ ok: true, booking: { teacherName: "Omar Haddad" } });
    await expect(createBooking(db, sara, { ...q("P5"), onBehalfOf: "t-omar" })).rejects.toMatchObject({ status: 403 });
  });
  it("reassigns to the other in-charge and emails both", async () => {
    const r = await createBooking(db, sara, q());
    if (!r.ok) throw new Error(r.reason);
    const after = await reassignBooking(db, admin, r.booking.id, "abdul", "Ram at training");
    expect(after).toMatchObject({ inchargeId: "abdul", crossCover: true });
    const slot = await db.query<{ incharge_id: string }>("SELECT incharge_id FROM booking_slots WHERE booking_id = $1 AND active", [r.booking.id]);
    expect(slot[0].incharge_id).toBe("abdul");
    await expect(reassignBooking(db, sara, r.booking.id, "ram", "")).rejects.toMatchObject({ status: 403 });
  });
});

describe("leave and cover", () => {
  it("affected bookings move to the free in-charge; the rest are flagged", async () => {
    const a = await createBooking(db, sara, q("P4"));
    const b = await createBooking(db, omar, q("P4", TUE, "strike")); // Abdul busy at P4
    const c = await createBooking(db, lucy, q("P5"));
    if (!a.ok || !b.ok || !c.ok) throw new Error("setup");
    // Nael (the third in-charge) is away too, so only Abdul can cover, and only when free.
    await db.query("INSERT INTO absences (id, staff_id, date_from, date_to, reason) VALUES ('abs-nael','nael',$1,$1,'Course')", [TUE]);
    const res = await addAbsence(db, ram, { staffId: "ram", dateFrom: TUE, dateTo: TUE, blockCodes: null, reason: "Training" });
    expect(res).toMatchObject({ reassigned: 1, uncovered: 1 });
    const rows = await db.query<{ id: string; incharge_id: string }>("SELECT id, incharge_id FROM bookings WHERE id = ANY($1)", [[a.booking.id, c.booking.id]]);
    expect(rows.find((x) => x.id === c.booking.id)?.incharge_id).toBe("abdul");
    expect(rows.find((x) => x.id === a.booking.id)?.incharge_id).toBe("ram");
    expect(await db.query("SELECT 1 FROM notifications WHERE template = 'no_cover'")).toHaveLength(1);
    // New bookings skip Ram for the day
    expect(await createBooking(db, sara, q("P6"))).toMatchObject({ ok: true, booking: { inchargeId: "abdul" } });
  });
});

describe("recurring series", () => {
  it("previews clashes, books the free dates, and cancels the rest of the series", async () => {
    expect((await createBooking(db, admin, { ...q("P3", "2026-12-29"), overrideWindow: true, onBehalfOf: "t-omar" })).ok).toBe(true);
    const input = { ...base, resourceId: "quantum", startDate: TUE, endDate: "2027-01-19", everyWeeks: 1, blockCodes: ["P3"] };
    const pre = await planSeries(db, sara, { ...input, preview: true });
    expect(pre.lines.map((l) => l.ok)).toEqual([true, false, true, true, true]);
    expect(pre.lines[1].reason).toContain("already booked");
    const made = await planSeries(db, sara, { ...input, preview: false });
    expect(made.lines.filter((l) => l.ok)).toHaveLength(4); // 5 weeks ahead is fine for a series
    const c = await cancelSeries(db, sara, made.recurrenceId!);
    expect(c.cancelled).toBe(4);
  });
});

describe("QR check-in and auto no-show", () => {
  it("checks in from 15 min before; unchecked lab sessions become no-shows after 10 min", async () => {
    const a = await createBooking(db, sara, q("P3"));
    const b = await createBooking(db, omar, q("P3", TUE, "strike"));
    if (!a.ok || !b.ok) throw new Error("setup");
    await ensureCheckinCodes(db);
    const code = (await db.query<{ checkin_code: string }>("SELECT checkin_code FROM resources WHERE id = 'quantum'"))[0].checkin_code;
    at("2026-12-22T05:30:00.000Z"); // 09:30, too early
    expect(await checkIn(db, sara, code)).toMatchObject({ ok: false });
    at("2026-12-22T05:45:00.000Z"); // 09:45
    expect(await checkIn(db, sara, code)).toMatchObject({ ok: true, booking: { status: "completed" } });
    at("2026-12-22T06:06:00.000Z"); // 10:06, 11 min after P3 start
    expect(await markNoShows(db)).toBe(1);
    const s = await db.query<{ id: string; status: string }>("SELECT id, status FROM bookings WHERE id = ANY($1)", [[a.booking.id, b.booking.id]]);
    expect(s.find((x) => x.id === b.booking.id)?.status).toBe("no_show");
    expect(s.find((x) => x.id === a.booking.id)?.status).toBe("completed");
  });
});

describe("feedback and equipment", () => {
  it("asks once after the session, records rating and an equipment issue", async () => {
    const a = await createBooking(db, sara, q("P3"));
    if (!a.ok) throw new Error("setup");
    at("2026-12-22T07:00:00.000Z"); // 11:00, after P3
    expect(await sendFeedbackRequests(db)).toBe(1);
    expect(await sendFeedbackRequests(db)).toBe(0);
    await expect(submitFeedback(db, omar, a.booking.id, { rating: 5, comment: "" })).rejects.toMatchObject({ status: 403 });
    const r = await submitFeedback(db, sara, a.booking.id, { rating: 4, comment: "Good", issue: "Projector flickers", item: "Projector" });
    expect(r.issueId).toBeTruthy();
    const issues = await db.query("SELECT * FROM equipment_issues WHERE status = 'open' AND booking_id = $1", [a.booking.id]);
    expect(issues).toHaveLength(1);
  });
  it("an issue can block the lab until it is resolved", async () => {
    const { id } = await reportIssue(db, ram, { resourceId: "xreal", item: "Headset 3", title: "Cracked lens", detail: "", severity: "high", blockFrom: TUE });
    expect(await createBooking(db, sara, q("P4", TUE, "xreal"))).toMatchObject({ ok: false, code: "blackout" });
    await resolveIssue(db, ram, id, "Replaced");
    expect((await createBooking(db, sara, q("P4", TUE, "xreal"))).ok).toBe(true);
    expect(await db.query("SELECT 1 FROM notifications WHERE template = 'admin_alert'")).not.toHaveLength(0);
  });
});

describe("weekly report", () => {
  it("emails admin and leadership once per week", async () => {
    expect(await sendWeeklyReport(db)).toBe(5); // Abd, Dr. Neil, Dr. Sreejit, the Principal and the BOD
    expect(await sendWeeklyReport(db)).toBe(0);
  });
});
