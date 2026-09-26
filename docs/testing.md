# Testing

What is tested, where the tests live, what CI runs, and which command to run after touching
which part. Read this before declaring a change done, and when adding tests.

Related: [architecture.md](architecture.md) (why logic lives in `lib/`) ·
[operations.md](operations.md) (CI and deploy workflows).

## Commands

| Command | What it runs | Needs a DB? |
|---|---|---|
| `pnpm type-check` | `tsc --noEmit` over the whole project (TypeScript strict) | no |
| `pnpm lint` | `eslint .` (flat config, `eslint.config.mjs`) | no |
| `pnpm test` | Vitest: every `tests/**/*.test.ts` (unit + integration) | no — the integration test mocks `@/lib/db` and the session |
| `pnpm test:coverage` | the same with the coverage gate CI enforces | no |
| `pnpm test:watch` | Vitest in watch mode | no |
| `pnpm test:parser` | `scripts/test-plan-parser.ts` — synthetic floor plans through the CV parser | no |
| `pnpm test:solver` | `scripts/test-plan-solver.ts` — dimension labels and the plan solver, no API key | no |
| `pnpm test:e2e` | Playwright (`e2e/`) against `PLAYWRIGHT_BASE_URL` or a dev server on :3000 | **yes** |

Minimum before calling any change finished: `pnpm type-check`, `pnpm lint`, and `pnpm test`
(or the relevant test files). Add `pnpm test:parser` after touching `lib/design/planParser.ts`
and `pnpm test:solver` after touching `lib/design/planSolver.ts`, `measure.ts` or `aiPlan.ts`.

## What CI runs (`.github/workflows/ci.yml`)

On every push to `main` and every pull request — and, through `on: workflow_call`, as the
`verify` job of the tag deploy (`deploy.yml`) — one job: install (`--frozen-lockfile`) →
`pnpm type-check` → `pnpm lint` → `pnpm test -- --coverage` (coverage gate) → `pnpm test:parser`
→ `pnpm test:solver` → `pnpm build`. pnpm 9 drops the `--` and runs `vitest run --coverage`, so
the gate is enforced there exactly as by `pnpm test:coverage` (a threshold forced above the
current figure fails the run). The job sets placeholder environment variables so `lib/env.ts`
validates without a database. **e2e is not run in CI** (it needs the database): run it before a
release tag, or against staging with `PLAYWRIGHT_BASE_URL`. Check a workflow change with
`actionlint` before pushing it — it catches what GitHub would only report when the event fires.

## Vitest (`vitest.config.mts`)

- Environment `node`; includes `tests/**/*.test.ts`; `@` resolves to the repo root.
- Test env: `NODE_ENV=test`, `LOG_FILE=false`, `LOG_STDOUT=false`, a test `AUTH_SECRET`.
- **Coverage gate** (v8; lines/functions/statements 80 %, branches 65 %) over the modules that
  produce money figures or guard the API: `lib/calculator/**`, `lib/design/pricing.ts`,
  `lib/design/matcher.ts`, `lib/finance/money.ts`, `lib/api/**`, `lib/auth/**`,
  `app/api/projects/route.ts`, `app/api/design/projects/route.ts` (excluding
  `lib/calculator/constants.ts`, `lib/api/designCatalog.ts`, `lib/api/rateBook.ts`,
  `lib/auth/tokens.ts`). Adding code to those modules means adding tests with it.

## Where the tests are

| Folder | Covers | Topic doc |
|---|---|---|
| `tests/unit/calculator/` | the engine and rate book (`materials`, `rates`), selection keys and quantities, per-room finishes, the layout editor, plan sync | [calculator.md](calculator.md) |
| `tests/unit/summary/` | `calculatorSheet`, the quantity dropdown | [budget.md](budget.md) |
| `tests/unit/design/` | walls, drawing, plan drawing, studio rooms, openings, technical, auto technical, electrical, radiators, paint, zones, trims, pricing, budget, ticks, kitchen, matcher, manipulate, clearance, catalogue browser, shelf rooms, colours, style quiz, history, daylight, plan PDF export, AI plan reading, from-calculator handoff | [design-studio/](design-studio/overview.md) |
| `tests/unit/design3d/` | wall geometry, whose wall a hit is, cornices, the environment, footprints read from a model | [design-studio/3d-engine.md](design-studio/3d-engine.md) |
| `tests/unit/flow/` | resume, sync lines and pruning, opening a project, save helpers, legacy migration | [project-flow.md](project-flow.md) |
| `tests/unit/projects/` | row helpers (`projectKind`, progress, `picksFromScene`), checkout parts | [project-flow.md](project-flow.md), [marketplace.md](marketplace.md) |
| `tests/unit/store/` | `calculatorStore`, `designStore` | [calculator.md](calculator.md), [design-studio/studio.md](design-studio/studio.md) |
| `tests/unit/finance/money.test.ts` | fees, commissions, grouping by store, delivery, order lines from the budget | [marketplace.md](marketplace.md) |
| `tests/unit/api/` | route helpers (envelope, `parseId`, `requireAdmin`, `handle`, rate limiting, `safeCallbackUrl`, repricing), who sees and changes a product (`productAccess`), login lockout, upload byte sniffing | [auth-and-roles.md](auth-and-roles.md), [operations.md](operations.md) |
| `tests/unit/i18n-scripts.test.ts` | no Cyrillic inside Georgian words in `ka.ts` | [architecture.md](architecture.md#i18n) |
| `tests/integration/save-routes.test.ts` | both save routes and project create/rename, with the DB and session mocked: ownership, forged prices, unknown products, revision conflicts, own unconfirmed saves, racing writes, column ownership, per-room quantities, rate limiting | [project-flow.md](project-flow.md) |
| `tests/integration/product-routes.test.ts` | `/api/products/[id]` with the DB and session mocked: who may read a hidden product, who may change one | [catalog.md](catalog.md) |
| `e2e/public.spec.ts` | landing, health, catalogue filters via URL, workers directory redirect, 404, security headers, auth pages, callback URL safety | — |
| `e2e/design-studio.spec.ts` | registers an account, makes a project from the design hub, then the bundled sample plan through upload → mode → board → technical → style → a furnished studio with a price → summary, and the project reopening where it was left (the brigade step is not visited; the account and project stay in the database) | [design-studio/overview.md](design-studio/overview.md) |

## Writing tests

- Put logic in `lib/` as pure functions and test it there; components are not unit-tested.
- Name tests by the behaviour they pin (the existing suites read as sentences); when a bug is
  fixed, pin it with a test next to the related ones.
- Three.js code in `lib/design3d/` can be tested in the `node` environment as long as it does
  not need a WebGL context (see `tests/unit/design3d/`).
- Database-touching modules (`lib/finance/orders.ts`, `report.ts`, `settings.ts`) are exercised
  through routes and e2e, not unit tests.

## Known gaps

- e2e is not run in CI (it needs the database), and the studio spec stops at the summary: the
  brigade step (8) has no browser test.
- Components have no unit tests; the 2D board and the 3D viewer are exercised only by e2e and
  by hand.
