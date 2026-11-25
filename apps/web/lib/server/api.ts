import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { getDb } from "./db";
import { currentActor } from "./auth";
import { AppError, type Actor } from "./bookings";
import type { Db } from "@sunmarke/db";

/** Wraps a /api/v1 handler: auth, JSON parsing, validation and error mapping. */
export function handler<S extends ZodTypeAny | undefined>(
  opts: { schema?: S; roles?: Actor["role"][] },
  fn: (ctx: { db: Db; actor: Actor; body: S extends ZodTypeAny ? z.infer<S> : undefined; req: Request; params: Record<string, string> }) => Promise<unknown>,
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const db = await getDb();
      const actor = await currentActor();
      if (!actor) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in first." } }, { status: 401 });
      if (opts.roles && !opts.roles.includes(actor.role))
        return NextResponse.json({ error: { code: "forbidden", message: "You do not have access to this." } }, { status: 403 });
      let body: unknown = undefined;
      if (opts.schema) {
        const raw = await req.json().catch(() => ({}));
        body = opts.schema.parse(raw);
      }
      const params = (await ctx?.params) ?? {};
      const result = await fn({ db, actor, body: body as never, req, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof ZodError)
        return NextResponse.json({ error: { code: "invalid", message: e.issues[0]?.message ?? "Invalid input", issues: e.issues } }, { status: 422 });
      if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: { code: "server_error", message: "Something went wrong. Try again." } }, { status: 500 });
    }
  };
}
