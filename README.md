# 한땀 (han-ddam)

사진과 그림으로 채우는 대한민국 시·군·구 여행 도감 — Korean tourism gamification platform.

**Stack:** NestJS 10 · Drizzle ORM · PostgreSQL + PostGIS · Redis · BullMQ · Node 24

Design docs live in [`docs/pipeline/`](./docs/pipeline):
- `01-planning.md` — product requirements (FR1–FR33)
- `02-design.md` — technical architecture

---

## Architecture (this scaffold)

A **modular monolith** with **two entrypoints over one codebase**:
- `src/main.ts` — HTTP API process
- `src/worker.ts` — BullMQ worker process (no HTTP listener)

Both boot the same `AppModule`; domain logic in `src/modules/*` is written once and shared.

```
src/
  main.ts / worker.ts        # two entrypoints, one AppModule
  platform/                  # cross-cutting infra (NO domain logic)
    config/   database/   redis/   id/   clock/
  modules/                   # one bounded context per folder
    health/                  # liveness + PostGIS/Redis check
    geo/                     # the ONLY place spatial SQL lives (sql`` fragments)
    ...                      # auth, places, certification, scoring, ... (roadmap below)
  db/
    schema/                  # per-table Drizzle schema, re-exported via index.ts
    columns.ts               # PostGIS geometry custom types
    migrations/              # drizzle-kit output + hand-authored spatial SQL
```

**Convention per module:** `*.controller.ts` (thin) → `*.service.ts` (logic + public facade) → `*.repository.ts` (only place that touches the DB). A module exports **only** its public service; cross-module calls go through that facade or domain events — never into another module's repository.

---

## Getting started

Prereqs: **Node 24+**, **pnpm 9+**, **Docker**.

```bash
cp env.example .env            # adjust secrets
pnpm install
pnpm infra:up                  # postgres(postgis) + redis via docker compose
pnpm db:generate               # drizzle-kit: generate SQL migration from schema
pnpm db:migrate                # apply migrations
pnpm start:dev                 # API on http://localhost:3000/api
pnpm worker                    # (separate terminal) BullMQ worker
```

Verify: `curl http://localhost:3000/api/health` → returns PostGIS version + Redis status.

---

## Migration workflow (PostGIS caveat)

`drizzle-kit` generates table DDL from `src/db/schema/*`, but it **cannot infer** the
spatial pieces. These are **hand-authored** into the generated migration files:

- `CREATE EXTENSION postgis / pg_trgm` — already created on first DB init by
  `docker/initdb/01-extensions.sql` (local). Add to the first prod migration too.
- **GIST** indexes: `region.boundary`, `place.coords`, `certification.device_point`.
- **GIN** indexes: FTS `tsvector`, `pg_trgm` on names.
- `tsvector` generated columns, partial unique indexes.

Always review every generated migration before `db:migrate`.

### ⚠️ De-risking PoC (do before broad build-out — see 02-design.md §10)

The load-bearing technical risk is **PostGIS through Drizzle**. `GeoService` already
encodes the pattern (`ST_Contains` / `ST_DWithin` / `ST_Distance` via `sql``). Seed a
few `region` polygons + spots and confirm those queries + their GIST index plans before
building the certification pipeline on top.

---

## Module roadmap (build order from 02-design.md)

`platform` ✅ → `auth/users` → `geo` ✅ (pattern set) → `places/ingestion` →
`certification` + `scoring` + outbox/EventBus → `progress`/`collections` →
`challenges`/`rankings` → `discovery`/`suntime` →
`contests`/`consent`/`moderation`/`verification` → `social`/`reviews`/`notifications` →
`admin`/`audit`.

Open questions Q1–Q11 (see `01-planning.md` §6) have safe config defaults; Q1/Q5
(license + consent) are resolved via versioned **약관**(`agreement`) acceptance.
