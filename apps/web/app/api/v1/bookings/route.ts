import { NextResponse } from "next/server";
import { handler } from "@/lib/server/api";
import { createBooking, listBookings } from "@/lib/server/bookings";
import { BookingInput } from "@/lib/shared/schemas";

/** GET /api/v1/bookings: the signed-in teacher's bookings (admins: ?all=1). */
export const GET = handler({}, async ({ db, actor, req }) => {
  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1" && (actor.role === "admin" || actor.role === "viewer");
  const bookings = await listBookings(db, { teacherId: all ? undefined : actor.id, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  return { bookings };
});

/** POST /api/v1/bookings: create. 201 on success, 409 with reason and alternatives when blocked. */
export const POST = handler({ schema: BookingInput, roles: ["teacher", "incharge", "admin"] }, async ({ db, actor, body }) => {
  const r = await createBooking(db, actor, body);
  return NextResponse.json(r, { status: r.ok ? 201 : 409 });
});
