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

## Included early from Release 1.1

- Waitlist: join from any booked or blocked slot; the first teacher waiting is emailed when the slot frees. The 2 h acceptance hold is recorded but not yet enforced.

## Not built yet

- Real SSO (Auth.js with Google or Entra), real calendar and email adapters (waiting on D3 and IT access).
- Admin reassigning a booking to another in-charge, and booking on behalf of a teacher in the UI (the server supports `onBehalfOf`).
- Offline service worker for the PWA (the manifest is in place, so it can be added to a home screen).
- Release 1.1 items other than the waitlist: recurring bookings, quotas, QR check-in, feedback, equipment log, leave and cover, PDF reports.
- Error monitoring (Sentry), backups, k6 load test.
