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
- Zustand + `persist` (localStorage) for calculator/design state
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
    calculator/                    step 1 (home state + rooms)
      materials/ catalog/ furniture/ summary/     steps 2–5
    design/                        ⟵ Design Studio, eight steps (DesignSteps / DESIGN_STEP_HREFS)
      page.tsx                     1 plan: upload / blank sheet / calculator rooms, wall defaults, mode
      plan/                        2 the existing house on the 2D board (walls, doors, windows, columns, beams)
      technical/                   3 technical points + works checklist + suggestions
      style/                       4 style test (StyleQuiz) or a direct pick, budget, generate
      studio/                      5 the 3D studio (build mode); 6 = the same page with ?tool=finishes
      summary/                     7 the budget: materials + products + labour, quantities per line
      workers/                     8 the trades the budget needs, with workers to book
    catalog/[slug]  workers/  about/  contact/  profile/  privacy/  terms/
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
  ui/          button card input select dialog accordion badge label skeleton textarea tabs
  layout/      Header Footer AdminSidebar LanguageSwitcher UserMenu
  calculator/  StepIndicator HomeStateSelector RoomForm RoomList MaterialsTable SummaryCard CalculatorAutosave
  plan/        PlanEditor (the 2D board, canvas) · PlanWorkspace (editor + toolbar wired to the store)
               PlanToolbar (Sims-style tool tiles, thickness, kinds, layers) · ElementInspector
               RoomsPanel · draw.ts (canvas routines) · palette.ts (room tints, origin and system colours)
               icons.ts (one icon per technical system and electrical kind)
  studio/      BuildBar (CategoryRail on the left + Tray along the bottom) · FurnitureTray · archetypeIcons
               Trays (build / electric / finishes / budget) · FixturePanel (a fitting's card) · OpeningPanel (a door
               or window's card) · dragImage
               StudioTopBar · TutorialOverlay (spotlight tour) · NavHelp · VersionsPanel
  flow/        StepStrip StepHeader StepNav SideList EmptyStep StageBrief (what / why / need / change / next)
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
  design/      types.ts · styles.ts · catalog.ts (archetypes + room programs) · planParser.ts
               planGeometry.ts · planImage.ts (browser) · planPdf.ts (browser) · autoLayout.ts · matcher.ts
               pricing.ts (budget lines) · openings.ts · manipulate.ts · clearance.ts · surfaces.ts · fromCalculator.ts
               walls.ts (walls ⇄ rooms) · drawing.ts (snapping, hit tests) · technical.ts · electrical.ts
               styleQuiz.ts · zones.ts (per-wall and floor-zone finishes) · history.ts (undo) · trades.ts
               technicalRates.ts (estimates) · saveDesign.ts (client) · aiPlan.ts · planSolver.ts · measure.ts
  design3d/    materials.ts · primitives.ts · buildScene.ts · buildStructure.ts (free walls, columns, beams,
               fittings, zones, lights) · modelLoader.ts (GLB cache, furniture and fixtures) · fixtureManifest.ts
               (generated) · outline.ts · daylight.ts · modelPreview.ts
  db/          schema.ts · index.ts (mysql2 pool + drizzle) · migrations/
  i18n/        ka.ts (primary) en.ts ru.ts client.tsx server.ts labels.ts index.ts
  validations/ zod schemas per entity (partner.schema.ts = self-registration + worker self-edit)
  utils.ts     cn() formatGEL() formatM2() formatUnit() slugify()
store/         calculatorStore.ts · designStore.ts
hooks/         useProducts · useCategories · useCalculator · useWorkers · useDesignCatalog · useAutosave
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
| `workers` | nameKa, specialty, specialtySlug, phone, pricePerM2/pricePerUnit, priceUnit, rating, bio, `city`, `experienceYears`, `completedJobs`, isVerified, **`approvalStatus`** (as for stores) |
| `worker_reviews` | workerId (cascade), authorName, rating 1–5, textKa/En/Ru, jobKa/En/Ru — `workers.rating`/`reviewCount` are the aggregates |
| `worker_works` | workerId (cascade), titleKa/En/Ru, descriptionKa/En/Ru, imageUrl, areaM2, city, year, sortOrder — the portfolio |
| `projects` | userId (nullable → guest), sessionId, nameKa, homeState, totalM2, `rooms` json, `selectedProducts` json, `selectedFurniture` json, cost columns, status (`draft` = autosaved or guest / `saved` = confirmed with the save button / `submitted` = ordered), **`mode`**, **`styleId`**, **`budgetGel`**, **`floorPlanUrl`**, **`plan` json** (rooms + `walls`, `columns`, `beams`, `technical`), **`scene` json** (items, finishes incl. per-wall and zones, `electrical`, `styleProfile`), **`versions` json** (`DesignVersion[]`, migration 0006) |
| `project_renders` | projectId (cascade), userId, `sourceUrl` (the studio's own screenshot, stored at once), `renderUrl` (filled when the realistic render exists), status `queued` → `processing` → `ready` / `failed`, `roomName`, `camera` json |
| `platform_settings` | one row: `calculatorFeePerM2`, `designFeePerM2`, `storeCommissionPct`, `workerCommissionPct` — edited at `/admin/settings` |
| `checkouts` | a customer ordering a project: projectId, userId, kind `calculator` / `design`, totalM2, feePerM2, `platformFee`, goodsTotal, commissionTotal, customer name/phone/email, note |
| `orders` | what one partner fulfils: checkoutId, projectId, `partnerType` store / worker, storeId / workerId, status `new` → `confirmed` → `in_progress` → `done` (or `cancelled`), subtotal, deliveryFee, `commissionPct` (frozen at creation), `commissionAmount`, customer contact, `customerNote`, `partnerMessage`, `viewedAt` |
| `order_items` | orderId (cascade), productId (nullable), name snapshots, categorySlug (`labour:<key>` for labour lines), roomName, unit, qty, unitPrice, total, `removed`, note |

`users.role` is `user` / `admin` / `store` / `worker`; a partner role carries `storeId` or `workerId`. `stores` and `workers` have `email` (order notifications) and `commissionRate` (null = platform default).

A design project is distinguished from a calculator project by `plan IS NOT NULL`.

Decimals are stored and read as **strings** (Drizzle mysql `decimal`). Always `Number(...)` before math and `String(...)` before insert.

**Calculator selection keys** (`selectedProducts`): `<slug>_global` is a product chosen for the
whole flat, `<slug>_room:<roomId>` one chosen for a single room (floor and wall finishes only).
`lib/calculator/quantities.ts` owns the format — `selectionKey`, `categorySlugFromKey`,
`roomIdFromKey` — and a per-room snapshot also carries `roomId` so the summaries, the order
lines and the studio can name the room. Never build or parse these strings by hand.

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
`ensureWalls` is what `setPlan` and `openSaved` call. Every wall edit in the store —
`addWall` (merges collinear pieces), `offsetWall` (sideways along `wallNormal`, connected
walls follow), `moveWallNode`, `removeWall`, `updateWall` — ends in `rebuildRooms`, which
also re-homes furniture whose room merged away and re-projects the electrical points.
`orphanWallSegments` are the pieces of wall that bound no room; the 3D view draws them as
free-standing walls. Tested in `tests/unit/design/walls.test.ts`; touching rooms from an
old calculator layout lose half a thickness on the shared wall, by design.

### The 2D board (`components/plan/PlanEditor.tsx`)

One canvas, one tool in hand: `select`, `pan`, `wall` (click, click, click; Esc, Enter or a
right click ends the run; Shift frees the angle), `room` (a rectangle whose inside is
exactly what was drawn; four walls around it), `door` / `window` (dropped on the nearest
room edge, the usual twin logic), `column`, `beam`, `technical`, `electrical`, `zone`.
`lib/design/drawing.ts` does the snapping — junction, then a point on a wall, then the axis
lock, then alignment with any junction's x or z, then the 5 cm grid (1 cm with Shift) — and
reports the guides the board draws. The select tool drags a wall sideways, its ends as
handles, a door along or onto another wall, columns and points freely, and furniture
footprints with `snapPlacement`; Delete removes the selection. `locked` keeps the structure
pickable but immovable. The editor owns only pan/zoom (wheel zooms about the pointer, Space
or the middle button pans; the view refits on resize until the person moves it) and the
gesture in progress — everything else is the store's, through callbacks. `PlanWorkspace`
wires it to the store with the toolbar and the hint line; the design flow's steps 2 and 3,
the studio's 2D view and the calculator's first step (`useCalculatorPlan` keeps the
calculator's `rooms` read off the plan) all use it. The transform is exposed on the canvas
as `data-scale` / `data-offset-x/y` for tests.

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

A finish is still `SurfaceFinish`, now with `wallIndex` (one wall) or `zone` (a floor
patch, a polygon clipped to the room by Sutherland–Hodgman — half a room, a strip along a
wall, or a rectangle drawn in 2D with the zone tool). `wallFinishFor` resolves a wall to
its own finish or the room's base; `finishCoverage` is the "m² per material" list; the
budget prices each wall and zone by its own area. `findFinish` in the builder only ever
returns the *base* finish.

The store records a snapshot (plan, items, finishes, electrical) before every change
(`commit`), so Ctrl+Z / Ctrl+Y walk `lib/design/history.ts`. `versions` keeps whole
snapshots: `ensureExistingVersion` writes version 01 (the existing house) when step 2 is
left and again when the studio first opens; the working state is the implicit "modified
house"; `saveVersion` keeps a named one; `restoreVersion` keeps the present first. Versions
are persisted locally and in `projects.versions`.

### Budget (`lib/design/pricing.ts`) and trades (`trades.ts`)

`priceScene` now returns `lines` — one `BudgetLine` per product, finish (m²), door or
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
(`Tray`), one at a time — build (tools + thickness + the unlock button; a drawing tool
switches to the 2D view), furniture (the catalogue as a shelf of small tiles — a picture
and a price, kinds as icons — click to carry or drag into 3D), electric & light (icon
tiles that arm a click on the 3D floor or drag into it, suggest / clear), finishes (the
same kind of shelf: floor or walls, where it goes — whole room, this wall, half the floor,
a drawn zone — then the swatches, the style default first), budget (totals at a glance).
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
top bar (`z-30`) so their buttons are never covered. The electric tray is one compact row. A tap on a
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

The finishes tray has two scopes that behave like a game's brush rather than a form: **1 m²**
paints one square of a room's floor, **1 m** one metre-wide strip of a wall, floor to
ceiling. A swatch picked in those scopes goes into the *brush* (page state, `brush`) and
paints nothing until a floor or a wall is clicked; dragging paints everything the pointer
crosses; the style default is the eraser. Both live in `scene.finishes` on top of the room's
base finish — all the tiles of one product in one room are **one** finish with a list of
grid `cells`, neighbouring strips of one product on one wall **one** finish with one `span`
— so undo, versions, autosave and the budget get them for free, and a painted flat is a
handful of rows rather than hundreds. The grid is the room's own (counted from its bounding
box, each tile clipped to the outline, so the last column is a part tile), and a strip
shorter than 25 cm at the end of a wall joins the strip before it. `fitToPlan` in the store
drops a strip past the end of a wall that got shorter and a tile a room no longer reaches.

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

**Finishes are chosen per room in the calculator too** (`/calculator/catalog`). For a
category whose `calculationType` is `per_m2_floor` or `per_m2_wall` the step shows a scope
row: "the same in every room" or one chip per room — the kitchen, bathroom and toilet are
rooms like any other there, so they are always a separate choice. Within one category the
two are exclusive (`calculatorStore.selectFinish`: a whole-flat pick drops the room picks,
a room pick drops the whole-flat one) so a floor is never counted twice. A room pick is
quantified from that room alone (`suggestedQuantityForRoom`), also on the server
(`repriceCalculatorPicks` reads the room off the key; a pick for a room that no longer
exists is dropped). In the studio `applyFinishPicks` puts room picks on their room first and
lets whole-flat picks fill the rest by wetness. The step's "next" asks whether furniture is
wanted at all — no goes straight to the summary; it can still be chosen in 3D later.

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
(`mirror: true`). The studio re-hangs the leaf on a pivot at its jamb (the scale on the
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

The furniture tray (`FurnitureTray`) is the catalogue browser (search, archetype, style chips)
scoped to the focused room. `designStore.beginAdd` creates the item with the product's real
size — `placeAdditional` finds a free spot when there is one (a wall first, then any free
floor; never a narrowed slot, which is how a 1.9 m cabinet used to land on its neighbours),
the middle of the room otherwise — and hands it to the pointer (`carryingItemId`). In the
viewer the piece follows the mouse, the outline is green where it fits and red where it does
not, R turns it (`ViewerApi.carryPose` gives the page the spot under the pointer to turn it
at), a click sets it down only on green, and Escape (`cancelCarry`) removes it. Picking a
room in either panel focuses it in 3D.

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

### Two modes

- `mode: 'design_only'` — the home is finished; only furniture and decor are costed.
- `mode: 'full'` — also folds in bulk materials and labour from the existing calculator engine.

### Step 1: three ways to a plan (`app/(main)/calculator/page.tsx`)

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

### The project page folds (`components/projects/ProjectDetail.tsx`, `FoldSection.tsx`)

`/profile/projects/[id]` and `/admin/projects/[id]` share `ProjectDetail`: the title on its
own line with the action buttons under it (side by side, the buttons squeezed the name into a
column of words), then the blocks in a fixed order — layout · rooms, materials, products,
furniture, the studio's products, workers, photos & renders (the `renders` slot), orders
(the `orders` slot) — each a `FoldSection` (client; the title row toggles, + / − in the
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
      lib/finance/money.ts     group the project's picks by store (calculator: products.storeId
                               lookup; design: the scene's store snapshot), one order per store,
                               delivery per store, commission at that store's rate, fee = m² × rate
      lib/finance/orders.ts    one transaction: checkout + orders + items; project → 'submitted'
      lib/finance/notify.ts    mail to every store (MAIL_DRIVER=log in dev → logs/app-*.log)
                               and to the customer; never fatal
worker profile → "დაკვეთა" → BookingDialog → POST /api/bookings { workerId, projectId? }
  → a worker order; with a project its lines are the calculator's labour estimate
```

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

**Partner portal (`/partner`)** — a `store` / `worker` account sees its own orders and
nothing else: dashboard (unread, open, this month's sales, the platform's cut, their share),
the order list with status filter, and the order editor (`components/orders/OrderEditor.tsx`):
quantities and prices per line, lines struck out and restored (kept visible for the customer),
added lines, a message to the customer, the status. Every save recomputes `subtotal` and
`commissionAmount` from the items (`applyOrderEdit`); a status or message change mails the
customer. Opening an order sets `viewedAt` and clears the badge. Stores also see their
product list (read-only), workers their public card. Admin can open the portal as any partner
with `?store=ID` / `?worker=ID`. `pnpm db:seed:partners` creates the logins.

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
delivery, struck-out lines, report periods — and `lib/finance/money.ts` is in the coverage
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
  dragged sideways, not drawn. Floor zones are likewise drawn in 2D (the whole room, one
  wall, half the floor, a painted tile and a painted strip all work from 3D). Beams are not
  obstacles for the layout engine.
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
- The e2e studio spec walks all eight steps but is not run in CI (needs the DB).

- Uploads are local disk on the VPS and cPanel hosts, a bucket on Vercel (`STORAGE_DRIVER`).
  No PDF export. No SMS.
- On Vercel a request body is capped at 4.5 MB, so a GLB, a large plan image or a studio
  photo above that is refused with 413 before the route runs. The fix is a direct upload
  into the bucket (a presigned PUT handed out by `/api/upload/*`, the byte sniff and the
  record afterwards); not built.
- The marketplace records money but does not move it: no payment integration, no payout to partners, no invoices. Stores add and edit their own products and workers their own card, but reviews and portfolio are still seeded, not partner-managed, and an approved store's new products go live at once with no moderation step.
- **Realistic renders are queued, not produced.** `project_renders` rows wait in `queued`; wiring an image model (the plan is an AI API called with the screenshot and the scene) means a worker that reads the queue, writes `renderUrl` and flips the status — the profile page already shows both states.
- PDF plans: only the first page is rasterised; a multi-page set has to be split by hand.
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
