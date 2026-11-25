# Sunmarke Lab Booking

Source of truth: docs/PLAN.md (the build plan) and docs/DECISIONS.md (what v0.1 assumed and what is still open).

## Non-negotiables
- All availability logic lives in packages/rules. Never duplicate it in UI or API.
- Rules R1–R10 in docs/PLAN.md are law. Any change needs a plan update first.
- Every booking write runs in one DB transaction, protected by the unique indexes on booking_slots.
- Timezone Asia/Dubai. Store UTC, display local, 24 h times.
- UI uses only tokens from packages/ui-tokens. No gradients, glass, emoji, or stock card grids. Subtle motion (hover lift, pointer glow, ripples, entrances) is allowed by abd's request and must switch off under prefers-reduced-motion.
- Read the frontend-design and dataviz skill guidance before UI or chart work; apply principles, not their visual style.
- WCAG 2.2 AA on every screen.
- No secrets in code. Use .env.local and the host's env vars.

## Workflow per task
1. Write or update the phase spec with acceptance criteria.
2. Build, with unit tests. Run pnpm typecheck and pnpm test before handing back.
3. Review against the spec, R1–R10, security and the design tokens. Fix every "must" finding.
4. Walk the changed screens as a teacher, an in-charge and an admin.
5. Update docs/CHANGELOG.md.

## Commands
pnpm dev | pnpm test | pnpm typecheck | pnpm build | pnpm db:reset
