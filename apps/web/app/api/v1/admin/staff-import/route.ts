import { z } from "zod";
import { handler } from "@/lib/server/api";
import { importStaffCsv } from "@/lib/server/staffImport";

export const POST = handler({ schema: z.object({ csv: z.string().max(500_000) }).strict(), roles: ["admin"] }, async ({ db, actor, body }) =>
  importStaffCsv(db, actor.id, body.csv),
);
