import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/server/openapi";

/** GET /api/v1/openapi.json: the published API description (public, no data in it). */
export async function GET() {
  return NextResponse.json(openApiSpec(), { headers: { "cache-control": "public, max-age=300" } });
}
