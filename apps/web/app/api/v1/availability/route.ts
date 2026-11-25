import { z } from "zod";
import { handler } from "@/lib/server/api";
import { getGrid } from "@/lib/server/grid";
import { addDays } from "@sunmarke/rules";

const Q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** GET /api/v1/availability?from=YYYY-MM-DD&to=YYYY-MM-DD (max 14 days). */
export const GET = handler({}, async ({ db, actor, req }) => {
  const u = new URL(req.url);
  const q = Q.parse({ from: u.searchParams.get("from"), to: u.searchParams.get("to") ?? undefined });
  const to = q.to && q.to <= addDays(q.from, 13) ? q.to : q.from;
  return getGrid(db, actor, q.from, to);
});
