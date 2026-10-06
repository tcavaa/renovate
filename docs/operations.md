# Operations: environment, deploys, storage, mail, logs, errors

Everything the app needs to run unattended: environment validation, logs, error tracking
(Sentry), health, migrations in deploys, the two deploy targets (cPanel, which is production,
and a VPS), uploads storage, mail, and CI. Read this before touching `lib/env.ts`, `lib/log.ts`,
`lib/sentry.ts`, the `instrumentation*.ts` and `sentry.*.config.ts` files, `lib/storage/`,
`lib/email.ts`, `next.config.mjs`, `deploy/`, `.github/workflows/`, `server.cjs` or
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
| `lib/log.ts` | structured JSON logging to stdout/stderr and a daily file; `setLogSink` hands every line to Sentry |
| `lib/sentry.ts` | Sentry's options, shared by the browser and the server: DSN, environment, sample rates |
| `instrumentation.ts`, `sentry.server.config.ts` | Sentry on the Node server: `onRequestError`, the log forwarded |
| `instrumentation-client.ts` | Sentry in the browser, Replay on error |
| `app/global-error.tsx`, `app/(main)/error.tsx` | the error boundaries, which send what they catch to Sentry |
| `lib/api/route.ts` → `handle()` | logs every request (route, status, duration) and every unhandled exception |
| `lib/api/rateLimit.ts` | per-IP sliding-window limits (`RATE_RULES`), in memory |
| `app/api/health/route.ts` | `GET /api/health` |
| `lib/storage/index.ts`, `local.ts`, `s3.ts` | uploads: `STORAGE_DRIVER=local|s3` |
| `lib/uploads/sniff.ts`, `glb.ts` | uploads identified by their bytes, never the declared type |
| `lib/uploads/glbOptimize.ts`, `glbOptimizeServer.ts`, `glbOptimizeBrowser.ts` | uploaded GLBs optimized — in the uploader's browser, then in the route with sharp ([3d-assets.md](3d-assets.md#uploads-are-optimized)) |
| `lib/email.ts` | `MAIL_DRIVER=log|smtp` |
| `next.config.mjs` | security headers and the CSP (Flitt's checkout, wallets and 3-D Secure admitted — [payments.md](payments.md#configuration)), `output: 'standalone'`, `NEXT_DIST_DIR`, image patterns, `withSentryConfig` (the `/monitoring` tunnel, source maps) |
| `lib/payments/flittApi.ts` | card payments: `FLITT_MERCHANT_ID` / `FLITT_SECRET_KEY` / `FLITT_TEST_MODE` ([payments.md](payments.md)) |
| `scripts/migrate.ts`, `deploy/migrate.cjs` | migrations (tsx locally, plain node in the cPanel release) |
| `deploy/deploy.sh`, `rollback.sh`, `nginx.conf`, `ecosystem.config.cjs` | the VPS: release deploy with health check and rollback, Nginx, PM2 |
| `deploy/cpanel.sh`, `.cpanel.yml`, `server.cjs`, `deploy/lib/env.cjs` | cPanel / Passenger |
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
  `logs/pm2-*.log`; `tail -f logs/app-*.log` is the tool on the box. With Sentry on, every line
  is also in Sentry and every `error` line is an issue there ([below](#errors-go-to-sentry)).
- **Health** is `GET /api/health`: 200 with `{ status, checks.db, uptimeSec, version }`, 503
  when MySQL does not answer within 3 s (`status: 'degraded'`). Unauthenticated and
  unthrottled — `deploy/deploy.sh`, `deploy/rollback.sh`, Playwright's web server and any uptime
  monitor call it.
- **Migrations** live in `lib/db/migrations` (`drizzle-kit generate` after a schema change;
  never edit a generated file). `pnpm db:migrate` applies them and is what
  `deploy/deploy.sh` runs. A database created with `db:push` before migrations existed needs
  `pnpm db:migrate:baseline` exactly once. `db:push` is for local experiments only. A data
  change every environment needs (a row, a backfill) is a custom migration
  (`pnpm db:generate --custom --name=…`, SQL written by hand, idempotent — `0015` creates the
  building-materials store and points `platform_settings` at it), so deploys get it with the
  schema.
- **The database clock is UTC.** Every pooled connection runs `SET time_zone = '+00:00'`
  (`lib/db/index.ts`), so timestamps MySQL fills in and those the app writes agree whatever the
  server's own zone ([data-model.md](data-model.md#rules-for-working-with-the-data)). A running
  `pnpm dev` keeps its pool across edits — restart it after changing `lib/db/index.ts`.
- **A database across the internet** takes `DATABASE_SSL=true` when the server offers TLS (hosted
  ones refuse plain connections) and `DATABASE_SSL_CA` for a provider's own CA; `lib/db`,
  `scripts/migrate.ts` and `drizzle.config.ts` all honour them.
- **cPanel / Passenger** (shared hosting, no login shell): the app runs under cPanel's "Setup
  Node.js App" (Node 22, mode Production, application root `renovate`, startup file
  `server.cjs`, which loads `~/renovate/.env` through `deploy/lib/env.cjs` and hands off to
  the standalone server). The repo is cloned with Git Version Control into `~/renovate` —
  never into a document root — with the **`cpanel` branch checked out**, and "Deploy HEAD
  Commit" runs `.cpanel.yml` → `deploy/cpanel.sh`. **The host cannot build**: its per-account
  memory cap kills `pnpm install` (a worker pool of V8 instances) and `next build`, so the
  `cPanel build` GitHub Actions workflow builds on Linux after CI passes on `main` and
  publishes `main`'s tree plus `.next/standalone` (marker `.next/standalone/.prebuilt`) as
  one new commit on `cpanel`, every time — pulls always fast-forward. **The repository is
  public**, so the workflow builds only CI runs started by a *push* to this repository's
  `main` (a fork's pull request also completes CI, and `branches: [main]` alone matches a
  fork's branch named main), keeps the token out of `.git/config` until the publish step,
  and pins every action (here, in `ci.yml` and `deploy.yml`) to a commit SHA; `ci.yml` runs
  with a read-only token. The script sees the
  marker and runs in **release mode**: copy `public/`, link uploads (the repo's seed images
  copied over the shared folder, so a re-rendered product photo replaces the old one; uploads
  made through the app carry a timestamp prefix and are never touched), `node
  deploy/migrate.cjs` (drizzle's migrator re-done in plain node with the standalone's own
  `mysql2`, which `serverExternalPackages` keeps out of the server chunks for exactly this; one
  transaction per migration, and the host's database is MariaDB, so every migration has to run
  there as well as on MySQL — [data-model.md](data-model.md#migrations-run-on-mysql-and-mariadb)),
  `node .next/standalone/seed-models.cjs` — `scripts/seed-models.ts` bundled by the workflow
  with esbuild (`pnpm deploy:bundle-seed`, drizzle, mysql2 and dotenv inside), so **the
  catalogue follows the model manifests on every deploy**: new models become products, models
  taken out of the manifests are removed, prices in the manifests win over admin edits of
  those rows — then `node .next/standalone/optimize-models.cjs --dir <uploads>/models`
  (`pnpm deploy:bundle-optimize`, with `sharp` and `draco3d` left to the standalone's
  `node_modules`), which gives the models uploaded before the upload recipe its WebP and Draco
  in place and only reads once they have it ([3d-assets.md](3d-assets.md#uploads-are-optimized)),
  and touch `tmp/restart.txt`. Without the marker it installs and builds itself with
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
  S3-compatible bucket (R2, MinIO) served from `S3_PUBLIC_URL` (which `next.config.mjs` adds to
  the CSP's `connect-src`, for the models, and to `images.remotePatterns`). Every upload is identified
  by its bytes (`lib/uploads/sniff.ts`), never by the declared type. A GLB is stored
  optimized (`lib/uploads/glbOptimizeServer.ts`): the routes run the recipe in process with
  sharp — about 0.4 s and a few hundred MB for a typical upload, 0.8 s and ~500 MB for a
  21 MB scan (Apple M4) — which matters on a memory-capped host; a file the browser already
  optimized costs only the read.
  `pnpm uploads:cleanup` (nightly cron) deletes plans no project references.
- **Mail** goes through `lib/email.ts` (`MAIL_DRIVER=log|smtp`). With `log`, the reset and
  verification links are written to the app log — that is how to find them in development.
- **Card payments** go through Flitt ([payments.md](payments.md)): unset, `FLITT_MERCHANT_ID` /
  `FLITT_SECRET_KEY` are Flitt's public test merchant (the sandbox — nothing is charged); a real
  merchant sets both and, once Flitt has switched it live, `FLITT_TEST_MODE=false`. Flitt posts
  each result to `NEXT_PUBLIC_APP_URL/api/payments/flitt/callback` from 54.154.216.60 and
  3.75.125.89 (allow them through a firewall; no callback is sent to a localhost URL). Locally,
  open the app at `http://renovate.localhost:3000` — Flitt refuses its form to `localhost`.
- **Auth**: lockout, reset and verification tokens, social logins —
  [auth-and-roles.md](auth-and-roles.md).
- **Tests and CI**: [testing.md](testing.md).

## Errors go to Sentry

Sentry (organisation `project-renovation`, project `javascript-nextjs`, `@sentry/nextjs` 11) is
**off unless `NEXT_PUBLIC_SENTRY_DSN` is set**, like every other key: `lib/sentry.ts` starts the
SDK disabled and every capture is a no-op. `lib/env.ts` validates the DSN as a URL.

- **What reaches it.** In the browser (`instrumentation-client.ts`): uncaught errors and
  rejections, what the two error boundaries catch (`app/(main)/error.tsx` — a boundary keeps the
  error from the browser's handler, so it sends it itself — and `app/global-error.tsx`, an
  error in the root layout, rendered as Next's own error page because no dictionary is left),
  navigation traces, and a Replay of the minute before an error (everything masked; the 3D
  canvas and Flitt's iframe are never recorded). On the server: `onRequestError` in
  `instrumentation.ts` sends what a page, layout, server action or the proxy did not catch. API
  routes catch their own exceptions in `handle()` and only log them, so **the server's log is
  forwarded whole**: `sentry.server.config.ts` sets `lib/log.ts`'s sink, every line goes to
  Sentry's Logs with its context as attributes, and every `error` line is an issue too — its
  `Error` as the exception (grouped by stack, tagged with the route `handle()` names), or the
  message when the line carries no error (a Flitt answer that does not match its payment, a
  notification that failed).
- **The sink sits on `globalThis`**, not in a module variable: `instrumentation.ts` and the
  routes are separate server bundles that may each carry their own copy of `lib/log.ts`. And
  `lib/log.ts` does not import Sentry itself, because esbuild bundles it into the cPanel
  deploy's plain-node `optimize-models.cjs`.
- **Environment and sampling.** `environment` is `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, else
  `NODE_ENV` (`development` locally, `production` on cPanel and the VPS). Errors are never sampled; traces are, at 1 in 5 in production (a studio visit is
  about a hundred spans, one per model and texture) and all of them elsewhere. Unit tests
  (`NODE_ENV=test`) never send. `sendDefaultPii` is off: no IPs, cookies or bodies.
- **The CSP needs nothing.** The browser sends to `/monitoring` on the app's own origin
  (`tunnelRoute`), which Next rewrites to Sentry's ingest host — ad blockers let it through too.
  The path is fixed, not random per build, so `proxy.ts`'s matcher keeps missing it. A DSN that
  is not a `*.ingest.sentry.io` one (a self-hosted Sentry, a local fake) skips the tunnel, and
  the CSP then blocks the browser's events.
- **The DSN is baked in at build time** (`NEXT_PUBLIC_`), so it is set where `pnpm build` runs:
  the repository variable `NEXT_PUBLIC_SENTRY_DSN` for the cPanel build
  (`.github/workflows/cpanel.yml`) and the VPS's `.env.local` (the build there reads it). On
  cPanel, `~/renovate/.env` is read only when the server starts: a DSN there alone reaches the
  server's half (the build left `process.env.NEXT_PUBLIC_SENTRY_DSN` to be read at run time)
  but never the browser's.
- **Source maps.** With `SENTRY_AUTH_TOKEN` at build time (an organisation token; the
  repository secret of the same name for the cPanel build, the VPS's `.env.local`), the build uploads the browser source maps to Sentry and deletes them from the
  output, so stack traces read as source and no `.map` is served. Without it the build makes
  no browser source maps at all. The cPanel build names the release after the commit it built
  (`SENTRY_RELEASE`); elsewhere the SDK finds the commit itself.
- **Server request sessions are off** (`httpIntegration({ sessions: false })` in
  `sentry.server.config.ts`, beside the `disableIncomingRequestSpans` the Next SDK sets
  itself). Each `/monitoring` call is a response Next's proxy pipes the ingest's answer into,
  and with the session's `close` listener it carried eleven: Node printed a
  `MaxListenersExceededWarning` (a false "possible leak" — the listeners die with the response)
  for every event the browser sent. The tunnel's calls were also counted as sessions.
- **`Experiments: clientTraceMetadata`** in `pnpm dev`'s banner is Sentry's: it puts the trace
  ids in the page's `<meta>` tags so the browser's trace continues the server's.
- **`withSentryConfig` comes from `@sentry/nextjs/config`** since SDK v11 — the package root
  no longer exports it, and `next.config.mjs` importing it from there fails to load (a running
  `pnpm dev` dies at the restart it does on a config change).
- **Checking it.** Set the DSN in `.env.local`, restart `pnpm dev`, and an error on any page
  shows up under Issues within seconds, environment `development`. Without a DSN to hand, a
  fake one checks the server half: point `NEXT_PUBLIC_SENTRY_DSN` at
  `http://public@localhost:9999/1`, run a listener on 9999 that records the posted envelopes,
  and each `log.error` arrives there as an `event` and each line as a `log` item.

## Known gaps

- **Sentry**: the privacy policy (`/privacy`, section 4, "Who we share it with") does not name
  Sentry, which now receives technical data, masked replays and the ids in log lines (user,
  order, project). Server events carry no user (`Sentry.setUser` is never called), so an issue
  says which route failed but not for whom. React's dev server fails to rebuild a mysql2
  `AggregateError` (the database refusing a connection) when rendering a page and reports
  `TypeError: object null is not iterable` as well — a development-only extra issue.

- **Production on the cPanel host is slow to deliver files, about 1 MB/s per download**
  (measured from Tbilisi: 0.9–1.0 MB/s for a single file, about 1.45 MB/s for six at once,
  against 2.2 MB/s from a CDN on the same line). Files the Node app serves (`/models`,
  `/_next/static`) and files Apache serves from the document root (`/uploads`) are equally
  slow, so the limit is the host's bandwidth, not Passenger. HTML and API answers are fine
  (0.1–0.2 s of server time), and the host does not compress GLBs. A first visit to a furnished
  studio downloaded about 8.5 MB (≈ 6.6 MB of models, ≈ 1.9 MB of textures) and took
  **13–16 s** to finish drawing there, against 0.8 s locally; a repeat visit is about 1.2 s,
  because `/models` is cached for 7 days and `/_next/static` for a year. The models are now
  WebP and Draco ([3d-assets.md](3d-assets.md#compression-webp-and-draco)) and the finish
  textures WebP ([3d-assets.md](3d-assets.md#finish-textures-are-webp)). Measured there after
  the deploy (1 Oct 2026, the sample plan furnished with 55 items — more than the 41 above): a
  first visit's 3D files are 96 downloads and 6.35 MB (59 models 3.6 MB, 35 finish textures
  2.5 MB, the Draco decoder 0.25 MB), where the old files would have been about 24 MB (7.7 MB of
  models, 16.1 MB of finish-texture JPEGs); all of them at once came in 3.7–10 s, the host
  swinging between 0.6 and 1.7 MB/s within minutes (a single file still about 1.0 MB/s). A
  repeat visit has the whole scene drawn 2.2 s after the navigation, the models out of the cache
  at 1.4 s. What is left is the host's bandwidth: a CDN in front of the domain, or a faster
  host.

- Only the plan exports as a PDF (`lib/design/planPdfExport.ts`); there is no PDF of the budget
  sheet. No SMS.
- `lib/log.ts` reads `LOG_FILE`, `LOG_STDOUT` and `LOG_LEVEL` straight from `process.env`
  (not through `env`), and a few other places do too (`lib/design/aiPlan.ts` for
  `ANTHROPIC_API_KEY`, the health route for `APP_VERSION`, `lib/auth/social.ts`,
  `app/layout.tsx`, and `lib/sentry.ts`, which the browser runs too).
