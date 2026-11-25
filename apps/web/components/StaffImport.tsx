"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function StaffImport() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [res, setRes] = useState<{ added: number; updated: number; errors: { line: number; message: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const r = await fetch("/api/v1/admin/staff-import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv }) });
    const j = await r.json();
    setRes(r.ok ? j : { added: 0, updated: 0, errors: [{ line: 0, message: j.error?.message ?? "Import failed" }] });
    setBusy(false);
    router.refresh();
  }
  return (
    <div>
      <div className="field">
        <label htmlFor="csv-file">CSV file</label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
          }}
        />
        <div className="hint">Columns: name, email, department, role (teacher, incharge, admin or viewer; blank = teacher). Existing emails are updated.</div>
      </div>
      <div className="field">
        <label htmlFor="csv-text">Or paste rows</label>
        <textarea id="csv-text" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"name,email,department,role\nJane Doe,jane.doe@sunmarke.example,Science,teacher"} />
      </div>
      <button className="btn btn-primary" onClick={run} disabled={busy || !csv.trim()}>{busy ? "Importing…" : "Import staff"}</button>
      {res && (
        <div style={{ marginTop: 12 }} aria-live="polite">
          <div className={`notice ${res.errors.length ? "notice-warn" : "notice-ok"}`}>
            Added {res.added}, updated {res.updated}{res.errors.length ? `, ${res.errors.length} row${res.errors.length > 1 ? "s" : ""} skipped` : ""}.
          </div>
          {res.errors.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th className="num">Line</th><th>Problem</th></tr></thead>
                <tbody>{res.errors.map((e, i) => <tr key={i}><td className="num">{e.line}</td><td>{e.message}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
