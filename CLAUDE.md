# CLAUDE.md — RenovationRoom (რემონტი.ge / RenovateGE)

Orientation file for AI-assisted sessions. Read this before touching code.
Companions: `CODEBASE.md` (deep reference), `AI_FEATURE_PLAN.md` (original 2D→3D research), `README.md` (user-facing).

---

## What this app is

Georgian-language home renovation platform. Two products share one engine:

1. **Renovation calculator** (built, working) — pick home state → enter rooms → auto-computed
   materials + labor estimate → pick real products from partner stores → cost summary.
2. **Design Studio** (`/design`) — one guided, eight-step journey: upload a 2D plan (or start
   blank) → draw and check the existing house on a CAD-like board (walls as lines, doors,
   windows, columns, beams) → mark the technical setup (water, sewer, panel, heating, AC
   and the works needed) → a five-question style test → a **Three.js 3D model** furnished
   with **real, purchasable products from partner stores** in a game-like build mode (bottom
   category bar, trays, lock/unlock, undo, versions, tutorial) → sockets and lighting after
   the furniture → materials on whole rooms, single walls or floor zones → the budget
   (materials + products + labour, every line with a quantity) → the team of workers.
   Hover any object → store, price, link.

The differentiator: other home-design apps show generic furniture. Here every object in the
3D scene is a real SKU with a price and a shop you can buy it from.

Tagline: გეგმე. გამოთვალე. გააკეთე. (Plan. Calculate. Build.)

App is **not yet shipped**. No git repo in this directory.

---

## Stack

- Next.js 16 App Router (Turbopack), TypeScript **strict**, React 19
- MySQL 8 + Drizzle ORM (`drizzle-kit`), pnpm 9
- Tailwind 3 + shadcn/ui-style components (Radix primitives), lucide-react
- Zustand + `persist` (localStorage) for calculator/design state — **three stores**: the
  calculator (`renovate-calculator`), its own drawing board (`renovate-calculator-plan`) and
  the studio (`renovate-design`); see "Two products, two boards"
- React Hook Form + Zod
- NextAuth v5 beta (Credentials + optional Google), JWT sessions, role `'user' | 'admin'`
- **three / @react-three/fiber 9 / @react-three/drei 10** for the 3D studio
- i18n: `ka` (primary), `en`, `ru` — every string lives in `lib/i18n/*.ts`
- Uploads → `public/uploads/*` via `/api/upload`
- Deploy target: Vercel (from September 2026). The VPS (PM2 + Nginx, port 3000) and cPanel
  scripts under `deploy/` remain and are what `output: 'standalone'` is for.

## Commands

> **Never run `pnpm build` while `pnpm dev` is running, and never `rm -rf .next`.**
> They share `.next`. Building over a live dev server, or deleting the directory under it,
> leaves it serving static files but 404-ing every page — with no error in the terminal to
> explain why. Stop the dev server first; restart it to recover.

```bash
pnpm dev            # next dev on :3000
pnpm build          # production build
pnpm type-check     # tsc --noEmit — run this before declaring work done
pnpm lint           # eslint . (flat config in eslint.config.mjs; `next lint` is gone in Next 16)
pnpm db:push        # push schema.ts to MySQL (no migration files in use)
pnpm db:seed        # seed categories, stores, products, workers, admin
pnpm db:seed:design # seed partner stores + the design categories (no furniture — see models:seed)
pnpm db:studio      # drizzle studio
pnpm test:parser    # synthetic floor plans through the parser — run after touching planParser
pnpm test:solver    # dimension labels + the plan solver, no API key needed
pnpm plan:diagnose <plan.png>   # stage-by-stage report on one real plan (CV path)
pnpm plan:ai <plan.png> [--save r.json]   # the Claude path on one plan; --replay r.json needs no key
pnpm assets:extract # re-extract renders/textures from the partner 3D asset drop
pnpm models:convert # partner OBJ exports → textured, compressed, validated GLBs + manifest.json
pnpm models:convert --only=woody-bed,node-sofa   # redo a few; merges into the manifest
pnpm models:stock   # CC0 stock furniture (Poly Haven + Kenney) → public/models/stock + manifest.json
pnpm models:stock --inspect --only=ph-sofa_02   # measure and report, write nothing
pnpm models:fixtures # the fittings (sockets, switches, lamps) and the doors and windows → public/models/fixtures
pnpm models:radiators # the four central-heating radiators, one SECTION each → public/models/radiators
pnpm models:photos  # render a product photo of each of those from its model (Playwright's Chromium)
pnpm models:colors  # read every furniture model's colours off its triangles into the manifests (--force to redo)
pnpm models:seed    # one product per model in the three manifests; deletes every other placeable product (the cPanel deploy runs the same, bundled)
pnpm deploy:bundle-seed  # that seed as one plain-node file beside the standalone server (the cPanel workflow does this)
pnpm textures:stock # floor/wall finish textures (partner drop + Poly Haven + ambientCG) → surface products
pnpm db:seed:rates  # create the `rates` table and fill in the calculator's default rate book
pnpm db:seed:workers # city, experience, portfolio and reviews for the seeded workers; recomputes their ratings
pnpm db:seed:partners # a portal login per active store and worker (PARTNER_PASSWORD or generated, printed once); creates the platform_settings row
pnpm db:migrate     # apply pending migrations from lib/db/migrations (what deploys run)
pnpm db:migrate:baseline  # once, on a DB created with db:push before migrations existed
pnpm db:indexes     # idempotent secondary indexes (stopgap where push is not an option)
pnpm test           # vitest: calculator, pricing, matcher, API helpers, both save routes
pnpm test:coverage  # same with the coverage gate CI enforces
pnpm test:e2e       # Playwright flows against :3000 (needs the DB; not in CI)
pnpm uploads:cleanup  # delete plan uploads no project references (--dry-run to preview)
pnpm db:backfill-translations  # en/ru names for rows that only have Georgian ones
pnpm pdf:worker     # re-copy pdf.js's worker into public/vendor after upgrading pdfjs-dist
NEXT_DIST_DIR=.next-build pnpm build  # production build beside a live dev server
```

`drizzle-kit push` is interactive and will hang in a non-interactive shell; for a scripted
migration apply the DDL with `mysql` directly.

Admin login after seed: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env.local` (default email `admin@remonti.ge`; when no password is set the seed generates one and prints it once).

---

## Directory map

```
app/
  (auth)/login, register, register/store, register/worker   ⟵ partners register themselves
  (main)/
    page.tsx                       landing
    calculator/                    step 1 (the way in: upload or draw, and the home state)
      plan/ materials/ catalog/ placement/ furniture/ summary/     steps 2–7 (plan = the board, catalog = the cart, placement = where the finishes go)
    design/                        ⟵ Design Studio, eight steps (DesignSteps / lib/design/steps)
      page.tsx                     1 plan: upload / blank sheet / calculator rooms, wall defaults, mode
      plan/                        2 the existing house on the 2D board (walls, doors, windows, columns, beams)
      technical/                   3 technical points + works checklist + suggestions
      style/                       4 style test (StyleQuiz) or a direct pick, budget, generate
      studio/                      5 the 3D studio (build mode); 6 = the same page with ?tool=finishes
      summary/                     7 the budget: materials + products + labour, quantities per line
      workers/                     8 the trades the budget needs, and the brigades that cover them
    catalog/[slug]  teams/  teams/[slug]  about/  contact/  profile/  privacy/  terms/
    workers/                       switched off for now (lib/features.ts) — the proxy sends it to /teams
  admin/                           dashboard + CRUD (products, categories, stores, workers, orders, users)
  api/
    products/ categories/ stores/ projects/ projects/[id] (GET, DELETE) workers/ upload/ calculator/materials
    auth/register-partner/         a store or worker registering themselves (pending until admin approves)
    stores/[id]/approval  workers/[id]/approval   admin's verdict on a self-registered partner
    design/
      catalog/                     the whole design catalogue in one response (client-side matching)
      projects/                    save / list design projects (`draft: true` = autosave)
      renders/ renders/[id]        studio photos and the realistic renders queued from them
      upload-plan/                 floor-plan image upload (open to visitors, not admin-only)
      parse-plan/                  reads an uploaded plan with Claude; 503 + fallback:'cv' without a key
  partner/products/new, products/[id]   a store adds and edits its own products
