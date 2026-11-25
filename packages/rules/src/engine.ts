import type {
  Block,
  Blackout,
  TimetabledLesson,
  BookingRequest,
  Evaluation,
  ISODate,
  Resource,
  RuleSettings,
  SlotHold,
  Timetable,
  WorldState,
  Blocked,
  BusyInterval,
} from "./types";

// ---------------------------------------------------------------------------
// Time helpers. The school runs on Asia/Dubai (UTC+4, no daylight saving), so
// a fixed offset is exact. Stored as a setting so another campus can change it.
// ---------------------------------------------------------------------------

export function isoWeekday(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return wd === 0 ? 7 : wd;
}

export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** School-local calendar date of an instant. */
export function localDate(now: Date, settings: RuleSettings): ISODate {
  return new Date(now.getTime() + settings.utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** School-local HH:MM → UTC instant on a given date. */
export function localToInstant(date: ISODate, hhmm: string, settings: RuleSettings): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi) - settings.utcOffsetMinutes * 60_000);
}

export function blockInterval(date: ISODate, block: Block, settings: RuleSettings) {
  return { start: localToInstant(date, block.start, settings), end: localToInstant(date, block.end, settings) };
}

/** Half-open overlap: a block ending 09:40 does not overlap one starting 09:40 (T18). */
export function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function hhmm(d: Date, settings: RuleSettings): string {
  return new Date(d.getTime() + settings.utcOffsetMinutes * 60_000).toISOString().slice(11, 16);
}

export function mondayOf(date: ISODate): ISODate {
  return addDays(date, 1 - isoWeekday(date));
}

// ---------------------------------------------------------------------------
// Timetables (D1, D2): data, never hard-coded. The most specific timetable that
// covers a date wins (Ramadan/Friday over Standard).
// ---------------------------------------------------------------------------

export function timetableForDate(timetables: Timetable[], date: ISODate, campusId?: string): Timetable | null {
  const wd = isoWeekday(date);
  const candidates = timetables.filter(
    (t) =>
      (!t.campusId || !campusId || t.campusId === campusId) &&
      t.weekdays.includes(wd) &&
      (t.validFrom === null || t.validFrom <= date) &&
      (t.validTo === null || t.validTo >= date),
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.priority - a.priority)[0];
}

// ---------------------------------------------------------------------------
// Campuses (Release 2). Each campus has its own labs, in-charges, timetables and
// blackouts; the rules are the same. A world is always judged one campus at a time.
// ---------------------------------------------------------------------------

/** The campus a block belongs to, found through the timetable that owns it. */
export function campusOfBlock(timetables: Timetable[], blockId: string): string | undefined {
  return timetables.find((t) => t.blocks.some((b) => b.id === blockId))?.campusId;
}

/** Only one campus's labs, timetables, blackouts and assignments. */
export function scopeToCampus(state: WorldState, campusId: string | undefined): WorldState {
  if (!campusId) return state;
  const resources = state.resources.filter((r) => !r.campusId || r.campusId === campusId);
  const ids = new Set(resources.map((r) => r.id));
  return {
    ...state,
    resources,
    timetables: state.timetables.filter((t) => !t.campusId || t.campusId === campusId),
    blackouts: state.blackouts.filter((b) => (b.resourceId ? ids.has(b.resourceId) : !b.campusId || b.campusId === campusId)),
    assignments: state.assignments.filter((a) => ids.has(a.resourceId)),
    lessons: state.lessons?.filter((l) => ids.has(l.resourceId)),
  };
}

/** The timetabled lesson using this lab in this block on this date, if any. */
export function lessonFor(lessons: TimetabledLesson[] | undefined, resourceId: string, date: ISODate, blockCode: string): TimetabledLesson | null {
  if (!lessons?.length) return null;
  const wd = isoWeekday(date);
  return lessons.find((l) => l.resourceId === resourceId && l.weekday === wd && l.blockCode === blockCode) ?? null;
}

function sortedBlocks(t: Timetable): Block[] {
  return [...t.blocks].sort((a, b) => a.start.localeCompare(b.start));
}

export function blackoutFor(
  blackouts: Blackout[],
  resourceId: string,
  date: ISODate,
  blockCode: string,
): Blackout | null {
  return (
    blackouts.find(
      (b) =>
        (b.resourceId === null || b.resourceId === resourceId) &&
        b.dateFrom <= date &&
        b.dateTo >= date &&
        (b.blockCodes === null || b.blockCodes.includes(blockCode)),
    ) ?? null
  );
}

