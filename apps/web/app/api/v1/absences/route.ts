import { handler } from "@/lib/server/api";
import { addAbsence } from "@/lib/server/release11";
import { AbsenceInput } from "@/lib/shared/schemas";

/** POST /api/v1/absences: in-charge leave; affected bookings are covered or flagged. */
export const POST = handler({ schema: AbsenceInput, roles: ["incharge", "admin"] }, async ({ db, actor, body }) =>
  addAbsence(db, actor, { staffId: body.staffId, dateFrom: body.dateFrom, dateTo: body.dateTo || body.dateFrom, blockCodes: body.blockCodes?.length ? body.blockCodes : null, reason: body.reason }),
);
