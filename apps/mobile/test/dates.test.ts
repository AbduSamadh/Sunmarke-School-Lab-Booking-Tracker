import { describe, expect, it } from "vitest";
import { addDays, fmtShort, isoWeekday, mondayOf, schoolWeek, today } from "../src/dates";

describe("school dates", () => {
  it("uses Dubai time for today", () => {
    expect(today(new Date("2026-11-30T21:00:00Z"))).toBe("2026-12-01"); // 01:00 Tue in Dubai
  });
  it("works out weeks", () => {
    expect(isoWeekday("2026-12-08")).toBe(2);
    expect(mondayOf("2026-12-10")).toBe("2026-12-07");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(schoolWeek("2026-12-12")).toEqual(["2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"]); // Saturday rolls on
    expect(fmtShort("2026-12-08")).toBe("Tue 8 Dec");
  });
});
