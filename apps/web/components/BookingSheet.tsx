"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { CellView, GridData, GridDay, GridBlock } from "@/lib/server/grid";
import { fmtDateLong, fmtDateShort } from "@/lib/shared/format";
import type { Defaults, Lookups } from "./Availability";

type Resource = GridData["resources"][number];
export interface Selection {
  resource: Resource;
  day: GridDay;
  block: GridBlock;
  cell: CellView;
}

interface Alt {
  resourceId: string;
  resourceName: string;
  date: string;
  blockId: string;
  blockCode: string;
  inchargeName: string;
}

interface Booked {
  id: string;
  resourceName: string;
  date: string;
  blockLabel: string;
  timeLabel: string;
  inchargeName: string;
  crossCover: boolean;
  classLabel: string;
  cartCount: number | null;
  classroom: string | null;
}

interface SeriesLine {
  date: string;
  ok: boolean;
  reason: string;
  inchargeName?: string;
}

type Step =
  | { s: "form" }
  | { s: "sending" }
  | { s: "done"; booking: Booked; calendarChecked: boolean }
  | { s: "blocked"; reason: string; suggestion?: string; canWaitlist: boolean; alternatives: Alt[]; justTaken: boolean }
  | { s: "info"; loading: boolean; reason: string; suggestion?: string; canWaitlist: boolean; alternatives: Alt[] }
  | { s: "waitlisted"; position: number }
  | { s: "series"; lines: SeriesLine[]; created: boolean }
  | { s: "undone" };

