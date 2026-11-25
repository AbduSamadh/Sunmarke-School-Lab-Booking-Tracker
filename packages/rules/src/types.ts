/**
 * Domain types shared by the rules engine, the API and (later) the mobile app.
 * Dates are ISO calendar dates ("2026-12-01") in school-local time.
 * Times are "HH:MM" 24 h in school-local time.
 */

export type ISODate = string;
export type HHMM = string;

export type Role = "teacher" | "incharge" | "admin" | "viewer";

export interface Block {
  id: string;
  code: string; // P1..P7, Break, Lunch
  start: HHMM;
  end: HHMM;
  bookable: boolean;
}

export interface Timetable {
  id: string;
  name: string; // Standard, Friday, Ramadan
  validFrom: ISODate | null; // null = open-ended
  validTo: ISODate | null;
  weekdays: number[]; // ISO weekdays 1=Mon .. 7=Sun
  /** Higher wins when two timetables cover the same date. Standard = 0. */
  priority: number;
  blocks: Block[];
  /** Release 2 multi-campus: the campus this timetable belongs to. Unset = every campus. */
  campusId?: string;
}

export type ResourceType = "room" | "cart_pool";

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  units: number; // 1 for rooms, 10 for the AI Cart pool
  active: boolean;
  /** Release 2 multi-campus. Unset = the single-campus behaviour. */
  campusId?: string;
}

export interface InchargeAssignment {
  resourceId: string;
  staffId: string;
  priority: number; // 1 = primary, 2 = fallback, 3 = ...
}

export interface Staff {
  id: string;
  name: string;
}

/** One active hold: one booking in one block. */
export interface SlotHold {
  bookingId: string;
  resourceId: string;
  inchargeId: string;
  date: ISODate;
  blockId: string;
  units: number; // carts for cart bookings, 1 for rooms
}

export type BlackoutReason = "holiday" | "exam" | "maintenance" | "training" | "other";

export interface Blackout {
  id: string;
  resourceId: string | null; // null = every resource
  dateFrom: ISODate;
  dateTo: ISODate;
  blockCodes: string[] | null; // null = whole day
  reason: BlackoutReason;
  note?: string;
  /** For a whole-school blackout (resourceId null): the campus it closes. Unset = every campus. */
  campusId?: string | null;
}

/** A busy interval from an in-charge's own calendar (meetings, leave...). */
export interface BusyInterval {
  staffId: string;
  start: Date;
  end: Date;
  /** Set when the event was written by this app for a booking. */
  bookingId?: string | null;
  title?: string;
}

export interface RuleSettings {
  /** Minutes east of UTC for the school. Asia/Dubai = +240, no DST. */
  utcOffsetMinutes: number;
  minLeadHours: number; // D6: 24
  maxLeadDays: number; // D6: 28
  cancelCutoffHours: number; // D6: 2
  /** abd, 25 Nov: at most 3 carts, because each cart goes out with its own lab in-charge. */
  maxCartsPerBooking: number;
  /** Fair-use quota: most lab blocks one teacher may hold in a school week. 0 = no limit. */
  quotaPerTeacherWeek: number;
  /** Fair-use quota: most lab blocks one department may hold in a school week. 0 = no limit. */
  quotaPerDeptWeek: number;
  /** Hours a waitlisted teacher has to take a freed slot before it goes to the next. */
  waitlistHoldHours: number;
  /** Minutes after the start with no check-in before a lab booking is marked no-show. 0 = off. */
  autoNoShowMinutes: number;
  /** How far ahead a recurring series may book (about a term). */
  recurringMaxDays: number;
}

export const DEFAULT_SETTINGS: RuleSettings = {
  utcOffsetMinutes: 240,
  minLeadHours: 24,
  maxLeadDays: 28,
  cancelCutoffHours: 2,
  maxCartsPerBooking: 3,
  quotaPerTeacherWeek: 0,
  quotaPerDeptWeek: 0,
  waitlistHoldHours: 2,
  autoNoShowMinutes: 10,
  recurringMaxDays: 120,
};

export interface WorldState {
  timetables: Timetable[];
  resources: Resource[];
  assignments: InchargeAssignment[];
  staff: Staff[];
  holds: SlotHold[];
  blackouts: Blackout[];
  busy: BusyInterval[];
  settings: RuleSettings;
  /** Freed slots held for a waitlisted teacher until expiresAt. */
  offers?: WaitlistOffer[];
  /** In-charge leave or absence (R1.1 leave and cover). */
  absences?: Absence[];
}

export interface WaitlistOffer {
  resourceId: string;
  date: ISODate;
  blockId: string;
  teacherId: string;
  units: number;
  expiresAt: Date;
}

export interface Absence {
  id: string;
  staffId: string;
  dateFrom: ISODate;
  dateTo: ISODate;
  blockCodes: string[] | null; // null = whole day
  reason: string;
}

/** Blocks already booked in the same school week, for the fair-use quota. */
export interface QuotaUsage {
  teacherWeek: number;
  deptWeek: number;
}

export interface BookingRequest {
  resourceId: string;
  date: ISODate;
  /** One or more consecutive bookable blocks (double lessons). */
  blockIds: string[];
  /** Carts requested; ignored for rooms. */
  units?: number;
  now: Date;
  /** Admin override of the booking window (R8). */
  overrideWindow?: boolean;
  /** When editing/rebooking, ignore this booking's own holds and calendar events. */
  ignoreBookingId?: string;
  /** Who the booking is for; needed for waitlist holds. */
  teacherId?: string;
  /** Current week usage; when given, the fair-use quota is enforced. */
  usage?: QuotaUsage;
  /** Recurring series may reach further ahead than single bookings (settings.recurringMaxDays). */
  recurring?: boolean;
}

export type BlockedCode =
  | "unknown_resource"
  | "no_timetable"
  | "not_bookable_block"
  | "blocks_not_consecutive"
  | "window_too_soon"
  | "window_too_far"
  | "in_past"
  | "blackout"
  | "resource_booked"
  | "not_enough_carts"
  | "invalid_units"
  | "held_for_waitlist"
  | "quota_reached"
  | "no_incharge";

export interface Allocation {
  ok: true;
  inchargeId: string;
  inchargeName: string;
  crossCover: boolean; // true when the fallback covers
  unitsLeftAfter: number;
  /**
   * Everyone going with the booking, lead first. One for a lab; one per cart for
   * AI Carts (abd, 25 Nov: every cart is accompanied by its own in-charge).
   */
  inchargeIds: string[];
  inchargeNames: string[];
}

export interface Blocked {
  ok: false;
  code: BlockedCode;
  reason: string; // teacher-facing copy
  /** Optional next step, e.g. "Abdul is free at P4". */
  suggestion?: string;
  /** For resource_booked: the booking holding the slot. */
  heldBy?: string;
  canWaitlist: boolean;
}

export type Evaluation = Allocation | Blocked;
