import { addDays, localDate } from "@sunmarke/rules";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { buildReport } from "@/lib/server/reports";
import { getSettings } from "@/lib/server/world";
import { now } from "@/lib/server/util";
import { fmtDateShort } from "@/lib/shared/format";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; resource?: string; department?: string }> }) {
  await requireActor(["admin", "viewer"]);
  const db = await getDb();
  const sp = await searchParams;
  const today = localDate(now(), await getSettings(db));
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  const from = valid(sp.from) ?? addDays(today, -28);
  const to = valid(sp.to) ?? addDays(today, -1);
  const rep = await buildReport(db, { from, to, resourceId: sp.resource || undefined, department: sp.department || undefined });
  const qs = new URLSearchParams({ from, to, ...(sp.resource ? { resource: sp.resource } : {}), ...(sp.department ? { department: sp.department } : {}) }).toString();
  const heatMax = Math.max(1, ...Object.values(rep.heat).flatMap((r) => Object.values(r)));
  const deptMax = Math.max(1, ...rep.byDepartment.map((d) => d.n));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Lab use</h1>
          <p className="muted" style={{ margin: 0 }}>{fmtDateShort(from)} to {fmtDateShort(to)}. Utilisation counts bookable blocks only, excluding blackouts.</p>
        </div>
        <a className="btn" href={`/api/v1/reports/export?table=bookings&${qs}`}>Export bookings (CSV)</a>
      </div>

      <form className="filters" method="get">
        <div className="field"><label htmlFor="f-from">From</label><input id="f-from" name="from" type="date" defaultValue={from} /></div>
        <div className="field"><label htmlFor="f-to">To</label><input id="f-to" name="to" type="date" defaultValue={to} /></div>
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
        <Kpi v={String(rep.kpis.sessions)} l="Sessions" />
        <Kpi v={pct(rep.kpis.roomUtilisation)} l="Lab utilisation" />
        <Kpi v={pct(rep.kpis.cartUtilisation)} l="Cart utilisation" />
        <Kpi v={String(rep.kpis.turnedAway)} l="Requests turned away" />
        <Kpi v={String(rep.kpis.teachers)} l="Teachers booking" />
        <Kpi v={pct(rep.kpis.noShowRate)} l="No-show rate" />
        <Kpi v={`${rep.kpis.medianLeadDays.toFixed(1)} d`} l="Median booking lead time" />
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
                    <td>{u.name}</td>
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
    </div>
  );
}

function Kpi({ v, l }: { v: string; l: string }) {
  return (
    <div className="kpi" role="listitem">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}
