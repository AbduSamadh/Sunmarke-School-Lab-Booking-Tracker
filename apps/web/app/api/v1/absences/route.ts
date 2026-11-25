import { z } from "zod";
import { handler } from "@/lib/server/api";
import { addAbsence } from "@/lib/server/release11";

const Input = z
  .object({
    staffId: z.string().min(1).max(40),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    blockCodes: z.array(z.string().max(20)).max(10).optional(),
    reason: z.string().trim().max(120).default(""),
  })
  .strict();

/** POST /api/v1/absences: in-charge leave; affected bookings are covered or flagged. */
export const POST = handler({ schema: Input, roles: ["incharge", "admin"] }, async ({ db, actor, body }) =>
  addAbsence(db, actor, { staffId: body.staffId, dateFrom: body.dateFrom, dateTo: body.dateTo || body.dateFrom, blockCodes: body.blockCodes?.length ? body.blockCodes : null, reason: body.reason }),
);
