# LifeOS — notes for coding agents

Read `README.md` and `docs/architecture.md` first. Current phase and scope: `docs/roadmap.md`.

## Non-negotiables

- **MySQL 8 only** (Prisma `provider = "mysql"`). Never switch databases. Schema changes go through `pnpm db:migrate` (Prisma Migrate) — never edit an applied migration.
- **User isolation**: every query on user-owned data filters by `userId` taken from `@CurrentUser()` (the verified token). Never accept a user id from params/body. Cross-user access returns 404.
- **Validation**: request bodies/queries use Zod schemas from `@lifeos/validation` via `ZodValidationPipe`. Add new schemas there so web/mobile share them.
- **AI never writes to the database.** The planner (Phase 3) produces `PlanningProposal` rows; changes are applied only after explicit user approval, in a transaction, with version checks. Locked events are never moved.
- **No fake functionality.** Unbuilt modules show a "Phase N" page; don't stub endpoints that pretend to work.
- No `any` without a documented reason. TypeScript strict everywhere.

## Layout

- `apps/api` — NestJS. One folder per module. Global guards in `app.module.ts`: Throttler → CSRF (`X-LifeOS-Client` header) → JWT → Roles. `@Public()` opts out of auth.
- `apps/web` — Next.js App Router. `(auth)` and `(app)` route groups. Data via TanStack Query hooks in `src/lib/queries.ts`; HTTP via `src/lib/api.ts` (auto refresh on 401). Strings in `src/i18n/messages.ts` (en + fr; a missing fr key is a type error).
- `packages/ui` — tokens in `tokens.css` (semantic, light/dark), primitives in `components.tsx`. Use the token-backed Tailwind utilities (`bg-raised`, `text-secondary`, `text-accent`…), not raw colours.
- `packages/shared` — API response types and DST-safe time helpers. All instants are UTC; local dates are `YYYY-MM-DD` in the user's timezone.

## Design

UI follows Apple's HIG principles (see the `apple-design` skill): system fonts, semantic colours, ≥ 4.5:1 text contrast (aim 7:1), appearance follows the OS unless overridden, accent colour only for interactive elements, status colours always paired with text/icons. The day ribbon on My Day is the product's signature element — keep everything around it quiet.

## Testing

- `pnpm test` — unit tests, no DB.
- `pnpm --filter @lifeos/api test:e2e` — Supertest against `TEST_DATABASE_URL` (must contain `lifeos_test`).
- Timezone tests use zones with stable rules (Europe/Paris). Africa/Casablanca's rules changed in Sept 2026 and depend on the runtime's tzdata.
