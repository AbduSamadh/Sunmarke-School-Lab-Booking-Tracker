import { handler } from "@/lib/server/api";
import { ResolveIssueInput } from "@/lib/shared/schemas";
import { resolveIssue } from "@/lib/server/release11";

export const POST = handler({ schema: ResolveIssueInput, roles: ["incharge", "admin"] }, async ({ db, actor, body, params }) => {
  await resolveIssue(db, actor, params.id, body.note);
  return { ok: true };
});
