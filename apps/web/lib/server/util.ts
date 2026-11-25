import { randomUUID } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Server clock. FAKE_NOW (ISO instant) pins time for demos and tests. */
export function now(): Date {
  const fake = process.env.FAKE_NOW;
  return fake ? new Date(fake) : new Date();
}
