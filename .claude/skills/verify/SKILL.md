---
name: verify
description: Build, launch, and drive the han-ddam NestJS API locally to verify changes end-to-end (health, auth token minting, endpoint drives)
---

# Verifying the han-ddam backend

## Toolchain (not on default PATH)
```bash
export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$HOME/Library/pnpm:$PATH"
```

## Infra + build + launch
```bash
docker ps | grep handdam         # handdam-postgres / handdam-redis usually already up; else: corepack pnpm infra:up
corepack pnpm build
node dist/main.js > "$SCRATCH/app.log" 2>&1 &   # reads .env (PORT=3000)
until curl -sf http://localhost:3000/api/health >/dev/null; do sleep 0.5; done
```
- Global prefix `api`, Swagger UI `/api-docs`, spec JSON `/api-docs-json`.
- Health: `GET /api/health` → `{result:{status,db,postgis,redis}}`.
- Migrations: `corepack pnpm db:migrate` (drizzle-kit, reads drizzle.config.ts + .env). NOTICE "already exists, skipping" lines are harmless.

## Auth for member endpoints (OAuth-only login — mint a token instead)
Member JWT payload is `{ sub: <userId> }` signed with `JWT_ACCESS_SECRET` (see `src/modules/auth/tokens/token.service.ts`). `jsonwebtoken` is not hoisted (pnpm); use the app's own `@nestjs/jwt`:
```bash
docker exec handdam-postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
  "insert into users (id, handle, display_name) values ('00000000-0000-7000-8000-000000000001','verify-tester','검증테스터') on conflict do nothing"
TOKEN=$(node -e "require('dotenv').config();const{JwtService}=require('@nestjs/jwt');console.log(new JwtService({secret:process.env.JWT_ACCESS_SECRET}).sign({sub:'00000000-0000-7000-8000-000000000001'},{expiresIn:'1h'}))")
curl -H "Authorization: Bearer $TOKEN" ...
```
DB creds: read from the container (`docker exec handdam-postgres printenv POSTGRES_USER` / `POSTGRES_DB`).

## Gotchas
- Response envelope: success = `{result:...}` only, failure = `{error:{code,message}}` only.
- Region codes are province codes (e.g. `39` = 제주). Seed data has real places.
- Cleanup: `delete from users where handle='verify-tester'` — visits cascade via FK.
- `corepack pnpm lint` fails (eslint binary not installed locally) — env issue, not a change defect.
