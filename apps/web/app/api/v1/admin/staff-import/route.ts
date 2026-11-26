import { handler } from "@/lib/server/api";
import { StaffImportInput } from "@/lib/shared/schemas";
import { importStaffCsv } from "@/lib/server/staffImport";

export const POST = handler({ schema: StaffImportInput, roles: ["admin"] }, async ({ db, actor, body }) =>
  importStaffCsv(db, actor.id, body.csv),
);
