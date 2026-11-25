import { handler } from "@/lib/server/api";
import { cancelBooking } from "@/lib/server/bookings";
import { CancelInput } from "@/lib/shared/schemas";

export const POST = handler({ schema: CancelInput }, async ({ db, actor, body, params }) => ({ booking: await cancelBooking(db, actor, params.id, { undo: body.undo }) }));
