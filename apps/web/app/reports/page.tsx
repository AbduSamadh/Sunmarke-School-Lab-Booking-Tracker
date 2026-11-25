import { addDays, localDate } from "@sunmarke/rules";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { buildReport, reportCampus } from "@/lib/server/reports";
import { getSettings } from "@/lib/server/world";
import { now } from "@/lib/server/util";
import { fmtDateShort } from "@/lib/shared/format";
import { PrintButton } from "@/components/PrintButton";
import { LabIcon } from "@/components/LabIcon";
import { CalendarCheck, Gauge, Laptop, Ban, Users, UserX, Hourglass, Star, type LucideIcon } from "lucide-react";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; resource?: string; department?: string; campus?: string }> }) {
  const actor = await requireActor(["admin", "viewer"]);
  const db = await getDb();
  const sp = await searchParams;
  const today = localDate(now(), await getSettings(db));
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  const from = valid(sp.from) ?? addDays(today, -28);
  const to = valid(sp.to) ?? addDays(today, -1);
  const campusId = reportCampus(actor, sp.campus);
  const campuses = actor.allCampuses ? await db.query<{ id: string; name: string }>("SELECT id, name FROM campuses WHERE active ORDER BY sort, name") : [];
  const rep = await buildReport(db, { from, to, resourceId: sp.resource || undefined, department: sp.department || undefined, campusId });
  const qs = new URLSearchParams({ from, to, ...(sp.resource ? { resource: sp.resource } : {}), ...(sp.department ? { department: sp.department } : {}), ...(actor.allCampuses ? { campus: campusId ?? "all" } : {}) }).toString();
  const heatMax = Math.max(1, ...Object.values(rep.heat).flatMap((r) => Object.values(r)));
  const deptMax = Math.max(1, ...rep.byDepartment.map((d) => d.n));
  const curMax = Math.max(1, ...rep.curriculum.levels.map((l) => l.sessions));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Lab use</h1>
          <p className="muted" style={{ margin: 0 }}>{fmtDateShort(from)} to {fmtDateShort(to)}. Utilisation counts bookable blocks only, excluding blackouts.</p>
        </div>
        <div className="btn-row no-print">
          <PrintButton label="Print or save as PDF" />
          <a className="btn" href={`/api/v1/reports/export?table=bookings&${qs}`}>Export bookings (CSV)</a>
        </div>
      </div>

      <form className="filters no-print" method="get">
        <div className="field"><label htmlFor="f-from">From</label><input id="f-from" name="from" type="date" defaultValue={from} /></div>
        <div className="field"><label htmlFor="f-to">To</label><input id="f-to" name="to" type="date" defaultValue={to} /></div>
        {campuses.length > 1 && (
          <div className="field">
            <label htmlFor="f-campus">Campus</label>
            <select id="f-campus" name="campus" defaultValue={campusId ?? "all"}>
              <option value="all">All campuses</option>
              {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="f-res">Lab</label>
          <select id="f-res" name="resource" defaultValue={sp.resource ?? ""}><option value="">All</option>{rep.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </div>
        <div className="field">
          <label htmlFor="f-dept">Department</label>
          <select id="f-dept" name="department" defaultValue={sp.department ?? ""}><option value="">All</option>{rep.departments.map((d) => <option key={d}>{d}</option>)}</select>
        </div>
        <button className="btn btn-primary" type="submit">Apply</button>
      </form>

      <div className="kpis" role="list">
        <Kpi v={String(rep.kpis.sessions)} l="Sessions" icon={CalendarCheck} />
        <Kpi v={pct(rep.kpis.roomUtilisation)} l="Lab utilisation" icon={Gauge} />
        <Kpi v={pct(rep.kpis.cartUtilisation)} l="Cart utilisation" icon={Laptop} />
        <Kpi v={String(rep.kpis.turnedAway)} l="Requests turned away" icon={Ban} />
        <Kpi v={String(rep.kpis.teachers)} l="Teachers booking" icon={Users} />
        <Kpi v={pct(rep.kpis.noShowRate)} l="No-show rate" icon={UserX} />
        <Kpi v={`${rep.kpis.medianLeadDays.toFixed(1)} d`} l="Median booking lead time" icon={Hourglass} />
        <Kpi v={rep.feedback.count ? `${rep.feedback.avg.toFixed(1)} / 5` : "–"} l={`Session rating${rep.feedback.count ? ` (${rep.feedback.count})` : ""}`} icon={Star} />
      </div>

      <div className="cols">
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2>Utilisation by lab</h2>
            <a className="small" href={`/api/v1/reports/export?table=utilisation&${qs}`}>CSV</a>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Lab</th><th className="num">Sessions</th><th className="num">Used / bookable</th><th style={{ width: "35%" }}>Utilisation</th></tr></thead>
              <tbody>
                {rep.utilisation.map((u) => (
                  <tr key={u.id}>
                    <td><span className="res-head"><LabIcon colour={u.colour} size="xs" />{u.name}</span></td>
                    <td className="num">{u.sessions}</td>
                    <td className="num small">{u.type === "cart_pool" ? `${u.unitBlocks} cart-blocks / ${u.bookableBlocks * 10}` : `${u.bookedBlocks} / ${u.bookableBlocks}`}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div className="bar" style={{ flex: 1 }}><span style={{ width: pct(Math.min(1, u.pct)), background: `var(--r-${u.colour})` }} /></div>
                        <span className="tnum small" style={{ width: 40, textAlign: "right" }}>{pct(u.pct)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2>In-charge load</h2>
            <a className="small" href={`/api/v1/reports/export?table=load&${qs}`}>CSV</a>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>In-charge</th><th className="num">Sessions</th><th className="num">Covering other labs</th></tr></thead>
              <tbody>
                {rep.load.length === 0 && <tr><td colSpan={3} className="muted">No sessions in this range.</td></tr>}
                {rep.load.map((l) => <tr key={l.id}><td>{l.name}</td><td className="num">{l.sessions}</td><td className="num">{l.crossCover} ({pct(l.crossPct)})</td></tr>)}
              </tbody>
            </table>
          </div>
          <h2 style={{ marginTop: 20 }}>Demand turned away</h2>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                <tr><td>No lab in-charge free</td><td className="num">{rep.turnedAway.noIncharge}</td></tr>
                <tr><td>Lab or carts already booked</td><td className="num">{rep.turnedAway.full}</td></tr>
                <tr><td>Joined a waitlist</td><td className="num">{rep.turnedAway.waitlistJoins}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>&quot;No lab in-charge free&quot; is the evidence for a third in-charge or trained cart monitors.</p>
        </section>
      </div>

      <section style={{ marginTop: 20 }}>
        <h2>Busiest blocks</h2>
        <div className="table-wrap">
          <table className="data heat">
            <caption className="sr-only">Sessions by weekday and block</caption>
            <thead><tr><th>Day</th>{rep.blockCodes.map((c) => <th key={c} className="num" style={{ textAlign: "center" }}>{c}</th>)}</tr></thead>
            <tbody>
              {DAYS.map((d, i) => (
                <tr key={d}>
                  <th scope="row" style={{ background: "var(--surface)" }}>{d}</th>
                  {rep.blockCodes.map((c) => {
                    const n = rep.heat[String(i + 1)]?.[c] ?? 0;
                    const a = n / heatMax;
                    return (
                      <td key={c} style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(a * 70)}%, var(--surface))`, color: a > 0.55 ? "var(--on-accent)" : "var(--text)" }}>{n}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="cols" style={{ marginTop: 20 }}>
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2>By department</h2>
            <a className="small" href={`/api/v1/reports/export?table=department&${qs}`}>CSV</a>
          </div>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {rep.byDepartment.map((d) => (
                  <tr key={d.label}>
                    <td style={{ width: "40%" }}>{d.label}</td>
                    <td><div className="bar"><span style={{ width: pct(d.n / deptMax), background: "var(--accent)" }} /></div></td>
                    <td className="num" style={{ width: 50 }}>{d.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2>By subject and year</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Subject</th><th className="num">Sessions</th></tr></thead>
              <tbody>{rep.bySubject.slice(0, 8).map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{d.n}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Years: {rep.byYear.slice(0, 10).map((y) => `${y.label} ${y.n}`).join(" · ") || "none"}
          </p>
        </section>
      </div>

      <section style={{ marginTop: 20 }} aria-labelledby="cur-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h2 id="cur-title">Curriculum coverage</h2>
          <a className="small" href={`/api/v1/reports/export?table=curriculum&${qs}`}>CSV</a>
        </div>
        {rep.curriculum.total === 0 ? (
          <div className="empty">No curriculum levels yet. Add the KS3 progressive plan under Admin, Curriculum.</div>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {rep.curriculum.covered} of {rep.curriculum.total} levels taught in the labs in this range, from {rep.curriculum.taggedSessions} tagged {rep.curriculum.taggedSessions === 1 ? "session" : "sessions"}.
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Level</th><th>Year</th><th style={{ width: "34%" }}>Sessions</th><th className="num">Classes</th></tr></thead>
                {[...new Set(rep.curriculum.levels.map((l) => l.strand))].map((strand) => (
                  <tbody key={strand}>
                    <tr><th scope="rowgroup" colSpan={4} style={{ background: "var(--surface-2)" }}>{strand}</th></tr>
                    {rep.curriculum.levels.filter((l) => l.strand === strand).map((l) => (
                      <tr key={l.id}>
                        <td><strong>{l.code}</strong> <span className="small">{l.title}</span></td>
                        <td>{l.yearGroup || "All"}</td>
                        <td>
                          {l.sessions === 0 ? (
                            <span className="small muted">Not taught yet</span>
                          ) : (
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <div className="bar" style={{ flex: 1 }}><span style={{ width: pct(l.sessions / curMax), background: "var(--accent)" }} /></div>
                              <span className="tnum small" style={{ width: 28, textAlign: "end" }}>{l.sessions}</span>
                            </div>
                          )}
                        </td>
                        <td className="num">{l.classes}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>Teachers tag lessons with plan levels when they book. Untagged sessions are not counted here.</p>
          </>
        )}
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Teacher ratings and equipment</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Lab</th><th>Average rating</th><th className="num">Equipment issues</th><th className="num">Still open</th></tr></thead>
            <tbody>
              {rep.feedback.byResource.filter((r) => !sp.resource || r.id === sp.resource).map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{ratingText(r.avg, r.ratings)}</td>
                  <td className="num">{r.issues}</td>
                  <td className="num">{r.openIssues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>Teachers rate a session from their bookings page after it starts. Open issues are listed under Admin, Equipment.</p>
      </section>
    </div>
  );
}

function ratingText(avg: number | null, n: number) {
  return avg === null ? "No ratings" : `${avg.toFixed(1)} / 5 (${n})`;
}

function Kpi({ v, l, icon: Icon }: { v: string; l: string; icon?: LucideIcon }) {
  return (
    <div className="kpi" role="listitem">
      {Icon && <span className="kpi-icon" aria-hidden="true"><Icon size={18} /></span>}
      <div className="v">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}
