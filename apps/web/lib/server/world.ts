import type { Db, Tx } from "@sunmarke/db";
import {
  type TimetabledLesson,
  DEFAULT_SETTINGS,
  type Blackout,
  type BusyInterval,
  type InchargeAssignment,
  type Resource,
  type RuleSettings,
  type SlotHold,
  type Timetable,
  type WorldState,
  type WaitlistOffer,
  type Absence,
  localToInstant,
  addDays,
  scopeToCampus,
} from "@sunmarke/rules";
import { getCalendar } from "./calendar";

type Q = Db | Tx;

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  department: string;
  role: "teacher" | "incharge" | "admin" | "viewer";
  active: boolean;
  campusId: string;
  allCampuses: boolean;
}

export async function getSettings(db: Q): Promise<RuleSettings & { mockCalendarDown: boolean }> {
  const rows = await db.query<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    ...DEFAULT_SETTINGS,
    ...(m.rules as Partial<RuleSettings> | undefined),
    mockCalendarDown: Boolean(m.mock_calendar_down),
  };
}

export async function getTimetables(db: Q): Promise<Timetable[]> {
  const tts = await db.query<{ id: string; name: string; valid_from: string | null; valid_to: string | null; weekdays: number[]; priority: number; campus_id: string }>(
    "SELECT id, name, valid_from, valid_to, weekdays, priority, campus_id FROM timetables WHERE active ORDER BY priority, name",
  );
  const blocks = await db.query<{ id: string; timetable_id: string; code: string; start_time: string; end_time: string; bookable: boolean }>(
    "SELECT * FROM blocks ORDER BY start_time",
  );
  return tts.map((t) => ({
    id: t.id,
    name: t.name,
    validFrom: t.valid_from,
    validTo: t.valid_to,
    weekdays: t.weekdays,
    priority: t.priority,
    campusId: t.campus_id,
    blocks: blocks
      .filter((b) => b.timetable_id === t.id)
      .map((b) => ({ id: b.id, code: b.code, start: b.start_time, end: b.end_time, bookable: b.bookable })),
  }));
}

export interface ResourceLink {
  label: string;
  url: string;
}

export async function getResources(db: Q): Promise<(Resource & { location: string; colour: string; capacity: number | null; links: ResourceLink[]; checkinCode: string | null; campusId: string })[]> {
  const rows = await db.query<{ id: string; name: string; type: "room" | "cart_pool"; units: number; active: boolean; location: string; colour: string; capacity: number | null; links: ResourceLink[]; checkinCode: string | null; campusId: string }>(
    "SELECT id, name, type, units, active, location, colour, capacity, links, checkin_code AS \"checkinCode\", campus_id AS \"campusId\" FROM resources ORDER BY sort, name",
  );
  return rows;
}

export async function getStaff(db: Q): Promise<StaffRow[]> {
  return db.query<StaffRow>("SELECT id, name, email, department, role, active, campus_id AS \"campusId\", all_campuses AS \"allCampuses\" FROM staff ORDER BY name");
}

export async function getAssignments(db: Q): Promise<InchargeAssignment[]> {
  const rows = await db.query<{ resource_id: string; staff_id: string; priority: number }>("SELECT * FROM incharge_assignments");
  return rows.map((r) => ({ resourceId: r.resource_id, staffId: r.staff_id, priority: r.priority }));
}

export async function getHolds(db: Q, from: string, to: string): Promise<SlotHold[]> {
  const rows = await db.query<{ booking_id: string; resource_id: string; incharge_id: string; date: string; block_id: string; units: number }>(
    "SELECT booking_id, resource_id, incharge_id, date, block_id, units FROM booking_slots WHERE active AND date BETWEEN $1 AND $2",
    [from, to],
  );
  return rows.map((r) => ({ bookingId: r.booking_id, resourceId: r.resource_id, inchargeId: r.incharge_id, date: r.date, blockId: r.block_id, units: r.units }));
}

export async function getLessons(db: Q): Promise<TimetabledLesson[]> {
  const rows = await db.query<{ id: string; resource_id: string; weekday: number; block_code: string; label: string }>(
    "SELECT id, resource_id, weekday, block_code, label FROM timetabled_lessons WHERE active ORDER BY weekday, block_code",
  );
  return rows.map((r) => ({ id: r.id, resourceId: r.resource_id, weekday: r.weekday, blockCode: r.block_code, label: r.label }));
}

