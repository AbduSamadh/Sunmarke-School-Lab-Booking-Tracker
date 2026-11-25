import { addDays, localDate } from "@sunmarke/rules";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { listBookings } from "@/lib/server/bookings";
import { getBlackouts, getResources, getSettings, getStaff } from "@/lib/server/world";
import { now } from "@/lib/server/util";
import { fmtDateLong, fmtDateShort } from "@/lib/shared/format";
import { SessionActions } from "@/components/SessionActions";
import { addMeeting, blockTime, removeBlackout } from "./actions";

export default async function InchargePage({ searchParams }: { searchParams: Promise<{ who?: string; saved?: string; error?: string }> }) {
  const actor = await requireActor(["incharge", "admin"]);
  const db = await getDb();
  const sp = await searchParams;
  const settings = await getSettings(db);
  const t = now();
  const today = localDate(t, settings);
  const staff = await getStaff(db);
  const incharges = staff.filter((s) => s.role === "incharge");
  const who = actor.role === "incharge" ? actor.id : incharges.some((i) => i.id === sp.who) ? sp.who! : "all";
  const whoName = who === "all" ? "All in-charges" : staff.find((s) => s.id === who)?.name;
  const list = (await listBookings(db, { from: today, to: addDays(today, 7), status: ["confirmed", "completed", "no_show"] })).filter((b) => who === "all" || b.inchargeId === who);
  const todays = list.filter((b) => b.date === today);
  const next = todays.find((b) => b.end.getTime() > t.getTime() && b.status === "confirmed");
  const later = list.filter((b) => b.date > today && b.date <= addDays(today, 7));
  const resources = await getResources(db);
  const blackouts = (await getBlackouts(db, today, addDays(today, 60))).sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Today, {fmtDateLong(today)}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {whoName}: {todays.length} session{todays.length === 1 ? "" : "s"} today{next ? `. Next: ${next.blockLabel} ${next.resourceName}` : ""}.
          </p>
        </div>
        {actor.role === "admin" && (
          <div className="chips">
            {[{ id: "all", name: "All" }, ...incharges].map((i) => (
              <a key={i.id} className="chip" href={`/incharge?who=${i.id}`} aria-current={who === i.id ? "true" : undefined}>{i.name}</a>
            ))}
          </div>
        )}
      </div>
      {sp.saved && <div className="notice notice-ok" role="status">Saved.</div>}
      {sp.error && <div className="notice notice-bad" role="alert">{sp.error}</div>}

      {todays.length === 0 ? (
        <div className="empty">No sessions today. {later.length ? `Next one: ${fmtDateShort(later[0].date)} ${later[0].blockLabel}.` : ""}</div>
      ) : (
        <ul className="list timeline">
          {todays.map((b) => (
            <li key={b.id} className={b.id === next?.id ? "next" : ""}>
              <div className="when">
                <strong>{b.blockLabel}</strong>
                <span className="small muted">{b.timeLabel}</span>
                {b.id === next?.id && <span className="tag tag-ok" style={{ marginTop: 4 }}>Next</span>}
              </div>
              <div className="what">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="swatch" style={{ background: `var(--r-${b.resourceColour})` }} aria-hidden="true" />
                  <strong>{b.resourceName}</strong>
                  {b.cartCount ? <span>{b.cartCount} carts to {b.classroom}</span> : null}
                  {who === "all" && <span className="tag">{b.inchargeName}</span>}
                </div>
                <div className="small muted">
                  {b.teacherName} · {b.classLabel} · {b.subject} · {b.studentCount} students
                </div>
                {b.objective && <div className="small">Objective: {b.objective}</div>}
                {b.specialRequirements && <div className="small"><strong>Note:</strong> {b.specialRequirements}</div>}
              </div>
              <SessionActions id={b.id} status={b.status} canMark={b.start.getTime() - t.getTime() <= 30 * 60_000} />
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ marginTop: 28 }}>Next 7 days</h2>
      {later.length === 0 ? (
        <div className="empty">Nothing booked yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>When</th><th>Lab</th><th>Class</th><th>Teacher</th>{who === "all" && <th>In-charge</th>}<th>Notes</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {later.map((b) => (
                <tr key={b.id}>
                  <td className="tnum">{fmtDateShort(b.date)} {b.blockLabel}<div className="small muted">{b.timeLabel}</div></td>
                  <td>{b.resourceName}{b.cartCount ? ` · ${b.cartCount} carts to ${b.classroom}` : ""}</td>
                  <td>{b.classLabel} · {b.subject}</td>
                  <td>{b.teacherName}</td>
                  {who === "all" && <td>{b.inchargeName}{b.crossCover ? " (cover)" : ""}</td>}
                  <td className="small">{b.specialRequirements || "–"}</td>
                  <td><SessionActions id={b.id} status={b.status} canMark={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted" style={{ marginTop: 8 }}>You also get each day&apos;s list by email at 07:00.</p>

      <div className="cols" style={{ marginTop: 28 }}>
        <section className="panel">
          <h2>Block time</h2>
          <p className="small muted">For maintenance or training. Teachers see the reason on the grid. Existing bookings stay; cancel them separately if needed.</p>
          <form action={blockTime}>
            <input type="hidden" name="back" value="/incharge" />
            <div className="row2">
              <div className="field">
                <label htmlFor="b-res">Lab</label>
                <select id="b-res" name="resourceId" required>
                  {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  {actor.role === "admin" && <option value="all">All labs and carts</option>}
                </select>
              </div>
              <div className="field">
                <label htmlFor="b-reason">Reason</label>
                <select id="b-reason" name="reason">
                  <option value="maintenance">Maintenance</option>
                  <option value="training">Training</option>
                  {actor.role === "admin" && <option value="exam">Exams</option>}
                  {actor.role === "admin" && <option value="holiday">Holiday</option>}
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="b-from">From</label>
                <input id="b-from" name="dateFrom" type="date" required min={today} />
              </div>
              <div className="field">
                <label htmlFor="b-to">To <span className="muted">(optional)</span></label>
                <input id="b-to" name="dateTo" type="date" min={today} />
              </div>
            </div>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
              <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Blocks <span className="muted">(none ticked = whole day)</span></legend>
              <div className="chips">
                {["P1", "P2", "P3", "P4", "P5", "P6", "P7"].map((c) => (
                  <label key={c} className="chip" style={{ margin: 0, fontWeight: 400 }}>
                    <input type="checkbox" name="blocks" value={c} /> {c}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="b-note">Note for teachers <span className="muted">(optional)</span></label>
              <input id="b-note" name="note" type="text" maxLength={120} placeholder="e.g. Printer service" />
            </div>
            <button className="btn btn-primary" type="submit">Block time</button>
          </form>
          {blackouts.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>Coming up</h3>
              <ul className="list">
                {blackouts.map((b) => (
                  <li key={b.id}>
                    <div className="what">
                      <strong>{b.resourceId ? resources.find((r) => r.id === b.resourceId)?.name : "All labs"}</strong>: {b.reason}
                      {b.note ? ` (${b.note})` : ""}
                      <div className="small muted">
                        {fmtDateShort(b.dateFrom)}{b.dateTo !== b.dateFrom ? ` to ${fmtDateShort(b.dateTo)}` : ""} · {b.blockCodes ? b.blockCodes.join(", ") : "whole day"}
                      </div>
                    </div>
                    <form action={removeBlackout}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="back" value="/incharge" />
                      <button className="btn btn-sm" type="submit">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="panel">
          <h2>Calendar meeting (simulated)</h2>
          <p className="small muted">
            Until your Google or Outlook calendar is connected, add meetings here to see how the app reacts: new bookings avoid them and clashes with existing bookings are flagged to admin.
          </p>
          <form action={addMeeting}>
            {actor.role === "admin" && (
              <div className="field">
                <label htmlFor="m-who">Whose calendar</label>
                <select id="m-who" name="staffId">{incharges.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
              </div>
            )}
            <div className="field">
              <label htmlFor="m-title">Title</label>
              <input id="m-title" name="title" type="text" maxLength={80} defaultValue="Department meeting" />
            </div>
            <div className="row3">
              <div className="field"><label htmlFor="m-date">Date</label><input id="m-date" name="date" type="date" required min={today} /></div>
              <div className="field"><label htmlFor="m-start">Start</label><input id="m-start" name="start" type="time" required defaultValue="10:00" /></div>
              <div className="field"><label htmlFor="m-end">End</label><input id="m-end" name="end" type="time" required defaultValue="11:00" /></div>
            </div>
            <button className="btn" type="submit">Add to calendar</button>
          </form>
        </section>
      </div>
    </div>
  );
}
