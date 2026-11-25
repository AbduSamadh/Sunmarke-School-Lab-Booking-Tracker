import { handler } from "@/lib/server/api";
import { AppError } from "@/lib/server/bookings";

export const GET = handler({ roles: ["admin", "incharge"] }, async ({ db, params }) => {
  const r = await db.query<{ ics: string | null }>("SELECT ics FROM notifications WHERE id = $1", [params.id]);
  if (!r[0]?.ics) throw new AppError(404, "not_found", "No calendar file.");
  return new Response(r[0].ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="booking.ics"` } });
});
