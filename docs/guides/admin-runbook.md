# Admin runbook

For lab admins (Abd) and group admins at Fortes. Everything here is in **Admin** unless it says otherwise.

## Before the first term
1. **Staff**: import the staff list as CSV (name, email, department, role; role is teacher, incharge, admin or viewer). Existing emails are updated, so the import can be repeated.
2. **Timetables**: check the standard timetable (55-minute blocks) and add special days (exam weeks, Ramadan hours) as timetables with a higher priority for their dates.
3. **Blackout dates**: holidays, INSET days, events. Booked lessons on a new blackout are flagged and the teachers emailed.
4. **Labs and carts**: names, capacity, carts in the pool, primary and backup in-charge, lesson resource links per lab, and the campus **Labs Hub** site link.
5. **Curriculum**: the levels are a sample until the real KS3 progressive plan is imported. Use **Import CSV** (code, strand, title, year) with **Replace** to swap in the real plan.
6. **Rules**: lead time (24 h), how far ahead (28 days), cancel cut-off (2 h), cart limits, weekly quotas (off), waitlist hold (2 h), auto no-show (10 min). Rules are shared by every campus.
7. **QR codes**: print one per lab door.

## Every week
- **Bookings**: find any booking, move it to another in-charge, or book on someone's behalf from the home page (**Booking for**).
- **Equipment**: high-severity problems email you. Check open issues and who is on them.
- **Reports** (top bar): use by lab, in-charge load and cross-cover, departments, and curriculum coverage. Every table exports to CSV for Excel.

## Campuses (group admins)
**Campuses** adds a campus; it copies the standard timetable so the campus can start booking at once. Move staff between campuses on the **Staff** tab. The campus switch in the top bar changes which campus you are working on; teachers only ever see their own.

## When something goes wrong
- **Calendar and jobs**: the reminder, no-show and conflict jobs, and a switch that simulates a calendar outage (bookings then show "calendar not checked").
- **Audit log**: every admin change, with before and after.
- A teacher cannot book: open the cell yourself; the reason is the rules engine's answer. Admins can override the booking window.
- Someone left: deactivate them on **Staff**. Their future bookings stay until you cancel or move them.

## Running the system
- `pnpm dev` runs it locally with sample data; `pnpm db:reset` clears local data.
- `pnpm test` (unit), `pnpm --filter web e2e` (journeys, accessibility, access control), `pnpm --filter web load` (load). CI runs all of them on every pull request.
- Settings live in environment variables, never in the code: `APP_URL`, `SESSION_SECRET`, `CRON_SECRET`, `LABS_FROM_ADDRESS`, `PUSH_PROVIDER` (`expo` to send phone notifications), and `ASSISTANT_PROVIDER` with its API key (only if the Claude assistant is chosen).
- Waiting on Fortes IT: Google and Microsoft sign-in, real calendar and email, UAE hosting. Do not put the pilot (email-only sign-in) on the public internet.
- API: [docs/API.md](../API.md).