const REASON_LABEL: Record<Blackout["reason"], string> = {
  holiday: "Holiday",
  exam: "Exams",
  maintenance: "Maintenance",
  training: "Training",
  other: "Closed",
};

export function blackoutLabel(b: Blackout): string {
  return b.note ? `${REASON_LABEL[b.reason]}: ${b.note}` : REASON_LABEL[b.reason];
}

// ---------------------------------------------------------------------------
// In-charge availability (R2, R6)
// ---------------------------------------------------------------------------

export interface BusyReason {
  kind: "booking" | "calendar" | "leave";
  text: string;
}

/** In-charge leave covering this block, if any. */
export function absenceFor(state: WorldState, staffId: string, date: ISODate, blockCode: string) {
  return (
    (state.absences ?? []).find(
      (a) => a.staffId === staffId && a.dateFrom <= date && a.dateTo >= date && (a.blockCodes === null || a.blockCodes.includes(blockCode)),
    ) ?? null
  );
}

export function inchargeBusy(
  state: WorldState,
  staffId: string,
  date: ISODate,
  block: Block,
  ignoreBookingId?: string,
): BusyReason | null {
  if (absenceFor(state, staffId, date, block.code)) return { kind: "leave", text: "on leave" };
  const hold = state.holds.find(
    (h) => h.inchargeId === staffId && h.date === date && h.blockId === block.id && h.bookingId !== ignoreBookingId,
  );
  if (hold) {
    const res = state.resources.find((r) => r.id === hold.resourceId);
    return { kind: "booking", text: res ? `with ${res.name}` : "with another booking" };
  }
  const interval = blockInterval(date, block, state.settings);
  const ev = externalBusy(state.busy).find((b) => b.staffId === staffId && overlaps(b, interval));
  if (ev) return { kind: "calendar", text: "calendar meeting" };
  return null;
}

/** Events this app wrote for its own bookings are covered by holds; only outside events count. */
export function externalBusy(busy: BusyInterval[]): BusyInterval[] {
  return busy.filter((b) => !b.bookingId);
}

function staffName(state: WorldState, id: string): string {
  return state.staff.find((s) => s.id === id)?.name ?? "In-charge";
}

function candidatesFor(state: WorldState, resourceId: string) {
  return state.assignments.filter((a) => a.resourceId === resourceId).sort((a, b) => a.priority - b.priority);
}

// ---------------------------------------------------------------------------
// The single decision function (R1–R8). Nothing else decides availability.
// ---------------------------------------------------------------------------

function blocked(code: Blocked["code"], reason: string, extra: Partial<Blocked> = {}): Blocked {
  return { ok: false, code, reason, canWaitlist: false, ...extra };
}

