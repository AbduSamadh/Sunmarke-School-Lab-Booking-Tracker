import { addDays, localDate, timetableForDate } from "@sunmarke/rules";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getAssignments, getBlackouts, getResources, getSettings, getStaff, getTimetables } from "@/lib/server/world";
import { currentConflicts } from "@/lib/server/scheduled";
import { getBookingDetail } from "@/lib/server/bookings";
import { now } from "@/lib/server/util";
import { fmtDateShort } from "@/lib/shared/format";
import { StaffImport } from "@/components/StaffImport";
import { blockTime, removeBlackout } from "../incharge/actions";
import { addResource, addTimetable, retireTimetable, saveResource, saveRules, setStaffActive, toggleCalendarOutage } from "./actions";

const TABS = [
  ["resources", "Labs and carts"],
  ["timetables", "Timetables"],
  ["blackouts", "Blackout dates"],
  ["staff", "Staff"],
  ["rules", "Rules"],
  ["system", "Calendar and jobs"],
  ["audit", "Audit log"],
] as const;
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; error?: string; ran?: string }> }) {
  await requireActor(["admin"]);
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "resources";
  const db = await getDb();
  const settings = await getSettings(db);
  const today = localDate(now(), settings);
  const [resources, staff, assignments, timetables] = await Promise.all([getResources(db), getStaff(db), getAssignments(db), getTimetables(db)]);
  const incharges = staff.filter((s) => s.role === "incharge" || s.role === "admin");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="muted" style={{ margin: 0 }}>Every change here is recorded in the audit log.</p>
        </div>
      </div>
      <nav className="tabs" aria-label="Admin sections">
        {TABS.map(([k, l]) => (
          <a key={k} href={`/admin?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{l}</a>
        ))}
      </nav>
      {sp.saved && <div className="notice notice-ok" role="status">Saved.</div>}
      {sp.ran && <div className="notice notice-ok" role="status">Scheduled jobs ran.</div>}
      {sp.error && <div className="notice notice-bad" role="alert">{sp.error}</div>}

      {tab === "resources" && (
        <div className="stack">
          <p className="muted">The primary in-charge is always tried first; the fallback covers only when the primary is busy.</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Name</th><th>Type</th><th className="num">Units</th><th>Location</th><th>Primary</th><th>Fallback</th><th>Active</th><th><span className="sr-only">Save</span></th></tr>
              </thead>
              <tbody>
                {resources.map((r) => {
                  const a = assignments.filter((x) => x.resourceId === r.id).sort((x, y) => x.priority - y.priority);
                  const f = `res-${r.id}`;
                  return (
                    <tr key={r.id}>
                      <td><input form={f} name="name" type="text" defaultValue={r.name} aria-label="Name" style={{ minWidth: 130 }} /></td>
                      <td>{r.type === "room" ? "Room" : "Cart pool"}</td>
                      <td className="num"><input form={f} name="units" type="number" min={1} max={50} defaultValue={r.units} readOnly={r.type === "room"} aria-label="Units" style={{ width: 70 }} /></td>
                      <td><input form={f} name="location" type="text" defaultValue={r.location} aria-label="Location" style={{ minWidth: 130 }} /></td>
                      <td>
                        <select form={f} name="primary" defaultValue={a[0]?.staffId} aria-label="Primary in-charge">
                          {incharges.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select form={f} name="fallback" defaultValue={a[1]?.staffId ?? ""} aria-label="Fallback in-charge">
                          <option value="">None</option>
                          {incharges.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td><input form={f} name="active" type="checkbox" defaultChecked={r.active} aria-label="Active" style={{ width: 20, height: 20 }} /></td>
                      <td>
                        <form id={f} action={saveResource}><input type="hidden" name="id" value={r.id} /><button className="btn btn-sm" type="submit">Save</button></form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <section className="panel">
            <h2>Add a lab or cart pool</h2>
            <form action={addResource}>
              <div className="row3">
                <div className="field"><label htmlFor="nr-name">Name</label><input id="nr-name" name="name" type="text" required /></div>
                <div className="field">
                  <label htmlFor="nr-type">Type</label>
                  <select id="nr-type" name="type"><option value="room">Room</option><option value="cart_pool">Cart pool</option></select>
                </div>
                <div className="field"><label htmlFor="nr-units">Units (carts)</label><input id="nr-units" name="units" type="number" min={1} defaultValue={1} /></div>
              </div>
              <div className="row2">
                <div className="field"><label htmlFor="nr-p">Primary in-charge</label><select id="nr-p" name="primary">{incharges.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div className="field"><label htmlFor="nr-f">Fallback</label><select id="nr-f" name="fallback"><option value="">None</option>{incharges.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <button className="btn btn-primary" type="submit">Add</button>
            </form>
          </section>
        </div>
      )}

      {tab === "timetables" && (
        <div className="cols">
          <section className="stack">
            {timetables.map((t) => (
              <div key={t.id} className="panel">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ marginBottom: 2 }}>{t.name}</h3>
                    <div className="small muted">
                      {t.weekdays.map((d) => WD[d - 1]).join(", ")} · {t.validFrom || t.validTo ? `${t.validFrom ? fmtDateShort(t.validFrom) : "start"} to ${t.validTo ? fmtDateShort(t.validTo) : "open"}` : "all year"}
                      {timetableForDate(timetables, today)?.id === t.id ? " · in use today" : ""}
                    </div>
                  </div>
                  {t.id !== "tt-standard" && (
                    <form action={retireTimetable}><input type="hidden" name="id" value={t.id} /><button className="btn btn-sm" type="submit">Remove</button></form>
                  )}
                </div>
                <table className="data" style={{ marginTop: 8 }}>
                  <tbody>
                    {t.blocks.map((b) => (
                      <tr key={b.id}><td>{b.code}</td><td className="tnum">{b.start}–{b.end}</td><td className="small muted">{b.bookable ? "" : "Not bookable"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Add a timetable</h2>
            <p className="small muted">For Fridays, Ramadan or exam weeks. On any date the most specific timetable wins: a date range beats a weekday rule, which beats Standard.</p>
            <form action={addTimetable}>
              <div className="field"><label htmlFor="t-name">Name</label><input id="t-name" name="name" type="text" required placeholder="Ramadan" /></div>
              <div className="row2">
                <div className="field"><label htmlFor="t-from">From <span className="muted">(optional)</span></label><input id="t-from" name="validFrom" type="date" /></div>
                <div className="field"><label htmlFor="t-to">To <span className="muted">(optional)</span></label><input id="t-to" name="validTo" type="date" /></div>
              </div>
              <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
                <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Weekdays</legend>
                <div className="chips">
                  {WD.slice(0, 5).map((d, i) => (
                    <label key={d} className="chip" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" name="weekdays" value={i + 1} defaultChecked /> {d}</label>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <label htmlFor="t-blocks">Blocks, one per line</label>
                <textarea id="t-blocks" name="blocks" rows={10} className="tnum" defaultValue={"P1 08:00-08:40\nP2 08:40-09:20\nP3 09:20-10:00\nBreak 10:00-10:15 *\nP4 10:15-10:55\nP5 10:55-11:35\nP6 11:35-12:15\nP7 12:15-12:55"} />
                <div className="hint">Code, start and end. Add * at the end for breaks that cannot be booked. Times shown are an example only.</div>
              </div>
              <button className="btn btn-primary" type="submit">Add timetable</button>
            </form>
          </section>
        </div>
      )}

      {tab === "blackouts" && <BlackoutsTab today={today} resources={resources} />}

      {tab === "staff" && (
        <div className="cols">
          <section>
            <h2>{staff.length} staff</h2>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th><span className="sr-only">Status</span></th></tr></thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="small">{s.email}</td>
                      <td>{s.department}</td>
                      <td>{s.role}</td>
                      <td>
                        <form action={setStaffActive}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="active" value={s.active ? "0" : "1"} />
                          <button className="btn btn-sm" type="submit">{s.active ? "Deactivate" : "Reactivate"}</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>Import staff from CSV</h2>
            <StaffImport />
          </section>
        </div>
      )}

      {tab === "rules" && (
        <section className="panel" style={{ maxWidth: 560 }}>
          <h2>Booking rules</h2>
          <form action={saveRules}>
            <div className="row2">
              <div className="field"><label htmlFor="r-min">Book at least (hours ahead)</label><input id="r-min" name="minLeadHours" type="number" min={0} defaultValue={settings.minLeadHours} /></div>
              <div className="field"><label htmlFor="r-max">Book at most (days ahead)</label><input id="r-max" name="maxLeadDays" type="number" min={1} defaultValue={settings.maxLeadDays} /></div>
            </div>
            <div className="row2">
              <div className="field"><label htmlFor="r-cancel">Cancel up to (hours before)</label><input id="r-cancel" name="cancelCutoffHours" type="number" min={0} defaultValue={settings.cancelCutoffHours} /></div>
              <div className="field"><label htmlFor="r-carts">Most carts per booking</label><input id="r-carts" name="maxCartsPerBooking" type="number" min={1} defaultValue={settings.maxCartsPerBooking} /></div>
            </div>
            <p className="small muted">Admins can always book outside the window; those bookings are marked as overrides in the audit log.</p>
            <button className="btn btn-primary" type="submit">Save rules</button>
          </form>
        </section>
      )}

      {tab === "system" && <SystemTab down={settings.mockCalendarDown} />}
      {tab === "audit" && <AuditTab />}
    </div>
  );

  async function BlackoutsTab({ today, resources }: { today: string; resources: { id: string; name: string }[] }) {
    const list = (await getBlackouts(db, addDays(today, -30), addDays(today, 365))).sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
    return (
      <div className="cols">
        <section>
          {list.length === 0 ? (
            <div className="empty">No blackout dates. Add holidays and exam weeks so they show on the grid.</div>
          ) : (
            <ul className="list">
              {list.map((b) => (
                <li key={b.id}>
                  <div className="what">
                    <strong>{b.resourceId ? resources.find((r) => r.id === b.resourceId)?.name : "All labs and carts"}</strong>: {b.reason}
                    {b.note ? ` (${b.note})` : ""}
                    <div className="small muted">{fmtDateShort(b.dateFrom)}{b.dateTo !== b.dateFrom ? ` to ${fmtDateShort(b.dateTo)}` : ""} · {b.blockCodes ? b.blockCodes.join(", ") : "whole day"}</div>
                  </div>
                  <form action={removeBlackout}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="back" value="/admin?tab=blackouts" /><button className="btn btn-sm" type="submit">Remove</button></form>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2>Add blackout</h2>
          <form action={blockTime}>
            <input type="hidden" name="back" value="/admin?tab=blackouts" />
            <div className="row2">
              <div className="field">
                <label htmlFor="bo-res">Applies to</label>
                <select id="bo-res" name="resourceId"><option value="all">All labs and carts</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              </div>
              <div className="field">
                <label htmlFor="bo-reason">Reason</label>
                <select id="bo-reason" name="reason"><option value="holiday">Holiday</option><option value="exam">Exams</option><option value="maintenance">Maintenance</option><option value="training">Training</option><option value="other">Other</option></select>
              </div>
            </div>
            <div className="row2">
              <div className="field"><label htmlFor="bo-from">From</label><input id="bo-from" name="dateFrom" type="date" required /></div>
              <div className="field"><label htmlFor="bo-to">To</label><input id="bo-to" name="dateTo" type="date" /></div>
            </div>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
              <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Blocks <span className="muted">(none ticked = whole day)</span></legend>
              <div className="chips">{["P1", "P2", "P3", "P4", "P5", "P6", "P7"].map((c) => <label key={c} className="chip" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" name="blocks" value={c} /> {c}</label>)}</div>
            </fieldset>
            <div className="field"><label htmlFor="bo-note">Note</label><input id="bo-note" name="note" type="text" maxLength={120} placeholder="e.g. National Day" /></div>
            <button className="btn btn-primary" type="submit">Add blackout</button>
          </form>
        </section>
      </div>
    );
  }

  async function SystemTab({ down }: { down: boolean }) {
    const { conflicts, world } = await currentConflicts(db);
    const jobs = await db.query<{ id: string; kind: string; status: string; attempts: number; last_error: string | null; run_after: Date; payload: { bookingId?: string } }>(
      "SELECT id, kind, status, attempts, last_error, run_after, payload FROM jobs WHERE status <> 'done' ORDER BY created_at DESC LIMIT 50",
    );
    const details = await Promise.all(conflicts.map((c) => getBookingDetail(db, c.bookingId)));
    return (
      <div className="stack">
        <section className="panel">
          <h2>Calendar connection</h2>
          <p>
            Provider: <strong>Simulated calendar</strong> (Google or Microsoft connects here once Fortes IT grants access).{" "}
            {world.calendarChecked ? <span className="tag tag-ok">Reachable</span> : <span className="tag tag-bad">Unreachable</span>}
          </p>
          <form action={toggleCalendarOutage} className="btn-row">
            <input type="hidden" name="down" value={down ? "0" : "1"} />
            <button className="btn" type="submit">{down ? "End simulated outage" : "Simulate a calendar outage"}</button>
            <span className="small muted">Bookings keep working during an outage; calendar writes queue and retry, and admin is emailed after 3 failures.</span>
          </form>
        </section>
        <section className="panel">
          <h2>Scheduled jobs</h2>
          <p className="small muted">In production these run on a timer: reminders and calendar checks every 15 minutes, the in-charge digest at 07:00.</p>
          <div className="btn-row">
            <form action="/api/v1/cron?tasks=jobs,reminders,conflicts" method="post"><input type="hidden" name="x" value="1" /><button className="btn" type="submit">Run reminders, retries and clash check</button></form>
            <form action="/api/v1/cron?tasks=digest" method="post"><input type="hidden" name="x" value="1" /><button className="btn" type="submit">Send today&apos;s 07:00 digest</button></form>
          </div>
        </section>
        <section>
          <h2>Calendar clashes ({conflicts.length})</h2>
          {conflicts.length === 0 ? (
            <div className="empty">No clashes between bookings and in-charge calendars.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Booking</th><th>In-charge</th><th>Clashing event</th></tr></thead>
                <tbody>
                  {conflicts.map((c, i) => (
                    <tr key={i}>
                      <td>{details[i] ? `${fmtDateShort(details[i]!.date)} ${details[i]!.blockLabel} · ${details[i]!.resourceName} · ${details[i]!.teacherName}` : c.bookingId}</td>
                      <td>{world.staffRows.find((s) => s.id === c.inchargeId)?.name}</td>
                      <td>{c.eventTitle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section>
          <h2>Pending and failed jobs ({jobs.length})</h2>
          {jobs.length === 0 ? (
            <div className="empty">Nothing waiting. All calendar writes and emails went through.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Job</th><th>Booking</th><th>Status</th><th className="num">Attempts</th><th>Last error</th></tr></thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}><td>{j.kind}</td><td className="small">{j.payload.bookingId}</td><td>{j.status}</td><td className="num">{j.attempts}</td><td className="small">{j.last_error}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  async function AuditTab() {
    const rows = await db.query<{ id: number; at: Date; actor: string | null; action: string; entity: string; entity_id: string | null }>(
      "SELECT a.id, a.at, s.name AS actor, a.action, a.entity, a.entity_id FROM audit_log a LEFT JOIN staff s ON s.id = a.actor_id ORDER BY a.id DESC LIMIT 200",
    );
    return (
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>When (Dubai)</th><th>Who</th><th>Action</th><th>Item</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="tnum small">{new Date(new Date(r.at).getTime() + 4 * 3600_000).toISOString().slice(0, 16).replace("T", " ")}</td>
                <td>{r.actor ?? "System"}</td>
                <td>{r.action}</td>
                <td className="small">{r.entity} {r.entity_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}
