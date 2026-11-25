# Release 2 spec: phone app, campuses, curriculum

Scope agreed with abd on 25 Nov 2026: everything in Release 2 that does not need Fortes IT, without the Arabic UI.

## Phone app (apps/mobile)
- [x] Expo app for iOS and Android using only `/api/v1`; no availability logic in the app.
- [x] Sign in by school email (pilot); token in secure storage; sign out removes it and the push registration.
- [x] Book: week of school days, lab chips, each period free / booked / unavailable with the reason; booking form; a 409 shows the reason and up to 4 alternatives that can be booked with one tap.
- [x] Mine: upcoming and past, cancel with confirmation (server applies the cut-off).
- [x] Sessions (in-charge, admin): today and tomorrow, Attended / No-show once started.
- [x] Check in: QR scan or typed code.
- [x] Touch targets 48 pt, screen-reader roles and labels, system font scaling, light and dark.

## Push notifications
- [x] `POST/DELETE /api/v1/devices`; every booking email also creates a push for the same people.
- [x] Off unless `PUSH_PROVIDER=expo`; a failed push never fails or repeats the email.

## Campuses
- [x] Campus on staff, labs, timetables, blackouts; grid, in-charge, admin and reports scoped to the current campus.
- [x] Teachers cannot book another campus (403). Group admins switch campus; the switch is checked server-side.
- [x] Admin › Campuses (group admins): add, rename, close; move staff between campuses.

## Curriculum mapping
- [x] Admin-editable levels, CSV import with replace; up to 5 levels per booking, validated server-side.
- [x] Reports: sessions per level, levels not yet covered, CSV export.

## Labs Hub
- [x] Campus Labs Hub link (https only) in the footer and confirmation emails.

## API, tests, docs
- [x] OpenAPI 3.1 from the route schemas; a test fails when a route is missing or the published copy is stale.
- [x] Playwright journeys per role; axe WCAG 2.2 AA on every screen, light and dark; 401/403 for every route and role; load test (p95 < 800 ms, no 5xx, exactly one winner in a 30-way race); CI on every pull request.
- [x] Teacher, in-charge and admin guides with screenshots; walkthrough recordings.

## Not in this release
- Teams / Google Chat notifications (Fortes IT).
- Store publishing (school developer accounts, SSO).
- Arabic UI (dropped).
