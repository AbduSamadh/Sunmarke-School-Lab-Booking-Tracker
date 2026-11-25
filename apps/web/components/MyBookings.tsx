"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDateShort } from "@/lib/shared/format";
import { LabIcon } from "./LabIcon";

export interface Row {
  id: string; resourceId: string; resourceName: string; colour: string; date: string; blockLabel: string; timeLabel: string; inchargeName: string;
  classLabel: string; subject: string; studentCount: number; cartCount: number | null; classroom: string | null; objective: string;
  specialRequirements: string; status: string; statusReason: string | null; cancellable: boolean;
  recurrenceId: string | null; rating: number | null; started: boolean;
}

const STATUS: Record<string, [string, string]> = {
  confirmed: ["Confirmed", "tag-ok"],
  completed: ["Attended", "tag-ok"],
  no_show: ["No-show", "tag-bad"],
  cancelled: ["Cancelled", ""],
  declined: ["Declined", "tag-warn"],
};

function nextWeek(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
}

export function MyBookings({ upcoming, past, rateId }: { upcoming: Row[]; past: Row[]; rateId?: string }) {
  return (
    <div className="stack">
      <section>
        <h2>Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="empty">
            No upcoming bookings. <a href="/">Find a free slot</a>.
          </div>
        ) : (
          <ul className="list">{upcoming.map((b) => <Item key={b.id} b={b} rateOpen={rateId === b.id} />)}</ul>
        )}
      </section>
      <section>
        <h2>Past and cancelled</h2>
        {past.length === 0 ? <div className="empty">Nothing yet.</div> : <ul className="list">{past.slice(0, 30).map((b) => <Item key={b.id} b={b} past rateOpen={rateId === b.id} />)}</ul>}
      </section>
    </div>
  );
}

