# CLAUDE.md — RenovationRoom (რემონტი.ge / RenovateGE)

Orientation file for AI-assisted sessions. Read this before touching code.
Companions: `CODEBASE.md` (deep reference), `AI_FEATURE_PLAN.md` (original 2D→3D research), `README.md` (user-facing).

---

## What this app is

Georgian-language home renovation platform. Two products share one engine:

1. **Renovation calculator** (built, working) — pick home state → enter rooms → auto-computed
   materials + labor estimate → pick real products from partner stores → cost summary.
2. **Design Studio** (`/design`) — upload a 2D floor plan → parsed into rooms → pick one of
   4 styles → a **Three.js 3D model of the apartment** is generated and furnished with
   **real, purchasable products from partner stores**. Hover any object → store, price, link.

The differentiator: other home-design apps show generic furniture. Here every object in the
3D scene is a real SKU with a price and a shop you can buy it from.

Tagline: გეგმე. გამოთვალე. გააკეთე. (Plan. Calculate. Build.)

App is **not yet shipped**. No git repo in this directory.

---

## Stack

- Next.js 14 App Router, TypeScript **strict**, React 18
- MySQL 8 + Drizzle ORM (`drizzle-kit`), pnpm 9
- Tailwind 3 + shadcn/ui-style components (Radix primitives), lucide-react
- Zustand + `persist` (localStorage) for calculator/design state
- React Hook Form + Zod
- NextAuth v5 beta (Credentials + optional Google), JWT sessions, role `'user' | 'admin'`
- **three / @react-three/fiber / @react-three/drei** for the 3D studio
- i18n: `ka` (primary), `en`, `ru` — every string lives in `lib/i18n/*.ts`
- Uploads → `public/uploads/*` via `/api/upload`
- Deploy target: self-hosted VPS, PM2 + Nginx, port 3000

## Commands

> **Never run `pnpm build` while `pnpm dev` is running, and never `rm -rf .next`.**
> They share `.next`. Building over a live dev server, or deleting the directory under it,
> leaves it serving static files but 404-ing every page — with no error in the terminal to
> explain why. Stop the dev server first; restart it to recover.

```bash
pnpm dev            # next dev on :3000
pnpm build          # production build
pnpm type-check     # tsc --noEmit — run this before declaring work done
pnpm lint
pnpm db:push        # push schema.ts to MySQL (no migration files in use)
pnpm db:seed        # seed categories, stores, products, workers, admin
pnpm db:seed:design # seed partner stores + the design categories (no furniture — see models:seed)
pnpm db:studio      # drizzle studio
pnpm test:parser    # synthetic floor plans through the parser — run after touching planParser
pnpm test:solver    # dimension labels + the plan solver, no API key needed
pnpm plan:diagnose <plan.png>   # stage-by-stage report on one real plan
pnpm assets:extract # re-extract renders/textures from the partner 3D asset drop
pnpm models:convert # partner OBJ exports → textured, compressed, validated GLBs + manifest.json
pnpm models:convert --only=woody-bed,node-sofa   # redo a few; merges into the manifest
pnpm models:stock   # CC0 stock furniture (Poly Haven + Kenney) → public/models/stock + manifest.json
pnpm models:stock --inspect --only=ph-sofa_02   # measure and report, write nothing
pnpm models:seed    # one product per model in both manifests; deletes every other placeable product
pnpm textures:stock # floor/wall finish textures (partner drop + Poly Haven + ambientCG) → surface products
pnpm db:seed:rates  # create the `rates` table and fill in the calculator's default rate book
pnpm db:migrate     # apply pending migrations from lib/db/migrations (what deploys run)
pnpm db:migrate:baseline  # once, on a DB created with db:push before migrations existed
pnpm db:indexes     # idempotent secondary indexes (stopgap where push is not an option)
pnpm test           # vitest: calculator, pricing, matcher, API helpers, both save routes
pnpm test:coverage  # same with the coverage gate CI enforces
pnpm test:e2e       # Playwright flows against :3000 (needs the DB; not in CI)
pnpm uploads:cleanup  # delete plan uploads no project references (--dry-run to preview)
NEXT_DIST_DIR=.next-build pnpm build  # production build beside a live dev server
```

`drizzle-kit push` is interactive and will hang in a non-interactive shell; for a scripted
migration apply the DDL with `mysql` directly.

