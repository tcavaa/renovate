# Architecture and conventions

How the codebase is laid out, how the parts talk to each other, and the rules every change
follows. Read this when you need to find where something lives, when a change crosses several
features, or before adding a route, a store, a table or a user-facing string.

Related: [data-model.md](data-model.md) (tables) · [auth-and-roles.md](auth-and-roles.md) ·
[project-flow.md](project-flow.md) (projects, stores, saving) · [testing.md](testing.md) ·
[operations.md](operations.md).

## Layers

| Layer | Where | Rule |
|---|---|---|
| Routes and pages | `app/` (App Router) | Server components by default; `'use client'` only where state or the browser is needed. Pages compose components and call `lib/` — no business rules here. |
| API routes | `app/api/**/route.ts` | Wrapped in `handle()` from `lib/api/route.ts`; see "API conventions" below. |
| Components | `components/<area>/` | Render only. Anything worth testing moves to `lib/`. |
| Domain logic | `lib/<area>/` | Pure, isomorphic TypeScript: no React, no `window` (the few browser-only files say so, e.g. `lib/design/planImage.ts`, `lib/design/planPdf.ts`). This is what the unit tests cover. |
| 3D | `lib/design3d/` + `components/design/Viewer3D.tsx` | Three.js scene building is plain three.js in `lib/design3d/`; the React/R3F viewer is client-only and dynamically imported with `ssr: false`. |
| Client state | `store/` (zustand + `persist`) | One set of stores per project — see [project-flow.md §8](project-flow.md#8-one-set-of-stores-per-project-storeprojectscopets). |
| Data hooks | `hooks/` | Fetch-once hooks (`useDesignCatalog`, `useRateBook`, `usePlatformFees`, `usePickStores`, `useProducts`/`useCategories`, `useWorkers`) plus `useAutosave` and `useCalculatorPlan`. |
| Database | `lib/db/` (Drizzle, MySQL 8) | Schema in `lib/db/schema.ts`, migrations in `lib/db/migrations/` — see [data-model.md](data-model.md). |
| Scripts | `scripts/` (run with `tsx`) | Seeds, migrations, the 3D asset pipelines, plan-reader test harnesses. |
| Tests | `tests/unit`, `tests/integration` (Vitest), `e2e/` (Playwright) | See [testing.md](testing.md). |

## The two products and how the features connect

```
                 ┌──────────── projects (one row, two halves) ─────────────┐
                 │  docs/project-flow.md: hubs, ProjectGate, autosave, revs │
                 └───────┬──────────────────────────────────┬──────────────┘
          calculator half│                                  │design half
  /calculator/<id>/…     ▼                                  ▼   /design/<id>/…
  lib/calculator (engine, rate book)          lib/design (plan, walls, layout, matcher,
  store/calculatorStore + calculator board      pricing) · lib/design3d · store/designStore
          │  "see it in 3D": handOffToDesign ──────────────▶│
          ▼                                                  ▼
  lib/summary/calculatorSheet ──▶ BudgetLine[] ◀── lib/design/pricing (priceScene)
                                  components/budget/BudgetSheet   (docs/budget.md)
                                         │ orderedLines / orderedPickLines
                                         ▼
                    lib/finance (checkout, orders, bookings) → partners (docs/marketplace.md)
  catalogue (products, stores, categories — docs/catalog.md) feeds both: the calculator's
  catalogue step and the studio's matcher (GET /api/design/catalog); 3D files come from
  the asset pipelines (docs/3d-assets.md).
```

- The **calculator engine** (`lib/calculator/materials.ts`) is reused unchanged by the studio
  for materials and labour in a renovation (`mode: 'full'`).
- The **2D board** (`components/plan/`, `lib/design/walls.ts`) is used by both products: the
  calculator's plan step (with its own store, `useCalculatorPlanStore`) and the design's plan,
  technical and studio steps.
- **Every priced thing ends up as a `BudgetLine`**, and orders are made from those lines —
  never re-derived from the scene or the picks.
- **The server reprices everything** a client sends (both save routes, the checkout).

## Directory map

```
app/
  layout.tsx, not-found.tsx         root layout: locale → LocaleProvider, fonts, session
  (auth)/                           login, register, register/store, register/worker,
                                    forgot-password, reset-password
  (main)/                           the public site (layout with Header/Footer)
    page.tsx                        landing (components/landing/*)
    calculator/page.tsx             calculator hub (ProjectHub)
    calculator/[id]/                one project: layout.tsx (owner check → ProjectGate + autosave),
                                    page.tsx (resume), start/ plan/ materials/ catalog/ furniture/ summary/
    design/page.tsx                 design hub
    design/[id]/                    one project: layout.tsx, page.tsx (resume, carries a calculation in),
                                    start/ plan/ technical/ style/ studio/ summary/ workers/
                                    (studio/ is steps 5 and 6 — ?tool=finishes)
    catalog/, catalog/[slug]        public catalogue and product page
    teams/, teams/[slug]            brigades (public)
    workers/, workers/[id]          switched off (lib/features.ts) — the proxy redirects to /teams
    profile/, profile/projects/[id] the person's projects, renders, own models
    about/ contact/ privacy/ terms/
  admin/                            staff area, one folder per section (dashboard, orders, projects,
                                    products, categories, stores, workers, teams, rates, revenue,
                                    users, settings) — see docs/partners-and-admin.md
  partner/                          partner portal: orders, products (stores), profile (workers)
  api/                              route handlers (list below)
components/
  ui/          button button-3d card dialog input label select textarea accordion badge skeleton
               money-row stat-card scroll-row
  layout/      Header Footer AdminSidebar LanguageSwitcher UserMenu NotFoundContent
  landing/     Hero ProductWall StatsBand StylesRow DesignerSection FinalCta
  motion/      CountUp Marquee RotatingBadge
  flow/        StepStrip StepHeader StepNav SideList EmptyStep StageBrief FlowGuard FlowWorkspace
  calculator/  StepIndicator HomeStateSelector RoomForm RoomList MaterialsTable SummaryCard
               WorkChoicesPicker AskFurnitureDialog CalculatorAutosave
  plan/        PlanEditor (the 2D board) PlanWorkspace PlanToolbar ElementInspector RoomsPanel
               draw.ts palette.ts icons.ts
  design/      DesignSteps PlanUploadCard StylePicker StyleQuiz GenerationOverlay Viewer3D
               WalkControls ItemCard SwapPanel HoverCard FinishPanel StudioControls FloatingPanel
               PhotoDialog ProductPageLink DesignAutosave
  studio/      BuildBar Trays FurnitureTray FurnitureDrawer CatalogBrowser RoomItemsPanel
               FixturePanel OpeningPanel OwnModelDialog StudioTopBar TutorialOverlay NavHelp
               VersionsPanel archetypeIcons.ts dragImage.ts
  budget/      BudgetSheet lineName.ts
  projects/    ProjectGate SaveProblemBanner ProjectDetail FoldSection ProjectRenders PlanSketch
               ProjectKindTags OpenIn3dButton CalculateCostsButton OrderProjectButton
               DeleteProjectButton · hub/ (ProjectHub HubTiles ProjectCardMenu LegacyWorkNotice
               HubCachePrune)
  checkout/    CheckoutDialog BookingDialog CustomerFields
  orders/      OrderEditor OrderStatusBadge ProjectOrders
  catalog/     ProductCard ProductGrid CatalogSidebar ProductModelDrawer SortSelect StyleFilter
  admin/       ProductForm (also the partner portal's) ModelUploader ImageUploader StoreForm
               CategoryForm WorkerForm TeamForm UserForm PartnerApproval RatesTable SettingsForm
               RevenueChart FilterBar AdminList
  auth/ partner/ profile/ teams/ workers/ legal/ contact/ providers/
lib/
  calculator/  the estimate engine, rate book, selection keys, per-room finishes, step URLs
  summary/     calculatorSheet.ts, quantity.ts — the calculator's estimate as BudgetLines
  design/      plan, walls, parser/reader, layout, matcher, pricing, finishes, fittings, steps
  design3d/    three.js scene building, materials, model loading, lighting
  flow/        per-project caches, sync lines, save queue, loaders, resume, legacy migration
  projects/    row ↔ client shapes, hub query, owner check, sheets, checkout parts
  finance/     marketplace money, orders, notifications, revenue report, settings
  teams/       brigade queries
  api/         route helpers (handle, guards), rate limiting, repricing, who sees a product
               (productAccess), design catalogue, rate book
  auth/        roles, lockout, tokens, safe callback URLs, social providers, account claims
  admin/       admin page guard, URL list state
  partner/     partner portal context
  db/          schema.ts, index.ts (pool + drizzle), json.ts, migrations/
  i18n/        ka.ts (source of the Dictionary type) en.ts ru.ts, client.tsx, server.ts, labels.ts
  storage/     local | s3 upload drivers
  uploads/     byte sniffing (images, GLB)
  validations/ zod schemas per payload
  env.ts log.ts email.ts features.ts utils.ts
store/         calculatorStore.ts designStore.ts projectScope.ts
hooks/         useAutosave useCalculatorPlan useDesignCatalog usePickStores usePlatformFees
               useProducts (+ useCategories) useRateBook useWorkers
scripts/       seeds, migrate, 3D/texture pipelines, plan tools (see docs/operations.md, docs/3d-assets.md)
types/         shared API types (ApiResponse, Paginated), calculator/product re-exports
tests/         unit/<area>/*.test.ts, integration/save-routes.test.ts
e2e/           public.spec.ts, design-studio.spec.ts
deploy/        VPS and cPanel deploy scripts, nginx.conf, migrate.cjs
public/        models/ (partner GLBs + manifest.json, stock/, fixtures/, radiators/), textures/,
               uploads/, samples/plan-2br.png, vendor/pdf.worker.min.mjs
docs/          these documents
proxy.ts auth.ts auth.config.ts next.config.mjs tailwind.config.ts vitest.config.mts
playwright.config.ts drizzle.config.ts vercel.json ecosystem.config.cjs server.cjs .cpanel.yml
```

### API routes (`app/api/`)

| Area | Routes |
|---|---|
| Projects | `projects` (GET list, POST the calculation's save) · `projects/create` · `projects/[id]` (GET, PATCH rename, DELETE) |
| Design | `design/projects` (the design's save) · `design/catalog` · `design/upload-plan` · `design/parse-plan` · `design/renders`, `design/renders/[id]` · `design/models`, `design/models/[id]` (a person's own furniture) |
| Calculator | `calculator/materials` · `calculator/rates`, `calculator/rates/[id]` |
| Catalogue | `products`, `products/[id]` · `categories`, `categories/[id]` · `stores`, `stores/[id]`, `stores/[id]/approval` |
| People | `workers`, `workers/[id]`, `workers/[id]/approval` · `teams`, `teams/[id]` · `users`, `users/[id]` |
| Marketplace | `checkout` · `bookings` · `orders`, `orders/[id]` · `settings` · `admin/settings` · `admin/revenue/export` |
| Auth | `auth/[...nextauth]` · `auth/register` · `auth/register-partner` · `auth/forgot` · `auth/reset` · `auth/verify` |
| Uploads | `upload` (images) · `upload/model` (GLB) |
| Ops | `health` |

## State management

- **Per-project stores** (`store/projectScope.ts`): the calculator (`renovate-calculator:<id>`),
  the calculator's drawing board (`renovate-calculator-plan:<id>`) and the studio
  (`renovate-design:<id>`), each a zustand store persisted to its own localStorage key and
  reached through the open project. How they are opened, cached, synced and saved is
  [project-flow.md](project-flow.md) §7–§10.
- `store/designStore.ts` is a factory over its storage key; the same factory makes the
  calculator's board. It owns the plan, the scene (furniture, finishes, fittings), history
  and versions, and the carry state. `store/calculatorStore.ts` owns rooms, home state, picks,
  edits and progress.
- Catalogue-wide data is fetched once per page load and cached at module scope
  (`hooks/useDesignCatalog.ts`, `hooks/useRateBook.ts`, `hooks/usePlatformFees.ts`).

## i18n

- Three locales: `ka` (primary, default), `en`, `ru` (`lib/i18n/index.ts`). The locale is a
  cookie (`LOCALE_COOKIE`); `getLocale()` / `getT()` in `lib/i18n/server.ts` are async (Next 16
  request APIs).
- `lib/i18n/ka.ts` defines the `Dictionary` type; `en.ts` and `ru.ts` must match it, so a key
  missing from either is a type error. **Every user-facing string goes through the
  dictionaries** — add the key to all three files.
- Server components call `await getT()`; client components call `useT()` / `useLocale()` from
  `lib/i18n/client.tsx`. The root layout picks one dictionary (`lib/i18n/dictionaries.ts`, server
  only) and hands it to `LocaleProvider`, so a visitor downloads one language.
- Label helpers (`lib/i18n/labels.ts`) turn keys into words: `roomTypeLabel`, `homeStateLabel`,
  `phaseLabel`, `styleLabel`, `orderStatusLabel`, `basketLabels`, `apiErrorMessage`, …
- `tests/unit/i18n-scripts.test.ts` fails if a Cyrillic letter appears inside a Georgian word in
  `ka.ts`.

### Catalogue data in three languages

Products, stores and workers carry `nameKa` plus optional `nameEn` / `nameRu` (and the same
for descriptions and bios); categories have `nameRu` next to the existing `nameEn`. Render
them only through `localizedName(locale, row)` / `localizedText(...)` from `lib/i18n/labels.ts`,
which fall back ru → en → ka so a half-translated row still shows something. Product
snapshots stored in scenes and projects carry the three names too, so a saved design reads
correctly in any language. Archetype labels have `labelEn` / `labelRu`
(`archetypeLabel(kind, locale)`); style names and blurbs are dictionary keys. The admin forms
have a "Translations" section; `scripts/lib/translations.ts` holds the seed translations and
`pnpm db:backfill-translations` fills in rows that only have Georgian (3D products get
"archetype + model name", textures a humanised slug). The i18n rule applies to data as well
as UI copy: nothing user-facing is Georgian-only by construction.

## API conventions

All shared route vocabulary is in `lib/api/route.ts`:

- Routes export `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`, wrap the handler in
  `handle(label, message, fn)` and answer with `ok(data)` / `fail(error, status)` — always the
  `{ data, error }` envelope (`types/index.ts` → `ApiResponse`). Errors the UI translates are
  codes in `API_ERRORS` (`apiErrorMessage` in `lib/i18n/labels.ts` turns them into words).
- `handle` logs every request (route, status, duration) and any exception through `lib/log`
  and answers a generic 500 — never leak internals. It also awaits `ctx.params`, so handlers
  keep the plain `{ params }` shape; `parseId` validates a numeric id.
- JSON bodies are `safeParse`d with the Zod schema from `lib/validations/` →
  `fail(parsed.error.message, 400)`. Multipart uploads are validated by their bytes
  (`lib/uploads/sniff.ts`, `glb.ts`) instead.
- Access: `requireSession`, `requireAdmin`, `requireStaff(section)`, `requirePartner`,
  `requireCatalogEditor`, `requireUploader` — which one a route uses is in
  [auth-and-roles.md](auth-and-roles.md#where-access-is-enforced). A project route also checks
  the project is the caller's own.
- Public writes are throttled per IP (`rateLimited(req, RATE_RULES.…)`, `lib/api/rateLimit.ts`).
- Exceptions: `/api/health` answers its own shape; `/api/admin/revenue/export` returns CSV;
  `/api/design/parse-plan` adds `fallback: 'cv'` to its 503; `auth/[...nextauth]` is NextAuth's.

## Conventions to follow when extending

1. **Every user-facing string goes through `lib/i18n`** — add the key to `ka.ts` *and* `en.ts`
   *and* `ru.ts` (`Dictionary` is derived from `ka.ts`, so a missing key in en/ru is a type error).
2. **Business logic lives in `lib/` as pure functions**; components render only. The 3D geometry
   builders and the layout engine must stay free of React and of `window`.
3. New tables/columns → `lib/db/schema.ts` → `pnpm db:generate` → commit the migration
   ([data-model.md](data-model.md#changing-the-schema)); new payload → `lib/validations/`.
4. Product ↔ material linkage is by **category slug** (`linkedCategorySlug`), not by id.
5. Tailwind theme tokens only ([ui-design-system.md](ui-design-system.md)); headings use
   `font-serif`.
6. Money is always rendered with `formatGEL()`; areas with `formatM2()`.
7. Three.js code must be in `'use client'` components and dynamically imported with
   `ssr: false` — the geometry/layout libs under `lib/` stay isomorphic and testable.
8. Run `pnpm type-check` before considering a change complete.

## Dates in client components

**Date formatting in client components** goes through `formatDateTime` (`lib/utils.ts`):
`toLocaleString` hydrated differently on the server and in the browser and the order editor
was the first to break.

## Next 16 notes (upgraded September 2026)

- Request APIs are async: `getT()` / `getLocale()` in `lib/i18n/server.ts` return promises and
  every server component that uses them is `async`. `params` and `searchParams` arrive as
  promises; the route wrapper `handle()` in `lib/api/route.ts` awaits `ctx.params` so the
  handlers themselves keep the plain `{ params }` shape.
- `proxy.ts` replaced `middleware.ts` (same matcher, same NextAuth guard). The export has to be
  named `proxy` (`export const proxy = auth((request) => …)`); a destructured
  `export const { auth: proxy }` is not detected.
- `pnpm lint` runs `eslint .` with the flat config. The React Compiler rules that
  eslint-config-next 16 adds (`react-hooks/refs`, `set-state-in-effect`, `immutability`,
  `purity`) are warnings until the viewer's ref patterns are reworked.
- `revalidateTag(tag, 'max')` — the second argument is required now.
- React Three Fiber 9 configures the renderer asynchronously; anything that waits for the
  first model fetch (tests, screenshots) has to poll rather than assert immediately.
