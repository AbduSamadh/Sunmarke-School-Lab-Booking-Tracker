import { z } from "zod";
import { handler } from "@/lib/server/api";
import { checkIn } from "@/lib/server/release11";

export const POST = handler({ schema: z.object({ code: z.string().min(4).max(40) }).strict() }, async ({ db, actor, body }) => checkIn(db, actor, body.code));
