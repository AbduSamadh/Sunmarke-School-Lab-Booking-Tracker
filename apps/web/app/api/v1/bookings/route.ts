import { NextResponse } from "next/server";
import { handler } from "@/lib/server/api";
import { createBooking, listBookings } from "@/lib/server/bookings";
import { BookingInput } from "@/lib/shared/schemas";

/** GET /api/v1/bookings: the signed-in teacher's bookings (admins: ?all=1; in-charges: ?as=incharge for the sessions they run). */
export const GET = handler({}, async ({ db, actor, req }) => {
  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1" && (actor.role === "admin" || actor.role === "viewer");
  const asIncharge = url.searchParams.get("as") === "incharge" && (actor.role === "incharge" || actor.role === "admin");
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  if (asIncharge) {
    const rows = await listBookings(db, { from, to, status: ["confirmed", "completed", "no_show"] });
    return { bookings: rows.filter((b) => b.staffIds.includes(actor.id)) };
  }
  const bookings = await listBookings(db, { teacherId: all ? undefined : actor.id, from, to });
  return { bookings };
});

/** POST /api/v1/bookings: create. 201 on success, 409 with reason and alternatives when blocked. */
export const POST = handler({ schema: BookingInput, roles: ["teacher", "incharge", "admin"] }, async ({ db, actor, body }) => {
  const r = await createBooking(db, actor, body);
  return NextResponse.json(r, { status: r.ok ? 201 : 409 });
});
