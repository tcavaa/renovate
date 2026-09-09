#!/usr/bin/env bash
#
# Point `current` at the previous release (or the one named) and reload PM2.
#
#   deploy/rollback.sh                 previous release
#   deploy/rollback.sh 20260906120000  a specific release directory name
#
# Database migrations are not reverted: every migration in this project is additive, and a
# release must stay compatible with the schema one step ahead of it. Check
# lib/db/migrations before rolling back across a schema change.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/renovate}"
CURRENT="$APP_DIR/current"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"

if [ -n "${1:-}" ]; then
  TARGET="$APP_DIR/releases/$1"
else
  NOW="$(readlink -f "$CURRENT")"
  TARGET="$(ls -1dt "$APP_DIR"/releases/* | grep -v "^$NOW$" | head -n 1)"
fi
[ -d "$TARGET" ] || { echo "no release to roll back to"; exit 1; }

echo "==> rolling back to $TARGET ($(cat "$TARGET/.release" 2>/dev/null || echo unknown))"
ln -sfn "$TARGET" "$CURRENT.tmp" && mv -Tf "$CURRENT.tmp" "$CURRENT"
cd "$CURRENT"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save >/dev/null

sleep 3
curl -fsS "$HEALTH_URL" && echo && echo "==> rolled back"