Admin login after seed: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env.local` (default email `admin@remonti.ge`; when no password is set the seed generates one and prints it once).

---

## Directory map

```
app/
  (auth)/login, register
  (main)/
    page.tsx                       landing
    calculator/                    step 1 (home state + rooms)
      materials/ catalog/ furniture/ summary/     steps 2–5
    design/                        ⟵ Design Studio (2D plan → 3D)
      page.tsx                     mode + plan upload
      plan/                        parsed-plan review & correction
      style/                       style + budget picker
      studio/                      the 3D studio (main screen)
      summary/                     shopping list per store
    catalog/[slug]  workers/  about/  contact/  profile/  privacy/  terms/
  admin/                           dashboard + CRUD (products, categories, stores, workers, orders, users)
  api/
    products/ categories/ stores/ projects/ workers/ upload/ calculator/materials
    design/
      catalog/                     the whole design catalogue in one response (client-side matching)
      projects/                    save / list design projects
      upload-plan/                 floor-plan image upload (open to visitors, not admin-only)
      parse-plan/                  reads an uploaded plan with Claude; 503 + fallback:'cv' without a key
components/
  ui/          button card input select dialog accordion badge label skeleton textarea tabs
  layout/      Header Footer AdminSidebar LanguageSwitcher UserMenu
  calculator/  StepIndicator HomeStateSelector RoomForm RoomList MaterialsTable SummaryCard
  design/      DesignSteps PlanCanvas StylePicker Viewer3D ItemCard SwapPanel
  catalog/ workers/ admin/ legal/ contact/ providers/
lib/
  calculator/  constants.ts (rates) · materials.ts (pure engine) · types.ts
  design/      types.ts · styles.ts · catalog.ts (archetypes + room programs) · planParser.ts
               planGeometry.ts · planImage.ts (browser) · autoLayout.ts · matcher.ts · pricing.ts
               aiPlan.ts · planSolver.ts · measure.ts (the AI reading path)
  design3d/    materials.ts · primitives.ts · buildScene.ts · outline.ts
  db/          schema.ts · index.ts (mysql2 pool + drizzle)
  i18n/        ka.ts (primary) en.ts ru.ts client.tsx server.ts labels.ts index.ts
  validations/ zod schemas per entity
  utils.ts     cn() formatGEL() formatM2() formatUnit() slugify()
store/         calculatorStore.ts · designStore.ts
hooks/         useProducts · useCategories · useCalculator · useWorkers · useDesignCatalog
scripts/       seed.ts · seed-design.ts · convert-models.ts · stock-models.ts · seed-models.ts
               lib/objGroups.ts · lib/textureClassify.ts · extract-assets.sh · test-plan-*.ts
public/
  uploads/products/  uploads/furniture/  uploads/stores/  uploads/plans/
  textures/  models/  samples/plan-2br.png
```

---

## Data model (`lib/db/schema.ts`)

| Table | Notes |
|---|---|
| `users` | id, name, email (unique), passwordHash, role enum |
| `categories` | nameKa/nameEn, slug, icon, `phase` (1–18 renovation phase, 20 = furniture), `calculationType` enum, isVisible, `isFurniture`, sortOrder |
| `stores` | nameKa (**unique**), `descriptionKa`, logoUrl, websiteUrl, phone, address, `city`, `rating`, `reviewCount`, `deliveryDays`, `deliveryFeeGel`, commissionRate, isActive |
| `products` | categoryId, storeId, nameKa, slug, sku, pricePerUnit (decimal-as-string), unit enum, coveragePerUnit, brand, imageUrl, `images` json, `specs` json, `tags` json, **`styleTags` json**, **`model3dKind`**, **`model3dUrl`**, **`textureUrl`**, **`colorHex`**, **`widthCm`/`depthCm`/`heightCm`**, isActive, isFeatured |
| `workers` | nameKa, specialty, specialtySlug, phone, pricePerM2/pricePerUnit, priceUnit, rating, bio, isVerified |
| `projects` | userId (nullable → guest), sessionId, nameKa, homeState, totalM2, `rooms` json, `selectedProducts` json, `selectedFurniture` json, cost columns, status, **`mode`**, **`styleId`**, **`budgetGel`**, **`floorPlanUrl`**, **`plan` json**, **`scene` json** |

A design project is distinguished from a calculator project by `plan IS NOT NULL`.

Decimals are stored and read as **strings** (Drizzle mysql `decimal`). Always `Number(...)` before math and `String(...)` before insert.

### Managing the catalogue

`/admin/stores` is full CRUD for partners — the fields there are exactly what the studio's
hover card and the summary's per-store basket render, so a blank address or delivery time
shows up as a blank line in the product. Deleting a store that still has products is refused
with a 409; deactivate it instead.

The product form carries a **3D design settings** section: store, style tags, `model3dKind`,
real dimensions in cm, and colour. Choosing an archetype prefills its standard dimensions.

**Only products with a `model3dUrl` are ever placed.** `matchProducts` drops everything
without one before it looks at archetype or style, so a product added by hand in admin will
not appear in a room until it has a converted GLB. `pnpm models:seed` is the normal way
products get into the studio: it writes one per entry in `public/models/manifest.json` (the
partner drop) and `public/models/stock/manifest.json` (CC0 stock, see "Stock models") and
deletes every other product that has a `model3dKind`. The hand-written 115-product range that
`seed-design.ts` used to carry is gone for that reason.

Within one room, every slot of a kind gets the same product (six matching dining chairs);
the next room gets the next-best product of the same style tier, so a flat with five
pendants hangs five different lamps. The swap panel lists every candidate for the slot,
matching style first, each with its photo.

The `model3dKind` options come from `ARCHETYPES` directly, so adding an archetype makes it
selectable without touching the admin form. A stored kind that is no longer in the registry
stays listed (marked `?`) rather than silently blanking the select and being lost on save.

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

Home states gate phases: `black_frame` = 1–18, `white_frame` = 9–17, `green_frame` = 17 only.
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
  → buildScene.ts        rooms + placements → THREE.Group (walls procedural; furniture = partner GLBs only)
  → Viewer3D             orbit or walk; hover shows store + price; drag/rotate/swap furniture
  → manipulate.ts        snapping, collision and walkability for everything the user moves
  → pricing.ts           scene → cost breakdown grouped by partner store
```

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

