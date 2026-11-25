import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { setSessionCookie, signInByEmail, currentActor } from "@/lib/server/auth";
import { SignInInput } from "@/lib/shared/schemas";

/** POST /api/v1/session: placeholder sign-in by staff email (replaced by SSO). Accepts a form or JSON. */
export async function POST(req: Request) {
  const isForm = (req.headers.get("content-type") ?? "").includes("form");
  const raw = isForm ? Object.fromEntries((await req.formData()).entries()) : await req.json().catch(() => ({}));
  const parsed = SignInInput.safeParse(raw);
  const fail = (message: string, status: number) =>
    isForm
      ? NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(message)}`, req.url), 303)
      : NextResponse.json({ error: { code: "denied", message } }, { status });
  if (!parsed.success) return fail("Enter a valid email address.", 422);
  const r = await signInByEmail(await getDb(), parsed.data.email);
  if (!r.ok) return fail(r.message, 403);
  await setSessionCookie(r.actor.id);
  return isForm ? NextResponse.redirect(new URL(r.actor.role === "incharge" ? "/incharge" : "/", req.url), 303) : NextResponse.json({ actor: r.actor });
}

export async function GET() {
  const actor = await currentActor();
  return NextResponse.json({ actor });
}
