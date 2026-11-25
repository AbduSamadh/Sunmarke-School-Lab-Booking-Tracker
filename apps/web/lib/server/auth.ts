import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Db } from "@sunmarke/db";
import { getDb } from "./db";
import { audit } from "./audit";
import type { Actor } from "./bookings";

/**
 * PLACEHOLDER SIGN-IN (D3, D8). Staff sign in by work email, checked against the
 * staff list, so nobody outside the list gets in (T15). This is replaced by
 * Auth.js with Google Workspace / Microsoft Entra SSO once abd confirms which one
 * Fortes uses and IT registers the app. Do not deploy publicly as-is.
 */
const COOKIE = "slb_session";
const g = globalThis as unknown as { __slbSecret?: string };
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  g.__slbSecret ??= randomBytes(32).toString("hex");
  return g.__slbSecret;
}
function sign(v: string) {
  return createHmac("sha256", secret()).update(v).digest("base64url");
}
export function makeToken(staffId: string) {
  return `${staffId}.${sign(staffId)}`;
}
export function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const id = token.slice(0, i);
  const a = Buffer.from(token.slice(i + 1));
  const b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export async function actorById(db: Db, id: string | null): Promise<Actor | null> {
  if (!id) return null;
  const r = await db.query<Actor & { active: boolean }>("SELECT id, name, email, role, department, active FROM staff WHERE id = $1", [id]);
  return r[0]?.active ? { id: r[0].id, name: r[0].name, email: r[0].email, role: r[0].role, department: r[0].department } : null;
}

export async function signInByEmail(db: Db, email: string): Promise<{ ok: true; actor: Actor } | { ok: false; message: string }> {
  const r = await db.query<{ id: string; active: boolean }>("SELECT id, active FROM staff WHERE lower(email) = lower($1)", [email]);
  if (!r[0] || !r[0].active) {
    await audit(db, { actorId: null, action: "auth.denied", entity: "staff", after: { email } });
    return { ok: false, message: "This email is not on the Sunmarke staff list. Ask the lab admin (Abd) to add you." };
  }
  const actor = (await actorById(db, r[0].id))!;
  await audit(db, { actorId: actor.id, action: "auth.signin", entity: "staff", entityId: actor.id });
  return { ok: true, actor };
}

export async function setSessionCookie(staffId: string) {
  const c = await cookies();
  c.set(COOKIE, makeToken(staffId), { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 14 });
}
export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export async function currentActor(): Promise<Actor | null> {
  const c = await cookies();
  const id = readToken(c.get(COOKIE)?.value);
  return actorById(await getDb(), id);
}

/** Pages: redirect to sign-in, or to home if the role is not allowed. */
export async function requireActor(roles?: Actor["role"][]): Promise<Actor> {
  const a = await currentActor();
  if (!a) redirect("/signin");
  if (roles && !roles.includes(a.role)) redirect("/");
  return a;
}