function Item({ b, past, rateOpen }: { b: Row; past?: boolean; rateOpen?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "confirm" | "confirm-series" | "edit" | "rate" | "busy">(rateOpen && b.rating === null ? "rate" : "idle");
  const [fb, setFb] = useState({ rating: 0, comment: "", issue: "", item: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState({ studentCount: String(b.studentCount), objective: b.objective, specialRequirements: b.specialRequirements, classroom: b.classroom ?? "" });
  const [st, cls] = STATUS[b.status] ?? [b.status, ""];

  async function call(url: string, method: string, body: unknown, done?: (j: Record<string, unknown>) => string | null) {
    const prev = mode;
    setMode("busy");
    setErr(null);
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.error?.message ?? "Something went wrong.");
      setMode(prev === "busy" ? "idle" : prev);
      return;
    }
    setMsg(done ? done(j) : null);
    setMode("idle");
    router.refresh();
  }
  const canRate = b.started && (b.status === "completed" || b.status === "confirmed") && b.rating === null;

  return (
    <li>
      <div className="when">
        <strong>{fmtDateShort(b.date)}</strong>
        <span className="small muted">{b.blockLabel} · {b.timeLabel}</span>
      </div>
      <div className="what">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <LabIcon colour={b.colour} size="md" />
          <strong>{b.resourceName}</strong>
          {b.cartCount ? <span className="small">{b.cartCount} carts to {b.classroom}</span> : null}
          <span className={`tag ${cls}`}>{st}</span>
          {b.recurrenceId && b.status === "confirmed" ? <span className="tag">Repeating</span> : null}
          {b.rating !== null ? <span className="small muted">Rated {b.rating} of 5</span> : null}
        </div>
        <div className="small muted">
          {b.classLabel} · {b.subject} · {b.studentCount} students · with {b.inchargeName}
          {b.statusReason && b.status === "declined" ? ` · Reason: ${b.statusReason}` : ""}
        </div>
        {err && <div className="notice notice-bad" role="alert" style={{ marginTop: 8, marginBottom: 0 }}>{err}</div>}
        {msg && <div className="notice" role="status" style={{ marginTop: 8, marginBottom: 0 }}>{msg}</div>}
        {mode === "rate" && (
          <form
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!fb.rating) return setErr("Pick a rating from 1 to 5.");
              call(`/api/v1/bookings/${b.id}/feedback`, "POST", { rating: fb.rating, comment: fb.comment, ...(fb.issue.trim() ? { issue: fb.issue, item: fb.item } : {}) }, () =>
                fb.issue.trim() ? "Thanks. The lab team has your equipment report." : "Thanks for rating this session.",
              );
            }}
          >
            <fieldset className="rating">
              <legend>How did the session go?</legend>
              <div className="btn-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className={`rate-opt${fb.rating === n ? " on" : ""}`}>
                    <input type="radio" name={`rate-${b.id}`} value={n} checked={fb.rating === n} onChange={() => setFb({ ...fb, rating: n })} />
                    <span>{n}</span>
                  </label>
                ))}
                <span className="small muted">1 poor, 5 great</span>
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor={`fc-${b.id}`}>Comment (optional)</label>
              <input id={`fc-${b.id}`} type="text" maxLength={500} value={fb.comment} onChange={(e) => setFb({ ...fb, comment: e.target.value })} />
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor={`fi-${b.id}`}>Equipment problem (optional)</label>
                <input id={`fi-${b.id}`} type="text" maxLength={200} placeholder="e.g. Headset 3 will not charge" value={fb.issue} onChange={(e) => setFb({ ...fb, issue: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`fit-${b.id}`}>Which item</label>
                <input id={`fit-${b.id}`} type="text" maxLength={60} value={fb.item} onChange={(e) => setFb({ ...fb, item: e.target.value })} />
              </div>
            </div>
            <div className="btn-row">
              <button className="btn btn-primary btn-sm" type="submit">Send rating</button>
              <button className="btn btn-sm" type="button" onClick={() => setMode("idle")}>Not now</button>
            </div>
          </form>
        )}
        {mode === "edit" && (
          <form
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              call(`/api/v1/bookings/${b.id}`, "PATCH", {
                studentCount: Number(edit.studentCount),
                objective: edit.objective,
                specialRequirements: edit.specialRequirements,
                ...(b.cartCount ? { classroom: edit.classroom } : {}),
              });
            }}
          >
            <div className="row2">
              <div className="field">
                <label htmlFor={`s-${b.id}`}>Students</label>
                <input id={`s-${b.id}`} type="number" min={1} max={60} value={edit.studentCount} onChange={(e) => setEdit({ ...edit, studentCount: e.target.value })} />
              </div>
              {b.cartCount ? (
                <div className="field">
                  <label htmlFor={`c-${b.id}`}>Classroom</label>
                  <input id={`c-${b.id}`} type="text" value={edit.classroom} onChange={(e) => setEdit({ ...edit, classroom: e.target.value })} />
                </div>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor={`o-${b.id}`}>Lesson objective</label>
              <input id={`o-${b.id}`} type="text" value={edit.objective} onChange={(e) => setEdit({ ...edit, objective: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`r-${b.id}`}>Special requirements</label>
              <input id={`r-${b.id}`} type="text" value={edit.specialRequirements} onChange={(e) => setEdit({ ...edit, specialRequirements: e.target.value })} />
            </div>
            <div className="btn-row">
              <button className="btn btn-primary btn-sm" type="submit">Save changes</button>
              <button className="btn btn-sm" type="button" onClick={() => setMode("idle")}>Discard</button>
            </div>
          </form>
        )}
      </div>
      <div className="btn-row">
        {!past && b.status === "confirmed" && mode === "idle" && (
          <>
            <button className="btn btn-sm" onClick={() => setMode("edit")}>Edit details</button>
            {b.cancellable ? (
              <button className="btn btn-sm btn-danger" onClick={() => setMode("confirm")}>Cancel</button>
            ) : (
              <span className="small muted">Too late to cancel here: contact {b.inchargeName}</span>
            )}
          </>
        )}
        {mode === "idle" && canRate && <button className="btn btn-sm" onClick={() => setMode("rate")}>Rate session</button>}
        {mode === "idle" && !past && b.recurrenceId && b.status === "confirmed" && (
          <button className="btn btn-sm" onClick={() => setMode("confirm-series")}>Cancel series</button>
        )}
        {mode === "confirm-series" && (
          <>
            <span className="small">Cancel every upcoming lesson in this series?</span>
            <button
              className="btn btn-sm btn-danger"
              onClick={() =>
                call(`/api/v1/series/${b.recurrenceId}/cancel`, "POST", {}, (j) => {
                  // This row moves to "Past and cancelled", so the result is shown at the top of the page.
                  router.replace(`/bookings?series=${Number(j.cancelled) || 0}-${Number(j.kept) || 0}`);
                  return null;
                })
              }
            >
              Yes, cancel series
            </button>
            <button className="btn btn-sm" onClick={() => setMode("idle")}>Keep it</button>
          </>
        )}
        {mode === "confirm" && (
          <>
            <span className="small">Cancel this booking?</span>
            <button className="btn btn-sm btn-danger" onClick={() => call(`/api/v1/bookings/${b.id}/cancel`, "POST", {})}>Yes, cancel</button>
            <button className="btn btn-sm" onClick={() => setMode("idle")}>Keep it</button>
          </>
        )}
        {past && <a className="btn btn-sm" href={`/?date=${nextWeek(b.date)}&r=${b.resourceId}`}>Rebook</a>}
      </div>
    </li>
  );
}
