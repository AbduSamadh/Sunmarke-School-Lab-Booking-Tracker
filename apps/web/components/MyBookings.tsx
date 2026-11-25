"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDateShort } from "@/lib/shared/format";

export interface Row {
  id: string; resourceId: string; resourceName: string; colour: string; date: string; blockLabel: string; timeLabel: string; inchargeName: string;
  classLabel: string; subject: string; studentCount: number; cartCount: number | null; classroom: string | null; objective: string;
  specialRequirements: string; status: string; statusReason: string | null; cancellable: boolean;
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

export function MyBookings({ upcoming, past }: { upcoming: Row[]; past: Row[] }) {
  return (
    <div className="stack">
      <section>
        <h2>Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="empty">
            No upcoming bookings. <a href="/">Find a free slot</a>.
          </div>
        ) : (
          <ul className="list">{upcoming.map((b) => <Item key={b.id} b={b} />)}</ul>
        )}
      </section>
      <section>
        <h2>Past and cancelled</h2>
        {past.length === 0 ? <div className="empty">Nothing yet.</div> : <ul className="list">{past.slice(0, 30).map((b) => <Item key={b.id} b={b} past />)}</ul>}
      </section>
    </div>
  );
}

function Item({ b, past }: { b: Row; past?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "confirm" | "edit" | "busy">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState({ studentCount: String(b.studentCount), objective: b.objective, specialRequirements: b.specialRequirements, classroom: b.classroom ?? "" });
  const [st, cls] = STATUS[b.status] ?? [b.status, ""];

  async function call(url: string, method: string, body: unknown) {
    setMode("busy");
    setErr(null);
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      setErr((await r.json()).error?.message ?? "Something went wrong.");
      setMode("idle");
      return;
    }
    setMode("idle");
    router.refresh();
  }

  return (
    <li>
      <div className="when">
        <strong>{fmtDateShort(b.date)}</strong>
        <span className="small muted">{b.blockLabel} · {b.timeLabel}</span>
      </div>
      <div className="what">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="swatch" style={{ background: `var(--r-${b.colour})` }} aria-hidden="true" />
          <strong>{b.resourceName}</strong>
          {b.cartCount ? <span className="small">{b.cartCount} carts to {b.classroom}</span> : null}
          <span className={`tag ${cls}`}>{st}</span>
        </div>
        <div className="small muted">
          {b.classLabel} · {b.subject} · {b.studentCount} students · with {b.inchargeName}
          {b.statusReason && b.status === "declined" ? ` · Reason: ${b.statusReason}` : ""}
        </div>
        {err && <div className="notice notice-bad" role="alert" style={{ marginTop: 8, marginBottom: 0 }}>{err}</div>}
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
