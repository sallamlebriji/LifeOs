# Roadmap

## Phase 1 — Foundation ✅

Done:
- pnpm + Turborepo monorepo; strict TypeScript; shared ESLint/Prettier
- Docker Compose for MySQL 8.4 + Redis 7; init script for test and shadow databases
- Prisma schema (27 tables), initial migration, dev seed
- NestJS API: config validation, Prisma, Redis health, audit log, throttling, CSRF, OpenAPI
- Authentication: register, login, logout, refresh rotation with reuse detection, email verification, password reset, password change
- Users: profile, preferences, data export, account deletion
- My Day endpoint: agenda, top priority, free time, habits, goals, rule-based insights; quick-add task, task status, habit check-off
- Design system (tokens + primitives, light/dark); web app shell with collapsible sidebar and mobile drawer; auth screens; My Day; Settings
- en/fr i18n foundation
- Tests: shared, validation, My Day logic, API e2e on MySQL (auth, isolation, deletion…), web components and API client; Playwright smoke test

Not done in Phase 1 (by design): real email transport (log transport only), Redis-backed rate limiting, background jobs.

## Phase 2 — Core life management ✅

Done:
- Tasks: full CRUD, one level of subtasks, dependencies (cycle-checked; blocked tasks can't be completed), RRULE recurrence (completing rolls the next occurrence forward), fixed vs flexible / splittable scheduling fields, time tracking, manual order, filters + cursor pagination
- Goals: annual → daily hierarchy (validated), milestones, progress history, target-based or milestone-based progress
- Projects: CRUD, milestones (new `ProjectMilestone` table), Kanban board (drag between columns, keyboard-accessible), tracked vs estimated time
- Calendar: day / week / month / agenda; drag to move or resize (15-min snap, across days); recurring events expanded per-timezone (DST-safe); locked events can't move until unlocked; fixed/flexible flag; conflict detection (warnings, never blocks)
- Availability rules (weekly windows and one-off blocks) in Settings
- Habits: CRUD, archive, daily / specific days / N per week, reminder time (stored), streaks (days or weeks), 28-day consistency, 7-day check-off grid
- My Day now includes recurring event occurrences and frequency-aware habit streaks
- Categories CRUD

Not in Phase 2: editing a single occurrence of a recurring event (edits apply to the series), reminder delivery (Phase 5).

## Phase 3 — AI personal planner ✅

Done: deterministic scheduling engine package (property-tested); AI provider package (OpenAI, JSON-schema output validated with Zod, corrective retry, backoff); planner API (propose, per-change accept/reject/move, transactional apply with fingerprint and version checks, expiry, regenerate/supersede, undo, audit); chat endpoint (503 when not configured); planner UI with before/after day strips; task blocks shown on the calendar. Not verified: live OpenAI calls — the provider is tested against a stubbed HTTP layer only, as no API key was available.

Original scope:
`packages/scheduling-engine` (deterministic, extensively tested), `packages/ai` (provider abstraction, OpenAI first, structured outputs validated with Zod), conversation UI, planning proposals with before/after comparison, per-change accept/modify/reject, transactional application with optimistic concurrency, expiry and audit trail. See [ai-planner.md](ai-planner.md) and [scheduling-engine.md](scheduling-engine.md).

## Phase 4 — Advanced modules

Sports & fitness (adds `Workout`/`ExerciseLog`), Study (courses/chapters, revision planning, spaced repetition), Travel (itinerary, checklist, calendar blocking), Analytics with weekly and monthly reports.

## Phase 5 — Integrations

Google Calendar (OAuth 2.0, import/export, sync logs), Apple Calendar (native, iOS), notifications (in-app, push, email), BullMQ background jobs, real email delivery, encrypted integration credentials.

## Phase 6 — Mobile & production

Expo app (iOS/Android, Expo Router, push notifications, offline-friendly), production configuration, performance work, security audit, full Playwright coverage, deployment documentation.
