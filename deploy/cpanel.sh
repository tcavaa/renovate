#!/usr/bin/env bash
#
# Build and (re)start the app on cPanel shared hosting with "Setup Node.js App" (Passenger).
#
# Run by cPanel itself: Git Version Control → Manage → Pull or Deploy → "Deploy HEAD Commit"
# executes .cpanel.yml, which calls this script. No login shell is needed. It can also be run
# by hand from a terminal:
#
#   source ~/nodevenv/renovate/20/bin/activate   # the line cPanel shows at the top of the Node.js app
#   cd ~/renovate && bash deploy/cpanel.sh
#
# What it does: finds the Node.js app's environment, installs dependencies, builds the
# standalone server, puts public/ and .next/static beside it, keeps uploads in a folder that
# survives rebuilds (next build wipes .next) and hands that folder to Apache, applies pending
# migrations and asks Passenger to restart. It never touches a tracked file: cPanel refuses to
# deploy over a checkout with uncommitted changes, so everything it writes is git-ignored.
#
# Settings (environment variables, all optional):
#   DOCROOT         the subdomain's document root; found from the .htaccess cPanel wrote for
#                   this app when unset
#   SHARED_UPLOADS  where uploaded files live; default <document root>/uploads, or
#                   $HOME/renovate-uploads when there is no document root
#   NEXT_DIST_DIR   the build directory, default .next
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${NEXT_DIST_DIR:-.next}"
cd "$APP_ROOT"

# Without a login shell (cPanel deployment tasks, or a terminal that was not activated) node
# is not on PATH: use the Node.js app's own environment, whatever version was picked.
if ! command -v node >/dev/null 2>&1; then
  for activate in "$HOME"/nodevenv/"$(basename "$APP_ROOT")"/*/bin/activate "$HOME"/nodevenv/*/*/bin/activate; do
    if [ -f "$activate" ]; then
      # shellcheck disable=SC1090
      source "$activate"
      break
    fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node is not on PATH and no ~/nodevenv/*/bin/activate was found — create the Node.js app in cPanel first" >&2
  exit 1
fi
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 20 || (major === 20 && minor < 9)) { console.error("Node " + process.versions.node + " is too old: Next 16 needs 20.9+"); process.exit(1); }'

# The build inlines NEXT_PUBLIC_* and validates the server variables (lib/env.ts), so the
# environment file has to exist before it runs. The Node.js app's own settings are not
# visible here — cPanel runs deployment tasks outside Passenger.
if [ ! -f .env ] && [ ! -f .env.production ] && [ ! -f .env.local ]; then
  cat >&2 <<MSG
No .env file. Create $APP_ROOT/.env (File Manager → the repository folder → + File) with at
least these lines, then deploy again:

  DATABASE_HOST=localhost
  DATABASE_PORT=3306
  DATABASE_USER=<cpanel database user>
  DATABASE_PASSWORD=<its password>
  DATABASE_NAME=<cpanel database name>
  AUTH_SECRET=<32 or more random characters>
  AUTH_URL=https://<your subdomain>
  AUTH_TRUST_HOST=true
  NEXT_PUBLIC_APP_URL=https://<your subdomain>
  LOG_DIR=$APP_ROOT/logs
MSG
  exit 1
fi

# pnpm goes into the Node.js app's own global folder (that is where npm -g points inside a
# nodevenv); when even that is refused, npx runs the pinned version without installing it.
PNPM=pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  if npm install -g pnpm@9.15.0 >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
    :
  else
    PNPM="npx --yes pnpm@9.15.0"
  fi
fi

echo "==> install"
# pnpm skips devDependencies when NODE_ENV=production, and the build needs them (typescript,
# tailwind, tsx for the migrations). Passenger's environment may well set it; override here.
NODE_ENV=development $PNPM install --frozen-lockfile

echo "==> build"
NODE_ENV=production $PNPM build

echo "==> assemble the standalone server"
STANDALONE="$DIST/standalone"
mkdir -p "$STANDALONE/$DIST"
rm -rf "$STANDALONE/$DIST/static" "$STANDALONE/public"
cp -r "$DIST/static" "$STANDALONE/$DIST/static"
cp -r public "$STANDALONE/public"

# Uploads live outside the build output (`next build` empties .next) and, when the document
# root is known, inside it: Apache serves a file that exists in the document root before
# Passenger ever sees the request, while in production Next serves only the public files that
# existed when it started — a photo uploaded through admin would otherwise 404 until the next
# restart. The standalone server writes new uploads into the same folder through a link.
if [ -n "${DOCROOT:-}" ] && [ ! -d "$DOCROOT" ]; then
  echo "note: DOCROOT=$DOCROOT is not a directory; looking for the document root instead" >&2
  DOCROOT=""
fi
if [ -z "${DOCROOT:-}" ]; then
  for htaccess in "$HOME"/*/.htaccess; do
    [ -f "$htaccess" ] || continue
    if grep -Eq "PassengerAppRoot \"?($APP_ROOT|$HOME/$(basename "$APP_ROOT"))/?\"?" "$htaccess"; then
      DOCROOT="$(dirname "$htaccess")"
      break
    fi
  done
fi
if [ -n "${DOCROOT:-}" ]; then
  if [ -z "${SHARED_UPLOADS:-}" ]; then
    SHARED_UPLOADS="$DOCROOT/uploads"
  elif [ ! -e "$DOCROOT/uploads" ] || [ -L "$DOCROOT/uploads" ]; then
    ln -sfn "$SHARED_UPLOADS" "$DOCROOT/uploads"
  else
    echo "note: $DOCROOT/uploads exists and is not a link; Apache serves it, the app writes to $SHARED_UPLOADS" >&2
  fi
  echo "uploads: $SHARED_UPLOADS, served by Apache from $DOCROOT/uploads"
else
  SHARED_UPLOADS="${SHARED_UPLOADS:-$HOME/renovate-uploads}"
  echo "note: no document root found (set DOCROOT); a file uploaded after a restart is served only after the next restart" >&2
fi
mkdir -p "$SHARED_UPLOADS"
# The repo's seed images, never overwriting a file that is already there.
cp -rn public/uploads/. "$SHARED_UPLOADS"/ 2>/dev/null || true
rm -rf "$STANDALONE/public/uploads"
ln -sfn "$SHARED_UPLOADS" "$STANDALONE/public/uploads"
# The caching policy next.config.mjs gives /uploads, for the files Apache serves instead.
cat > "$SHARED_UPLOADS/.htaccess" <<'HT'
<IfModule mod_headers.c>
  Header set Cache-Control "public, max-age=31536000, immutable"
</IfModule>
HT

echo "==> migrate"
# scripts/migrate.ts reads .env.local then .env from the repository root.
NODE_ENV=production $PNPM db:migrate

echo "==> restart (Passenger)"
mkdir -p tmp && touch tmp/restart.txt
echo "done — open the site; the first request after a restart takes a few seconds"