export function evaluate(world: WorldState, req: BookingRequest): Evaluation {
  const s = world.settings;
  const resource = world.resources.find((r) => r.id === req.resourceId && r.active);
  if (!resource) return blocked("unknown_resource", "This lab or cart pool is not available for booking.");
  const state = scopeToCampus(world, resource.campusId);

  const timetable = timetableForDate(state.timetables, req.date);
  if (!timetable) return blocked("no_timetable", "No school timetable on this day.");

  const all = sortedBlocks(timetable);
  const bookable = all.filter((b) => b.bookable);
  const blocks: Block[] = [];
  for (const id of req.blockIds) {
    const b = all.find((x) => x.id === id);
    if (!b) return blocked("not_bookable_block", "That block is not on this day's timetable.");
    if (!b.bookable) return blocked("not_bookable_block", `${b.code} is not bookable.`);
    blocks.push(b);
  }
  if (blocks.length === 0) return blocked("not_bookable_block", "Pick at least one block.");
  blocks.sort((a, b) => a.start.localeCompare(b.start));
  const idx = blocks.map((b) => bookable.findIndex((x) => x.id === b.id));
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] !== idx[i - 1] + 1) return blocked("blocks_not_consecutive", "Double lessons must be back-to-back blocks.");
  }

  // R8 booking window
  const first = blockInterval(req.date, blocks[0], s);
  if (first.start.getTime() <= req.now.getTime()) return blocked("in_past", "This block has already started.");
  if (!req.overrideWindow) {
    const leadHours = (first.start.getTime() - req.now.getTime()) / 3_600_000;
    if (leadHours < s.minLeadHours)
      return blocked("window_too_soon", `Bookings close ${s.minLeadHours} h before the lesson.`, {
        suggestion: "Ask the lab admin if this is urgent.",
      });
    const maxDays = req.recurring ? s.recurringMaxDays : s.maxLeadDays;
    const lastDay = addDays(localDate(req.now, s), maxDays);
    if (req.date > lastDay)
      return blocked("window_too_far", `You can book up to ${Math.round(maxDays / 7)} weeks ahead${req.recurring ? " in a series" : ""}.`);
  }

  // Fair-use quota (R1.1), counted in blocks per school week
  if (req.usage) {
    const n = blocks.length;
    if (s.quotaPerTeacherWeek > 0 && req.usage.teacherWeek + n > s.quotaPerTeacherWeek)
      return blocked("quota_reached", `You have used your ${s.quotaPerTeacherWeek} lab blocks for this week.`, {
        suggestion: "Try another week, or ask the lab admin.",
      });
    if (s.quotaPerDeptWeek > 0 && req.usage.deptWeek + n > s.quotaPerDeptWeek)
      return blocked("quota_reached", `Your department has used its ${s.quotaPerDeptWeek} lab blocks for this week.`, {
        suggestion: "Try another week, or ask the lab admin.",
      });
  }

  // R1 resource free, every block
  const units = resource.type === "cart_pool" ? (req.units ?? 1) : 1;
  if (resource.type === "cart_pool" && (!Number.isInteger(units) || units < 1 || units > Math.min(resource.units, s.maxCartsPerBooking)))
    return blocked("invalid_units", `Choose between 1 and ${Math.min(resource.units, s.maxCartsPerBooking)} carts.`);

  let unitsLeftAfter = resource.units;
  for (const b of blocks) {
    const bo = blackoutFor(state.blackouts, resource.id, req.date, b.code);
    if (bo) return blocked("blackout", blackoutLabel(bo));
    const lesson = lessonFor(state.lessons, resource.id, req.date, b.code);
    if (lesson) return blocked("timetabled", `Timetabled: ${lesson.label}`);
    const holds = holdsAt(state.holds, resource.id, req.date, b.id, req.ignoreBookingId);
    // R9 + R1.1: a freed slot is held for the first waitlisted teacher until the offer expires.
    const offers = (state.offers ?? []).filter(
      (o) => o.resourceId === resource.id && o.date === req.date && o.blockId === b.id && o.teacherId !== req.teacherId && o.expiresAt.getTime() > req.now.getTime(),
    );
    if (resource.type === "room") {
      if (holds.length > 0)
        return blocked("resource_booked", `${resource.name} is already booked at ${b.code}.`, {
          heldBy: holds[0].bookingId,
          canWaitlist: true,
        });
      if (offers.length > 0)
        return blocked("held_for_waitlist", `Held for a teacher on the waitlist until ${hhmm(offers[0].expiresAt, s)}.`, { canWaitlist: true });
    } else {
      const used = holds.reduce((n, h) => n + h.units, 0) + offers.reduce((n, o) => n + o.units, 0);
      const left = resource.units - used;
      if (units > left)
        return blocked(
          "not_enough_carts",
          left === 0 ? `All ${resource.units} carts are booked at ${b.code}.` : `Only ${left} of ${resource.units} carts left at ${b.code}.`,
          { canWaitlist: true },
        );
      unitsLeftAfter = Math.min(unitsLeftAfter, left - units);
    }
  }
  if (resource.type === "room") unitsLeftAfter = 0;

  // R2–R5: primary first, then the next in priority; the same people cover every block (T14).
  // AI Carts: one in-charge goes with each cart, so n carts need n free in-charges (abd, 25 Nov).
  const needed = resource.type === "cart_pool" ? units : 1;
  const cands = candidatesFor(state, resource.id);
  const reasons: string[] = [];
  const picked: typeof cands = [];
  for (const c of cands) {
    if (picked.length === needed) break;
    const busy = blocks.map((b) => ({ b, r: inchargeBusy(state, c.staffId, req.date, b, req.ignoreBookingId) })).find((x) => x.r);
    if (!busy) picked.push(c);
    else reasons.push(`${staffName(state, c.staffId)} busy ${busy.r!.text}${blocks.length > 1 ? ` at ${busy.b.code}` : ""}`);
  }
  if (picked.length === needed) {
    return {
      ok: true,
      inchargeId: picked[0].staffId,
      inchargeName: staffName(state, picked[0].staffId),
      crossCover: picked[0].priority !== cands[0].priority,
      unitsLeftAfter,
      inchargeIds: picked.map((c) => c.staffId),
      inchargeNames: picked.map((c) => staffName(state, c.staffId)),
    };
  }
  if (needed > 1 && picked.length > 0)
    return blocked("no_incharge", `Only ${picked.length} lab in-charge${picked.length === 1 ? " is" : "s are"} free, and each cart goes with its own in-charge.`, {
      suggestion: `Book ${picked.length} cart${picked.length === 1 ? "" : "s"}, or pick another period. ${reasons.join("; ")}`,
      canWaitlist: true,
    });
  return blocked("no_incharge", "No lab in-charge available", {
    suggestion: reasons.join("; "),
    canWaitlist: true,
  });
}

