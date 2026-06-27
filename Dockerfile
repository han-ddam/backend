# syntax=docker/dockerfile:1

# ---- base: node + pnpm(corepack) ----
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- build: all deps → compile dist ----
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- proddeps: production-only node_modules ----
FROM base AS proddeps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---- runtime ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# migration SQL (drizzle-kit output) for the programmatic migrator (node dist/db/migrate.js)
COPY --from=build /app/src/db/migrations ./dist/db/migrations
COPY package.json ./
USER node
EXPOSE 3000
# API by default; worker overrides command in compose (node dist/worker.js)
CMD ["node", "dist/main.js"]
