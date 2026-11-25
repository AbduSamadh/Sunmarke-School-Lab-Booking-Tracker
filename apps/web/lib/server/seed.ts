import type { Db } from "@sunmarke/db";
import { addDays, evaluate, localDate, localToInstant, mondayOf, standardTimetable, DEFAULT_SETTINGS, isoWeekday } from "@sunmarke/rules";
import { loadWorld } from "./world";
import { createBooking, type Actor } from "./bookings";
import { addExternalEvent } from "./calendar";
import { newId, now } from "./util";

/**
 * Demo data. Names other than the plan's (Ram, Abdul, Abd, Dr. Neil) are
 * made up, and every email uses the placeholder domain sunmarke.example until
 * abd provides the real staff CSV (D8).
 */
const STAFF = [
  ["abd", "Abd", "abd@sunmarke.example", "Labs", "admin"],
  ["ram", "Ram", "ram@sunmarke.example", "Labs", "incharge"],
  ["abdul", "Abdul", "abdul@sunmarke.example", "Labs", "incharge"],
  ["neil", "Dr. Neil", "neil@sunmarke.example", "Leadership", "viewer"],
  ["t-sara", "Sara Khan", "sara.khan@sunmarke.example", "Science", "teacher"],
  ["t-omar", "Omar Haddad", "omar.haddad@sunmarke.example", "Computing", "teacher"],
  ["t-priya", "Priya Nair", "priya.nair@sunmarke.example", "Primary", "teacher"],
  ["t-lucy", "Lucy Evans", "lucy.evans@sunmarke.example", "Maths", "teacher"],
  ["t-james", "James Carter", "james.carter@sunmarke.example", "Design Technology", "teacher"],
  ["t-mariam", "Mariam Saeed", "mariam.saeed@sunmarke.example", "Humanities", "teacher"],
] as const;

const RESOURCES = [
  ["quantum", "Quantum Lab", "room", 1, "Senior block", 28, "quantum", 1],
  ["carts", "AI Carts", "cart_pool", 10, "Teacher's classroom", null, "carts", 2],
  ["dollarx", "DollarX Lab", "room", 1, "Senior block", 28, "dollarx", 3],
  ["xreal", "XReal Lab", "room", 1, "Senior block", 24, "xreal", 4],
  ["strike", "Strike Lab", "room", 1, "Senior block", 28, "strike", 5],
] as const;

const SUBJECTS = ["Science", "Physics", "Chemistry", "Biology", "Computing", "Maths", "English", "Design & Technology", "Art", "Music", "Geography", "History", "Arabic", "Islamic Studies", "French", "Business", "PE"];
const YEARS = ["FS1", "FS2", ...Array.from({ length: 13 }, (_, i) => `Y${i + 1}`)];
const SECTIONS = ["A", "B", "C", "D", "E", "F"];

