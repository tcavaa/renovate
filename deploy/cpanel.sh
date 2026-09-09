#!/usr/bin/env bash
#
# Build and (re)start the app on cPanel shared hosting with "Setup Node.js App" (Passenger).
#
#   source ~/nodevenv/renovate/20/bin/activate   # the line cPanel shows at the top of the Node.js app
#   cd ~/renovate && bash deploy/cpanel.sh
#
# Run it after every "Update from Remote" in Git Version Control. It installs dependencies,
# builds the standalone server, puts public/ and .next/static beside it, keeps uploads in a
# folder that survives rebuilds (next build wipes .next), applies pending migrations and
# asks Passenger to restart. There is no PM2 or Nginx here; Passenger owns the process.
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHARED_UPLOADS="${SHARED_UPLOADS:-$HOME/renovate-uploads}"
cd "$APP_ROOT"

if ! command -v node >/dev/null; then
  echo "node is not on PATH — run the 'source .../nodevenv/.../activate' line cPanel shows first" >&2
  exit 1
fi
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 20 || (major === 20 && minor < 9)) { console.error("Node " + process.versions.node + " is too old: Next 16 needs 20.9+"); process.exit(1); }'

if ! command -v pnpm >/dev/null; then
  npm install -g pnpm@9.15.0
fi

echo "==> install"
pnpm install --frozen-lockfile

# Uploads live outside the build output: `next build` empties .next, and the app writes new
# uploads under its own public/uploads. First run moves the repo's seed images across.
mkdir -p "$SHARED_UPLOADS"
if [ -d public/uploads ] && [ ! -L public/uploads ]; then
  cp -rn public/uploads/. "$SHARED_UPLOADS"/
  rm -rf public/uploads
fi
ln -sfn "$SHARED_UPLOADS" public/uploads

echo "==> build"
pnpm build

echo "==> assemble the standalone server"
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
rm -rf .next/standalone/public
cp -r public .next/standalone/public

echo "==> migrate"
pnpm db:migrate

echo "==> restart (Passenger)"
mkdir -p tmp && touch tmp/restart.txt
echo "done — open the site; the first request after a restart takes a few seconds"
