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

## Phase 2 — Core life management

Tasks (full CRUD, subtasks, dependencies, recurrence, splittable/fixed), Goals (levels, milestones, progress history), Projects (Kanban, milestones, time tracking), Calendar (day/week/month/agenda, drag-and-drop, recurring, locked/flexible events, conflict detection), Availability rules, Habits (CRUD, custom frequency, reminders, consistency). Pagination on list endpoints.

## Phase 3 — AI personal planner

`packages/scheduling-engine` (deterministic, extensively tested), `packages/ai` (provider abstraction, OpenAI first, structured outputs validated with Zod), conversation UI, planning proposals with before/after comparison, per-change accept/modify/reject, transactional application with optimistic concurrency, expiry and audit trail. See [ai-planner.md](ai-planner.md) and [scheduling-engine.md](scheduling-engine.md).

## Phase 4 — Advanced modules

Sports & fitness (adds `Workout`/`ExerciseLog`), Study (courses/chapters, revision planning, spaced repetition), Travel (itinerary, checklist, calendar blocking), Analytics with weekly and monthly reports.

## Phase 5 — Integrations

Google Calendar (OAuth 2.0, import/export, sync logs), Apple Calendar (native, iOS), notifications (in-app, push, email), BullMQ background jobs, real email delivery, encrypted integration credentials.

## Phase 6 — Mobile & production

Expo app (iOS/Android, Expo Router, push notifications, offline-friendly), production configuration, performance work, security audit, full Playwright coverage, deployment documentation.
