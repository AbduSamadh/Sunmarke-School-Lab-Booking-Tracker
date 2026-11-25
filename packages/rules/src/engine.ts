import type {
  Block,
  Blackout,
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

export function mondayOf(date: ISODate): ISODate {
  return addDays(date, 1 - isoWeekday(date));
}

// ---------------------------------------------------------------------------
// Timetables (D1, D2): data, never hard-coded. The most specific timetable that
// covers a date wins (Ramadan/Friday over Standard).
// ---------------------------------------------------------------------------

export function timetableForDate(timetables: Timetable[], date: ISODate): Timetable | null {
  const wd = isoWeekday(date);
  const candidates = timetables.filter(
    (t) =>
      t.weekdays.includes(wd) &&
      (t.validFrom === null || t.validFrom <= date) &&
      (t.validTo === null || t.validTo >= date),
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.priority - a.priority)[0];
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
  kind: "booking" | "calendar";
  text: string;
}

export function inchargeBusy(
  state: WorldState,
  staffId: string,
  date: ISODate,
  block: Block,
  ignoreBookingId?: string,
): BusyReason | null {
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

export function evaluate(state: WorldState, req: BookingRequest): Evaluation {
  const s = state.settings;
  const resource = state.resources.find((r) => r.id === req.resourceId && r.active);
  if (!resource) return blocked("unknown_resource", "This lab or cart pool is not available for booking.");

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
    const lastDay = addDays(localDate(req.now, s), s.maxLeadDays);
    if (req.date > lastDay)
      return blocked("window_too_far", `You can book up to ${Math.round(s.maxLeadDays / 7)} weeks ahead.`);
  }

  // R1 resource free, every block
  const units = resource.type === "cart_pool" ? (req.units ?? 1) : 1;
  if (resource.type === "cart_pool" && (!Number.isInteger(units) || units < 1 || units > Math.min(resource.units, s.maxCartsPerBooking)))
    return blocked("invalid_units", `Choose between 1 and ${Math.min(resource.units, s.maxCartsPerBooking)} carts.`);

  let unitsLeftAfter = resource.units;
  for (const b of blocks) {
    const bo = blackoutFor(state.blackouts, resource.id, req.date, b.code);
    if (bo) return blocked("blackout", blackoutLabel(bo));
    const holds = holdsAt(state.holds, resource.id, req.date, b.id, req.ignoreBookingId);
    if (resource.type === "room") {
      if (holds.length > 0)
        return blocked("resource_booked", `${resource.name} is already booked at ${b.code}.`, {
          heldBy: holds[0].bookingId,
          canWaitlist: true,
        });
    } else {
      const used = holds.reduce((n, h) => n + h.units, 0);
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

  // R2–R5: primary first, then fallback; the same person must cover every block (T14)
  const cands = candidatesFor(state, resource.id);
  const reasons: string[] = [];
  for (const c of cands) {
    const busy = blocks.map((b) => ({ b, r: inchargeBusy(state, c.staffId, req.date, b, req.ignoreBookingId) })).find((x) => x.r);
    if (!busy) {
      return {
        ok: true,
        inchargeId: c.staffId,
        inchargeName: staffName(state, c.staffId),
        crossCover: c.priority !== cands[0].priority,
        unitsLeftAfter,
      };
    }
    reasons.push(`${staffName(state, c.staffId)} busy ${busy.r!.text}${blocks.length > 1 ? ` at ${busy.b.code}` : ""}`);
  }
  return blocked("no_incharge", "No lab in-charge available", {
    suggestion: reasons.join("; "),
    canWaitlist: true,
  });
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

export function cellStatus(state: WorldState, resource: Resource, date: ISODate, block: Block, now: Date, overrideWindow = false): CellStatus {
  if (!block.bookable) return { state: "closed", label: block.code };
  const ev = evaluate(state, { resourceId: resource.id, date, blockIds: [block.id], units: 1, now, overrideWindow });
  const bookingIds = holdsAt(state.holds, resource.id, date, block.id).map((h) => h.bookingId);
  if (ev.ok) {
    const used = holdsAt(state.holds, resource.id, date, block.id).reduce((n, h) => n + h.units, 0);
    return {
      state: "free",
      inchargeId: ev.inchargeId,
      inchargeName: ev.inchargeName,
      crossCover: ev.crossCover,
      unitsLeft: resource.units - used,
      unitsTotal: resource.units,
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
export function alternatives(state: WorldState, req: BookingRequest, limit = 3): Alternative[] {
  const out: Alternative[] = [];
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
    const t = timetableForDate(state.timetables, h.date);
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
