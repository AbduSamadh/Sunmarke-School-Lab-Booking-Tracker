import { handler } from "@/lib/server/api";
import { alternatives, evaluate } from "@sunmarke/rules";
import { loadWorld } from "@/lib/server/world";
import { now } from "@/lib/server/util";

/** GET /api/v1/alternatives?resourceId&date&blockId&units: why a slot is blocked and what is free instead. */
export const GET = handler({}, async ({ db, req }) => {
  const u = new URL(req.url);
  const resourceId = u.searchParams.get("resourceId") ?? "";
  const date = u.searchParams.get("date") ?? "";
  const blockId = u.searchParams.get("blockId") ?? "";
  const units = Number(u.searchParams.get("units") ?? 1) || 1;
  const world = await loadWorld(db, date, date);
  const req2 = { resourceId, date, blockIds: [blockId], units, now: now() };
  const ev = evaluate(world, req2);
  return { evaluation: ev, alternatives: alternatives(world, req2, 4) };
});
