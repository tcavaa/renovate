# CLAUDE.md — RenovationRoom (რემონტი.ge / RenovateGE)

Entry point for AI sessions. It gives the overview, the commands and the rules that apply
everywhere, and an index of the topic documents under `docs/` that hold the detail. **Read the
topic documents for the area you are about to change before changing it.**

## What this app is

A Georgian-language home renovation platform (not yet shipped). Two products share one engine,
and both work on **projects** — a named row the person makes on a hub (`/calculator`,
`/design`); every step lives inside one (`/calculator/<id>/…`, `/design/<id>/…`, signed in
only), and a project can have both halves.

1. **Renovation calculator** — home condition → rooms (drawn or uploaded) → materials and labour
   from an editable rate book → a floor and a wall product per room and products for the flat →
   furniture → a cost summary that can be ordered.
2. **Design Studio** — eight steps: plan upload or blank sheet → the existing flat on a CAD-like
   2D board → technical setup → style test → a furnished **Three.js** model built from **real,
   purchasable partner products** → sockets and lighting → finishes → the budget → the brigade.

The differentiator: every object in the 3D scene is a real SKU with a price and a shop. The
platform earns a fee per m² and a commission on every partner order. UI copy is Georgian first,
with English and Russian. Tagline: გეგმე. გამოთვალე. გააკეთე. (Plan. Calculate. Build.)

## Stack

Next.js 16 App Router (Turbopack) · React 19 · TypeScript strict · MySQL 8 + Drizzle ORM ·
pnpm 9 · Tailwind 3 + Radix-based components, lucide-react · Zustand + `persist` (three stores
per project) · React Hook Form + Zod · NextAuth v5 beta (Credentials, optional Google/Facebook;
JWT; seven roles) · three / @react-three/fiber 9 / @react-three/drei 10 · i18n `ka` / `en` / `ru`
· Vitest + Playwright · deploy targets: Vercel (from September 2026), a VPS (PM2 + Nginx) and
cPanel. Details: [docs/architecture.md](docs/architecture.md).

## Commands

> **Never run `pnpm build` while `pnpm dev` is running, and never `rm -rf .next`.** They share
> `.next`; building over a live dev server, or deleting the directory under it, leaves it
> serving static files but 404-ing every page, with nothing in the terminal to say why. Stop the
> dev server first; restart it to recover. To build beside a live dev server:
> `NEXT_DIST_DIR=.next-build pnpm build`.

```bash
pnpm dev                # next dev on :3000
pnpm build / pnpm start # production build / serve on :3000
pnpm type-check         # tsc --noEmit — run before declaring work done
pnpm lint               # eslint . (flat config, eslint.config.mjs)
pnpm test               # Vitest: tests/unit + tests/integration (no DB needed)
pnpm test:coverage      # the same with the coverage gate (vitest.config.mts)
pnpm test:watch
pnpm test:parser        # CV floor-plan parser on synthetic plans — after touching planParser
pnpm test:solver        # dimension labels + plan solver, no API key — after touching the Claude reader
pnpm test:e2e           # Playwright against :3000 (needs the DB; not in CI)
pnpm plan:diagnose <plan.png>             # stage-by-stage report of the CV path on one plan
pnpm plan:ai <plan.png> [--save r.json]   # the Claude path on one plan; --replay r.json needs no key

pnpm db:generate        # drizzle-kit generate after a schema change → commit the migration
pnpm db:migrate         # apply pending migrations (what deploys run)
pnpm db:migrate:baseline  # once, on a DB created with db:push before migrations existed
pnpm db:push            # local experiments only (interactive; hangs in a non-interactive shell)
pnpm db:studio
pnpm db:indexes         # idempotent secondary indexes
pnpm db:seed            # categories, stores, products, workers, admin
pnpm db:seed:design     # partner stores + design categories (no furniture — see models:seed)
pnpm db:seed:rates      # local tidy-up: writes the default rate book in, deletes retired rows (never needed in production)
pnpm db:seed:workers    # worker profiles, portfolios, reviews; recomputes their ratings
pnpm db:seed:partners   # portal logins per active store/worker (PARTNER_PASSWORD or printed once);
                        # also creates the platform_settings row
pnpm db:seed:teams      # brigades and their logins (TEAM_PASSWORD or printed once)
pnpm db:backfill-translations  # en/ru names for rows that only have Georgian

pnpm assets:extract     # renders/textures from the partner 3D asset drop
pnpm models:convert [--only=a,b]   # partner OBJ → GLB + manifest
pnpm models:stock [--inspect] [--only=…]   # CC0 stock furniture
pnpm models:fixtures    # sockets, switches, lamps, doors, windows
pnpm models:radiators   # the four radiator designs (one section each)
pnpm models:photos      # product photos rendered from those models (Playwright's Chromium)
pnpm models:colors [--force]   # read each model's colours into the manifests
pnpm models:seed        # the catalogue made to match the model manifests
pnpm textures:stock     # floor/wall finish textures → surface products
pnpm deploy:bundle-seed # models:seed as one plain-node file (the cPanel workflow runs it)
pnpm uploads:cleanup [--dry-run]   # plan uploads no project references
pnpm pdf:worker         # re-copy pdf.js's worker into public/vendor after upgrading pdfjs-dist
```