export async function getBlackouts(db: Q, from: string, to: string): Promise<Blackout[]> {
  const rows = await db.query<{ id: string; resource_id: string | null; date_from: string; date_to: string; block_codes: string[] | null; reason: Blackout["reason"]; note: string; campus_id: string }>(
    "SELECT id, resource_id, date_from, date_to, block_codes, reason, note, campus_id FROM blackouts WHERE active AND date_from <= $2 AND date_to >= $1",
    [from, to],
  );
  return rows.map((r) => ({ id: r.id, resourceId: r.resource_id, dateFrom: r.date_from, dateTo: r.date_to, blockCodes: r.block_codes, reason: r.reason, note: r.note || undefined, campusId: r.campus_id }));
}

export async function getOffers(db: Q, from: string, to: string): Promise<WaitlistOffer[]> {
  const rows = await db.query<{ resource_id: string; date: string; block_id: string; teacher_id: string; units: number; expires_at: Date }>(
    "SELECT resource_id, date, block_id, teacher_id, units, expires_at FROM waitlist WHERE status = 'offered' AND date BETWEEN $1 AND $2",
    [from, to],
  );
  return rows.map((r) => ({ resourceId: r.resource_id, date: r.date, blockId: r.block_id, teacherId: r.teacher_id, units: r.units, expiresAt: new Date(r.expires_at) }));
}

export async function getAbsences(db: Q, from: string, to: string): Promise<Absence[]> {
  const rows = await db.query<{ id: string; staff_id: string; date_from: string; date_to: string; block_codes: string[] | null; reason: string }>(
    "SELECT id, staff_id, date_from, date_to, block_codes, reason FROM absences WHERE active AND date_from <= $2 AND date_to >= $1",
    [from, to],
  );
  return rows.map((r) => ({ id: r.id, staffId: r.staff_id, dateFrom: r.date_from, dateTo: r.date_to, blockCodes: r.block_codes, reason: r.reason }));
}

export interface LoadedWorld extends WorldState {
  staffRows: StaffRow[];
  resourceRows: Awaited<ReturnType<typeof getResources>>;
  calendarChecked: boolean;
  calendarError?: string;
}

/**
 * Everything the rules engine needs for a date range. Calendar free/busy is read
 * live from the provider every call (R2: checked at submit, not just on grid load).
 * If the calendar API is down, bookings still work on app data alone (T17) and the
 * caller is told the calendar was not checked.
 */
export async function loadWorld(db: Db, from: string, to: string, opts: { tx?: Tx; skipCalendar?: boolean; campusId?: string } = {}): Promise<LoadedWorld> {
  const q: Q = opts.tx ?? db;
  const [settings, timetables, resourceRows, assignments, staffRows, holds, blackouts, offers, absences, lessons] = await Promise.all([
    getSettings(q),
    getTimetables(q),
    getResources(q),
    getAssignments(q),
    getStaff(q),
    getHolds(q, from, to),
    getBlackouts(q, from, to),
    getOffers(q, from, to),
    getAbsences(q, from, to),
    getLessons(q),
  ]);
  const inchargeIds = [...new Set(assignments.map((a) => a.staffId))];
  const incharges = staffRows.filter((s) => inchargeIds.includes(s.id));
  let busy: BusyInterval[] = [];
  let calendarChecked = false;
  let calendarError: string | undefined;
  if (!opts.skipCalendar) {
    try {
      busy = await getCalendar(db).getBusy(
        incharges.map((s) => ({ id: s.id, email: s.email })),
        localToInstant(from, "00:00", settings),
        localToInstant(addDays(to, 1), "00:00", settings),
      );
      calendarChecked = true;
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e);
    }
  }
  const world: LoadedWorld = {
    timetables,
    resources: resourceRows,
    resourceRows,
    assignments,
    staff: staffRows.map((s) => ({ id: s.id, name: s.name })),
    staffRows,
    holds,
    blackouts,
    busy,
    settings,
    offers,
    absences,
    lessons,
    calendarChecked,
    calendarError,
  };
  if (!opts.campusId) return world;
  // Release 2: one campus's labs, timetables and blackouts (staff stay complete for names).
  const scoped = scopeToCampus(world, opts.campusId);
  return { ...world, ...scoped, resourceRows: resourceRows.filter((r) => r.campusId === opts.campusId) };
}
