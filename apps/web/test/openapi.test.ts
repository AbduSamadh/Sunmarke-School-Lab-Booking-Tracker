/** The published API description lists every route and method the server actually has. */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { OPS, openApiSpec } from "../lib/server/openapi";

const ROOT = join(__dirname, "../app/api/v1");
function routes(dir = ROOT): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? routes(p) : f === "route.ts" ? [p] : [];
  });
}

describe("OpenAPI description", () => {
  it("covers every route file and exported method", () => {
    const have = new Set(OPS.map((o) => `${o.method.toUpperCase()} ${o.path}`));
    const missing: string[] = [];
    for (const file of routes()) {
      const path = "/" + relative(ROOT, file).split(sep).slice(0, -1).join("/").replace(/\[(\w+)\]/g, "{$1}");
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/export (?:const|async function) (GET|POST|PATCH|PUT|DELETE)\b/g)) {
        const key = `${m[1]} ${path}`;
        if (!have.has(key)) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });
  it("builds a valid-looking document with request schemas", () => {
    const spec = openApiSpec() as { openapi: string; paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: { properties?: Record<string, unknown> } }> } }>> };
    expect(spec.openapi).toBe("3.1.0");
    const body = spec.paths["/bookings"].post.requestBody!.content["application/json"].schema;
    expect(Object.keys(body.properties ?? {})).toEqual(expect.arrayContaining(["resourceId", "date", "blockIds", "curriculumIds"]));
  });
  it("matches the copy published in docs/api/openapi.json (pnpm --filter web openapi refreshes it)", () => {
    const file = join(__dirname, "../../../docs/api/openapi.json");
    const text = JSON.stringify(openApiSpec(), null, 2) + "\n";
    if (process.env.WRITE_OPENAPI) {
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, text);
    }
    expect(existsSync(file) && readFileSync(file, "utf8")).toBe(text);
  });
});
