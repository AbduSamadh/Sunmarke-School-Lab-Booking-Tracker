import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/server/db";
import { CAMPUS_COOKIE, currentActor } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";

/**
 * GET: the campuses this person can work in. POST (form or JSON): switch campus.
 * Only group admins and leadership with "all campuses" may switch; everyone else stays on their own.
 */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in first." } }, { status: 401 });
  const db = await getDb();
  const rows = await db.query<{ id: string; name: string; shortName: string }>(
    `SELECT id, name, short_name AS "shortName" FROM campuses WHERE active ${actor.allCampuses ? "" : "AND id = $1"} ORDER BY sort, name`,
    actor.allCampuses ? [] : [actor.homeCampusId],
  );
  return NextResponse.json({ current: actor.campusId, campuses: rows });
}

export async function POST(req: Request) {
  const isForm = (req.headers.get("content-type") ?? "").includes("form");
  const raw = (isForm ? Object.fromEntries((await req.formData()).entries()) : await req.json().catch(() => ({}))) as Record<string, unknown>;
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in first." } }, { status: 401 });
  const campusId = typeof raw.campusId === "string" ? raw.campusId : "";
  const back = typeof raw.back === "string" && /^\/(?![/\\])[\w\-/?=&.]*$/.test(raw.back) ? raw.back : "/";
  if (!actor.allCampuses) return isForm ? NextResponse.redirect(new URL(back, req.url), 303) : NextResponse.json({ error: { code: "forbidden", message: "You can only use your own campus." } }, { status: 403 });
  const db = await getDb();
  const ok = await db.query("SELECT 1 FROM campuses WHERE id = $1 AND active", [campusId]);
  if (!ok.length) return NextResponse.json({ error: { code: "invalid", message: "Unknown campus." } }, { status: 422 });
  (await cookies()).set(CAMPUS_COOKIE, campusId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 180 });
  await audit(db, { actorId: actor.id, action: "campus.switch", entity: "campus", entityId: campusId });
  return isForm ? NextResponse.redirect(new URL(back, req.url), 303) : NextResponse.json({ ok: true, current: campusId });
}
