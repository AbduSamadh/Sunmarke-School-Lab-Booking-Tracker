import path from "node:path";
import { openDb, type Db } from "@sunmarke/db";
import { seed } from "./seed";

const g = globalThis as unknown as { __slbDb?: Promise<Db> };

/** One embedded Postgres (PGlite) per server process. Replace with a pg Pool adapter when hosting is chosen (D9). */
export function getDb(): Promise<Db> {
  if (!g.__slbDb) g.__slbDb = init().catch((e) => {
      g.__slbDb = undefined;
      throw e;
    });
  return g.__slbDb;
}

async function init(): Promise<Db> {
  const dir = process.env.DATA_DIR === "memory" ? undefined : (process.env.DATA_DIR ?? path.join(process.cwd(), ".data", "pglite"));
  const db = await openDb(dir);
  const seeded = await db.query("SELECT value FROM meta WHERE key = 'seeded'");
  if (seeded.length === 0) await seed(db);
  return db;
}

/** Tests: use a fresh in-memory database. */
export function setDbForTests(db: Db) {
  g.__slbDb = Promise.resolve(db);
}
