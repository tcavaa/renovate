# Operations: hosting, environment, deploys, storage, mail, logs, errors

Everything the app needs to run unattended: where it runs (Vercel, with Supabase for the database
and the files), environment validation, logs, error tracking (Sentry), health, migrations in
deploys, uploads storage, the daily cron, mail
kept for a rollback. Read this before touching `lib/env.ts`, `lib/log.ts`, `lib/sentry.ts`, the
`instrumentation*.ts` and `sentry.*.config.ts` files, `lib/db/index.ts`, `lib/storage/`,
`lib/email.ts`, `next.config.mjs`, `vercel.json`, `scripts/vercel-build.mjs`, `deploy/` or
`.github/workflows/`.

Related: [uploads.md](uploads.md) (direct uploads to storage) · [testing.md](testing.md) (what CI
runs) · [data-model.md](data-model.md) (Postgres, migrations) · [auth-and-roles.md](auth-and-roles.md)
(lockout, tokens, rate limits) · [3d-assets.md](3d-assets.md) (`models:seed`, which production
deployments run).

> **Status (October 2026):** production runs on Vercel + Supabase (`renovatege.vercel.app`); the
> cPanel host and MySQL are retired and gone from the repository.

## Key files

| File | Responsibility |
|---|---|
| `lib/env.ts` | server environment validated with Zod at startup |
| `scripts/lib/loadEnv.ts` | loads `.env.local` / `.env` for `tsx` scripts — must be the script's first import |
| `.env.example` | every variable the app reads (names and comments; never commit real values) |
| `vercel.json` | the function region (`fra1`), the daily cron |
| `scripts/vercel-build.mjs` | what Vercel builds with (`vercel-build`): migrations and the catalogue sync on production deployments, then `next build` |
| `lib/db/index.ts`, `lib/db/ssl.ts`, `lib/db/supabaseCa.ts` | the Postgres pool (node-postgres, `attachDatabasePool`), TLS verified against Supabase's root |
| `lib/log.ts` | structured JSON logging to stdout/stderr (and a daily file off Vercel); `setLogSink` hands every line to Sentry |
| `lib/sentry.ts` | Sentry's options, shared by the browser and the server: DSN, environment, sample rates |
| `instrumentation.ts`, `sentry.server.config.ts` | Sentry on the Node server: `onRequestError`, the log forwarded |
| `instrumentation-client.ts` | Sentry in the browser, Replay on error |
| `app/global-error.tsx`, `app/(main)/error.tsx` | the error boundaries, which send what they catch to Sentry |
| `lib/api/route.ts` → `handle()` | logs every request (route, status, duration) and every unhandled exception; flushes Sentry after the response on Vercel |
| `lib/api/rateLimit.ts`, `lib/api/counterStore.ts` | per-IP sliding-window limits (`RATE_RULES`) in the shared `rate_limits` table |
| `lib/api/body.ts`, `lib/flow/jsonBody.ts` | gzipped JSON bodies and answers past Vercel's 4.5 MB ([below](#request-and-response-size)) |
| `lib/api/after.ts` | `afterResponse()`: work after the answer that Vercel waits for |
| `app/api/health/route.ts` | `GET /api/health` |
| `app/api/cron/cleanup/route.ts` | the daily sweep Vercel Cron calls |
| `lib/storage/index.ts`, `supabase.ts`, `local.ts` | uploads: `STORAGE_DRIVER=supabase|local` ([uploads.md](uploads.md)) |
| `lib/uploads/*` | direct uploads (`kinds`, `claim`, `direct`, `browserImage`), byte sniffing, the GLB and image recipes |
| `lib/email.ts` | `MAIL_DRIVER=log|smtp` |
| `next.config.mjs` | security headers and the CSP (Supabase's origin, Flitt — [payments.md](payments.md#configuration)), no image optimization, file tracing, `withSentryConfig` (the `/monitoring` tunnel, source maps) |
| `lib/payments/flittApi.ts` | card payments: `FLITT_MERCHANT_ID` / `FLITT_SECRET_KEY` / `FLITT_TEST_MODE` ([payments.md](payments.md)) |
| `scripts/migrate.ts` | `pnpm db:migrate` |
| `scripts/cleanup-plans.ts` | `pnpm uploads:cleanup` — what the cron's plan sweep does, by hand |
| `.github/workflows/ci.yml` | CI checks on `main` and pull requests |

## Where it runs

- **Vercel**, project `renovatege` of the team *Tsava* (Hobby plan), linked to
  `github.com/tcavaa/renovate`. Functions run in **Frankfurt (`fra1`)**, beside the database
  (`vercel.json` and the project setting), with Fluid compute: Node 22, 2 GB / 1 vCPU, at most
  **300 s** a request, **4.5 MB** a request or answer body. Static files (`public/`, `_next/static`)
  come from Vercel's CDN with the cache headers `next.config.mjs` sets. Pictures are served as
  stored — `images.unoptimized` — so Vercel's billed image optimization is never used.
- **Supabase**, project `renovatege` (ref `qmcdocpcrbjqgcopzcgd`, organisation *tcavaa*, free plan,
  `eu-central-1`): PostgreSQL 17 and Storage.
  - The app connects as its own role **`renovate_app`** (owner of the `public` schema's tables, no
    RLS bypass, `statement_timeout` 120 s) through Supavisor, `aws-1-eu-central-1.pooler.supabase.com`:
    port **6543** (transaction mode) for the app (`DATABASE_URL`), **5432** (session mode) for
    migrations and scripts (`DATABASE_MIGRATION_URL`). The direct host `db.<ref>.supabase.co` is
    IPv6-only — Vercel cannot reach it. The user name is `renovate_app.<ref>`.
  - Every table has row-level security on and no policy, and the API roles (`anon`,
    `authenticated`) have no grant: Supabase's Data API sees nothing. The app never uses it.
  - Storage: the public bucket **`uploads`** and the private **`uploads-staging`**, both 50 MB a
    file at most (the free plan's limit) — [uploads.md](uploads.md).
- **The plans are test-grade.** Vercel's Hobby plan is for non-commercial use, and Supabase's free
  plan pauses a project after a week without traffic, has 500 MB of database, 1 GB of files,
  5 GB of egress a month and no backups. For the public launch: Vercel Pro and Supabase Pro
  (daily backups, no pausing).

## Environment

Validated once at startup by `lib/env.ts` (Zod): a missing or malformed variable stops the
process with the variable named. Server code imports `env` rather than reading `process.env`
(exceptions under Known gaps). Scripts run with `tsx` load `.env.local` / `.env` through
`import './lib/loadEnv';` as their **first import** — imports are hoisted, so a `config()` call
after them ran after `lib/env.ts` had already validated an empty environment.

On Vercel the variables are the project's, set for **Production** only (previews are not
built during the test — [Deploying](#deploying)):

| Variable | Value on Vercel | Notes |
|---|---|---|
| `DATABASE_URL` | transaction pooler, 6543, `renovate_app` | sensitive |
| `DATABASE_MIGRATION_URL` | session pooler, 5432 | sensitive; `vercel-build` migrates through it |
| `DATABASE_SSL` / `DATABASE_SSL_CA` | `true` / `supabase` | TLS verified against the bundled Supabase Root 2021 CA |
| `STORAGE_DRIVER` | `supabase` | `local` is refused on Vercel (a read-only disk) |
| `SUPABASE_URL` | `https://qmcdocpcrbjqgcopzcgd.supabase.co` | also read at **build** time, for the CSP |
| `SUPABASE_SECRET_KEY` | the project's secret key (`sb_secret_…`) | sensitive; storage writes and signed upload URLs |
| `AUTH_SECRET` | 48 random bytes | sensitive |
| `CRON_SECRET` | 32 random bytes | sensitive; Vercel Cron sends it to `/api/cron/*` |
| `NEXT_PUBLIC_APP_URL` | `https://renovatege.vercel.app` | baked in at build: Flitt's callback, mail links |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_AUTH_TOKEN` | the Sentry project's; environment `vercel` | [below](#errors-go-to-sentry) |

Not set, on purpose: `AUTH_URL` (Auth.js trusts the host on Vercel and takes the origin from the
request; set it only to pin one domain), `MAIL_DRIVER` (`log` — [Mail](#mail)), `ANTHROPIC_API_KEY`
(the plan reader falls back to the CV parser), `GOOGLE_*` / `FACEBOOK_*` (their consoles need the
new redirect URI first), `FLITT_*` (Flitt's sandbox). `LOG_DIR`, `LOG_FILE`, `NEXT_DIST_DIR`,
`RENOVATE_LOW_MEMORY` belong to the self-hosted paths.

Locally `.env.local` points at a local Postgres (`DATABASE_URL=postgresql://localhost:5432/renovate_ge`,
`STORAGE_DRIVER=local`); `.env.example` lists everything.

## The pieces

- **Logs** are JSON lines from `lib/log.ts` to stdout (warnings and errors to stderr). On Vercel
  they are the deployment's **runtime logs** (dashboard → the project → Logs; one line per
  `log.*` call, `handle()` adds one per request with route, status and duration). Off Vercel
  they also go to `logs/app-YYYY-MM-DD.log` (`LOG_DIR`; `LOG_FILE=false` / `LOG_STDOUT=false`
  turn either off; `LOG_LEVEL` sets the threshold). With Sentry on, every line is in Sentry too
  ([below](#errors-go-to-sentry)).
- **Health** is `GET /api/health`: 200 with `{ status, checks.db, uptimeSec, version }`, 503 when
  the database does not answer within 3 s. `version` is the commit Vercel built; `uptimeSec` the
  age of the instance that answered. Unauthenticated and unthrottled — for an uptime monitor.
- **The database** is reached through one pool per function instance (`lib/db/index.ts`:
  node-postgres, 5 connections on Vercel, `attachDatabasePool` so idle ones are closed before
  Vercel suspends the instance). No statement is prepared by name, so the transaction pooler's
  sessions are no trouble. Every timestamp is a `timestamptz` and the server runs on UTC;
  `bigint` counts come back as numbers, `numeric` as strings ([data-model.md](data-model.md)).
- **Migrations** live in `lib/db/migrations` (`pnpm db:generate` after a schema change; never edit a
  generated file; a data change every database needs is a custom migration). A **production
  deployment applies them itself**: `scripts/vercel-build.mjs` (Vercel runs the `vercel-build`
  script instead of `build`) runs `pnpm db:migrate` through `DATABASE_MIGRATION_URL`, then
  `pnpm models:seed` — **the catalogue follows the model manifests on every deploy**, as it did — and only then `next build`. A failure stops the deployment and the previous one
  keeps serving; so a migration must be safe while the old code still runs
  ([data-model.md](data-model.md#migrations-on-postgres)). `SKIP_DB_MIGRATIONS=1` /
  `SKIP_MODELS_SEED=1` skip either. By hand: `DATABASE_MIGRATION_URL=… DATABASE_SSL=true
  DATABASE_SSL_CA=supabase pnpm db:migrate`.
- **Uploads** go to Supabase Storage directly from the browser and are published by the route
  they are for, after checking — [uploads.md](uploads.md). Run-time files are served from
  Supabase's CDN; the seed pictures in `public/uploads` ship with the app and are served by
  Vercel.
- **The daily cron** (`vercel.json`: `GET /api/cron/cleanup`, 03:00 UTC; Hobby allows one run a
  day, at any minute of the hour) sweeps direct uploads more than a day old (rows and staged
  files), rate-limit and lockout counters two days stale, and floor plans no project refers to
  after a day. Vercel sends `Authorization: Bearer $CRON_SECRET`; anyone else gets a 401. Run it
  by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://renovatege.vercel.app/api/cron/cleanup`.
- **Mail** goes through `lib/email.ts` (`MAIL_DRIVER=log|smtp`). With `log` the reset and
  verification links are written to the log — on Vercel, its runtime logs. `smtp` needs
  `SMTP_HOST`/`PORT`/`USER`/`PASSWORD` (port 587 or 465: Vercel lets nothing out on port 25);
  the transport gives up after 10 s connecting and 20 s idle. Mail that must not hold up an
  answer goes out after it (`afterResponse`), never fire-and-forget.
- **Card payments** go through Flitt ([payments.md](payments.md)): unset, `FLITT_MERCHANT_ID` /
  `FLITT_SECRET_KEY` are Flitt's public test merchant (the sandbox — nothing is charged). Flitt
  posts each result to `NEXT_PUBLIC_APP_URL/api/payments/flitt/callback` from 54.154.216.60 and
  3.75.125.89 — which is why the production domain must stay outside Vercel's deployment
  protection. Locally, open the app at `http://renovate.localhost:3000` (Flitt refuses its form
  to `localhost`).
- **Auth**: lockout, reset and verification tokens, social logins —
  [auth-and-roles.md](auth-and-roles.md). On Vercel Auth.js trusts the forwarded host; the
  session cookie is the domain's own, so a move to another domain signs everyone out.
- **Tests and CI**: [testing.md](testing.md).

## Deploying

The Vercel project builds from GitHub (the Vercel app has access to `tcavaa/renovate`); its
production branch is `main`. Each deployment runs `pnpm install` and `pnpm vercel-build` on
Vercel's Linux machines — never build on a Mac and upload: sharp's native binaries must be
Linux ones. An **Ignored Build Step** (Project → Settings → Git) builds production only — the
environment variables exist for production alone, so a preview would fail anyway:

```bash
if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi
```

A push to `main` deploys; a push to any other branch is skipped. A deployment by hand: the
dashboard (Deployments → Create Deployment), or the API / Vercel connector (`create_deployment`
with `gitSource: { type: 'github', org: 'tcavaa', repo: 'renovate', ref: 'main' }`,
`target: 'production'`). It is aliased to `renovatege.vercel.app` once ready. Roll back to an
earlier deployment from the dashboard (Instant Rollback) — a schema migration already applied
stays applied.

**Vercel Authentication** is on for every deployment URL (`renovatege-<hash>-tsava.vercel.app`)
but not for the production domain — keep it that way, or Flitt's callbacks and every visitor
get a Vercel login page.

**File tracing** (`next.config.mjs`): a function carries only the files Next's tracer finds, so
`outputFileTracingExcludes` keeps `public/` (served by the CDN) out of them and
`outputFileTracingIncludes` adds what the tracer cannot see: the sample plan the plan reader
reads from disk, and Sentry's ESM diagnostics-channel hook with the modules it imports (loaded
through `module.register`; without them every cold start logged "Failed to register
diagnostics-channel injection hooks" and some spans were lost). The proxy's function is traced
by Vercel on its own and still logs that once per cold start — harmless: it only redirects. Next matches
these globs *anywhere* in a path, `node_modules` and its own server included: `./logs/**` once
also dropped Next's `dev/browser-logs/` — the build passed and every function died at start
with `Cannot find module '../dev/browser-logs/file-logger'`. An exclude must name a folder no
package has; after changing one, load a page of the new deployment before calling it done.

## Request and response size

A Vercel function takes a request body of at most **4.5 MB** and answers at most 4.5 MB
(`413 FUNCTION_PAYLOAD_TOO_LARGE`), whatever the plan. So:

- **Files never go through a function**: the browser sends them to storage itself
  ([uploads.md](uploads.md)); a route receives only the upload's id.
- **A large save is gzipped by the browser** (`lib/flow/jsonBody.ts`, `CompressionStream`, from
  1 MB — a design saved with its kept versions reached 6.4 MB at 600 placed items) and inflated
  by the route (`readJson` in `lib/api/body.ts`, at most 32 MB once inflated). Both save routes
  (`POST /api/projects`, `POST /api/design/projects`) take it.
- **A large answer is gzipped by the function** (`okLarge`, from 512 KB when the browser takes
  gzip): the kept versions (`GET /api/projects/[id]/versions`) and a whole project row
  (`GET /api/projects/[id]`).
- Still unbounded: the revenue CSV export (`/api/admin/revenue/export`) — fine at today's sizes.

## Before real customers

1. A domain of our own: Project → Domains, then `NEXT_PUBLIC_APP_URL` to it and a redeploy;
   delete `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (the trial's `vercel` label) so events are
   `production`; register the redirect URI with Google/Facebook if social logins are wanted.
2. `ANTHROPIC_API_KEY` (the Claude plan reader) and SMTP (`MAIL_DRIVER=smtp`) if wanted.
3. Pro plans on both (Vercel Hobby is non-commercial; Supabase's free plan pauses after a week
   idle and keeps no backups) — and room for the local 3D library (`public/library`, 1.5 GB,
   its rows only in the local database), more than Supabase's free 1 GB of storage.

## Errors go to Sentry

Sentry (organisation `project-renovation`, project `javascript-nextjs`, `@sentry/nextjs` 11) is
**off unless `NEXT_PUBLIC_SENTRY_DSN` is set**, like every other key: `lib/sentry.ts` starts the
SDK disabled and every capture is a no-op. `lib/env.ts` validates the DSN as a URL.

- **What reaches it.** In the browser (`instrumentation-client.ts`): uncaught errors and
  rejections, what the two error boundaries catch (`app/(main)/error.tsx` — a boundary keeps the
  error from the browser's handler, so it sends it itself — and `app/global-error.tsx`, an
  error in the root layout, rendered as Next's own error page because no dictionary is left),
  navigation traces, and a Replay of the minute before an error (everything masked; the 3D
  canvas and Flitt's card form are never recorded). On the server: `onRequestError` in
  `instrumentation.ts` sends what a page, layout, server action or the proxy did not catch. API
  routes catch their own exceptions in `handle()` and only log them, so **the server's log is
  forwarded whole**: `sentry.server.config.ts` sets `lib/log.ts`'s sink, every line goes to
  Sentry's Logs with its context as attributes, and every `error` line is an issue too — its
  `Error` as the exception (grouped by stack, tagged with the route `handle()` names), or the
  message when the line carries no error.
- **Flushed after each response on Vercel.** An instance may be frozen the moment it has
  answered, with Sentry's queue still in it; `handle()` therefore schedules `Sentry.flush(2000)`
  with `afterResponse` (Next's `after`, which Vercel waits for) on every API request.
  `onRequestError` flushes by itself.
- **The sink sits on `globalThis`**, not in a module variable: `instrumentation.ts` and the
  routes are separate server bundles that may each carry their own copy of `lib/log.ts`; and
  `lib/log.ts` does not import Sentry itself, so scripts can bundle it.
- **Environment and sampling.** `environment` is `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, else
  `NODE_ENV`: **`vercel`** for the Vercel deployment (set on the project, so its events stay apart
  from `production` in the same Sentry project while the move was tested — delete the variable), `development` locally. Errors are never
  sampled; traces are, at 1 in 5 in production builds. Unit tests (`NODE_ENV=test`) never send.
- **No personal data leaves for Sentry.** SDK 11 collects by default IPs, cookies, every
  header, request and response bodies, query strings, bound SQL parameters and stack locals;
  `lib/sentry.ts` sets an explicit `dataCollection` with all of those off (only `user-agent`,
  `content-type` and `accept-language` request headers kept), typed with `satisfies` so a key the
  SDK no longer knows fails type-check. The log sink passes the context through `scrubContext`
  first: a personal or secret key's value is replaced, and e-mail addresses and link tokens are
  taken out of every other string; `beforeSend` / `beforeSendLog` do the same to messages,
  exceptions and URLs. Replay records Flitt's card form as an empty box (`data-sentry-block`).
- **The CSP needs nothing.** The browser sends to `/monitoring` on the app's own origin
  (`tunnel` in `instrumentation-client.ts`). `app/monitoring/route.ts` forwards an envelope only
  when its header names our own DSN, to our project's ingest URL, as the body alone, capped at
  2 MB and rate limited per address (300 per 10 minutes).
- **The DSN is baked in at build time** (`NEXT_PUBLIC_`): on Vercel it is a project variable,
  available to the build. **Source maps**: with `SENTRY_AUTH_TOKEN` at build time (a project
  variable, sensitive) the build uploads the browser source maps to Sentry and deletes them from
  the output; without it the build makes none.
- **Server request sessions are off** (`httpIntegration({ sessions: false })`), and
  `withSentryConfig` comes from `@sentry/nextjs/config` (SDK v11).
- **Checking it.** Set the DSN in `.env.local`, restart `pnpm dev`, and an error on any page
  shows up under Issues within seconds, environment `development`.

## Known gaps

- **Sentry**: the privacy policy (`/privacy`, section 4) does not name Sentry, which receives
  technical data, masked replays and the ids in log lines. Server events carry no user.
- **The account-claims cache is per instance** (`lib/auth/accountClaims.ts`, 30 s): a role change,
  a deactivation or a password reset reaches another warm Vercel instance within that half
  minute, not at once ([auth-and-roles.md](auth-and-roles.md)).
- **Delivery from Tbilisi** off Vercel's and Supabase's CDNs is not measured yet.
- **Plans**: Hobby is non-commercial; Supabase free pauses after a week idle and keeps no
  backups ([Where it runs](#where-it-runs)).
- Only the plan exports as a PDF (`lib/design/planPdfExport.ts`); there is no PDF of the budget
  sheet. No SMS.
- `lib/log.ts` reads `LOG_FILE`, `LOG_STDOUT` and `LOG_LEVEL` straight from `process.env` (not
  through `env`), and a few other places do too (`lib/design/aiPlan.ts` for
  `ANTHROPIC_API_KEY`, the health route for `VERCEL_GIT_COMMIT_SHA`, `lib/auth/social.ts`,
  `app/layout.tsx`, `lib/sentry.ts`, which the browser runs too, and `lib/db/index.ts` for
  `VERCEL`).

## Rate limits and the client address

`lib/api/rateLimit.ts` keys every limit on `clientIp(req)`: the **last** `X-Forwarded-For`
entry, else `X-Real-IP`. **On Vercel** the edge replaces whatever `X-Forwarded-For` the client
sent with the address it saw, so the one entry is the client's; the counts live in Postgres
(`rate_limits`), shared by every instance — a sliding window (the previous window's count,
weighted by how much of it is left, plus the current one), one upsert per request, and a
request goes through if the counters cannot be reached. A proxy put in front of Vercel
(Cloudflare's orange cloud) would make everyone share its address: read its header
(`cf-connecting-ip`) first then.
