# Sunmarke Lab Booking

Web app for Sunmarke teachers to book the Quantum, DollarX, XReal and Strike labs and the 10 AI Carts. A booking succeeds only when the lab is free **and** one lab in-charge (Ram or Abdul) is free; the primary in-charge is always tried first.

This is **v0.1**, built from `docs/PLAN.md`. Sign-in, calendars and email are simulated, so nothing leaves the machine. See `docs/DECISIONS.md` for every assumption.

## Run it

Needs Node 22 and pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

The first start creates a local database in `apps/web/.data/` and fills it with demo data: 3 weeks of past sessions, a few bookings next week, an outside meeting in Ram's calendar and a maintenance day for XReal. `pnpm db:reset` deletes it so the next start reseeds.

Sign in at `/signin` with one of the demo accounts listed there (for example `sara.khan@sunmarke.example` as a teacher, `ram@sunmarke.example` as an in-charge, `abd@sunmarke.example` as admin, `neil@sunmarke.example` as leadership).

## Test it

```bash
pnpm test           # 32 tests: the rules matrix (T1–T18) plus database, calendar and access-control cases
pnpm typecheck
```

## What is where

```
packages/rules      The only place that decides availability (R1–R10). Pure TypeScript, no I/O.
packages/db         Postgres schema, including the unique indexes that stop double booking (R7).
packages/ui-tokens  Colours, type and spacing as CSS variables. Swap brand colours here (D10).
apps/web            Next.js app and the /api/v1 REST API.
  lib/server/       bookings, calendar adapter, email outbox, job queue, reports, seed data
  components/       availability grid, booking sheet, My Bookings, in-charge actions
docs/               PLAN.md (the build plan), DECISIONS.md, CHANGELOG.md
```

## Screens

| Path | Who | What |
|---|---|---|
| `/` | everyone | Week grid of labs × blocks. Every unavailable cell says why. Pick a lab chip for its week view. |
| `/bookings` | teachers | Upcoming and past bookings; edit details, cancel, cancel a series, rebook, rate a session and report equipment. |
| `/incharge` | in-charges, admin | Today's timeline with attendance, next 7 days, block time, leave with automatic cover, equipment log, simulated calendar meetings. |
| `/admin` | admin | Labs and carts (with lesson links), bookings (reassign), equipment, timetables, blackouts, staff CSV import, rules (window, quotas, waitlist hold, no-shows), QR codes, calendar and jobs, audit log. |
| `/checkin/:code` | everyone | Lab-door QR code lands here; one tap marks the class as arrived. |
| `/reports` | admin, leadership | Utilisation, in-charge load, demand turned away, busiest blocks, by department, ratings and equipment; CSV export and print to PDF. |
| `/outbox` | admin, in-charges | Every email the app would have sent, with calendar invites. |

## API (v1)

All JSON, session cookie auth, validated with zod (`apps/web/lib/shared/schemas.ts`).

- `GET /api/v1/availability?from&to`
- `GET|POST /api/v1/bookings`, `GET|PATCH /api/v1/bookings/:id`
- `POST /api/v1/bookings/:id/cancel | attendance | decline`
- `GET /api/v1/alternatives?resourceId&date&blockId`
- `POST /api/v1/waitlist`
- `POST /api/v1/series` (preview by default; `preview: false` books), `POST /api/v1/series/:id/cancel`
- `POST /api/v1/bookings/:id/feedback`, `POST /api/v1/bookings/:id/reassign` (admin)
- `POST /api/v1/absences`, `DELETE /api/v1/absences/:id`
- `GET|POST /api/v1/issues`, `POST /api/v1/issues/:id/resolve`
- `POST /api/v1/checkin`
- `POST /api/v1/cron?tasks=jobs,reminders,conflicts,offers,noshow,feedback,digest,weekly` (bearer `CRON_SECRET` or admin). Every 15 min: the default set. 07:00: `digest`. Sunday 18:00: `weekly`.
- `POST /api/v1/assistant` (message, draft, history; returns cards, never writes)
- `GET /api/v1/reports/export?table=bookings|utilisation|load|department`

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | `apps/web/.data/pglite` | Database folder; `memory` for a throwaway database |
| `SESSION_SECRET` | random per start | Signs the session cookie. Set it anywhere shared. |
| `CRON_SECRET` | unset | Lets a scheduler call `/api/v1/cron` |
| `APP_URL` | `http://localhost:3000` | Links in emails |
| `FAKE_NOW` | unset | Pins the clock (ISO time) for demos and tests |
| `ASSISTANT_PROVIDER` | built-in | `claude` turns on Claude AI mode for the assistant |
| `ANTHROPIC_API_KEY` | unset | Needed only for Claude AI mode. Never commit it. |
| `ASSISTANT_MODEL` | `claude-opus-5-5` | Model for Claude AI mode |

Do not deploy this build publicly: sign-in is a placeholder until school SSO is connected.
