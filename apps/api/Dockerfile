# LifeOS API — production image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t lifeos-api .
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && apk add --no-cache openssl
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @lifeos/api... \
 && pnpm --filter @lifeos/api... build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && apk add --no-cache openssl && addgroup -S lifeos && adduser -S lifeos -G lifeos
WORKDIR /repo
# The workspace is copied whole: built packages live in git-ignored dist/ folders
# that packers skip, and the Prisma CLI is needed by the migrate service.
COPY --from=build --chown=lifeos:lifeos /repo ./
USER lifeos
EXPOSE 4010
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:4010/api/v1/health >/dev/null || exit 1
CMD ["node", "apps/api/dist/main.js"]
