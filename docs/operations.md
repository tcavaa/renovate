# Operations: environment, deploys, storage, mail, logs

Everything the app needs to run unattended: environment validation, logs, health, migrations
in deploys, the three deploy targets (VPS, cPanel, Vercel), uploads storage, mail, and CI.
Read this before touching `lib/env.ts`, `lib/log.ts`, `lib/storage/`, `lib/email.ts`,
`next.config.mjs`, `deploy/`, `.github/workflows/`, `vercel.json`, `server.cjs` or
`.cpanel.yml`.

Related: [testing.md](testing.md) (what CI runs) · [data-model.md](data-model.md) (migrations)
· [auth-and-roles.md](auth-and-roles.md) (lockout, tokens, rate limits) ·
[3d-assets.md](3d-assets.md) (`models:seed`, which the cPanel deploy runs).

## Key files

| File | Responsibility |
|---|---|
| `lib/env.ts` | server environment validated with Zod at startup |
| `scripts/lib/loadEnv.ts` | loads `.env.local` / `.env` for `tsx` scripts — must be the script's first import |
| `.env.example` | every variable the app reads (names and comments; never commit real values) |
| `lib/log.ts` | structured JSON logging to stdout/stderr and a daily file |
| `lib/api/route.ts` → `handle()` | logs every request (route, status, duration) and every unhandled exception |
| `lib/api/rateLimit.ts` | per-IP sliding-window limits (`RATE_RULES`), in memory |
| `app/api/health/route.ts` | `GET /api/health` |
| `lib/storage/index.ts`, `local.ts`, `s3.ts` | uploads: `STORAGE_DRIVER=local|s3` |
| `lib/uploads/sniff.ts`, `glb.ts` | uploads identified by their bytes, never the declared type |
| `lib/email.ts` | `MAIL_DRIVER=log|smtp` |
| `next.config.mjs` | security headers and the CSP, `output: 'standalone'` (off on Vercel), `NEXT_DIST_DIR`, image patterns |
| `scripts/migrate.ts`, `deploy/migrate.cjs` | migrations (tsx locally, plain node in the cPanel release) |
| `deploy/deploy.sh`, `rollback.sh`, `nginx.conf`, `ecosystem.config.cjs` | the VPS: release deploy with health check and rollback, Nginx, PM2 |
| `deploy/cpanel.sh`, `.cpanel.yml`, `server.cjs`, `deploy/lib/env.cjs` | cPanel / Passenger |
| `vercel.json` | Vercel: region `fra1`, the `cpanel` branch not deployed |
| `.github/workflows/ci.yml`, `cpanel.yml`, `deploy.yml` | CI checks; the cPanel build; the VPS deploy on `v*` tags |
| `scripts/cleanup-plans.ts` | `pnpm uploads:cleanup` — plan uploads no project references |

## The pieces

Everything the app needs to run unattended, and where each piece lives.

- **Environment** is validated once at startup by `lib/env.ts` (Zod). A missing or malformed
  variable stops the process with the variable named; production insists on a real
  `AUTH_SECRET` and `DATABASE_PASSWORD`. Server code imports `env` rather than reading
`process.env` (the few exceptions are listed under Known gaps).
  Scripts run with `tsx` load `.env.local` / `.env` through `import './lib/loadEnv';` as their
  **first import** — imports are hoisted, so a `config()` call after them ran after `lib/env.ts`
  had already validated an empty environment (masked in development by the defaults).
- **Logs** are JSON lines from `lib/log.ts` to stdout (warnings and errors to stderr) and to
  `logs/app-YYYY-MM-DD.log` (`LOG_DIR`, git-ignored; `LOG_FILE=false` / `LOG_STDOUT=false` turn
  either off, `LOG_LEVEL` sets the threshold). `handle()` in `lib/api/route.ts` logs every request with route,
  status and duration, and every unhandled exception with its stack. PM2 captures stdout into
  `logs/pm2-*.log`. There is no error tracker yet; `tail -f logs/app-*.log` is the tool.
