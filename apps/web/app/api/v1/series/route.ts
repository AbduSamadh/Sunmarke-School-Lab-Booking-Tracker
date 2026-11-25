import { NextResponse } from "next/server";
import { handler } from "@/lib/server/api";
import { planSeries } from "@/lib/server/release11";
import { SeriesInput } from "@/lib/shared/schemas";

/** POST /api/v1/series: preview (default) or create a weekly series. */
export const POST = handler({ schema: SeriesInput, roles: ["teacher", "incharge", "admin"] }, async ({ db, actor, body }) => {
  const r = await planSeries(db, actor, body);
  return NextResponse.json(r, { status: body.preview === false ? 201 : 200 });
});
