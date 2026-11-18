# Deployment

## Topology

```
Internet ── TLS reverse proxy ── web (Next.js, :3000) ── api (NestJS, :4010) ── MySQL 8.4
                                                               └──────────────── Redis 7 (jobs)
```

Only `web` is public. The browser talks to `/api/v1/*` on the web origin, which Next.js proxies to the API, so auth cookies stay first-party. The mobile app calls the API URL directly with bearer tokens; expose `/api/v1` on the same domain through the proxy for it.

## With Docker Compose

1. `cp .env.production.example .env.production` on the server and fill every value:
   - strong `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `REDIS_PASSWORD` (and the same values inside `DATABASE_URL` / `REDIS_URL`);
   - `JWT_ACCESS_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`;
   - `INTEGRATION_ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` — keep it safe; losing it means users reconnect Google;
   - `SMTP_URL` / `MAIL_FROM` (production refuses `MAIL_TRANSPORT=log`), `COOKIE_SECURE=true`, your public `WEB_ORIGIN`.
2. `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`
   - `migrate` runs `prisma migrate deploy` once, then `api` starts with `JOBS_ENABLED=true`.
3. Point the reverse proxy at `web:3000` with HTTPS. The API sets `trust proxy`, so client IPs for rate limiting and audit logs come from `X-Forwarded-For`.

> These images and the compose file were written but **not built or run** in the development environment (Docker Desktop was broken there). Build them once in CI or staging before relying on them.

## Without Docker

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm db:deploy
NODE_ENV=production node apps/api/dist/main.js
pnpm --filter @lifeos/web start
```

## Operations

- **Backups**: `mysqldump --single-transaction --routines --triggers lifeos` nightly plus binary logs for point-in-time recovery — see [database.md](database.md).
- **Migrations**: always `prisma migrate deploy` (never `migrate dev`) against production. Check generated SQL for PascalCase table names (see README troubleshooting).
- **Health**: `GET /api/v1/health` returns 503 when MySQL is down and `degraded` when Redis is down (jobs paused, app still serves).
- **Scaling**: the API is stateless; run several instances. BullMQ job schedulers are keyed so reminders and syncs run once. Rate limits are kept in memory per instance (see security audit).
- **Mobile**: build with EAS (`eas build`); set `extra.apiUrl` (or `EXPO_PUBLIC_API_URL`) to the public API URL and `extra.eas.projectId` for push.