- **Health** is `GET /api/health`: 200 with `{ status, checks.db, uptimeSec, version }`, 503
  when MySQL does not answer within 3 s (`status: 'degraded'`). Unauthenticated and
  unthrottled — `deploy/deploy.sh`, `deploy/rollback.sh`, Playwright's web server and any uptime
  monitor call it.
- **Migrations** live in `lib/db/migrations` (`drizzle-kit generate` after a schema change;
  never edit a generated file). `pnpm db:migrate` applies them and is what
  `deploy/deploy.sh` runs. A database created with `db:push` before migrations existed needs
  `pnpm db:migrate:baseline` exactly once. `db:push` is for local experiments only.
- **cPanel / Passenger** (shared hosting, no login shell): the app runs under cPanel's "Setup
  Node.js App" (Node 22, mode Production, application root `renovate`, startup file
  `server.cjs`, which loads `~/renovate/.env` through `deploy/lib/env.cjs` and hands off to
  the standalone server). The repo is cloned with Git Version Control into `~/renovate` —
  never into a document root — with the **`cpanel` branch checked out**, and "Deploy HEAD
  Commit" runs `.cpanel.yml` → `deploy/cpanel.sh`. **The host cannot build**: its per-account
  memory cap kills `pnpm install` (a worker pool of V8 instances) and `next build`, so the
  `cPanel build` GitHub Actions workflow builds on Linux after CI passes on `main` and
  publishes `main`'s tree plus `.next/standalone` (marker `.next/standalone/.prebuilt`) as
  one new commit on `cpanel`, every time — pulls always fast-forward. The script sees the
  marker and runs in **release mode**: copy `public/`, link uploads (the repo's seed images
  copied over the shared folder, so a re-rendered product photo replaces the old one; uploads
  made through the app carry a timestamp prefix and are never touched), `node
  deploy/migrate.cjs` (drizzle's migrator re-done in plain node with the standalone's own
  `mysql2`, which `serverExternalPackages` keeps out of the server chunks for exactly this),
  `node .next/standalone/seed-models.cjs` — `scripts/seed-models.ts` bundled by the workflow
  with esbuild (`pnpm deploy:bundle-seed`, drizzle, mysql2 and dotenv inside), so **the
  catalogue follows the model manifests on every deploy**: new models become products, models
  taken out of the manifests are removed, prices in the manifests win over admin edits of
  those rows — touch `tmp/restart.txt`. Without the marker it installs and builds itself with
  `RENOVATE_LOW_MEMORY=1` (one worker, no in-build type check) — for a host with memory.
  `~/renovate/.env` holds the server variables (`AUTH_URL`, `AUTH_TRUST_HOST=true`, `LOG_DIR`
  included; the Node.js app's own settings are invisible to deployment tasks). Uploads live
  in the subdomain's **document root** (`<docroot>/uploads`, found from cPanel's `.htaccess`
  or `DOCROOT`) and the standalone server writes there through a symlink: in production Next
  serves only the public files that existed at start-up, while Apache serves anything in the
  document root before Passenger sees the request. Nothing the script writes is tracked —
  cPanel refuses to deploy over a checkout with uncommitted changes. **A failed deploy is
  silent** ("Last Deployment Information" stays "Not available"): read
  `~/renovate/logs/deploy.log` (the script's own; a failure trap names the command) or
  cPanel's copy in `~/.cpanel/logs`; Passenger's log is `~/renovate/logs/main.logs`. Two
  things bit there already: the nodevenv `activate` file needs `set +eu` (it reads variables
  a background task lacks), and `exec > >(tee …)` needs `/dev/fd`, which CageFS has not.
- **Vercel** (September 2026, replacing cPanel): the Git integration builds `main` with the
  ordinary `pnpm build`; nothing under `deploy/`, `server.cjs` or `.cpanel.yml` is involved.
  `vercel.json` pins the functions to Frankfurt (`fra1`, next to the Hetzner box that holds
  MySQL and the uploads) and disables deployments of the `cpanel` branch, which the cPanel
  workflow keeps publishing.
  `next.config.mjs` switches `output: 'standalone'` off when Vercel's own `VERCEL=1` is set —
  Vercel traces and packages the server itself, and on Next 16.3.x standalone is fatal there
  (its build adapter makes Turbopack skip `.next/next-server.js.nft.json`, which the
  standalone finaliser then fails to open; vercel/next.js#97287 fixes it for 16.4). The
  function filesystem is read-only, so uploads cannot live on it: `STORAGE_DRIVER=s3` (R2
  or S3; `S3_PUBLIC_URL` feeds both the CSP's `connect-src` and `images.remotePatterns`)
  works today, and the plan for this deployment is a driver that writes to the cPanel box
  over Web Disk (WebDAV, port 2078) and serves from a subdomain of it — not built yet.
  `LOG_FILE=false` (`lib/log.ts` also gives up on the file after the first EROFS). MySQL is
  reached over the internet — the cPanel box's own (Hetzner Falkenstein, a few ms from
  `fra1`) once its provider opens port 3306, or a hosted one — with `DATABASE_SSL=true`
  when the server offers TLS and `DATABASE_SSL_CA` for a provider's own CA (`lib/db`,
  `scripts/migrate.ts` and `drizzle.config.ts` all honour it). Migrations run from a laptop
  against that database (`pnpm db:migrate` with the production variables), not in the
  build, so a preview branch never migrates production. Every request to a
  Vercel function is capped at 4.5 MB, which `/api/upload/model` and `/api/design/models`
  (40 MB GLBs), `/api/design/upload-plan` (12 MB), `/api/upload` and the photo and render routes
  (8 MB) exceed — see the roadmap. The in-memory rate limiter and login lockout are per instance there.
- **Deploy** is `deploy/deploy.sh <tag>`: clone → install → migrate → build → switch the
  `current` symlink → `pm2 startOrReload` → health check, with automatic rollback to the
  previous release on a failed check. `deploy/rollback.sh` does the switch by hand. The
  GitHub Actions `Deploy` workflow (`.github/workflows/deploy.yml`) runs it over SSH for every
  `v*` tag, after its `verify` job has re-run the CI checks on the tag — it calls `ci.yml`,
  which is why `ci.yml` declares `on: workflow_call` (`actionlint` refuses the call without
  it). No tag has been deployed this way yet;
  `ecosystem.config.cjs` is the PM2 definition and `deploy/nginx.conf` the site config.
- **Uploads** go through `lib/storage` (`STORAGE_DRIVER=local|s3`). Keys look like
  `plans/<file>`; the local driver writes under `public/uploads`, the S3 driver to any
  S3-compatible bucket (R2, MinIO) served from `S3_PUBLIC_URL`. Every upload is identified
  by its bytes (`lib/uploads/sniff.ts`), never by the declared type.
  `pnpm uploads:cleanup` (nightly cron) deletes plans no project references.
- **Mail** goes through `lib/email.ts` (`MAIL_DRIVER=log|smtp`). With `log`, the reset and
  verification links are written to the app log — that is how to find them in development.
- **Auth**: lockout, reset and verification tokens, social logins —
  [auth-and-roles.md](auth-and-roles.md).
- **Tests and CI**: [testing.md](testing.md).

## Known gaps

- Uploads are local disk on the VPS and cPanel hosts, a bucket on Vercel (`STORAGE_DRIVER`).
  Only the plan exports as a PDF (`lib/design/planPdfExport.ts`); there is no PDF of the budget
  sheet. No SMS.
- On Vercel a request body is capped at 4.5 MB, so a GLB, a large plan image or a studio
  photo above that is refused with 413 before the route runs. The fix is a direct upload
  into the bucket (a presigned PUT handed out by `/api/upload/*`, the byte sniff and the
  record afterwards); not built.
- `lib/log.ts` reads `LOG_FILE`, `LOG_STDOUT` and `LOG_LEVEL` straight from `process.env`
  (not through `env`), and a few other places do too (`lib/design/aiPlan.ts` for
  `ANTHROPIC_API_KEY`, the health route for `APP_VERSION`, `lib/auth/social.ts`,
  `app/layout.tsx`).
