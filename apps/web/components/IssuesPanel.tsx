import type { Db } from "@sunmarke/db";
import { listIssues } from "@/lib/server/release11";
import { reportEquipment, resolveEquipment } from "@/app/incharge/actions";
import { fmtDateShort } from "@/lib/shared/format";

const SEV: Record<string, string> = { high: "tag-bad", medium: "tag-warn", low: "" };

/** Equipment log: report a fault (optionally taking the lab out of use) and close it when fixed. */
export async function IssuesPanel({ db, resources, back, today }: { db: Db; resources: { id: string; name: string }[]; back: string; today: string }) {
  const ids = new Set(resources.map((r) => r.id));
  const issues = (await listIssues(db, "open")).filter((i) => ids.has(i.resource_id));
  return (
    <div className="cols">
      <section>
        <h2>Open equipment issues ({issues.length})</h2>
        {issues.length === 0 ? (
          <div className="empty">Nothing reported. Teachers can report problems when they rate a session.</div>
        ) : (
          <ul className="list">
            {issues.map((i) => (
              <li key={i.id}>
                <div className="what">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{i.resource_name}</strong>
                    {i.item ? <span>{i.item}</span> : null}
                    <span className={`tag ${SEV[i.severity] ?? ""}`}>{i.severity}</span>
                    {i.blackout_id ? <span className="tag">Out of use</span> : null}
                  </div>
                  <div>{i.title}</div>
                  <div className="small muted">
                    {i.detail ? `${i.detail} · ` : ""}Reported by {i.reporter}, {fmtDateShort(new Date(new Date(i.created_at).getTime() + 4 * 3600_000).toISOString().slice(0, 10))}
                  </div>
                </div>
                <form action={resolveEquipment} className="btn-row">
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="back" value={back} />
                  <label className="sr-only" htmlFor={`fix-${i.id}`}>What was done</label>
                  <input id={`fix-${i.id}`} name="note" type="text" maxLength={300} placeholder="What was done" style={{ minWidth: 150 }} />
                  <button className="btn btn-sm" type="submit">Mark fixed</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <h2>Report a problem</h2>
        <form action={reportEquipment}>
          <input type="hidden" name="back" value={back} />
          <div className="row2">
            <div className="field">
              <label htmlFor="iss-res">Lab</label>
              <select id="iss-res" name="resourceId" required>{resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            </div>
            <div className="field">
              <label htmlFor="iss-item">Item <span className="muted">(optional)</span></label>
              <input id="iss-item" name="item" type="text" maxLength={60} placeholder="e.g. Headset 4" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="iss-title">Problem</label>
            <input id="iss-title" name="title" type="text" required minLength={3} maxLength={120} placeholder="e.g. Will not charge" />
          </div>
          <div className="field">
            <label htmlFor="iss-detail">Detail <span className="muted">(optional)</span></label>
            <textarea id="iss-detail" name="detail" maxLength={500} />
          </div>
          <div className="row3">
            <div className="field">
              <label htmlFor="iss-sev">Severity</label>
              <select id="iss-sev" name="severity" defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High (emails admin)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="iss-from">Out of use from <span className="muted">(optional)</span></label>
              <input id="iss-from" name="blockFrom" type="date" min={today} />
            </div>
            <div className="field">
              <label htmlFor="iss-to">Until</label>
              <input id="iss-to" name="blockTo" type="date" min={today} />
            </div>
          </div>
          <p className="small muted">Setting &ldquo;out of use&rdquo; blocks the lab for those days. Marking the issue fixed reopens it.</p>
          <button className="btn btn-primary" type="submit">Report</button>
        </form>
      </section>
    </div>
  );
}