export function BookingSheet(props: {
  sel: Selection;
  role: "teacher" | "incharge" | "admin" | "viewer";
  lookups: Lookups;
  defaults: Defaults;
  grid: GridData;
  onClose: (changed: boolean) => void;
  onPick: (s: Selection) => void;
  people: { id: string; name: string; department: string }[];
  selfId: string;
  maxLeadDays: number;
}) {
  const { sel, lookups, defaults } = props;
  const { resource, day, block, cell } = sel;
  const isCart = resource.type === "cart_pool";
  const free = cell.kind === "free";
  const [step, setStep] = useState<Step>(free ? { s: "form" } : { s: "info", loading: true, reason: cellReason(cell), canWaitlist: false, alternatives: [] });
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [undoLeft, setUndoLeft] = useState(10);
  const firstField = useRef<HTMLSelectElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement | null>(null);

  const bookable = day.blocks.filter((b) => b.bookable);
  const idx = bookable.findIndex((b) => b.id === block.id);
  const nextBlock = idx >= 0 ? bookable[idx + 1] : undefined;
  const nextFree = nextBlock && day.cells[resource.id][nextBlock.id]?.kind === "free" ? nextBlock : undefined;

  const [f, setF] = useState({
    subject: defaults.subject,
    yearGroup: defaults.yearGroup,
    section: defaults.section,
    studentCount: String(defaults.studentCount || ""),
    cartCount: String(Math.min(defaults.cartCount || 4, free && cell.kind === "free" ? cell.unitsLeft : 10)),
    classroom: defaults.classroom,
    objective: "",
    lessonPlanUrl: "",
    specialRequirements: "",
    double: false,
    onBehalfOf: "",
    repeat: false,
    everyWeeks: "1",
    endDate: addDaysIso(day.date, 7 * 9),
  });
  const isAdmin = props.role === "admin";

  useEffect(() => {
    setStep(cell.kind === "free" ? { s: "form" } : { s: "info", loading: true, reason: cellReason(cell), canWaitlist: false, alternatives: [] });
    setError(null);
    if (cell.kind !== "free") {
      fetch(`/api/v1/alternatives?resourceId=${resource.id}&date=${day.date}&blockId=${block.id}`)
        .then((r) => r.json())
        .then((j) => {
          const ev = j.evaluation;
          setStep({
            s: "info",
            loading: false,
            reason: ev?.ok ? "Free now" : (ev?.reason ?? cellReason(cell)),
            suggestion: ev?.ok ? undefined : ev?.suggestion,
            canWaitlist: Boolean(ev && !ev.ok && ev.canWaitlist),
            alternatives: j.alternatives ?? [],
          });
        })
        .catch(() => setStep({ s: "info", loading: false, reason: cellReason(cell), canWaitlist: true, alternatives: [] }));
    }
    setTimeout(() => (firstField.current ?? closeBtn.current)?.focus(), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.id, day.date, block.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose(changed);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changed, props]);

  useEffect(() => {
    if (step.s !== "done") return;
    setUndoLeft(10);
    const t = setInterval(() => setUndoLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step.s]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  function seriesBody(preview: boolean) {
    return {
      resourceId: resource.id,
      startDate: day.date,
      endDate: f.endDate,
      everyWeeks: Number(f.everyWeeks),
      blockCodes: f.double && nextFree ? [block.code, nextFree.code] : [block.code],
      subject: f.subject,
      yearGroup: f.yearGroup,
      section: f.section,
      studentCount: Number(f.studentCount),
      objective: f.objective,
      specialRequirements: f.specialRequirements,
      ...(isCart ? { cartCount: Number(f.cartCount), classroom: f.classroom } : {}),
      ...(isAdmin && f.onBehalfOf ? { onBehalfOf: f.onBehalfOf } : {}),
      preview,
    };
  }

  async function series(preview: boolean) {
    setError(null);
    setStep({ s: "sending" });
    try {
      const r = await fetch("/api/v1/series", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(seriesBody(preview)) });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error?.message ?? "Could not plan the series.");
        setStep({ s: "form" });
        return;
      }
      if (!preview) setChanged(true);
      setStep({ s: "series", lines: j.lines, created: !preview });
      setTimeout(() => closeBtn.current?.focus(), 30);
    } catch {
      setError("No connection. Check your network and try again.");
      setStep({ s: "form" });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.repeat) return series(true);
    setError(null);
    setStep({ s: "sending" });
    const body: Record<string, unknown> = {
      resourceId: resource.id,
      date: day.date,
      blockIds: f.double && nextFree ? [block.id, nextFree.id] : [block.id],
      subject: f.subject,
      yearGroup: f.yearGroup,
      section: f.section,
      studentCount: Number(f.studentCount),
      objective: f.objective,
      specialRequirements: f.specialRequirements,
      lessonPlanUrl: f.lessonPlanUrl,
    };
    if (isCart) {
      body.cartCount = Number(f.cartCount);
      body.classroom = f.classroom;
    }
    if (cell.kind === "free" && cell.override) body.overrideWindow = true;
    if (isAdmin && f.onBehalfOf) body.onBehalfOf = f.onBehalfOf;
    try {
      const r = await fetch("/api/v1/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.status === 201) {
        setChanged(true);
        setStep({ s: "done", booking: j.booking, calendarChecked: j.calendarChecked });
        setTimeout(() => closeBtn.current?.focus(), 30);
      } else if (r.status === 409 && j.ok === false) {
        setChanged(true);
        setStep({ s: "blocked", reason: j.reason, suggestion: j.suggestion, canWaitlist: j.canWaitlist, alternatives: j.alternatives ?? [], justTaken: j.code === "just_taken" });
      } else {
        setError(j.error?.message ?? "Could not book. Try again.");
        setStep({ s: "form" });
      }
    } catch {
      setError("No connection. Check your network and try again.");
      setStep({ s: "form" });
    }
  }

  async function undo(id: string) {
    const r = await fetch(`/api/v1/bookings/${id}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ undo: true }) });
    if (r.ok) setStep({ s: "undone" });
    else setError((await r.json()).error?.message ?? "Could not undo.");
  }

  async function waitlist() {
    const r = await fetch("/api/v1/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, date: day.date, blockId: block.id, ...(isCart ? { units: Number(f.cartCount) || 1 } : {}) }),
    });
    const j = await r.json();
    if (r.ok) setStep({ s: "waitlisted", position: j.position });
    else setError(j.error?.message ?? "Could not join the waitlist.");
  }

  function pickAlt(a: Alt) {
    const d = props.grid.days.find((x) => x.date === a.date);
    const r = props.grid.resources.find((x) => x.id === a.resourceId);
    const b = d?.blocks.find((x) => x.id === a.blockId);
    if (d && r && b) {
      // Optimistically show it as free; the server re-checks on submit.
      const c = d.cells[r.id][b.id];
      props.onPick({ resource: r, day: d, block: b, cell: c.kind === "free" ? c : { kind: "free", inchargeName: a.inchargeName, crossCover: false, unitsLeft: r.units, unitsTotal: r.units, existing: [] } });
    }
  }

  const title = `${resource.name}, ${fmtDateShort(day.date)} ${block.code}`;
  const coming = cell.kind === "free" ? cell.inchargeName : null;

  return (
    <>
      <div className="sheet-backdrop" onClick={() => props.onClose(changed)} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-head">
          <div>
            <h2 id="sheet-title" style={{ marginBottom: 2 }}>
              {step.s === "done" ? "Booked" : step.s === "series" ? (step.created ? "Series booked" : "Check the series") : step.s === "info" || step.s === "blocked" ? "Not available" : `Book ${title}`}
            </h2>
            <div className="small muted">
              {fmtDateLong(day.date)} · {block.code} <span className="time">{block.start}–{block.end}</span>
            </div>
          </div>
          <button ref={closeBtn} className="btn btn-quiet btn-sm" onClick={() => props.onClose(changed)} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {(step.s === "form" || step.s === "sending") && (
          <form onSubmit={submit} style={{ display: "contents" }}>
            <div className="sheet-body">
              <div className="summary">
                <dl>
                  <dt>Where</dt>
                  <dd>{isCart ? "AI Carts come to your classroom" : resource.name}</dd>
                  <dt>Who is coming</dt>
                  <dd>
                    {coming}
                    {cell.kind === "free" && cell.crossCover ? " (covering for the usual in-charge)" : ""}
                  </dd>
                  {resource.links.length > 0 && (
                    <>
                      <dt>Lesson resources</dt>
                      <dd>
                        {resource.links.map((l, i) => (
                          <span key={l.url}>
                            {i > 0 ? " · " : ""}
                            <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
                          </span>
                        ))}
                      </dd>
                    </>
                  )}
                  {isCart && cell.kind === "free" && (
                    <>
                      <dt>Carts free</dt>
                      <dd className="tnum">{cell.unitsLeft} of {cell.unitsTotal}</dd>
                    </>
                  )}
                </dl>
              </div>
              {cell.kind === "free" && cell.override && (
                <div className="notice notice-warn">Outside the normal booking window. You are booking as lab admin; this is logged.</div>
              )}
              {error && <div className="notice notice-bad" role="alert">{error}</div>}

              {isAdmin && props.people.length > 0 && (
                <div className="field">
                  <label htmlFor="f-for">Booking for</label>
                  <select id="f-for" value={f.onBehalfOf} onChange={set("onBehalfOf")}>
                    <option value="">Myself</option>
                    {props.people.filter((p) => p.id !== props.selfId).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.department ? ` (${p.department})` : ""}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="row3">
                <div className="field">
                  <label htmlFor="f-subject">Subject</label>
                  <select ref={firstField} id="f-subject" required value={f.subject} onChange={set("subject")}>
                    <option value="">Choose</option>
                    {lookups.subjects.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f-year">Year</label>
                  <select id="f-year" required value={f.yearGroup} onChange={set("yearGroup")}>
                    <option value="">Choose</option>
                    {lookups.years.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f-section">Section</label>
                  <select id="f-section" value={f.section} onChange={set("section")}>
                    <option value="">None</option>
                    {lookups.sections.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className={isCart ? "row3" : "row2"}>
                <div className="field">
                  <label htmlFor="f-students">Students</label>
                  <input id="f-students" type="number" inputMode="numeric" min={1} max={resource.capacity ?? 60} required value={f.studentCount} onChange={set("studentCount")} />
                </div>
                {isCart && (
                  <>
                    <div className="field">
                      <label htmlFor="f-carts">Carts</label>
                      <input id="f-carts" type="number" inputMode="numeric" min={1} max={cell.kind === "free" ? cell.unitsLeft : 10} required value={f.cartCount} onChange={set("cartCount")} />
                    </div>
                    <div className="field">
                      <label htmlFor="f-room">Classroom</label>
                      <input id="f-room" type="text" required placeholder="Room 2.14" value={f.classroom} onChange={set("classroom")} />
                    </div>
                  </>
                )}
              </div>
              {nextFree && (
                <div className="field">
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, minHeight: 44 }}>
                    <input type="checkbox" checked={f.double} onChange={set("double")} style={{ width: 20, height: 20 }} />
                    Double lesson: also book {nextFree.code} ({nextFree.start}–{nextFree.end})
                  </label>
                </div>
              )}
              <div className="field">
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, minHeight: 44 }}>
                  <input type="checkbox" checked={f.repeat} onChange={set("repeat")} style={{ width: 20, height: 20 }} />
                  Repeat this lesson
                </label>
              </div>
              {f.repeat && (
                <div className="row2">
                  <div className="field">
                    <label htmlFor="f-every">How often</label>
                    <select id="f-every" value={f.everyWeeks} onChange={set("everyWeeks")}>
                      <option value="1">Every week</option>
                      <option value="2">Every 2 weeks</option>
                      <option value="3">Every 3 weeks</option>
                      <option value="4">Every 4 weeks</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="f-until">Until</label>
                    <input id="f-until" type="date" required min={addDaysIso(day.date, 7)} value={f.endDate} onChange={set("endDate")} />
                  </div>
                </div>
              )}
              <div className="field">
                <label htmlFor="f-obj">Lesson objective <span className="muted">(optional)</span></label>
                <input id="f-obj" type="text" maxLength={300} value={f.objective} onChange={set("objective")} placeholder="e.g. Test a simple circuit" />
              </div>
              <details>
                <summary style={{ cursor: "pointer", minHeight: 36, fontSize: 14 }}>More details</summary>
                <div className="field" style={{ marginTop: 8 }}>
                  <label htmlFor="f-plan">Lesson plan link</label>
                  <input id="f-plan" type="url" value={f.lessonPlanUrl} onChange={set("lessonPlanUrl")} placeholder="https://" />
                </div>
                <div className="field">
                  <label htmlFor="f-req">Special requirements</label>
                  <textarea id="f-req" maxLength={300} value={f.specialRequirements} onChange={set("specialRequirements")} placeholder="Accessibility, equipment, anything the in-charge should know" />
                </div>
              </details>
            </div>
            <div className="sheet-foot">
              <button type="button" className="btn" onClick={() => props.onClose(changed)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={step.s === "sending"}>
                {step.s === "sending" ? (f.repeat ? "Checking…" : "Booking…") : f.repeat ? "Check dates" : `Book ${resource.name.replace(" Lab", "")}, ${fmtDateShort(day.date).split(" ")[0]} ${f.double && nextFree ? `${block.code}–${nextFree.code}` : block.code}`}
              </button>
            </div>
          </form>
        )}

        {step.s === "done" && (
          <>
            <div className="sheet-body" aria-live="polite">
              <div className="notice notice-ok">Confirmed. A confirmation email with a calendar invite is on its way.</div>
              <div className="summary">
                <dl>
                  <dt>What</dt>
                  <dd>{step.booking.resourceName}{step.booking.cartCount ? `, ${step.booking.cartCount} carts` : ""}</dd>
                  <dt>When</dt>
                  <dd>{fmtDateLong(step.booking.date)}, {step.booking.blockLabel} <span className="tnum">({step.booking.timeLabel})</span></dd>
                  <dt>Where</dt>
                  <dd>{step.booking.classroom ?? step.booking.resourceName}</dd>
                  <dt>Class</dt>
                  <dd>{step.booking.classLabel}</dd>
                  <dt>Who is coming</dt>
                  <dd>{step.booking.inchargeName}</dd>
                </dl>
              </div>
              <p className="small muted">
                {step.calendarChecked ? `Added to your calendar and ${step.booking.inchargeName}'s.` : "Calendars were unavailable; the invite will be added automatically when they are back."}
              </p>
              {error && <div className="notice notice-bad" role="alert">{error}</div>}
            </div>
            <div className="sheet-foot">
              {undoLeft > 0 && (
                <button className="btn" onClick={() => undo(step.booking.id)}>
                  Undo ({undoLeft} s)
                </button>
              )}
              <button className="btn btn-primary" onClick={() => props.onClose(true)}>Done</button>
            </div>
          </>
        )}

        {step.s === "undone" && (
          <>
            <div className="sheet-body"><div className="notice notice-ok" role="status">Undone. The slot is free again and nothing was sent.</div></div>
            <div className="sheet-foot"><button className="btn btn-primary" onClick={() => props.onClose(true)}>Close</button></div>
          </>
        )}

        {(step.s === "blocked" || step.s === "info") && (
          <>
            <div className="sheet-body" aria-live="polite">
              <div className={`notice ${step.s === "blocked" && step.justTaken ? "notice-warn" : "notice-bad"}`} role="status">
                <strong>{step.s === "info" && step.loading ? "Checking…" : step.reason}</strong>
                {step.suggestion && <div style={{ marginTop: 4 }}>{step.suggestion}</div>}
              </div>
              {cell.kind === "booked" && !cell.mine && <p className="small muted">Booked by {cell.label}.</p>}
              {cell.kind === "unavailable" && cell.existing.length > 0 && <p className="small muted">Already here: {cell.existing.join("; ")}.</p>}
              {step.alternatives.length > 0 && (
                <>
                  <h3>Free instead</h3>
                  <ul className="list">
                    {step.alternatives.map((a) => (
                      <li key={`${a.resourceId}-${a.blockId}`}>
                        <div className="what">
                          <strong>{a.resourceName}</strong>, {fmtDateShort(a.date)} {a.blockCode}
                          <div className="small muted">{a.inchargeName} is free</div>
                        </div>
                        <button className="btn btn-sm" onClick={() => pickAlt(a)}>Book this</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!("loading" in step && step.loading) && step.alternatives.length === 0 && <p className="small muted">No other free slots for this lab on this day.</p>}
              {error && <div className="notice notice-bad" role="alert">{error}</div>}
            </div>
            <div className="sheet-foot">
              <button className="btn" onClick={() => props.onClose(changed)}>Close</button>
              {step.canWaitlist && props.role !== "viewer" && (
                <button className="btn btn-primary" onClick={waitlist}>Join waitlist</button>
              )}
            </div>
          </>
        )}

        {step.s === "series" && (
          <>
            <div className="sheet-body" aria-live="polite">
              {step.created ? (
                <div className="notice notice-ok" role="status">
                  Booked {step.lines.filter((l) => l.ok).length} of {step.lines.length} dates. Each has its own confirmation email. Cancel the whole series from My bookings.
                </div>
              ) : (
                <p className="small">
                  {step.lines.filter((l) => l.ok).length} of {step.lines.length} dates are free. Dates that are not free are skipped; you can join their waitlist from the grid.
                </p>
              )}
              <div className="table-wrap">
              <table className="data">
                <caption className="sr-only">Series dates</caption>
                <thead>
                  <tr><th scope="col">Date</th><th scope="col">Status</th></tr>
                </thead>
                <tbody>
                  {step.lines.map((l) => (
                    <tr key={l.date}>
                      <td className="tnum">{fmtDateShort(l.date)}</td>
                      <td>
                        <span className={`tag ${l.ok ? "tag-ok" : "tag-bad"}`}>{l.ok ? (step.created ? "Booked" : "Free") : "Skipped"}</span>{" "}
                        <span className="small muted">{l.ok ? (l.inchargeName ? `with ${l.inchargeName}` : "") : l.reason}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {error && <div className="notice notice-bad" role="alert">{error}</div>}
            </div>
            <div className="sheet-foot">
              {step.created ? (
                <button className="btn btn-primary" onClick={() => props.onClose(true)}>Done</button>
              ) : (
                <>
                  <button className="btn" onClick={() => setStep({ s: "form" })}>Back</button>
                  <button className="btn btn-primary" disabled={!step.lines.some((l) => l.ok)} onClick={() => series(false)}>
                    Book {step.lines.filter((l) => l.ok).length} dates
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {step.s === "waitlisted" && (
          <>
            <div className="sheet-body">
              <div className="notice notice-ok" role="status">
                You are number {step.position} on the waitlist. If this slot frees up, you get an email straight away.
              </div>
            </div>
            <div className="sheet-foot"><button className="btn btn-primary" onClick={() => props.onClose(true)}>Done</button></div>
          </>
        )}
      </div>
    </>
  );
}

function cellReason(c: CellView) {
  if (c.kind === "booked") return "Already booked";
  if (c.kind === "unavailable") return c.reason;
  return "";
}

function addDaysIso(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
