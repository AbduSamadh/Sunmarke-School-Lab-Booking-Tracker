import type { Block, Timetable } from "./types";

/**
 * Standard timetable from the build plan (Asia/Dubai, Mon–Fri).
 * D1 assumption: the listed clock times (55-minute blocks) are right, not "40 mins".
 * D2 assumption: Friday runs the standard day until an admin adds a Friday timetable.
 */
export const STANDARD_BLOCKS: Omit<Block, "id">[] = [
  { code: "P1", start: "07:50", end: "08:45", bookable: true },
  { code: "P2", start: "08:45", end: "09:40", bookable: true },
  { code: "Break", start: "09:40", end: "09:55", bookable: false },
  { code: "P3", start: "09:55", end: "10:50", bookable: true },
  { code: "P4", start: "10:50", end: "11:45", bookable: true },
  { code: "P5", start: "11:45", end: "12:40", bookable: true },
  { code: "Lunch", start: "12:40", end: "13:30", bookable: false },
  { code: "P6", start: "13:30", end: "14:25", bookable: true },
  { code: "P7", start: "14:25", end: "15:20", bookable: true },
];

export function standardTimetable(id = "tt-standard"): Timetable {
  return {
    id,
    name: "Standard",
    validFrom: null,
    validTo: null,
    weekdays: [1, 2, 3, 4, 5],
    priority: 0,
    blocks: STANDARD_BLOCKS.map((b) => ({ ...b, id: `${id}-${b.code}` })),
  };
}
