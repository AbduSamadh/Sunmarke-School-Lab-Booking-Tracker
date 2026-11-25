import type { Metadata, Viewport } from "next";
import "@fontsource-variable/tektur";
import "@fontsource/nova-square";
import "@sunmarke/ui-tokens/tokens.css";
import "./globals.css";
import "./sunlit.css";
import { currentActor } from "@/lib/server/auth";
import { Nav } from "@/components/Nav";
import { RegisterSW } from "@/components/RegisterSW";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Motion } from "@/components/Motion";
import { Assistant } from "@/components/Assistant";
import { Avatar, Logo } from "@/components/LabIcon";
import { cookies } from "next/headers";
import { getDb } from "@/lib/server/db";
import { Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Sunmarke Lab Booking",
  description: "Book Sunmarke's labs and AI Carts.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/brand/sunmarke-mark.png", apple: "/brand/sunmarke-mark.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#22397f" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  const pref = (await cookies()).get("slb_theme")?.value;
  const theme = pref === "dark" || pref === "light" ? pref : null;
  // Release 2: group admins and leadership can switch campus once there is more than one.
  const campuses = actor?.allCampuses
    ? await (await getDb()).query<{ id: string; name: string; short_name: string }>("SELECT id, name, short_name FROM campuses WHERE active ORDER BY sort, name")
    : [];
  return (
    <html lang="en-GB" data-theme={theme ?? undefined} suppressHydrationWarning>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <div className="devbar" role="note">
          Pilot build: sign-in, calendars and email are simulated. Nothing is sent outside this app.
        </div>
        <header className="topbar">
          <div className="topbar-inner">
            <a className="brand" href="/" aria-label="Sunmarke School Lab Booking, home">
              <Logo name="sunmarke" alt="" height={42} />
              <span className="brand-app">Lab Booking</span>
            </a>
            {actor && <Nav role={actor.role} />}
            {!actor && <div style={{ flex: 1 }} />}
            {campuses.length > 1 && actor && (
              <form className="campus-switch" action="/api/v1/campus" method="post">
                <Building2 size={16} aria-hidden="true" />
                <label className="sr-only" htmlFor="campus-pick">Campus</label>
                <select id="campus-pick" name="campusId" defaultValue={actor.campusId}>
                  {campuses.map((c) => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
                </select>
                <button className="btn btn-quiet btn-sm" type="submit">Switch</button>
              </form>
            )}
            <ThemeToggle initial={theme} />
            {actor && (
              <div className="who">
                <Avatar name={actor.name} />
                <span className="who-text">
                  <span className="who-name">{actor.name}</span>
                  <span className="who-role">{roleLabel(actor.role)}</span>
                </span>
                <form action="/api/v1/session/signout" method="post">
                  <button className="btn btn-quiet btn-sm" type="submit">Sign out</button>
                </form>
              </div>
            )}
          </div>
        </header>
        <main id="main" className="main">{children}</main>
        <footer className="site-foot">
          <div className="site-foot-inner">
            <Logo name="sunmarke" alt="Sunmarke School" height={36} />
            <span className="small muted">Sunmarke School Lab Booking · part of</span>
            <Logo name="fortes" alt="Fortes Education" height={44} />
          </div>
        </footer>
        <RegisterSW />
        <Motion />
        {actor && <Assistant firstName={actor.name.split(" ")[0]} role={actor.role} />}
      </body>
    </html>
  );
}

function roleLabel(r: string) {
  return r === "incharge" ? "Lab in-charge" : r === "admin" ? "Lab admin" : r === "viewer" ? "Leadership" : "Teacher";
}
