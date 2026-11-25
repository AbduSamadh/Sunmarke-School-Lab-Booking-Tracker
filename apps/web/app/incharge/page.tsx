import { addDays, isoWeekday, localDate, mondayOf, timetableForDate, type Block } from "@sunmarke/rules";
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock, Plane, Wrench, ArrowRight, ShieldAlert, Users, Ban } from "lucide-react";
import { requireActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { campusOf, listBookings, type BookingDetail } from "@/lib/server/bookings";
import { getAbsences, getBlackouts, getResources, getSettings, getStaff, getTimetables } from "@/lib/server/world";
import { listIssues } from "@/lib/server/release11";
import { IssuesPanel } from "@/components/IssuesPanel";
import { now } from "@/lib/server/util";
import { dayName, dayNum, fmtDateLong, fmtDateShort } from "@/lib/shared/format";
import { SessionActions } from "@/components/SessionActions";
import { LabIcon } from "@/components/LabIcon";
import { addLeave, addMeeting, blockTime, cancelLeave, removeBlackout } from "./actions";

type Tab = "schedule" | "block" | "leave" | "equipment" | "calendar";
const TABS: { id: Tab; label: string; icon: typeof Clock }[] = [
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "block", label: "Block time", icon: Ban },
  { id: "leave", label: "Leave", icon: Plane },
  { id: "equipment", label: "Equipment", icon: Wrench },
  { id: "calendar", label: "Test calendar", icon: CalendarClock },
];
const BLOCKS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"];

type SP = { who?: string; saved?: string; error?: string; leave?: string; tab?: string; week?: string };

