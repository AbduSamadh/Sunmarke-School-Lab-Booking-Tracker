import { redirect } from "next/navigation";
import { currentActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { checkIn } from "@/lib/server/release11";
import { AppError } from "@/lib/server/bookings";
import { fmtDateLong } from "@/lib/shared/format";
import { localDate, DEFAULT_SETTINGS } from "@sunmarke/rules";
import { now } from "@/lib/server/util";

/**
 * Lab-door QR code lands here. Opening the page shows the lab; tapping the
 * button marks the teacher's current session as attended.
 */
export default async function CheckinPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ done?: string }> }) {
  const { code } = await params;
  const safe = code.replace(/[^\w-]/g, "").slice(0, 40);
  const actor = await currentActor();
  if (!actor) redirect(`/signin?next=${encodeURIComponent(`/checkin/${safe}`)}`);
  const db = await getDb();
  const res = await db.query<{ name: string }>("SELECT name FROM resources WHERE checkin_code = $1 AND active", [safe]);
  const { done } = await searchParams;

  async function doCheckin() {
    "use server";
    const a = await currentActor();
    if (!a) redirect(`/signin?next=${encodeURIComponent(`/checkin/${safe}`)}`);
    let q: string;
    try {
      const r = await checkIn(await getDb(), a, safe);
      q = r.ok ? (r.already ? "already" : "ok") : "none";
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      q = "unknown";
    }
    redirect(`/checkin/${safe}?done=${q}`);
  }

  if (!res[0])
    return (
      <div style={{ maxWidth: 480, margin: "24px auto" }}>
        <h1>Check-in code not recognised</h1>
        <p className="muted">This QR code is not linked to a lab. Ask the lab admin for a new one.</p>
      </div>
    );

  const name = res[0].name;
  return (
    <div style={{ maxWidth: 480, margin: "24px auto" }}>
      <h1>{name}</h1>
      <p className="muted">{fmtDateLong(localDate(now(), DEFAULT_SETTINGS))} · signed in as {actor.name}</p>
      {done === "ok" && <div className="notice notice-ok" role="status">Checked in. Have a good lesson.</div>}
      {done === "already" && <div className="notice notice-ok" role="status">You are already checked in for this session.</div>}
      {done === "none" && (
        <div className="notice notice-warn" role="status">
          No session of yours in {name} right now. Check-in opens 15 minutes before the start. <a href="/bookings">See my bookings</a>.
        </div>
      )}
      {done === "unknown" && <div className="notice notice-bad" role="alert">This check-in code is not recognised.</div>}
      {done !== "ok" && done !== "already" && (
        <form action={doCheckin} className="panel">
          <p style={{ marginTop: 0 }}>Tap to confirm your class is in the lab. Sessions with no check-in are marked as no-shows.</p>
          <button className="btn btn-primary" type="submit" style={{ width: "100%" }}>Check in to {name}</button>
        </form>
      )}
    </div>
  );
}
