"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { getSettings } from "@/lib/server/world";
import { newId } from "@/lib/server/util";
import { AppError } from "@/lib/server/bookings";
import { reassignBooking } from "@/lib/server/release11";

const back = (tab: string, q = "saved=1") => redirect(`/admin?tab=${tab}&${q}`);
const err = (tab: string, m: string) => redirect(`/admin?tab=${tab}&error=${encodeURIComponent(m)}`);

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
      active: z.string().optional(),
    })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return err("resources", p.error.issues[0].message);
  const d = p.data;
  if (d.fallback && d.fallback === d.primary) return err("resources", "Primary and fallback must be different people.");
  const before = await db.query("SELECT * FROM resources WHERE id = $1", [d.id]);
  await db.transaction(async (tx) => {
    await tx.query("UPDATE resources SET name = $2, units = $3, location = $4, active = $5, updated_at = now() WHERE id = $1", [d.id, d.name, d.units, d.location, d.active === "on"]);
    await tx.query("DELETE FROM incharge_assignments WHERE resource_id = $1", [d.id]);
    await tx.query("INSERT INTO incharge_assignments VALUES ($1,$2,1)", [d.id, d.primary]);
    if (d.fallback) await tx.query("INSERT INTO incharge_assignments VALUES ($1,$2,2)", [d.id, d.fallback]);
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
  const id = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 30) || newId("res");
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO resources (id, name, type, units, colour, sort) VALUES ($1,$2,$3,$4,'quantum',99)", [id, d.name, d.type, d.type === "room" ? 1 : d.units]);
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
    await tx.query("INSERT INTO timetables (id, name, valid_from, valid_to, weekdays, priority, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, name, from, to, weekdays, priority, actor.id]);
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
