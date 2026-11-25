import { handler } from "@/lib/server/api";
import { joinWaitlist } from "@/lib/server/bookings";
import { WaitlistInput } from "@/lib/shared/schemas";

export const POST = handler({ schema: WaitlistInput, roles: ["teacher", "incharge", "admin"] }, async ({ db, actor, body }) => joinWaitlist(db, actor, body));
