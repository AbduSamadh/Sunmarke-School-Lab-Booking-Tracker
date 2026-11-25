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
}

export type ResourceType = "room" | "cart_pool";

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  units: number; // 1 for rooms, 10 for the AI Cart pool
  active: boolean;
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
  maxCartsPerBooking: number; // D4: 10
}

export const DEFAULT_SETTINGS: RuleSettings = {
  utcOffsetMinutes: 240,
  minLeadHours: 24,
  maxLeadDays: 28,
  cancelCutoffHours: 2,
  maxCartsPerBooking: 10,
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
  | "no_incharge";

export interface Allocation {
  ok: true;
  inchargeId: string;
  inchargeName: string;
  crossCover: boolean; // true when the fallback covers
  unitsLeftAfter: number;
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
