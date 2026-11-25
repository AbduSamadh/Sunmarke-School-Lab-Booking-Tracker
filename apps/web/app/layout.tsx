import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@sunmarke/ui-tokens/tokens.css";
import "./globals.css";
import { currentActor } from "@/lib/server/auth";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Sunmarke Lab Booking",
  description: "Book Sunmarke's labs and AI Carts.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1d4e89" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  return (
    <html lang="en-GB">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <div className="devbar" role="note">
          Pilot build: sign-in, calendars and email are simulated. Nothing is sent outside this app.
        </div>
        <header className="topbar">
          <div className="topbar-inner">
            <a className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">S</span>
              <span>Sunmarke Labs</span>
            </a>
            {actor && <Nav role={actor.role} />}
            {actor && (
              <div className="who">
                <span className="who-name">{actor.name}</span>
                <span className="tag">{roleLabel(actor.role)}</span>
                <form action="/api/v1/session/signout" method="post">
                  <button className="btn btn-quiet btn-sm" type="submit">Sign out</button>
                </form>
              </div>
            )}
          </div>
        </header>
        <main id="main" className="main">{children}</main>
      </body>
    </html>
  );
}

function roleLabel(r: string) {
  return r === "incharge" ? "Lab in-charge" : r === "admin" ? "Lab admin" : r === "viewer" ? "Leadership" : "Teacher";
}
