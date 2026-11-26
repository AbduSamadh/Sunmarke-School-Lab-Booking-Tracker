/**
 * Access control for every API route in the published description:
 * signed out gets 401 (unless public), and each role outside a route's list gets 403.
 * Bodies are deliberately empty: the role check runs before validation, so a 422
 * here means the role got through.
 */
import { expect, request, test } from "@playwright/test";
import { OPS } from "../lib/server/openapi";
import { PEOPLE, signIn, type RoleName } from "./helpers";

const ROLES = Object.keys(PEOPLE) as RoleName[];
const url = (p: string) => `/api/v1${p.replace("{id}", "does-not-exist")}`;
const call = (ctx: Awaited<ReturnType<typeof request.newContext>>, method: string, p: string) =>
  ctx.fetch(url(p), { method: method.toUpperCase(), data: method === "get" ? undefined : {}, maxRedirects: 0 });

test("signed out: every private route answers 401", async ({ baseURL }) => {
  const ctx = await request.newContext({ baseURL });
  const wrong: string[] = [];
  for (const o of OPS.filter((o) => !o.public)) {
    const r = await call(ctx, o.method, o.path);
    if (r.status() !== 401) wrong.push(`${o.method.toUpperCase()} ${o.path} → ${r.status()}`);
  }
  expect(wrong).toEqual([]);
});

for (const role of ROLES) {
  test(`${role}: routes outside the role answer 403, routes inside do not`, async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL });
    await signIn(ctx, role);
    const wrong: string[] = [];
    for (const o of OPS.filter((o) => o.roles)) {
      if (o.path === "/session/signout") continue;
      const r = await call(ctx, o.method, o.path);
      const allowed = o.roles!.includes(role);
      if (!allowed && r.status() !== 403) wrong.push(`${o.method.toUpperCase()} ${o.path} → ${r.status()} (want 403)`);
      if (allowed && (r.status() === 401 || r.status() === 403)) wrong.push(`${o.method.toUpperCase()} ${o.path} → ${r.status()} (want allowed)`);
    }
    expect(wrong).toEqual([]);
  });
}

test("a teacher cannot read or change someone else's booking", async ({ baseURL }) => {
  const admin = await request.newContext({ baseURL });
  await signIn(admin, "admin");
  const all = (await (await admin.get("/api/v1/bookings?all=1")).json()) as { bookings: { id: string; teacherId: string; status: string }[] };
  const other = all.bookings.find((b) => b.teacherId !== "t-sara" && b.status === "confirmed");
  expect(other, "seed data has another teacher's booking").toBeTruthy();
  const sara = await request.newContext({ baseURL });
  await signIn(sara, "teacher");
  expect((await sara.get(`/api/v1/bookings/${other!.id}`)).status()).toBe(403);
  expect((await sara.post(`/api/v1/bookings/${other!.id}/cancel`, { data: {} })).status()).toBe(403);
  expect((await sara.patch(`/api/v1/bookings/${other!.id}`, { data: { objective: "x" } })).status()).toBe(403);
});

test("pages redirect people without the role", async ({ page }) => {
  await signIn(page, "teacher");
  for (const p of ["/admin", "/incharge", "/reports", "/outbox"]) {
    await page.goto(p);
    await expect(page, `${p} should send a teacher home`).toHaveURL(/\/$/);
  }
});