Clicking a floor or a wall in the 3D view selects that surface (`onSelectSurface`): the
right panel shows the finish picker for that room with the clicked surface first, and a
choice there applies to that room only. Clicking empty space clears it.

### Direct manipulation (`lib/design/manipulate.ts`)

The layout engine *searches* for a spot and gives up if it can't find one. Dragging is the
opposite problem — the user has already decided roughly where a thing goes, and the job is to
make that land cleanly. `snapPlacement` squares the rotation to the nearest wall, snaps the
position to a 5 cm grid, pushes the item flush if it was shoved against a wall, clamps it
inside the room and reports whether it collides. An invalid drop is refused and the item
returns to where it came from, outlined in red on the way.

`rotateItem` deliberately does *not* go through `snapPlacement`: re-aligning the rotation to
the nearest wall would instantly undo every rotation of anything already sitting flush.

`buildWalkable` + `canStandAt` are the walk-through's collision: room polygons are separated
by the thickness of the wall between them, so each door contributes a portal box that bridges
the two — otherwise you could not walk through your own doorways.

### Two modes

- `mode: 'design_only'` — the home is finished; only furniture and decor are costed.
- `mode: 'full'` — also folds in bulk materials and labour from the existing calculator engine.

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
surface categories (doors, windows and sockets have no 3D counterpart and are left alone).

---

## API conventions

- Every route returns `{ data, error }` and sets `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`
- Admin writes check `session.user.role === 'admin'` via `auth()` from `@/auth`
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
"10. **Never dispose a GLB clone's geometry.** Furniture wrappers are `clone(true)` of a cached
    model and share its buffers; disposing them makes every model re-upload on the next rebuild.
    Only geometry `buildScene` created itself is tagged `ownsGeometry` and disposed.
11. **The CSP needs `connect-src blob:`.** GLTFLoader hands the textures packed inside a GLB to
    the browser as blob URLs and fetches them back. Without it every model loads untextured and
    the only symptom is a console warning.
12. **Furniture is reconciled, not rebuilt.** `syncPlacedItems` moves wrappers whose product and
    size are unchanged and replaces the rest; the room shells are a separate group keyed on plan,
    finishes and style. Rebuilding everything on every drag was the studio's biggest stutter.
"
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

## Drizzle: correlated subqueries don't correlate

A `sql` template with a correlated `select count(*) ... where products.store_id = stores.id`
inside a `.select({})` silently returns 0 for every row — it is emitted uncorrelated. Use
`leftJoin` + `groupBy` + `count()` instead. The store list hit exactly this.

## Operations

Everything the app needs to run unattended on the VPS, and where each piece lives.

- **Environment** is validated once at startup by `lib/env.ts` (Zod). A missing or malformed
  variable stops the process with the variable named; production insists on a real
  `AUTH_SECRET` and `DATABASE_PASSWORD`. Server code imports `env`, never `process.env`.
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

- Uploads are local disk; S3 planned. No PDF export. No worker booking flow. No SMS.
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
- The AI path is unproven against real plans — it is built and type-checked, but nobody has
  run it with a key yet. The prompt and the box→metres mapping are the parts most likely to
  need tuning on first contact.
- The walk-through has no collision at all — walls, furniture, nothing stops the viewer.
  Deliberate: a design tool wants to be explored, not navigated, and getting stuck reads as a
  bug every time. `buildWalkable` only picks the starting spot now.
- Surface finishes are per room: the studio's right panel offers every catalogue product with
  a `textureUrl` for the focused room's floor and walls (or all rooms at once), priced by the
  room's area. `pnpm textures:stock` is what gives products textures; a product without one
  never appears there. Ceilings stay on the style default.
- Admin has no bulk import, and a product added there cannot be placed until it has a GLB.
  Adding a partner's range means an entry in `SOURCES` per archive and `pnpm models:convert`.
- Partner stores and their prices in the seed are **fictional** placeholders for the Georgian
  market. Replacing them with signed partners is a data change, not a code change.
