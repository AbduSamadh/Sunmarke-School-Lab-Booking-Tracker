/** Release 2 server features: several campuses, curriculum mapping, phone app tokens. */
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@sunmarke/db";
import { seed } from "../lib/server/seed";
import { createBooking, updateBooking, type Actor } from "../lib/server/bookings";
import { getGrid } from "../lib/server/grid";
import { buildReport, reportCampus } from "../lib/server/reports";
import { makeToken, readToken } from "../lib/server/auth";

const P = (c: string) => `tt-standard-${c}`;
const TUE = "2026-12-22";
const sara: Actor = { id: "t-sara", name: "Sara Khan", email: "sara.khan@sunmarke.example", role: "teacher", department: "Science" };
const base = { section: "B", objective: "", specialRequirements: "", subject: "Science", yearGroup: "Y8", studentCount: 24 };

let db: Db;
beforeEach(async () => {
  process.env.FAKE_NOW = "2026-11-30T04:00:00.000Z";
  db = await openDb();
  await seed(db);
  // A second campus with one lab, its own in-charge, teacher and timetable.
  await db.query("INSERT INTO campuses (id, name, short_name) VALUES ('north', 'North Campus', 'North')");
  await db.query("INSERT INTO staff (id, name, email, department, role, campus_id) VALUES ('n-ic','Nadia','nadia@north.example','Labs','incharge','north'), ('n-t','Tariq','tariq@north.example','Science','teacher','north')");
  await db.query("INSERT INTO resources (id, name, type, units, campus_id) VALUES ('north-lab','Makers Lab','room',1,'north')");
  await db.query("INSERT INTO incharge_assignments VALUES ('north-lab','n-ic',1)");
  await db.query("INSERT INTO timetables (id, name, weekdays, priority, campus_id) VALUES ('tt-north','North standard','{1,2,3,4,5}',0,'north')");
  await db.query("INSERT INTO blocks (id, timetable_id, code, start_time, end_time) VALUES ('tt-north-P1','tt-north','P1','08:00','08:50'), ('tt-north-P2','tt-north','P2','08:50','09:40')");
});

const tariq: Actor = { id: "n-t", name: "Tariq", email: "tariq@north.example", role: "teacher", department: "Science", campusId: "north", homeCampusId: "north" };

describe("multi-campus", () => {
  it("teachers book their own campus's labs on its timetable", async () => {
    const r = await createBooking(db, tariq, { ...base, resourceId: "north-lab", date: TUE, blockIds: ["tt-north-P1"] });
    expect(r).toMatchObject({ ok: true, booking: { inchargeName: "Nadia", blockLabel: "P1", timeLabel: "08:00–08:50" } });
  });
  it("a teacher cannot book another campus's lab", async () => {
    await expect(createBooking(db, sara, { ...base, resourceId: "north-lab", date: TUE, blockIds: ["tt-north-P1"] })).rejects.toMatchObject({ status: 403 });
    await expect(createBooking(db, tariq, { ...base, resourceId: "quantum", date: TUE, blockIds: [P("P3")] })).rejects.toMatchObject({ status: 403 });
  });
  it("the grid shows only the current campus", async () => {
    const north = await getGrid(db, tariq, TUE, TUE);
    expect(north.resources.map((r) => r.id)).toEqual(["north-lab"]);
    expect(north.days[0].blocks.map((b) => b.id)).toEqual(["tt-north-P1", "tt-north-P2"]);
    const home = await getGrid(db, sara, TUE, TUE);
    expect(home.resources.map((r) => r.id)).not.toContain("north-lab");
    expect(home.days[0].blocks[0].id.startsWith("tt-standard")).toBe(true);
  });
  it("a whole-campus blackout closes only that campus", async () => {
    await db.query("INSERT INTO blackouts (id, resource_id, date_from, date_to, reason, campus_id) VALUES ('bo-n', NULL, $1, $1, 'holiday', 'north')", [TUE]);
    expect(await createBooking(db, tariq, { ...base, resourceId: "north-lab", date: TUE, blockIds: ["tt-north-P1"] })).toMatchObject({ ok: false, code: "blackout" });
    expect((await createBooking(db, sara, { ...base, resourceId: "quantum", date: TUE, blockIds: [P("P3")] })).ok).toBe(true);
  });
  it("reports cover one campus, or every campus for group viewers", async () => {
    await createBooking(db, tariq, { ...base, resourceId: "north-lab", date: TUE, blockIds: ["tt-north-P1"] });
    const north = await buildReport(db, { from: TUE, to: TUE, campusId: "north" });
    expect(north.utilisation.map((u) => u.id)).toEqual(["north-lab"]);
    expect(north.kpis.sessions).toBe(1);
    const group = await buildReport(db, { from: TUE, to: TUE });
    expect(group.utilisation.map((u) => u.id)).toContain("north-lab");
    expect(group.utilisation.map((u) => u.id)).toContain("quantum");
    expect(reportCampus({ ...sara, allCampuses: false }, "all")).toBe("sunmarke");
    expect(reportCampus({ ...sara, allCampuses: true }, "all")).toBeUndefined();
  });
});