Admin login after seeding: `ADMIN_EMAIL` (default `admin@remonti.ge`) / `ADMIN_PASSWORD` from
`.env.local`; with no password set the seed generates one and prints it once. `node_modules` may
be absent in a fresh cloud checkout — `pnpm install` before running anything.

## Rules that apply everywhere

1. **Every user-facing string goes through `lib/i18n`** — add the key to `ka.ts`, `en.ts` and
   `ru.ts` (`Dictionary` comes from `ka.ts`, so a missing key is a type error). Catalogue data
   is rendered through `localizedName` / `localizedText`.
2. **Business logic lives in `lib/` as pure, isomorphic functions**; components render only.
   Geometry builders and the layout engine stay free of React and `window`; Three.js/R3F code is
   `'use client'` and dynamically imported with `ssr: false`.
3. **The server never trusts a client's prices**: both save routes and the checkout reprice from
   the catalogue. **Orders are made from budget lines** (`orderedLines` / `orderedPickLines`),
   never re-derived from the scene or the picks.
4. **Never build or parse keys and URLs by hand**: selection keys through
   `lib/calculator/quantities.ts`, budget line keys through `lib/design/ticks.ts`, step URLs
   through `lib/calculator/steps.ts` / `lib/design/steps.ts`.
5. **Schema changes** go `lib/db/schema.ts` → `pnpm db:generate` → a committed migration;
   payloads get a Zod schema in `lib/validations/`. Decimals are strings: `Number()` before
   arithmetic, `String()` before insert.
6. **API routes** use `handle()` / `ok()` / `fail()` and the guards in `lib/api/route.ts`,
   answer `{ data, error }`, and `safeParse` every JSON body.
7. **Every object in the studio is a GLB** with a manifest entry; only the architecture is built
   from the plan. Keyboard shortcuts match `event.code`, never `event.key`.
8. **The app must work without any API key**: Claude is optional and only reads plans.
9. Tailwind theme tokens only; money through `formatGEL()`, areas through `formatM2()`, dates in
   client components through `formatDateTime()`.
10. **Before calling a change done**: `pnpm type-check`, `pnpm lint`, `pnpm test` (plus
    `test:parser` / `test:solver` when the plan pipeline changed), and update the docs (below).

## Documentation index

Read the documents for the area you are changing before you change it. When a task spans
several areas, read each one's document and follow the "Related" links at its top. The
documents are ordinary Markdown links (not auto-loaded) so a session reads only what it needs.

