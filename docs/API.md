# API (/api/v1)

The website and the phone app use the same API. The full description is OpenAPI 3.1:

- Live: `GET /api/v1/openapi.json` on any running server.
- In the repo: [docs/api/openapi.json](api/openapi.json). Refresh it with `pnpm --filter web openapi` after changing a route or schema; `pnpm test` fails if it is out of date or a route is missing.

Request bodies come from the same zod schemas the server validates with (`apps/web/lib/shared/schemas.ts`), so the description cannot promise fields the server rejects.

## Signing in
- Website: the `slb_session` cookie, set by `POST /session`.
- Phone app: `POST /session` with `{ "email": "...", "client": "app" }` returns `{ actor, token }`. Send `Authorization: Bearer <token>`. Tokens last 30 days.
- When Fortes IT turns on Google / Microsoft sign-in, the email-only sign-in goes away; the cookie and Bearer token formats stay the same.

## Conventions
- Dates are school-local `YYYY-MM-DD` (Asia/Dubai). Timestamps are UTC ISO strings.
- Errors: `{ "error": { "code": "...", "message": "..." } }` with 401, 403, 404, 409 or 422.
- A blocked booking is `409` with `{ ok: false, code, reason, suggestion?, canWaitlist, alternatives }`. Show the reason; offer the alternatives.
- Every availability decision is made by `packages/rules`. Clients never decide what is free.
