import { handler } from "@/lib/server/api";
import { reassignBooking } from "@/lib/server/release11";
import { ReassignInput } from "@/lib/shared/schemas";

export const POST = handler({ schema: ReassignInput, roles: ["admin"] }, async ({ db, actor, body, params }) => ({
  booking: await reassignBooking(db, actor, params.id, body.staffId, body.reason),
}));