/** How many in-charges assigned to a resource are free for a block (caps AI Carts per period). */
export function freeIncharges(state: WorldState, resourceId: string, date: ISODate, block: Block, ignoreBookingId?: string): number {
  return candidatesFor(state, resourceId).filter((c) => !inchargeBusy(state, c.staffId, date, block, ignoreBookingId)).length;
}

export function holdsAt(holds: SlotHold[], resourceId: string, date: ISODate, blockId: string, ignore?: string) {
  return holds.filter((h) => h.resourceId === resourceId && h.date === date && h.blockId === blockId && h.bookingId !== ignore);
}

// ---------------------------------------------------------------------------
// Grid cells and alternatives
// ---------------------------------------------------------------------------

export type CellStatus =
  | { state: "closed"; label: string }
  | { state: "free"; inchargeId: string; inchargeName: string; crossCover: boolean; unitsLeft: number; unitsTotal: number }
  | { state: "booked"; bookingIds: string[]; reason: string }
  | { state: "unavailable"; code: Blocked["code"]; reason: string; suggestion?: string; canWaitlist: boolean; bookingIds: string[] };

export function cellStatus(state: WorldState, resource: Resource, date: ISODate, block: Block, now: Date, overrideWindow = false, teacherId?: string): CellStatus {
  if (!block.bookable) return { state: "closed", label: block.code };
  const ev = evaluate(state, { resourceId: resource.id, date, blockIds: [block.id], units: 1, now, overrideWindow, teacherId });
  const bookingIds = holdsAt(state.holds, resource.id, date, block.id).map((h) => h.bookingId);
  if (ev.ok) {
    const used = holdsAt(state.holds, resource.id, date, block.id).reduce((n, h) => n + h.units, 0);
    const scoped = scopeToCampus(state, resource.campusId);
    // AI Carts: what can still go out is limited by carts left and by free in-charges (one per cart).
    const cap = resource.type === "cart_pool" ? Math.min(resource.units, state.settings.maxCartsPerBooking, candidatesFor(scoped, resource.id).length) : resource.units;
    const left = resource.type === "cart_pool" ? Math.min(resource.units - used, freeIncharges(scoped, resource.id, date, block), cap) : resource.units - used;
    return {
      state: "free",
      inchargeId: ev.inchargeId,
      inchargeName: ev.inchargeName,
      crossCover: ev.crossCover,
      unitsLeft: left,
      unitsTotal: cap,
    };
  }
  if (ev.code === "resource_booked") return { state: "booked", bookingIds, reason: ev.reason };
  return { state: "unavailable", code: ev.code, reason: ev.reason, suggestion: ev.suggestion, canWaitlist: ev.canWaitlist, bookingIds };
}

export interface Alternative {
  resourceId: string;
  resourceName: string;
  date: ISODate;
  blockId: string;
  blockCode: string;
  inchargeName: string;
}

/**
 * Next steps when a slot is unavailable: the same resource at other blocks that day,
 * then other resources at the same block. Used for "Just taken" and blocked cells.
 */
