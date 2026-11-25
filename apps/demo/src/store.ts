/** Demo state in the browser (localStorage), and the booking actions. Every decision is the real rules engine's. */
import {
  addDays, alternatives, blockInterval, canCancel, cellStatus, evaluate, isoWeekday, localDate, mondayOf,
  type Alternative, type CellStatus, type Evaluation, type WorldState,
} from "@sunmarke/rules";
import { ASSIGNMENTS, LABS, LESSONS, PEOPLE, SETTINGS, TIMETABLE, block, lab, person, SUBJECTS, YEARS, SECTIONS, type Booking, type DemoState, type Message } from "./data";

const KEY = "slb-demo-v2";
export const now = () => new Date();
export const today = () => localDate(now(), SETTINGS);

let state: DemoState = { version: 1, bookings: [], messages: [], seq: 0 };

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as DemoState;
      if (s.version === 1) return s;
    }
  } catch {
    /* private window or blocked storage: run from memory */
  }
  return seed();
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore: the demo still works for this visit */
  }
}
export function reset() {
  state = seed();
  save();
}
export const getState = () => state;
const id = (p: string) => `${p}${(++state.seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The engine's view of the world, from the bookings in this browser. */
export function world(ignore?: string): WorldState {
  return {
    timetables: [TIMETABLE],
    resources: LABS,
    assignments: ASSIGNMENTS,
    staff: PEOPLE.map((p) => ({ id: p.id, name: p.name })),
    holds: state.bookings
      .filter((b) => (b.status === "confirmed" || b.status === "completed") && b.id !== ignore)
      .flatMap((b) => b.inchargeIds.map((inchargeId) => ({ bookingId: b.id, resourceId: b.resourceId, inchargeId, date: b.date, blockId: b.blockId, units: 1 }))),
    blackouts: [],
    lessons: LESSONS,
    busy: [],
    settings: SETTINGS,
  };
}

export const cell = (resourceId: string, date: string, blockId: string, teacherId: string, override: boolean): CellStatus =>
  cellStatus(world(), lab(resourceId), date, block(blockId), now(), override, teacherId);

export interface BookInput { resourceId: string; date: string; blockId: string; teacherId: string; subject: string; yearGroup: string; section: string; students: number; carts: number | null; classroom: string | null }

export function tryBook(actorId: string, input: BookInput): { ok: true; booking: Booking } | { ok: false; reason: string; suggestion?: string; alternatives: Alternative[] } {
  const actor = person(actorId);
  const override = actor.role === "admin";
  const req = { resourceId: input.resourceId, date: input.date, blockIds: [input.blockId], units: input.carts ?? 1, now: now(), overrideWindow: override, teacherId: input.teacherId };
  const ev: Evaluation = evaluate(world(), req);
  if (!ev.ok) return { ok: false, reason: ev.reason, suggestion: ev.suggestion, alternatives: alternatives(world(), req, 4) };
  const b: Booking = {
    id: id("bk"), resourceId: input.resourceId, date: input.date, blockId: input.blockId, teacherId: input.teacherId, inchargeIds: ev.inchargeIds,
    subject: input.subject, yearGroup: input.yearGroup, section: input.section, students: input.students, carts: input.carts, classroom: input.classroom,
    status: "confirmed", createdAt: now().toISOString(), rating: null,
  };
  state.bookings.push(b);
  notify(b, "confirmed");
  save();
  return { ok: true, booking: b };
}

export function cancel(bookingId: string, byId: string) {
  const b = state.bookings.find((x) => x.id === bookingId);
  if (!b || b.status !== "confirmed") return;
  b.status = "cancelled";
  notify(b, "cancelled", person(byId).name);
  save();
}
export function mark(bookingId: string, status: "completed" | "no_show") {
  const b = state.bookings.find((x) => x.id === bookingId);
  if (!b) return;
  b.status = status;
  save();
}
export const cancellable = (b: Booking) => b.status === "confirmed" && canCancel(b.date, block(b.blockId), now(), SETTINGS);
export const startOf = (b: Booking) => blockInterval(b.date, block(b.blockId), SETTINGS).start;
export const endOf = (b: Booking) => blockInterval(b.date, block(b.blockId), SETTINGS).end;

const names = (ids: string[]) => ids.map((i) => person(i).name).join(", ").replace(/, ([^,]*)$/, " and $1");
export const classLabel = (b: Booking) => `${b.yearGroup}${b.section ? ` ${b.section}` : ""}`;

/** What would be a Teams message to the teacher and everyone going. */
function notify(b: Booking, kind: "confirmed" | "cancelled", by?: string) {
  const l = lab(b.resourceId);
  const bl = block(b.blockId);
  const when = `${fmtDay(b.date)}, ${bl.code} (${bl.start}–${bl.end})`;
  const subject = kind === "confirmed" ? `Booked: ${l.name}, ${fmtDay(b.date)} ${bl.code}` : `Cancelled: ${l.name}, ${fmtDay(b.date)} ${bl.code}`;
  const lines = [
    `What: ${l.name}${b.carts ? ` · ${b.carts} cart${b.carts > 1 ? "s" : ""} to ${b.classroom}` : ""}`,
    `When: ${when}`,
    `Class: ${classLabel(b)} · ${b.subject} · ${b.students} students`,
    `Teacher: ${person(b.teacherId).name}`,
    `Lab in-charge: ${names(b.inchargeIds)}`,
    kind === "confirmed"
      ? b.carts
        ? `${names(b.inchargeIds)} will bring the cart${b.carts > 1 ? "s" : ""}.`
        : `${person(b.inchargeIds[0]).name} will be with you.`
      : `Cancelled by ${by}. The slot is free again.`,
  ];
  for (const to of [b.teacherId, ...b.inchargeIds]) state.messages.unshift({ id: id("m"), to, subject, lines, at: now().toISOString(), bookingId: b.id });
  state.messages = state.messages.slice(0, 300);
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDay(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${DAYS[isoWeekday(date) - 1]} ${d} ${MONTHS[m - 1]}`;
}
/** This school week, or next week from Saturday. */
export function weekOf(date: string): string[] {
  const mon = mondayOf(isoWeekday(date) > 5 ? addDays(date, 2) : date);
  return [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
}

// ---------------------------------------------------------------------------
// Sample data: three weeks of history and a few upcoming lessons, made through
// the rules engine so they are all valid. Deterministic for the same day.
// ---------------------------------------------------------------------------
function seed(): DemoState {
  state = { version: 1, bookings: [], messages: [], seq: 0 };
  const t = today();
  let x = Number(t.replace(/-/g, "")) % 2147483647;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const teachers = PEOPLE.filter((p) => p.role === "teacher");
  const codes = TIMETABLE.blocks.filter((b) => b.bookable);
  const add = (date: string, blockId: string, resourceId: string, teacherId: string, status: Booking["status"], fakeNow: Date, extra: Partial<Booking> = {}) => {
    const units = resourceId === "carts" ? (extra.carts ?? 1) : 1;
    const ev = evaluate(world(), { resourceId, date, blockIds: [blockId], units, now: fakeNow, overrideWindow: true });
    if (!ev.ok) return null;
    const year = extra.yearGroup ?? YEARS[5 + Math.floor(rnd() * 8)];
    const b: Booking = {
      id: id("bk"), resourceId, date, blockId, teacherId, inchargeIds: ev.inchargeIds,
      subject: extra.subject ?? SUBJECTS[Math.floor(rnd() * 12)], yearGroup: year, section: extra.section ?? SECTIONS[Math.floor(rnd() * 4)],
      students: extra.students ?? 18 + Math.floor(rnd() * 10), carts: resourceId === "carts" ? units : null,
      classroom: resourceId === "carts" ? (extra.classroom ?? `Room ${1 + Math.floor(rnd() * 3)}.${10 + Math.floor(rnd() * 9)}`) : null,
      status, createdAt: new Date(fakeNow.getTime() - 3 * 86_400_000).toISOString(), rating: status === "completed" && rnd() < 0.5 ? 3 + Math.floor(rnd() * 3) : null,
    };
    state.bookings.push(b);
    return b;
  };
  for (let d = 21; d >= 1; d--) {
    const date = addDays(t, -d);
    if (isoWeekday(date) > 5) continue;
    const fakeNow = new Date(blockInterval(date, codes[0], SETTINGS).start.getTime() - 3 * 86_400_000);
    for (const bl of codes)
      for (const l of LABS) {
        if (rnd() > (l.id === "carts" ? 0.22 : 0.33)) continue;
        const r = rnd();
        add(date, bl.id, l.id, teachers[Math.floor(rnd() * teachers.length)].id, r < 0.06 ? "no_show" : r < 0.1 ? "cancelled" : "completed", fakeNow, { carts: 1 + Math.floor(rnd() * 3) });
      }
  }
  // Upcoming: next week's lessons, including one 3-cart booking that ties up all three in-charges.
  const mon = addDays(mondayOf(t), 7);
  const fakeNow = new Date(blockInterval(mon, codes[0], SETTINGS).start.getTime() - 5 * 86_400_000);
  const P = (c: string) => `${TIMETABLE.id}-${c}`;
  add(addDays(mon, 1), P("P3"), "quantum", "t-sara", "confirmed", fakeNow, { subject: "Science", yearGroup: "Y8", section: "B", students: 24 });
  add(addDays(mon, 1), P("P5"), "carts", "t-priya", "confirmed", fakeNow, { subject: "Computing", yearGroup: "Y5", section: "C", students: 26, carts: 3, classroom: "Room 2.14" });
  add(addDays(mon, 2), P("P2"), "xreal", "t-omar", "confirmed", fakeNow, { subject: "Computing", yearGroup: "Y10", section: "A", students: 20 });
  add(addDays(mon, 3), P("P1"), "dollarx", "t-lucy", "confirmed", fakeNow, { subject: "Maths", yearGroup: "Y9", section: "D", students: 25 });
  add(addDays(mon, 3), P("P4"), "carts", "t-mariam", "confirmed", fakeNow, { subject: "Geography", yearGroup: "Y6", section: "B", students: 25, carts: 2, classroom: "Room 1.08" });
  for (const b of state.bookings.filter((x) => x.status === "confirmed")) notify(b, "confirmed");
  save();
  return state;
}

// Load last, once every helper above exists.
state = load();
