/** Release 2 rules: several campuses, each with its own labs, in-charges, timetables and blackouts. */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, evaluate, alternatives, localToInstant, scopeToCampus, standardTimetable, timetableForDate, type Timetable, type WorldState } from "../src";

const TUE = "2026-12-08";
const NOW = localToInstant("2026-11-30", "08:00", DEFAULT_SETTINGS);
const A: Timetable = { ...standardTimetable(), campusId: "a" };
const B: Timetable = {
  id: "tt-b",
  name: "Campus B standard",
  validFrom: null,
  validTo: null,
  weekdays: [1, 2, 3, 4, 5],
  priority: 0,
  campusId: "b",
  blocks: [
    { id: "tt-b-P1", code: "P1", start: "08:00", end: "08:50", bookable: true },
    { id: "tt-b-P2", code: "P2", start: "08:50", end: "09:40", bookable: true },
  ],
};
const PA = (c: string) => `${A.id}-${c}`;
const world = (over: Partial<WorldState> = {}): WorldState => ({
  timetables: [A, B],
  resources: [
    { id: "quantum", name: "Quantum Lab", type: "room", units: 1, active: true, campusId: "a" },
    { id: "strike", name: "Strike Lab", type: "room", units: 1, active: true, campusId: "a" },
    { id: "b-lab", name: "Makers Lab", type: "room", units: 1, active: true, campusId: "b" },
  ],
  assignments: [
    { resourceId: "quantum", staffId: "ram", priority: 1 },
    { resourceId: "strike", staffId: "abdul", priority: 1 },
    { resourceId: "b-lab", staffId: "sara", priority: 1 },
  ],
  staff: [{ id: "ram", name: "Ram" }, { id: "abdul", name: "Abdul" }, { id: "sara", name: "Sara" }],
  holds: [],
  blackouts: [],
  busy: [],
  settings: DEFAULT_SETTINGS,
  ...over,
});

describe("multi-campus", () => {
  it("each lab uses its own campus timetable", () => {
    expect(evaluate(world(), { resourceId: "b-lab", date: TUE, blockIds: ["tt-b-P1"], now: NOW })).toMatchObject({ ok: true, inchargeId: "sara" });
    expect(evaluate(world(), { resourceId: "b-lab", date: TUE, blockIds: [PA("P3")], now: NOW })).toMatchObject({ code: "not_bookable_block" });
    expect(evaluate(world(), { resourceId: "quantum", date: TUE, blockIds: ["tt-b-P1"], now: NOW })).toMatchObject({ code: "not_bookable_block" });
  });
  it("a whole-school blackout closes only its own campus", () => {
    const bo = { id: "x", resourceId: null, dateFrom: TUE, dateTo: TUE, blockCodes: null, reason: "holiday" as const, campusId: "b" };
    expect(evaluate(world({ blackouts: [bo] }), { resourceId: "b-lab", date: TUE, blockIds: ["tt-b-P1"], now: NOW })).toMatchObject({ code: "blackout" });
    expect(evaluate(world({ blackouts: [bo] }), { resourceId: "quantum", date: TUE, blockIds: [PA("P3")], now: NOW }).ok).toBe(true);
  });
  it("a blackout with no campus still closes every campus (single-campus behaviour)", () => {
    const bo = { id: "x", resourceId: null, dateFrom: TUE, dateTo: TUE, blockCodes: null, reason: "holiday" as const };
    expect(evaluate(world({ blackouts: [bo] }), { resourceId: "b-lab", date: TUE, blockIds: ["tt-b-P1"], now: NOW })).toMatchObject({ code: "blackout" });
  });
  it("alternatives never suggest another campus", () => {
    const hold = { bookingId: "h", resourceId: "quantum", inchargeId: "ram", date: TUE, blockId: PA("P3"), units: 1 };
    const alts = alternatives(world({ holds: [hold] }), { resourceId: "quantum", date: TUE, blockIds: [PA("P3")], now: NOW }, 10);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((a) => a.resourceId !== "b-lab")).toBe(true);
  });
  it("scopeToCampus keeps only that campus", () => {
    const s = scopeToCampus(world(), "b");
    expect(s.resources.map((r) => r.id)).toEqual(["b-lab"]);
    expect(s.timetables.map((t) => t.id)).toEqual(["tt-b"]);
    expect(s.assignments.map((a) => a.staffId)).toEqual(["sara"]);
    expect(timetableForDate(world().timetables, TUE, "b")?.id).toBe("tt-b");
  });
  it("leaves single-campus worlds unchanged", () => {
    const w = world({ resources: world().resources.map(({ campusId, ...r }) => r) });
    expect(scopeToCampus(w, undefined)).toBe(w);
  });
});
