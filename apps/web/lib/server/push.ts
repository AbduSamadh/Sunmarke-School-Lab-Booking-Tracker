import type { Db } from "@sunmarke/db";
import { newId } from "./util";

/**
 * Push notifications for the phone app (Release 2).
 *
 * Every push is stored in the notifications table (template "push.<kind>") so it
 * shows in the email outbox like any other message. Nothing leaves the server
 * unless PUSH_PROVIDER=expo is set, which sends through Expo's push service
 * (https://exp.host). That is an outside service, so it stays off until the
 * school approves it, the same as the email sending account.
 */
export interface PushMessage {
  to: string; // staff email
  kind: string;
  title: string;
  body: string;
  bookingId?: string | null;
  url?: string; // app route to open, e.g. "/bookings"
}

const EXPO_URL = "https://exp.host/--/api/v2/push/send";

export async function sendPush(db: Db, m: PushMessage): Promise<number> {
  const devices = await db.query<{ token: string }>(
    "SELECT d.token FROM push_devices d JOIN staff s ON s.id = d.staff_id WHERE lower(s.email) = lower($1) AND d.active AND s.active",
    [m.to],
  );
  if (devices.length === 0) return 0;
  await db.query(
    "INSERT INTO notifications (id, booking_id, template, recipient, subject, body_html, body_text) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [newId("ntf"), m.bookingId ?? null, `push.${m.kind}`, m.to, m.title, `<p><strong>${esc(m.title)}</strong></p><p>${esc(m.body)}</p><p>(Phone notification to ${devices.length} device${devices.length === 1 ? "" : "s"})</p>`, m.body],
  );
  if (process.env.PUSH_PROVIDER !== "expo") return devices.length;
  const res = await fetch(EXPO_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(devices.map((d) => ({ to: d.token, title: m.title, body: m.body, sound: "default", data: { bookingId: m.bookingId ?? null, url: m.url ?? "/" } }))),
  });
  if (!res.ok) throw new Error(`Expo push failed: ${res.status}`);
  // Tokens Expo reports as no longer registered are retired so we stop sending to them.
  const out = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
  const dead = (out?.data ?? []).map((r, i) => (r.details?.error === "DeviceNotRegistered" ? devices[i]?.token : null)).filter(Boolean);
  if (dead.length) await db.query("UPDATE push_devices SET active = false WHERE token = ANY($1)", [dead]);
  return devices.length;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
