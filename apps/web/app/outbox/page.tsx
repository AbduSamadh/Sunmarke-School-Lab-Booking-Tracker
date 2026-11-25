import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export default async function Outbox({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const actor = await requireActor(["admin", "incharge"]);
  const db = await getDb();
  const sp = await searchParams;
  const rows = await db.query<{ id: string; template: string; recipient: string; subject: string; sent_at: Date; ics: string | null }>(
    actor.role === "admin"
      ? "SELECT id, template, recipient, subject, sent_at, ics IS NOT NULL AS ics FROM notifications ORDER BY sent_at DESC LIMIT 100"
      : "SELECT id, template, recipient, subject, sent_at, ics IS NOT NULL AS ics FROM notifications WHERE recipient = $1 ORDER BY sent_at DESC LIMIT 100",
    actor.role === "admin" ? [] : [actor.email],
  );
  const sel = sp.id ? (await db.query<{ id: string; body_html: string; subject: string; recipient: string }>("SELECT id, body_html, subject, recipient FROM notifications WHERE id = $1", [sp.id]))[0] : rows[0];
  const selFull = sel && "body_html" in sel ? sel : sel ? (await db.query<{ id: string; body_html: string; subject: string; recipient: string }>("SELECT id, body_html, subject, recipient FROM notifications WHERE id = $1", [sel.id]))[0] : null;
  const allowed = selFull && (actor.role === "admin" || selFull.recipient === actor.email);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Email outbox</h1>
          <p className="muted" style={{ margin: 0 }}>
            Every email the app would send. Nothing leaves this pilot until a school sending account is approved.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">No emails yet.</div>
      ) : (
        <div className="cols">
          <ul className="list" style={{ maxHeight: 640, overflowY: "auto" }}>
            {rows.map((r) => (
              <li key={r.id} style={r.id === selFull?.id ? { background: "var(--accent-soft)" } : undefined}>
                <a href={`/outbox?id=${r.id}`} style={{ color: "var(--text)", textDecoration: "none", flex: 1 }}>
                  <strong>{r.subject}</strong>
                  <div className="small muted">
                    To {r.recipient} · {new Date(new Date(r.sent_at).getTime() + 4 * 3600_000).toISOString().slice(5, 16).replace("T", " ")} · {r.template}
                    {r.ics ? " · has invite" : ""}
                  </div>
                </a>
              </li>
            ))}
          </ul>
          <section>
            {allowed ? (
              <>
                <p className="small muted" style={{ marginBottom: 8 }}>To {selFull!.recipient}</p>
                <iframe className="email-frame" title={selFull!.subject} srcDoc={selFull!.body_html} sandbox="" />
                {rows.find((r) => r.id === selFull!.id)?.ics && (
                  <p style={{ marginTop: 8 }}><a href={`/api/v1/notifications/${selFull!.id}/ics`}>Download the calendar invite (.ics)</a></p>
                )}
              </>
            ) : (
              <div className="empty">Pick an email.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
