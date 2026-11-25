import { z } from "zod";
import { handler } from "@/lib/server/api";
import { resolveIssue } from "@/lib/server/release11";

export const POST = handler({ schema: z.object({ note: z.string().trim().max(300).default("") }).strict(), roles: ["incharge", "admin"] }, async ({ db, actor, body, params }) => {
  await resolveIssue(db, actor, params.id, body.note);
  return { ok: true };
});
