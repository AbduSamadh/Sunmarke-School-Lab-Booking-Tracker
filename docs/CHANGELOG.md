# Changelog

## 0.1.0 (25 Nov 2026)

First working version from the build plan, with D1–D10 on the plan's proposed defaults (see DECISIONS.md).

- Rules engine (packages/rules): timetables as data, primary-then-fallback in-charge, cart pool counts, blackouts, booking window with admin override, double lessons needing one in-charge, half-open block overlap, cancel cut-off, calendar clash detection.
- Postgres schema with unique indexes for one in-charge and one room per block (R7).
- Availability grid (day and week views, phone layout), 3-step booking sheet with smart defaults, confirmation with 10 s undo, "just taken" with alternatives, waitlist.
- My Bookings: edit details, cancel (2 h cut-off), rebook.
- In-charge today view: next session pinned, attendance, decline with reason, block time.
- Admin: labs and carts with primary/fallback, timetables, blackouts, staff CSV import with per-row errors, rules, calendar outage simulation, scheduled jobs, audit log.
- Reports: utilisation, in-charge load and cross-cover, demand turned away, busiest blocks, department/subject/year, CSV export.
- Simulated calendar and email outbox (ICS invites), job queue with retries and admin alert after 3 failures, 24 h reminders, 07:00 digest.
- Tests: 21 rule tests (T1–T7, T11–T14, T18 and more), 11 database tests (T8, T9, T10, T15, T16, T17 and more). axe-core WCAG A/AA scan clean on all screens.
