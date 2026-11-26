import { NextResponse } from "next/server";
import { seeOther } from "@/lib/server/util";
import { getDb } from "@/lib/server/db";
import { setSessionCookie, signInByEmail, currentActor, makeToken } from "@/lib/server/auth";
import { SignInInput } from "@/lib/shared/schemas";

/** POST /api/v1/session: placeholder sign-in by staff email (replaced by SSO). Accepts a form or JSON. */
export async function POST(req: Request) {
  const isForm = (req.headers.get("content-type") ?? "").includes("form");
  const { next, client, ...raw } = (isForm ? Object.fromEntries((await req.formData()).entries()) : await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Only same-site paths, so the sign-in form cannot be used as an open redirect.
  const safeNext = typeof next === "string" && /^\/(?![/\\])[\w\-/?=&.]*$/.test(next) ? next : null;
  const parsed = SignInInput.safeParse(raw);
  const fail = (message: string, status: number) =>
    isForm
      ? seeOther(`/signin?error=${encodeURIComponent(message)}${safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""}`)
      : NextResponse.json({ error: { code: "denied", message } }, { status });
  if (!parsed.success) return fail("Enter a valid email address.", 422);
  const r = await signInByEmail(await getDb(), parsed.data.email);
  if (!r.ok) return fail(r.message, 403);
  // Phone app (Release 2): a signed bearer token instead of a cookie. Same placeholder
  // sign-in as the web, so the same rule applies: do not ship the app before school SSO.
  if (!isForm && client === "app") return NextResponse.json({ actor: r.actor, token: makeToken(r.actor.id, 30) });
  await setSessionCookie(r.actor.id);
  return isForm ? seeOther(safeNext ?? (r.actor.role === "incharge" ? "/incharge" : "/")) : NextResponse.json({ actor: r.actor });
}

export async function GET() {
  const actor = await currentActor();
  return NextResponse.json({ actor });
}
