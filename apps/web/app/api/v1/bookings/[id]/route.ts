import { handler } from "@/lib/server/api";
import { AppError, getBookingDetail, updateBooking } from "@/lib/server/bookings";
import { BookingPatch } from "@/lib/shared/schemas";

export const GET = handler({}, async ({ db, actor, params }) => {
  const b = await getBookingDetail(db, params.id);
  if (!b) throw new AppError(404, "not_found", "Booking not found.");
  if (actor.role === "teacher" && b.teacherId !== actor.id) throw new AppError(403, "forbidden", "Not your booking.");
  return { booking: b };
});

export const PATCH = handler({ schema: BookingPatch }, async ({ db, actor, body, params }) => ({ booking: await updateBooking(db, actor, params.id, body) }));
