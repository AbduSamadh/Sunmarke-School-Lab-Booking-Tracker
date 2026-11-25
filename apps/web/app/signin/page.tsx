import { redirect } from "next/navigation";
import { currentActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: nextRaw } = await searchParams;
  const next = nextRaw && /^\/(?![/\\])[\w\-/?=&.]*$/.test(nextRaw) ? nextRaw : "";
  if (await currentActor()) redirect(next || "/");
  const db = await getDb();
  const people = await db.query<{ name: string; email: string; role: string; department: string }>(
    "SELECT name, email, role, department FROM staff WHERE active ORDER BY CASE role WHEN 'teacher' THEN 1 WHEN 'incharge' THEN 2 WHEN 'admin' THEN 3 ELSE 4 END, name",
  );
  return (
    <div style={{ maxWidth: 520, margin: "24px auto" }}>
      <h1>Sign in</h1>
      <p className="muted">Use your Sunmarke work email.</p>
      {error && (
        <div className="notice notice-bad" role="alert">
          {error}
        </div>
      )}
      <form className="panel" action="/api/v1/session" method="post">
        {next && <input type="hidden" name="next" value={next} />}
        <div className="field">
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="name@sunmarke.example" />
        </div>
        <button className="btn btn-primary" type="submit">Continue</button>
        <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
          This pilot build checks your email against the staff list. School single sign-on (Google or Microsoft) replaces this step before launch.
        </p>
      </form>

      <h2 style={{ marginTop: 28 }}>Demo accounts</h2>
      <p className="small muted">Sample staff for trying each role. Emails use a placeholder domain until the real staff list is imported.</p>
      <ul className="list">
        {people.map((p) => (
          <li key={p.email}>
            <div className="what">
              <strong>{p.name}</strong>
              <div className="small muted">
                {p.role === "incharge" ? "Lab in-charge" : p.role === "admin" ? "Lab admin" : p.role === "viewer" ? "Leadership viewer" : `Teacher · ${p.department}`}
              </div>
            </div>
            <form action="/api/v1/session" method="post">
              <input type="hidden" name="email" value={p.email} />
              {next && <input type="hidden" name="next" value={next} />}
              <button className="btn btn-sm" type="submit">Sign in as {p.name.split(" ")[0]}</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
