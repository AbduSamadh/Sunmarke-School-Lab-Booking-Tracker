import { handler } from "@/lib/server/api";
import { declineBooking } from "@/lib/server/bookings";
import { DeclineInput } from "@/lib/shared/schemas";

export const POST = handler({ schema: DeclineInput, roles: ["incharge", "admin"] }, async ({ db, actor, body, params }) => ({
  booking: await declineBooking(db, actor, params.id, body.reason),
}));
