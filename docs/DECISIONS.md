# Decisions and assumptions (v0.1)

Confirmed so far: D1 (55 min blocks), D3 (both Google Workspace and Microsoft 365), D9 direction (UAE, likely Fortes servers, later). The rest are still on the plan's defaults.

Version 0.1 was built from `docs/PLAN.md` before decisions D1 to D10 were signed off. Where the plan gave a proposed default, the build uses it. Each one is listed here so it can be confirmed or changed.

## D1 to D10

| # | Question | What v0.1 assumes | Where it lives | Cost to change |
|---|---|---|---|---|
| D1 | 40 min or 55 min blocks? | **Confirmed by abd, 25 Nov: 55 min.** The listed clock times (55 min, P1 07:50 to 08:45 and so on). Blocks are data, not code. | `packages/rules/src/defaults.ts`, Admin › Timetables | None: edit in Admin |
| D2 | Friday or Ramadan timetable? | Friday runs the standard day. Admin can add any number of named timetables with weekdays and a date range; the most specific one wins. | Admin › Timetables | None |
| D3 | Google, Microsoft or both? | **Confirmed by abd, 25 Nov: both.** Sign-in, calendar and email need a Google and a Microsoft adapter, chosen per staff member. Neither is connected yet. A simulated calendar and an email outbox stand in, behind `CalendarProvider` and `EmailSender` interfaces. Google is planned first. | `apps/web/lib/server/calendar.ts`, `email.ts` | One adapter each |
| D4 | Several carts per booking? | Yes, 1 to 10 carts in one booking, one in-charge. The limit is a setting. | Admin › Rules | None |
| D5 | One in-charge, two cart classrooms at once? | No. One in-charge holds one booking per block (R6), enforced by a unique index. | `booking_slots` unique index | Schema change |
| D6 | Booking window | 24 h to 4 weeks ahead; cancel up to 2 h before. Admins can override the window; overrides are logged. | Admin › Rules | None |
| D7 | Auto-confirm or approval? | Auto-confirm. The in-charge can decline with a reason, which emails the teacher and frees the slot. | In-charge › Today | Small |
| D8 | Teacher list and sign-in | Placeholder sign-in by work email checked against the staff list (no passwords). Staff can be imported from CSV. 10 demo staff with `@sunmarke.example` emails; only Ram, Abdul, Abd and Dr. Neil come from the plan, the rest are made up. | `apps/web/lib/server/auth.ts`, Admin › Staff | SSO replaces sign-in |
| D9 | Hosting and data location | **abd, 25 Nov: UAE, most likely on Fortes servers; to be decided later.** Not chosen yet. Runs locally on an embedded Postgres (PGlite) so nothing leaves the machine. | `apps/web/lib/server/db.ts` | One small adapter for managed Postgres |
| D10 | Brand colours, logo, font | Placeholder navy accent, an "S" mark and IBM Plex Sans. All colours are tokens in one file. | `packages/ui-tokens/tokens.css` | Edit one file |

## Changes from the plan's stack

- **Plain SQL instead of Drizzle.** The schema is plain Postgres in `packages/db/src/schema.ts`, and the code uses a two-method `Db` interface. Drizzle can be added on top later without a schema change.
- **Embedded Postgres (PGlite) instead of Supabase/Neon for now.** Same SQL, same unique-index protection. Moving to hosted Postgres needs a `pg` Pool adapter for the `Db` interface.
- **Plain CSS with design tokens instead of Tailwind and Radix.** Fewer moving parts for v0.1. Tokens are CSS custom properties, so a Tailwind theme can read them later.
- **No Turborepo yet.** pnpm workspaces alone are enough for one app.
- **Jobs run in-process from a Postgres table** (retries with backoff, alert after 3 failures). A host cron calls `POST /api/v1/cron` with `CRON_SECRET`; Inngest can replace this later.

## Release 1.1 (built 25 Nov 2026)

Everything in Release 1.1 that does not need Fortes IT is built. Assumptions made, all changeable in Admin › Rules:

