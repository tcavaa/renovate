# Catalogue: products, stores and categories

The products partners sell and the studio places: what a product row carries for the
calculator and for 3D, how admin and stores manage products, the public catalogue and product
pages, what is hidden from the public, and a person's own furniture. Read this before touching
`app/(main)/catalog/`, the product/store/category API routes, `components/admin/ProductForm.tsx`,
`components/catalog/`, `lib/api/designCatalog.ts` or `lib/design/catalog.ts`.

Related: [3d-assets.md](3d-assets.md) (where the models and textures come from, and
`models:seed`) · [design-studio/layout-and-matching.md](design-studio/layout-and-matching.md)
(archetypes and matching) · [partners-and-admin.md](partners-and-admin.md) (stores registering,
the portal) · [calculator.md](calculator.md) (the catalogue step) ·
[architecture.md](architecture.md#catalogue-data-in-three-languages) (names in three languages).

## Key files

| File | Responsibility |
|---|---|
| `app/api/products/route.ts`, `[id]/route.ts` | product list (`publicProductCondition`) and CRUD (`requireCatalogEditor`; a store only its own) |
| `app/api/categories/**`, `app/api/stores/**` | category and store CRUD (staff), store approval |
| `lib/api/designCatalog.ts` + `app/api/design/catalog/route.ts` | the whole design catalogue in one cached response (`invalidateDesignCatalog` on admin writes); a signed-in person's own products added fresh (`loadOwnProducts`) |
| `hooks/useDesignCatalog.ts` | the client cache of that catalogue (`refreshDesignCatalog`) |
| `lib/design/catalog.ts` | `ARCHETYPES` (every placeable kind: size, category, placement rule, labels), `ROOM_PROGRAMS`, the category slug sets (`FIXTURE_…`, `OPENING_…`, `RADIATOR_…`, `TRIM_…`, `DESIGN_CATEGORY_SLUGS`), `SHELF_ROOMS`, `archetypeLabel` |
| `lib/design/styles.ts` | the four style ids ([design-studio/overview.md](design-studio/overview.md#the-four-styles)) |
| `lib/design/colors.ts` | colour families for the shelf's filter (`productColors`, `productColorFamilies`) |
| `lib/api/productPrices.ts` | current catalogue prices for repricing saved snapshots |
| `components/admin/ProductForm.tsx`, `ModelUploader.tsx`, `ImageUploader.tsx` | the product form (admin and the partner portal), GLB upload with a turntable preview |
| `app/api/upload/model/route.ts`, `lib/uploads/glb.ts` | GLB upload and inspection (`sniffModel`, `inspectGlb`) |
| `app/api/design/models/**`, `components/studio/OwnModelDialog.tsx`, `components/profile/MyModels.tsx` | a person's own furniture |
| `app/(main)/catalog/page.tsx`, `[slug]/page.tsx`, `components/catalog/*` | the public catalogue (sidebar, filters, grid) and the product page (`ProductModelDrawer`) |
| `lib/validations/product.schema.ts`, `store.schema.ts`, `category.schema.ts` | payloads |

## Managing the catalogue

`/admin/stores` is full CRUD for partners — the fields there are exactly what the studio's
hover card and the summary's per-store basket render, so a blank address or delivery time
shows up as a blank line in the product. Deleting a store that still has products is refused
with a 409; deactivate it instead.

The product form (the store is among its general fields) carries a **3D design settings**
section: style tags, `model3dKind`, real dimensions in cm, and colour. Choosing an archetype
prefills its standard dimensions when all three are still empty.

**Only products with a `model3dUrl` are ever placed.** `matchProducts` drops everything
without one before it looks at archetype or style. There are two ways a product gets one:

- **Upload a GLB in the product form** (`components/admin/ModelUploader.tsx`). The file goes
  to `POST /api/upload/model` (admin, catalogue agents and linked stores —
  `requireCatalogEditor`; bytes checked by `sniffModel`: `glTF` magic, container version 2,
  JSON first chunk; 40 MB cap; a file that requires Draco or Basis, or has no mesh, is refused)
  and lands under `models/` in storage (`/uploads/models/…` locally). The form then loads that
  URL with a GLTFLoader and meshopt decoder like the studio's (`mountPreview`) and shows it on a turntable with a grid and an arrow for the front (+Z), reads the real
  size from the geometry to prefill width/depth/height (a file in cm or mm is recognised by
  its size and converted), counts triangles and textures, and can render a PNG of the model
  to use as the product photo when there is none. Saving a URL sets `model3dStatus = 'ready'`
  (the design catalogue only exposes ready models); clearing it sets `'none'`.
- **`pnpm models:seed`** writes one product per entry of the model manifests (the partner
  drop, CC0 stock, fixtures, radiators) and deletes every other manifest-managed product with a
  `model3dKind` — a product whose `model3dUrl` is not under `/models/` (an upload) and a person's
  own product are left alone. Details in [3d-assets.md](3d-assets.md#what-pnpm-modelsseed-does).
  The hand-written 115-product range that `seed-design.ts` used to carry is gone for that
  reason.

The `model3dKind` options come from `ARCHETYPES` directly, plus the fixture kinds (⚡) and the
opening kinds (🚪), so adding an archetype makes it selectable without touching the admin
form. A stored kind that is no longer in the registry
stays listed (marked `?`) rather than silently blanking the select and being lost on save.

## Key 3D-relevant columns

- **`products.model3dKind`** — the archetype the layout engine places the product as
  (`'sofa_3seat'`, `'bed_double'`, `'dining_table'`, …): which slot in which room program.
  See `ARCHETYPES` in `lib/design/catalog.ts`.
- **`products.model3dUrl`** — the GLB (under `public/models/` for seeded models, under
  `/uploads/models/` or the bucket for uploads), and the thing that makes a product placeable at
  all; the design catalogue exposes it only when `model3dStatus` is `ready`. The viewer creates
  the item's wrapper immediately (selection, dragging and the cost bar work from the first
  frame) and drops the mesh in when the GLB arrives. There is no procedural stand-in: a slot
  with no product stays empty ([3d-assets.md](3d-assets.md)).
- **`products.textureUrl`** — tileable texture for surface products (floor, wall, tile).
- **`products.widthCm/depthCm/heightCm`** — real dimensions; drives scale and collision in layout.
- **`products.styleTags`** — `['scandinavian']`, `['industrial','modern']`, … drives style matching.

## What the calculator may sell

Only products with a 3D model or a texture are on sale in the calculator's catalogue:
`pnpm models:seed` deactivates everything else in the furniture, sanitary, lighting and
surface categories (the doors, windows and sockets & switches categories are left alone: the
base seed's plain products there stay on sale beside the modelled ones).

## A person's own furniture

**A person's own furniture** (`products.ownerUserId`, `POST /api/design/models`,
`components/studio/OwnModelDialog.tsx`). The wardrobe they are keeping, the table they
already have: the "+" on the furniture shelf (and in the catalogue modal) takes a GLB or a
photo and makes a *product* of it — a real row, so the layout, the carry, the budget and
the saves all work unchanged — owned by that person (`ownerUserId`), priced at nothing,
sold by nobody, in the archetype's category (`ARCHETYPES[kind].categorySlug`). A GLB is
inspected like a partner's (`sniffModel`, `inspectGlb`, no Draco/Basis), shown on the
admin uploader's turntable (`mountPreview`, exported from `ModelUploader`) so its size is
read off it and a photo rendered for the tile, and is placeable at once — the studio puts
it on the pointer. A photo goes in with `model3dStatus: 'pending'`: listed under "my
items" with a badge, not placeable, waiting for the conversion that is not built yet (AI,
last stage). **Theirs alone**: the cached design catalogue leaves owned products out and the
route adds the caller's own fresh (`loadOwnProducts`, `own` / `pending` on
`CatalogProduct`); every public product query has `isNull(products.ownerUserId)` (the
`publicProductCondition`, the catalogue page, the landing wall, related products) and the
product page 404s for anyone but the owner — though `GET /api/products/[id]` does not filter
yet (Known gaps); `pnpm models:seed` never removes or switches off an owned product. The profile lists them (`MyModels`, `DELETE /api/design/models/[id]`
removes the row and its files). `refreshDesignCatalog()` in `hooks/useDesignCatalog.ts`
refetches for every mounted hook after one is added.

## Public pages

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
  without JavaScript; the sort `<select>`, the style dropdown and `ProductCard` are the client
  components. On small screens a checkbox (`#catalog-filters`, `peer-checked`) shows the
  sidebar. Only category links carry `aria-current="page"` (the e2e test counts exactly one).
  `ProductCard` takes `href` to be a link (catalogue) or `onAction` to end in a select button
  (calculator steps).

## Tests

`tests/unit/api/sniff.test.ts` (image and GLB sniffing, Draco/Basis refusal),
`tests/unit/design/matcher.test.ts` (only products with a model are placed),
`tests/unit/design/colors.test.ts`, `tests/unit/design/catalogBrowser.test.ts` (own and pending
items), `e2e/public.spec.ts` (catalogue filters through the URL). Nothing tests the own-furniture
routes or the owner-privacy rules.

## Known gaps

- Admin has no bulk import: one GLB per product through the form. Converting a partner's
  archive drop is still an entry in `SOURCES` per archive and `pnpm models:convert`.
- Partner stores and their prices in the seed are **fictional** placeholders for the Georgian
  market. Replacing them with signed partners is a data change, not a code change.
- **Two reads skip the public conditions.** The product page's lookup by slug
  (`app/(main)/catalog/[slug]/page.tsx`) checks ownership only, so a product of a pending store
  or an inactive product is reachable by its URL; `GET /api/products/[id]` has no filter and no
  auth, so any product — including a person's own furniture — can be read by id.
- The product form offers no `radiator` kind, so a radiator product's kind shows as unknown
  (`?`) in the select.
