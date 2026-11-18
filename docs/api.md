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

## Life-management modules (Phase 2)

All list endpoints are scoped to the caller. Paginated lists return `{ items, nextCursor }`; pass `cursor` and `limit` (1–100) to page. Updates that carry a `version` fail with **409** if the row changed since you read it. Ids of another user's rows referenced in a body (project, goal, category, parent…) fail with **400** "… not found".

### Categories

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/categories` | Default set is created at sign-up |
| POST / PATCH / DELETE | `/categories[/:id]` | Unique name per user (409); deleting keeps items, uncategorised |

### Tasks

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/tasks` | Filters: `status` (`OPEN` = to do + in progress), `priority`, `projectId`, `goalId`, `categoryId`, `q`, `includeSubtasks`; `sort` = `smart` · `due` · `created` · `manual` |
| POST | `/tasks` | Full task: scheduling mode (`FLEXIBLE`/`FIXED` + `fixedStartAt`), `splittable` + `minSessionMinutes`, `preferredTimeOfDay`, `recurrenceRule` (RRULE), `parentId` (one level of subtasks) |
| GET | `/tasks/:id` | With subtasks, `dependsOn`, `blocks` |
| PATCH | `/tasks/:id` | Requires `version` |
| PATCH | `/tasks/:id/status` | Quick status change. Completing a task with open dependencies → 409. Completing a recurring task creates the next occurrence (subtasks copied) |
| DELETE | `/tasks/:id` | Deletes subtasks too |
| POST / DELETE | `/tasks/:id/dependencies[/:dependsOnId]` | Cycles rejected (400) |
| POST | `/tasks/:id/time` | `{ minutes }` adds tracked time |
| PUT | `/tasks/order` | `{ ids }` sets manual order |

### Goals

| Method | Path | Notes |
| --- | --- | --- |
| GET / POST | `/goals` | Levels ANNUAL → DAILY; a parent must be a broader level, no loops |
| GET / PATCH / DELETE | `/goals/:id` | `progress` (0–1) comes from target/current, else milestones |
| POST | `/goals/:id/progress` | `{ value, note? }` — appends to history; reaching the target completes the goal |
| POST / PATCH / DELETE | `/goals/:id/milestones[/:milestoneId]` | `{ completed: true }` toggles |

### Projects

| Method | Path | Notes |
| --- | --- | --- |
| GET / POST | `/projects` | Archived hidden unless `status=ARCHIVED` |
| GET / PATCH / DELETE | `/projects/:id` | Includes `taskCounts` per Kanban column, `trackedMinutes`, `estimatedMinutes`, milestones. Deleting keeps tasks (unassigned) |
| POST / PATCH / DELETE | `/projects/:id/milestones[/:milestoneId]` | |

The Kanban board is `GET /tasks?projectId=…&sort=manual` + `PATCH /tasks/:id/status`.

### Calendar & availability

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/calendar/events?from&to` | ≤ 62 days. Recurring series are expanded in the **event's** timezone (DST-safe); response includes `conflicts` (overlapping pairs) |
| POST | `/calendar/events` | Returns `{ event, conflicts }` — overlaps are warnings, never blocks |
| PATCH | `/calendar/events/:id` | Requires `version`. Edits apply to the whole series. Moving a **locked** event → 409 unless the same request unlocks it |
| DELETE | `/calendar/events/:id` | Deletes the series |
| GET / POST | `/availability` | Weekly rule (`weekday` + `startTime`/`endTime`) or one-off block (`startsAt`/`endsAt`); kinds: working hours, unavailable, preferred, protected free time |
| PUT / DELETE | `/availability/:id` | |

### Habits

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/habits?archived&days` | Each habit with `stats` (current/longest streak, 28-day consistency, this week) and `recent` completions |
| POST / PATCH / DELETE | `/habits[/:id]` | `DAILY`; `WEEKLY` + `daysOfWeek`; `CUSTOM` + `timesPerWeek` or days. `{ archived: true }` archives. `reminderTime` is stored; delivery ships with notifications (Phase 5) |
| PUT | `/habits/:id/completion` | `{ date, done }` — idempotent |

## Planner (Phase 3)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/planner/status` | `{ aiConfigured, provider, model }` |
| POST | `/planner/proposals` | `{ startDate, endDate (max 14 days), includeOpenTasks, taskIds?, activities[] }` returns a proposal; writes nothing to the calendar |
| GET | `/planner/proposals[/:id]` | Recent proposals; expired ones are marked `EXPIRED` |
| PATCH | `/planner/proposals/:id/changes/:changeId` | `{ decision: ACCEPTED, REJECTED or MODIFIED, startAt?, endAt? }`; moves are re-checked (409 on overlap) |
| POST | `/planner/proposals/:id/apply` | Applies non-rejected changes atomically; **409 `STALE_PROPOSAL`** if anything changed since |
| POST | `/planner/proposals/:id/reject`, `/regenerate`, `/revert` | Discard; new revision (old becomes `SUPERSEDED`); undo an applied plan |
| POST | `/planner/chat` | `{ message, conversationId? }` returns `{ conversationId, reply, proposal or null }`; **503 `AI_NOT_CONFIGURED`** without a provider |
| GET | `/planner/conversations/:id` | Messages of one conversation |

`GET /calendar/events` also returns `taskBlocks` (scheduled work on tasks).

## Health

`GET /health` → `{ status: ok | degraded | down, checks: { mysql, redis } }`. 503 when MySQL is unreachable; Redis down is `degraded`.
