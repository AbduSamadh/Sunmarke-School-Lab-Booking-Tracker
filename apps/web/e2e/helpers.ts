import type { APIRequestContext, Page } from "@playwright/test";

/** Seeded sample people (lib/server/seed.ts), one per role. */
export const PEOPLE = {
  teacher: "sara.khan@sunmarke.example",
  incharge: "ram@sunmarke.example",
  admin: "abd@sunmarke.example",
  viewer: "neil@sunmarke.example",
} as const;
export type RoleName = keyof typeof PEOPLE;

export async function signIn(target: Page | APIRequestContext, role: RoleName) {
  const req = "request" in target ? target.request : target;
  const r = await req.post("/api/v1/session", { data: { email: PEOPLE[role] } });
  if (!r.ok()) throw new Error(`sign-in as ${role} failed: ${r.status()}`);
}
