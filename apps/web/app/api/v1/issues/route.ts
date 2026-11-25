import { handler } from "@/lib/server/api";
import { listIssues, reportIssue } from "@/lib/server/release11";
import { IssueInput } from "@/lib/shared/schemas";

export const GET = handler({ roles: ["incharge", "admin", "viewer"] }, async ({ db, req }) => ({
  issues: await listIssues(db, new URL(req.url).searchParams.get("status") === "all" ? "all" : "open"),
}));
export const POST = handler({ schema: IssueInput, roles: ["teacher", "incharge", "admin"] }, async ({ db, actor, body }) => reportIssue(db, actor, body));
