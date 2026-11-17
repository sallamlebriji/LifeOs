# API (v1)

Base URL: `/api/v1`. Interactive OpenAPI docs (non-production): `/api/docs`. Request bodies are documented from the same Zod schemas that validate them.

## Conventions

- JSON in and out; dates are ISO-8601 UTC strings; local calendar dates are `YYYY-MM-DD`.
- Errors: `{ statusCode, error, message, issues? }`. `issues` maps field paths to messages on validation failures (400).
- Unknown body fields are stripped (e.g. `role` in a profile update is ignored).
- Another user's resource id returns **404**, never 403.
- Mutating requests authenticated by cookie must send `X-LifeOS-Client: web` (CSRF defence). Bearer-token clients (mobile) send `X-LifeOS-Client: mobile` to receive refresh tokens in response bodies.

## Authentication

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | Creates user, preferences, default categories; signs in. 10 req / 15 min / IP |
| POST | `/auth/login` | Generic error for wrong email or password. 10 req / 15 min / IP |
| POST | `/auth/refresh` | Rotates the refresh token (cookie or `refreshToken` body field) |
| POST | `/auth/logout` | Revokes the session, clears cookies |
| POST | `/auth/verify-email` | `{ token }` — single use, 24 h |
| POST | `/auth/resend-verification` | Authenticated. 3 req / 15 min |
| POST | `/auth/forgot-password` | Always 202 with the same message |
| POST | `/auth/reset-password` | `{ token, password }` — 30 min, revokes all sessions |

Web sessions use httpOnly cookies: `lifeos_at` (access JWT, 15 min, path `/`), `lifeos_rt` (refresh, 30 days absolute, path `/api/v1/auth`), `lifeos_session` (non-secret routing hint).

## Users & preferences

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/users/me` | Profile + preferences |
| PATCH | `/users/me` | `displayName`, `avatarUrl` (https only) |
| POST | `/users/me/password` | Change password; other sessions are revoked |
| GET | `/users/me/export` | Full JSON export (no secrets) |
| DELETE | `/users/me` | `{ password, confirm: "DELETE" }` — cascades all data |
| GET / PATCH | `/preferences` | Timezone, locale, theme, day/work hours, buffers, scheduling weights… |

## My Day

`GET /my-day?date=YYYY-MM-DD` (defaults to today in the user's timezone) returns `MyDayResponse` (`packages/shared/src/api-types.ts`): agenda (events + task blocks), next up, top-priority task, tasks (planned today, due today, completed today, and overdue), due habits with streaks, goals in focus, free slots ≥ the user's minimum session length, stats, and rule-based insights.

## Phase 1 slices of later modules

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/tasks` | Quick-add: `{ title, priority?, estimatedMinutes?, plannedDate? }` |
| PATCH | `/tasks/:id/status` | `{ status }`; increments `version` |
| PUT | `/habits/:id/completion` | `{ date, done }` — idempotent |

## Health

`GET /health` → `{ status: ok | degraded | down, checks: { mysql, redis } }`. 503 when MySQL is unreachable; Redis down is `degraded`.