| Document | What it covers | Read it when |
|---|---|---|
| [docs/architecture.md](docs/architecture.md) | layers, directory map, routes, state, i18n, API and coding conventions, Next 16 notes | finding where something lives; any cross-cutting change; adding a route, store or string |
| [docs/data-model.md](docs/data-model.md) | every table and column, JSON and decimal rules, migrations, Drizzle pitfalls | touching `lib/db/`, a query, a column or a payload |
| [docs/auth-and-roles.md](docs/auth-and-roles.md) | sign-in, the seven roles, proxy / page / API guards, lockout, tokens | adding a route or admin page; anything checking `session.user` |
| [docs/project-flow.md](docs/project-flow.md) | projects: hubs, creation, the gate, per-project stores, caches, revisions and conflicts, autosave, resume, locks, the calculator ↔ 3D handoff, the project page | `lib/flow/`, `store/projectScope.ts`, the hubs, save routes, step URLs, `ProjectGate` |
| [docs/calculator.md](docs/calculator.md) | the calculator's six steps, the estimate engine, the rate book, phases and home states, per-room finishes, selection keys | `lib/calculator/`, `lib/summary/`, `store/calculatorStore.ts`, `app/(main)/calculator/`, `/admin/rates` |
| [docs/budget.md](docs/budget.md) | the shared summary sheet, `priceScene`, ticks and quantity edits, baskets and delivery, kitchens, trades | either summary page, `lib/design/pricing.ts`, `ticks.ts`, anything that makes order lines |
| [docs/marketplace.md](docs/marketplace.md) | fees and commissions, checkout, orders, brigade bookings, the order editor, revenue and settings | `lib/finance/`, `lib/teams/`, checkout/booking dialogues, orders, revenue |
| [docs/partners-and-admin.md](docs/partners-and-admin.md) | partner self-registration and approval, the partner portal, admin sections and URL-driven lists, brigade and worker pages | `app/admin/`, `app/partner/`, registration, `/teams`, `/workers` |
| [docs/catalog.md](docs/catalog.md) | products, stores, categories, the product form, public catalogue and product page, own furniture, what the public may see | product/store/category routes, `ProductForm`, `/catalog`, the design catalogue |
| [docs/3d-assets.md](docs/3d-assets.md) | model and texture pipelines, file conventions, `models:seed` | `scripts/` pipelines, `public/models/`, GLB uploads, manifests |
| [docs/design-studio/overview.md](docs/design-studio/overview.md) | the eight design steps, their order, modes, state, styles, generation, versions and undo | **start here for any design-studio task** |
| [docs/design-studio/plan-board.md](docs/design-studio/plan-board.md) | walls ⇄ rooms, studio rooms, the 2D board, snapping, room moves, dimensions, plan PDF | `lib/design/walls.ts`, `drawing.ts`, `studio.ts`, `components/plan/` |
| [docs/design-studio/plan-reading.md](docs/design-studio/plan-reading.md) | plan upload, the CV parser, the Claude reader and solver, door inference | `planParser`, `aiPlan`, `planSolver`, `measure`, the upload/parse routes |
| [docs/design-studio/layout-and-matching.md](docs/design-studio/layout-and-matching.md) | archetypes, room programs, automatic layout, product matching and fit, tight passages | `catalog.ts`, `autoLayout.ts`, `matcher.ts`, `clearance.ts`, `generate` |
| [docs/design-studio/studio.md](docs/design-studio/studio.md) | the 3D studio page: trays, shelf, catalogue modal, carrying, dragging, swapping, hanging, photos | the studio page, `components/studio/`, `manipulate.ts`, carry/swap actions |
| [docs/design-studio/3d-engine.md](docs/design-studio/3d-engine.md) | `lib/design3d/` and `Viewer3D`: scene building, walls, models, lighting, the Three.js gotchas | anything that draws in 3D |
| [docs/design-studio/finishes.md](docs/design-studio/finishes.md) | floor/wall finishes, the paint brush, zones, skirting and cornices | `surfaces.ts`, `paint.ts`, `zones.ts`, `trims.ts`, the finishes tray |
| [docs/design-studio/technical-and-fittings.md](docs/design-studio/technical-and-fittings.md) | technical points and works, sockets/switches/lights, radiators, doors and windows | `technical.ts`, `electrical.ts`, `radiators.ts`, `openings.ts`, the technical step |
| [docs/ui-design-system.md](docs/ui-design-system.md) | tokens, type, corners, motion, step-flow components, full-window board steps | any visual change; `components/flow/`, `components/ui/`, `globals.css` |
| [docs/operations.md](docs/operations.md) | environment, logs, health, deploys (VPS, cPanel, Vercel), storage, mail | `lib/env.ts`, `lib/log.ts`, `lib/storage/`, `deploy/`, workflows, `next.config.mjs` |
| [docs/testing.md](docs/testing.md) | test commands, what CI runs, the coverage gate, where each area's tests are | before declaring work done; adding tests |
| [docs/roadmap.md](docs/roadmap.md) | **next tasks**: bugs found and not fixed, planned features, links to every area's known gaps | planning work, "what's next", before starting a feature |

Other files: `README.md` (user-facing setup, partly out of date), `AI_FEATURE_PLAN.md` (the
original 2D→3D research, historical — the shipped design is in the docs above).

**Example — a calculator task** (say, a new work phase or a change to per-room floor picks):
read [docs/calculator.md](docs/calculator.md) first; then [docs/budget.md](docs/budget.md) if
the summary sheet or its lines change, [docs/project-flow.md](docs/project-flow.md) if saving,
steps, locks or resuming are involved, [docs/design-studio/overview.md](docs/design-studio/overview.md)
if the studio prices the same phase (it reuses the engine through `lib/design/pricing.ts`),
[docs/data-model.md](docs/data-model.md) if a column or payload changes, and
[docs/testing.md](docs/testing.md) for the tests to run. Afterwards, update
`docs/calculator.md` (and any of those you touched) and, if something is left undone,
`docs/roadmap.md`.

## Keeping the documentation current

These rules are part of every task, not a separate chore.

1. **Read before you change.** Read the topic documents for the area (the index above) before
   editing code there, and trust the code over the document when they disagree — then fix the
   document.
2. **Update in the same task.** When a change alters behaviour, architecture, an interface, a
   business rule, a data shape or a documented workflow, update the matching topic document in
   the same commit. If it touches several areas, update each area's document.
3. **Record big changes and next tasks in the docs, not in chat.** A significant change (a new
   feature, a reworked flow, a new rule or pitfall) is written into its topic document as the
   current behaviour. Work that is left unfinished, planned next, or a bug found and not fixed
   goes into [docs/roadmap.md](docs/roadmap.md) (one line, linked) with its detail in the topic
   document's "Known gaps"; remove both when the work is done. Small changes that do not affect
   anything documented need no documentation edit.
4. **New major feature → new document.** Add a topic document under `docs/` (or
   `docs/design-studio/` for the studio), with purpose, key files, flow, rules, tests and known
   gaps, and add a row to the index above.
5. **Keep links and paths true.** When files move or are renamed, update every document that
   names them (search `docs/` and this file for the old path).
6. **Describe the current implementation.** Keep the reasons and the pitfalls that explain *why*
   the code is the way it is, but no dated change logs — git has the history.
7. **Verify, don't assume.** Check a claim against the source before writing it; when you find a
   stale statement while working, correct it. Mark anything you could not verify as such.
8. **Keep this file short.** Detail belongs in the topic documents; this file holds the overview,
   the commands, the global rules and the index.
