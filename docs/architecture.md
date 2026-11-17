# Architecture

## Principles

1. **One source of truth per concern.** MySQL holds all durable state. Zod schemas in `@lifeos/validation` define every input contract for API and clients. Response types live in `@lifeos/shared`.
2. **AI proposes, the engine validates, the user approves.** No LLM output reaches the database without passing a deterministic scheduling engine and an explicit approval (Phase 3).
3. **UTC everywhere, local time at the edges.** Instants are stored and transported in UTC. A user's IANA timezone (default `Africa/Casablanca`) is applied when computing "today", day windows and display.
4. **Honest software.** Unbuilt features are labelled with their roadmap phase, never simulated.

## System view

```
 Browser ──► Next.js (apps/web :3000) ──rewrite /api/v1/*──► NestJS (apps/api :4010) ──► MySQL 8 (Prisma)
   ▲              │                                              │
   │              └─ middleware: routing hint only               └──► Redis 7 (health now; cache/BullMQ later)
   └── httpOnly cookies (first-party via the proxy)
 Mobile (Phase 6) ──Bearer token──► NestJS
```

## Packages and boundaries

| Package | Depends on | Responsibility |
| --- | --- | --- |
| `@lifeos/shared` | date-fns, @date-fns/tz | Constants, API response types, DST-safe time helpers, interval maths |
| `@lifeos/validation` | shared, zod | Input schemas (auth, profile, preferences, My Day, tasks…) |
| `@lifeos/database` | Prisma | Schema, migrations, seed, client factory |
| `@lifeos/ui` | React, Radix Slot, CVA | Design tokens + primitives; consumed as source by Next.js |
| `@lifeos/api` | all of the above except ui | HTTP, auth, business logic |
| `@lifeos/web` | shared, validation, ui | UI |

Planned (created in their phase): `@lifeos/scheduling-engine` (pure TS, no I/O, no AI dependency), `@lifeos/ai` (provider abstraction), `apps/mobile` (Expo).

## API structure (NestJS)

- `src/app.module.ts` wires global guards in order: **Throttler → CSRF → JWT auth → Roles**, plus a Prisma exception filter.
- One folder per module (`auth`, `users`, `preferences`, `dashboard`, `tasks`, `habits`, `health`). Phase 1 keeps small modules in a single file; they split into controller/service/repository files as they grow in Phase 2.
- Pure domain logic is separated from I/O for testability, e.g. `dashboard/my-day.builder.ts` (pure) vs `my-day.service.ts` (queries).
- `bootstrap.ts` holds HTTP setup (helmet, cookies, CORS, versioning, Swagger) shared by `main.ts` and e2e tests.

## Web structure (Next.js)

- Route groups: `(auth)` (sign-in, sign-up, reset, verify) and `(app)` (shell + modules).
- `middleware.ts` redirects based on a non-secret `lifeos_session` hint cookie. It is a convenience; the API authorises every request.
- Server state: TanStack Query (`src/lib/queries.ts`), with optimistic updates for task/habit check-offs. UI state: Zustand (`src/stores/ui.ts`, sidebar only).
- HTTP: `src/lib/api.ts` adds `X-LifeOS-Client: web`, sends cookies, and on 401 performs a single-flight refresh then retries once.
- i18n: typed dictionaries (`src/i18n/messages.ts`) for `en` and `fr`; Arabic (RTL) is a planned addition.

## Design system

Tokens (`packages/ui/src/tokens.css`) are semantic: surfaces (`base`, `raised`, `sunken`, `chrome`), content (`primary`, `secondary`, `tertiary`), one interactive `accent`, and status `signal-*` colours. Light and dark values are defined; appearance follows the OS unless the user overrides it in Settings. Contrast targets: body text ≥ 7:1, secondary ≥ 7:1, tertiary (non-essential) ≥ 4.5:1. `prefers-reduced-motion`, `prefers-contrast` and `prefers-reduced-transparency` are honoured.

The **day ribbon** on My Day is the signature element: the user's day window as one bar, with busy blocks, free gaps and a "now" marker.

## Time zones

- Day boundaries are computed with `@date-fns/tz` (`localDayRange`, `localTimeOnDay`) and are DST-safe (23/25-hour days are tested).
- DATE columns (`plannedDate`, habit log `date`) store the local calendar date as midnight UTC.
- **Operational note:** correctness depends on the runtime's tz database. Morocco moved to UTC+0 on 2026-09-20; Node 24.15 bundles tzdata 2026a, which predates the change, while current browsers have it. The API logs its tzdata version at boot. Keep Node updated or provide newer ICU data (`NODE_ICU_DATA`) in production.
