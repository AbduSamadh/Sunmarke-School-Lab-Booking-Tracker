/** Release 1.1 rules: fair-use quota, waitlist holds, leave and cover, recurrence. */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluate, findCover, canCover, localToInstant, recurringDates, standardTimetable, weekRange, type WorldState } from "../src";

const TUE = "2026-12-08";
const NOW = localToInstant("2026-11-30", "08:00", DEFAULT_SETTINGS);
const S = standardTimetable();
const P = (c: string) => `${S.id}-${c}`;
const world = (over: Partial<WorldState> = {}): WorldState => ({
  timetables: [S],
  resources: [
    { id: "quantum", name: "Quantum Lab", type: "room", units: 1, active: true },
    { id: "carts", name: "AI Carts", type: "cart_pool", units: 10, active: true },
    { id: "strike", name: "Strike Lab", type: "room", units: 1, active: true },
  ],
  assignments: [
    { resourceId: "quantum", staffId: "ram", priority: 1 },
    { resourceId: "quantum", staffId: "abdul", priority: 2 },
    { resourceId: "carts", staffId: "ram", priority: 1 },
    { resourceId: "carts", staffId: "abdul", priority: 2 },
    { resourceId: "strike", staffId: "abdul", priority: 1 },
    { resourceId: "strike", staffId: "ram", priority: 2 },
  ],
  staff: [{ id: "ram", name: "Ram" }, { id: "abdul", name: "Abdul" }],
  holds: [],
  blackouts: [],
  busy: [],
  settings: DEFAULT_SETTINGS,
  ...over,
});
const req = (extra: object = {}) => ({ resourceId: "quantum", date: TUE, blockIds: [P("P3")], now: NOW, teacherId: "t1", ...extra });

describe("fair-use quota", () => {
  const q = world({ settings: { ...DEFAULT_SETTINGS, quotaPerTeacherWeek: 3, quotaPerDeptWeek: 5 } });
  it("allows bookings under the limit and blocks at the limit", () => {
    expect(evaluate(q, req({ usage: { teacherWeek: 2, deptWeek: 0 } })).ok).toBe(true);
    expect(evaluate(q, req({ usage: { teacherWeek: 3, deptWeek: 0 } }))).toMatchObject({ code: "quota_reached" });
    expect(evaluate(q, req({ usage: { teacherWeek: 0, deptWeek: 5 } }))).toMatchObject({ code: "quota_reached", reason: expect.stringContaining("department") });
  });
  it("a double lesson counts as two blocks", () => {
    expect(evaluate(q, req({ blockIds: [P("P3"), P("P4")], usage: { teacherWeek: 2, deptWeek: 0 } }))).toMatchObject({ code: "quota_reached" });
  });
  it("0 means no limit", () => {
    expect(evaluate(world(), req({ usage: { teacherWeek: 99, deptWeek: 99 } })).ok).toBe(true);
  });
});

describe("waitlist hold", () => {
  const offer = { resourceId: "quantum", date: TUE, blockId: P("P3"), teacherId: "t2", units: 1, expiresAt: new Date(NOW.getTime() + 3600_000) };
  it("holds a freed room for the offered teacher only", () => {
    expect(evaluate(world({ offers: [offer] }), req())).toMatchObject({ code: "held_for_waitlist", canWaitlist: true });
    expect(evaluate(world({ offers: [offer] }), req({ teacherId: "t2" })).ok).toBe(true);
  });
  it("expired offers do not hold", () => {
    expect(evaluate(world({ offers: [{ ...offer, expiresAt: new Date(NOW.getTime() - 1) }] }), req()).ok).toBe(true);
  });
  it("cart offers hold only their units", () => {
    const w = world({ offers: [{ ...offer, resourceId: "carts", units: 8 }] });
    expect(evaluate(w, req({ resourceId: "carts", units: 2 })).ok).toBe(true);
    expect(evaluate(w, req({ resourceId: "carts", units: 3 }))).toMatchObject({ code: "not_enough_carts" });
  });
});

describe("leave and cover", () => {
  const leave = { id: "a1", staffId: "ram", dateFrom: TUE, dateTo: TUE, blockCodes: null, reason: "Training" };
  it("an in-charge on leave is skipped; the fallback covers", () => {
    expect(evaluate(world({ absences: [leave] }), req())).toMatchObject({ ok: true, inchargeId: "abdul", crossCover: true });
  });
  it("part-day leave only covers its blocks", () => {
    const w = world({ absences: [{ ...leave, blockCodes: ["P1"] }] });
    expect(evaluate(w, req())).toMatchObject({ inchargeId: "ram" });
    expect(evaluate(w, req({ blockIds: [P("P1")] }))).toMatchObject({ inchargeId: "abdul" });
  });
  it("findCover picks the other in-charge, or null when nobody is free", () => {
    const b = { id: "b1", resourceId: "quantum", date: TUE, blockIds: [P("P3")], inchargeId: "ram" };
    const hold = { bookingId: "b1", resourceId: "quantum", inchargeId: "ram", date: TUE, blockId: P("P3"), units: 1 };
    expect(findCover(world({ holds: [hold], absences: [leave] }), b)).toMatchObject({ staffId: "abdul" });
    const busy = { bookingId: "b2", resourceId: "strike", inchargeId: "abdul", date: TUE, blockId: P("P3"), units: 1 };
    expect(findCover(world({ holds: [hold, busy], absences: [leave] }), b)).toBeNull();
    expect(canCover(world({ holds: [hold, busy] }), "abdul", TUE, [P("P3")])).toMatchObject({ kind: "booking" });
  });
});

describe("recurrence helpers", () => {
  it("weekly dates within the range", () => {
    expect(recurringDates("2026-12-08", "2026-12-29")).toEqual(["2026-12-08", "2026-12-15", "2026-12-22", "2026-12-29"]);
    expect(recurringDates("2026-12-08", "2027-01-05", 2)).toEqual(["2026-12-08", "2026-12-22", "2027-01-05"]);
  });
  it("week range is Monday to Sunday", () => {
    expect(weekRange("2026-12-10")).toEqual({ from: "2026-12-07", to: "2026-12-13" });
  });
});
