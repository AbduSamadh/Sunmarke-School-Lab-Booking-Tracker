import type { Db } from "@sunmarke/db";
import type { BusyInterval } from "@sunmarke/rules";
import { newId } from "./util";

/**
 * Calendar integration boundary. The rules never talk to Google or Microsoft;
 * they receive BusyInterval[] from whichever provider is configured.
 *
 * Built so far: MockCalendarAdapter (events stored in the app database, so the
 * whole flow can be demoed and tested before Fortes IT grants access).
 * Next: GoogleCalendarAdapter (freebusy.query + events.insert with the booking id
 * in extendedProperties) and MicrosoftGraphAdapter (getSchedule + /users/{id}/events).
 * Neither is connected until abd confirms D3 and IT grants access.
 */
export interface CalendarProvider {
  readonly name: string;
  getBusy(staff: { id: string; email: string }[], from: Date, to: Date): Promise<BusyInterval[]>;
  /** Idempotent by (bookingId, staffId): calling twice updates, never duplicates. */
  upsertBookingEvent(ev: {
    bookingId: string;
    staffId: string;
    start: Date;
    end: Date;
    title: string;
  }): Promise<void>;
  deleteBookingEvents(bookingId: string): Promise<void>;
}

export class CalendarUnavailableError extends Error {}

export class MockCalendarAdapter implements CalendarProvider {
  readonly name = "mock";
  constructor(private db: Db) {}

  private async assertUp() {
    const r = await this.db.query<{ value: unknown }>("SELECT value FROM settings WHERE key = 'mock_calendar_down'");
    if (r[0]?.value === true) throw new CalendarUnavailableError("Calendar API unavailable (simulated outage)");
  }

  async getBusy(staff: { id: string; email: string }[], from: Date, to: Date): Promise<BusyInterval[]> {
    await this.assertUp();
    if (staff.length === 0) return [];
    const rows = await this.db.query<{ staff_id: string; start_at: Date; end_at: Date; title: string; booking_id: string | null }>(
      "SELECT staff_id, start_at, end_at, title, booking_id FROM calendar_events WHERE active AND staff_id = ANY($1) AND start_at < $3 AND end_at > $2",
      [staff.map((s) => s.id), from.toISOString(), to.toISOString()],
    );
    return rows.map((r) => ({ staffId: r.staff_id, start: new Date(r.start_at), end: new Date(r.end_at), title: r.title, bookingId: r.booking_id }));
  }

  async upsertBookingEvent(ev: { bookingId: string; staffId: string; start: Date; end: Date; title: string }) {
    await this.assertUp();
    const existing = await this.db.query<{ id: string }>(
      "SELECT id FROM calendar_events WHERE active AND booking_id = $1 AND staff_id = $2",
      [ev.bookingId, ev.staffId],
    );
    if (existing.length) {
      await this.db.query("UPDATE calendar_events SET start_at = $2, end_at = $3, title = $4 WHERE id = $1", [
        existing[0].id,
        ev.start.toISOString(),
        ev.end.toISOString(),
        ev.title,
      ]);
    } else {
      await this.db.query(
        "INSERT INTO calendar_events (id, staff_id, start_at, end_at, title, booking_id, source) VALUES ($1,$2,$3,$4,$5,$6,'app')",
        [newId("cal"), ev.staffId, ev.start.toISOString(), ev.end.toISOString(), ev.title, ev.bookingId],
      );
    }
  }

  async deleteBookingEvents(bookingId: string) {
    await this.assertUp();
    await this.db.query("UPDATE calendar_events SET active = false WHERE booking_id = $1", [bookingId]);
  }
}

export function getCalendar(db: Db): CalendarProvider {
  // Provider selection will read CALENDAR_PROVIDER=google|microsoft once D3 is decided.
  return new MockCalendarAdapter(db);
}

/** Demo helper: add an outside meeting to an in-charge's mock calendar (T6, T10). */
export async function addExternalEvent(db: Db, staffId: string, start: Date, end: Date, title: string) {
  await db.query(
    "INSERT INTO calendar_events (id, staff_id, start_at, end_at, title, source) VALUES ($1,$2,$3,$4,$5,'external')",
    [newId("cal"), staffId, start.toISOString(), end.toISOString(), title],
  );
}
