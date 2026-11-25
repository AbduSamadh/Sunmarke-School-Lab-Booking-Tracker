import { z } from "zod";
import { handler } from "@/lib/server/api";
import { audit } from "@/lib/server/audit";

const Device = z
  .object({
    token: z.string().min(10).max(200).regex(/^[\w\-[\]:.]+$/, "Not a push token"),
    platform: z.enum(["ios", "android", "web"]),
  })
  .strict();

/** POST /api/v1/devices: the phone app registers its push token for the signed-in person. */
export const POST = handler({ schema: Device }, async ({ db, actor, body }) => {
  await db.query(
    `INSERT INTO push_devices (token, staff_id, platform) VALUES ($1,$2,$3)
     ON CONFLICT (token) DO UPDATE SET staff_id = EXCLUDED.staff_id, platform = EXCLUDED.platform, active = true, last_seen_at = now()`,
    [body.token, actor.id, body.platform],
  );
  await audit(db, { actorId: actor.id, action: "device.register", entity: "push_device", after: { platform: body.platform } });
  return { ok: true };
});

/** DELETE /api/v1/devices: stop notifications to this phone (sign out, or turned off in settings). */
export const DELETE = handler({ schema: z.object({ token: z.string().min(10).max(200) }).strict() }, async ({ db, actor, body }) => {
  await db.query("UPDATE push_devices SET active = false WHERE token = $1 AND staff_id = $2", [body.token, actor.id]);
  return { ok: true };
});
