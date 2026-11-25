/**
 * The demo's world: the same labs, in-charges, timetable and rules as the real app
 * (apps/web/lib/server/seed.ts), kept in the browser. Nothing is sent anywhere.
 */
import { DEFAULT_SETTINGS, standardTimetable, type InchargeAssignment, type Resource, type TimetabledLesson } from "@sunmarke/rules";

export type Role = "teacher" | "incharge" | "admin" | "viewer";
export interface Person { id: string; name: string; role: Role; department: string; email: string }

export const PEOPLE: Person[] = [
  { id: "t-sara", name: "Sara Khan", role: "teacher", department: "Science", email: "sara.khan@sunmarke.example" },
  { id: "t-omar", name: "Omar Haddad", role: "teacher", department: "Computing", email: "omar.haddad@sunmarke.example" },
  { id: "t-priya", name: "Priya Nair", role: "teacher", department: "Primary", email: "priya.nair@sunmarke.example" },
  { id: "t-lucy", name: "Lucy Evans", role: "teacher", department: "Maths", email: "lucy.evans@sunmarke.example" },
  { id: "t-james", name: "James Carter", role: "teacher", department: "Design Technology", email: "james.carter@sunmarke.example" },
  { id: "t-mariam", name: "Mariam Saeed", role: "teacher", department: "Humanities", email: "mariam.saeed@sunmarke.example" },
  { id: "ram", name: "Ram", role: "incharge", department: "Labs", email: "ram@sunmarke.example" },
  { id: "abdul", name: "Abdul", role: "incharge", department: "Labs", email: "abdul@sunmarke.example" },
  { id: "nael", name: "Nael", role: "incharge", department: "Labs", email: "nael@sunmarke.example" },
  { id: "abd", name: "Abd", role: "admin", department: "Labs", email: "abd@sunmarke.example" },
  { id: "sreejit", name: "Dr. Sreejit", role: "viewer", department: "SLT", email: "sreejit@sunmarke.example" },
  { id: "principal", name: "Principal", role: "viewer", department: "Principal", email: "principal@sunmarke.example" },
  { id: "bod", name: "Board of Directors", role: "viewer", department: "BOD", email: "bod@sunmarke.example" },
  { id: "neil", name: "Dr. Neil", role: "viewer", department: "Leadership", email: "neil@sunmarke.example" },
];

export interface Lab extends Resource { colour: string; location: string; capacity: number | null }
export const LABS: Lab[] = [
  { id: "quantum", name: "Quantum Lab", type: "room", units: 1, active: true, colour: "quantum", location: "Senior block", capacity: 28 },
  { id: "carts", name: "AI Carts", type: "cart_pool", units: 10, active: true, colour: "carts", location: "Teacher's classroom", capacity: null },
  { id: "dollarx", name: "DollarX Lab", type: "room", units: 1, active: true, colour: "dollarx", location: "Senior block", capacity: 28 },
  { id: "xreal", name: "XReal Lab", type: "room", units: 1, active: true, colour: "xreal", location: "Senior block", capacity: 24 },
  { id: "strike", name: "Strike Lab", type: "room", units: 1, active: true, colour: "strike", location: "Senior block", capacity: 28 },
];

/** In-charge order per lab: Nael works Quantum and the AI Carts with Ram, and steps in for the other labs. */
const ORDER: Record<string, string[]> = {
  quantum: ["ram", "nael", "abdul"], carts: ["ram", "nael", "abdul"], dollarx: ["abdul", "ram", "nael"], xreal: ["abdul", "ram", "nael"], strike: ["abdul", "ram", "nael"],
};
export const ASSIGNMENTS: InchargeAssignment[] = LABS.flatMap((l) => ORDER[l.id].map((staffId, i) => ({ resourceId: l.id, staffId, priority: i + 1 })));

/** Sample weekly ICT timetable in the hybrid labs (same as apps/web seed). Weekday 1 = Monday. */
const ICT_PERIODS: Record<string, Record<number, string[]>> = {
  strike: { 1: ["P1", "P2", "P5"], 2: ["P1", "P2", "P6"], 3: ["P3", "P4", "P7"], 4: ["P2", "P3", "P6"], 5: ["P1", "P4"] },
  xreal: { 1: ["P3", "P4", "P7"], 2: ["P3", "P5", "P7"], 3: ["P1", "P5", "P6"], 4: ["P1", "P4", "P7"], 5: ["P2", "P5"] },
  dollarx: { 1: ["P2", "P6"], 2: ["P2", "P3", "P7"], 3: ["P4", "P5"], 4: ["P3", "P6", "P7"], 5: ["P1", "P3", "P6"] },
};
export const LESSONS: TimetabledLesson[] = Object.entries(ICT_PERIODS).flatMap(([resourceId, days], li) =>
  Object.entries(days).flatMap(([wd, codes]) =>
    codes.map((blockCode, i) => {
      const n = li * 7 + Number(wd) * 3 + i;
      return { id: `ict-${resourceId}-${wd}-${blockCode}`, resourceId, weekday: Number(wd), blockCode, label: `ICT Y${7 + (n % 5)} ${"ABCD"[n % 4]}` };
    }),
  ),
);

export const TIMETABLE = standardTimetable();
export const SETTINGS = DEFAULT_SETTINGS;

/** Matched to KS3 (same as apps/web seed). */
export const SUBJECTS = ["Computing", "Science", "Maths", "English", "Design & Technology", "Art & Design", "Music", "Geography", "History", "Languages", "Citizenship", "PE", "Arabic", "Islamic Studies", "Moral, Social & Cultural Studies", "Other"];
export const YEARS = ["FS1", "FS2", ...Array.from({ length: 13 }, (_, i) => `Y${i + 1}`)];
export const SECTIONS = ["A", "B", "C", "D", "E", "F"];

export type Status = "confirmed" | "cancelled" | "completed" | "no_show";
export interface Booking {
  id: string; resourceId: string; date: string; blockId: string; teacherId: string;
  /** Lead first; AI Carts: one per cart. */
  inchargeIds: string[];
  subject: string; yearGroup: string; section: string; students: number; carts: number | null; classroom: string | null;
  status: Status; createdAt: string; rating: number | null;
}
export interface Message { id: string; to: string; subject: string; lines: string[]; at: string; bookingId: string | null }
export interface DemoState { version: 1; bookings: Booking[]; messages: Message[]; seq: number }

export const person = (id: string) => PEOPLE.find((p) => p.id === id)!;
export const lab = (id: string) => LABS.find((l) => l.id === id)!;
export const block = (id: string) => TIMETABLE.blocks.find((b) => b.id === id)!;
