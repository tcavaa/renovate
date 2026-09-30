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
  `lib/design/matcher.ts`, `lib/finance/money.ts`, `lib/finance/orderFlow.ts`,
  `lib/account/contact.ts`,
  `lib/storage/uploadKeys.ts`, `lib/api/**`, `lib/auth/**`,
  `app/api/projects/route.ts`, `app/api/design/projects/route.ts` (excluding
  `lib/calculator/constants.ts`, `lib/api/designCatalog.ts`, `lib/api/rateBook.ts`,
  `lib/auth/tokens.ts`). Adding code to those modules means adding tests with it.

## Where the tests are

| Folder | Covers | Topic doc |
|---|---|---|
| `tests/unit/calculator/` | the engine and rate book (`materials`, `rates`), selection keys and quantities, per-room finishes, the layout editor, plan sync (and the windows taken off the walls read off the board), what the board counts (its doors and windows — the sample plan's three and eight) | [calculator.md](calculator.md) |
| `tests/unit/summary/` | `calculatorSheet` (a calculation and a design of the same flat come to the same lines, the shops given back from the catalogue; whole-flat picks on the board; the contingency), the quantity dropdown | [budget.md](budget.md) |
| `tests/unit/design/` | walls, room separators and partial walls, partition walls (built walls, the calculator's board), drawing, plan drawing, studio rooms, room names, openings, balcony railings (and a balcony's standing walls), technical (and its checks), auto technical, electrical (and a room wired by hand kept whole), radiators, paint, zones, visible finishes, the style's finish products, trims, pricing, budget, ticks, kitchen, matcher (and a chair the engine tucked under its table, a product flush in any corner), the layout engine (nothing through a wall), manipulate (and furniture over a room separator, every wall alike, chairs tucked under their table, the engine's pieces let stand), clearance, catalogue browser, the finishes browser (tray filters and the finishes catalogue), shelf rooms, the shelf (admin's studio rooms → categories), colours (and colours read off pixels), style quiz, history, daylight, plan PDF export, AI plan reading, from-calculator handoff | [design-studio/](design-studio/overview.md) |
| `tests/unit/design3d/` | wall geometry, whose wall a hit is, cornices, the environment, footprints read from a model, glass made plain (`glass`), instanced runs and what their disposal frees (`instancing`), finishes let go when no shell wears them and painted tiles merged per finish (`materials`) | [design-studio/3d-engine.md](design-studio/3d-engine.md) |
| `tests/unit/flow/` | resume, sync lines and pruning, opening a project, save helpers, legacy migration | [project-flow.md](project-flow.md) |
| `tests/unit/projects/` | row helpers (`projectKind`, progress, `picksFromScene`), checkout parts (and which lines are furniture) | [project-flow.md](project-flow.md), [marketplace.md](marketplace.md) |
| `tests/unit/store/` | `calculatorStore`, `designStore` | [calculator.md](calculator.md), [design-studio/studio.md](design-studio/studio.md) |
| `tests/unit/finance/money.test.ts` | fees (and the area a half's fee is charged on), commissions, grouping by store, delivery, order lines from the budget | [marketplace.md](marketplace.md) |
| `tests/unit/account/contact.test.ts` | an order's contact: the account's name and e-mail win, a phone or address typed for the order over the profile's, what is missing is asked, what is kept; addresses | [marketplace.md](marketplace.md), [auth-and-roles.md](auth-and-roles.md) |
| `tests/unit/finance/orderFlow.test.ts`, `materials.test.ts` | order stages, what a partner may do with its order, an edit's facts, what the customer sees changed; the construction materials to their supplier | [marketplace.md](marketplace.md) |
| `tests/unit/api/` | route helpers (envelope, `parseId`, `requireAdmin`, `handle`, rate limiting, `safeCallbackUrl`, repricing), who sees, changes and deletes a product (`productAccess`), the session's claims at sign-in and on every later read — role changes, deactivation, the cache, the password form (`accountClaims`, through the callbacks `auth.ts` registers), account rules, role landing and who may delete (`accounts`), a partner's public face (`publicPartners`), which stored files may be deleted (`uploadKeys`), login lockout, upload byte sniffing, a texture's colours read with sharp (`textureColors`), an uploaded GLB optimized — Draco on the server and meshopt in the browser, a browser-optimized file given Draco and its WebP kept, texture coordinates far outside 0–1 kept within a texel (Draco's bits follow their range), WebP at each map's size, the triangle cap, what is kept as it came (`glbOptimize`), stored models re-optimized in place (`optimizeStored`), finish textures as WebP — a normal map told by its name and kept at a higher quality, the 2048 px cap, what an upload keeps (`textureOptimize`), photos as WebP with their transparency within 1600 px (`imageOptimize`), glass stored plain by the upload recipe (`glbOptimize`) | [auth-and-roles.md](auth-and-roles.md), [operations.md](operations.md), [3d-assets.md](3d-assets.md#uploads-are-optimized) |
| `tests/unit/i18n-scripts.test.ts` | no Cyrillic inside Georgian words in `ka.ts` | [architecture.md](architecture.md#i18n) |
| `tests/integration/save-routes.test.ts` | both save routes and project create/rename, with the DB and session mocked: ownership, forged prices, unknown products, revision conflicts, own unconfirmed saves, racing writes, column ownership, per-room quantities, the calculation's sheet in the answer, finishes bought in whole litres, rate limiting | [project-flow.md](project-flow.md) |
| `tests/integration/product-routes.test.ts` | `/api/products/[id]` with the DB and session mocked: who may read a hidden product, who may change and who may delete one, a finish's and a moulding's `specs` saved and a bad one refused | [catalog.md](catalog.md) |
| `tests/integration/catalog-delete-routes.test.ts` | `DELETE /api/categories/[id]`, `DELETE /api/stores/[id]` and `POST /api/products/bulk` with the DB and session mocked: deleting is admin's (a store's own products in bulk), the catalogue agent is refused before anything is read, a category with products is kept | [catalog.md](catalog.md) |
| `tests/unit/admin/` | icons: lucide names (every icon found again from its stored name), the studio's own furniture icons, the suggested icons and their three-language search, the drawings sent to the studio; the lists remembered where they were left (session storage, a refusing storage, links that carry their own query), the section crumbs; what a filter button says (tree option names, ranges, periods); a page read by id back in its sorted order (`inIdOrder`) | [categories.md](categories.md), [partners-and-admin.md](partners-and-admin.md) |
| `tests/unit/catalog/` | the category tree (order, paths, subtrees, counts, where a category may go, the code's slugs up the chain, filing by kind) and the starting tree with its migration 0018 kept in step | [categories.md](categories.md) |
| `tests/integration/category-tree-routes.test.ts` | the tree's and the studio rooms' routes with the DB and session mocked: last among siblings, three levels, no loops, unique slugs, children kept, exact reorders, the calculator's tabs, rooms' guards | [categories.md](categories.md) |
| `tests/integration/order-routes.test.ts` | `/api/orders/[id]`, `…/confirm`, `…/comments` with the session and the order mocked: the store sees its order only once confirmed, partners never touch lines or delivery and move only along their steps, confirm is staff-only and once, the staff note stays with the platform | [marketplace.md](marketplace.md) |
| `e2e/public.spec.ts` | landing, health, catalogue filters via URL, workers directory redirect, 404, security headers, auth pages, callback URL safety | — |
| `e2e/design-studio.spec.ts` | registers an account, makes a project from the design hub, then the bundled sample plan through upload → mode → board → technical (going on through its checks) → style → the warning and the design's fee (the test card) → a furnished studio with a price → summary, and the project reopening where it was left (the brigade step is not visited; the account and project stay in the database) | [design-studio/overview.md](design-studio/overview.md) |

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
  brigade step (8) has no browser test. The studio spec pays the design's fee on its way to the
  studio (the warning, then the test card); nothing in e2e walks the calculator's payment, the
  checkout, its thank-you or the profile's details (they were walked through headless by hand).
- Components have no unit tests; the 2D board and the 3D viewer are exercised only by e2e and
  by hand.
