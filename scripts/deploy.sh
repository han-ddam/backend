#!/usr/bin/env bash
# Pull the new image, run migrations, and (re)start the stack.
# Runs ON the server, inside the deploy dir (compose.prod.yml + .env present).
#
#   APP_IMAGE=ghcr.io/<owner>/<repo>:<tag> ./deploy.sh
#
# The CI workflow (.github/workflows/deploy.yml) sets APP_IMAGE and invokes this
# after `docker login ghcr.io`. Safe to run manually for a hotfix/rollback too.
set -euo pipefail

: "${APP_IMAGE:?APP_IMAGE 가 필요합니다 (예: ghcr.io/owner/repo:sha)}"
export APP_IMAGE

COMPOSE="docker compose -f compose.prod.yml"

echo "▶ pull ${APP_IMAGE}"
$COMPOSE pull app worker

echo "▶ migrate"
# one-off container; uses app image + .env(DATABASE_URL). DB must be up first.
$COMPOSE up -d postgres redis
$COMPOSE run --rm app node dist/db/migrate.js

# 시드는 원할 때만 — .env 의 SEED_ON_DEPLOY=1 일 때 (regions → places 순, FK)
SEED=$(grep -E '^SEED_ON_DEPLOY=' .env 2>/dev/null | cut -d= -f2- | tr -d "\"' \t\r")
if [ "$SEED" = "1" ]; then
  echo "▶ seed (regions → places)"
  $COMPOSE run --rm app node dist/db/seeds/seed-regions.js
  $COMPOSE run --rm app node dist/db/seeds/seed-places.js
fi

echo "▶ up"
$COMPOSE up -d

echo "▶ prune dangling images"
docker image prune -f >/dev/null || true

echo "✓ deployed ${APP_IMAGE}"
