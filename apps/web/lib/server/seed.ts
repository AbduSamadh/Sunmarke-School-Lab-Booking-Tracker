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
  // abd, 25 Nov 2026: Nael is the third lab in-charge.
  ["nael", "Nael", "nael@sunmarke.example", "Labs", "incharge"],
  ["neil", "Dr. Neil", "neil@sunmarke.example", "Leadership", "viewer"],
  // abd, 25 Nov 2026: leadership sign-ins for SLT (Dr. Sreejit), the Principal and the Board of Directors.
  // The Principal and BOD names are placeholders until the real staff list arrives.
  ["sreejit", "Dr. Sreejit", "sreejit@sunmarke.example", "SLT", "viewer"],
  ["principal", "Principal", "principal@sunmarke.example", "Principal", "viewer"],
  ["bod", "Board of Directors", "bod@sunmarke.example", "BOD", "viewer"],
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

/**
 * Booking subjects, matched to the KS3 curriculum (abd, 25 Nov 2026): the national curriculum
 * subjects for Y7 to Y9 plus the UAE's required Arabic, Islamic Studies and Moral, Social and
 * Cultural Studies. Science is one subject at KS3, so Physics, Chemistry and Biology are not
 * listed, and Business (a GCSE option) is dropped. "Other" asks the teacher to name it.
 */
export const SUBJECTS = ["Computing", "Science", "Maths", "English", "Design & Technology", "Art & Design", "Music", "Geography", "History", "Languages", "Citizenship", "PE", "Arabic", "Islamic Studies", "Moral, Social & Cultural Studies", "Other"];
const YEARS = ["FS1", "FS2", ...Array.from({ length: 13 }, (_, i) => `Y${i + 1}`)];
const SECTIONS = ["A", "B", "C", "D", "E", "F"];

/**
 * SAMPLE KS3 levels so curriculum mapping can be tried, checked against the KS3 Computing
 * programme of study (England, Y7 to Y9) on 25 Nov 2026 at abd's request: every level is a
 * statement from that programme, spread across the three years. The national curriculum does
 * not split KS3 by year, so the year is a suggested order. They are placeholders, not
 * Sunmarke's KS3 progressive plan: the lab admin replaces them in Admin › Curriculum (or
 * imports the real plan as CSV) before tagging real lessons.
 */
export const SAMPLE_CURRICULUM: [code: string, strand: string, title: string, year: string][] = [
  ["CT-7", "Algorithms and computational thinking", "Use abstraction and decomposition to model a real-world problem", "Y7"],
  ["PR-7", "Programming", "Write programs that use sequence, selection and repetition", "Y7"],
  ["SY-7", "Computer systems and data", "Name the hardware and software parts of a computer system and how they communicate", "Y7"],
  ["ES-7", "Online safety", "Keep your identity and privacy safe online, and know how to report concerns", "Y7"],
  ["CT-8", "Algorithms and computational thinking", "Compare searching and sorting algorithms", "Y8"],
  ["PR-8", "Programming", "Use a text-based language with lists and procedures to solve a problem", "Y8"],
  ["SY-8", "Computer systems and data", "Represent numbers, text, images and sound in binary, and add binary numbers", "Y8"],
  ["IT-8", "Creative projects", "Combine applications and devices to collect and analyse data for a user", "Y8"],
  ["CT-9", "Algorithms and computational thinking", "Use logical reasoning to compare two algorithms for the same task", "Y9"],
  ["PR-9", "Programming", "Write and test functions in two languages, at least one text-based", "Y9"],
  ["SY-9", "Computer systems and data", "Use Boolean logic in circuits and programs, and explain how instructions are stored and run", "Y9"],
  ["IT-9", "Creative projects", "Create and improve a digital product for an audience: trustworthy, well designed and usable", "Y9"],
];

/**
 * DUMMY weekly ICT timetable for the hybrid labs (abd, 25 Nov 2026): Strike, XReal and
 * DollarX host regular ICT lessons, so only the other periods can be booked. Replace with
 * the school's real ICT timetable. Weekday 1 = Monday.
 */
const ICT_PERIODS: Record<string, Record<number, string[]>> = {
  strike: { 1: ["P1", "P2", "P5"], 2: ["P1", "P2", "P6"], 3: ["P3", "P4", "P7"], 4: ["P2", "P3", "P6"], 5: ["P1", "P4"] },
  xreal: { 1: ["P3", "P4", "P7"], 2: ["P3", "P5", "P7"], 3: ["P1", "P5", "P6"], 4: ["P1", "P4", "P7"], 5: ["P2", "P5"] },
  dollarx: { 1: ["P2", "P6"], 2: ["P2", "P3", "P7"], 3: ["P4", "P5"], 4: ["P3", "P6", "P7"], 5: ["P1", "P3", "P6"] },
};
export const ICT_LESSONS: { id: string; resourceId: string; weekday: number; blockCode: string; label: string }[] = Object.entries(ICT_PERIODS).flatMap(([resourceId, days], li) =>
  Object.entries(days).flatMap(([wd, codes]) =>
    codes.map((blockCode, i) => {
      const n = li * 7 + Number(wd) * 3 + i;
      return { id: `ict-${resourceId}-${wd}-${blockCode}`, resourceId, weekday: Number(wd), blockCode, label: `ICT Y${7 + (n % 5)} ${"ABCD"[n % 4]}` };
    }),
  ),
);

