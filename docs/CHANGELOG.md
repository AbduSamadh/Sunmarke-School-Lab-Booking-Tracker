# Changelog

## 1.2.0 (25 Nov 2026)

- Dark mode switch in the top bar, with an animated sun-to-moon knob and a circular reveal. It follows the device until you choose, and remembers your choice.
- Livelier screens: hover lift and pointer glow on panels and grid cells, click ripples, gentle entrance animations, an animated tick on a confirmed booking. All motion is off when the device asks for reduced motion.
- Booking assistant (bottom-right button on every signed-in screen): ask how booking works, what is free ("free labs Thursday P3"), book ("book Quantum tomorrow P4-P5 for Y8 B science"), cancel, join a waitlist, or check the rules. It only proposes; you press Confirm, and every booking goes through the same rules and API as the grid. Admins can book for a teacher and pick the in-charge.
- Optional Claude AI mode for the assistant, off by default (see DECISIONS.md).
- Server: 8 new assistant tests (29 total).

## 1.1.0 (25 Nov 2026)

Release 1.1 from the plan, minus anything that needs Fortes IT (see DECISIONS.md).

- Waitlist offers now hold the slot for the first teacher for 2 hours; expired offers pass to the next teacher.
- Fair-use quotas per teacher and per department per week (off by default).
- Recurring bookings: "Repeat this lesson" in the booking sheet, a preview of every date, then one tap to book; cancel a whole series from My bookings.
- Admin books on behalf of a teacher, and reassigns any booking to another in-charge (Admin › Bookings).
- In-charge leave with automatic cover by the other in-charge; uncovered bookings email the teacher and admin.
- QR check-in per lab door (Admin › QR codes, printable), and automatic no-shows for lab sessions with no check-in.
- Post-session rating and equipment problem report; equipment log with "out of use" blocking (In-charge page and Admin › Equipment).
- Lesson resource links per lab, shown when booking and in the confirmation email.
- Reports: ratings and equipment per lab, print or save as PDF. Weekly summary email to admin and leadership.
- PWA offline page and asset cache. Sign-in returns you to the page you were going to (used by the QR codes).
- Rules engine: 11 new tests (32 total); server: 10 new tests (21 total). axe WCAG A/AA clean on every new screen, light and dark.

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
