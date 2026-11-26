/** The /api/v1 shapes the app uses (mirrors apps/web/lib/server/grid.ts and bookings.ts). */
export type Role = "teacher" | "incharge" | "admin" | "viewer";
export interface Actor { id: string; name: string; email: string; role: Role; department: string; campusId?: string }

export type CellView =
  | { kind: "closed"; label: string }
  | { kind: "free"; inchargeName: string; crossCover: boolean; unitsLeft: number; unitsTotal: number; existing: string[]; override?: boolean }
  | { kind: "booked"; label: string; mine: boolean; bookingId: string }
  | { kind: "unavailable"; reason: string; suggestion?: string; canWaitlist: boolean; existing: string[]; mineId?: string };

export interface GridBlock { id: string; code: string; start: string; end: string; bookable: boolean }
export interface GridDay { date: string; timetableName: string | null; blocks: GridBlock[]; cells: Record<string, Record<string, CellView>> }
export interface GridResource { id: string; name: string; type: "room" | "cart_pool"; units: number; colour: string; location: string; capacity: number | null }
export interface GridData { days: GridDay[]; resources: GridResource[]; calendarChecked: boolean }

export interface Booking {
  id: string; resourceId: string; resourceName: string; resourceColour: string; date: string; blockLabel: string; timeLabel: string;
  teacherName: string; inchargeName: string; classLabel: string; subject: string; studentCount: number; cartCount: number | null;
  classroom: string | null; status: "confirmed" | "cancelled" | "completed" | "no_show" | "declined"; start: string; end: string;
}
