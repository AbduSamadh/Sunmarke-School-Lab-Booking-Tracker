import { z } from "zod";
import { handler } from "@/lib/server/api";
import { ask } from "@/lib/server/assistant";

const s = (n: number) => z.string().max(n).optional();
const Draft = z
  .object({
    resourceId: s(40), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), blockCodes: z.array(z.string().max(10)).max(3).optional(), double: z.boolean().optional(),
    inchargeId: s(40), forStaffId: s(40), subject: s(80), yearGroup: s(20), section: s(10), studentCount: z.number().int().min(1).max(60).optional(),
    cartCount: z.number().int().min(1).max(50).optional(), classroom: s(40), pending: z.enum(["book", "waitlist"]).optional(),
  })
  .strip();
const History = z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(12);
const Input = z.object({ message: z.string().trim().min(1).max(500), draft: Draft.optional(), history: History.optional() }).strict();

/** POST /api/v1/assistant: the booking assistant. Read-only; it returns cards the person confirms. */
export const POST = handler({ schema: Input }, async ({ db, actor, body }) => ask(db, actor, body.message, body.draft ?? {}, body.history ?? []));
