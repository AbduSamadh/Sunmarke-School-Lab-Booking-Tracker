import type { Db } from "@sunmarke/db";
import { z } from "zod";
import { audit } from "./audit";
import { newId } from "./util";

const Row = z.object({
  name: z.string().trim().min(2, "Name is missing").max(80),
  email: z.string().trim().toLowerCase().email("Email is not valid"),
  department: z.string().trim().max(60).default(""),
  role: z.enum(["teacher", "incharge", "admin", "viewer"], { errorMap: () => ({ message: "Role must be teacher, incharge, admin or viewer" }) }).default("teacher"),
});

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { cur.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(f); f = "";
      if (cur.some((x) => x.trim())) rows.push(cur);
      cur = [];
    } else f += c;
  }
  cur.push(f);
  if (cur.some((x) => x.trim())) rows.push(cur);
  return rows;
}

/**
 * Staff CSV import (D8). Header row required: name,email,department[,role].
 * Valid rows are added or updated by email; every invalid row is reported with
 * its line number, and nothing is half-written for a bad row.
 */
export async function importStaffCsv(db: Db, actorId: string, text: string) {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length === 0) return { added: 0, updated: 0, errors: [{ line: 1, message: "The file is empty." }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  if (idx("name") < 0 || idx("email") < 0) return { added: 0, updated: 0, errors: [{ line: 1, message: "First row must be a header with at least: name,email,department" }] };
  let added = 0;
  let updated = 0;
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  for (const [i, r] of rows.slice(1).entries()) {
    const line = i + 2;
    const parsed = Row.safeParse({
      name: r[idx("name")],
      email: r[idx("email")],
      department: idx("department") >= 0 ? r[idx("department")] : "",
      role: idx("role") >= 0 && r[idx("role")]?.trim() ? r[idx("role")].trim().toLowerCase() : undefined,
    });
    if (!parsed.success) {
      errors.push({ line, message: parsed.error.issues.map((x) => x.message).join("; ") });
      continue;
    }
    const s = parsed.data;
    if (seen.has(s.email)) {
      errors.push({ line, message: `Duplicate email ${s.email} in this file` });
      continue;
    }
    seen.add(s.email);
    const ex = await db.query<{ id: string }>("SELECT id FROM staff WHERE lower(email) = $1", [s.email]);
    if (ex[0]) {
      await db.query("UPDATE staff SET name = $2, department = $3, role = $4, active = true, updated_at = now() WHERE id = $1", [ex[0].id, s.name, s.department, s.role]);
      updated++;
    } else {
      await db.query("INSERT INTO staff (id, name, email, department, role, created_by) VALUES ($1,$2,$3,$4,$5,$6)", [newId("st"), s.name, s.email, s.department, s.role, actorId]);
      added++;
    }
  }
  await audit(db, { actorId, action: "staff.import", entity: "staff", after: { added, updated, errors: errors.length } });
  return { added, updated, errors };
}
