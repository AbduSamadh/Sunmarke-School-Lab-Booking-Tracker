"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { localToInstant, DEFAULT_SETTINGS } from "@sunmarke/rules";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { addExternalEvent } from "@/lib/server/calendar";
import { newId } from "@/lib/server/util";

const BlockTime = z.object({
  resourceId: z.string().min(1),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  blocks: z.array(z.string()).default([]),
  reason: z.enum(["maintenance", "training", "exam", "holiday", "other"]),
  note: z.string().max(120).default(""),
});

/** In-charges and admin block time (maintenance, training). Existing bookings are not touched. */
export async function blockTime(fd: FormData) {
  const actor = await requireActor(["incharge", "admin"]);
  const p = BlockTime.safeParse({
    resourceId: fd.get("resourceId"),
    dateFrom: fd.get("dateFrom"),
    dateTo: fd.get("dateTo") || undefined,
    blocks: fd.getAll("blocks").map(String),
    reason: fd.get("reason"),
    note: fd.get("note") ?? "",
  });
  const back = String(fd.get("back") ?? "/incharge");
  if (!p.success) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(p.error.issues[0].message)}`);
  const d = p.data;
  const db = await getDb();
  const id = newId("bo");
  const dateTo = d.dateTo && d.dateTo >= d.dateFrom ? d.dateTo : d.dateFrom;
  await db.query("INSERT INTO blackouts (id, resource_id, date_from, date_to, block_codes, reason, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    id, d.resourceId === "all" ? null : d.resourceId, d.dateFrom, dateTo, d.blocks.length ? d.blocks : null, d.reason, d.note, actor.id,
  ]);
  await audit(db, { actorId: actor.id, action: "blackout.create", entity: "blackout", entityId: id, after: d });
  revalidatePath("/");
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=1`);
}

export async function removeBlackout(fd: FormData) {
  const actor = await requireActor(["incharge", "admin"]);
  const id = String(fd.get("id"));
  const db = await getDb();
  await db.query("UPDATE blackouts SET active = false WHERE id = $1", [id]);
  await audit(db, { actorId: actor.id, action: "blackout.remove", entity: "blackout", entityId: id });
  redirect(String(fd.get("back") ?? "/incharge"));
}

/** Demo only: put a meeting in an in-charge's simulated calendar (stands in for Google/Outlook). */
export async function addMeeting(fd: FormData) {
  const actor = await requireActor(["incharge", "admin"]);
  const staffId = actor.role === "admin" ? String(fd.get("staffId") ?? actor.id) : actor.id;
  const date = String(fd.get("date"));
  const start = String(fd.get("start"));
  const end = String(fd.get("end"));
  const title = String(fd.get("title") || "Meeting").slice(0, 80);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) redirect("/incharge?error=Check+the+meeting+date+and+times");
  const db = await getDb();
  await addExternalEvent(db, staffId, localToInstant(date, start, DEFAULT_SETTINGS), localToInstant(date, end, DEFAULT_SETTINGS), title);
  await audit(db, { actorId: actor.id, action: "calendar.mock_event", entity: "staff", entityId: staffId, after: { date, start, end, title } });
  redirect("/incharge?saved=1");
}
