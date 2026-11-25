import type { Db, Tx } from "@sunmarke/db";

/** Every create, change, cancel, override and denied attempt is recorded. */
export async function audit(
  q: Db | Tx,
  e: { actorId: string | null; action: string; entity: string; entityId?: string | null; before?: unknown; after?: unknown },
) {
  await q.query("INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after) VALUES ($1,$2,$3,$4,$5,$6)", [
    e.actorId,
    e.action,
    e.entity,
    e.entityId ?? null,
    e.before === undefined ? null : JSON.stringify(e.before),
    e.after === undefined ? null : JSON.stringify(e.after),
  ]);
}
