import { redirect } from "next/navigation";
import { currentActor } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getSettings } from "@/lib/server/world";
import { ArrowRight, Bot, CalendarCheck, MousePointerClick, UserCheck } from "lucide-react";
import { Avatar, LabIcon } from "@/components/LabIcon";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: nextRaw } = await searchParams;
  const next = nextRaw && /^\/(?![/\\])[\w\-/?=&.]*$/.test(nextRaw) ? nextRaw : "";
  if (await currentActor()) redirect(next || "/");
  const db = await getDb();
  const settings = await getSettings(db);
  const people = await db.query<{ name: string; email: string; role: string; department: string }>(
    "SELECT name, email, role, department FROM staff WHERE active ORDER BY CASE role WHEN 'teacher' THEN 1 WHEN 'incharge' THEN 2 WHEN 'admin' THEN 3 ELSE 4 END, name",
  );
  const labs = await db.query<{ id: string; name: string; colour: string; type: string; units: number; location: string; incharges: string | null }>(
    `SELECT r.id, r.name, r.colour, r.type, r.units, r.location,
            string_agg(s.name, ', ' ORDER BY a.priority) AS incharges
       FROM resources r
       LEFT JOIN incharge_assignments a ON a.resource_id = r.id
       LEFT JOIN staff s ON s.id = a.staff_id
      WHERE r.active
      GROUP BY r.id
      ORDER BY r.sort, r.name`,
  );
  const rooms = labs.filter((l) => l.type === "room").length;
  const carts = labs.filter((l) => l.type === "cart_pool").reduce((n, l) => n + l.units, 0);
  const weeks = Math.round(settings.maxLeadDays / 7);

  return (
    <div className="landing">
      <section className="lp-hero" aria-labelledby="lp-title">
        <div className="lp-copy">
          <p className="eyebrow">Sunmarke School · Innovation labs</p>
          <h1 id="lp-title">
            Your next lesson, <span className="hl">in the lab.</span>
          </h1>
          <p className="lp-lead">
            Book the {labs.filter((l) => l.type === "room").map((l) => l.name.replace(" Lab", "")).join(", ").replace(/, ([^,]*)$/, " and $1")} labs or a set of AI Carts in a
            few taps. Your lab in-charge is lined up for you, and the assistant can do the booking while you teach.
          </p>
          <div className="btn-row">
            <a className="btn btn-primary btn-lg" href="#signin">
              Sign in <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="btn btn-lg" href="#demo">Try a demo account</a>
          </div>
          <dl className="lp-stats">
            <div><dt>Labs</dt><dd>{rooms}</dd></div>
            <div><dt>AI Carts</dt><dd>{carts}</dd></div>
            <div><dt>Minute periods</dt><dd>55</dd></div>
            <div><dt>Weeks ahead</dt><dd>{weeks}</dd></div>
          </dl>
        </div>
        <div className="lp-art" aria-hidden="true">
          <span className="lp-ring lp-ring-1" />
          <span className="lp-ring lp-ring-2" />
          <span className="lp-ring lp-ring-3" />
          <span className="lp-mark">
            {/* The Sunmarke School logo mark, unaltered; only its position animates. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/sunmarke-mark.png" alt="" width={264} height={264} />
          </span>
          {labs.map((l, i) => (
            <span key={l.id} className={`lp-orbit lp-orbit-${i}`}>
              <LabIcon colour={l.colour} size="sm" />
              {l.name}
            </span>
          ))}
        </div>
      </section>

      <section className="lp-signin" id="signin" aria-labelledby="signin-title">
        <div>
          <h2 id="signin-title">Sign in</h2>
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
        </div>
        <div id="demo">
          <h2>Demo accounts</h2>
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
      </section>

      <section className="lp-section" aria-labelledby="how-title">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title">Three steps, no paperwork</h2>
        <ol className="lp-steps">
          <li>
            <span className="lp-step-icon"><MousePointerClick size={22} aria-hidden="true" /></span>
            <h3>Pick a free period</h3>
            <p className="muted">The grid shows every lab and period for the week, and who will be there to help.</p>
          </li>
          <li>
            <span className="lp-step-icon"><CalendarCheck size={22} aria-hidden="true" /></span>
            <h3>Confirm in one tap</h3>
            <p className="muted">Your class details are filled in from last time. It goes in your calendar with a reminder.</p>
          </li>
          <li>
            <span className="lp-step-icon"><UserCheck size={22} aria-hidden="true" /></span>
            <h3>Your in-charge is ready</h3>
            <p className="muted">The lab in-charge gets the booking straight away, and the backup covers if they are away.</p>
          </li>
          <li>
            <span className="lp-step-icon"><Bot size={22} aria-hidden="true" /></span>
            <h3>Or just ask</h3>
            <p className="muted">&ldquo;Book Quantum next Tuesday P3 for Y8 B&rdquo; and the assistant does the rest. You confirm.</p>
          </li>
        </ol>
      </section>

      <section className="lp-section" aria-labelledby="labs-title">
        <p className="eyebrow">The spaces</p>
        <h2 id="labs-title">Labs and AI Carts</h2>
        <ul className="lp-labs">
          {labs.map((l) => (
            <li key={l.id} style={{ "--lab": `var(--r-${l.colour})` } as React.CSSProperties}>
              <LabIcon colour={l.colour} size="lg" />
              <h3>{l.name}</h3>
              <p className="small muted">
                {l.type === "cart_pool" ? `${l.units} carts, delivered to your classroom` : l.location}
              </p>
              {l.incharges && <p className="small">In-charge: {l.incharges.replace(", ", ", backup ")}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function roleText(p: { role: string; department: string }) {
  return p.role === "incharge" ? "Lab in-charge" : p.role === "admin" ? "Lab admin" : p.role === "viewer" ? "Leadership viewer" : `Teacher · ${p.department}`;
}
