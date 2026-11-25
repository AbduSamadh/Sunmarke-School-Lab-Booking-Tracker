import { redirect } from "next/navigation";
import { currentActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ArrowRight } from "lucide-react";
import { Avatar, LabIcon } from "@/components/LabIcon";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: nextRaw } = await searchParams;
  const next = nextRaw && /^\/(?![/\\])[\w\-/?=&.]*$/.test(nextRaw) ? nextRaw : "";
  if (await currentActor()) redirect(next || "/");
  const db = await getDb();
  const people = await db.query<{ name: string; email: string; role: string; department: string }>(
    "SELECT name, email, role, department FROM staff WHERE active ORDER BY CASE role WHEN 'teacher' THEN 1 WHEN 'incharge' THEN 2 WHEN 'admin' THEN 3 ELSE 4 END, name",
  );
  const labs = await db.query<{ id: string; name: string; colour: string }>("SELECT id, name, colour FROM resources WHERE active ORDER BY sort, name");
  return (
    <div className="signin">
      <section className="signin-hero" aria-labelledby="signin-title">
        <p className="eyebrow">Sunmarke School</p>
        <h1 id="signin-title">Book a lab in a few taps.</h1>
        <p>See what is free, pick a period, and your lab in-charge gets it in their calendar. Or just ask the assistant.</p>
        <ul className="signin-labs" aria-label="Labs you can book">
          {labs.map((l) => (
            <li key={l.id}><LabIcon colour={l.colour} size="sm" />{l.name}</li>
          ))}
        </ul>
      </section>

      <div>
        <h2>Sign in</h2>
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
        <ul className="people">
          {people.map((p) => (
            <li key={p.email}>
              <form action="/api/v1/session" method="post">
                <input type="hidden" name="email" value={p.email} />
                {next && <input type="hidden" name="next" value={next} />}
                <button className="person" type="submit" aria-label={`Sign in as ${p.name}, ${roleText(p)}`}>
                  <Avatar name={p.name} size={36} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>{roleText(p)}</small>
                  </span>
                  <ArrowRight className="person-go" size={18} aria-hidden="true" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function roleText(p: { role: string; department: string }) {
  return p.role === "incharge" ? "Lab in-charge" : p.role === "admin" ? "Lab admin" : p.role === "viewer" ? "Leadership viewer" : `Teacher · ${p.department}`;
}
