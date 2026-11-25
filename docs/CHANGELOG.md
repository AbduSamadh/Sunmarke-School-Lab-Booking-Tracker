# Changelog

## 2.1.0 (25 Nov 2026)

abd's changes of 25 Nov.

- Nael works Quantum and the AI Carts with Ram (Ram, then Nael, then Abdul), and steps in for DollarX, XReal and Strike when Abdul and Ram are busy.
- Leadership sign-ins for the Principal and the Board of Directors, next to Dr. Sreejit (SLT) and Dr. Neil. They see reports and get the weekly report.
- Hybrid labs: DollarX, XReal and Strike have a weekly ICT timetable (sample data for now). Those periods show as "Timetabled" and cannot be booked. Admins edit it in Admin › Labs and carts › Timetabled lessons.
- Curriculum levels rewritten to match the KS3 Computing programme of study. Subjects follow the KS3 curriculum (plus Arabic, Islamic Studies and Moral, Social and Cultural Studies): Physics, Chemistry, Biology and Business removed; Art & Design, Languages and Citizenship added.

- AI Carts: up to 3 carts per booking, and each cart comes with its own lab in-charge. Booking 3 carts ties up all three in-charges, so no lab can be booked in that period. The grid shows how many carts can still go out (the lower of carts left and free in-charges).
- Nael added as the third lab in-charge for every lab and the carts (after the primary and the backup). Admin › Labs and carts has a third in-charge choice.
- Dr. Sreejit added with leadership access (SLT, Principal and BOD).
- Double lessons removed: every booking is one period. Double-booking one slot was already impossible and still is.
- "Other" subject, with a box to say which subject.
- Reports: a by-teacher table (sessions, attended, no-shows, cancelled, cart sessions, students, labs, average rating) with CSV export.
- Notifications go to Microsoft Teams instead of email, through a Teams Workflows link (`TEAMS_WORKFLOW_URL`, see docs/TEAMS.md). Until the link is set, messages are kept in the app's Messages page. `NOTIFY_CHANNEL=email` switches back.
- Shareable demo: `apps/demo` builds one HTML file (`pnpm --filter demo build`) that runs the real booking rules in the browser with sample data. It needs no install or server and sends nothing anywhere.
- Full demo site to share: `apps/demo/package-site.sh` builds two zips (Windows, Mac) with the whole site, its own Node.js and double-click start files. It runs only on that computer at http://localhost:3210, keeps its data in the folder, and sends nothing anywhere.
- Sign-in page headline: "Lab Booking, made simple." (abd).
- Booking messages now say "Teams message" instead of "email". Form redirects use a relative address so they work behind a proxy.
- Existing local data: run `pnpm db:reset` to pick up the new schema columns, Nael, Dr. Sreejit and the new rules.


## 2.0.0 (25 Nov 2026)

Release 2 from the plan, minus Teams / Google Chat (waits on Fortes IT) and the Arabic interface (dropped by abd, 25 Nov).

- Phone app for iOS and Android (Expo, `apps/mobile`) on the same API: book from the week grid with the reason and nearby free slots when blocked, My bookings with cancel, Sessions for in-charges with attendance, QR check-in with the camera or a typed code, light and dark. Sign-in tokens live in the phone's secure storage and last 30 days.
- Push notifications: phones register after sign-in; every booking email also goes out as a notification. Sending is off until the school sets `PUSH_PROVIDER=expo`.
- Several campuses: each campus has its own labs, staff, timetables and blackout dates. Group admins and leadership switch campus in the top bar and add campuses in Admin › Campuses. Teachers only see and book their own campus.
- Curriculum mapping: teachers tag a booking with up to 5 KS3 levels; Reports shows how often each level was taught, which are not covered yet, and exports it to CSV. Admin › Curriculum edits the levels and imports the real plan from CSV (the 12 levels in place are samples).
- Labs Hub: admins set the campus Labs Hub site; it is linked at the foot of every page and in confirmation emails, next to the per-lab lesson links.
- API description: OpenAPI 3.1 at `/api/v1/openapi.json` and in `docs/api/openapi.json`, built from the server's own input schemas. See docs/API.md.
- Tests: Playwright journeys for each role, axe WCAG 2.2 AA on every screen in light and dark, an access-control check on every API route for every role, a load test (60 users, plus 30 people racing for one slot: exactly one wins), and a GitHub Actions workflow running all of it on every pull request.
- Guides: teacher, in-charge and admin runbook in `docs/guides`, with screenshots.
- Server: 15 new tests (44 total); phone app: 5 tests.

## 1.2.0 (25 Nov 2026)

- Dark mode switch in the top bar, with an animated sun-to-moon knob and a circular reveal. It follows the device until you choose, and remembers your choice.
- Livelier screens: hover lift and pointer glow on panels and grid cells, click ripples, gentle entrance animations, an animated tick on a confirmed booking. All motion is off when the device asks for reduced motion.
- Booking assistant (bottom-right button on every signed-in screen): ask how booking works, what is free ("free labs Thursday P3"), book ("book Quantum tomorrow P4-P5 for Y8 B science"), cancel, join a waitlist, or check the rules. It only proposes; you press Confirm, and every booking goes through the same rules and API as the grid. Admins can book for a teacher and pick the in-charge.
- New look ("Sunlit"): Tektur as the main font with Nova Square for labels and navigation, an icon and colour for each lab (in the grid, chips, bookings, reports and assistant), status icons in the grid, a greeting header, staff avatars, card-style stats with icons, and a new sign-in page. Light and dark both pass axe WCAG A/AA.
- Sunmarke School and Fortes Education logos (top bar, footer; light and dark versions) and colours taken from the Sunmarke logo: navy accent, yellow highlight, ribbon colours for the labs.
- New landing and sign-in page: a bold ribbon globe of the Sunmarke logo mark: ribbon paths, widths and colours traced from the logo, drawn in its layering order (purple, pink, orange, cyan, green, yellow) while the globe spins and comes to rest in the logo's position, lab chips, key numbers, how it works, and a card for each lab with its in-charges.
- In-charge screen redone: a greeting with the next session, four at-a-glance numbers, a week calendar by period (sessions coloured by lab, leave and blocked time shown) beside today's timeline with attendance buttons. Block time, leave, equipment and the test calendar moved into tabs with counts. Return links from these forms are now checked (no open redirects).
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
