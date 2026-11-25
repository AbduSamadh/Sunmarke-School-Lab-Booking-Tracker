import { handler } from "@/lib/server/api";
import { removeAbsence } from "@/lib/server/release11";

export const DELETE = handler({ roles: ["incharge", "admin"] }, async ({ db, actor, params }) => {
  await removeAbsence(db, actor, params.id);
  return { ok: true };
});
