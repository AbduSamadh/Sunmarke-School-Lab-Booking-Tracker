/**
 * Rule test matrix from the build plan (T1–T18). Cases that need the database,
 * calendar adapter or API (T8, T9, T10 job, T15, T16, T17) live in apps/web/test.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  alternatives,
  canCancel,
  cellStatus,
  evaluate,
  findConflicts,
  localToInstant,
  standardTimetable,
  timetableForDate,
  type SlotHold,
  type Timetable,
  type WorldState,
} from "../src";

const TUE = "2026-12-08";
const WED = "2026-12-09";
const FRI = "2026-12-11";
const NOW = localToInstant("2026-11-30", "08:00", DEFAULT_SETTINGS); // Mon, 8 days before
const S = standardTimetable();
const P = (code: string) => `${S.id}-${code}`;

function world(over: Partial<WorldState> = {}): WorldState {
  return {
    timetables: [S],
    resources: [
      { id: "quantum", name: "Quantum Lab", type: "room", units: 1, active: true },
      { id: "carts", name: "AI Carts", type: "cart_pool", units: 10, active: true },
      { id: "dollarx", name: "DollarX Lab", type: "room", units: 1, active: true },
      { id: "xreal", name: "XReal Lab", type: "room", units: 1, active: true },
      { id: "strike", name: "Strike Lab", type: "room", units: 1, active: true },
    ],
    assignments: [
      { resourceId: "quantum", staffId: "ram", priority: 1 },
      { resourceId: "quantum", staffId: "abdul", priority: 2 },
      { resourceId: "carts", staffId: "ram", priority: 1 },
      { resourceId: "carts", staffId: "abdul", priority: 2 },
      ...["dollarx", "xreal", "strike"].flatMap((r) => [
        { resourceId: r, staffId: "abdul", priority: 1 },
        { resourceId: r, staffId: "ram", priority: 2 },
      ]),
    ],
    staff: [
      { id: "ram", name: "Ram" },
      { id: "abdul", name: "Abdul" },
    ],
    holds: [],
    blackouts: [],
    busy: [],
    settings: DEFAULT_SETTINGS,
    ...over,
  };
}

const hold = (bookingId: string, resourceId: string, inchargeId: string, block = "P3", units = 1, date = TUE): SlotHold => ({
  bookingId,
  resourceId,
  inchargeId,
  date,
  blockId: P(block),
  units,
});

const req = (resourceId: string, block = "P3", extra: object = {}) => ({
  resourceId,
  date: TUE,
  blockIds: [P(block)],
  now: NOW,
  ...extra,
});

describe("rule matrix", () => {
  it("T1 primary assigned when free", () => {
    const r = evaluate(world(), req("quantum"));
    expect(r).toMatchObject({ ok: true, inchargeId: "ram", crossCover: false });
  });

  it("T2 fallback covers when primary is on carts", () => {
    const r = evaluate(world({ holds: [hold("b1", "carts", "ram", "P3", 2)] }), req("quantum"));
    expect(r).toMatchObject({ ok: true, inchargeId: "abdul", crossCover: true });
  });

  it("T3 Ram covers XReal when Abdul is in DollarX", () => {
    const r = evaluate(world({ holds: [hold("b1", "dollarx", "abdul")] }), req("xreal"));
    expect(r).toMatchObject({ ok: true, inchargeId: "ram", crossCover: true });
  });

  it("T4 no in-charge, no booking; waitlist offered", () => {
    const r = evaluate(world({ holds: [hold("b1", "carts", "ram"), hold("b2", "strike", "abdul")] }), req("quantum"));
    expect(r).toMatchObject({ ok: false, code: "no_incharge", reason: "No lab in-charge available", canWaitlist: true });
  });

  it("T5 carts blocked when both in-charges are in labs, though 10 carts are free", () => {
    const w = world({ holds: [hold("b1", "quantum", "ram"), hold("b2", "dollarx", "abdul")] });
    const r = evaluate(w, req("carts", "P3", { units: 1 }));
    expect(r).toMatchObject({ ok: false, code: "no_incharge" });
  });

  it("T6 calendar meeting makes the primary busy", () => {
    const busy = [{ staffId: "ram", start: localToInstant(TUE, "10:00", DEFAULT_SETTINGS), end: localToInstant(TUE, "10:30", DEFAULT_SETTINGS), title: "SLT" }];
    expect(evaluate(world({ busy }), req("carts", "P3", { units: 2 }))).toMatchObject({ ok: true, inchargeId: "abdul" });
    const both = [...busy, { ...busy[0], staffId: "abdul" }];
    expect(evaluate(world({ busy: both }), req("carts", "P3", { units: 2 }))).toMatchObject({ ok: false, code: "no_incharge" });
  });

  it("T6b events the app wrote for its own bookings are not double counted", () => {
    const busy = [{ staffId: "ram", start: localToInstant(TUE, "09:55", DEFAULT_SETTINGS), end: localToInstant(TUE, "10:50", DEFAULT_SETTINGS), bookingId: "old" }];
    expect(evaluate(world({ busy }), req("quantum"))).toMatchObject({ ok: true, inchargeId: "ram" });
  });

  it("T7 only 3 carts left, and a second cart class needs Abdul", () => {
    const w = world({ holds: [hold("b1", "carts", "ram", "P3", 7)] });
    expect(evaluate(w, req("carts", "P3", { units: 4 }))).toMatchObject({ ok: false, code: "not_enough_carts", reason: "Only 3 of 10 carts left at P3." });
    expect(evaluate(w, req("carts", "P3", { units: 3 }))).toMatchObject({ ok: true, inchargeId: "abdul", unitsLeftAfter: 0 });
    const w2 = world({ holds: [hold("b1", "carts", "ram", "P3", 7), hold("b2", "strike", "abdul")] });
    expect(evaluate(w2, req("carts", "P3", { units: 3 }))).toMatchObject({ ok: false, code: "no_incharge" });
  });

  it("T11 blackout blocks with its reason", () => {
    const w = world({ blackouts: [{ id: "x", resourceId: "xreal", dateFrom: WED, dateTo: WED, blockCodes: null, reason: "maintenance" }] });
    expect(evaluate(w, { ...req("xreal", "P2"), date: WED })).toMatchObject({ ok: false, code: "blackout", reason: "Maintenance" });
    expect(evaluate(w, { ...req("quantum", "P2"), date: WED }).ok).toBe(true);
  });

  it("T12 Friday timetable shows only Friday blocks", () => {
    const friday: Timetable = {
      id: "tt-fri",
      name: "Friday",
      validFrom: null,
      validTo: null,
      weekdays: [5],
      priority: 10,
      blocks: [
        { id: "f1", code: "P1", start: "07:50", end: "08:40", bookable: true },
        { id: "f2", code: "P2", start: "08:40", end: "09:30", bookable: true },
      ],
    };
    const w = world({ timetables: [S, friday] });
    expect(timetableForDate(w.timetables, FRI)?.name).toBe("Friday");
    expect(timetableForDate(w.timetables, TUE)?.name).toBe("Standard");
    expect(evaluate(w, { ...req("quantum"), date: FRI }).ok).toBe(false);
    expect(evaluate(w, { ...req("quantum"), date: FRI, blockIds: ["f1"] }).ok).toBe(true);
  });

  it("T12b date-ranged Ramadan timetable wins inside its range only", () => {
    const ram: Timetable = { ...standardTimetable("tt-ram"), name: "Ramadan", validFrom: "2027-02-08", validTo: "2027-03-09", priority: 5 };
    expect(timetableForDate([S, ram], "2027-02-10")?.name).toBe("Ramadan");
    expect(timetableForDate([S, ram], "2027-03-10")?.name).toBe("Standard");
  });

  it("T13 booking window: 23 h too soon, 5 weeks too far, admin override works", () => {
    const soon = new Date(localToInstant(TUE, "09:55", DEFAULT_SETTINGS).getTime() - 23 * 3_600_000);
    expect(evaluate(world(), { ...req("quantum"), now: soon })).toMatchObject({ ok: false, code: "window_too_soon" });
    expect(evaluate(world(), { ...req("quantum"), now: soon, overrideWindow: true }).ok).toBe(true);
    const far = { ...req("quantum"), date: "2027-01-06" };
    expect(evaluate(world(), far)).toMatchObject({ ok: false, code: "window_too_far" });
    expect(evaluate(world(), { ...far, overrideWindow: true }).ok).toBe(true);
    const past = new Date(localToInstant(TUE, "10:00", DEFAULT_SETTINGS));
    expect(evaluate(world(), { ...req("quantum"), now: past, overrideWindow: true })).toMatchObject({ code: "in_past" });
  });

  it("T14 double lesson needs the same in-charge for both blocks", () => {
    const both = { ...req("quantum"), blockIds: [P("P3"), P("P4")] };
    expect(evaluate(world(), both)).toMatchObject({ ok: true, inchargeId: "ram" });
    // Ram busy at P4 only: Abdul covers both
    expect(evaluate(world({ holds: [hold("b1", "carts", "ram", "P4")] }), both)).toMatchObject({ ok: true, inchargeId: "abdul" });
    // Ram busy P4, Abdul busy P3: no single person covers both
    const w = world({ holds: [hold("b1", "carts", "ram", "P4"), hold("b2", "strike", "abdul", "P3")] });
    const r = evaluate(w, both);
    expect(r).toMatchObject({ ok: false, code: "no_incharge" });
    if (!r.ok) expect(r.suggestion).toContain("at P");
    expect(evaluate(world(), { ...req("quantum"), blockIds: [P("P3"), P("P5")] })).toMatchObject({ code: "blocks_not_consecutive" });
  });

  it("T18 adjacent blocks do not overlap", () => {
    // Ram has a meeting 08:45–09:40 (exactly P2). P1 and P3 must stay free.
    const busy = [{ staffId: "ram", start: localToInstant(TUE, "08:45", DEFAULT_SETTINGS), end: localToInstant(TUE, "09:40", DEFAULT_SETTINGS) }];
    const w = world({ busy });
    expect(evaluate(w, req("quantum", "P1"))).toMatchObject({ ok: true, inchargeId: "ram" });
    expect(evaluate(w, req("quantum", "P3"))).toMatchObject({ ok: true, inchargeId: "ram" });
    expect(evaluate(w, req("quantum", "P2"))).toMatchObject({ ok: true, inchargeId: "abdul" });
  });
});

describe("other rules", () => {
  it("R6 room already booked", () => {
    expect(evaluate(world({ holds: [hold("b1", "quantum", "ram")] }), req("quantum"))).toMatchObject({ code: "resource_booked", heldBy: "b1" });
  });

  it("non-bookable blocks and invalid cart counts", () => {
    expect(evaluate(world(), req("quantum", "Break"))).toMatchObject({ code: "not_bookable_block" });
    expect(evaluate(world(), req("carts", "P3", { units: 11 }))).toMatchObject({ code: "invalid_units" });
    expect(evaluate(world(), req("carts", "P3", { units: 0 }))).toMatchObject({ code: "invalid_units" });
    expect(evaluate(world(), { ...req("quantum"), date: "2026-12-12" })).toMatchObject({ code: "no_timetable" });
  });

  it("editing a booking ignores its own hold", () => {
    const w = world({ holds: [hold("b1", "quantum", "ram")] });
    expect(evaluate(w, { ...req("quantum"), ignoreBookingId: "b1" })).toMatchObject({ ok: true, inchargeId: "ram" });
  });

  it("cell status explains every state", () => {
    const w = world({ holds: [hold("b1", "quantum", "ram"), hold("b2", "carts", "abdul", "P3", 4)] });
    const block = (c: string) => S.blocks.find((b) => b.code === c)!;
    const q = w.resources[0];
    expect(cellStatus(w, q, TUE, block("P3"), NOW)).toMatchObject({ state: "booked" });
    expect(cellStatus(w, w.resources[2], TUE, block("P3"), NOW)).toMatchObject({ state: "unavailable", reason: "No lab in-charge available" });
    expect(cellStatus(w, w.resources[1], TUE, block("P4"), NOW)).toMatchObject({ state: "free", unitsLeft: 10, inchargeName: "Ram" });
    expect(cellStatus(w, q, TUE, block("Lunch"), NOW)).toMatchObject({ state: "closed" });
  });

  it("alternatives suggest other blocks and labs", () => {
    const w = world({ holds: [hold("b1", "xreal", "abdul", "P2", 1, WED)] });
    const alts = alternatives(w, { resourceId: "xreal", date: WED, blockIds: [P("P2")], now: NOW });
    expect(alts.length).toBeGreaterThan(0);
    expect(alts[0]).toMatchObject({ resourceId: "xreal", blockCode: "P1" });
  });

  it("cancel cut-off is 2 h before the block", () => {
    const b = S.blocks.find((x) => x.code === "P3")!;
    expect(canCancel(TUE, b, localToInstant(TUE, "07:55", DEFAULT_SETTINGS), DEFAULT_SETTINGS)).toBe(true);
    expect(canCancel(TUE, b, localToInstant(TUE, "08:00", DEFAULT_SETTINGS), DEFAULT_SETTINGS)).toBe(false);
  });

  it("T10 calendar drift is reported, not resolved", () => {
    const busy = [{ staffId: "ram", start: localToInstant(TUE, "10:00", DEFAULT_SETTINGS), end: localToInstant(TUE, "11:00", DEFAULT_SETTINGS), title: "Parent meeting" }];
    const c = findConflicts(world({ holds: [hold("b1", "quantum", "ram")], busy }));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ bookingId: "b1", eventTitle: "Parent meeting" });
  });
});
