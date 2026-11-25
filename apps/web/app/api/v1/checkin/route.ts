import { handler } from "@/lib/server/api";
import { checkIn } from "@/lib/server/release11";
import { CheckinInput } from "@/lib/shared/schemas";

export const POST = handler({ schema: CheckinInput }, async ({ db, actor, body }) => checkIn(db, actor, body.code));