describe("curriculum mapping", () => {
  it("tags a booking with plan levels and counts them in the coverage report", async () => {
    const r = await createBooking(db, sara, { ...base, resourceId: "quantum", date: TUE, blockIds: [P("P3")], curriculumIds: ["cl-pr-8", "cl-ai-8"] });
    if (!r.ok) throw new Error(r.reason);
    expect(r.booking.curriculumIds).toEqual(["cl-pr-8", "cl-ai-8"]);
    const rep = await buildReport(db, { from: TUE, to: TUE });
    expect(rep.curriculum.levels.find((l) => l.code === "PR-8")).toMatchObject({ sessions: 1, classes: 1 });
    expect(rep.curriculum.covered).toBe(2);
  });
  it("rejects unknown or retired levels", async () => {
    await expect(createBooking(db, sara, { ...base, resourceId: "quantum", date: TUE, blockIds: [P("P3")], curriculumIds: ["nope"] })).rejects.toMatchObject({ status: 422 });
    await db.query("UPDATE curriculum_levels SET active = false WHERE id = 'cl-pr-8'");
    await expect(createBooking(db, sara, { ...base, resourceId: "quantum", date: TUE, blockIds: [P("P3")], curriculumIds: ["cl-pr-8"] })).rejects.toMatchObject({ status: 422 });
  });
  it("teachers can change the tags later", async () => {
    const r = await createBooking(db, sara, { ...base, resourceId: "quantum", date: TUE, blockIds: [P("P3")] });
    if (!r.ok) throw new Error(r.reason);
    const b = await updateBooking(db, sara, r.booking.id, { curriculumIds: ["cl-dm-8"] });
    expect(b?.curriculumIds).toEqual(["cl-dm-8"]);
  });
});

describe("session tokens", () => {
  it("round-trip, reject tampering and expire", () => {
    const t = makeToken("t-sara");
    expect(readToken(t)).toBe("t-sara");
    expect(readToken(t.replace("t-sara", "abd"))).toBeNull();
    expect(readToken("t-sara.abc")).toBeNull();
    const old = makeToken("t-sara", -1);
    expect(readToken(old)).toBeNull();
  });
});

describe("phone app push", () => {
  it("registered devices get a push alongside the email; none without a device", async () => {
    const { cancelBooking } = await import("../lib/server/bookings");
    const r = await createBooking(db, sara, { ...base, resourceId: "quantum", date: TUE, blockIds: [P("P3")] });
    if (!r.ok) throw new Error(r.reason);
    const { runJobs } = await import("../lib/server/jobs");
    await runJobs(db);
    expect((await db.query("SELECT 1 FROM notifications WHERE template LIKE 'push.%'")).length).toBe(0);
    await db.query("INSERT INTO push_devices (token, staff_id, platform) VALUES ('ExponentPushToken[abc123xyz]', 't-sara', 'ios')");
    await cancelBooking(db, sara, r.booking.id);
    await runJobs(db);
    const push = await db.query<{ template: string; recipient: string }>("SELECT template, recipient FROM notifications WHERE template LIKE 'push.%'");
    expect(push).toEqual([{ template: "push.cancelled", recipient: "sara.khan@sunmarke.example" }]);
  });
});
