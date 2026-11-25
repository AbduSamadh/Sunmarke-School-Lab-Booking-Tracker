import { handler } from "@/lib/server/api";
import { submitFeedback } from "@/lib/server/release11";
import { FeedbackInput } from "@/lib/shared/schemas";

export const POST = handler({ schema: FeedbackInput }, async ({ db, actor, body, params }) => submitFeedback(db, actor, params.id, body));
