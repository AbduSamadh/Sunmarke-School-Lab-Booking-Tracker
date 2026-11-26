import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export default async function Outbox({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const actor = await requireActor(["admin", "incharge"]);
  const db = await getDb();
  const sp = await searchParams;
  const rows = await db.query<{ id: string; template: string; recipient: string; subject: string; sent_at: Date; ics: string | null; channel: string; status: string }>(
    actor.role === "admin"
      ? "SELECT id, template, recipient, subject, sent_at, ics IS NOT NULL AS ics, channel, status FROM notifications WHERE template NOT LIKE 'push.%' ORDER BY sent_at DESC LIMIT 100"
      : "SELECT id, template, recipient, subject, sent_at, ics IS NOT NULL AS ics, channel, status FROM notifications WHERE recipient = $1 AND template NOT LIKE 'push.%' ORDER BY sent_at DESC LIMIT 100",
    actor.role === "admin" ? [] : [actor.email],
  );
  const sel = sp.id ? (await db.query<{ id: string; body_html: string; body_text: string; subject: string; recipient: string; channel: string }>("SELECT id, body_html, body_text, subject, recipient, channel FROM notifications WHERE id = $1", [sp.id]))[0] : rows[0];
  const selFull = sel && "body_html" in sel ? sel : sel ? (await db.query<{ id: string; body_html: string; body_text: string; subject: string; recipient: string; channel: string }>("SELECT id, body_html, body_text, subject, recipient, channel FROM notifications WHERE id = $1", [sel.id]))[0] : null;
  const allowed = selFull && (actor.role === "admin" || selFull.recipient === actor.email);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p className="muted" style={{ margin: 0 }}>
            Every Teams message the app sends. In this pilot they stop here; once the school&rsquo;s Teams workflow is connected they also arrive in Teams.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">No messages yet.</div>
      ) : (
        <div className="cols">
          <ul className="list" style={{ maxHeight: 640, overflowY: "auto" }}>
            {rows.map((r) => (
              <li key={r.id} style={r.id === selFull?.id ? { background: "var(--accent-soft)" } : undefined}>
                <a href={`/outbox?id=${r.id}`} style={{ color: "var(--text)", textDecoration: "none", flex: 1 }}>
                  <strong>{r.subject}</strong>
                  <div className="small muted">
                    To {r.recipient} · {new Date(new Date(r.sent_at).getTime() + 4 * 3600_000).toISOString().slice(5, 16).replace("T", " ")} · {r.channel === "teams" ? "Teams" : "Email"}
                    {r.status === "failed" ? " · not delivered" : ""}
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
                {selFull!.channel === "teams" ? (
                  <article className="teams-card" aria-label={`Teams message: ${selFull!.subject}`}>
                    <div className="teams-from small muted">Lab Booking (Teams Workflows)</div>
                    <h2 className="teams-title">{selFull!.subject}</h2>
                    {selFull!.body_text
                      .split("\n")
                      .slice(1)
                      .filter((l) => l.trim())
                      .map((l, i) =>
                        /^https?:\/\//.test(l.split(": ").pop() ?? "") ? (
                          <p key={i}><a className="btn btn-sm" href={l.split(": ").pop()}>{l.split(": ")[0]}</a></p>
                        ) : (
                          <p key={i} className="teams-line">{l}</p>
                        ),
                      )}
                  </article>
                ) : (
                  <iframe className="email-frame" title={selFull!.subject} srcDoc={selFull!.body_html} sandbox="" />
                )}
                {rows.find((r) => r.id === selFull!.id)?.ics && (
                  <p style={{ marginTop: 8 }}><a href={`/api/v1/notifications/${selFull!.id}/ics`}>Download the calendar invite (.ics)</a></p>
                )}
              </>
            ) : (
              <div className="empty">Pick a message.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
