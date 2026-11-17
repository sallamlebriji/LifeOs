# Database

MySQL 8.0+ (developed against 8.4), InnoDB, `utf8mb4` / `utf8mb4_0900_ai_ci`, server time zone `+00:00`. Access exclusively through Prisma Client; schema in `packages/database/prisma/schema.prisma`.

## Conventions

- Primary keys: UUID v4 as `CHAR(36)`.
- `DATETIME(3)` in UTC for instants; `DATE` for local calendar dates (stored as midnight UTC of that date).
- Every user-owned table has `userId` + an index starting with `userId`. Deleting a user cascades to everything they own.
- Optional relations to other entities use `ON DELETE SET NULL` (e.g. deleting a project keeps its tasks).
- `version INT` on `Task`, `TaskSchedule`, `CalendarEvent`, `PlanningProposal` for optimistic concurrency.
- Secrets are never stored in clear: passwords (Argon2id), refresh/verification tokens (SHA-256), integration credentials (AES-256-GCM, Phase 5).

## Entities (27 tables)

| Area | Tables |
| --- | --- |
| Identity | `User`, `UserPreferences`, `Session` (refresh-token families), `VerificationToken`, `AuditLog` |
| Organisation | `Category`, `Goal`, `GoalMilestone`, `Project`, `Task`, `TaskDependency`, `TaskSchedule` |
| Time | `CalendarEvent`, `AvailabilityRule` |
| Habits | `Habit`, `HabitLog` (unique per habit + date) |
| Study | `StudySubject`, `StudySession` (SM-2 fields ready for spaced repetition) |
| Travel | `Trip`, `TripActivity` |
| AI planning | `PlanningProposal` (status, revision, expiry, `baseFingerprint`), `PlanningChange` (per-change decision + target version), `AIConversation`, `AIMessage` (token usage) |
| Platform | `Notification`, `Integration` (encrypted credentials, sync cursor), `SyncLog` |

`Session`, `VerificationToken`, `AuditLog` and `TaskDependency` were added beyond the required 23 entities: refresh-token rotation, single-use email tokens, the audit trail and task dependencies each need their own table.

Notable constraints: `User.email` unique; `Category (userId, name)` unique; `HabitLog (habitId, date)` unique; `CalendarEvent (integrationId, externalId)` unique for idempotent sync; `Integration (userId, provider, externalAccountId)` unique.

## Migrations

```bash
pnpm db:migrate        # create + apply a migration in development (uses SHADOW_DATABASE_URL)
pnpm db:deploy         # apply pending migrations (CI, production, test DB)
pnpm --filter @lifeos/database migrate:reset   # drop & recreate (dev only)
```

The MySQL user has no global `CREATE DATABASE` privilege, so `prisma migrate dev` uses the pre-created `lifeos_shadow` database (`infrastructure/docker/mysql/init.sql`).

## Seed

`pnpm db:seed` creates a demo account (`demo@lifeos.local`, password printed to the console) with categories, a goal, a project, tasks, events, habits and working-hours availability for today. It deletes and recreates only that account and refuses to run with `NODE_ENV=production`.

## Backup and recovery

**Logical backup** (consistent snapshot without locking InnoDB tables):

```bash
docker compose exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --set-gtid-purged=OFF lifeos' > backups/lifeos-$(date +%F).sql
```

**Restore** into an empty database:

```bash
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" lifeos' < backups/lifeos-YYYY-MM-DD.sql
```

Then run `pnpm db:deploy` so any migrations newer than the backup are applied.

**Production recommendations**

- Use a managed MySQL 8 service with automated daily snapshots and binary-log point-in-time recovery (retain ≥ 7 days).
- Take an additional logical dump before every production migration.
- Encrypt backups at rest; store them in a separate account/region.
- Test a restore into a staging database at least monthly and record the time it takes (your real RTO).
- `backups/` is git-ignored; never commit dumps (they contain personal data).
