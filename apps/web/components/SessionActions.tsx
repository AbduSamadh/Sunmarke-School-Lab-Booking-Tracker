"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Attendance and decline buttons for the in-charge view. */
export function SessionActions({ id, status, canMark }: { id: string; status: string; canMark: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "decline" | "busy">("idle");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function post(path: string, body: unknown) {
    setMode("busy");
    setErr(null);
    const r = await fetch(`/api/v1/bookings/${id}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) setErr((await r.json()).error?.message ?? "Could not save.");
    setMode("idle");
    router.refresh();
  }

  if (status === "completed") return <span className="tag tag-ok">Attended</span>;
  if (status === "no_show") return <span className="tag tag-bad">No-show</span>;
  return (
    <div className="btn-row" style={{ flexDirection: "column", alignItems: "flex-end" }}>
      {mode === "decline" ? (
        <form
          className="btn-row"
          onSubmit={(e) => {
            e.preventDefault();
            post("decline", { reason });
          }}
        >
          <label className="sr-only" htmlFor={`dr-${id}`}>Reason for declining</label>
          <input id={`dr-${id}`} type="text" required minLength={3} maxLength={200} placeholder="Reason (sent to the teacher)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 220 }} />
          <button className="btn btn-sm btn-danger" type="submit">Decline</button>
          <button className="btn btn-sm" type="button" onClick={() => setMode("idle")}>Back</button>
        </form>
      ) : (
        <div className="btn-row">
          {canMark && (
            <>
              <button className="btn btn-sm btn-primary" disabled={mode === "busy"} onClick={() => post("attendance", { status: "completed" })}>Attended</button>
              <button className="btn btn-sm" disabled={mode === "busy"} onClick={() => post("attendance", { status: "no_show" })}>No-show</button>
            </>
          )}
          <button className="btn btn-sm btn-quiet" disabled={mode === "busy"} onClick={() => setMode("decline")}>Decline</button>
        </div>
      )}
      {err && <span className="small" style={{ color: "var(--bad)" }} role="alert">{err}</span>}
    </div>
  );
}