- **Waitlist hold:** when a slot frees, the first teacher waiting gets it held for 2 hours, and only if they could actually book it (window, quota). Unclaimed offers pass to the next teacher.
- **Fair-use quota:** off by default (0). When on, it counts blocks per teacher and per department per Monday-to-Sunday week. Admin can always book past it.
- **Recurring bookings:** every 1 to 4 weeks, up to 120 days ahead (longer than the normal 4-week window, which is the point of a series). The teacher sees every date first; dates that are not free are skipped, not forced. Each date is a normal booking with its own email, and the whole series can be cancelled at once.
- **Leave and cover:** an in-charge (or admin) marks leave by day or block. Affected bookings move to the other in-charge when free; otherwise the teacher gets a "no cover" email, admin gets an alert, and the booking stays until admin decides. Removing leave does not move bookings back.
- **Admin reassign:** pick a person or "whoever is free". The teacher and both in-charges are emailed and calendars updated.
- **QR check-in and no-shows:** one printable QR code per lab door. Check-in opens 15 min before the start. A lab session with no check-in 10 min after the start becomes a no-show; carts are delivered, so they are never marked.
- **Feedback and equipment log:** teachers rate a session 1 to 5 after it starts (one email asks, once) and can report an equipment problem. In-charges can take a lab out of use while an issue is open; marking it fixed reopens the lab. High-severity issues email admin.
- **Reports:** ratings and equipment issues per lab, and a print view (the browser's "Save as PDF" makes the PDF). A weekly summary email goes to admin and leadership on Sunday evening.
- **Lesson links:** admin adds links per lab (safety rules, guides); they show in the booking sheet and the confirmation email.
- **Offline:** the PWA caches only the app shell and shows an offline page. Pages and bookings are never cached, because lab devices are shared and availability must be live.

## Release 1.2: look, motion and assistant (built 25 Nov 2026)

- **Motion:** on abd's request the UI has subtle motion (hover lift, pointer glow, click ripple, entrances). It is purely decorative and switched off under "reduce motion".
- **Brand (D10, part answered):** abd supplied the Sunmarke School and Fortes Education logos on 25 Nov 2026. Colours now come from the Sunmarke logo; abd chose the fonts: Tektur (primary, headings and text) and Nova Square (accent: labels, tags, navigation). Dark-theme logo copies recolour the navy and black text to light.
- **Theme:** stored in a `slb_theme` cookie so the page renders in the right theme with no flash.
- **Assistant:** built in by default. It understands plain requests with a parser, checks everything with packages/rules, and only ever prepares cards; the person presses the button and the normal API does the write. Teachers cannot choose the in-charge (R-rules assign primary then backup), so the assistant explains who it will be; admins can reassign.
- **Claude AI mode (open, waiting on abd):** set `ASSISTANT_PROVIDER=claude` and `ANTHROPIC_API_KEY` (optional `ASSISTANT_MODEL`) to let Claude understand requests. Claude can only call the same read-only functions; changes still need the person's press. Sent to Anthropic: the person's messages, first name and role, lab and in-charge names, free slots and their own bookings. Falls back to the built-in assistant on any error. Needs a school-approved API key and a data-protection check before switching on.

## Release 2: phone app, campuses, curriculum (built 25 Nov 2026)

- **Arabic interface: dropped** at abd's request (25 Nov). The layout does not depend on text direction, so it can be added later.
- **Campuses:** labs, staff, timetables and blackout dates belong to a campus. The booking rules (lead time, cut-off, quotas) are shared by every campus for now; per-campus rules would be a settings change, not a rules change. Teachers can only book their home campus. Group admins (`all_campuses`, currently abd and Dr. Neil) switch campus; a new campus starts with a copy of the standard timetable.
- **Curriculum levels are samples** (12 levels, CT, PR, AI and DM strands for Y7 to Y9) until the school's KS3 progressive plan is imported in Admin › Curriculum.
- **Push notifications are off** until the school approves a provider. With `PUSH_PROVIDER=expo` they go through Expo's push service (exp.host), which sees the device token, the title and a one-line message. Until then they are only logged.
- **Phone app is not published.** App Store and Play Store publishing needs school-owned developer accounts and real sign-in (SSO) first; the email-only pilot sign-in must not ship in a store build.
- **Phone sign-in:** the app gets a signed 30-day token (`Authorization: Bearer`), kept in the Keychain / Keystore. Website session cookies now expire after 14 days.
- **Labs Hub:** one link per campus (Admin › Labs and carts), plus the per-lab lesson links from Release 1.1. The real Labs Hub URL still needs entering.
- **Load:** on the embedded database, 60 simultaneous users gave p95 about 0.6 s with no errors, and 30 simultaneous requests for one slot gave exactly one booking. The occasional slow request (p99 about 4 s) comes from the single-process embedded database and should go once the app runs on hosted Postgres.

## Release 2.1: abd's changes (25 Nov 2026)

- **AI Carts rule changed (D4, D5):** at most 3 carts per booking, and each cart needs its own free in-charge, so 3 carts take Ram, Abdul and Nael and nothing else is bookable in that period. Each in-charge gets their own slot row, so the database index still stops anyone being in two places.
- **Nael** works Quantum and the AI Carts with Ram (order Ram, Nael, Abdul) and steps in for DollarX, XReal and Strike when Abdul and Ram are both busy (Abdul, Ram, Nael). Read from abd's note "primarily for Quantum and AI Carts like Ram"; a strict order is kept (not load-balancing between Ram and Nael) so who comes is predictable.
- **Leadership sign-ins:** Dr. Sreejit (SLT), the Principal and the Board of Directors each have a viewer (reports) sign-in across campuses. The Principal and BOD names and emails are placeholders until the staff list arrives; the weekly report goes to all of them.
- **Hybrid labs:** DollarX, XReal and Strike host regular ICT lessons. A new weekly "timetabled lessons" list per lab makes those periods unbookable (rules engine, R1). The ICT timetable in place is dummy data (about 2 to 3 periods a day per lab) until the real one is entered in Admin.
- **KS3 alignment:** the 12 sample curriculum levels were rewritten as statements from the KS3 Computing programme of study (algorithms, programming, systems and data, creative projects, online safety). The earlier AI and digital-making samples were dropped because they are not in that programme. Subjects now follow the KS3 curriculum plus the UAE's Arabic, Islamic Studies and Moral, Social and Cultural Studies: Science is one subject (no separate Physics, Chemistry, Biology), Art becomes Art & Design, French becomes Languages, Citizenship is added, and Business is removed.
- **"Remove double booking"** was read as removing the double-lesson (two-period) option. Booking one slot twice was never possible.
- **Teams instead of email:** sent through a Power Automate "When a Teams webhook request is received" workflow that someone with Teams access sets up; the app posts the recipient, subject and an Adaptive Card. No Microsoft app registration needed. Until `TEAMS_WORKFLOW_URL` is set, nothing leaves the app.

## Waiting on Fortes IT

- Real sign-in (Google Workspace and Microsoft 365 SSO), replacing the placeholder email sign-in. **Do not deploy publicly before this.**
- Google and Microsoft calendar adapters (read busy times, write events) and a sending account for email. The simulated calendar and outbox stand in until then.
- Hosting in the UAE (D9), backups, error monitoring and a scheduler calling `/api/v1/cron`.
- The Teams Workflows link for notifications (docs/TEAMS.md), from someone with Teams admin or Workflows access.
