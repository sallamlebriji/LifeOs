# LifeOS web — production image (Next.js standalone). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t lifeos-web .
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Next.js bakes rewrites in at build time: the API address is a build argument.
ARG API_INTERNAL_URL=http://api:4010
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY . .
RUN pnpm install --frozen-lockfile --filter @lifeos/web... \
 && pnpm --filter @lifeos/web... build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S lifeos && adduser -S lifeos -G lifeos
COPY --from=build --chown=lifeos:lifeos /repo/apps/web/.next/standalone ./
COPY --from=build --chown=lifeos:lifeos /repo/apps/web/.next/static ./apps/web/.next/static
USER lifeos
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
