#!/usr/bin/env bash
#
# Release-based deploy for the VPS.
#
#   deploy/deploy.sh <git-ref>        e.g. deploy/deploy.sh v1.2.0
#
# Layout on the server (APP_DIR, default /var/www/renovate):
#   shared/.env.local        the real environment (never in git)
#   shared/uploads/          persistent uploads when STORAGE_DRIVER=local
#   shared/logs/             app + PM2 logs
#   releases/<timestamp>/    one checkout per deploy, last KEEP_RELEASES kept
#   current -> releases/…    what PM2 runs
#
# Steps: clone the ref, install, migrate the database, build, assemble the standalone server,
# switch the symlink, reload PM2, check /api/health. If the health check fails the symlink is
# put back and PM2 reloaded again, so a bad build never stays live. Rolling back by hand is
# `deploy/rollback.sh`.
set -euo pipefail

REF="${1:?usage: deploy/deploy.sh <git-ref>}"
APP_DIR="${APP_DIR:-/var/www/renovate}"
REPO_URL="${REPO_URL:-git@github.com:tcavaa/renovate.git}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"

STAMP="$(date +%Y%m%d%H%M%S)"
RELEASE="$APP_DIR/releases/$STAMP"
SHARED="$APP_DIR/shared"
CURRENT="$APP_DIR/current"
PREVIOUS="$(readlink -f "$CURRENT" 2>/dev/null || true)"

log() { printf '\n==> %s\n' "$*"; }

mkdir -p "$APP_DIR/releases" "$SHARED/uploads" "$SHARED/logs"
[ -f "$SHARED/.env.local" ] || { echo "missing $SHARED/.env.local"; exit 1; }

log "cloning $REF into $RELEASE"
git clone --quiet --depth 1 --branch "$REF" "$REPO_URL" "$RELEASE"
cd "$RELEASE"
echo "$REF $(git rev-parse --short HEAD)" > .release

log "linking shared files"
ln -sfn "$SHARED/.env.local" .env.local
rm -rf public/uploads && ln -sfn "$SHARED/uploads" public/uploads
rm -rf logs && ln -sfn "$SHARED/logs" logs

log "installing dependencies"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile --prod=false

log "running database migrations"
pnpm db:migrate

log "building"
APP_VERSION="$REF" pnpm build
# The standalone server expects public/ and .next/static beside it.
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/static
cp ecosystem.config.cjs .next/standalone/ 2>/dev/null || true

log "switching current -> $RELEASE"
ln -sfn "$RELEASE" "$CURRENT.tmp" && mv -Tf "$CURRENT.tmp" "$CURRENT"

log "reloading PM2"
cd "$CURRENT"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save >/dev/null

log "health check"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "healthy after $attempt attempt(s)"
    break
  fi
  if [ "$attempt" -eq 10 ]; then
    echo "health check failed — rolling back"
    if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
      ln -sfn "$PREVIOUS" "$CURRENT.tmp" && mv -Tf "$CURRENT.tmp" "$CURRENT"
      (cd "$CURRENT" && pm2 startOrReload ecosystem.config.cjs --update-env)
    fi
    exit 1
  fi
  sleep 2
done

log "pruning old releases (keeping $KEEP_RELEASES)"
ls -1dt "$APP_DIR"/releases/* | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf

log "deployed $REF"