export async function seed(db: Db) {
  for (const s of STAFF)
    await db.query("INSERT INTO staff (id, name, email, department, role) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [...s]);
  for (const r of RESOURCES)
    await db.query("INSERT INTO resources (id, name, type, units, location, capacity, colour, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING", [...r]);
  // abd, 25 Nov 2026: Nael works Quantum and the AI Carts with Ram (Ram, then Nael, then Abdul);
  // for DollarX, XReal and Strike he steps in when Abdul and Ram are both busy.
  for (const [res, ...order] of [
    ["quantum", "ram", "nael", "abdul"], ["carts", "ram", "nael", "abdul"], ["dollarx", "abdul", "ram", "nael"], ["xreal", "abdul", "ram", "nael"], ["strike", "abdul", "ram", "nael"],
  ]) {
    for (const [i, who] of order.entries()) await db.query("INSERT INTO incharge_assignments VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [res, who, i + 1]);
  }
  const tt = standardTimetable();
  await db.query("INSERT INTO timetables (id, name, valid_from, valid_to, weekdays, priority) VALUES ($1,$2,NULL,NULL,$3,0) ON CONFLICT DO NOTHING", [tt.id, tt.name, tt.weekdays]);
  for (const b of tt.blocks)
    await db.query("INSERT INTO blocks (id, timetable_id, code, start_time, end_time, bookable) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", [b.id, tt.id, b.code, b.start, b.end, b.bookable]);
  await db.query("INSERT INTO settings VALUES ('rules', $1) ON CONFLICT DO NOTHING", [JSON.stringify(DEFAULT_SETTINGS)]);
  await db.query("INSERT INTO settings VALUES ('mock_calendar_down', 'false') ON CONFLICT DO NOTHING");
  for (const [kind, list] of [["subject", SUBJECTS], ["year_group", YEARS], ["section", SECTIONS]] as const)
    for (const [i, v] of list.entries()) await db.query("INSERT INTO lookups VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [kind, v, i]);

  for (const [i, [code, strand, title, year]] of SAMPLE_CURRICULUM.entries())
    await db.query("INSERT INTO curriculum_levels (id, code, strand, title, year_group, sort) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", [`cl-${code.toLowerCase()}`, code, strand, title, year, i]);
  await db.query("INSERT INTO meta VALUES ('curriculum_sample', 'true') ON CONFLICT DO NOTHING");
  // Abd (lab admin) and Dr. Neil (leadership) can see every campus once there is more than one.
  await db.query("UPDATE staff SET all_campuses = true WHERE id IN ('abd', 'neil', 'sreejit', 'principal', 'bod')");
  for (const l of ICT_LESSONS)
    await db.query("INSERT INTO timetabled_lessons (id, resource_id, weekday, block_code, label) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [l.id, l.resourceId, l.weekday, l.blockCode, l.label]);

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
    [addDays(mon, 1), "P3", "carts", "t-priya", { subject: "Computing", yearGroup: "Y5", section: "C", studentCount: 26, cartCount: 2, classroom: "Room 2.14", objective: "Intro to block coding" }],
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
      ["P6", "quantum", "t-sara", { subject: "Science", yearGroup: "Y7", section: "A", studentCount: 22 }],
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
        const units = resourceId === "carts" ? 1 + Math.floor(rnd() * 3) : 1;
        const ev = evaluate(world, { resourceId, date, blockIds: [P(block)], units, now: fakeNow });
        if (!ev.ok) {
          if (ev.code === "timetabled") continue; // nobody tries to book over the ICT timetable
          await db.query("INSERT INTO booking_attempts (teacher_id, resource_id, date, block_id, code, at) VALUES ($1,$2,$3,$4,$5,$6)", [teacher, resourceId, date, P(block), ev.code, fakeNow.toISOString()]);
          continue;
        }
        const id = newId("bk");
        const status = rnd() < 0.06 ? "no_show" : rnd() < 0.08 ? "cancelled" : "completed";
        const subject = SUBJECTS[Math.floor(rnd() * 8)];
        const year = YEARS[3 + Math.floor(rnd() * 11)];
        await db.query(
          `INSERT INTO bookings (id, resource_id, date, block_ids, teacher_id, incharge_id, subject, year_group, section, student_count, cart_count, classroom, status, cross_cover, created_by, created_at, curriculum_ids, support_ids)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$5,$15,$16,$17)`,
          [id, resourceId, date, [P(block)], teacher, ev.inchargeId, subject, year, SECTIONS[Math.floor(rnd() * 4)], 18 + Math.floor(rnd() * 10),
            resourceId === "carts" ? units : null, resourceId === "carts" ? `Room ${1 + Math.floor(rnd() * 3)}.${10 + Math.floor(rnd() * 9)}` : null, status, ev.crossCover,
            new Date(fakeNow.getTime() - Math.floor(rnd() * 10) * 86_400_000).toISOString(), sampleLevels(year, id), ev.inchargeIds.slice(1)],
        );
        if (status !== "cancelled") {
          for (const who of ev.inchargeIds) {
            await db.query("INSERT INTO booking_slots (booking_id, incharge_id, resource_id, room_key, date, block_id, units) VALUES ($1,$2,$3,$4,$5,$6,1)", [
              id, who, resourceId, resourceId === "carts" ? null : resourceId, date, P(block),
            ]);
            world.holds.push({ bookingId: id, resourceId, inchargeId: who, date, blockId: P(block), units: 1 });
          }
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

/** Tag some past KS3 lessons with a sample level, so the coverage report has data. */
function sampleLevels(year: string, id: string): string[] {
  const levels = SAMPLE_CURRICULUM.filter((c) => c[3] === year);
  if (!levels.length) return [];
  const h = [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return h % 4 === 0 ? [] : [`cl-${levels[h % levels.length][0].toLowerCase()}`];
}
