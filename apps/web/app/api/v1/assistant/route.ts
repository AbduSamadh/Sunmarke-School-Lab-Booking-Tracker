import { handler } from "@/lib/server/api";
import { ask } from "@/lib/server/assistant";
import { AssistantInput } from "@/lib/shared/schemas";

/** POST /api/v1/assistant: the booking assistant. Read-only; it returns cards the person confirms. */
export const POST = handler({ schema: AssistantInput }, async ({ db, actor, body }) => ask(db, actor, body.message, body.draft ?? {}, body.history ?? []));
