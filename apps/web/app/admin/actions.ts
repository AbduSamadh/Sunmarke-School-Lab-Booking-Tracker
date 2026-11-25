"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { getSettings } from "@/lib/server/world";
import { newId } from "@/lib/server/util";
import { AppError, campusOf, type Actor } from "@/lib/server/bookings";
import { reassignBooking } from "@/lib/server/release11";

const back = (tab: string, q = "saved=1") => redirect(`/admin?tab=${tab}&${q}`);
const err = (tab: string, m: string) => redirect(`/admin?tab=${tab}&error=${encodeURIComponent(m)}`);

/** Release 2: an admin edits only their current campus's labs and picks in-charges from it. */
async function inCampus(actor: Actor, table: "resources" | "staff" | "timetables", ids: (string | undefined)[]) {
  const want = ids.filter(Boolean) as string[];
  if (!want.length) return true;
  const db = await getDb();
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE id = ANY($1) AND campus_id = $2`, [want, campusOf(actor)]);
  return r[0].n === new Set(want).size;
}

export async function saveResource(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const db = await getDb();
  const p = z
    .object({
      id: z.string().min(1),
      name: z.string().trim().min(2).max(60),
      units: z.coerce.number().int().min(1).max(50),
      location: z.string().trim().max(80).default(""),
      primary: z.string().min(1),
      fallback: z.string().optional(),
      third: z.string().optional(),
      active: z.string().optional(),
    })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return err("resources", p.error.issues[0].message);
  const d = p.data;
  const people = [d.primary, d.fallback, d.third].filter(Boolean);
  if (new Set(people).size !== people.length) return err("resources", "Pick a different person for each in-charge.");
  if (!(await inCampus(actor, "resources", [d.id])) || !(await inCampus(actor, "staff", [d.primary, d.fallback, d.third])))
    return err("resources", "That lab or person belongs to another campus.");
  const before = await db.query("SELECT * FROM resources WHERE id = $1", [d.id]);
  await db.transaction(async (tx) => {
    await tx.query("UPDATE resources SET name = $2, units = $3, location = $4, active = $5, updated_at = now() WHERE id = $1", [d.id, d.name, d.units, d.location, d.active === "on"]);
    await tx.query("DELETE FROM incharge_assignments WHERE resource_id = $1", [d.id]);
    await tx.query("INSERT INTO incharge_assignments VALUES ($1,$2,1)", [d.id, d.primary]);
    if (d.fallback) await tx.query("INSERT INTO incharge_assignments VALUES ($1,$2,2)", [d.id, d.fallback]);
    if (d.third) await tx.query("INSERT INTO incharge_assignments VALUES ($1,$2,3)", [d.id, d.third]);
    await audit(tx, { actorId: actor.id, action: "resource.update", entity: "resource", entityId: d.id, before: before[0], after: d });
  });
  back("resources");
}

export async function addResource(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const db = await getDb();
  const p = z
    .object({ name: z.string().trim().min(2).max(60), type: z.enum(["room", "cart_pool"]), units: z.coerce.number().int().min(1).max(50), primary: z.string().min(1), fallback: z.string().optional() })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return err("resources", p.error.issues[0].message);
  const d = p.data;
  if (!(await inCampus(actor, "staff", [d.primary, d.fallback]))) return err("resources", "Pick in-charges from this campus.");
  const id = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 30) || newId("res");
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO resources (id, name, type, units, colour, sort, campus_id) VALUES ($1,$2,$3,$4,'quantum',99,$5)", [id, d.name, d.type, d.type === "room" ? 1 : d.units, campusOf(actor)]);
    await tx.query("INSERT INTO incharge_assignments VALUES ($1,$2,1)", [id, d.primary]);
    if (d.fallback && d.fallback !== d.primary) await tx.query("INSERT INTO incharge_assignments VALUES ($1,$2,2)", [id, d.fallback]);
    await audit(tx, { actorId: actor.id, action: "resource.create", entity: "resource", entityId: id, after: d });
  }).catch(() => err("resources", "A resource with that name already exists."));
  back("resources");
}

const BLOCK_LINE = /^\s*([A-Za-z0-9]+)\s+(\d{1,2}:\d{2})\s*[-–]?\s*(\d{1,2}:\d{2})\s*(\*)?\s*$/;

/** Add a timetable (Friday, Ramadan, exam week) without code: one block per line, "*" = not bookable. */
export async function addTimetable(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const db = await getDb();
  const name = String(fd.get("name") ?? "").trim();
  const from = String(fd.get("validFrom") ?? "") || null;
  const to = String(fd.get("validTo") ?? "") || null;
  const weekdays = fd.getAll("weekdays").map(Number).filter((n) => n >= 1 && n <= 7);
  const lines = String(fd.get("blocks") ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (name.length < 2) return err("timetables", "Give the timetable a name.");
  if (weekdays.length === 0) return err("timetables", "Tick at least one weekday.");
  if (from && to && to < from) return err("timetables", "The end date is before the start date.");
  const blocks: { code: string; start: string; end: string; bookable: boolean }[] = [];
  for (const [i, l] of lines.entries()) {
    const m = l.match(BLOCK_LINE);
    if (!m) return err("timetables", `Line ${i + 1} should look like "P1 07:50-08:40" (add * for breaks).`);
    const pad = (t: string) => t.padStart(5, "0");
    if (pad(m[3]) <= pad(m[2])) return err("timetables", `Line ${i + 1}: end time must be after start time.`);
    blocks.push({ code: m[1], start: pad(m[2]), end: pad(m[3]), bookable: !m[4] });
  }
  if (!blocks.some((b) => b.bookable)) return err("timetables", "Add at least one bookable block.");
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) return err("timetables", `${sorted[i - 1].code} and ${sorted[i].code} overlap.`);
  // More specific timetables win: a date range beats weekdays-only, which beats Standard.
  const priority = (from || to ? 20 : 0) + (weekdays.length < 5 ? 10 : 0) + 1;
  const id = newId("tt");
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO timetables (id, name, valid_from, valid_to, weekdays, priority, created_by, campus_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, name, from, to, weekdays, priority, actor.id, campusOf(actor)]);
    for (const b of blocks) await tx.query("INSERT INTO blocks (id, timetable_id, code, start_time, end_time, bookable) VALUES ($1,$2,$3,$4,$5,$6)", [`${id}-${b.code}`, id, b.code, b.start, b.end, b.bookable]);
    await audit(tx, { actorId: actor.id, action: "timetable.create", entity: "timetable", entityId: id, after: { name, from, to, weekdays, blocks } });
  });
  back("timetables");
}

export async function retireTimetable(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const db = await getDb();
  const id = String(fd.get("id"));
  if (id === "tt-standard") return err("timetables", "The Standard timetable cannot be removed.");
  if (!(await inCampus(actor, "timetables", [id]))) return err("timetables", "That timetable belongs to another campus.");
  await db.query("UPDATE timetables SET active = false WHERE id = $1", [id]);
  await audit(db, { actorId: actor.id, action: "timetable.retire", entity: "timetable", entityId: id });
  back("timetables");
}

export async function saveRules(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const db = await getDb();
  const p = z
    .object({
      minLeadHours: z.coerce.number().int().min(0).max(168),
      maxLeadDays: z.coerce.number().int().min(1).max(180),
      cancelCutoffHours: z.coerce.number().int().min(0).max(72),
      maxCartsPerBooking: z.coerce.number().int().min(1).max(50),
      quotaPerTeacherWeek: z.coerce.number().int().min(0).max(50),
      quotaPerDeptWeek: z.coerce.number().int().min(0).max(200),
      waitlistHoldHours: z.coerce.number().int().min(1).max(48),
      autoNoShowMinutes: z.coerce.number().int().min(0).max(55),
      recurringMaxDays: z.coerce.number().int().min(7).max(365),
    })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return err("rules", p.error.issues[0].message);
  const before = await getSettings(db);
  const { mockCalendarDown: _, ...rules } = before;
  await db.query("INSERT INTO settings VALUES ('rules', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify({ ...rules, ...p.data })]);
  await audit(db, { actorId: actor.id, action: "settings.rules", entity: "settings", entityId: "rules", before: rules, after: p.data });
  back("rules");
}

export async function setStaffActive(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const db = await getDb();
  const id = String(fd.get("id"));
  const active = fd.get("active") === "1";
  if (id === actor.id) return err("staff", "You cannot deactivate yourself.");
  if (!actor.allCampuses && !(await inCampus(actor, "staff", [id]))) return err("staff", "That person belongs to another campus.");
  await db.query("UPDATE staff SET active = $2, updated_at = now() WHERE id = $1", [id, active]);
  await audit(db, { actorId: actor.id, action: active ? "staff.activate" : "staff.deactivate", entity: "staff", entityId: id });
  back("staff");
}

export async function toggleCalendarOutage(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const db = await getDb();
  const down = fd.get("down") === "1";
  await db.query("INSERT INTO settings VALUES ('mock_calendar_down', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(down)]);
  await audit(db, { actorId: actor.id, action: "settings.mock_calendar_down", entity: "settings", after: { down } });
  back("system");
}

const Link = z.object({ label: z.string().trim().min(1).max(60), url: z.string().url().refine((u) => /^https?:\/\//i.test(u), "Links must start with http:// or https://") });

/** Lesson resource links per lab, one "Label | https://..." per line. Shown in the booking sheet and the confirmation email. */
export async function saveLinks(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const db = await getDb();
  const id = String(fd.get("id"));
  if (!(await inCampus(actor, "resources", [id]))) return err("resources", "That lab belongs to another campus.");
  const lines = String(fd.get("links") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 10) return err("resources", "Up to 10 links per lab.");
  const links: { label: string; url: string }[] = [];
  for (const [i, l] of lines.entries()) {
    const [label, ...rest] = l.split("|");
    const p = Link.safeParse({ label: rest.length ? label : l, url: (rest.length ? rest.join("|") : l).trim() });
    if (!p.success) return err("resources", `Link line ${i + 1}: write it as "Label | https://..."`);
    links.push(p.data);
  }
  await db.query("UPDATE resources SET links = $2::jsonb, updated_at = now() WHERE id = $1", [id, JSON.stringify(links)]);
  await audit(db, { actorId: actor.id, action: "resource.links", entity: "resource", entityId: id, after: links });
  back("resources");
}

/** The campus Labs Hub site (lesson ideas, guides). Blank removes the link. */
export async function saveHubUrl(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const raw = String(fd.get("hubUrl") ?? "").trim();
  const p = z.union([z.literal(""), z.string().max(500).url().refine((u) => /^https:\/\//i.test(u), "The Labs Hub link must start with https://")]).safeParse(raw);
  if (!p.success) return err("resources", p.error.issues[0].message);
  const db = await getDb();
  const campus = campusOf(actor);
  const before = await db.query<{ hub_url: string }>("SELECT hub_url FROM campuses WHERE id = $1", [campus]);
  await db.query("UPDATE campuses SET hub_url = $2 WHERE id = $1", [campus, p.data]);
  await audit(db, { actorId: actor.id, action: "campus.hub_url", entity: "campus", entityId: campus, before: before[0], after: { hub_url: p.data } });
  back("resources");
}

/** Move a booking to another in-charge (or whoever is free). The teacher and both in-charges are emailed. */
export async function reassign(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const db = await getDb();
  const id = String(fd.get("id"));
  const staffId = String(fd.get("staffId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 120) || "Reassigned by the lab admin";
  let message: string | null = null;
  try {
    await reassignBooking(db, actor, id, staffId && staffId !== "auto" ? staffId : undefined, reason);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    message = e.message;
  }
  if (message) return err("bookings", message);
  back("bookings");
}

// ---------------------------------------------------------------------------
// Release 2: campuses. Only group admins (all campuses) manage these.
// ---------------------------------------------------------------------------

async function groupAdmin() {
  const actor = await requireActor(["admin"]);
  if (!actor.allCampuses) redirect("/admin?tab=resources&error=" + encodeURIComponent("Only a group admin can manage campuses."));
  return actor;
}

const CampusInput = z.object({
  name: z.string().trim().min(2, "Give the campus a name.").max(80),
  shortName: z.string().trim().max(30).default(""),
});

export async function addCampus(fd: FormData) {
  const actor = await groupAdmin();
  const p = CampusInput.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return err("campuses", p.error.issues[0].message);
  const db = await getDb();
  const id = p.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 30) || newId("cmp");
  const exists = await db.query("SELECT 1 FROM campuses WHERE id = $1", [id]);
  if (exists.length) return err("campuses", "A campus with that name already exists.");
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO campuses (id, name, short_name, sort) VALUES ($1,$2,$3,(SELECT coalesce(max(sort),0)+1 FROM campuses))", [id, p.data.name, p.data.shortName || p.data.name]);
    // Every campus starts with the standard day; admins then edit it like any timetable.
    const ttId = `tt-${id}`;
    await tx.query("INSERT INTO timetables (id, name, valid_from, valid_to, weekdays, priority, created_by, campus_id) SELECT $1, name, NULL, NULL, weekdays, 0, $2, $3 FROM timetables WHERE id = 'tt-standard'", [ttId, actor.id, id]);
    await tx.query("INSERT INTO blocks (id, timetable_id, code, start_time, end_time, bookable) SELECT $1 || '-' || code, $1, code, start_time, end_time, bookable FROM blocks WHERE timetable_id = 'tt-standard'", [ttId]);
    await audit(tx, { actorId: actor.id, action: "campus.create", entity: "campus", entityId: id, after: p.data });
  });
  back("campuses");
}

export async function saveCampus(fd: FormData) {
  const actor = await groupAdmin();
  const id = String(fd.get("id") ?? "");
  const p = CampusInput.extend({ active: z.string().optional() }).safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return err("campuses", p.error.issues[0].message);
  const db = await getDb();
  const active = p.data.active === "on";
  if (!active) {
    const used = await db.query("SELECT 1 FROM staff WHERE campus_id = $1 AND active LIMIT 1", [id]);
    if (used.length) return err("campuses", "Move or deactivate this campus's staff before closing it.");
  }
  const before = await db.query("SELECT * FROM campuses WHERE id = $1", [id]);
  if (!before.length) return err("campuses", "Campus not found.");
  await db.query("UPDATE campuses SET name = $2, short_name = $3, active = $4 WHERE id = $1", [id, p.data.name, p.data.shortName || p.data.name, active]);
  await audit(db, { actorId: actor.id, action: "campus.update", entity: "campus", entityId: id, before: before[0], after: p.data });
  back("campuses");
}

/** Move a person to another campus, or let them see every campus (group admins, leadership). */
export async function setStaffCampus(fd: FormData) {
  const actor = await groupAdmin();
  const p = z
    .object({ id: z.string().min(1), campusId: z.string().min(1), allCampuses: z.string().optional() })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return err("staff", p.error.issues[0].message);
  const db = await getDb();
  const c = await db.query("SELECT 1 FROM campuses WHERE id = $1 AND active", [p.data.campusId]);
  if (!c.length) return err("staff", "Pick an open campus.");
  const all = p.data.allCampuses === "on";
  if (p.data.id === actor.id && !all) return err("staff", "You cannot remove your own group access.");
  const before = await db.query("SELECT campus_id, all_campuses FROM staff WHERE id = $1", [p.data.id]);
  if (!before.length) return err("staff", "Person not found.");
  const busy = await db.query("SELECT 1 FROM incharge_assignments a JOIN resources r ON r.id = a.resource_id WHERE a.staff_id = $1 AND r.campus_id <> $2 AND r.active LIMIT 1", [p.data.id, p.data.campusId]);
  if (busy.length) return err("staff", "This person is an in-charge of a lab on their current campus. Change the lab's in-charges first.");
  await db.query("UPDATE staff SET campus_id = $2, all_campuses = $3, updated_at = now() WHERE id = $1", [p.data.id, p.data.campusId, all]);
  await audit(db, { actorId: actor.id, action: "staff.campus", entity: "staff", entityId: p.data.id, before: before[0], after: { campusId: p.data.campusId, allCampuses: all } });
  back("staff");
}

// ---------------------------------------------------------------------------
// Release 2: curriculum mapping. The KS3 progressive plan as admin-editable levels.
// ---------------------------------------------------------------------------

const Level = z.object({
  code: z.string().trim().min(1, "Give the level a code.").max(20).regex(/^[\w.-]+$/, "Codes use letters, numbers, dots and dashes."),
  strand: z.string().trim().min(1, "Give the strand.").max(60),
  title: z.string().trim().min(3, "Describe the level.").max(160),
  yearGroup: z.string().trim().max(20).default(""),
});

export async function saveLevel(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const id = String(fd.get("id") ?? "");
  const p = Level.extend({ active: z.string().optional() }).safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return err("curriculum", p.error.issues[0].message);
  const db = await getDb();
  const before = await db.query("SELECT * FROM curriculum_levels WHERE id = $1", [id]);
  if (!before.length) return err("curriculum", "Level not found.");
  const clash = await db.query("SELECT 1 FROM curriculum_levels WHERE code = $1 AND id <> $2", [p.data.code, id]);
  if (clash.length) return err("curriculum", `Another level already uses the code ${p.data.code}.`);
  await db.query("UPDATE curriculum_levels SET code = $2, strand = $3, title = $4, year_group = $5, active = $6 WHERE id = $1", [
    id, p.data.code, p.data.strand, p.data.title, p.data.yearGroup, p.data.active === "on",
  ]);
  await audit(db, { actorId: actor.id, action: "curriculum.update", entity: "curriculum_level", entityId: id, before: before[0], after: p.data });
  back("curriculum");
}

export async function addLevel(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const p = Level.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return err("curriculum", p.error.issues[0].message);
  const db = await getDb();
  const clash = await db.query("SELECT 1 FROM curriculum_levels WHERE code = $1", [p.data.code]);
  if (clash.length) return err("curriculum", `A level with the code ${p.data.code} already exists.`);
  const id = newId("cl");
  await db.query("INSERT INTO curriculum_levels (id, code, strand, title, year_group, sort) VALUES ($1,$2,$3,$4,$5,(SELECT coalesce(max(sort),0)+1 FROM curriculum_levels))", [
    id, p.data.code, p.data.strand, p.data.title, p.data.yearGroup,
  ]);
  await audit(db, { actorId: actor.id, action: "curriculum.create", entity: "curriculum_level", entityId: id, after: p.data });
  back("curriculum");
}

/**
 * Import the plan from CSV: "code,strand,title,year" per line (a header line is skipped).
 * Existing codes are updated; "replace" retires every level not in the file (tags on
 * past bookings are kept, so old reports still read correctly).
 */
export async function importLevels(fd: FormData) {
  const actor = await requireActor(["admin"]);
  const text = String(fd.get("csv") ?? "");
  const replace = fd.get("replace") === "on";
  const rows: z.infer<typeof Level>[] = [];
  const errors: string[] = [];
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (i === 0 && /^code$/i.test(cells[0]?.trim() ?? "")) continue;
    const p = Level.safeParse({ code: cells[0], strand: cells[1], title: cells[2], yearGroup: cells[3] ?? "" });
    if (p.success) rows.push(p.data);
    else errors.push(`Line ${i + 1}: ${p.error.issues[0].message}`);
  }
  if (errors.length) return err("curriculum", errors.slice(0, 3).join(" "));
  if (!rows.length) return err("curriculum", "Paste at least one level.");
  if (rows.length > 500) return err("curriculum", "Up to 500 levels at a time.");
  if (new Set(rows.map((r) => r.code)).size !== rows.length) return err("curriculum", "The file repeats a code.");
  const db = await getDb();
  await db.transaction(async (tx) => {
    if (replace) await tx.query("UPDATE curriculum_levels SET active = false WHERE code <> ALL($1)", [rows.map((r) => r.code)]);
    for (const [i, r] of rows.entries()) {
      await tx.query(
        `INSERT INTO curriculum_levels (id, code, strand, title, year_group, sort) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (code) DO UPDATE SET strand = EXCLUDED.strand, title = EXCLUDED.title, year_group = EXCLUDED.year_group, sort = EXCLUDED.sort, active = true`,
        [newId("cl"), r.code, r.strand, r.title, r.yearGroup, i],
      );
    }
    await tx.query("DELETE FROM meta WHERE key = 'curriculum_sample'");
    await audit(tx, { actorId: actor.id, action: "curriculum.import", entity: "curriculum_level", after: { count: rows.length, replace } });
  });
  back("curriculum", `saved=1&imported=${rows.length}`);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
