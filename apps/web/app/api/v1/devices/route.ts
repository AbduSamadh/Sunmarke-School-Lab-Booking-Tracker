import { handler } from "@/lib/server/api";
import { audit } from "@/lib/server/audit";
import { DeviceInput, DeviceRemove } from "@/lib/shared/schemas";

/** POST /api/v1/devices: the phone app registers its push token for the signed-in person. */
export const POST = handler({ schema: DeviceInput }, async ({ db, actor, body }) => {
  await db.query(
    `INSERT INTO push_devices (token, staff_id, platform) VALUES ($1,$2,$3)
     ON CONFLICT (token) DO UPDATE SET staff_id = EXCLUDED.staff_id, platform = EXCLUDED.platform, active = true, last_seen_at = now()`,
    [body.token, actor.id, body.platform],
  );
  await audit(db, { actorId: actor.id, action: "device.register", entity: "push_device", after: { platform: body.platform } });
  return { ok: true };
});

/** DELETE /api/v1/devices: stop notifications to this phone (sign out, or turned off in settings). */
export const DELETE = handler({ schema: DeviceRemove }, async ({ db, actor, body }) => {
  await db.query("UPDATE push_devices SET active = false WHERE token = $1 AND staff_id = $2", [body.token, actor.id]);
  return { ok: true };
});
