# LifeOS

A personal operating system: goals, tasks, calendar, habits and an AI planner that **proposes** realistic schedules a deterministic engine validates and **you approve**.

> **Status: all six phases built.** Web app, API and mobile app cover tasks, goals, projects, calendar, habits, the AI planner, sports, study, travel, analytics, notifications and calendar integrations. See [docs/roadmap.md](docs/roadmap.md) for what each phase does not cover or did not verify. See [docs/roadmap.md](docs/roadmap.md) for what ships next.

## Stack

| Layer | Technology |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo, TypeScript (strict) |
| Database | **MySQL 8.0+** (InnoDB, utf8mb4) via Prisma ORM + Prisma Migrate |
| Cache / jobs | Redis 7 (BullMQ queues arrive in Phase 5) |
| API | NestJS 11, REST `/api/v1`, OpenAPI at `/api/docs`, Zod validation |
| Web | Next.js 15 (App Router), React 19, Tailwind CSS 4, TanStack Query, Zustand, React Hook Form, Framer Motion, Radix primitives |
| Tests | Vitest, Supertest (against real MySQL), React Testing Library, Playwright |

## Repository layout

```
apps/
  api/                 NestJS REST API
  web/                 Next.js web app
  mobile/              Expo (React Native) app
packages/
  database/            Prisma schema, migrations, seed, client
  shared/              Types, constants, timezone, recurrence & interval helpers
  scheduling-engine/   Deterministic scheduler (pure, property-tested)
  ai/                  AI provider abstraction (OpenAI), Zod-validated output
  validation/          Zod schemas shared by API and clients
  ui/                  Design tokens (CSS) + React primitives
  config/              Shared ESLint config
infrastructure/
  docker/mysql/        MySQL init script (test + shadow databases)
docs/                  Architecture, database, API, security, roadmap…
docker-compose.yml     MySQL 8.4 + Redis 7 for local development
```

**AI (optional):** set `AI_PROVIDER=openai`, `AI_MODEL` and `OPENAI_API_KEY` in `.env` to enable plain-language planning. Without them the planner works from its form, and the chat says it isn't configured.

## Getting started

Prerequisites: Node.js ≥ 20.11 (developed on 24), pnpm 10, Docker Desktop.

```bash
pnpm install
```

```bash
cp .env.example .env
```

Edit `.env`: set `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` (and the matching password inside `DATABASE_URL`, `TEST_DATABASE_URL`, `SHADOW_DATABASE_URL`), and generate `JWT_ACCESS_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start MySQL (host port **3307**) and Redis, then apply migrations and seed demo data:

```bash
pnpm db:up
```

```bash
pnpm db:deploy
```

```bash
pnpm db:seed
```

Run everything in watch mode:

```bash
pnpm dev
```

- Web: http://localhost:3000 (demo login is printed by the seed: `demo@lifeos.local`)
- API: http://localhost:4010/api/v1 — OpenAPI docs: http://localhost:4010/api/docs
- Health: http://localhost:4010/api/v1/health

The web app proxies `/api/v1/*` to the API, so auth cookies stay first-party.

## Common commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | API + web in watch mode |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | Type-check everything |
| `pnpm lint` | ESLint everywhere |
| `pnpm test` | Unit tests (no database needed) |
| `pnpm --filter @lifeos/api test:e2e` | API integration tests against the MySQL test database |
| `pnpm --filter @lifeos/web test:e2e` | Playwright browser tests (needs the stack running; first run `npx playwright install chromium`) |
| `pnpm --filter @lifeos/mobile start` | Expo dev server for the mobile app (set `EXPO_PUBLIC_API_URL` to an address your phone can reach) |
| `pnpm db:migrate` | Create a new migration after editing `schema.prisma` |
| `pnpm db:studio` | Prisma Studio |

## Troubleshooting

- **Windows: `EPERM … query_engine-windows.dll.node`** during `pnpm build`/`prisma generate` — the running API holds the Prisma engine file. Stop `pnpm dev` and run it again.
- **Times off by an hour for Morocco** — Morocco moved to UTC+0 on 2026-09-20. Runtimes bundling older tzdata (Node 24.15 ships 2026a) still apply UTC+1. The API logs its tzdata version at startup; update Node when a newer tzdata is available.
- **`prisma migrate dev` refuses to run (non-interactive) or diffs every table** — on Windows, generate the SQL from the live dev database instead: `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`, save it as a new migration folder, fix table-name casing, then `pnpm db:deploy`.
- **Lower-case table names in generated migrations** — on Windows, MySQL's `lower_case_table_names=1` can make `prisma migrate dev` emit `ALTER TABLE planningproposal`. Check the generated SQL and keep PascalCase table names, or Linux servers will fail.
- **Docker Desktop fails with a `dockerInference` error** — quit Docker Desktop, delete `%LOCALAPPDATA%\Docker\run\dockerInference` (may need an admin shell or a reboot), then start it again.

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md) — schema, migrations, backup & recovery
- [API](docs/api.md)
- [Security](docs/security.md)
- [AI planner](docs/ai-planner.md) (design, Phase 3)
- [Scheduling engine](docs/scheduling-engine.md) (design, Phase 3)
- [Roadmap](docs/roadmap.md)
- [Deployment](docs/deployment.md)
- [Security audit](docs/security-audit.md)
