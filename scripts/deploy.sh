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

echo "▶ up"
$COMPOSE up -d

echo "▶ prune dangling images"
docker image prune -f >/dev/null || true

echo "✓ deployed ${APP_IMAGE}"
