import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA_SQL } from "./schema";

export { SCHEMA_SQL } from "./schema";

/**
 * Minimal database contract. PGlite implements it locally; a node-postgres
 * Pool adapter with the same two methods is all that is needed for hosting.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}
export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export function wrapPglite(pg: PGlite): Db {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pg.query<T>(sql, params as never[]);
      return r.rows;
    },
    async transaction<T>(fn: (tx: Tx) => Promise<T>) {
      return pg.transaction(async (t) =>
        fn({
          async query<R>(sql: string, params: unknown[] = []) {
            const r = await t.query<R>(sql, params as never[]);
            return r.rows;
          },
        }),
      );
    },
  };
}

/** Open (or create) a database. dataDir undefined = in-memory (tests). */
export async function openDb(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  await pg.exec(SCHEMA_SQL);
  return wrapPglite(pg);
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}