export function alternatives(world: WorldState, req: BookingRequest, limit = 3): Alternative[] {
  const out: Alternative[] = [];
  const state = scopeToCampus(world, world.resources.find((r) => r.id === req.resourceId)?.campusId);
  const t = timetableForDate(state.timetables, req.date);
  if (!t) return out;
  const blocks = sortedBlocks(t).filter((b) => b.bookable);
  const resource = state.resources.find((r) => r.id === req.resourceId);
  const try1 = (resourceId: string, b: Block) => {
    const r = state.resources.find((x) => x.id === resourceId);
    if (!r || !r.active) return;
    if (out.some((o) => o.resourceId === resourceId && o.blockId === b.id)) return;
    const ev = evaluate(state, { ...req, resourceId, blockIds: [b.id], units: r.type === "cart_pool" ? req.units : 1 });
    if (ev.ok) out.push({ resourceId, resourceName: r.name, date: req.date, blockId: b.id, blockCode: b.code, inchargeName: ev.inchargeName });
  };
  for (const b of blocks) if (!req.blockIds.includes(b.id) && out.length < limit) try1(req.resourceId, b);
  if (resource?.type === "room") {
    for (const r of state.resources.filter((x) => x.type === "room" && x.id !== req.resourceId))
      for (const id of req.blockIds.slice(0, 1)) {
        const b = blocks.find((x) => x.id === id);
        if (b && out.length < limit + 2) try1(r.id, b);
      }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cancellation window and calendar drift (R9, R10)
// ---------------------------------------------------------------------------

export function canCancel(date: ISODate, block: Block, now: Date, settings: RuleSettings): boolean {
  const start = blockInterval(date, block, settings).start.getTime();
  return start - now.getTime() >= settings.cancelCutoffHours * 3_600_000;
}

export interface Conflict {
  bookingId: string;
  inchargeId: string;
  date: ISODate;
  blockId: string;
  eventTitle: string;
  eventStart: Date;
  eventEnd: Date;
}

/** R10: an outside calendar event clashing with a booking is reported, never auto-cancelled. */
export function findConflicts(state: WorldState): Conflict[] {
  const out: Conflict[] = [];
  const ext = externalBusy(state.busy);
  for (const h of state.holds) {
    const t = timetableForDate(state.timetables, h.date, campusOfBlock(state.timetables, h.blockId));
    const block = t?.blocks.find((b) => b.id === h.blockId);
    if (!block) continue;
    const iv = blockInterval(h.date, block, state.settings);
    for (const e of ext) {
      if (e.staffId === h.inchargeId && overlaps(e, iv))
        out.push({
          bookingId: h.bookingId,
          inchargeId: h.inchargeId,
          date: h.date,
          blockId: h.blockId,
          eventTitle: e.title ?? "Calendar event",
          eventStart: e.start,
          eventEnd: e.end,
        });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cover (R1.1 leave and cover, admin reassign)
// ---------------------------------------------------------------------------

/** Can this person cover every block of a booking? Returns the first reason they cannot. */
export function canCover(state: WorldState, staffId: string, date: ISODate, blockIds: string[], ignoreBookingId?: string): BusyReason | null {
  const t = timetableForDate(state.timetables, date, blockIds[0] ? campusOfBlock(state.timetables, blockIds[0]) : undefined);
  for (const id of blockIds) {
    const b = t?.blocks.find((x) => x.id === id);
    if (!b) return { kind: "booking", text: "block not on timetable" };
    const r = inchargeBusy(state, staffId, date, b, ignoreBookingId);
    if (r) return r;
  }
  return null;
}

/**
 * Who could take over an existing booking: the resource's in-charges in priority
 * order, skipping the current one. Null when nobody is free for every block.
 */
export function findCover(
  state: WorldState,
  booking: { id: string; resourceId: string; date: ISODate; blockIds: string[]; inchargeId: string },
): { staffId: string; name: string } | null {
  for (const c of candidatesFor(state, booking.resourceId)) {
    if (c.staffId === booking.inchargeId) continue;
    if (!canCover(state, c.staffId, booking.date, booking.blockIds, booking.id)) return { staffId: c.staffId, name: staffName(state, c.staffId) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recurring bookings (R1.1)
// ---------------------------------------------------------------------------

/** Dates from start to end (inclusive) every `everyWeeks` weeks, on start's weekday. */
export function recurringDates(start: ISODate, end: ISODate, everyWeeks = 1, max = 40): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end && out.length < max; d = addDays(d, 7 * everyWeeks)) out.push(d);
  return out;
}

/** Monday–Sunday range of the school week containing a date, for quotas. */
export function weekRange(date: ISODate): { from: ISODate; to: ISODate } {
  const from = mondayOf(date);
  return { from, to: addDays(from, 6) };
}

/** A block by id on a date, from the timetable of the campus that owns it. */
export function blockOn(timetables: Timetable[], date: ISODate, blockId: string): Block | undefined {
  return timetableForDate(timetables, date, campusOfBlock(timetables, blockId))?.blocks.find((b) => b.id === blockId);
}