export async function seed(db: Db) {
  for (const s of STAFF)
    await db.query("INSERT INTO staff (id, name, email, department, role) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [...s]);
  for (const r of RESOURCES)
    await db.query("INSERT INTO resources (id, name, type, units, location, capacity, colour, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING", [...r]);
  for (const [res, primary, fallback] of [
    ["quantum", "ram", "abdul"], ["carts", "ram", "abdul"], ["dollarx", "abdul", "ram"], ["xreal", "abdul", "ram"], ["strike", "abdul", "ram"],
  ]) {
    await db.query("INSERT INTO incharge_assignments VALUES ($1,$2,1),($1,$3,2) ON CONFLICT DO NOTHING", [res, primary, fallback]);
  }
  const tt = standardTimetable();
  await db.query("INSERT INTO timetables (id, name, valid_from, valid_to, weekdays, priority) VALUES ($1,$2,NULL,NULL,$3,0) ON CONFLICT DO NOTHING", [tt.id, tt.name, tt.weekdays]);
  for (const b of tt.blocks)
    await db.query("INSERT INTO blocks (id, timetable_id, code, start_time, end_time, bookable) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", [b.id, tt.id, b.code, b.start, b.end, b.bookable]);
  await db.query("INSERT INTO settings VALUES ('rules', $1) ON CONFLICT DO NOTHING", [JSON.stringify(DEFAULT_SETTINGS)]);
  await db.query("INSERT INTO settings VALUES ('mock_calendar_down', 'false') ON CONFLICT DO NOTHING");
  for (const [kind, list] of [["subject", SUBJECTS], ["year_group", YEARS], ["section", SECTIONS]] as const)
    for (const [i, v] of list.entries()) await db.query("INSERT INTO lookups VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [kind, v, i]);

  await seedHistory(db);
  await seedUpcoming(db);
  await db.query("INSERT INTO meta VALUES ('seeded', $1) ON CONFLICT DO NOTHING", [new Date().toISOString()]);
}

const admin: Actor = { id: "abd", name: "Abd", email: "abd@sunmarke.example", role: "admin", department: "Labs" };
const P = (code: string) => `tt-standard-${code}`;

async function seedUpcoming(db: Db) {
  const today = localDate(now(), DEFAULT_SETTINGS);
  const mon = addDays(mondayOf(today), 7);
  const base = { section: "", objective: "", specialRequirements: "", overrideWindow: true };
  const plan: [string, string, string, string, Partial<Parameters<typeof createBooking>[2]>][] = [
    [addDays(mon, 1), "P3", "quantum", "t-sara", { subject: "Science", yearGroup: "Y8", section: "B", studentCount: 24, objective: "Build and test a simple circuit" }],
    [addDays(mon, 1), "P3", "carts", "t-priya", { subject: "Computing", yearGroup: "Y5", section: "C", studentCount: 26, cartCount: 4, classroom: "Room 2.14", objective: "Intro to block coding" }],
    [addDays(mon, 2), "P2", "xreal", "t-omar", { subject: "Computing", yearGroup: "Y10", section: "A", studentCount: 20, objective: "VR field trip: the solar system" }],
    [addDays(mon, 3), "P1", "dollarx", "t-lucy", { subject: "Maths", yearGroup: "Y9", section: "D", studentCount: 25, objective: "Budgeting simulation" }],
    [addDays(mon, 3), "P5", "strike", "t-james", { subject: "Design & Technology", yearGroup: "Y11", section: "A", studentCount: 18, objective: "Prototype testing" }],
  ];
  for (const [date, block, resourceId, teacher, extra] of plan) {
    await createBooking(
      db,
      admin,
      { ...base, resourceId, date, blockIds: [P(block)], subject: "", yearGroup: "", studentCount: 1, ...extra } as Parameters<typeof createBooking>[2],
      { onBehalfOf: teacher },
    ).catch(() => undefined);
  }
  // Today's sessions for the in-charge view, where the block has not started yet.
  if (isoWeekday(today) <= 5) {
    for (const [block, resourceId, teacher, extra] of [
      ["P6", "quantum", "t-sara", { subject: "Physics", yearGroup: "Y7", section: "A", studentCount: 22 }],
      ["P7", "carts", "t-mariam", { subject: "Geography", yearGroup: "Y6", section: "B", studentCount: 25, cartCount: 3, classroom: "Room 1.08" }],
    ] as const) {
      await createBooking(db, admin, { ...base, resourceId, date: today, blockIds: [P(block)], ...extra } as Parameters<typeof createBooking>[2], { onBehalfOf: teacher }).catch(() => undefined);
    }
  }
  // An outside meeting in Ram's calendar (shows cross-cover in the grid).
  await addExternalEvent(db, "ram", localToInstant(addDays(mon, 3), "10:00", DEFAULT_SETTINGS), localToInstant(addDays(mon, 3), "11:00", DEFAULT_SETTINGS), "Department meeting");
  // A maintenance day the following week.
  await db.query("INSERT INTO blackouts (id, resource_id, date_from, date_to, block_codes, reason, note, created_by) VALUES ($1,'xreal',$2,$2,NULL,'maintenance','Headset firmware update','abd')", [
    newId("bo"), addDays(mon, 8),
  ]);
}

/** Three weeks of past sessions so reports have something to show. Deterministic. */
async function seedHistory(db: Db) {
  const today = localDate(now(), DEFAULT_SETTINGS);
  let x = 7;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const teachers = STAFF.filter((s) => s[4] === "teacher").map((s) => s[0]);
  const blocks = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"];
  for (let d = 21; d >= 1; d--) {
    const date = addDays(today, -d);
    if (isoWeekday(date) > 5) continue;
    const world = await loadWorld(db, date, date, { skipCalendar: true });
    const fakeNow = localToInstant(addDays(date, -2), "08:00", DEFAULT_SETTINGS);
    for (const block of blocks) {
      for (const resourceId of ["quantum", "carts", "dollarx", "xreal", "strike"]) {
        if (rnd() > (resourceId === "carts" ? 0.3 : 0.38)) continue;
        const teacher = teachers[Math.floor(rnd() * teachers.length)];
        const units = resourceId === "carts" ? 1 + Math.floor(rnd() * 5) : 1;
        const ev = evaluate(world, { resourceId, date, blockIds: [P(block)], units, now: fakeNow });
        if (!ev.ok) {
          await db.query("INSERT INTO booking_attempts (teacher_id, resource_id, date, block_id, code, at) VALUES ($1,$2,$3,$4,$5,$6)", [teacher, resourceId, date, P(block), ev.code, fakeNow.toISOString()]);
          continue;
        }
        const id = newId("bk");
        const status = rnd() < 0.06 ? "no_show" : rnd() < 0.08 ? "cancelled" : "completed";
        const subject = SUBJECTS[Math.floor(rnd() * 8)];
        const year = YEARS[3 + Math.floor(rnd() * 11)];
        await db.query(
          `INSERT INTO bookings (id, resource_id, date, block_ids, teacher_id, incharge_id, subject, year_group, section, student_count, cart_count, classroom, status, cross_cover, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$5,$15)`,
          [id, resourceId, date, [P(block)], teacher, ev.inchargeId, subject, year, SECTIONS[Math.floor(rnd() * 4)], 18 + Math.floor(rnd() * 10),
            resourceId === "carts" ? units : null, resourceId === "carts" ? `Room ${1 + Math.floor(rnd() * 3)}.${10 + Math.floor(rnd() * 9)}` : null, status, ev.crossCover,
            new Date(fakeNow.getTime() - Math.floor(rnd() * 10) * 86_400_000).toISOString()],
        );
        if (status !== "cancelled") {
          await db.query("INSERT INTO booking_slots (booking_id, incharge_id, resource_id, room_key, date, block_id, units) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
            id, ev.inchargeId, resourceId, resourceId === "carts" ? null : resourceId, date, P(block), units,
          ]);
          world.holds.push({ bookingId: id, resourceId, inchargeId: ev.inchargeId, date, blockId: P(block), units });
        }
      }
    }
  }
  // Release 1.1 demo data: check-in codes, lesson links, a few ratings and equipment issues.
  for (const r of await db.query<{ id: string }>("SELECT id FROM resources WHERE checkin_code IS NULL"))
    await db.query("UPDATE resources SET checkin_code = $2 WHERE id = $1", [r.id, `${r.id}-${newId("c").slice(-6)}`]);
  await db.query("UPDATE resources SET links = $2::jsonb WHERE id = $1 AND links = '[]'::jsonb", [
    "quantum",
    JSON.stringify([{ label: "Lab safety rules", url: "https://example.org/sunmarke/quantum-safety" }]),
  ]);
  await db.query("UPDATE resources SET links = $2::jsonb WHERE id = $1 AND links = '[]'::jsonb", [
    "carts",
    JSON.stringify([{ label: "AI Cart quick start", url: "https://example.org/sunmarke/ai-carts" }]),
  ]);
  const done = await db.query<{ id: string; teacher_id: string; resource_id: string }>("SELECT id, teacher_id, resource_id FROM bookings WHERE status = 'completed' ORDER BY id");
  for (const [i, b] of done.entries()) {
    if (i % 3 !== 0) continue;
    await db.query("INSERT INTO feedback (booking_id, teacher_id, rating, comment) VALUES ($1,$2,$3,'') ON CONFLICT DO NOTHING", [b.id, b.teacher_id, i % 9 === 0 ? 3 : i % 2 ? 5 : 4]);
  }
  const issues = await db.query("SELECT 1 FROM equipment_issues LIMIT 1");
  if (!issues.length) {
    await db.query(
      "INSERT INTO equipment_issues (id, resource_id, item, title, detail, severity, reported_by, created_at) VALUES ($1,'xreal','Headset 4','Will not charge','Tried two cables.','medium','t-sara',$2)",
      [newId("iss"), new Date(now().getTime() - 3 * 86_400_000).toISOString()],
    );
    await db.query(
      "INSERT INTO equipment_issues (id, resource_id, item, title, detail, severity, reported_by, created_at) VALUES ($1,'carts','Cart 7','Two laptops missing chargers','','low','ram',$2)",
      [newId("iss"), new Date(now().getTime() - 86_400_000).toISOString()],
    );
  }
}
