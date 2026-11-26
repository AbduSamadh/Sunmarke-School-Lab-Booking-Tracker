import { randomUUID } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Server clock. FAKE_NOW (ISO instant) pins time for demos and tests. */
export function now(): Date {
  const fake = process.env.FAKE_NOW;
  return fake ? new Date(fake) : new Date();
}

/**
 * 303 redirect to a path on this site, with a relative Location. Building an absolute URL from
 * req.url breaks behind a proxy or in the standalone server, which can report "localhost" for 127.0.0.1.
 */
export function seeOther(pathAndQuery: string) {
  if (!pathAndQuery.startsWith("/") || pathAndQuery.startsWith("//")) pathAndQuery = "/";
  return new Response(null, { status: 303, headers: { Location: pathAndQuery } });
}