export default async function InchargePage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor(["incharge", "admin"]);
  const db = await getDb();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "schedule";
  const settings = await getSettings(db);
  const t = now();
  const today = localDate(t, settings);
  const campus = campusOf(actor);
  const staff = await getStaff(db);
  const incharges = staff.filter((s) => s.role === "incharge" && s.campusId === campus);
  const resources = (await getResources(db)).filter((r) => r.campusId === campus);
  const campusRes = new Set(resources.map((r) => r.id));
  const who = actor.role === "incharge" ? actor.id : incharges.some((i) => i.id === sp.who) ? sp.who! : "all";
  const mine = (b: BookingDetail) => who === "all" || b.inchargeId === who;

  // This week (or the week asked for); weekends roll to the next school week.
  const baseMon = mondayOf(isoWeekday(today) > 5 ? addDays(today, 2) : today);
  const mon = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? mondayOf(sp.week) : baseMon;
  const days = [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
  const fetchTo = days[4] > addDays(today, 14) ? days[4] : addDays(today, 14);
  const fetchFrom = mon < today ? mon : today;
  const all = (await listBookings(db, { from: fetchFrom, to: fetchTo, status: ["confirmed", "completed", "no_show"] })).filter(mine).filter((b) => campusRes.has(b.resourceId));
  const todays = all.filter((b) => b.date === today);
  const next = todays.find((b) => b.end.getTime() > t.getTime() && b.status === "confirmed");
  const week = all.filter((b) => b.date >= days[0] && b.date <= days[4]);
  const upcoming = all.filter((b) => b.date > today).slice(0, 4);

  const absences = (await getAbsences(db, today, addDays(today, 120)))
    .filter((a) => (actor.role === "admin" ? who === "all" || a.staffId === who : a.staffId === actor.id))
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
  const blackouts = (await getBlackouts(db, today, addDays(today, 60))).filter((b) => b.campusId === campus).sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
  const issues = (await listIssues(db, "open")).filter((i) => campusRes.has(i.resource_id));
  const timetables = (await getTimetables(db)).filter((x) => x.campusId === campus);
  const [leaveMoved, leaveUncovered] = (sp.leave ?? "").split("-").map(Number);

  const firstName = actor.role === "incharge" ? actor.name.split(" ")[0] : null;
  const whoName = who === "all" ? "All in-charges" : staff.find((s) => s.id === who)?.name ?? "";
  const qs = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (who !== "all" && actor.role === "admin") q.set("who", who);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    const s = q.toString();
    return `/incharge${s ? `?${s}` : ""}`;
  };
  const back = (tabId: Tab) => qs({ tab: tabId === "schedule" ? undefined : tabId });
  const counts: Partial<Record<Tab, number>> = { block: blackouts.length, leave: absences.length, equipment: issues.length };
  const mins = next ? Math.round((next.start.getTime() - t.getTime()) / 60_000) : 0;

  return (
    <div className="ic">
      <div className="page-head hero ic-hero">
        <div>
          <p className="eyebrow">{actor.role === "incharge" ? "Lab in-charge" : `Lab admin · ${whoName}`}</p>
          <h1>{firstName ? `${greet(t)}, ${firstName}` : "In-charge schedule"}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {fmtDateLong(today)} · {todays.length} session{todays.length === 1 ? "" : "s"} today
            {next ? ` · next ${next.blockLabel} ${next.resourceName} ${mins > 0 ? `in ${fmtMins(mins)}` : "now"}` : ""}
          </p>
        </div>
        {actor.role === "admin" && (
          <div className="chips" role="group" aria-label="Show in-charge">
            {[{ id: "all", name: "All" }, ...incharges].map((i) => (
              <a key={i.id} className="chip" href={`/incharge?who=${i.id}${tab !== "schedule" ? `&tab=${tab}` : ""}`} aria-current={who === i.id ? "true" : undefined}>{i.name}</a>
            ))}
          </div>
        )}
      </div>

      <nav className="ic-tabs" aria-label="In-charge sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <a key={id} href={back(id)} aria-current={tab === id ? "page" : undefined}>
            <Icon size={16} aria-hidden="true" />
            {label}
            {counts[id] ? <span className="ic-count" aria-label={`${counts[id]} items`}>{counts[id]}</span> : null}
          </a>
        ))}
      </nav>

      {sp.saved && <div className="notice notice-ok" role="status">Saved.</div>}
      {sp.error && <div className="notice notice-bad" role="alert">{sp.error}</div>}
      {sp.leave && (
        <div className={`notice ${leaveUncovered ? "notice-warn" : "notice-ok"}`} role="status">
          Leave saved. {leaveMoved ? `${leaveMoved} booking${leaveMoved === 1 ? "" : "s"} moved to the other in-charge; the teachers were emailed.` : "No bookings needed moving."}
          {leaveUncovered ? ` ${leaveUncovered} could not be covered; the teachers and the lab admin were told.` : ""}
        </div>
      )}

      {tab === "schedule" && (
        <>
          <ul className="ic-stats" aria-label="At a glance">
            <Stat icon={Clock} v={String(todays.length)} l="Sessions today" />
            <Stat icon={CalendarDays} v={String(week.length)} l={mon === baseMon ? "This week" : `Week of ${fmtDateShort(mon)}`} />
            <Stat icon={Users} v={String(week.filter((b) => b.crossCover).length)} l="Covering the other lab" />
            <Stat icon={ShieldAlert} v={String(issues.length)} l="Open equipment issues" href={back("equipment")} />
          </ul>

          <div className="ic-layout">
            <section className="ic-cal" aria-labelledby="cal-title">
              <div className="ic-cal-head">
                <h2 id="cal-title">Week of {fmtDateShort(mon)}</h2>
                <div className="weeknav">
                  <a className="btn btn-sm" href={qs({ week: addDays(mon, -7) })} aria-label="Previous week"><ChevronLeft size={16} aria-hidden="true" /> Prev</a>
                  <a className="btn btn-sm" href={qs({})}>This week</a>
                  <a className="btn btn-sm" href={qs({ week: addDays(mon, 7) })} aria-label="Next week">Next <ChevronRight size={16} aria-hidden="true" /></a>
                </div>
              </div>
              <WeekCalendar days={days} today={today} bookings={week} timetables={timetables} blackouts={blackouts} absences={absences} resources={resources} showWho={who === "all"} />
              <p className="small muted" style={{ marginTop: 8 }}>You also get each day&apos;s list by email at 07:00.</p>
            </section>

            <aside className="ic-side" aria-label="Today">
              <section className="ic-today">
                <h2>Today</h2>
                {todays.length === 0 ? (
                  <div className="empty">No sessions today.</div>
                ) : (
                  <ol className="ic-timeline">
                    {todays.map((b) => (
                      <li key={b.id} className={b.id === next?.id ? "is-next" : b.end.getTime() <= t.getTime() ? "is-past" : ""}>
                        <div className="ic-tl-time">
                          <strong>{b.blockLabel}</strong>
                          <span>{b.timeLabel}</span>
                        </div>
                        <div className="ic-tl-body">
                          {b.id === next?.id && <span className="tag tag-ok">Next{mins > 0 ? ` · in ${fmtMins(mins)}` : " · now"}</span>}
                          <div className="ic-tl-title"><LabIcon colour={b.resourceColour} size="xs" /><strong>{b.resourceName}</strong></div>
                          <div className="small muted">
                            {b.cartCount ? `${b.cartCount} carts to ${b.classroom} · ` : ""}{b.classLabel} {b.subject} · {b.studentCount} students · {b.teacherName}
                            {who === "all" ? ` · ${b.inchargeName}` : ""}
                          </div>
                          {b.specialRequirements && <div className="small ic-note"><strong>Note:</strong> {b.specialRequirements}</div>}
                          <SessionActions id={b.id} status={b.status} canMark={b.start.getTime() - t.getTime() <= 30 * 60_000} />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="ic-soon">
                <h2>Coming up</h2>
                {upcoming.length === 0 ? (
                  <p className="small muted">Nothing booked in the next two weeks.</p>
                ) : (
                  <ul>
                    {upcoming.map((b) => (
                      <li key={b.id}>
                        <LabIcon colour={b.resourceColour} size="xs" />
                        <span><strong>{fmtDateShort(b.date)} {b.blockLabel}</strong> {b.resourceName}<span className="small muted"> · {b.classLabel} · {b.teacherName}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
                {(absences[0] || blackouts[0]) && (
                  <div className="ic-soon-flags">
                    {absences[0] && (
                      <a href={back("leave")}><Plane size={15} aria-hidden="true" /> Leave {fmtDateShort(absences[0].dateFrom)}{absences.length > 1 ? ` (+${absences.length - 1})` : ""}</a>
                    )}
                    {blackouts[0] && (
                      <a href={back("block")}><Ban size={15} aria-hidden="true" /> Blocked {fmtDateShort(blackouts[0].dateFrom)}{blackouts.length > 1 ? ` (+${blackouts.length - 1})` : ""}</a>
                    )}
                  </div>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      {tab === "block" && (
        <div className="cols">
          <section className="panel">
            <h2>Block time</h2>
            <p className="small muted">For maintenance or training. Teachers see the reason on the grid. Existing bookings stay; cancel them separately if needed.</p>
            <form action={blockTime}>
              <input type="hidden" name="back" value={back("block")} />
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
                <div className="field"><label htmlFor="b-from">From</label><input id="b-from" name="dateFrom" type="date" required min={today} /></div>
                <div className="field"><label htmlFor="b-to">To <span className="muted">(optional)</span></label><input id="b-to" name="dateTo" type="date" min={today} /></div>
              </div>
              <BlockPicker />
              <div className="field">
                <label htmlFor="b-note">Note for teachers <span className="muted">(optional)</span></label>
                <input id="b-note" name="note" type="text" maxLength={120} placeholder="e.g. Printer service" />
              </div>
              <button className="btn btn-primary" type="submit">Block time</button>
            </form>
          </section>
          <section>
            <h2>Coming up ({blackouts.length})</h2>
            {blackouts.length === 0 ? (
              <div className="empty">No blocked time in the next 60 days.</div>
            ) : (
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
                      <input type="hidden" name="back" value={back("block")} />
                      <button className="btn btn-sm" type="submit">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "leave" && (
        <div className="cols">
          <section className="panel">
            <h2>Add leave</h2>
            <p className="small muted">
              Bookings in that time move to the other in-charge when they are free. If nobody can cover, the teacher and the lab admin are emailed and the booking stays until the admin decides.
            </p>
            <form action={addLeave}>
              <input type="hidden" name="back" value={back("leave")} />
              {actor.role === "admin" && (
                <div className="field">
                  <label htmlFor="l-who">Who is away</label>
                  <select id="l-who" name="staffId" defaultValue={who !== "all" ? who : undefined}>{incharges.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                </div>
              )}
              <div className="row2">
                <div className="field"><label htmlFor="l-from">From</label><input id="l-from" name="dateFrom" type="date" required min={today} /></div>
                <div className="field"><label htmlFor="l-to">To <span className="muted">(optional)</span></label><input id="l-to" name="dateTo" type="date" min={today} /></div>
              </div>
              <BlockPicker />
              <div className="field">
                <label htmlFor="l-reason">Reason <span className="muted">(shown to teachers)</span></label>
                <input id="l-reason" name="reason" type="text" maxLength={120} placeholder="e.g. Training day" />
              </div>
              <button className="btn btn-primary" type="submit">Save leave</button>
            </form>
          </section>
          <section>
            <h2>Leave coming up ({absences.length})</h2>
            {absences.length === 0 ? (
              <div className="empty">No leave recorded.</div>
            ) : (
              <ul className="list">
                {absences.map((a) => (
                  <li key={a.id}>
                    <div className="what">
                      <strong>{staff.find((s) => s.id === a.staffId)?.name}</strong>
                      {a.reason ? `: ${a.reason}` : ""}
                      <div className="small muted">
                        {fmtDateShort(a.dateFrom)}{a.dateTo !== a.dateFrom ? ` to ${fmtDateShort(a.dateTo)}` : ""} · {a.blockCodes ? a.blockCodes.join(", ") : "whole day"}
                      </div>
                    </div>
                    <form action={cancelLeave}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="back" value={back("leave")} />
                      <button className="btn btn-sm" type="submit">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <p className="small muted">Removing leave does not move bookings back; reassign them from Admin if needed.</p>
          </section>
        </div>
      )}

      {tab === "equipment" && <IssuesPanel db={db} resources={resources} back={back("equipment")} today={today} />}

      {tab === "calendar" && (
        <section className="panel" style={{ maxWidth: 640 }}>
          <h2>Test calendar meeting</h2>
          <p className="small muted">
            Until your Google or Outlook calendar is connected, add meetings here to see how the app reacts: new bookings avoid them and clashes with existing bookings are flagged to admin.
          </p>
          <form action={addMeeting}>
            <input type="hidden" name="back" value={back("calendar")} />
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
      )}
    </div>
  );
}

function Stat({ icon: Icon, v, l, href }: { icon: typeof Clock; v: string; l: string; href?: string }) {
  const body = (
    <>
      <span className="kpi-icon" aria-hidden="true"><Icon size={18} /></span>
      <span className="ic-stat-text"><span className="v">{v}</span><span className="l">{l}</span></span>
      {href && <ArrowRight className="ic-stat-go" size={16} aria-hidden="true" />}
    </>
  );
  return <li className="kpi ic-stat">{href ? <a href={href}>{body}</a> : body}</li>;
}

function BlockPicker() {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
      <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Periods <span className="muted">(none ticked = whole day)</span></legend>
      <div className="chips">
        {BLOCKS.map((c) => (
          <label key={c} className="chip" style={{ margin: 0, fontWeight: 400 }}>
            <input type="checkbox" name="blocks" value={c} /> {c}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Tt = Awaited<ReturnType<typeof getTimetables>>;
type Bo = Awaited<ReturnType<typeof getBlackouts>>;
type Ab = Awaited<ReturnType<typeof getAbsences>>;

/** Mon–Fri by period: the in-charge's sessions, blocked time and leave, at a glance. */
function WeekCalendar(p: { days: string[]; today: string; bookings: BookingDetail[]; timetables: Tt; blackouts: Bo; absences: Ab; resources: { id: string; name: string }[]; showWho: boolean }) {
  const perDay = p.days.map((d) => ({ date: d, blocks: (timetableForDate(p.timetables, d)?.blocks ?? []).filter((b) => b.bookable) }));
  const rows: Block[] = [];
  for (const d of perDay) for (const b of d.blocks) if (!rows.some((r) => r.code === b.code)) rows.push(b);
  rows.sort((a, b) => a.start.localeCompare(b.start));
  const hits = (from: string, to: string, codes: string[] | null, date: string, code: string) => date >= from && date <= to && (!codes || codes.includes(code));

  return (
    <div className="ic-cal-wrap">
      <table className="ic-week">
        <caption className="sr-only">Sessions by day and period</caption>
        <thead>
          <tr>
            <th scope="col" className="ic-rh">Period</th>
            {p.days.map((d) => (
              <th key={d} scope="col" className={d === p.today ? "is-today" : ""}>
                <span className="ic-dn">{dayName(d)}</span> <span className="ic-dd">{dayNum(d)}</span>
                {d === p.today && <span className="sr-only"> (today)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <th scope="row" className="ic-rh">
                <strong>{r.code}</strong>
                <span>{r.start}</span>
              </th>
              {perDay.map((d) => {
                const blk = d.blocks.find((b) => b.code === r.code);
                if (!blk) return <td key={d.date} className="ic-none" />;
                const here = p.bookings.filter((b) => b.date === d.date && b.blockIds.includes(blk.id));
                const off = p.absences.find((a) => hits(a.dateFrom, a.dateTo, a.blockCodes, d.date, r.code));
                const blocked = p.blackouts.filter((b) => hits(b.dateFrom, b.dateTo, b.blockCodes, d.date, r.code));
                return (
                  <td key={d.date} className={d.date === p.today ? "is-today" : ""}>
                    {off && <span className="ic-flag ic-flag-leave"><Plane size={12} aria-hidden="true" /> On leave</span>}
                    {blocked.map((b) => (
                      <span key={b.id} className="ic-flag"><Ban size={12} aria-hidden="true" /> {b.resourceId ? p.resources.find((x) => x.id === b.resourceId)?.name.replace(" Lab", "") : "All"}: {b.reason}</span>
                    ))}
                    {here.map((b) => (
                      <div key={b.id} className={`ic-ev ${b.status !== "confirmed" ? "is-done" : ""}`} style={{ "--lab": `var(--r-${b.resourceColour})` } as React.CSSProperties}>
                        <span className="ic-ev-top"><LabIcon colour={b.resourceColour} size="xs" /><strong>{b.resourceName.replace(" Lab", "")}</strong>{b.blockIds.length > 1 ? <span className="ic-ev-tag">double</span> : null}</span>
                        <span className="ic-ev-sub">{b.classLabel} {b.subject}</span>
                        <span className="ic-ev-sub">{b.teacherName}{p.showWho ? ` · ${b.inchargeName}` : ""}{b.crossCover ? " · cover" : ""}</span>
                        {b.status === "completed" && <span className="sr-only">Attended</span>}
                        {b.status === "no_show" && <span className="ic-ev-tag">no-show</span>}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function greet(t: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Dubai" }).format(t));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function fmtMins(m: number) {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
}
