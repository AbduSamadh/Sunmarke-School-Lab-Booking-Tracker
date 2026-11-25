import { addDays, localDate, timetableForDate } from "@sunmarke/rules";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getAssignments, getBlackouts, getResources, getSettings, getStaff, getTimetables } from "@/lib/server/world";
import { currentConflicts } from "@/lib/server/scheduled";
import { campusOf, getBookingDetail, listBookings } from "@/lib/server/bookings";
import { ensureCheckinCodes } from "@/lib/server/release11";
import { IssuesPanel } from "@/components/IssuesPanel";
import QRCode from "qrcode";
import { PrintButton } from "@/components/PrintButton";
import { now } from "@/lib/server/util";
import { fmtDateShort } from "@/lib/shared/format";
import { StaffImport } from "@/components/StaffImport";
import { blockTime, removeBlackout } from "../incharge/actions";
import { addCampus, addLevel, addResource, importLevels, saveLevel, addTimetable, reassign, retireTimetable, saveCampus, saveLinks, saveResource, saveRules, setStaffActive, setStaffCampus, toggleCalendarOutage } from "./actions";

const TABS = [
  ["resources", "Labs and carts"],
  ["bookings", "Bookings"],
  ["issues", "Equipment"],
  ["timetables", "Timetables"],
  ["blackouts", "Blackout dates"],
  ["staff", "Staff"],
  ["rules", "Rules"],
  ["curriculum", "Curriculum"],
  ["qr", "QR codes"],
  ["system", "Calendar and jobs"],
  ["audit", "Audit log"],
  ["campuses", "Campuses"],
] as const;
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; error?: string; ran?: string }> }) {
  const actor = await requireActor(["admin"]);
  const sp = await searchParams;
  const tabs = TABS.filter(([k]) => k !== "campuses" || actor.allCampuses);
  const tab = tabs.some(([k]) => k === sp.tab) ? sp.tab! : "resources";
  const db = await getDb();
  const settings = await getSettings(db);
  const today = localDate(now(), settings);
  // Release 2: an admin works on one campus at a time; group admins switch campus in the top bar.
  const campus = campusOf(actor);
  const [allResources, allStaff, assignments, allTimetables, campuses] = await Promise.all([
    getResources(db),
    getStaff(db),
    getAssignments(db),
    getTimetables(db),
    db.query<{ id: string; name: string; short_name: string; active: boolean }>("SELECT id, name, short_name, active FROM campuses ORDER BY sort, name"),
  ]);
  const resources = allResources.filter((r) => r.campusId === campus);
  const staff = actor.allCampuses ? allStaff : allStaff.filter((s) => s.campusId === campus);
  const timetables = allTimetables.filter((t) => t.campusId === campus);
  const incharges = allStaff.filter((s) => s.campusId === campus && s.active && (s.role === "incharge" || s.role === "admin"));
  const campusName = campuses.find((c) => c.id === campus)?.name ?? campus;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="muted" style={{ margin: 0 }}>{campuses.length > 1 ? `${campusName}. ` : ""}Every change here is recorded in the audit log.</p>
        </div>
      </div>
      <nav className="tabs" aria-label="Admin sections">
        {tabs.map(([k, l]) => (
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
            <h2>Lesson resources</h2>
            <p className="small muted">Links teachers see when they book and in the confirmation email: safety rules, lesson ideas, how-to guides. One per line, as &ldquo;Label | https://&hellip;&rdquo;.</p>
            <div className="cols">
              {resources.map((r) => (
                <form key={r.id} action={saveLinks}>
                  <input type="hidden" name="id" value={r.id} />
                  <div className="field">
                    <label htmlFor={`links-${r.id}`}>{r.name}</label>
                    <textarea id={`links-${r.id}`} name="links" rows={3} defaultValue={r.links.map((l) => `${l.label} | ${l.url}`).join("\n")} />
                  </div>
                  <button className="btn btn-sm" type="submit">Save links</button>
                </form>
              ))}
            </div>
          </section>
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
                <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th>{actor.allCampuses && <th>Campus</th>}<th><span className="sr-only">Status</span></th></tr></thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="small">{s.email}</td>
                      <td>{s.department}</td>
                      <td>{s.role}</td>
                      {actor.allCampuses && (
                        <td>
                          <form action={setStaffCampus} className="btn-row">
                            <input type="hidden" name="id" value={s.id} />
                            <label className="sr-only" htmlFor={`sc-${s.id}`}>Campus for {s.name}</label>
                            <select id={`sc-${s.id}`} name="campusId" defaultValue={s.campusId}>
                              {campuses.filter((c) => c.active || c.id === s.campusId).map((c) => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
                            </select>
                            <label className="small"><input type="checkbox" name="allCampuses" defaultChecked={s.allCampuses} /> All campuses</label>
                            <button className="btn btn-sm" type="submit">Save</button>
                          </form>
                        </td>
                      )}
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
            <h3 style={{ marginTop: 8 }}>Fair use</h3>
            <div className="row2">
              <div className="field"><label htmlFor="r-qt">Blocks per teacher per week</label><input id="r-qt" name="quotaPerTeacherWeek" type="number" min={0} defaultValue={settings.quotaPerTeacherWeek} /></div>
              <div className="field"><label htmlFor="r-qd">Blocks per department per week</label><input id="r-qd" name="quotaPerDeptWeek" type="number" min={0} defaultValue={settings.quotaPerDeptWeek} /></div>
            </div>
            <p className="small muted">0 means no limit. Turn this on only if demand outgrows the labs; the admin can always book past it.</p>
            <h3 style={{ marginTop: 8 }}>Waitlist, series and attendance</h3>
            <div className="row3">
              <div className="field"><label htmlFor="r-hold">Hold a freed slot for (hours)</label><input id="r-hold" name="waitlistHoldHours" type="number" min={1} defaultValue={settings.waitlistHoldHours} /></div>
              <div className="field"><label htmlFor="r-rec">Series can run up to (days)</label><input id="r-rec" name="recurringMaxDays" type="number" min={7} defaultValue={settings.recurringMaxDays} /></div>
              <div className="field"><label htmlFor="r-ns">No-show after (minutes)</label><input id="r-ns" name="autoNoShowMinutes" type="number" min={0} defaultValue={settings.autoNoShowMinutes} /></div>
            </div>
            <p className="small muted">A lab session with no QR check-in that many minutes after the start is marked as a no-show (0 turns this off). Carts are delivered, so they are never marked.</p>
            <p className="small muted">Admins can always book outside the window; those bookings are marked as overrides in the audit log.</p>
            <button className="btn btn-primary" type="submit">Save rules</button>
          </form>
        </section>
      )}

      {tab === "curriculum" && <CurriculumTab />}
      {tab === "bookings" && <BookingsTab />}
      {tab === "issues" && <IssuesPanel db={db} resources={resources} back="/admin?tab=issues" today={today} />}
      {tab === "qr" && <QrTab />}
      {tab === "system" && <SystemTab down={settings.mockCalendarDown} />}
      {tab === "audit" && <AuditTab />}
      {tab === "campuses" && actor.allCampuses && (
        <div className="cols">
          <section className="stack">
            <p className="muted">Each campus has its own labs, in-charges, timetables and blackout dates. The booking rules on the Rules tab apply to every campus. Switch campus in the top bar to manage its labs.</p>
            {campuses.map((c) => (
              <form key={c.id} action={saveCampus} className="panel">
                <input type="hidden" name="id" value={c.id} />
                <div className="row2">
                  <div className="field"><label htmlFor={`cn-${c.id}`}>Name</label><input id={`cn-${c.id}`} name="name" type="text" defaultValue={c.name} required /></div>
                  <div className="field"><label htmlFor={`cs-${c.id}`}>Short name</label><input id={`cs-${c.id}`} name="shortName" type="text" defaultValue={c.short_name} /></div>
                </div>
                <div className="btn-row">
                  <label className="small"><input type="checkbox" name="active" defaultChecked={c.active} /> Open for booking</label>
                  <span className="small muted">{allResources.filter((r) => r.campusId === c.id && r.active).length} labs · {allStaff.filter((s) => s.campusId === c.id && s.active).length} staff</span>
                  <button className="btn btn-sm" type="submit">Save</button>
                </div>
              </form>
            ))}
          </section>
          <section className="panel">
            <h2>Add a campus</h2>
            <p className="small muted">It starts with the standard timetable. Then switch to it in the top bar, add its labs and in-charges, and import its staff.</p>
            <form action={addCampus}>
              <div className="field"><label htmlFor="nc-name">Name</label><input id="nc-name" name="name" type="text" required placeholder="e.g. Fortes Education campus" /></div>
              <div className="field"><label htmlFor="nc-short">Short name</label><input id="nc-short" name="shortName" type="text" /></div>
              <button className="btn btn-primary" type="submit">Add campus</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );

  async function BlackoutsTab({ today, resources }: { today: string; resources: { id: string; name: string }[] }) {
    const list = (await getBlackouts(db, addDays(today, -30), addDays(today, 365))).filter((b) => b.campusId === campus).sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
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
            <form action="/api/v1/cron?tasks=offers,noshow,feedback" method="post"><input type="hidden" name="x" value="1" /><button className="btn" type="submit">Expire offers, mark no-shows, ask for ratings</button></form>
            <form action="/api/v1/cron?tasks=weekly" method="post"><input type="hidden" name="x" value="1" /><button className="btn" type="submit">Send last week&apos;s report</button></form>
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

  async function CurriculumTab() {
    const levels = await db.query<{ id: string; code: string; strand: string; title: string; year_group: string; active: boolean; used: number }>(
      `SELECT l.*, (SELECT count(*)::int FROM bookings b WHERE l.id = ANY(b.curriculum_ids) AND b.status IN ('confirmed','completed','no_show')) AS used
         FROM curriculum_levels l ORDER BY l.active DESC, l.sort, l.code`,
    );
    const sample = (await db.query("SELECT 1 FROM meta WHERE key = 'curriculum_sample'")).length > 0;
    return (
      <div className="stack">
        {sample && (
          <div className="notice notice-warn" role="note">
            These are <strong>sample levels</strong> so curriculum mapping can be tried. Import the school&rsquo;s KS3 progressive plan below (tick &ldquo;Replace&rdquo;) before teachers tag real lessons.
          </div>
        )}
        <p className="muted">Teachers can tag a booking with up to 5 levels. The Reports page shows how often each level was taught and which have not been covered yet.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Code</th><th>Strand</th><th>Level</th><th>Year</th><th className="num">Sessions</th><th>In use</th><th><span className="sr-only">Save</span></th></tr></thead>
            <tbody>
              {levels.map((l) => {
                const f = `lvl-${l.id}`;
                return (
                  <tr key={l.id}>
                    <td><input form={f} name="code" type="text" defaultValue={l.code} aria-label={`Code for ${l.code}`} style={{ width: 80 }} /></td>
                    <td><input form={f} name="strand" type="text" defaultValue={l.strand} aria-label={`Strand for ${l.code}`} style={{ minWidth: 140 }} /></td>
                    <td><input form={f} name="title" type="text" defaultValue={l.title} aria-label={`Description for ${l.code}`} style={{ minWidth: 220 }} /></td>
                    <td><input form={f} name="yearGroup" type="text" defaultValue={l.year_group} aria-label={`Year group for ${l.code}`} style={{ width: 60 }} /></td>
                    <td className="num">{l.used}</td>
                    <td><input form={f} name="active" type="checkbox" defaultChecked={l.active} aria-label={`${l.code} in use`} style={{ width: 20, height: 20 }} /></td>
                    <td><form id={f} action={saveLevel}><input type="hidden" name="id" value={l.id} /><button className="btn btn-sm" type="submit">Save</button></form></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="cols">
          <section className="panel">
            <h2>Add a level</h2>
            <form action={addLevel}>
              <div className="row2">
                <div className="field"><label htmlFor="nl-code">Code</label><input id="nl-code" name="code" type="text" required placeholder="e.g. PR-8" /></div>
                <div className="field"><label htmlFor="nl-year">Year group</label><input id="nl-year" name="yearGroup" type="text" placeholder="e.g. Y8" /></div>
              </div>
              <div className="field"><label htmlFor="nl-strand">Strand</label><input id="nl-strand" name="strand" type="text" required placeholder="e.g. Programming" /></div>
              <div className="field"><label htmlFor="nl-title">Level</label><input id="nl-title" name="title" type="text" required placeholder="What students can do at this level" /></div>
              <button className="btn btn-primary" type="submit">Add level</button>
            </form>
          </section>
          <section className="panel">
            <h2>Import the plan</h2>
            <p className="small muted">Paste CSV with one level per line: code, strand, level, year. A header line is fine. Existing codes are updated.</p>
            <form action={importLevels}>
              <div className="field">
                <label htmlFor="il-csv">CSV</label>
                <textarea id="il-csv" name="csv" rows={6} required placeholder={"code,strand,title,year\nPR-8,Programming,Move from blocks to text-based code,Y8"} />
              </div>
              <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}>
                <input type="checkbox" name="replace" defaultChecked={sample} style={{ width: 20, height: 20 }} /> Replace: retire every level that is not in this file
              </label>
              <button className="btn btn-primary" type="submit">Import</button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  async function BookingsTab() {
    const ids = new Set(resources.map((r) => r.id));
    const list = (await listBookings(db, { from: today, to: addDays(today, settings.maxLeadDays + 7), status: ["confirmed"] })).filter((b) => ids.has(b.resourceId));
    const people = incharges;
    return (
      <div className="stack">
        <p className="muted">Move a booking to another in-charge. &ldquo;Whoever is free&rdquo; tries the usual pair first. The teacher and both in-charges are emailed and calendars are updated.</p>
        {list.length === 0 ? (
          <div className="empty">No upcoming bookings.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>When</th><th>Lab</th><th>Teacher and class</th><th>In-charge</th><th>Reassign to</th></tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td className="tnum">{fmtDateShort(b.date)} {b.blockLabel}<div className="small muted">{b.timeLabel}</div></td>
                    <td>{b.resourceName}{b.cartCount ? ` · ${b.cartCount} carts` : ""}</td>
                    <td>{b.teacherName}<div className="small muted">{b.classLabel} · {b.subject}</div></td>
                    <td>{b.inchargeName}{b.crossCover ? <span className="small muted"> (cover)</span> : null}</td>
                    <td>
                      <form action={reassign} className="btn-row">
                        <input type="hidden" name="id" value={b.id} />
                        <label className="sr-only" htmlFor={`ra-${b.id}`}>New in-charge for {b.resourceName} {fmtDateShort(b.date)} {b.blockLabel}</label>
                        <select id={`ra-${b.id}`} name="staffId" defaultValue="auto">
                          <option value="auto">Whoever is free</option>
                          {people.filter((p) => p.id !== b.inchargeId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <label className="sr-only" htmlFor={`rr-${b.id}`}>Reason</label>
                        <input id={`rr-${b.id}`} name="reason" type="text" maxLength={120} placeholder="Reason" style={{ width: 130 }} />
                        <button className="btn btn-sm" type="submit">Move</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  async function QrTab() {
    await ensureCheckinCodes(db);
    const rows = (await getResources(db)).filter((r) => r.campusId === campus && r.active && r.type === "room" && r.checkinCode);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const codes = await Promise.all(rows.map(async (r) => ({ r, url: `${appUrl}/checkin/${r.checkinCode}`, svg: await QRCode.toString(`${appUrl}/checkin/${r.checkinCode}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) })));
    return (
      <div className="stack">
        <div className="btn-row no-print">
          <p className="muted" style={{ margin: 0, flex: 1 }}>Print these and stick one by each lab door. Teachers scan it at the start of the lesson to mark attendance; sessions with no scan become no-shows after {settings.autoNoShowMinutes} minutes.</p>
          <PrintButton />
        </div>
        <div className="qr-sheet">
          {codes.map(({ r, url, svg }) => (
            <div key={r.id} className="qr-card">
              <h2 style={{ marginBottom: 0 }}>{r.name}</h2>
              <div className="small muted">Scan to check in</div>
              <div role="img" aria-label={`QR code for ${r.name} check-in`} dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="small muted" style={{ wordBreak: "break-all" }}>{url}</div>
            </div>
          ))}
        </div>
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