components/
  ui/          button card input select dialog accordion badge label skeleton textarea tabs scroll-row (a line that scrolls without a bar, fading where it goes on)
  layout/      Header Footer AdminSidebar LanguageSwitcher UserMenu
  calculator/  StepIndicator HomeStateSelector RoomForm RoomList MaterialsTable SummaryCard CalculatorAutosave
  plan/        PlanEditor (the 2D board, canvas) · PlanWorkspace (editor + toolbar wired to the store)
               PlanToolbar (Sims-style tool tiles, thickness, kinds, layers) · ElementInspector
               RoomsPanel · draw.ts (canvas routines) · palette.ts (room tints, origin and system colours)
               icons.ts (one icon per technical system and electrical kind)
  studio/      BuildBar (CategoryRail on the left + Tray along the bottom) · FurnitureTray (rooms → kinds, colours) · CatalogBrowser (the whole
               catalogue as a modal: search, filters, details, "place" folds it to a chip) · archetypeIcons (a room and a kind each)
               Trays (build / electric / finishes / budget) · FixturePanel (a fitting's card) · OpeningPanel (a door
               or window's card) · dragImage
               StudioTopBar · TutorialOverlay (spotlight tour) · NavHelp · VersionsPanel
  flow/        StepStrip StepHeader StepNav SideList EmptyStep StageBrief (what / why / need / change / next)
  budget/      BudgetSheet (the one sheet both summaries and the saved project are read on: shop
               cards with a select-all box, a tick and a quantity per line, leftovers by kind) · lineName
  design/      DesignSteps PlanUploadCard StylePicker StyleQuiz GenerationOverlay Viewer3D ItemCard SwapPanel
               FinishPanel StudioControls FloatingPanel HoverCard PhotoDialog DesignAutosave WalkControls
  auth/        AuthForm PartnerRegisterForm
  partner/     PartnerSidebar WorkerServiceFields WorkerSelfForm
  admin/       ProductForm (also used by the partner portal) StoreForm WorkerForm PartnerApproval ModelUploader …
  catalog/     ProductCard ProductGrid CatalogSidebar ProductModelDrawer
  projects/    OpenIn3dButton CalculateCostsButton ProjectDetail ProjectRenders DeleteProjectButton PlanSketch
  workers/ legal/ contact/ providers/ orders/ checkout/
lib/
  calculator/  constants.ts (rates) · materials.ts (pure engine) · quantities.ts (selection keys) · layout.ts
               (layout editor snapping) · saveProject.ts (client) · types.ts
  design/      types.ts · styles.ts · steps.ts (the order the eight steps are walked in) ·
               existing.ts (what the flat already has) · planPdfExport.ts (the plan as a PDF)
               catalog.ts (archetypes + room programs + the shelf's rooms) · colors.ts (colour families) · planParser.ts
               planGeometry.ts · planImage.ts (browser) · planPdf.ts (browser) · autoLayout.ts · matcher.ts
               pricing.ts (budget lines) · openings.ts · manipulate.ts · clearance.ts · surfaces.ts · fromCalculator.ts
               catalogBrowser.ts (the catalogue modal's search, filters, counts and sort — pure)
               walls.ts (walls ⇄ rooms) · drawing.ts (snapping, hit tests) · technical.ts · electrical.ts
               styleQuiz.ts · zones.ts (per-wall and floor-zone finishes) · history.ts (undo) · trades.ts
               technicalRates.ts (estimates) · saveDesign.ts (client) · aiPlan.ts · planSolver.ts · measure.ts
  design3d/    materials.ts · primitives.ts · buildScene.ts · buildStructure.ts (free walls, columns, beams,
               fittings, zones, lights) · modelLoader.ts (GLB cache, furniture and fixtures) · fixtureManifest.ts
               (generated) · outline.ts · daylight.ts · modelPreview.ts
  db/          schema.ts · index.ts (mysql2 pool + drizzle) · migrations/
  summary/     calculatorSheet.ts (the calculator's estimate as `BudgetLine`s, edits laid over) ·
               quantity.ts (what the quantity dropdown offers)
  features.ts  parts of the site that exist and are switched off (the workers' directory)
  i18n/        ka.ts (primary) en.ts ru.ts client.tsx server.ts labels.ts index.ts
  validations/ zod schemas per entity (partner.schema.ts = self-registration + worker self-edit)
  utils.ts     cn() formatGEL() formatM2() formatUnit() slugify()
store/         calculatorStore.ts · designStore.ts
hooks/         useProducts · useCategories · useCalculator · useWorkers · useDesignCatalog · useAutosave
               usePickStores (who sells the calculator's picks, for its summary)
scripts/       seed.ts · seed-design.ts · convert-models.ts · stock-models.ts · fixture-models.ts · model-photos.ts · seed-models.ts
               lib/objGroups.ts · lib/textureClassify.ts · extract-assets.sh · test-plan-*.ts
public/
  uploads/products/  uploads/furniture/  uploads/stores/  uploads/plans/  uploads/renders/
  textures/  models/ (partner, stock, fixtures)  samples/plan-2br.png  vendor/pdf.worker.min.mjs (pdf.js, same-origin for the CSP)
```

---

## Data model (`lib/db/schema.ts`)

| Table | Notes |
|---|---|
| `users` | id, name, email (unique), passwordHash, role enum |
| `categories` | nameKa/nameEn, slug, icon, `phase` (1–18 renovation phase, 20 = furniture), `calculationType` enum, isVisible, `isFurniture`, sortOrder |
| `stores` | nameKa (**unique**), `descriptionKa`, logoUrl, websiteUrl, phone, address, `city`, `rating`, `reviewCount`, `deliveryDays`, `deliveryFeeGel`, commissionRate, **`approvalStatus`** (`pending` / `approved` / `rejected` — self-registered stores start pending and inactive), isActive |
| `products` | categoryId, storeId, nameKa, slug, sku, pricePerUnit (decimal-as-string), unit enum, coveragePerUnit, brand, imageUrl, `images` json, `specs` json, `tags` json, **`styleTags` json**, **`model3dKind`**, **`model3dUrl`**, **`textureUrl`**, **`colorHex`**, **`widthCm`/`depthCm`/`heightCm`**, isActive, isFeatured |
| `teams` | a brigade: nameKa, slug (**unique**), `leadName`, phone, email, city, rating, `markupPct` (its own fee over the trades' rates), `commissionRate`, `capacityJobs`, isVerified, `approvalStatus`, isActive — the trades it covers come from `team_members` |
| `team_members` | teamId (cascade), workerId (cascade), `isLead` (the foreman), sortOrder |
| `workers` | nameKa, specialty, specialtySlug, phone, pricePerM2/pricePerUnit, priceUnit, rating, bio, `city`, `experienceYears`, `completedJobs`, isVerified, **`approvalStatus`** (as for stores) |
| `worker_reviews` | workerId (cascade), authorName, rating 1–5, textKa/En/Ru, jobKa/En/Ru — `workers.rating`/`reviewCount` are the aggregates |
| `worker_works` | workerId (cascade), titleKa/En/Ru, descriptionKa/En/Ru, imageUrl, areaM2, city, year, sortOrder — the portfolio |
| `projects` | userId (nullable → guest), sessionId, nameKa, homeState, totalM2, `rooms` json, `selectedProducts` json, `selectedFurniture` json, **`calculatorEdits` json** (`{ excluded, quantities }` by line key — what was ticked off the calculator's summary and the quantities changed on it; migration 0009), cost columns (as edited), status (`draft` = autosaved or guest / `saved` = confirmed with the save button / `submitted` = ordered), **`mode`**, **`styleId`**, **`budgetGel`**, **`floorPlanUrl`**, **`plan` json** (rooms + `walls`, `columns`, `beams`, `technical`), **`scene` json** (items, finishes incl. per-wall and zones, `electrical`, `styleProfile`), **`versions` json** (`DesignVersion[]`, migration 0006) |
| `project_renders` | projectId (cascade), userId, `sourceUrl` (the studio's own screenshot, stored at once), `renderUrl` (filled when the realistic render exists), status `queued` → `processing` → `ready` / `failed`, `roomName`, `camera` json |
| `platform_settings` | one row: `calculatorFeePerM2`, `designFeePerM2`, `storeCommissionPct`, `workerCommissionPct` — edited at `/admin/settings` |
| `checkouts` | a customer ordering a project: projectId, userId, kind `calculator` / `design`, totalM2, feePerM2, `platformFee`, goodsTotal, commissionTotal, customer name/phone/email, note |
| `orders` | what one partner fulfils: checkoutId, projectId, `partnerType` store / worker / team, storeId / workerId / teamId, `staffNote` (the agent's own, never shown to the customer or the partner), status `new` → `confirmed` → `in_progress` → `done` (or `cancelled`), subtotal, deliveryFee, `commissionPct` (frozen at creation), `commissionAmount`, customer contact, `customerNote`, `partnerMessage`, `viewedAt` |
| `order_items` | orderId (cascade), productId (nullable), name snapshots, categorySlug (`labour:<key>` for labour lines), roomName, unit, qty, unitPrice, total, `removed`, note |

`users.role` is `user` / `admin` / `agent_orders` / `agent_catalog` / `store` / `worker` / `team`; a partner role carries `storeId`, `workerId` or `teamId` (see "Who works the platform"). `stores`, `workers` and `teams` have `email` (order notifications) and `commissionRate` (null = platform default).

A design project is distinguished from a calculator project by `plan IS NOT NULL`.

Decimals are stored and read as **strings** (Drizzle mysql `decimal`). Always `Number(...)` before math and `String(...)` before insert.

**Calculator selection keys** (`selectedProducts`): `<slug>_global` is a product chosen for the
whole flat, `<slug>_room:<roomId>` one chosen for a single room (floor and wall finishes only).
`lib/calculator/quantities.ts` owns the format — `selectionKey`, `categorySlugFromKey`,
`roomIdFromKey` — and a per-room snapshot also carries `roomId` so the summaries, the order
lines and the studio can name the room. Never build or parse these strings by hand.

**One sheet for both summaries** (`lib/summary/`, `components/budget/BudgetSheet.tsx`). The
calculator's last step and the design's budget are the same thing to the person reading
them — what it all comes to, and what of it they are taking — so they are the same sheet:
`BudgetLine[]` (`lib/design/pricing`), rendered by `BudgetSheet`. The design's lines come from
`priceScene`; the calculator's from `calculatorSheet(summary, picks, { rooms, edits, storeOf })`,
which lays the engine's materials and labour and the person's picks out in that shape (a pick
the calculator never recorded a shop for asks `usePickStores` → `GET /api/products?ids=…` +
`/api/stores`; on the server `loadProjectSheets` asks the database).

- **Shown once, under whoever sells it.** Everything a shop sells stands in that shop's card —
  that is who is asked for it and what its delivery is charged on — with the ticks, the
  quantities and a box at the head that takes the whole shop in or out. What nobody sells (bulk
  materials, labour, estimates for things not chosen yet, picks without a shop) stays under its
  kind. The first version listed products twice, by kind with the ticks and again by shop
  without them. Shops stand in the order they first appear on the sheet, never by subtotal,
  which would reshuffle the page at every tick.
- **Every line has a key, not only the products** (`tickFor` in `lib/design/ticks`):
  `item:`, `kitchen:`, `finish:`, `opening:`, `opening-estimate:`, `fixture:`, `radiator:`,
  `estimate:`, `material:`, `labour:`, and for the calculator `pick:<selection key>` and
  `furniture:<room>:<product>:<n>` (the n-th copy, because the same bed can be picked twice for
  one room). Only delivery has none: it is not chosen, it follows from what the shops bring.
- **Two kinds of edit hang on the key**: a tick (`excluded`) and a quantity (`quantities`). The
  quantity is a *choice*, not a free field — the pencil opens a list around the figure that was
  worked out (`quantityOptions`: counted things 1, 2, 3…, measured things −50 % … +50 % in
  fives, the original marked) — because a typed "300" where "30.0" was meant is an order
  somebody has to unpick with a shop. Choosing the original again lets go of the edit.
- **The original never leaves the sheet.** `withEdits` is applied in one pass after every
  section has said what it works the line out to be: a ticked-off line stays where it stood,
  struck through; a changed quantity carries `originalQty` and shows it beside the new one; the
  totals card says what was worked out, what the changes came to (it can be *more* — three
  sofas), and the way back (`clearBudgetEdits` / `clearEdits`). Nothing about "the original" is
  stored: the row keeps the rooms, the picks, the scene and the edits (`calculatorEdits`,
  `scene.excluded`, `scene.quantities`), and both versions are priced from those whenever
  somebody looks — which is why the saved project's page (`ProjectDetail` ←
  `loadProjectSheets`) can show every edit with what was there before it.
- **The server lays the edits over its own figures, never the client's.** Both save routes
  reprice and re-quantify from the catalogue and the geometry first; the edits are keys and
  numbers applied on top (`calculatorSheet` in `POST /api/projects`, `priceScene` in the design
  save), and the cost columns are the totals *as edited*. `orderedPickLines` /
  `orderedLines` are what the checkout dialogue and the store orders are made from, so a
  changed quantity is the quantity a shop is sent. A flag on the pick itself
  (`SelectedProduct.excluded`, the first version) is still read, as the key it meant, and
  lifted into `excluded` when a stored calculator is rehydrated (`liftFlags`).
- The sheet rounds each line and adds the lines up, so what is read down the page comes to
  the figure under it; the engine rounds the sum once. They can differ by a few tetri.
- **Every product line shows its product**: the photo from the snapshot beside the name, and
  the name (with `ProductPageLink`) as the way to `/catalog/<slug>` in a new tab, where the
  real photos are. The same link stands on the selected piece's card in the studio and on
  the fitting's and the door's. A snapshot from before the slug travelled with the product
  gets the name and no link.

### Managing the catalogue

`/admin/stores` is full CRUD for partners — the fields there are exactly what the studio's
hover card and the summary's per-store basket render, so a blank address or delivery time
shows up as a blank line in the product. Deleting a store that still has products is refused
with a 409; deactivate it instead.

The product form carries a **3D design settings** section: store, style tags, `model3dKind`,
real dimensions in cm, and colour. Choosing an archetype prefills its standard dimensions.

**Only products with a `model3dUrl` are ever placed.** `matchProducts` drops everything
without one before it looks at archetype or style. There are two ways a product gets one:

- **Upload a GLB in the product form** (`components/admin/ModelUploader.tsx`). The file goes
  to `POST /api/upload/model` (admin only, bytes checked by `sniffModel`: `glTF` magic,
  container version 2, JSON first chunk; 40 MB cap) and lands under `models/` in storage
  (`/uploads/models/…` locally). The form then loads that URL with the studio's own loader
  and shows it on a turntable with a grid and an arrow for the front (+Z), reads the real
  size from the geometry to prefill width/depth/height (a file in cm or mm is recognised by
  its size and converted), counts triangles and textures, and can render a PNG of the model
  to use as the product photo when there is none. Saving a URL sets `model3dStatus = 'ready'`
  (the design catalogue only exposes ready models); clearing it sets `'none'`.
- **`pnpm models:seed`** writes one product per entry in `public/models/manifest.json` (the
  partner drop) and `public/models/stock/manifest.json` (CC0 stock, see "Stock models") and
  deletes every other manifest-managed product with a `model3dKind` — a product whose
  `model3dUrl` is not under `/models/` (an upload) is left alone. The hand-written
  115-product range that `seed-design.ts` used to carry is gone for that reason.

The studio scales every model to the product's dimensions (`fitToItem`), so a model in the
wrong units still renders at the right size; what it cannot fix is orientation — the front
of a piece has to face +Z with Y up, which is what `pnpm models:convert` produces and what
the uploader's arrow shows. The upload route also refuses a GLB that *requires* Draco or
Basis (`lib/uploads/glb.ts`): the studio's loader has neither decoder, and such a file would
upload fine and then render as nothing. Meshopt is fine.

**Models stand on y = 0, centred on x/z.** That is the converters' output and what the
wrapper (placed at the centre of the footprint, on the floor) assumes. `loadModel` shifts
every file onto that origin on a pivot above its own transform, because an uploaded GLB
comes with whatever origin its tool chose — Meshy centres on the bounding box and half the
piece sat below the floor.

**A model that fails to load is not an empty slot.** `buildPlacedItem` used to swallow the
error, so a 404 or a broken file looked exactly like "no product" — an invisible item with a
selection box around it. Now the item gets a translucent ghost box in the product's colour
and a `console.warn` naming the product and URL; a slot with no product at all still draws
nothing.

Within one room, every slot of a kind gets the same product (six matching dining chairs);
the next room gets the next-best product of the same style tier, so a flat with five
pendants hangs five different lamps. The swap panel lists every candidate for the slot,
matching style first, each with its photo.

The `model3dKind` options come from `ARCHETYPES` directly, so adding an archetype makes it
selectable without touching the admin form. A stored kind that is no longer in the registry
stays listed (marked `?`) rather than silently blanking the select and being lost on save.

### Partners register themselves; admin approves (`lib/validations/partner.schema.ts`)

`/register` carries two more doors under the ordinary form: `/register/store` and
`/register/worker`. `POST /api/auth/register-partner` creates the `stores` / `workers` row
**first** — `approvalStatus: 'pending'`, `isActive: false` — then the account with the
matching role and `storeId` / `workerId`, and signs the person in. They land in the partner
portal with a "waiting for verification" banner (`loadPartnerContext` carries
`approvalStatus`) and can already fill in products or their card.

**What "pending" hides.** A store's `isActive` is the visibility switch everywhere it was
before (store sidebar, studio's store list, workers' `isActive` for the directory). Products
of a pending store are the new case: every public product query — `/catalog`, the landing
wall, `GET /api/products`, `lib/api/designCatalog.ts`, the related products on a product
page — joins `stores` and requires `products.storeId IS NULL OR stores.isActive`, so a pending
store can add products without them showing. Do the same in any new public product query.

Admin decides on the store / worker edit page (`PartnerApproval`, `POST
/api/stores/[id]/approval` and `/api/workers/[id]/approval`): approving sets `approved` +
`isActive` (workers also become `isVerified`), rejecting keeps them off. The dashboard's
"needs attention" list and the `status=pending` filter on the admin store and worker lists
are where they surface.

**What partners may edit.** `requireCatalogEditor()` in `lib/api/route.ts` admits admin or a
linked `store` account to the product routes; a store may only write its own products
(`storeId` forced, `isFeatured`/`sortOrder` ignored), through the same `ProductForm` with a
`partner` prop (`/partner/products/new`, `/partner/products/[id]`). `requireUploader()` opens
`/api/upload` and `/api/upload/model` to linked partners. A worker edits their own card at
`/partner/profile` with `WorkerSelfForm` — the same service and price fields as registration
(`WorkerServiceFields`), sent to `PUT /api/workers/[id]` which accepts `workerSelfSchema`
from the worker themself and the full admin schema from admin; rating, verification,
commission and activation are never theirs. Admin previewing a partner with `?store=` /
`?worker=` is sent to the admin forms instead.

### Admin lists: filters, sort and paging live in the URL

Every admin list (`/admin/products`, `categories`, `stores`, `workers`, `orders`, `users`) is
a server component that reads its state from the query string through
`parseListParams` in `lib/admin/list.ts` and renders `FilterBar` (client, writes the URL)
plus `Pager` (server, links). A filtered view is therefore a URL: the dashboard's
"needs attention" items link straight to the matching filter
(`/admin/products?model=none&status=active`), and a colleague can be sent a filtered list.
Adding a filter is one `where.push(...)` in the page and one field in the `FilterBar`
config; strings live under `admin.filters` in the dictionaries. The rates table filters
client-side because every row is an editable form.

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
"archetype + model name", textures a humanised slug). Convention 1 above now applies to data
as well as UI copy: nothing user-facing is Georgian-only by construction.

### Key 3D-relevant columns

- **`products.model3dKind`** — the archetype the layout engine places the product as
  (`'sofa_3seat'`, `'bed_double'`, `'dining_table'`, …): which slot in which room program.
  See `ARCHETYPES` in `lib/design/catalog.ts`.
- **`products.model3dUrl`** — the GLB in `public/models/`, and the thing that makes a product
  placeable at all. The viewer creates the item's wrapper immediately (selection, dragging and
  the cost bar work from the first frame) and drops the mesh in when the GLB arrives. There is
  no procedural stand-in: a slot with no partner product stays empty. See "Partner models".
- **`products.textureUrl`** — tileable texture for surface products (floor, wall, tile).
- **`products.widthCm/depthCm/heightCm`** — real dimensions; drives scale and collision in layout.
- **`products.styleTags`** — `['scandinavian']`, `['industrial','modern']`, … drives style matching.

---

## The four styles

Defined once in `lib/design/styles.ts` and referenced everywhere (DB tags, 3D materials, UI):

| id | ka | Palette signature |
|---|---|---|
| `modern` | თანამედროვე | matte white/graphite, chrome, glass, large-format tile |
| `scandinavian` | სკანდინავიური | light oak, off-white plaster, wool grey, soft pastel accents |
| `industrial` | ინდუსტრიული | exposed brick, black steel, cognac leather, concrete |
| `vintage` | ვინტაჟი | walnut, brass, deep velvet, patterned rug, rattan |

Source assets for these live in `/Users/torniketsava/Downloads/3D OBJECTS WITH STYLES_DRAFT_03.03.2026`
(1.6 GB of `.rar`/`.zip` 3ds Max scenes). **macOS `tar` (bsdtar/libarchive) can read `.rar` —
no `unrar` needed.** `scripts/extract-assets.sh` pulls the usable parts out of them:
product renders → `public/uploads/furniture/`, PBR maps → `public/textures/`.
The `.max`/`.fbx` files are offline-render scenes and stay where they are; the `.obj` exports
are what `scripts/convert-models.ts` turns into the GLBs the studio places. A `_PREVIEWS/`
folder holds clean-named renders of every archive and is the quickest way to see what a
cryptically named `.rar` contains.

---

## Calculator engine (`lib/calculator/`) — pure, deterministic, UI-free

- `computeRoomAreas({width,length,height,type})` → Room with floorM2, wallM2, ceilingM2, perimeterM, isWetRoom
- `aggregateRoomTotals(rooms)` → totals incl. wet-room m², door/window counts
- `calculateMaterials(rooms, homeState, book?)` → `MaterialItem[]` from the rate book
- `calculateWorkerCosts(rooms, homeState, book?)` → labor per phase from the rate book
- `buildProjectSummary(rooms, homeState, products, furniture, book?)` → subtotals + grandTotal + 15% contingency

**The rate book is data, not code.** `MATERIAL_RATES_PER_M2` / `WORKER_RATES` in
`constants.ts` are only the defaults; the `rates` table (`pnpm db:seed:rates`, edited at
`/admin/rates`, served by `/api/calculator/rates`) is what the estimate actually uses.
`lib/calculator/rates.ts` turns rows into a `RateBook`; `useRateBook()` fetches it once per
page load and hands back the defaults until the server answers, so an unseeded table is not
an error. Material lines can be added in admin (new key, phase, basis, quantity per m²);
labour lines are fixed keys the engine knows and can only be repriced or switched off.
**A default key the table has never heard of still counts, at its shipped rate** — a line the
app gained after a database was seeded (the phase 0 strip-out was the first) would otherwise
price at nothing until someone ran the seed; a row that exists but is switched off stays off,
and an empty table is still simply the defaults (`rateBookFromRows`).

Home states gate phases: `old_renovation` = 0–18, `black_frame` = 1–18, `white_frame` = 9–17,
`green_frame` = 17 only — offered in that order, the most work first (`HOME_STATE_VALUES` in
`lib/calculator/types.ts` feeds the Zod enums and the admin filter; the MySQL enum is migration
0007). **Phase 0 is the strip-out of an old renovation** (`ძველი რემონტი`): labour lines
`strip_floor`, `strip_walls`, `strip_ceiling` (per m² of each), `strip_tiles` (wet floor × 1.5,
the tiler's convention), `remove_doors_windows` (doors + windows), `remove_sanitary` (one per
wet room) and `debris_removal`, plus the materials `debris_bags` and `waste_container`; phase 1's
`demolition` stays what it was. In the studio it is the work `strip_out` and the first stage of
the works checklist (`WORK_STAGES`), so unticking it takes phase 0 out of the estimate.
Wet rooms = bathroom, toilet, kitchen. **The Design Studio reuses this engine unchanged** —
it only feeds it rooms that came from a parsed floor plan instead of a manual form.

---

## Design Studio pipeline (`lib/design/` + `lib/design3d/`)

```
upload image (browser)
  → planImage.ts         File → RGBA at ≤1100 px (the only part that touches window/canvas)
  → planParser.ts        deskew → adaptive/Otsu threshold → despeckle → distance transform
                         → threshold-descent watershed → marching-squares outlines   (~90 ms)
  → /design/plan         confirm scale, room types, sizes; add or delete rooms
  → planGeometry.ts      polygons → wall edges, inward normals, doors, windows
  → autoLayout.ts        room program + placement rules → placed furniture, collision-checked
  → matcher.ts           each slot ← a real product, scored on style tag + budget tier (client-side)
  → buildScene.ts        rooms + placements → THREE.Group (walls and floors from the plan; every object a GLB)
  → Viewer3D             orbit or walk; hover shows store + price; drag/rotate/swap furniture
  → manipulate.ts        snapping, collision and walkability for everything the user moves
  → pricing.ts           scene → cost breakdown grouped by partner store
```

### Two products, two boards (`store/designStore.ts`, `hooks/useCalculatorPlan.ts`)

The design store is a **factory over its localStorage key**, and there are two instances of
it: `useDesignStore` for the studio and `useCalculatorPlanStore` for the calculator's first
step. They shared one plan and one key before, so starting a flat in either product found
the other one waiting — the single most confusing thing about the two sharing an engine.
`PlanWorkspace` takes a `store` prop (the studio's by default) and the calculator hands in
its own; `useCalculatorPlan` reconciles the *calculator's* board with the calculator's
rooms. A drawing crosses between the two only when the person asks: the calculator
summary's "see it in 3D" passes its board to `startFromCalculator`, and
`CalculateCostsButton` opens a saved plan on both boards. `StoreOwnerGuard` wipes all three
stores when the owner changes, and `DeleteProjectButton` forgets the id on both boards.

### The order of the eight steps depends on the home (`lib/design/steps.ts`)

A green frame — or a design-only project — is a home that is finished: its technical step
*records* what is already there, so it stays third, right after the flat is drawn. Every
other condition is a renovation, where the pipes, radiators and wiring follow the furniture:
there the technical step comes **after** the design, sixth, next to the budget it feeds.
The step *numbers* never change (3 is always the technical step); what changes is the
position it is walked in. `designStepOrder` / `designStepPosition` / `nextStep` /
`previousStep` own it, `DesignSteps` renders the strip from it, and every page's `StepNav`
and `StepHeader` read their position and their neighbours from it rather than hard-coding a
number. `StageBrief` keys on the step, not the position.

### What the flat already has (`lib/design/existing.ts`)

A green frame is floored, painted, tiled and wired, and pricing it from the scene charged
for all of it — the scene describes the whole flat and cannot know what was already
standing. So the technical step asks, with ten ticks (`EXISTING_KEYS`: floor, wall, ceiling,
trim, openings, electrical, lighting, plumbing, heating, climate) stored on the plan as
`plan.technical.existing`. A green frame starts with everything ticked (that is what a green
frame means), everything else with nothing. `priceScene` leaves each ticked one out of the
lines, the baskets and the totals; the checklist shows for any `mode: 'full'` project,
because the person always knows better than the phase defaults.

### Walls are lines; rooms are what they enclose (`lib/design/walls.ts`)

The plan's source of truth is `plan.walls`: centreline segments with a thickness (10 / 12 /
15 / 20 / 25 cm offered, any value stored), an optional height and material, and an
`origin` (`existing` / `user` / `generated`). `roomsFromWalls` splits the walls at every
junction (crossings, T-junctions, ends that stop a hair short — `NODE_TOL_M`), prunes dead
ends, traces the faces of the planar graph (at each junction take the first edge clockwise
from the one arrived along; faces with positive area are rooms) and offsets each face
inwards by half of each wall's thickness — so a room's `polygon` is still the inner floor
every downstream module already understands, and `room.wallIds` says which wall each edge
lies on. Rooms keep their identity across edits: a re-derived face takes over the previous
room whose centroid it contains (ids, names, types, heights, doors re-projected by world
position). `wallsFromRooms` goes the other way for plans that arrive as polygons (the
parser, Claude, the calculator, old saves): facing edges of neighbours merge into one wall
as thick as the gap between them, exterior edges get the default thickness outside, and
vertices are moved onto the crossings of the centrelines so the graph is watertight.
**A wall runs from junction to junction and no further** (`splitAtJunctions`). A plan built
from polygons is one wall per line of the flat, so the partition between four rooms came back
as a single wall: selecting it selected all of it and dragging it moved every room along it.
Every wall is cut where another meets it — in `wallsFromRooms`, in `rebuildRooms` after every
edit, and in `ensureWalls`, so a plan drawn before the rule existed is put right on load.

**Walls never fuse into each other.** Every collinear wall that touched used to be unioned,
so a room drawn against its neighbours dissolved into them — four walls became one
eleven-metre wall running under three rooms, and from then on there was no such thing as
*this room's* wall. `addWalls` now only drops the stretches a wall of the same thickness
already covers (drawing over one twice); everything else is added as drawn. `innerPolygon`
therefore merges a *run* of equally thick walls into one room edge — one side of a room is
routinely two walls end to end, its neighbour's and then its own, and treating that as two
edges gave the room a phantom vertex, an extra wall index and a finish that stopped halfway
along a flat wall.

**Rooms that share a wall are one body, and nothing is ever pulled apart** (`roomCluster`).
For a while a room could be dragged away from its neighbour — the wall between them was
*split*, the original staying and a copy leaving — and every version of that came back broken:
a room with a side missing, a stub left on the neighbour, and, pushed back, two walls six
centimetres apart on what had been one line, which the wall graph cuts into slivers and jogs.
Nobody needed it (a flat is moved as a flat), so it is gone: a drag takes the closure of the
grabbed rooms under "has a wall in common", and **Ctrl+Z is the way back** from a room pushed
up against the wrong neighbour. `wallsForMove(plan, roomIds)` is what travels, worked out once
when the drag begins: the cluster's walls, the partitions and stubs standing inside those
rooms, and any free wall hanging off them (a half-drawn room on the side of the flat goes with
the flat) unless it also touches a room that stays. `moveRooms` shifts those, the columns and
beams standing in the moved rooms, and hands the previous rooms to `rebuildRooms` already
shifted so identity survives; the store's `moveRooms` takes the furniture, fittings, technical
points and painted zones of the whole cluster along, to the millimetre like the walls.

**Pushed together means one wall between them.** Where a travelling wall lands on the line of
a wall that stayed, the stretch the two have in common is kept once — the wall that was there
stands for both, *whatever its thickness* (`uncoveredPieces(…, anyThickness)`; a wall being
*drawn* still only gives way to one of its own thickness) — and the traveller keeps what
sticks out past it. That shared wall is also what makes them one body from then on. What two
parallel walls may never do is stand half inside each other (`wallsClash`: off each other's
line, closer than their bodies plus `WALL_CLEARANCE_M`, overlapping along their length); the
board snaps so that it does not happen by accident and refuses the drop when it would happen
anyway — a room pushed into a gap a hand too narrow for it.

**Which walls are a room's is asked of the geometry, not of `wallIds`.** `room.wallIds` names
one wall per *edge*, and walls are cut at every junction — so a side that a neighbour covers
only half of is two walls, and only the first is named. `wallsBoundingRoom(walls, room)` sweeps
every wall and keeps the ones running parallel to an edge, half a thickness outside it,
overlapping it along its length — all of them, however the side was cut. The cluster, the move
and the store's `removeRoom` all ask it (deleting a room used to leave the unnamed half of a
side standing as a stub). `orphanWallSegments` has the mirror-image rule: a wall piece is
measured against a room side's *line*, because a side is routinely longer than the piece
behind it — measured to the piece, every such piece read as free-standing and the 3D view stood
a second wall inside the room's own.

`ensureWalls` is what `setPlan` and `openSaved` call. Every wall edit in the store —
`addWall`, `offsetWall` (sideways along `wallNormal`, connected walls follow),
`moveWallNode`, `resizeWall` (a typed length; the far end and whatever meets it follow),
`removeWall`, `updateWall` — ends in `rebuildRooms`, which
also re-homes furniture whose room merged away and re-projects the electrical points.
`orphanWallSegments` are the pieces of wall that bound no room; the 3D view draws them as
free-standing walls. Tested in `tests/unit/design/walls.test.ts`; touching rooms from an
old calculator layout lose half a thickness on the shared wall, by design.

### The 2D board (`components/plan/PlanEditor.tsx`)

One canvas, one tool in hand: `select`, `pan`, `wall` — **one tile with two shapes, a line
and a square** (`room` is the square: a rectangle whose inside is exactly what was drawn,
four walls around it), `door` / `window` (dropped on the nearest room edge, the usual twin
logic), `column`, `beam`, `technical`, `electrical`, `zone`. The toolbar and the studio's
build tray both leave `room` out of the tile row and offer it as the wall tool's shape.
`lib/design/drawing.ts` does the snapping — junction, then a point on a wall, then the axis
lock, then alignment with any junction's x or z, then the 5 cm grid (1 cm with Shift) — and
reports the guides the board draws. The select tool drags a wall sideways, its ends as
handles, a door along or onto another wall, columns and points freely, and furniture
footprints with `snapPlacement`; Delete removes the selection.

**Rooms may not lie on top of each other**, drawn (`roomUnderRect`) or dragged
(`polygonsOverlap`, which is an edge-crossing test because a room is not always convex, and
which pulls both outlines in by a hair so two sharing a wall do not count). The wall graph
traces a crossing as a face, so a room dropped on its neighbour came back as slivers with
walls through the middle of them and nothing could be pulled apart again; the preview turns
red and the drop is refused with its own message.

**Rooms are selected like folders on a desktop**: click one, shift-click to add or take out,
or drag a rubber band across empty sheet (panning is still space, the middle button, the hand
tool, and W/A/S/D or the arrows — matched on `event.code`, like the 3D view). The group then drags bodily through `moveRooms`, with a live plate saying how
far it has travelled — and every room joined to it comes too (the ghost shows all of them and
their walls; the *selection* stays what was clicked, so Delete does not take the flat with the
room). **A dragged room snaps wall to wall** (`snapRoomMove`): each axis looks for a wall of the
travellers and a parallel wall staying behind whose centrelines the move would bring close, and
closes the distance exactly. A wall that would run *alongside* wins over one that continues it
end to end, which wins over one merely in line across the sheet; the nearest within a kind; a
wall alongside is in reach for as long as the two bodies would overlap, however far the view is
zoomed in. Each snap draws the full-sheet line the two walls now share (and the neighbour's
wall, when it is one) — the "lines room to room" that say what it is squaring up with. A drop
that would still leave a wall half inside another turns the ghost red and is refused with the
same message as a room over a room; both boards show it (the calculator's had no banner, so a
refusal there looked like a drag that had not worked). Delete takes the whole
selection. **Every gesture that changes a size carries its ruler**: the wall being drawn,
the rectangle being pulled out, a wall dragged sideways (with its offset), a wall stretched
by an end, and the selected or hovered wall — and a wall's length is an input in the
inspector (`resizeWall`), not just a figure. `locked` keeps the structure
pickable but immovable. The editor owns only pan/zoom (wheel zooms about the pointer, Space
or the middle button pans; the view refits on resize until the person moves it) and the
gesture in progress — everything else is the store's, through callbacks. `PlanWorkspace`
wires it to the store with the toolbar and the hint line; the design flow's steps 2 and 3,
the studio's 2D view and the calculator's first step (`useCalculatorPlan` keeps the
calculator's `rooms` read off the plan) all use it. The transform is exposed on the canvas
as `data-scale` / `data-offset-x/y` for tests.

**The board carries too.** A tile clicked or dragged off the studio's shelf goes on the
pointer on the 2D board exactly as in 3D (`PlanEditor.carryingItemId`, wired by
`PlanWorkspace` from the store): the footprint follows the pointer from room to room, dashed
green where it fits and red where it does not, a click sets it down (`onMoveItem`, then
`onCarryPlaced` → `finishCarry`), R turns it (`PlanEditorApi.carryPose`), and Escape is the
page's `cancelCarry`. It used to be stood in the room by itself wherever the layout found a
spot, which read as the shelf placing furniture on its own. Only the walk-through gives a
carry up, since it has no pointer to carry on. **Escape puts every tool down**: the studio's
Escape disarms a fitting or a technical point whatever the view, and the board hands the rest
on through `PlanEditor.onEscape`, which fires only when the board had nothing of its own to
end — a wall or beam run in progress is ended by the first Escape, and the second one drops
the tool (`putToolsDown` in the studio: the build tool back to select, the brush put down).

**Shift drags a wall alone** (`offsetWallAlone`, `moveWallEnd`). A wall dragged sideways
takes the walls that meet it along (`offsetWall`), and a junction dragged takes every wall
end on it (`moveNode`) — so a wall could not be shortened without its corner, and the whole
room, coming with it. With Shift held at the drop the board asks for the wall alone: the
sideways drag moves only that wall (`onOffsetWall(id, distance, alone)`), the handle drag
only that wall's end (`onMoveNode(from, to, onlyWallId)`), and whatever met it stays where it
was. The corners come apart on purpose; the room they closed is open until the wall is put
back or the neighbours are dragged after it, and Ctrl+Z is the way back. Shift also keeps
its old meanings (the 1 cm grid, the free angle) — it is the board's "precisely, and only
this" key.

**Walls line up across the sheet** (`snapRectangle`, `snapWallOffset`). A rectangle being
drawn and a wall being dragged sideways both pull onto the line of a parallel wall they come
close to — a wall alongside first, then one continuing them end to end, then one merely in
line somewhere else on the sheet — and draw the line the two now share right across the
sheet (`align` guide), the way a dragged room does. That is how two rooms one above the
other get walls on one line and the same width: both sides of the new rectangle land on the
lines of the room above. A dragged wall does not snap onto a wall that runs *alongside* it
(that would stand one wall inside another; the drop refuses it), and Shift's "alone" drag
snaps like any other.

**Corners close on the board** (`wallEndExtensions`). A wall is drawn as a stroked
centreline with butt ends, and two such strokes meeting at an L-corner each stopped at the
node — a square of half a thickness a side was left empty at the outer corner and a hairline
of paper ran between the inner faces. Now every end at which another wall meets at an angle
runs on by half of *that* wall's thickness (to its far face at a corner, harmlessly inside
it at a T); walls in line butt against each other; a free end stays put. The PDF draws the
same.

**The flat's sizes stand outside the plan** (`outerDimensionChains`, `drawOuterDimensions`,
under the `dimensions` layer). Every exterior wall — one with a room on one side and nothing
on the other — contributes its ends to the chain on the side it faces, so a side reads
"3.12 · 5.31" wall by wall with arrowheads and extension lines, and the outer faces of the
walls give the overall width under the bottom chain and the overall depth beside the right
one; a wall with rooms on both sides is interior and in no chain. The board fits the plan
with a hundred pixels of margin when the layer is on, and a blank sheet opens two and a half
metres in from the corner so the first room's chain is not under the totals plate. The room's
own edge lengths stay inside, as before. **What the rooms wear is on the board too**
(`drawBaseFinishes`): a room's base floor finish as a fill in its product's colour, its base
wall finish as a band along every edge, under the strips, squares and zones — only finishes
that carry a product; the style's default is the room's ordinary paper.

Three things the board does *not* do, each a correction from the architect's review: it
never recentres itself after an edit (the view refits only when a different plan arrives —
`designStore.planSerial`, bumped by `setPlan`, `openSaved`, `startFromCalculator`, `reset`
— and a blank sheet opens at about a hundred square metres with the origin near the top
left); a room rectangle snaps onto the wall that runs *alongside* it, never onto one that
only meets its corner (`snapRectangle` ranks candidates by overlap, and the preview shows
the snapped rectangle while it is dragged — before this a room drawn beside a flat with a
12 cm jog got a doubled wall a hand apart); and Ctrl+Z / Ctrl+Y work on the board itself
(`PlanEditor.onUndo/onRedo`, wired by `PlanWorkspace` unless `keyboardUndo={false}` — the
studio handles the keys page-wide). The sheet's corner shows the flat's total area and
room count (`showTotals`).

### Technical setup (`lib/design/technical.ts`), electrical (`lib/design/electrical.ts`)

Technical points (`water_supply`, `sewer`, `floor_drain`, `electrical_panel`, `gas`,
`radiator`, `ac_unit`, `extractor`, `boiler`, `heating_pipe`) live in `plan.technical` with
the works checklist (`WORK_ITEMS`, keyed to the calculator's phases; `effectivePhases`
replaces the home state's phase list when works are ticked — `calculateMaterials` /
`calculateWorkerCosts` / `buildProjectSummary` take the override as their last argument).
`technicalAnchors` feeds the layout engine (`LayoutOptions.anchors`): a fixture scores up
to +40 for standing near the point it needs, and a kitchen run takes the wall the water
comes to; `LayoutOptions.obstacles` keeps furniture off the columns. `technicalSuggestions`
is the hint list on step 3 (toilet far from the sewer, radiator on an interior wall, no
extractor in a bathroom). The step offers the kinds as a grid of icon tiles that is always
on screen (`components/plan/icons.ts` is the one icon per system, shared with the toolbar
and the inspector): a tile arms the point tool with that kind and stays armed until it is
clicked again, and a click on a point already placed picks it up instead of stacking
another. The works checklist is four collapsible groups by the stage the works take the
house through (`WORK_STAGES`: old renovation → black frame, black → white frame, white →
green, green → moving in), each with an all / none toggle.

Sockets, switches and lights are `scene.electrical` (`ElectricalPoint`: kind, wall +
position, height, outlets, on/off, a lighting `category`). `suggestElectrical` places them
from the furniture with the usual heights — 45 cm sockets, 60 cm bedside, 115 cm above a
90 cm worktop, 170 cm high sockets, 105 cm switches by the handle side of every door, one
main light per room — and never touches points marked `origin: 'user'`; `generate` re-runs
it. `placeElectrical` snaps a hand-placed point to the nearest wall; `reprojectElectrical`
follows moved walls; `slideAlongWall` moves one along the wall it is on (the card's
slider and its 5 cm nudges).

**Two fittings may not hold the same piece of wall** (`fittingClashes`). The rule is about
plates, not points: two argue only when their footprints overlap *both* along the wall and
in height, so a switch at 105 cm still sits directly above a socket at 45 cm while two
sockets a centimetre apart do not. A bought fitting is measured by its real `sizeM`, an
estimate by the plate it would have (`fittingFootprintM`: a double socket twice a single's
width, a strip as long as it was drawn); two on different walls are measured across the
room, which catches the pair that meet inside a corner. Placing, dropping and dragging all
go through it, and a refusal raises the studio's banner rather than looking like a click
that did nothing. Before this a socket dropped on a socket went in regardless — the second
plate sunk inside the first, invisible, unselectable, and paid for twice in the budget.

**A technical point's height can depend on its room** (`technicalElevation`). Every kind
has one usual height — a socket is a socket whatever the ceiling — except the air
conditioner, which is hung from the ceiling down: `TECHNICAL_KINDS.ac_unit` is the ceiling
less the fitter's `AC_CEILING_GAP_M` (18 cm, the middle of the 15–20 cm rule) and the
unit's own `AC_UNIT_HEIGHT_M`, floored at `AC_MIN_ELEVATION_M` so a low ceiling does not
bring it to head height. Placing a point takes that height, and so does re-kinding one —
a socket turned into an air conditioner used to stay at 45 cm off the floor. It stays
editable, and the inspector says where the number came from. The unit is not drawn in 3D
yet: there is no model for it, and the radiators are the precedent for writing one
(`scripts/radiator-models.ts`, in code, no download).

**Every fitting is a product**, like every piece of furniture. `FIXTURE_PRODUCT_KIND` maps
a point's kind to the `model3dKind` a product carries — the four socket kinds are one
`socket` product (a double socket is two of it, `fixtureQuantity`), `switch`, `socket_tv`,
`socket_data`, and one kind per light — and `withFixtureProducts` / `withFixtureProduct`
give a point the catalogue's best product of that kind (`fixtureCandidates`: the style's
first, the cheapest next) as a `SceneProduct` with its size (`sizeM`). The store attaches
them wherever points are made or re-kinded (`addElectricalPoint`, `suggestElectrical`,
`generate`, `changeElectricalKind`) and `setElectricalProduct` swaps one; a point whose
kind has no product yet stays an estimate (`ELECTRICAL_MATERIAL_GEL`). The budget prices a
bought fitting as a real line (`product-<id>`, folded across points) and the rest by kind;
the electrician's labour is per point either way. The admin product form offers the
fixture kinds (⚡) next to the archetypes; `FIXTURE_CATEGORY_SLUGS` (sockets & switches,
lighting) are part of the design catalogue, and `pnpm models:seed` writes one product per
entry of `public/models/fixtures/manifest.json` that carries a `product` (photo from the
source, store Lumina). The furniture shelf leaves fixture kinds out (`isFixtureProductKind`).

In 3D each point is one group standing at its spot (`buildFitting`) holding a model and
nothing else: the product's own model when it has one (a file under `/models/fixtures` is
framed as a fixture already — back on the wall, top on the ceiling — and anything else, a
partner's upload, is scaled to `sizeM` and turned to the wall by `reframe`), else the
kind's default from `public/models/fixtures` (the first entry of `FIXTURE_MODELS` with that
kind: the EU socket, the switch, the industrial wall lamp, the bulb on a cord, the flush
spot, one photoscanned tube for the strips, stretched to the point's length). **Nothing in
the studio is drawn by hand any more** — no plates, roses, cords, rings or bars — so the
group is empty for the beat the file takes to arrive; the same goes for doors and windows
(below). A double socket is two of the same plate side by side; a ceiling point under a
hanging lamp from the catalogue shows only the rose (`role: 'rose'`, a flush light); the
ghost that rides on the pointer while a fitting is dragged in is the same model in one
translucent material; a light that is on has the materials named for the light (`light`,
`lamp`, `bulb`, `glow`, `led`, `tube`, `shade`) glowing, copied for that instance so the
cached file's materials stay untouched. `pnpm models:fixtures` writes the files from Poly
Haven (CC0: the industrial wall lamp and sconce, the glass globe pendant, the fluorescent
tube) and poly.pizza (Quaternius, Kenney and reelpersen CC0, the rest CC-BY 3.0 credited in
the manifest: two sockets, two switches, a brass sconce, a pendant, a disc lamp, the flush
light that is both the rose and the recessed spot, a square spot) — two or three products
per kind so the card has something to swap to — and `pnpm models:photos` renders each
one's product photo from the model itself (a transparent PNG under `uploads/furniture`,
lit and framed like the studio; the sources' own thumbnails sit on garish gradients). The lights that
are on become point lights (`lightsFrom`; at night they replace the per-room lamps). With
one room in focus, the other rooms' fittings, lights and tight-passage outlines are left out
along with their furniture. The selected fitting's card in the studio (`FixturePanel`) is
the furniture card's twin: photo, price and shop (or the estimate), the kind as a dropdown,
height with presets, the slider along the wall, outlets, on/off, and "შეცვალე პროდუქტი" —
every product of that kind — in the drawer along the bottom.

### Style test (`lib/design/styleQuiz.ts`), zones (`zones.ts`), versions and undo

Five questions × four answers, each weighted towards a style; ties go to the palette
answer. The result is `scene.styleProfile`; picking a plate directly marks `direct`.

A painted strip (`span`) and a painted square metre (`cells`) lie *on top of* a wall's
finish and are not it — `wallFinishFor` skips both, and forgetting the second put the patch's
material on the whole wall the first time the 1 m² brush touched it.

A finish is still `SurfaceFinish`, with `wallIndex` (one wall) or `zone` (a floor
patch, a polygon clipped to the room by Sutherland–Hodgman — half a room, a strip along a
wall, or a rectangle drawn in 2D with the zone tool). `wallFinishFor` resolves a wall to
its own finish or the room's base; `finishCoverage` is the "m² per material" list; the
budget prices each wall and zone by its own area. `findFinish` in the builder only ever
returns the *base* finish.

The store records a snapshot (plan, items, finishes, electrical) before every change
(`commit`), so Ctrl+Z / Ctrl+Y walk `lib/design/history.ts`.

**Generating is the journey's hinge, not an undoable edit.** `generate` does not go through
`commit`: it clears `versions` and the history itself and sets `generated`. One Ctrl+Z in the
studio used to undo the whole layout and leave every room bare — and, coming from the
calculator, carry on into the walls drawn there, because `startFromCalculator` kept the
versions of whatever was in the studio before and the baseline only ran when none existed.
Only the newest layout is kept as a version, with its furniture.

**The studio's baseline is where undo stops.** `ensureExistingVersion` runs once per project,
when the studio first opens: version 01 is the flat as the studio found it, *with* the
furniture, and the undo history starts there. Taken when step 2 was left, as it used to be, it
was an empty flat, so restoring it emptied the rooms. The working state is the implicit
"modified house", `saveVersion` keeps a named one, `restoreVersion` keeps the present first,
and "start from scratch" (`clearDesign`, behind a dialogue of ours) empties the flat while
version 01 stays. Versions are persisted locally and in `projects.versions`.

### Budget (`lib/design/pricing.ts`) and trades (`trades.ts`)

**A tick belongs to a line, not to a product** (`lib/design/ticks.ts`). Unticking a line
leaves it in the design — still in the room, still in 3D — and takes it out of the order.
`scene.excluded` holds one key per *line*: a placed piece is `item:<its id>`, and the lines
the budget folds per product are that product within its kind (`finish:<id>`,
`opening:<id>`, `fixture:<id>`, `radiator:<id>`). The first version kept bare product ids, and
a flat with the same bed in four bedrooms is four lines of one product: unticking one struck
all four, which read as three rows appearing from nowhere. (A bare number in an older scene
still means "every line of that product" when read; `toggleTick` never writes one, and
`pruneTicks` / `pruneQuantities` drop the edits of a piece since deleted before a save.)
`priceScene` builds the sheet as it works it out (`raw`), lays the person's edits over it in
one pass (`withEdits`: ticks and `scene.quantities`), and counts every total, section, basket
and header figure off the result — a ticked-off line is **in `lines`, flagged, exactly where
it would otherwise stand**, and counted nowhere. The page used to list what was ticked off
*after* the rest, from a second pricing, so the sheet reshuffled under the pointer at every
tick; and the radiators never asked the ticks at all, so one ticked off stayed in the total
and was listed twice. The second pricing survives only to say what the edits came to, because
a product that is out can take its store's delivery with it. **A tick takes out that line and
nothing else**: unticking a socket leaves the electrician's point — a socket somebody already
owns still has to be wired — and the point has a tick of its own for the person who is wiring
it themselves; the same goes for the bags of plaster and the plastering. See "One sheet for
both summaries" above for the keys, the quantities and the page.
`tests/unit/design/ticks.test.ts` pins all of it, including that the totals card's rows, the
sections and the header figures each come to the grand total in both modes — the card hid its
labour row outside a renovation, and a design-only project that chose a skirting board pays to
have it fitted, so its rows came up short of the total under them. `budgetLineName` reads the
*kind* of line before the shape of its key: `electrical_rough` and `electrical_point` are
labour, not a kind of fitting, and read by their prefix they were rows with no name.

**What is bought is read off the budget, by everyone** (`orderedLines`). Every product line
carries its `product` — the snapshot with its three names, its category and its shop, holding
the *line's* quantity and total, so a folded line (one paint over five rooms, twelve sockets of
one model, a radiator's sections) is every instance together and not the first of them — and
an `item`, what the product is here ("Sofa", "Wall covering", "Interior door"). The lines that
have one and are still ticked are the one list three things are made from: the **baskets**
per store, built at the end of `priceScene` from those lines and only then charged delivery
(`deliveryFeeFor`, once per store, on everything that store is bringing); the **checkout
dialogue** (`designCheckoutPart(plan, cost, …)`, which takes the priced design, not the scene);
and the **orders** (`costLinesByStore` / `sceneLinesByStore` in `lib/finance/money.ts`). All
three used to walk `scene.items` and `scene.finishes` themselves, from when nothing else was a
product: a door from Domus or a socket from Lumina had a price and a tick on the sheet, no
basket, no delivery and no order — a flat whose budget said 31 873 ₾ of products was offered
29 697 ₾ of them at checkout. Walking the scene a second time is also the wrong shape for the
fix, because only `priceScene` knows which door is new work (`all` / `origin: 'user'`, the
ticked phases), what the flat already has (`plan.technical.existing`), that two halves of an
interior door are one door, and how many sections a radiator comes to. **Do not re-derive any
of that in an order builder; add the product to the line.** Three things follow from reading
the lines that the old loops got wrong in the other direction: a finish the flat already has
and a made-to-measure kitchen (an estimate, a joiner's job) are on nobody's order, and a paint
brushed on in twenty strips is one order line of its square metres rather than twenty.
The basket labels follow the `surfaceLabels` pattern — `productLabels` in `PriceOptions`, the
four sockets as one key, Georgian defaults — and `basketLabels(t)` in `lib/i18n/labels.ts`
hands a page both maps from the dictionary (the `ek*`, `tkRadiator` and `line*` strings the
fitting cards and the estimates already use). **Delivery rose for scenes whose doors or
fittings come from a shop below `FREE_DELIVERY_THRESHOLD_GEL`** — that shop was always going to
charge for the van; the budget now says so.

**The plan leaves as a PDF** (`lib/design/planPdfExport.ts`). The board already knows how to
draw a plan — `components/plan/draw` is plain canvas over plain data — so the page is that
drawing at 200 dpi on an A4 sheet with a title block, and the PDF around it is written by
hand. The sheet carries a heading large enough to be read first with a subtitle under it
(the style and the date, or the home's condition), the dimension chains outside the walls
with room reserved for them, every door and window with its width × height
(`drawOpeningSize` — an interior door once, on the half that draws the leaf, not on each of
its twins), the furniture footprints with the kind of each piece (`itemLabel`), and what
each room wears (`finishes`). Everything written on the sheet is written at print scale
(`ui: SCALE` on the routines that take it — the room labels, the furniture, the openings'
sizes, the chains): the board's 9–14 px type is a smudge at 200 dpi. The room names go on
last, on a white plate (`drawRoomLabel`, split out of `drawRoom` for that), because a name
drawn first vanished under the bed standing on it; the edge lengths the board writes inside
each room (`dimensions`) are left off the sheet, since the chains carry every size and the
small figures at the walls' middles only collided with the radiators there. A furniture
label is shortened until it fits its piece — turned along a piece deeper than wide — or
left off, on the sheet and on the board alike: a name spilling past the edge read as the
neighbour's. The calculator's summary exports its own board the same way (its plan and the
laid finishes, no furniture): a vector page would have meant embedding and subsetting a font
for the Georgian room names, while a JPEG goes into a PDF as it is (`/DCTDecode`). The
cross-reference table is the only fiddly part and `tests/unit/design/planPdfExport.test.ts`
parses the result back with pdf.js.

`priceScene` returns `lines` — one `BudgetLine` per product, finish (m²), door or
window (its product, else an estimate — `OPENING_ESTIMATE_GEL`; a pair of interior door halves counted once),
electrical kind (materials + per-point labour from the rate book: `electrical_point`,
`lighting_point`), technical point (`TECHNICAL_RATES`: `plumbing_point`, `radiator_install`,
`ac_install`, `extractor_install`), bulk material and labour line — plus `openingsTotal`,
`technicalTotal`, `lightingTotal` and `coverage`. In `design_only` mode only what the person
added (`origin: 'user'`) is new work; in `full` mode the ticked phases decide.
`budgetSummary` folds the lines into materials + products + labour; `budgetSections`
into the sections the budget page lists. `tradesNeeded` maps the labour keys to the six
worker specialties for step 8.

### The studio's build mode (`app/(main)/design/studio/page.tsx`)

Full-bleed canvas; the categories are a narrow rail of tiles down the left edge
(`CategoryRail`, the rooms list beside it) and the open category's tray runs along the bottom
(`Tray`), one at a time — build (tools + the wall's shape + thickness + the unlock button; a
drawing tool switches to the 2D view), furniture (the catalogue as a shelf of small tiles —
a picture and a price — browsed by room and then by kind, narrowed by colour swatches; click
to carry or drag into 3D; the project's own style is marked on the style chips, and a list of
what is already standing in the room sits in the right-hand panel beside it — see "Adding
furniture in the studio"), electric & light (four tiles — socket, switch, aerial,
data — and the lights; the double, high and kitchen sockets are still placed by the
automatic wiring and still re-kindable from a fitting's card, but four extra tiles only made
the shelf harder to read), **technical** (the ten kinds as tiles that arm the 2D board, the
radiators at a click, the works checklist one link away), finishes (the same kind of shelf:
floor or walls, where it goes — whole room, this wall, a 1 m strip, a 1 m² patch, half the
floor, a drawn zone — then the swatches, the style default first), budget (totals at a
glance). The top bar's **"start from scratch"** (`clearDesign`) empties the flat — furniture,
fittings and chosen finishes — and leaves the flat.
Dragging from a tray is shown live and the tile's own picture is never dragged
(`emptyDragImage`): a product is put on the pointer in 3D the moment the drag starts
(`beginAdd`, then `ViewerApi.moveCarriedTo` on every `dragover`) and set down on drop; a
fitting shows a ghost snapped to the nearest wall (`previewElectricalAt`) and is added on
drop. Placed fittings drag along the walls of their room in 3D (hopping to the nearest
wall) and are re-projected on release. The top bar carries the room chip, undo/redo, the
view switch, day/night, photo, the structure lock, versions, help and the next step.
Whatever opens on the right — the item card, the fitting card, the door or window card, the inspector, the versions
— is an overlay (`z-40`) the full height of the studio, scrolling inside itself under its
alternatives drawer: nothing is pushed aside for it; the help card and zoom sit above the
top bar (`z-30`) so their buttons are never covered. The electric tray is one compact row.

**Choosing a fitting arms it; only the room places it.** The placing click is caught on the
workspace in the capture phase, and the workspace holds the floating chrome as well as the
canvas — so three gestures that are not "put a socket here" used to look exactly like it,
and all three are now refused: a click whose target is not inside the canvas layer (the
tray sits *over* the canvas, and the ray went straight through it to the wall behind,
which is why choosing a kind appeared to place one by itself); a gesture whose pointer
travelled more than `CLICK_SLOP_PX` between down and up, which is a drag of the camera or
of a fitting and not a click (repositioning a socket used to leave a second one where the
drag began); and a click that lands on a fitting already there, which selects it instead of
stacking another on it. `ViewerApi.electricalAt` answers the last one and **walks up from
the mesh the ray hit**, because `tag` stamps a subtree as it stands and a fitting's model
joins it a beat later, when its file arrives — the meshes actually hit are usually
untagged. While a kind is armed the fitting itself rides on the pointer, ghosted and
snapped to the wall it would go on (`previewElectricalAt` on `pointermove`, the same ghost
the tray's drag-and-drop shows), because the armed tile is a tray away from where the
person is looking.

A tap on a
floor or a wall chooses the surface for the finishes shelf **in the finishes category
only**; in every other category the floor and the walls are just the room. `editMode` follows the category (`build` picks walls, columns, beams and,
when unlocked, drags walls along their normal with a ghost slab; `electrical` drags
fittings; `finishes` clicks surfaces with their `wallIndex`). The right panel is the item
card (rotate, mirror, duplicate, lock, alternatives), the element inspector, the finish
picker or the versions list. The tour (`TutorialOverlay`, eight cards, remembered in
localStorage) opens on the first visit and lights up what each card talks about — the
target is found by a `data-tour` attribute (`rail-furniture`, `lock`, `navhelp`,
`history`…), everything else is dimmed and blurred, and the card sits beside it; the page
opens what a step points at (`onStep`). `NavHelp` keeps the controls on screen: drag turns
(either button), the middle button pans, Space + drag pans, Shift + drag dollies, WASD
slides, 1 / 2 / 3 switch views, R turns, M mirrors, Ctrl+C / V / D copy, paste and
duplicate, Delete deletes, Esc clears.

**The top bar is one row at any width** (`StudioTopBar`, `.studio-bar` in `app/globals.css`).
It is a CSS size container (Tailwind 3 has no container-query plugin here, so the rules are
plain `@container` blocks), and as it narrows the blocks give up what they can instead of
wrapping: below 1520 px of bar the words beside icons go (`.bar-text` — the lock, the
versions, the save state, which reads "შენახულია" and no more), below 1240 the
walk-through's word, the gaps and the view switch's padding (`.bar-text-2`, `.bar-gap`,
`.bar-pad`), below 1060 the next step's word and the room's name is clipped tighter
(`.bar-text-3`, `.bar-next`, `.bar-room`). Every button keeps its tooltip. Measured: one
row from 820 px up, the labels back from 1553 px of viewport. Before this the bar was
`flex-wrap`, and at 1500 px the right block fell onto a second row over the canvas.

**The floating chrome must not eat the canvas.** The trays are nearly opaque (`bg-white/[0.97]`),
not frosted: small print over a furnished room could not be read. Tiles are 52 px — a price
and a picture, the name in the tooltip. The hint and the tight-passage warning *float above*
the tray (`absolute bottom-full`) instead of stacking with it, and the page-level hint only
speaks for what no tray can say for itself (a piece on the pointer, the walk-through, a
fitting armed, the structure locked) — each tray carries its own hint for the tool in hand.
**Every tray puts its categories down its left edge** and gives the rest of the width to
what the person is actually choosing: the finishes tray its surfaces (floor · walls ·
skirting · cornice), the furniture tray its styles, the electric tray its two families
(power · lighting). The build tray has no sentence at all — the unlock button stands where
it used to, because that is the one thing to do there.

**The side panels fit without scrolling.** The product card is one compact row (photo, name,
price) with the shop on a line under it — no address, no telephone, no "visit the shop"
button; the hover card keeps those, since that is the moment that proves the sofa is a real
sofa. Everything that can be done to a piece is one row of square icon buttons
(`IconAction`): turn, mirror, duplicate, lock, delete. Inputs are 32 px, and the swap drawer
carries its own padding.

**The camera frames on the plan's identity, never on the plan object** (`Viewer3D.frameKey`
← `designStore.planSerial`). A door slid along its wall, a wall dragged, a radiator moved:
each makes a new plan object, and framing on that threw the person's view away mid-edit —
they lined the camera up on a door, nudged it, and were back at the doll's-house view.

**Step 1 asks before it assumes** (`app/(main)/design/page.tsx`). Nothing leaves the page
until the one continue button at the bottom: an uploaded plan waits in page state
(`PlanUploadCard` with `showContinue={false}` hands the plan over as soon as the area is
valid, and takes it back through `onReset` when it is not), typed and drawn rooms wait in
page state, and "what do you need" (design only / renovation + design) is **not**
pre-selected — `designStore.modeChosen` says whether it was, and the button refuses with a
message until both a plan and a mode exist. The calculator keeps the card's own continue
button; only the studio hides it. A plan that came from a PDF was rasterised first
(`lib/design/planPdf.ts`: page 1 through pdf.js at ~2200 px, then an ordinary PNG `File`),
so the upload route, the Claude reader and the CV parser only ever see images; the worker
is served from `public/vendor` because the CSP allows workers from this origin only.

**Nothing in this pipeline calls an AI.** The scene is built procedurally from structured
data — deterministic, free per view, same result every time, fully interactive. That was the
core recommendation in `AI_FEATURE_PLAN.md` and it is what shipped. A vision-LLM plan parser
and an LLM product ranker remain possible *additions* at the two marked seams
(`parseFloorPlan`, `matchProducts`), but the app has never depended on an API key and should
not start.

### How the floor-plan parser works, and why

**Preprocessing** handles the difference between an export and a photograph. A drawing shot a
couple of degrees off square comes back as a flight of stairs, so the skew is estimated from
the orientation histogram of the edge gradients (mod 90°, because plans are made of two
perpendicular families of lines) and corrected. Unevenly lit paper defeats a global threshold,
so `hasUnevenLighting` picks between Otsu and a local Bradley-Roth threshold. Room labels,
dimension figures and furniture symbols are ink but not walls, so small blobs are despeckled
away. On a synthetic photograph — 3.2° skew, a lighting gradient and text clutter — this is
the difference between 14 spurious rooms and the 6 real ones.

Rooms are then separated by **clearance, not connectivity**. The obvious approach — dilate the
walls until the door gaps close — cannot work: a door gap is ~0.9 m and a wall stroke is
~0.1 m, so any kernel wide enough to bridge a doorway also swallows a small bathroom. Instead
the distance transform of the open space is thresholded from wide to narrow, and each room is
claimed at whatever clearance it first appears at (a watershed flooded from the distance
maxima). That finds a 3 m² toilet and an open-plan living room in the same pass.

Outlines come from **marching-squares crack following** — walking the boundary *between*
pixels — which is axis-aligned by construction and therefore exactly the shape a room outline
wants to be. Moore-neighbour tracing was tried first and is not worth revisiting.

`pnpm test:parser` runs synthetic plans (5-room flat, corridor flat with a 5 m² bathroom,
L-shaped studio, and a "photographed" plan with skew + uneven light + clutter) through the
whole thing and asserts room counts, total area and that L-shapes survive. Run it after
touching anything in `planParser.ts`.

### Reading a plan with Claude (`aiPlan.ts` + `planSolver.ts` + `measure.ts`)

The CV parser reads *ink*, and a real estate agent's plan is mostly ink that is not a wall:
sofas, beds, kitchen counters, dimension arrows, room labels. On the sample 1-bedroom plan in
`public/uploads/plans` it returns two regions — a 364×312 blob and a sliver — losing the
bedroom, bathroom and balcony entirely. Annotation lines that run to the image edge also let
interior space leak into the exterior region, which is then discarded as "outside". No
threshold tuning fixes that; the plan has to be read, not measured.

**The division of labour is the whole design.** Claude is asked for what it is good at — room
names, types, roughly where each sits, what the dimension labels *say*, what connects to what
— and explicitly *not* for coordinates, which vision models return a few percent out with
nothing downstream able to tell. Then `planSolver` reconciles:

1. Room edges snap onto shared grid lines, so neighbours agree on the wall between them.
2. Those lines become the unknowns of a least-squares problem: each printed dimension is a
   strong constraint, each line's observed position a weak one.
3. Solving gives the wall positions that best satisfy every printed dimension at once.

That is what makes it exact. On the sample plan the solved walls land within **4.4 cm** of the
printed dimensions — and that residual is the *drawing's* inconsistency, not the solver's: the
bathroom (1.88 m) and hallway (1.73 m) sit above a bedroom labelled 3.73 m, but 1.88 + 1.73 =
3.61. The labels are measured to different wall faces. Least squares spreads the 13 cm rather
than letting the last constraint win, and sets `lowConfidence` when it is large.

Two axes need **two scales** — boxes are normalised against image width for x and height for
y, and drawings are rarely square. Sharing one scale stretches an axis by the aspect ratio and
then every dimension on it looks like a misread.

`pnpm test:solver` covers all of this without an API key, which is the point: the half that
has to be right is testable before a single token is spent.

### Doors are inferred by circulation, not adjacency (`planGeometry.deriveOpenings`)

The CV path cannot see doorways (the parser seals them), so doors are placed on shared
walls. Putting one on *every* shared wall — the original rule — gave the sample plan's 3.7 m
bedroom doors on three walls, a window on the fourth, and no wall left for a bed. Now a
private room (bedroom, office, bathroom…) gets exactly one door, to its best circulation
neighbour (hallway > living room > kitchen), circulation rooms open into each other, and a
room whose only neighbours are private (a kitchen behind a merged-away hallway) still gets a
door so nothing is sealed in. The front door prefers hallway > living room > kitchen. The AI
path reads real door positions and does not go through this.

### Layout fallbacks that keep rooms furnished (`autoLayout.ts`, `matcher.ts`)

- Storage against a wall (`NARROWABLE`) retries at 80 % and 65 % of its default width when
  the full width finds no wall — and the matcher then scores down products wider than the slot
  they were given, so a 2 m cabinet is not dropped into a 1.2 m gap beside a door.
- A centred relative item (TV unit, coffee table) is nudged sideways in growing steps before
  giving up; the spot dead ahead of the sofa is usually a door keepout.
- A `fill` ring of dining chairs skips a seat that hits a wall instead of ending the ring, and
  each seat tucks in towards the table when the room is tight.
- Within one room, all slots of a kind get the same product; other rooms rotate through the
  best style tier so five pendants are five different lamps.

`pnpm test:parser` and `pnpm test:solver` still pass; the layout has no test of its own —
the sample plan in `public/samples/plan-2br.png` run through `layoutPlan` is the check.

### Painting a piece at a time (`lib/design/paint.ts`)

The finishes tray has three scopes that behave like a game's brush rather than a form:
**1 m²** paints one square of a room's floor, **1 m** one metre-wide strip of a wall floor
to ceiling, and **1 m²** on a wall one square metre of it — its column along the wall and
its row up it (`patchAt`, `patchSpans`), the last column and the top row running on to the
corner and the ceiling. A swatch picked in those scopes goes into the *brush* (page state,
`brush`) and paints nothing until a floor or a wall is clicked; dragging paints everything
the pointer crosses; the style default is the eraser. All of them live in `scene.finishes`
on top of the room's base finish — all the tiles of one product in one room are **one**
finish with a list of grid `cells`, all the patches of one product on one wall **one**
finish with a list of cells read as [column, row], neighbouring strips of one product on
one wall **one** finish with one `span` — so undo, versions, autosave and the budget get
them for free, and a painted flat is a handful of rows rather than hundreds. A wall patch
needs the height of the click, so it is painted in 3D only: on the 2D board the square-metre
chip stands disabled with the reason in its tooltip (`FinishesTray.flat`), the brush falls
back to the metre-wide strip while the board is the view (`finishScope` is derived from the
stored scope and the view in the studio page), and the board draws a patch painted in 3D as
a band along the wall. `WallFaceSpan` carries
an optional `bottom`/`top` for it, and `buildWallGeometry` cuts the wall's face horizontally
as well as vertically. The grid is the room's own (counted from its bounding
box, each tile clipped to the outline, so the last column is a part tile), and a strip
shorter than 25 cm at the end of a wall joins the strip before it. `fitToPlan` in the store
drops a strip past the end of a wall that got shorter and a tile a room no longer reaches.

**The layers of a wall lie like paint: base, this wall's own finish, strips, square metres.**
`buildWallGeometry` gives each spot the *last* span that covers it, and `buildScene` lists the
strips before the patches, so a square painted over a strip is what shows (it took the *first*
match once, the strips came first, and the 1 m² brush seemed not to apply anywhere a strip had
been painted; the data was there all along). The other direction is settled in the data: a
strip is floor to ceiling, so `paintSpan` takes every square in the stretch it paints off the
wall — and only in that stretch, not in the rest of a span of the same product it runs on into
— and the strip eraser clears them with it. The 1 m² eraser on a strip cannot leave a hole in
one, so the column leaves the strip and goes on wearing its product as squares, every row but
the erased one (`erasePatchFromStrip`), priced as what is left. The 2D board draws the same
order — whole wall, strips, squares — whatever order the finishes are stored in.

**"The whole room" is the whole room.** A swatch picked in the room scope (`setFinish`) takes
everything off that surface in those rooms before it lays the new base: a wall's own finish,
the strips, the square metres; on a floor the painted tiles and the drawn zones (a zone that
was selected is let go of). It used to replace the base only, so a room painted white kept
its old stripes on top and nothing said why — the accents are one Ctrl+Z away, or painted
again over the new colour. The style default in that scope is therefore the room's eraser.
`finishQuantity` reads `cells` on a *wall* as square metres of that wall (`patchesAreaM2`);
it read them as floor tiles once, and a patch near the ceiling was priced at nothing.

**While the finishes category is open the pointer sees the room and nothing else**: the
viewer picks through `shellHitAt` (floors, walls, zones), so the sofa in front of the wall,
the socket on it and the door in it can be neither clicked nor dragged, and the 2D board
does the same through `roomsOnly`. Which side of a shared wall was clicked is answered by
`wallSideOf`: the room face is the room's own, the far face belongs to the room behind that
stretch of it (`wallFrame.behind`), so the wall that gets painted is always the one that was
looked at — the old code measured the cutaway from the mesh's origin and hid the wrong half,
which is why a click near a shared wall painted the neighbour's side in the neighbour's
colour.

### Skirting boards and cornices (`lib/design/trims.ts`)

A moulding is the one thing in the studio with no model file: it has no fixed length, so it
is *swept* — its cross-section (`trimOutline`: flat, rounded, stepped, ogee, cove) is run
along every wall by `buildMouldingGeometry`, mitred at the corners (each run gives way by
`tan(turn/2)` per metre it stands out) and broken at the doorways for a skirting board.
It travels in `scene.finishes` as `surface: 'skirting' | 'cornice'` with a `trim` spec, is
sold by the running metre (`trimLengthM`: the perimeter, less the doorways for a skirting
board), and `trim_install` is its labour. A room with no product wears the style's own
moulding for nothing (`STYLE_TRIMS`; modern and industrial have no cornice at all).
`scripts/lib/trimProducts.ts` is the seeded range — profile, height and depth in `specs`.

**A cornice runs along the top of *its wall*, not at the room's ceiling height.** A wall can be
given a height of its own in the inspector (`wall.heightM`; the 3D wall is built to it, the
room's `heightM` is only the default), and the cornice was built at `room.heightM` — raise a
wall and it stayed behind, a white line part of the way up. `buildRoomShell` works out every
side's top once (`tops`) and hands `buildTrim` this wall's and its two neighbours': the run
sits at its own wall's top, and it only meets the next wall's cornice on the mitre when the
two stand level — beside a wall at another height it is cut square and runs corner to corner
(`tests/unit/design3d/cornice.test.ts`). The painted square metres follow the same top
(`patchSpansOnWall`: the room's grid, its top row running on to the top of *that wall*, or cut
off by a wall that stops short), and so does the brush's glow.

### Radiators are bought by the section (`lib/design/radiators.ts`)

A radiator is a `technical` point of kind `radiator` that carries a product, and the product
is **one section**: `pnpm models:radiators` writes four designs (a steel panel module, an
aluminium sectional, a cast-iron column, a classic), each a single section framed exactly one
pitch wide with its back on z = 0, and the 3D view repeats it along the wall (`buildRadiators`).
How many sections is arithmetic, not a guess: ~100 W per m² at a 2.7 m ceiling, a fifth more
in a room with two outside walls (`outsideEdges`, from the wall pieces), divided by the
product's `wattsPerSection`, then shared between the radiators in the room and kept between
4 and 14 — above 14 the far end runs cold and the card says to add a second. The technical
step shows the demand per room and hangs one under every window at a click
(`suggestRadiators`, marked `origin: 'user'` because the person asked for it, so a finished
home still costs them). The budget buys the sections and charges `radiator_install` per
radiator.

### Kitchens are measured, not bought (`lib/design/kitchen.ts`)

Every other product is a SKU with a price; a kitchen is built for the flat it stands in, so
`kitchen_run` and `kitchen_island` are **measured** and their model's price is ignored. The
quote is the one a joiner gives: the façade of the lower units and of the upper ones by the
square metre, the worktop and the fitting by the running metre (`KITCHEN_RATES`). The
measurement is in `DesignCost.kitchens` and the budget's line carries the m², marked as an
estimate. A person who would rather buy a stock kitchen sets `custom: false` on the item.
An estimate is not a product line, so a measured kitchen is in no basket and on no store's
order — the checkout used to send the shop the model at its catalogue price all the same,
while the budget charged the joiner's quote; `custom: false` makes it a product and an order
line again.

### Finishes (`lib/design/surfaces.ts`, `components/design/FinishPanel.tsx`)

A finish is an ordinary product from `laminate`, `floor-tiles`, `wall-tiles` or `paint` that
carries a `textureUrl`; its `specs` say which surfaces it is for (`surfaces`), whether it is
made for wet rooms (`wet`), how many metres one tile covers (`textureScaleM`) and its normal
and roughness maps. `pnpm textures:stock` writes ~35 of them: the partner drop's own floors,
plasters and bricks, plus Poly Haven parquets and tiles and ambientCG bathroom tiles (all
CC0). Paint is sold by the litre, so `pricePerM2` divides by `coveragePerUnit`.

Defaults come from the style, and bathrooms and toilets take the style's `wetFloor` /
`wetWall` (tiles) rather than its parquet and plaster. A chosen finish carries its own maps
and scale into `StyleMaterials.surface`, replacing the style's — a marble tile with the
oak floor's normal map underneath was the first bug here. Re-laying out the furniture keeps
chosen finishes; switching style resets them.

Room names follow their type on the plan page: a generated name ("მისაღები ოთახი 1") is
replaced when the type changes ("საძინებელი 2"); a name the user typed is kept.

**The calculator's catalogue is a cart, and its finishes are laid, not counted**
(`/calculator/catalog` → `/calculator/placement`, September 2026). A product is picked by
kind with no quantity in sight: a floor or wall material (a category whose
`calculationType` is `per_m2_floor` / `per_m2_wall`) goes into the cart under a key of its
own — `<slug>_item:<productId>` (`cartKey`), so a tile for the bathroom and a laminate for
the rest can both be in — with the texture, colour, coverage and specs of its row carried on
the pick (`SelectedProduct.surface|slug|textureUrl|colorHex|coveragePerUnit|specs`), at a
quantity of nothing. Everything else — sockets, lights, sanitary ware, doors, windows — is
one product per kind under `<slug>_global`, quantified from the rooms as before
(`suggestedQuantity`). The old per-room scope (`<slug>_room:<id>`, `selectFinish`) is gone
from the page and still read. Nothing is required: an empty cart is the renovation cost
alone, and the furniture question is asked by whichever step is last before the summary
(`AskFurnitureDialog`). **The placement step** lays the cart's finishes on the calculator's
own board (`useCalculatorPlanStore`, the same `setFinish` / `paintSurface` the studio uses):
a whole floor or all of a room's walls from the table beside the plan, a square metre or a
metre-wide strip with the brush on it; the board draws every room in its material's colour
(`drawBaseFinishes`, `finishSwatchColor` — a stand-in from a small palette when the product
has no colour or a white one), and the legend says how much. What is laid is what is bought:
`finishAreasByProduct` sums each product's area off the board's finishes (`product.qty` on
every `SurfaceFinish` is its area), `finishPickQuantity` turns it into the product's units
(m² plus a tenth of cutting waste for tiles and boards, tins by a paint's own coverage), and
`calculatorStore.syncFinishAreas` writes it into the cart's picks — the placement page and
the summary both do this, so every page downstream (the sheet, the checkout, the save) reads
the picks as always. The server takes a cart pick's quantity from the client, within a few
times the flat's whole surface (`cartQuantity`), the way a quantity changed on the sheet is
taken; everything else is still recomputed from the rooms. The laid finishes also travel into
3D: `startFromCalculator` takes the board's `finishes`, `picksFromCalculator` keeps them off
the whole-flat list, and `applyFinishPicks` lays them where they were laid, under anything
the studio has chosen since. The laying itself is only in the browser's own store — a
reopened project gets its picks back with their quantities, not the painting.

Clicking a floor or a wall in the 3D view selects that surface (`onSelectSurface`): the
right panel shows the finish picker for that room with the clicked surface first, and a
choice there applies to that room only. Clicking empty space clears it.

### Doors and windows are editable (`lib/design/openings.ts`)

The rail's second tab puts the studio in *openings* mode: furniture stops answering the
pointer, every door and window wears a translucent slab, and dragging a slab slides the
opening along its wall (the trim moves live; the wall's hole follows when the plan commits on
release). The panel does the rest — wall, width, position, door↔window, add, delete — per
room. An interior door is two openings, one per room, because each room extrudes its own
wall; `moveOpening`/`updateOpening`/`removeOpening` keep the twin in step, and `addOpening`
cuts a twin when the chosen wall is shared (and refuses a window there). Writing these tests
found a real bug in `deriveOpenings`: the shared run is measured in plan order but applied in
id order, so when the two disagreed each door landed on the wrong wall of its room.

The same editing exists on the 2D board (`PlanEditor`, see "The 2D board" above): a press
on a door or window starts a drag that can end along the same wall (`onMoveOpening`) or on
**any wall of any room** (`onMoveOpeningToWall` → `openings.moveOpeningToWall`, which slides
when the wall is the same or its twin's copy and otherwise cuts the opening out and in again
with its size kept, so it gets a new id); the door and window tools drop new openings on the
nearest wall (`nearestWall`: inside a room, the nearest of that room's walls; outside every
room, the nearest wall within reach); a window let go on a shared wall is refused and the
page says so.

**The two halves of an interior door describe one leaf.** Each room's edge runs the other
way along the shared wall, so the jamb that is `hinge: 'left'` from one room is `'right'`
from the other, and a leaf that swings `'in'` to one room swings `'out'` of the other.
`addOpening` and `deriveOpenings` write the twin mirrored (`mirrorHinge`/`mirrorSwing`),
`updateOpening` mirrors an edited hinge or swing onto the twin, `alignTwins` (run by
`ensureWalls`, so every plan taken in is put right) repairs plans from before, and the half
whose swing is `out` draws no leaf in 2D or 3D (`leafOnOtherSide`) — its twin, swinging
into the room the door opens into, does. Before this both halves hung "left" (the opposite
corners) and both swung "in", and one door showed two leaves. The `ElementInspector` edits the selected opening — width, height, sill,
material, hinge side, swing direction, the open angle shown in 3D — and offers a door, a
window or a plain opening on the selected wall.

**In 3D, `hinge: 'left'` is the jamb at `edge.a` and `swing: 'in'` goes to local +z**, the
same as the 2D board draws them. `edge.facing` puts local +x along the edge towards
`edge.b`, so the left jamb is the pivot at −w/2 and the leaf turns by −angle to come into
the room. The first 3D leaf had both signs the other way — hung from the b-end and
swinging out of its room — and matched the board only by accident of symmetry;
`scratchpad`-style checks with three.js (`pivot.updateMatrixWorld`, then the leaf tip's z)
are the quickest way to be sure of any change here.

**Every door and window is a product**, like every fitting (`lib/design/openings.ts`,
"Doors and windows as products"). `openingProductKind` maps an opening to the
`model3dKind` a product carries — `door`, `entrance_door` (a door on an exterior wall),
`window`; an archway buys nothing — and `withOpeningProducts` gives every door and window
without one the catalogue's best (`openingCandidates`: its own kind first, the style's
before the rest, the cheapest within that), the same product on both halves of an interior
door. The store attaches them in `generate`, `addOpening` / `dropOpening` and
`updateOpening` (a change of kind drops the product and takes one of the new kind), the
studio's `ensureOpeningProducts` fills in the rest once the catalogue is in (a saved design
from before, a door dropped on the 2D board), and `setOpeningProduct` swaps one on both
halves; `alignTwins` keeps twins agreeing on the product too. An opening keeps its product
across `moveOpeningToWall`. The budget prices a bought door or window as a real line
(`product-<id>`, a pair counted once, folded across openings) and the rest as estimates
(`openingEstimate`). The admin product form offers the three kinds (🚪) next to the
archetypes; `OPENING_CATEGORY_SLUGS` (doors, windows) are part of the design catalogue;
the furniture shelf leaves them out (`isOpeningProductKind`).

The studio's card for a selected door or window (`OpeningPanel`) is the fitting card's
twin: photo, price and shop (or the estimate), the kind as a dropdown, width and height,
the sill of a window, hinge, swing and open angle of a door, the material only while it is
an estimate, and "შეცვალე პროდუქტი" in the drawer along the bottom. The structure lock
keeps the hole (kind, size, sill, deletion); what fills it stays editable.

In 3D (`buildOpeningTrim` → `attachOpeningModel`) an opening holds a model and nothing
else — the product's, or the manifest's default for its kind (`FixtureModel.role`: the
white flush door, the two-leaf window, and Kenney's open doorway as the casing of an
archway and of a bare leaf) — stretched to the opening's width and height (its depth in
proportion, never much more than the wall); the hole is bare for the beat the file takes
to arrive. The only thing drawn by hand is the translucent slab the openings mode uses as
a handle. `pnpm models:fixtures` frames a door or window centred on the opening, standing
on y = 0, centred in the wall with the room side along +z, and sorts a door into the nodes
`leaf` (hung from x min — `hinge: 'left'`) and `frame`, or `body` for a window or a door
kept as one piece: a source that keeps its parts apart is split by node name, a welded one
by the triangles whose centre lies in an inner box (`leaf: { box }`), a bare leaf (Kenney's
doors) is `leaf: 'all'` and gets the default casing around it at runtime, sized to the
inside of the jambs, and a leaf that hangs from the right in the file is mirrored
(`mirror: true`). **A box rule has to start above the threshold.** The three Quaternius
doors (`door-nordic`, `door-flat`, `entrance-door-classic`) are one welded mesh whose
threshold — a strip the frame's full width, 2.5 cm high — lay inside a box that began at
`y: 0`, so it was sorted into the leaf: the leaf's bounds became the frame's, the runtime
hinge (x min of the leaf) stood at the frame's outer edge 3 cm off the leaf's own, and the
open door showed a gap at its jamb with the threshold swinging out with it. The boxes start
at 1.2 % of the height now (`scripts/inspect` the result: the leaf's x extent must be inside
the frame's). What remains is the models' own low-poly shape — the casing is a flat trim on
the wall faces rather than a lined reveal, and the leaf is nearly as deep as a wall — which
only another model fixes. The studio re-hangs the leaf on a pivot at its jamb (the scale on the
leaf itself, under the pivot, so turning it does not shear it), turns it by the open
angle, and mirrors the whole model for a right-hinged door. Of an interior door's two
halves only the one that draws the leaf places the model, of an archway's the room that
sorts first — except in a single-room view, where the half that is shown draws it
(`twinShown`). Doors: Quaternius (oak with frame, white panelled, white flush, dark
classic entrance, white glazed metal entrance), Kenney (country leaf, red glazed
entrance), Wesley Thompson's classic white (CC-BY); windows: Quaternius two-leaf and grid,
Justin Randall's wooden four-pane (CC-BY), Google's square (CC-BY). All sold by Domus
Interior at made-up prices.

### Adding furniture in the studio

The furniture tray (`FurnitureTray`) is the catalogue browser scoped to the focused room.
**It is browsed by room, then by kind.** Thirty-four kinds in one row of look-alike icons was
a row nobody could read, so the line is two levels: the rooms as icons (`SHELF_ROOMS`,
`roomIcon`), and inside a room the kinds that belong there (`kindsForRoom`, one icon each —
`archetypeIcons` draws the tables, chairs, storage, corner sofa and rugs itself, in lucide's
idiom, because lucide's tables are spreadsheets and it has one sofa). A kind belongs to a room
by the **slot** it fills in the room's program, not by being named there: the program names
the double bed and "bedroom" lists the single bed too. The opened room's chip stands at the
head of the line as the way back and stays put while the kinds scroll; the shelf opens on the
room the studio has in focus and follows it; a kind no program has a slot for is under
"other" (`unroomedKinds`, pinned empty by `tests/unit/design/shelfRooms.test.ts`); a room or a
kind nothing is sold for is not offered.

**The whole catalogue is a page, one button away** (`components/studio/CatalogBrowser.tsx`,
`lib/design/catalogBrowser.ts`). The shelf is fine for fifty tiles; a catalogue of thousands
wants search, filters and names. The "კატალოგი" button on the shelf's line opens a modal: a
search box across names, brands, shops and kinds in any language; the rooms and their kinds,
the styles, the colour swatches, a price band and the shop down the left, every one with a
count; the products as cards with their names; the open product's photo, size, shop and page
link on the right, with the one button that matters. `browseCatalog` is pure and tested
(`tests/unit/design/catalogBrowser.test.ts`): the filters apply from the outside in and each
control's counts are read off the list *before* that control narrows it, so a control says
what choosing it would leave; a room, a shop or a colour that the rest of the filters have
emptied stands aside rather than emptying the list. **"Place" puts the product on the
pointer and folds the modal to a chip** — `placeFromCatalog` is `pickProduct` (the same
`beginAdd` a tile off the shelf uses, in 3D or on the board; the walk-through has no pointer
to carry on, so the button is off there) and then `catalogBrowser: 'minimized'`: the room is
in view to set the piece down in, a click sets it down, Escape gives it up, and the chip at
the top of the canvas opens the modal again with the search, the filters and the open product
exactly as they were, because the modal's state (`CatalogBrowserState`) lives in the studio
page and not in the modal (Radix unmounts a closed dialog). While the modal is open the
studio's own keys are off (`if (catalogBrowser === 'open') return` in the key handler — a
Delete there must not take the selected piece out of the room behind it), and its Escape is
its own: `onEscapeKeyDown` stops the event while `open` is true, and only then, because Radix
keeps the layer for the beat of its closing animation and an Escape in that beat has to reach
the studio to give up the piece just placed. `isFurnitureProduct` is the one rule for what
is furniture (a model, and neither a fitting, a door or window, nor a radiator); the shelf
uses it too.

**The colour filter is swatches of what is on the shelf.** `lib/design/colors.ts` sorts any
hex into twelve families a person would name (hue, lightness and *chroma* — HSL saturation
races to 1 near white, and a pale peach wood read as vivid orange), and the tray shows one
swatch per family present among the products the other filters leave, with a count; a family
ticked that the current room has nothing of stands aside instead of emptying the shelf. The
colours themselves come **off the models**: `scripts/lib/modelColor.ts` reads every triangle's
area and colour (the material's factor times the texel its middle maps to, nearest-sampled so
a leaf atlas's cut-outs do not bleed; cut-out texels skipped) and keeps up to three families
that cover an eighth of the piece, the largest first, as the mean hex of each — so "brown" is
*this* walnut. Both converters run it on every model, `pnpm models:colors` fills the manifests
already written (`colors`, and `colorHex` = the first unless the entry had one by hand), and
`pnpm models:seed` carries them to `products.specs.colors` (`productColors` /
`productColorFamilies` read a product either way). Eight of two hundred products had a colour
before; nobody was going to type in the rest.

**Rows scroll without a scrollbar** (`components/ui/scroll-row.tsx`): a bar under a 28 px row
of icons is a third of the row, and the trays take every pixel from the 3D view. `ScrollRow`
hides it (`.scrollbar-none`, outside the layers so it beats the global scrollbar rules) and
says where there is more the way a phone does — the edge the row goes on past is blurred and
washed to the tray's white, the edge it ends at is sharp, a row that fits shows nothing.
A `ResizeObserver` on the scroller and its content keeps the edges honest as filters change
the width; a wheel turned over the row scrolls it sideways (let through at either end), and on
hover each fading edge carries an arrow that pages the row. Every icon row and shelf in the
trays — furniture, finishes, electric, technical — is one. `designStore.beginAdd` creates the item with the product's real
size — `placeAdditional` finds a free spot when there is one (a wall first, then any free
floor; never a narrowed slot, which is how a 1.9 m cabinet used to land on its neighbours),
the middle of the room otherwise — and hands it to the pointer (`carryingItemId`). In the
viewer the piece follows the mouse, the outline is green where it fits and red where it does
not, R turns it (`ViewerApi.carryPose` gives the page the spot under the pointer to turn it
at), a click sets it down only on green, and Escape (`cancelCarry`) removes it. Picking a
room in either panel focuses it in 3D.

**One piece rides on the pointer at a time.** `beginAdd` drops whatever is still being
carried before it creates the new item: reaching for a second tile off the shelf is changing
your mind about the first, not asking for both. Before this the first piece was left standing
wherever `placeAdditional` had put it — usually beside the bed, since that is where the free
floor is — and the person had a sofa they never placed and did not want.

**A swap that does not fit rides on the pointer too** (`swapProduct(itemId, product, { carry })`).
`fitSwapped` (`lib/design/manipulate.ts`) says where the new product stands: a piece against
a wall keeps its *back* on the wall rather than its centre where it was (a deeper sofa with
the same centre has its back through the plaster; only the step towards the wall is taken,
never the grid's rounding along it), anything else stays put when it fits and is otherwise
eased back inside the room. It never goes looking across the room. When it answers null the
3D view gets the new piece on the pointer with the old one kept in `carryRestore`; Escape
(`cancelCarry`), another tile off the shelf, or leaving the 3D view put the old piece back,
selected. Without `carry` (nothing can carry on the 2D board) it goes in as it is, outlined
red. Before this a sofa twice the size was simply stood through the television.

**A carry is one step of history, and nothing until it is set down.** `beginAdd` and a
carrying swap use `set`, `placeItem` of the carried piece (the R key, the set-down) is
silent, and `finishCarry` pushes the single snapshot — `beforeCarry`, the flat as Escape
would leave it. `commit`, `undo`, the persisted `items` and `scene()` (what is saved and
priced) all read `withoutCarry`, so a reload or an autosave in the middle of a carry never
keeps a piece nobody put anywhere. Only the 3D view carries: a tile clicked on the 2D board
is `addItem`, and the page cancels a carry when the view changes.

Every row of that catalogue list is also **draggable straight into the 3D view** (HTML5
drag and drop, `FURNITURE_DRAG_TYPE` on the `dataTransfer`): the studio's workspace accepts
the drop, asks the viewer which floor point and room lie under the pointer
(`ViewerApi.floorPointAt`), calls `beginAdd` for that room, and — once the viewer is carrying
the new item on the next render — sets it down there with `ViewerApi.dropCarriedAt`. A spot
that does not fit leaves the item on the pointer, outlined red, for the person to move. In
the 2D view a drop simply `addItem`s into the focused (or largest) room. With the whole flat
selected, `beginAdd(product, null)` tries the rooms largest first and starts in the first
with space. The items list and the finishes panel open on the whole flat as well: items
grouped under room names, finishes as one "all rooms" picker followed by every room with
what it currently has, a click narrowing to that room.

### The product has to fit the slot (`matcher.ts` → `placeFitting`)

The layout engine sizes a slot from the archetype; the product that fills it has its own
size, often bigger. `matchProducts` now takes the rooms and, for every floor-standing slot,
checks the preferred product's real footprint at the slot — nudged inside the room when it
only just pokes out — against the polygon and the other pieces. A product that does not fit
gives way to the next-best that does; when nothing fits the slot stays empty. Before this a
3.2 m sofa in a 2.4 m room sat through the window.

### Tight passages (`lib/design/clearance.ts`)

`tightSpots` flags a piece a person could not get past: a big piece (≥ 0.8 m², ≥ 1.2 m
long) with less than 60 cm between its long side and a wall, two big pieces less than 35 cm
apart, or anything within 30 cm of a doorway's inside point. Small things (chairs, a
nightstand), the short ends of big ones, touching pieces and floating ones do not count —
the first version flagged half the flat. The viewer draws an amber outline around every
flagged item and the furniture list says how narrow. It is a warning, not a rule: the
layout is still saved as arranged.

### Direct manipulation (`lib/design/manipulate.ts`)

The layout engine *searches* for a spot and gives up if it can't find one. Dragging is the
opposite problem — the user has already decided roughly where a thing goes, and the job is to
make that land cleanly. `snapPlacement` squares the rotation to the nearest wall, snaps the
position to a 5 cm grid, pushes the item flush if it was shoved against a wall, clamps it
inside the room and reports whether it collides. An invalid drop is refused and the item
returns to where it came from, outlined in red on the way.

**A rug gets in nothing's way, and nothing gets in a rug's** (`blockersFor`). `blockingItems`
always left the ghosts (rugs, pendants, artwork, curtains) out of what a dragged piece must
avoid, but the rule ran one way: the layout engine laid the rug under the sofa, and once a
person picked that rug up there was no floor in the room to put it down on again, because
every spot worth a rug has furniture on it. A moving ghost now has no blockers; the walls
still hold it in.

**A piece covers the floor its model covers, not its box** (`lib/design/footprintMasks.ts`,
`lib/design3d/footprintFromModel.ts`). A corner sofa's bounding box includes the corner it
leaves empty, and nothing could stand there. When `loadModel` has a file, the model is looked
at from above on a 12 × 12 grid — a real triangle-against-square test, because the box of a
cushion's diagonal triangle covers exactly the empty corner — and the covered cells are
merged into at most eight rectangles, as fractions of the box (so `fitToItem`'s stretch does
not matter). A model that fills its box (less than 12 % empty) or is too ragged registers
`null` and stays a box. `itemFootprints` turns and mirrors the parts with the item;
`snapPlacement`, `rotateItem` and `isPlacementValid` test piece against piece with them and
the *walls* against the whole box (the outside of an L is the outside of its box). The
registry is plain data filled by the viewer, so `lib/design` stays free of three.js; until a
model has loaded, and everywhere else (`placeFitting`, `placeAdditional`, `tightSpots`), a
piece is its box, which only ever errs on the side of keeping things apart.
`tests/unit/design3d/footprintFromModel.test.ts` runs the real Kenney corner sofa through it.

**Any angle.** The card's angle row (`SwapPanel.onRotateTo`: a slider and a number, degrees
clockwise from facing +Z) turns the selected piece to an exact angle in place —
`rotateSelectedTo` in the studio is `placeItem` with the new rotation, and the outline goes
red when the turned piece no longer fits (`isPlacementValid`), exactly as the 45° buttons
do. A later drag still squares a rotation that is within 14° of a wall; one further off
stays as set.

**A wall-hung piece goes on the wall face under the pointer, at the pointer's height**
(`hangOnWall` in `lib/design/manipulate.ts`, `hangTargetAt` in the viewer). A mirror, a
picture or a clock (`placement.type === 'wall-mounted'`) carried or dragged in 3D used to
follow the ray's meeting point with the horizontal plane of its own base like everything
else, and a pointer on a wall face has no such point: above the piece's height the ray met
the plane *behind* the wall, below it *short* of the wall, and `snapPlacement`'s nearest
wall to that point was the wall opposite, or the neighbour's room. Now the ray is cast at
the room shell first: a wall face under the pointer names the wall — its own side, or the
room behind a far face, through `wallSideOf` — and the piece hangs flat on that wall,
centred under the pointer along it and kept off its ends, at the height the pointer met the
face (its base between the floor and the top of the room). That height travels as
`elevationM` on the placement (`Placement.elevationM`, `onPlaceItem`'s fifth argument,
`placeItem`'s fifth) and is the one way to set a hung piece's height: the card has no field
for it. A grab off the piece's centre keeps its offset along the wall and up it while the
drag stays on that wall (`DragState.hang`). Over the floor a hung piece still snaps to the
nearest wall from the floor point, as before; on the 2D board nothing changes, since a plan
has no faces and no heights.

`rotateItem` deliberately does *not* go through `snapPlacement`: re-aligning the rotation to
the nearest wall would instantly undo every rotation of anything already sitting flush. It
also never refuses: when the turned piece fits nowhere near where it stands, it turns anyway
and comes back `valid: false`, the selection outline goes red (`isPlacementValid`), and the
person drags it somewhere it fits — a refused drop puts it back where it came from. Refusing
the turn made a sofa impossible to rotate in any room without spare floor.

`buildWalkable` + `canStandAt` are the walk-through's collision: room polygons are separated
by the thickness of the wall between them, so each door contributes a portal box that bridges
the two — otherwise you could not walk through your own doorways.

### Keyboard panning, time of day, photos (`Viewer3D.tsx`, `lib/design3d/daylight.ts`)

In the orbit view **WASD and the arrows slide the view** across the flat: the camera and
its orbit target move together along the camera's own forward and right projected onto the
floor, so W is always "up the screen"; shift doubles the speed. Matched on `event.code`
like everything else, ignored while an input has focus, and owned by the viewer (walk mode
has its own controls) — the studio page only handles 1/2/3, R and Escape.

**Time of day** is a preset in the top bar (morning / noon / evening / night → hours 8, 13,
19, 23). `lightingForHour(hour, style)` is pure arithmetic over a 24-hour clock: the sun's
position swings east to west and rises and sets, its colour warms when low, the sky and the
exposure follow, and from dusk the flat's own lights come on — one `pointLight` per room
under the ceiling, sized to the room, plus the shared window glass material turned
emissive so the windows glow from outside. The style still tints the sun and the lamps.
Tested in `tests/unit/design/daylight.test.ts`.

**Photos.** The camera button (`ViewerApi.screenshot`: render, then `toDataURL` — the
canvas does not keep its buffer between frames) opens `PhotoDialog` with the shot and asks
whether to make a realistic photo of it. Yes saves the design if it is not saved yet (a
draft is enough — `ensureSaved` → `saveDesign`), posts the PNG with the room name and the
camera pose to `POST /api/design/renders`, which stores it under `renders/` and queues a
`project_renders` row, and then tells the person the render is being made, that they can
keep taking photos or moving furniture, and that it will be in their profile under the
project — where `ProjectRenders` lists every shot with its status and a download of the
screenshot now and of the render once `renderUrl` is set. Guests are asked to sign in
first. **No generator is wired to the queue yet**: rows wait in `queued` until an image model
(or a person) fills `renderUrl` and flips the status.

### Autosave and drafts (`hooks/useAutosave.ts`, `saveDesign.ts`, `saveProject.ts`)

A signed-in user's work is written to their project row as they go. `DesignAutosave` (in
the design layout) and `CalculatorAutosave` (in the calculator layout) hash the store slices
that matter into a signature; `useAutosave` waits 2.5 s after the last change, never races
an in-flight write, never writes the same signature twice, and does nothing for guests
("log in to save" remains their path). Both go through the same client helpers the summary
buttons use — `saveDesign` / `saveCalculatorProject` — so an autosave and a press of "save"
send identical payloads into the same row (`projectId` is written back to both stores).
The payload carries `draft: true`; the routes then insert as `draft` and leave an existing
row's status alone, while an explicit save (`draft: false`) turns a draft into `saved` and
never touches `submitted`. Autosaves have their own rate bucket (`RATE_RULES.autosave`) so
the 20-per-hour limit on explicit saves still holds. A new plan (`setPlan`, `replaceRooms`)
still clears `projectId`, so a new flat is a new row — expect a draft per flat someone
started. Drafts (and saved projects) are deletable from the profile: `DELETE
/api/projects/[id]` (owner, or admin; ordered projects are refused with
`PROJECT_HAS_ORDERS`), removes the renders' files, and `DeleteProjectButton` /
`DeleteDraftsButton` also forget the id in the browser so the next autosave does not write
into a row that is gone.

### The flow: resume, lock, start again (`components/flow/FlowGuard.tsx`, `lib/flow/reset.ts`)

**Resume.** The first step of a journey already under way hands back to where it was left
rather than showing a blank sheet over the top of it — never past the studio, though, when the
flat has not been laid out yet, whatever page happened to be open last. A page only claims a
step when it has something to show: a studio with no plan is the "upload one first" card, and
claiming step 5 there sent people back to it for ever.

**Lock.** Once `generated` is set, every step *before* the studio is shut — a padlock in the
strip (`StepStrip.lockedBefore`) and a redirect if the URL is typed. In the renovation order
the technical step comes after the studio and stays open. The studio's "lay it out again"
button is gone for the same reason.

The calculator has the same pair, around its own hinge: pressing "გამოთვლის დაწყება" sets
`calculatorStore.calculated`, which shuts step 1 (`lockedBefore={2}`, the padlock's tooltip
`flow.lockedStepCalculator` — the estimate has been worked out, not the design) and hands the
first step on to wherever the journey got to. Redrawing the rooms or changing the home state
there would pull the ground out from under every quantity and every pick made since.

**The mark only ever moves forward.** `StepIndicator` records the step it renders, but only
when the page really has that step to show (every page also has an "finish the previous step
first" state) and only when it is further on than what is stored. The step is how far the
journey got, not which page is open: walking back to change a product must not throw the rest
away, and step 1 — which the guard bounces off the moment it loads — was rewriting a 5 to a 1
on its way out, so "ნახე ბინა 3D-ში" and back landed on the materials step instead of the
summary. The design flow records on its "next" buttons, which never went backwards.

**Start again** is therefore in the strip on every step of both journeys. It asks first and
says what is at stake — nothing yet, work that was never saved, or a design that took a
generation to make — and `resetFlow(kind)` empties **that journey and not the other**: the
calculator's empties the calculator and its drawing board, the studio's empties the studio. It
emptied all three for a while ("two halves of one project"), and that cost people their
design: a flat furnished in the studio was gone the moment a new estimate was started. A
project the two really share lives in its row on the server, where neither reset reaches it,
and a calculator that starts over lets go of the project id so its next save is a new row.

### Two modes

- `mode: 'design_only'` — the home is finished; only furniture and decor are costed.
- `mode: 'full'` — also folds in bulk materials and labour from the existing calculator engine.

### Steps 1 and 2: the way in, then the board (`app/(main)/calculator/page.tsx`, `plan/page.tsx`)

**The plan is a step of its own** (September 2026). Step 1 is the way in and the home's
condition: upload a plan (the `PlanUploadCard` with `showContinue={false}`, so it has no
button of its own — it hands the plan to page state as soon as the area makes sense, and
nothing is kept until the one "გაგრძელება" at the bottom) or say you will draw one, and the
home state below. Step 2 (`/calculator/plan`) is the board — the uploaded plan to check, or
a blank sheet to draw on, with the inspector and the rooms panel beside it — and that is
where "გამოთვლის დაწყება" is pressed, once there are rooms. It sets `calculated`, which
shuts both steps (`lockedBefore={3}`; the `CalculatorFlowGuard` on either sends a return
onward). Until then the two are open to each other: step 1 only bounces when the journey is
past the board. The persisted step is version 3 (`migratePersisted` shifts a version 2
journey's materials and everything after by one; a version 1 journey gets both shifts).
Seven steps: way in · plan · materials · catalog · placement · furniture · summary.

Room sizes are exact: the form and the room list take any value to the centimetre
(`step 0.01`; the list's `SizeInput` commits on blur so "3." is not rewritten under the
cursor), and handle drags snap sizes **and positions** to 1 cm (`MOVE_STEP_M`); the 25 cm
grid is only drawn. A 3.32 m room is a 3.32 m room. What replaces the grid is
`snapToNeighbours` in `lib/calculator/layout.ts`: while a room is dragged, each axis looks
at every other room it is roughly alongside and jumps onto the nearest edge within 30 cm —
its left wall onto their right wall (or the reverse), flush left walls, flush top walls —
so pushing a room up to a neighbour puts the two on one shared wall, with an orange guide
line drawn across both while it snaps. Stationary rooms never move; the tests in
`tests/unit/calculator/layout.test.ts` pin the rules. The same editor serves the studio's
step 1.

The calculator starts from the plan, not the home state: upload a 2D plan or draw one on the
same board the studio uses (`PlanWorkspace` with the wall, room, door and window tools),
the home state below. The plan lives in the design store; `useCalculatorPlan` reads the
calculator's `rooms` off it after every edit (`calculatorRoomsFromPlan`: width and depth
from the outline, `x`/`z` from its corner) and rebuilds the plan from the calculator's rooms
when they belong to a different flat — **in one step from one snapshot of both stores**
(`reconcileCalculatorPlan` in `lib/calculator/planSync.ts`, tested for settling in one
round). It used to be two effects, each reading the other store from its own render: with
two different flats one put the rooms' flat into the plan while the other put the *old*
plan's rooms into the calculator, the next render saw two flats again, and every round grew
a sliver room until React stopped it ("Maximum update depth exceeded" at `setPlan`, a
166-room tower on the board). A room typed by size (`RoomsPanel`) becomes four walls
at the first free spot a wall's thickness clear of the rest (`findFreeSpot` in
`lib/calculator/layout.ts`). **A re-uploaded plan is a new project**: `replaceRooms` drops
every product and furniture pick along with the rooms; `setRooms` only prunes furniture of
rooms that vanished. The summary's "start over" empties both stores (the plan lives in the
design store) and returns to step 1, confirming first when no project row exists yet.

### One project, both halves (`lib/api/projectSave.ts`, `lib/projects/saved.ts`)

A calculation and a 3D design of the same flat are one `projects` row. Both stores carry a
`projectId`: the calculator's save sends it and the route updates the caller's own, not yet
ordered row instead of inserting (`ownProject`); the design save does the same, and when the
design grew out of a calculation that was never saved it sends the calculator's picks along
(`calculator` in the payload) so the new row has both halves at once. `projectKind(row)`
reads the halves back — `selectedProducts IS NOT NULL` is a calculation (an empty object
when nothing was picked), `plan IS NOT NULL` a design — and `ProjectKindTags` shows both
tags on the profile list, the project page and the admin list. A new plan (`replaceRooms`,
`setPlan`) drops the id: a new flat is a new project. Ordering does not fork a project either
— see the marketplace section.

`CalculateCostsButton` is the other direction: a design-first project opens in the
calculator with the plan's rooms (`planToCalculatorRooms` keeps their positions) and the
same id, so the estimate lands in the same row. A renovation + design project chose a home
state in the studio, so it counts as having a calculation (`hasCalculator` is also true for
`mode = 'full'`), the button reads "open in the calculator" and lands on the materials step
— step 1 is done; a design-only project lands on step 1 to choose the home state. The
studio's products come along as the calculator's picks (`picksFromScene`: items become the
room's furniture, the first finish per category the category's material) so nothing is
chosen twice, and step 1 shows the plan already on file instead of asking for it. The
project page lists the studio's products by store (`designLines`) under the calculator's own
tables, and each partner order under it unfolds into its lines.

Going the other way with a design already saved for the project, the summary's 3D button
reads "view in 3D" and `startFromCalculator` keeps the existing design (same `projectId`,
same rooms) instead of laying the flat out again; the studio applies the calculator's new
picks on entry (`pendingPicks` → `applyPendingPicks`). `OpenIn3dButton` reads "create in
3D" for a project without one.

`StoreOwnerGuard` (root layout) remembers whose work the two localStorage stores hold and
wipes both when a signed-in user signs out or a different account signs in — the next person
on the same computer used to find the previous user's plan waiting. A guest's work survives
signing in; that is the "log in to save" path.

The design page's mode block defaults to design only; choosing renovation + design reveals
the calculator's four home states (old renovation first), and the studio prices against the
chosen one.

**The third way in is an empty start** (`designStore.emptyStart`, `chooseEmptyStart`,
`startEmpty`). The card beside "design only" and "renovation + design" on step 1 opens the
studio on the flat as drawn with every room empty: no layout, no furniture, no fittings, the
style's ordinary finishes, no style test and no technical step — the person furnishes it
from the catalogue. It is priced as `design_only` (the flag is the studio's way in, not a
kind of project; the row's `mode` stays what the database knows). With rooms to open on
(an uploaded plan, the calculator's rooms) step 1's continue goes to the studio at once; a
blank sheet is drawn on step 2 first, whose continue then reads "to the 3D studio" and hands
on. `startEmpty` is the journey's hinge like `generate` — `generated`, step 5, no versions,
an empty history — so the steps before the studio close behind it, and version 01 (taken by
`ensureExistingVersion` on the studio's first open) is the empty flat. Choosing either of
the other two cards, a saved project and a calculation coming in all put the flag down.

**Each mode says what it covers, and each home state says what that means.** "Design only"
sounded like it might still include the wiring and "renovation + design" like it might not
include the sofa, so both cards carry a list (`modeDesignOnlyCovers` / `modeFullCovers`)
and the chosen one a qualification underneath. Once a home state is picked, `homeStateCover`
gives it three columns: what is already standing, what the estimate will charge for, and
**what happens to the technical points** — the column that was missing. A green frame has
its sockets and pipes already, so the technical step records where they are rather than
pricing them; a black frame draws them from scratch and pays for them. Keep that third
column truthful if the phase gating changes: it is the one thing customers were getting
wrong about the whole flow.

### The project page folds (`components/projects/ProjectDetail.tsx`, `FoldSection.tsx`)

`/profile/projects/[id]` and `/admin/projects/[id]` share `ProjectDetail`: the title on its
own line with the action buttons under it (side by side, the buttons squeezed the name into a
column of words), then the blocks in a fixed order — layout · rooms, the calculator's sheet,
the 3D design's budget (each the read-only `BudgetSheet` of that journey as it was left, with
every edit showing what was there before it — `loadProjectSheets`; a renovation designed first
has no calculator sheet of its own, its materials and labour are the design's), photos &
renders (the `renders` slot), orders (the `orders` slot) — each a `FoldSection` (client; the title row toggles, + / − in the
corner, folded by default when the block is empty), and last, never folded, the breakdown.
`ProjectRenders` and `ProjectOrders` render their own `FoldSection`, so a page passes them
in whole.

### Saved projects reopen in 3D (`components/projects/OpenIn3dButton.tsx`)

The profile list, the project page and the calculator summary carry the one button with
depth, `Button3d` (`.btn-3d`, a hard offset shadow the button sinks into). A design project
(`plan IS NOT NULL`) reopens exactly as saved through `designStore.openSaved` and lands in the
studio; a calculator project goes through `startFromCalculator` and lands on the style step.
`lib/projects/saved.ts` cuts the serialisable slice a server page hands the button.
`PlanSketch` draws a saved layout as static SVG — the plan's outlines when there are any,
otherwise the rooms at their `x`/`z`.

### One journey: calculator → 3D (`lib/design/fromCalculator.ts`)

The calculator's first step can take a 2D plan (the same `PlanUploadCard` the studio uses):
`calculatorRoomsFromPlan` turns it into calculator rooms, keeping the plan's room ids, and
the plan itself is parked in the design store. The summary's "ნახე ბინა 3D-ში" button calls
`startFromCalculator`, which reuses that plan (or lays typed rooms out as rectangles), sets
`mode: 'full'` and the real `homeState`, records the picks, and lands on the style step —
the two design steps the user already did are skipped.

On every `generate`, `applyFurniturePicks` puts each furniture pick into its room's slot of
the same **slot** (a bunk bed replaces whatever bed the style chose; a corner sofa the sofa),
placing an extra item when the room has no such slot, and fixtures picked from the materials
catalogue (a toilet, a pendant) take every slot of their kind. `applyFinishPicks` puts a
laminate on the dry floors, a floor tile on the wet ones, paint on dry walls, wall tiles on
wet walls. Everything the user chose is `origin: 'calculator'` (pinned); the matcher's own
picks are `origin: 'style'`; swaps in the studio are `origin: 'studio'`. The hover card and
the finish panel say which. A studio choice always outranks a calculator one.

Only products with a 3D model or a texture are on sale in the calculator's catalogue:
`pnpm models:seed` deactivates everything else in the furniture, sanitary, lighting and
surface categories (the doors, windows and sockets & switches categories are left alone: the
base seed's plain products there stay on sale beside the modelled ones).

---

## Marketplace: how the platform earns (`lib/finance/`)

The platform owns nothing and sells nothing — it connects the customer with the stores and
workers who do, and takes a cut at every step. Two revenue lines, both recorded, neither
collected (there is no payment integration; the fee is shown on the summaries and stored):

1. **A fee per m²** for the project itself — `calculatorFeePerM2` (default 2 ₾) for a
   calculation, `designFeePerM2` (default 12 ₾) for a 3D design. Shown as its own line on both
   summaries ("სულ საფასურის ჩათვლით"), written to `checkouts.platformFee` at checkout.
2. **A commission on every partner order** — `storeCommissionPct` / `workerCommissionPct`
   (default 5 %), overridden per store / worker by their own `commissionRate`. Frozen into
   `orders.commissionPct` when the order is placed so a later rate change does not rewrite history.

```
summary → "შეკვეთის გაფორმება" → CheckoutDialog (name, phone, e-mail; guests welcome)
  → saves the project if it is not saved yet (each summary in its own shape)
  → POST /api/checkout { projectId, customer }
      lib/finance/money.ts     group what is bought by store (calculator: the picks, by a
                               products.storeId lookup; design: the *budget's* product lines —
                               priceScene, see below — by the line's store snapshot, the lookup
                               filling in), one order per store, delivery per store, commission
                               at that store's rate, fee = m² × rate
      lib/finance/orders.ts    one transaction: checkout + orders + items; project → 'submitted'
      lib/finance/notify.ts    mail to every store (MAIL_DRIVER=log in dev → logs/app-*.log)
                               and to the customer; never fatal
design step 8 → "ბრიგადის არჩევა" → BookingDialog → POST /api/bookings { teamId, projectId }
  → a team order for *this* project (saved on the spot if need be); its lines are the project's
    labour as it was left on the budget (`projectLabour`) plus the brigade's own site-management
    line; the brigade accepts or turns it down in its own account
```

**The brigade step** (`app/(main)/design/workers/page.tsx`). The trades the budget calls for,
then the brigades: the ones **free to start first** (`listTeams` counts a brigade's open
orders — `new` / `confirmed` / `in_progress` — against its `capacityJobs`; a busy one is shown,
greyed, with its button off), among those the ones that cover the whole job, and the one this
project already went to at the very top. "Choose" opens the `BookingDialog` with `project`
set, so there is nothing to pick out of a list on the last step of that very project: it says
how many labour lines are being sent and what they come to, saves the design if it has to, and
posts the booking. `GET /api/bookings?projectId=` is what the page reads back, so a customer who
returns sees "order #87 sent · confirmed" and the brigade's message rather than a button that
would send the job twice; a brigade that turned it down can be chosen again, or another one.
**`projectLabour` is the one way to the work a project asks for** (worker and team bookings
alike): a project with a design is read off the design's budget — the calculator's phases, but
also a point for every socket actually placed, the radiators hung, the skirting fitted, only
the works ticked on the technical step — a calculation on its own off the calculator's sheet;
either way less what was ticked off and at the quantities that were set. It used to be the
calculator's estimate worked out afresh, whatever had been edited.

A project can be ordered in two sittings — the calculation first, the 3D design later, or
both at once — and stays one row throughout: `ownProject` writes into an ordered project
too, because the orders are snapshots and desync nothing. Each half's fee is charged once
(one `checkouts` row per half, so the revenue report keeps calculator and design fees
apart), `mergeLines` unites the two halves: the studio's lines win over the calculator's
copies of the same product (the studio inherited those picks), repeated items stay repeated
(six chairs are six chairs), and units an earlier checkout already sent to a store come off
the top product by product (`projectOrderState.orderedQty`). When nothing new
would be charged or sent the route answers `PROJECT_ALREADY_ORDERED`. The checkout dialog
shows one quick line per half — fee, products, a half already paid marked as such — with the
full list a click away, and `GET /api/checkout?projectId=` tells it what was ordered before.
Items nobody sells (product without a store) are left out and reported as `unassigned`.

**A design is ordered from its budget, not from its scene.** `sceneLinesOf` prices the saved
project once — `priceScene(plan, scene, { homeState: project.homeState })` — and
`costLinesByStore` turns the product lines still ticked (`orderedLines`, see "Budget") into
order lines: the furniture and the finishes, and the doors, windows, sockets, switches, lamps
and radiators, which had been budget lines without anybody being sent an order for one.
The store lookup covers every product id on those lines (it used to be gathered from items and
finishes). `sceneLinesByStore(plan, scene, storeOf, { homeState })` is the same thing in one
call. **The home state is not optional in spirit**: in a renovation it decides the phases, and
the phases decide which openings and points are new work, so an order priced without the
project's own would send a green frame its doors. The quantity and the price on an order line
are the budget line's; the unit is the product's own (a radiator's sections go out as so many
`piece`s of a product named "(1 სექცია)", a skirting by `linear_m`); the total is
`lineTotal(qty, unitPrice)`, because that is how `applyOrderEdit` will work it out at the first
edit, and an order whose subtotal moved a tetri when its status changed would be worse than
one that differs a tetri from a sheet. A folded line names every room it covers, clipped to
the 255 characters `order_items.room_name` holds — forty rooms of sockets would otherwise
fail the whole transaction. `mergeLines` needed no change: it already dedupes and nets off
per product, which is what a folded line is. What it does mean is that a line partly ordered
before is now the ordinary case (twelve sockets ordered, a thirteenth added), so the dialogue
shows what is left to send (`CheckoutPart.lines[].unitPrice`), priced as the server prices it,
instead of the whole line again.

**The three callers price the way the server will.** The design's budget page hands the
dialogue the `cost` already on screen. The project page's `OrderProjectButton` prices the row
as saved, with the row's home state. The calculator's summary is the odd one: its own save
writes the *calculator's* home state into the shared row and turns the stored scene into a
renovation (`mode: 'full'`), and the order is priced from that row — so that page prices the
design half as `mode: 'full'` against the calculator's home state, not the studio's.

**Everything an order line is made of is repriced on save.** `POST /api/design/projects`
looked up catalogue prices for `scene.items` and `scene.finishes` only, which was the whole
order at the time. The snapshots on openings (`plan.rooms[].openings[].product`, one apiece),
on fittings (`scene.electrical[].product`, `fixtureQuantity` of them) and on radiators
(`plan.technical.points[].product`, `radiatorSections` of them) are repriced the same way
now, and one the catalogue does not know refuses the save like an unknown sofa does — a price
edited in devtools would otherwise have gone to a store as an order.

**Partner portal (`/partner`)** — a `store` / `worker` account sees its own orders and
nothing else: dashboard (unread, open, this month's sales, the platform's cut, their share),
the order list with status filter, and the order editor (`components/orders/OrderEditor.tsx`):
quantities and prices per line, lines struck out and restored (kept visible for the customer),
added lines, a message to the customer, the status. Every save recomputes `subtotal` and
`commissionAmount` from the items (`applyOrderEdit`); a status or message change mails the
customer. Opening an order sets `viewedAt` and clears the badge. Stores also see their
product list (read-only), workers their public card. Admin can open the portal as any partner
with `?store=ID` / `?worker=ID` / `?team=ID`. `pnpm db:seed:partners` creates the store and
worker logins, `pnpm db:seed:teams` the brigades' (`TEAM_PASSWORD`, or generated and printed
once). **A new order has its answer at the top of the page**: "accept" and "turn down" are the
status select's `confirmed` and `cancelled` in one press (`OrderEditor.answer`), because a
brigade a customer has just chosen should not have to find a dropdown to say yes, and the
customer's brigade step is waiting on exactly that.

The proxy lets in **anybody with a part of the admin** (`canOpenAdmin`), not only `admin`:
asking for the role `admin` there turned both kinds of agent away at the door, to the landing
page, every time — each section's layout is what says which part is theirs.

**Admin** — `/admin/orders` (every order, filters in the URL like the other lists, admin may
edit any order), `/admin/revenue` (period → fees split calculator/design, commissions split
stores/workers, volume, daily bars as static SVG, by store, by worker, top products, statuses,
CSV export at `/api/admin/revenue/export`), `/admin/settings` (the four numbers, with a worked
example before you save). Store and worker forms carry e-mail and commission; the user form
assigns partner roles and links the account to its store / worker. The dashboard shows this
month's revenue and flags orders waiting on a partner and partners without e-mail or login.

The customer sees the orders on the project page (`components/orders/ProjectOrders.tsx`):
status, total, delivery, and whatever the partner wrote back — and can order a saved project
from there (`OrderProjectButton`, the same dialog built from the row as saved).

`tests/unit/finance/money.test.ts` covers the arithmetic — fee, commission, grouping,
delivery, struck-out lines, report periods — and that a door, a fitting and a radiator each
reach their store as the budget counts them, fold into what was ordered before and go nowhere
when ticked off; `tests/unit/design/ticks.test.ts` pins that basket, dialogue and order agree
line for line; `tests/integration/save-routes.test.ts` that a forged door, socket or radiator
price never reaches the row. `lib/finance/money.ts` is in the coverage
gate. Everything that touches the database (`orders.ts`, `report.ts`, `settings.ts`) is
exercised by the routes, not by unit tests.

**Date formatting in client components** goes through `formatDateTime` (`lib/utils.ts`):
`toLocaleString` hydrated differently on the server and in the browser and the order editor
was the first to break.

## API conventions

- Every route returns `{ data, error }` and sets `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`
- Admin writes check `session.user.role === 'admin'` via `auth()` from `@/auth` (`requireAdmin()`); partner writes use `requirePartner()` and check the order belongs to the session's store / worker (`partnerOwnsOrder`)
- Zod `safeParse` on every POST body; return `400` with `parsed.error.message`
- `console.error('METHOD /api/path', e)` then a generic 500 message — never leak internals

## Conventions to follow when extending

1. **Every user-facing string goes through `lib/i18n`** — add the key to `ka.ts` *and* `en.ts`
   *and* `ru.ts` (`Dictionary` is derived from `ka.ts`, so a missing key in en/ru is a type error).
2. **Business logic lives in `lib/` as pure functions**; components render only. The 3D geometry
   builders and the layout engine must stay free of React and of `window`.
3. New tables/columns → `lib/db/schema.ts` + `pnpm db:push`; new payload → `lib/validations/`.
4. Product ↔ material linkage is by **category slug** (`linkedCategorySlug`), not by id.
5. Tailwind theme tokens only: `brand`, `accent`, `ink`, `ink-muted`, `bg-base`, `bg-surface`,
   `line`, `success`/`warning`/`danger`; `shadow-card` / `shadow-cardHover`; headings use `font-serif`.
6. Money is always rendered with `formatGEL()`; areas with `formatM2()`.
7. Three.js code must be in `'use client'` components and dynamically imported with
   `ssr: false` — the geometry/layout libs under `lib/` stay isomorphic and testable.
8. Run `pnpm type-check` before considering a change complete.

## Three.js gotchas already paid for

Each of these cost real debugging time. Don't undo them.

1. **Stop propagation in pointer handlers.** R3F calls a handler once for *every* object the
   ray passes through, nearest first. Without `event.stopPropagation()` in `pick()`, the last
   call — the wall behind the sofa — is the one that sticks.
2. **Handlers go on an R3F-created `<group>`, not on `<primitive>`.** R3F only registers
   objects it constructed in its interaction list.
3. **Selection is resolved from pointerdown/up travel, not `onClick`.** OrbitControls captures
   the pointer, and the click that would follow does not reliably reach the scene.
4. **Never yield with `requestAnimationFrame` before CPU work.** rAF does not fire in a
   background tab, so a user who switches away mid-parse would sit on a spinner for ever.
   `setTimeout(…, 16)` yields just as well and always fires.
5. **Ceilings face down**, so they are backface-culled and invisible from the doll's-house
   camera. The studio exposes a *walls* toggle instead; `showCeiling` stays in `buildScene`
   for a future interior camera.
6. **The dev server's `next/dynamic` chunks go stale** after a run of Fast Refresh edits to
   the viewer (`ChunkLoadError … /_next/undefined`). A hard reload fixes it; it is not a bug
   in the app and does not affect production builds. Separately, and more destructively:
   `pnpm build` or `rm -rf .next` against a *live* dev server makes every page 404 while
   `/public` keeps serving — see the warning next to the command list.
7. **Highlighting must not tint materials.** Materials are cached and shared by colour and
   finish, so setting `emissive` on a mesh lights up every item that shares it. Selection and
   hover use a wireframe outline box instead.
8. **Drag has to listen on the canvas, not on the R3F object.** The moment the pointer
   outruns the object it is dragging, R3F stops delivering moves for it.
9. **`@types/three` is pinned via a pnpm override.** drei pulls a floating newer copy, and two
   copies of the types make `camera.quaternion.setFromEuler(...)` a type error.
10. **Never dispose a GLB clone's geometry.** Furniture wrappers are `clone(true)` of a cached
    model and share its buffers; disposing them makes every model re-upload on the next rebuild.
    Only geometry `buildScene` created itself is tagged `ownsGeometry` and disposed.
11. **Surface UVs are in metres, so `materials.metreSurface` is what tiles them.** Every
    surface the studio builds carries its real size as its UVs (a `ShapeGeometry` floor its
    plan coordinates, a wall its metres along and up), so one tile of a texture covers
    `textureScaleM` metres whatever the surface's size. Passing the surface's own size to
    `surface()` on top of metre UVs tiled it by the *square* of the size: a four-metre wall
    got four times the bricks per metre that a two-metre one did. A map is also only put on
    the material once its image has arrived (`whenLoaded`) — a texture with no image samples
    as black, which is what left a freshly painted strip pitch black for a beat.
12. **The CSP needs `connect-src blob:`.** GLTFLoader hands the textures packed inside a GLB to
    the browser as blob URLs and fetches them back. Without it every model loads untextured and
    the only symptom is a console warning.
13. **Furniture is reconciled, not rebuilt.** `syncPlacedItems` moves wrappers whose product and
    size are unchanged and replaces the rest; the room shells are a separate group keyed on plan,
    finishes and style. Rebuilding everything on every drag was the studio's biggest stutter.
14. **A wall is written out face by face, mitred, and cut where what is behind it changes**
    (`lib/design/wallPieces.ts` + `lib/design3d/wallGeometry.ts`). `ExtrudeGeometry` could
    not do any of the three: a slab as long as the room's inner edge stopped short of the
    corner, so every outside corner and every T-junction had a notch a wall thick cut out of
    it — walls that met on the plan stood apart in 3D. Each piece is now mitred (its far
    face runs on to where the two walls' outer lines cross, or stops short at an inside
    corner), an edge is cut into pieces wherever the room behind it begins or ends (a wall
    shared for four of its six metres used to be half-depth for all six), and the top and
    the cut ends get their own neutral material instead of the room's paper. Where the
    geometry is ambiguous the piece is built full depth and allowed to overlap: a gap is
    what the eye catches, an overlap inside a wall is invisible. The old note still holds
    for *why* a shared wall is half as deep —
    **each half's far face wears the neighbour's finish.** Each room extrudes its own walls outwards by the wall thickness,
    and two rooms either side of one wall sit a thickness apart — so a full-depth extrusion
    from each put room A's outer face exactly on room B's inner face, and the two colours
    z-fought, flicking as the camera turned. `sharedNeighbourOf` halves the depth for
    interior walls so the halves meet on a plane nobody sees while both stand. The cutaway
    hides one half at a time, though, and then the other half's face on that middle plane is
    what the camera sees from the first room — so each piece's far face is painted with the
    material of whoever stands behind *that stretch* (`farSlots`, from `piece.neighbour`).
    Before this the bathroom's tiles showed up on the living-room side of the wall whenever
    the living room's half was cut away.
15. **`visible = false` does not stop a raycast.** Three's raycaster ignores `layers`, not
    visibility, so a cut-away wall still caught every click aimed at the sofa behind it.
    Anything hidden from the pointer goes on `HIDDEN_LAYER` (the cutaway walls, the idle
    opening slabs); the default raycaster only tests layer 0.
16. **`fetch(dataUrl)` is refused by the CSP.** `connect-src` is `'self' blob:`, so the usual
    trick for turning a canvas data URL into a Blob dies silently in the console. The photo
    dialog decodes the base64 by hand (`dataUrlToBlob`). Images may *display* data URLs
    (`img-src` allows them); nothing may fetch them.
17. **The shared glass material is the night-time windows.** Every window pane uses one
    cached `glass` material, so setting its `emissive` at night lights every window at once
    — the one place tinting a shared material is the point, not the bug of gotcha 7.
18. **Screenshots must render first.** Without `preserveDrawingBuffer` the canvas is blank
    between frames, so `ViewerApi.screenshot` calls `gl.render(scene, camera)` and reads the
    canvas in the same tick.
19. **Never set `scale` or `position` on a node that came out of a GLB — wrap it.** The
    fixtures pipeline compresses with meshopt, whose quantisation leaves each node carrying
    an offset and a scale that put its integer vertices back in metres. `attachOpeningModel`
    once stretched a door by writing `part.scale.set(...)` and `part.position.set(...)` on
    the loaded nodes: every leaf stood half in the floor and every window was a third taller
    than its hole. Each part now sits inside a `Group` of its own that carries the stretch and
    the hinge offset. `stretchTo` and `reframe` are fine because they scale the model's root.
## Partner models (`scripts/convert-models.ts`)

Every piece of furniture the studio can place is one of these. The asset drop's OBJ exports
become GLBs through pure npm tooling — `obj2gltf`, `@gltf-transform`, `meshoptimizer` — with
no Blender in the loop. `SOURCES` at the top of the script is the catalogue: one entry per
archive with its archetype, Georgian name, price, store, and whatever the archive needs to
come out right. `pnpm models:seed` then makes the database match the manifest.

What the archives are like, and what each fact cost:

1. **They are scenes, not products.** A file routinely holds the whole range — two MECCANICA
   chairs, four CAYDEN tables at different extensions, nine pendants in a row — plus swatch
   cubes and shadow-catcher planes. `scripts/lib/objGroups.ts` measures every `g`/`o` group
   and rewrites the OBJ with only the chosen ones. The default rule (largest group plus what
   touches it) handles most; `groups: { include }` pins the rest. The peacock chair is the
   opposite case: 193 groups that are *all* one chair, and the automatic rule would have
   dropped its base rings because they sit below the back.
2. **The `.mtl` files say nothing** — 3ds Max placeholder colours, no maps — but the real PBR
   maps usually lie loose in the archive under useless names (`2b2b71175522.jpg`,
   `NODE3.jpg`). `scripts/lib/textureClassify.ts` sorts them by pixel statistics: blue far
   above red and green is a normal map, near-zero saturation is roughness or gloss, colour is
   albedo. Names only confirm. `maps:` on the entry overrides any call it gets wrong. The
   result is embedded in the GLB (albedo, normal, roughness packed into G) and the viewer
   leaves those materials alone — which is why furniture no longer changes colour with the
   style; it changes *product*.
3. **No normals** (`vn=0`); the viewer computes them on load.
4. **Units are unreliable.** mm, cm, inches and metres are tried against `targetSizeCm`, but
   the classic bed is 6134 units long, which is none of them. `sizeFromTarget: true` scales
   the largest axis to the target instead and the other two follow the geometry.
5. **`join` cannot merge across materials**, so strip materials first. **`quantize` rewrites
   POSITION**, so measure and normalise first.
6. **Some geometry cannot be decimated.** The rattan chair's weave is ~60k closed cane
   segments; the simplifier floors at ~260k triangles whatever the error, and meshopt's
   `Prune` flag only shaves that to 240k. So the script compresses instead of thinning:
   `EXT_meshopt_compression` on every model (decoded by three's `MeshoptDecoder` in
   `buildScene`), and a per-entry `maxBytes` for the chair alone.

Orientation is chosen by **fit, not heuristic**. 3ds Max is Z-up, obj2gltf sometimes corrects
for that and sometimes does not, and no bounding box can tell a table lying down from a rug.
So all eight right-angle orientations are scored against `targetSizeCm` and the closest wins;
the stored dimensions come from the geometry, not the target.

The script **rejects what it cannot verify** — proportions off by more than
`MAX_ASPECT_ERROR`, or a file over its byte cap — and says why. A rejected entry drops out of
the manifest, and out of the database at the next `models:seed`. **17 of 17 entries pass**
(12.9 MB; textures are most of it). `--only=a,b` redoes a few and merges into the manifest.

## Stock models (`scripts/stock-models.ts`)

The partner drop is 17 products in three styles and nothing for kitchens, bathrooms, rugs,
lamps or anything modern. Until partners cover those, `STOCK` at the top of the script pulls
a whole apartment's worth of **CC0** furniture so every slot has several options:

- **Poly Haven** — photoscanned furniture with real PBR maps and a rendered photo per asset.
  Real metres, Y-up, glTF with 1k maps. `api.polyhaven.com` refuses requests without a
  `User-Agent`. Files are cached under `<asset drop>/_STOCK/polyhaven/<id>/`.
- **Kenney Furniture Kit** — 140 clean low-poly pieces with isometric renders: the kitchen
  cabinets, fridges, toilets, showers, bathtubs, washers, rugs and floor lamps nobody scans.
  Built at toy scale, so `fit: 'uniform'` sizes each to its archetype and `fit: 'axis'`
  stretches counters and rugs. Stylised on purpose; they are placeholders and tagged as such
  (`brand: Kenney`, `source: kenney` in the manifest).

Style tags are deliberately loose (a gothic chair is `vintage`, a leather lounge chair is
`modern`, `scandinavian` *and* `industrial`) so that every style has 3–4 options per kind.
Prices, stores and Georgian names are ours and fictional.

Two things the script works out per model:

1. **Which way it faces.** Seating and beds: the tallest part is the back, so the offset
   from the top third's centroid to the footprint centre points forward. Cabinets: the
   extreme side carrying the most vertices is the back panel — trusted only when it wins by
   2.2×. Everything else is symmetric. Front ends up along +Z, which is what `edge.facing`
   assumes; `yawDegrees` overrides a wrong guess.
2. **Which nodes are the product.** Some Poly Haven files are small scenes (a cabinet open
   beside the same cabinet closed); after `flatten` the largest node plus whatever touches it
   is kept, or `nodes: /regex/` pins it.

Output is the same manifest shape as the partner pipeline, plus `styles`, `source`,
`license`, `brand`; `pnpm models:seed` reads both manifests.

## Wall-mounted geometry: use `edge.facing`, never the edge direction

`edge.facing` is the rotation that puts a box's **width along the wall** and its **depth
through it**. `Math.atan2(edge.dir.x, edge.dir.z)` is 90° off and lays everything across the
wall at right angles — that bug shipped once in the window frames, door casings and skirting
and is very easy to reintroduce. Doors also have to pivot from a group placed at the hinge;
rotating the leaf itself spins it about its middle like a revolving door.

**Every object in the studio is a GLB; only the architecture is built from the plan.**
Floors, ceilings, walls with their holes, free walls, columns, beams, skirting and floor
zones are geometry computed from the plan (they change length with every edit); the
editing aids — opening slabs, the wall drag ghost, outlines, the ghost box of a model that
failed to load, the admin turntable's grid and arrow — are helpers. Everything else a
person looks at, down to a socket plate, a ceiling rose or an LED strip, is a `.glb` under
`public/models` with a manifest entry: add a file, not a `box()`. `public/` holds no other
model format; the uploader takes only binary glTF.

## Drizzle: correlated subqueries don't correlate

A `sql` template with a correlated `select count(*) ... where products.store_id = stores.id`
inside a `.select({})` silently returns 0 for every row — it is emitted uncorrelated. Use
`leftJoin` + `groupBy` + `count()` instead. The store list hit exactly this.

## Operations

Everything the app needs to run unattended on the VPS, and where each piece lives.

- **Environment** is validated once at startup by `lib/env.ts` (Zod). A missing or malformed
  variable stops the process with the variable named; production insists on a real
  `AUTH_SECRET` and `DATABASE_PASSWORD`. Server code imports `env`, never `process.env`.
  Scripts run with `tsx` load `.env.local` / `.env` through `import './lib/loadEnv';` as their
  **first import** — imports are hoisted, so a `config()` call after them ran after `lib/env.ts`
  had already validated an empty environment (masked in development by the defaults).
- **Logs** are JSON lines from `lib/log.ts` to stdout and to `logs/app-YYYY-MM-DD.log`
  (`LOG_DIR`, git-ignored). `handle()` in `lib/api/route.ts` logs every request with route,
  status and duration, and every unhandled exception with its stack. PM2 captures stdout into
  `logs/pm2-*.log`. There is no error tracker yet; `tail -f logs/app-*.log` is the tool.
- **Health** is `GET /api/health`: 200 with `{ status, checks.db, uptimeSec, version }`, 503
  when MySQL does not answer within 3 s. Unauthenticated and unthrottled — the deploy script,
  Nginx and any uptime monitor call it.
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
  Vercel function is capped at 4.5 MB, which `/api/upload/model` (40 MB GLBs),
  `/api/design/upload-plan` (12 MB) and the 8 MB photo and render routes exceed — see the
  roadmap. The in-memory rate limiter and login lockout are per instance there.
- **Deploy** is `deploy/deploy.sh <tag>`: clone → install → migrate → build → switch the
  `current` symlink → `pm2 startOrReload` → health check, with automatic rollback to the
  previous release on a failed check. `deploy/rollback.sh` does the switch by hand. The
  GitHub Actions `Deploy` workflow runs it over SSH for every `v*` tag after CI passes;
  `ecosystem.config.cjs` is the PM2 definition and `deploy/nginx.conf` the site config.
- **Uploads** go through `lib/storage` (`STORAGE_DRIVER=local|s3`). Keys look like
  `plans/<file>`; the local driver writes under `public/uploads`, the S3 driver to any
  S3-compatible bucket (R2, MinIO) served from `S3_PUBLIC_URL`. Every upload is identified
  by its bytes (`lib/uploads/sniff.ts`), never by the declared type.
  `pnpm uploads:cleanup` (nightly cron) deletes plans no project references.
- **Mail** goes through `lib/email.ts` (`MAIL_DRIVER=log|smtp`). With `log`, the reset and
  verification links are written to the app log — that is how to find them in development.
- **Auth**: five wrong passwords lock an account for fifteen minutes (`lib/auth/lockout.ts`,
  in memory like the rate limiter). Password reset and e-mail verification use single-use
  hashed tokens in `auth_tokens` (`lib/auth/tokens.ts`). Google accounts are verified on
  creation. Verification is encouraged, not required: an unverified account still works.
- **Tests**: Vitest covers the money engine, pricing, matching, the API helpers and both save
  routes (coverage thresholds in `vitest.config.mts`, enforced in CI); `test:parser` and
  `test:solver` cover the plan pipeline; Playwright (`e2e/`) drives the public pages, the
  auth pages and the sample-plan studio journey against a running server.

## Known gaps / roadmap

- New walls are drawn in the 2D view only; in 3D a wall can be selected, unlocked and
  dragged sideways, not drawn. Rooms are likewise selected and dragged in 2D only. Rooms that
  share a wall cannot be pulled apart by dragging — undo, or delete and redraw, is the way
  back — and a plan saved while detaching still existed may hold two walls a few centimetres
  apart that nothing repairs on load. A door on an outside wall that becomes a shared wall when
  its room is pushed against a neighbour stays one-sided (no twin is cut in the neighbour). Floor
  zones are drawn in 2D (the whole room, one wall, half the floor, a painted tile, a painted
  strip and a painted wall patch all work from 3D). Beams are not obstacles for the layout
  engine.
- A model's real footprint (`footprintMasks`) is known only once the 3D view has loaded that
  file in this session; the 2D board still draws every piece as its box, and the layout
  engine, the matcher's fit check and the tight-passage warning all use the box.
- The wall graph is rectilinear in practice (angled walls draw and enclose rooms, but the
  room programs, `snapPlacement` and the footprints assume right angles).
- Estimates for pipes and air conditioning (`lib/design/technicalRates.ts`) are market
  averages, not products. Doors, windows, sockets, switches, lamps and radiators are
  products now, and fall back to the same estimates only where the catalogue has none of
  their kind. A radiator's *sections* are counted from the room's heat demand, which is a
  rule of thumb (~100 W/m²) and not a heat-loss calculation: no window area, no glazing, no
  storey, no outside design temperature. A heating engineer's numbers would want all of them.
- The four radiator designs are ours, written in code (`scripts/radiator-models.ts`), not a
  manufacturer's range: the watts per section are plausible, the prices made up. Kitchens are
  measured at `KITCHEN_RATES`, which are Tbilisi averages rather than a joiner's quote, and
  only the run and the island are measured — a fitted wardrobe is still an off-the-shelf
  product.
- The mouldings are swept from five profiles; a real cornice range has dozens, and nothing
  reads a profile out of a supplier's drawing. Curtains, still, have no model anywhere.
- A summary's edits are ticks and quantities on the lines the sheet works out; a line cannot
  be *added* there, a price cannot be changed, and a folded line (a finish over every room it
  is on, twelve sockets of one model) is edited as a whole. The calculator's sheet shows no
  delivery — its estimate never included it; the orders do charge it — while the design's does.
- A brigade's availability is its open orders against `capacityJobs`, nothing more: no
  calendar, no dates, and an order it never answers keeps it "busy" until somebody closes it.
- What a flat "already has" is ten ticks, not a survey: ticking "sockets" excludes every
  socket in the flat, not the three that are actually there. On the budget a placed piece is
  ticked on its own, but a line the budget folds per product — a finish over every room it is
  on, the doors of one model, the sockets of one model, the radiators of one design — is in or
  out as a whole.
- The two halves of a project agree on a product only by its id. The studio inherits the
  calculator's furniture and finishes, so those are one order line; it does not inherit a door,
  a window or a socket picked in the calculator (`applyFinishPicks`: "a pick that is not a
  finish is simply not a finish") and gives every opening and point a product of its own. Now
  that the studio's doors and fittings are ordered, a project with both halves whose calculator
  picked door A while the studio hung door B is sent both — the same thing a sofa swapped in
  the studio has always done to the calculator's sofa. The tick on either summary is the way
  out until calculator picks of those kinds reach the openings and the points.
- The project page's "3D design products" block (`designLines` in `ProjectDetail`) still walks
  the scene — furniture and finishes, whatever is ticked — so it lists neither the doors, the
  fittings and the radiators the order button beside it will send, nor leaves out the
  made-to-measure kitchen it will not. It is an inventory, not an order, which is why it was
  left; reading `cost.baskets` would make the two agree.
- The checkout dialogue totals the goods and the fee; the delivery each store will add is on
  the budget (`cost.baskets`) and on the order, not in the dialogue.
- A wall's own height is drawn, not priced. Every area the budget works out — a room's walls,
  one wall, a strip, a square metre, the calculator's plaster and paint — is against
  `room.heightM`; a wall raised in the inspector costs what it cost before. The room's
  "ceiling height" is the field that moves walls, cornice and quantities together. Ceiling
  lights and pendants hang from `room.heightM` too.
- Each finish is priced by its own area: a base wall finish is charged for the whole room's
  walls even where one wall, a strip or a square metre of another product lies over it, so
  overlaid finishes over-count the base by the area they cover.
- The e2e studio spec walks all eight steps but is not run in CI (needs the DB).

- Uploads are local disk on the VPS and cPanel hosts, a bucket on Vercel (`STORAGE_DRIVER`).
  No PDF export. No SMS.
- On Vercel a request body is capped at 4.5 MB, so a GLB, a large plan image or a studio
  photo above that is refused with 413 before the route runs. The fix is a direct upload
  into the bucket (a presigned PUT handed out by `/api/upload/*`, the byte sniff and the
  record afterwards); not built.
- A brigade's rating, reviews and completed jobs are fields, not a history: nothing computes
  them from finished orders yet, and a team has no portfolio of its own (its workers do).
- The marketplace records money but does not move it: no payment integration, no payout to partners, no invoices. Stores add and edit their own products and workers their own card, but reviews and portfolio are still seeded, not partner-managed, and an approved store's new products go live at once with no moderation step.
- **Realistic renders are queued, not produced.** `project_renders` rows wait in `queued`; wiring an image model (the plan is an AI API called with the screenshot and the scene) means a worker that reads the queue, writes `renderUrl` and flips the status — the profile page already shows both states.
- PDF plans: only the first page is rasterised; a multi-page set has to be split by hand.
  The plan *export* is one A4 page with the drawing on it as an image — no vector geometry,
  no selectable text, no furniture schedule, no second sheet.
- Autosave keeps one draft per flat someone started (a new plan is a new row); the profile's "delete drafts" is the broom.
- The partner drop is 17 models in three styles — **MODERN has no partner furniture at all**
  (its folder holds a `.max` kitchen and nothing else) — and no partner sells a wardrobe,
  kitchen, bathroom fixture, rug, lamp, plant, desk or bookshelf. Those slots are filled by
  CC0 stock (see "Stock models"), which is placeholder furniture: Kenney's pieces are
  visibly low-poly, and Poly Haven's skew rustic. Curtains have no model anywhere and stay
  empty. `matchProducts` still falls back across styles when a style has nothing for a slot.
- Partner archives carry one placeholder material per part (`wire_027177027`), so a daybed
  with an oak frame and a plaid mattress is textured as all oak. Per-part maps would need a
  render to tell the parts apart; the current single material per model is the honest
  compromise, chosen by eye per entry in `SOURCES`.
- Which way a chair *faces* is not derivable from geometry — set `yawDegrees` on the source
  entry by eye when one comes out backwards. The Cinquanta lamp is a 2.3 m two-arm fixture
  and reads as a pendant only in a large room.
- Floor-plan parsing has two paths: Claude reads the drawing when `ANTHROPIC_API_KEY` is set,
  and the deterministic CV parser takes over when it is not. The CV path cannot read
  dimensions, so it still asks the user for the total floor area.
- The AI path has not yet met a real plan with a real key. Everything around the call is
  done — `pnpm plan:ai <file>` runs one drawing through the reader and prints the reading,
  the parsed labels, the solved walls and the residuals; `--save reading.json` keeps the raw
  reading and `--replay reading.json` rebuilds the plan from it without a key, which is how
  to tune the solver deterministically. The route downsizes images to what the vision API
  accepts (5 MB, ~1568 px) with `sharp`, logs tokens and duration per read, and rooms whose
  printed dimension the solver could not honour come back `lowConfidence` so the review step
  points at them. First contact will most likely want prompt and label-parsing tuning.
- The walk-through has no collision at all — walls, furniture, nothing stops the viewer.
  Deliberate: a design tool wants to be explored, not navigated, and getting stuck reads as a
  bug every time. `buildWalkable` only picks the starting spot now.
- Surface finishes are per room: the studio's right panel offers every catalogue product with
  a `textureUrl` for the focused room's floor and walls (or all rooms at once), priced by the
  room's area. `pnpm textures:stock` is what gives products textures; a product without one
  never appears there. Ceilings stay on the style default.
- Admin has no bulk import: one GLB per product through the form. Converting a partner's
  archive drop is still an entry in `SOURCES` per archive and `pnpm models:convert`.
- Partner stores and their prices in the seed are **fictional** placeholders for the Georgian
  market. Replacing them with signed partners is a data change, not a code change.

## Design system (September 2026 redesign)

Tokens live in `tailwind.config.ts`; the few shared utilities in `app/globals.css`.

- **Surfaces**: warm paper `bg-base` (#F5F2ED), white cards, `sand` for in-between panels,
  `bg-deep` for the one dark band. `.glass` / `.glass-dark` are the frosted panels used over
  imagery and the 3D canvas; `.grain` adds paper texture to large flat areas.
- **Type**: `.display` (heavy uppercase sans, tight tracking) with the `text-display-*`
  clamp scale for hero and section titles; the serif for ordinary headings; `.eyebrow` for
  the small-caps label above them; `.bracket-link` for secondary "( link )" actions.
- **Motion without JavaScript**: `.reveal`, `.reveal-scale`, `.reveal-stagger` and
  `.parallax` are CSS scroll-driven animations (`animation-timeline: view()`), guarded by
  `@supports` and reduced-motion — content is fully visible where they are unsupported. The
  hero words use `.hero-word` (load-time stagger via `--i`). `animate-marquee`,
  `animate-spin-slow`, `animate-float` are the only looping animations.
- **Scroll sequences** (`.seq` + `.seq-fill/-wipe-up/-wipe-right/-pop/-fade/-fade-out/-rise`,
  and `.drop-in`): an element plays between `--from` and `--to` percent of its `cover` range
  (0 = top edge enters at the bottom of the viewport, 100 = bottom edge leaves at the top; a
  card is fully in view around 35–65). Siblings with staggered ranges play one after another
  — the landing's "no designer" cards are built from these. **Never put a `.seq` element
  inside `overflow-hidden`**: that makes the box a scroll container and `view()` measures
  against it instead of the page, so every step finishes instantly. Clip with
  `overflow-clip`, which does not create a scroller.
- **Landing** (`components/landing/*`): every image and figure is live data — the product wall
  and the floating price chips are real catalogue rows, the stats are database counts.
- **Studio** (`app/(main)/design/studio/page.tsx`): full-bleed canvas, everything else floats
  — see "The studio's build mode" above. `ViewSwitch` (2D / 3D / walk) and `ZoomControls`
  drive the viewer through the `ViewerApi` it hands back via `onApi`. **Keys are matched on
  `event.code`**, never `event.key`: on a Georgian layout W types წ, and matching the
  character left the viewer standing still.
- **Build-mode surfaces** (the eight-step flow and the studio) use rounded panels
  (`rounded-[12px]`…`[20px]` arbitrary values, since the theme's radius scale is collapsed),
  frosted white bars and big icon tiles with labels; room tints, origin colours (existing
  ink / changed terracotta / generated teal) and technical-system colours live in
  `components/plan/palette.ts`. The editorial site outside the flow keeps sharp corners.
- **Header**: transparent over the landing hero, frosted once scrolled or on any other page.
  The landing hero uses `-mt-[72px]` to sit under it; `HEADER_HEIGHT_CLASS` is the height.
- **Corners are sharp outside the build mode.** The Tailwind radius scale is collapsed to
  0–4 px, so `rounded-2xl` in an older component renders as a crisp edge; do not reach for
  `rounded-full` on buttons, chips or panels — it is reserved for things that are genuinely
  circles (avatars, colour dots, the rotating badge). Cards are flat: hairline `border-line`,
  no shadow. The primary button is `variant="ink"` (near-black, terracotta on hover). The
  design flow and the studio are the deliberate exception (see "Build-mode surfaces").
- **Step flows** (`components/flow/*`): both journeys — calculator and studio — are built from
  the same parts. `StepStrip` is the numbered index under the header (`StepIndicator` and
  `DesignSteps` are thin wrappers that supply labels and hrefs); `StepHeader` is the
  "STEP 02 / 05" head with title, lead, meta and actions; `SectionHead` numbers sections
  inside a step; `StepNav` is the sticky bottom bar (back link, running total, one primary
  action); `SideList` is the hairline index used for categories and rooms; `EmptyStep` is
  the "finish the previous step first" card. `Figure` (in `MaterialsTable`) is the large
  number-in-a-cell used for stats and subtotals.
- **Product page** (`/catalog/[slug]`): no "add to project" button any more — the calculator
  and the studio are where products are chosen. "See in 3D" (`ProductModelDrawer`) opens a
  drawer on the same page with the product's own GLB on a turntable (`lib/design3d/modelPreview.ts`,
  plain three.js loaded on demand, the product's materials as shipped) and a link into the
  studio at the bottom. The drawer's content is portalled, so the host element is a callback
  ref in state — an effect keyed on `open` alone ran before the host existed.
- **Catalogue** (`/catalog`): server-rendered with a real sidebar — categories in two groups
  (materials by phase, then furniture) with live counts, and partner stores — and a toolbar
  above the grid with search, a multi-select style dropdown (`style=modern,vintage`, OR),
  a price band, the result count and sort. Every control is a link or a GET form built
  with `hrefWith` from `lib/admin/list.ts`, so any filtered view is a URL and the page works
  without JavaScript; only the sort `<select>` and the style dropdown are client components.
- **The workers' directory is switched off** (`WORKERS_DIRECTORY` in `lib/features.ts`,
  September 2026): a renovation is hired as a brigade, so the site sends people to `/teams`.
  The header, the footer and the 404 page link to the brigades instead, a brigade's members
  are names rather than links, the worker's "public card" button is hidden in the portal, and
  the proxy answers `/workers` and `/workers/[id]` with a real 307 to `/teams` (a `redirect()`
  in the page only fires once the layout has begun to stream — a 200 and a one-second meta
  refresh). The workers themselves stay: brigades are made of them, admin manages them, they
  register and keep their card. One word switches it all back on. What the pages are:
- **Workers** (`/workers`, `/workers/[id]`): the same shape as the catalogue — specialties
  with counts and cities in the sidebar, search, a verified toggle, count and sort in the
  toolbar, `WorkerCard` plates that link to the profile. The profile shows the bio, the
  portfolio (`worker_works`) and the reviews (`worker_reviews`) with a rating breakdown;
  admin edits city/experience/completed jobs, while reviews and works come from
  `pnpm db:seed:workers` until there is an admin screen for them. Only specialty links carry
  `aria-current="page"` (the e2e test counts exactly one). On small screens a
  checkbox (`#catalog-filters`, `peer-checked`) shows the sidebar. Only category links carry
  `aria-current="page"` (the e2e test counts exactly one). `ProductCard` takes `href` to be a
  link (catalogue) or `onAction` to end in a select button (calculator steps).

## Next 16 notes (upgraded September 2026)

- Request APIs are async: `getT()` / `getLocale()` in `lib/i18n/server.ts` return promises and
  every server component that uses them is `async`. `params` and `searchParams` arrive as
  promises; the route wrapper `handle()` in `lib/api/route.ts` awaits `ctx.params` so the
  handlers themselves keep the plain `{ params }` shape.
- `proxy.ts` replaced `middleware.ts` (same matcher, same NextAuth guard). The export has to be
  a plain function named `proxy`; a destructured `export const { auth: proxy }` is not detected.
- `pnpm lint` runs `eslint .` with the flat config. The React Compiler rules that
  eslint-config-next 16 adds (`react-hooks/refs`, `set-state-in-effect`, `immutability`,
  `purity`) are warnings until the viewer's ref patterns are reworked.
- `revalidateTag(tag, 'max')` — the second argument is required now.
- React Three Fiber 9 configures the renderer asynchronously; anything that waits for the
  first model fetch (tests, screenshots) has to poll rather than assert immediately.
