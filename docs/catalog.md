# Catalogue: products, stores and categories

The products partners sell and the studio places: what a product row carries for the
calculator and for 3D, how admin and stores manage products, the public catalogue and product
pages, what is hidden from the public, and a person's own furniture. Read this before touching
`app/(main)/catalog/`, the product/store/category API routes, `components/admin/ProductForm.tsx`,
`components/catalog/`, `lib/api/designCatalog.ts` or `lib/design/catalog.ts`.

Related: [categories.md](categories.md) (the category tree, the calculator's tabs and the
studio's rooms) · [3d-assets.md](3d-assets.md) (where the models and textures come from, and
`models:seed`) · [design-studio/layout-and-matching.md](design-studio/layout-and-matching.md)
(archetypes and matching) · [partners-and-admin.md](partners-and-admin.md) (stores registering,
the portal) · [calculator.md](calculator.md) (the catalogue step) ·
[architecture.md](architecture.md#catalogue-data-in-three-languages) (names in three languages).

## Key files

| File | Responsibility |
|---|---|
| `lib/api/productAccess.ts` | who may see and who may change a product: `publicProductCondition` (for queries), `isPublicProduct`, `canViewProductPage`, `canReadProduct`, `canEditProduct` |
| `app/api/products/route.ts`, `[id]/route.ts`, `bulk/route.ts` | product list (public products only) and one product (`canReadProduct`), create / update (`requireCatalogEditor`, then `canEditProduct`), delete (then also `canDeleteProduct`: admin any, a store its own, never the catalogue agent), many at once (show / hide / delete) |
| `app/api/categories/**`, `app/api/stores/**` | category and store CRUD (staff; deleting admin's only — `canDeleteIn`), store approval; a store's public face to everybody else (`lib/api/publicPartners.ts`); the category tree is [categories.md](categories.md) |
| `lib/storage/cleanup.ts`, `lib/storage/uploadKeys.ts` | `removeUnusedUploads` — the files a deleted or edited row let go of, when storage made them at runtime and nothing else uses them (`isRuntimeUploadKey`, `productFileUrls`, `droppedUrls`) |
| `lib/api/designCatalog.ts` + `app/api/design/catalog/route.ts` | the whole design catalogue in one cached response (`invalidateDesignCatalog` on admin writes); a signed-in person's own products added fresh (`loadOwnProducts`) |
| `hooks/useDesignCatalog.ts` | the client cache of that catalogue (`refreshDesignCatalog`) |
| `lib/design/catalog.ts` | `ARCHETYPES` (every placeable kind: size, category, placement rule, labels), `ROOM_PROGRAMS`, the category slug sets the code knows (`FIXTURE_…`, `OPENING_…`, `RADIATOR_…`, `TRIM_…`, `DESIGN_CATEGORY_SLUGS`), `SHELF_ROOMS` (the studio rooms' starting point), `archetypeLabel` |
| `lib/design/styles.ts` | the four style ids ([design-studio/overview.md](design-studio/overview.md#the-four-styles)) |
| `lib/design/colors.ts` | colour families for the shelf's filter (`productColors`, `productColorFamilies`) |
| `lib/api/productPrices.ts` | current catalogue prices for repricing saved snapshots |
| `components/admin/ProductForm.tsx`, `ModelUploader.tsx`, `ImageUploader.tsx` | the product form (admin and the partner portal), GLB upload with a turntable preview |
| `app/api/upload/model/route.ts`, `lib/uploads/glb.ts` | GLB upload and inspection (`sniffModel`, `inspectGlb`) |
| `app/api/design/models/**`, `components/studio/OwnModelDialog.tsx`, `components/profile/MyModels.tsx` | a person's own furniture |
| `app/(main)/catalog/page.tsx`, `[slug]/page.tsx`, `components/catalog/*` | the public catalogue (sidebar, filters, grid) and the product page (`ProductModelDrawer`) |
| `lib/validations/product.schema.ts`, `store.schema.ts`, `category.schema.ts` | payloads |

## Managing the catalogue

`/admin/stores` is full CRUD for partners (admin and the catalogue agent — the commission rate
and deleting are admin's alone: the commission field is hidden from the agent and ignored from
anybody else, and the agent has no delete button and is refused one) — the fields
there are exactly what the studio's hover card and the summary's per-store basket render, so a
blank address or delivery time shows up as a blank line in the product. Deleting a store that
still has products is refused with a 409; delete or move its products first (the product list
filters by store and deletes in bulk) or deactivate it instead.

**Who deletes.** Admin deletes any product, category or store; a store deletes its own
products; the catalogue agent adds, edits, shows and hides but deletes nothing — a row deleted
takes with it what saved designs and orders point at, so that call is admin's
(`canDeleteProduct`, `canDeleteIn`; the pages leave the agent's delete buttons out, the routes
answer 403). The agent switches things off instead: a product or a store by its active switch,
a category by "visible".

**Deleting leaves no files behind.** A product deleted — one at a time or in bulk, by admin or
by its store — takes its photo, its 3D model and its texture with it, and a photo or model
replaced or cleared in the form is removed too; so is a store's, a brigade's or a worker's old
logo or avatar (`removeUnusedUploads`, after the write). Only files storage made at runtime are
ever deleted (`<ms>-<hex>.<ext>` from the upload routes, `own-…` for own furniture — the seed
pictures under `public/uploads` are tracked in git and never match), and only when no product,
logo, avatar or portfolio photo still uses the URL. Static assets (`/models/…`, `/textures/…`)
are not storage's to delete.

**Bulk and quick actions.** The admin's product list and a store's own list tick rows and show,
hide or delete them together (`POST /api/products/bulk`: showing and hiding follow
`canEditProduct` per product — staff any, a store its own; deleting `canDeleteProduct` — admin
any, a store its own, and a delete from the catalogue agent is refused outright; the rest of a
selection is skipped and counted, never refused wholesale; someone's own furniture is never
touched), and each row has edit / hide-show buttons and, for whoever may, delete
(`ProductRowActions`).

**Categories** are one tree admin keeps — parents up to three levels, icons, an order, and
switches for the catalogue and the calculator — and a category stands for everything under it;
the studio's shelf reads it through the rooms admin makes. All of it is in
[categories.md](categories.md). The product form picks a category from the tree (a category
that takes a 3D kind gives it to a product that has none), and the admin's and a store's
product lists filter by one, subtree included.

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
`publicProductCondition`, the catalogue page, the landing wall, related products), and the
product page and `GET /api/products/[id]` answer 404 to anyone but the owner (and, for the API,
staff) — see "Who sees a product" below; `pnpm models:seed` never removes or switches off an
owned product. The profile lists them (`MyModels`, `DELETE /api/design/models/[id]`
removes the row and its files). `refreshDesignCatalog()` in `hooks/useDesignCatalog.ts`
refetches for every mounted hook after one is added.

## Who sees a product (`lib/api/productAccess.ts`)

One module holds the rules, and every read and write of a product goes through it:

- **Public** — active, sold by no store or by an active one (a store that registered itself stays
  inactive until approved, and so do its products, whatever their own flag says), and nobody's
  own furniture. A query says it with `publicProductCondition()` (with `stores` left-joined on
  `products.storeId`); a row already read, with `isPublicProduct()`. The catalogue list, the
  landing wall, `GET /api/products`, related products and the design catalogue show public
  products only (the catalogue page, the landing wall and the design catalogue still write the
  same three conditions inline).
- **The product page** (`/catalog/<slug>`, `canViewProductPage`) shows a public product to
  everybody and a person's own furniture to that person; anything else is a 404 — staff
  included, since nothing in the admin links to it. The page and its `generateMetadata` read
  through one request-cached lookup (`loadVisibleProduct`), so a hidden product's name never
  reaches the title either. A link to a product that has since been switched off (from a saved
  budget, say) lands on the 404.
- **`GET /api/products/[id]`** (`canReadProduct`) answers a public product to anybody without
  looking at the session; any other only to its owner, to staff with the products section
  (admin, catalogue agents) and to the product's own store — everyone else gets a 404, as if it
  did not exist. Nothing in the app calls it today; `ProductForm` uses the route for PUT and
  DELETE.
- **Changing a product** (`PUT` / `DELETE`, `canEditProduct` after `requireCatalogEditor`): staff
  with the products section may change any product; a store only its own, and it can neither
  move a product to another store nor feature it.

**Who sees a store.** `GET /api/stores` and `/api/stores/[id]` answer staff with the stores
section with the whole row; everybody else sees only the stores the platform lists (approved
and active) and only their public fields (`publicStore`: names, descriptions, logo, website,
phone, address, city, rating, delivery days and fee) — never the commission, the private e-mail
or the approval state; a store it does not list is a 404 ([auth-and-roles.md](auth-and-roles.md#where-access-is-enforced)).

## Public pages

- **Product page** (`/catalog/[slug]`): no "add to project" button any more — the calculator
  and the studio are where products are chosen. "See in 3D" (`ProductModelDrawer`) opens a
  drawer on the same page with the product's own GLB on a turntable (`lib/design3d/modelPreview.ts`,
  plain three.js loaded on demand, the product's materials as shipped) and a link into the
  studio at the bottom. The drawer's content is portalled, so the host element is a callback
  ref in state — an effect keyed on `open` alone ran before the host existed.
- **Catalogue** (`/catalog`): server-rendered with a real sidebar — the category tree, each
  top group with its categories and the deeper levels opening along the path the visitor is on,
  every category with its icon (drawn on the server) and the count of its whole subtree,
  empty ones left out; a category shows its whole subtree — and partner stores — and a toolbar
  above the grid with search, a multi-select style dropdown (`style=modern,vintage`, OR),
  a price band, the result count and sort. Every control is a link or a GET form built
  with `hrefWith` from `lib/admin/list.ts`, so any filtered view is a URL and the page works
  without JavaScript; the sort `<select>`, the style dropdown and `ProductCard` are the client
  components. On small screens a checkbox (`#catalog-filters`, `peer-checked`) shows the
  sidebar. Only category links carry `aria-current="page"` (the e2e test counts exactly one).
  The product page's breadcrumb is the category's whole path.
  `ProductCard` takes `href` to be a link (catalogue) or `onAction` to end in a select button
  (calculator steps).

## Tests

`tests/unit/api/productAccess.test.ts` (who sees, changes and deletes a product),
`tests/integration/product-routes.test.ts` (`/api/products/[id]` with the database and session
mocked: hidden products 404 to the public, staff and a product's store read them, a catalogue
agent may change a store's product but not delete it, a store only its own),
`tests/integration/catalog-delete-routes.test.ts` (deleting a category, a store and products in
bulk: admin's, a store's own products, never the catalogue agent's),
`tests/unit/admin/categoryIcons.test.ts` (icon names, search, drawings), the category tree's
tests ([categories.md](categories.md#tests)),
`tests/unit/api/sniff.test.ts` (image and GLB sniffing, Draco/Basis refusal),
`tests/unit/api/uploadKeys.test.ts` (which stored files may be deleted, what an edit let go
of), `tests/unit/api/publicPartners.test.ts` (a store's public face),
`tests/unit/design/matcher.test.ts` (only products with a model are placed),
`tests/unit/design/colors.test.ts`, `tests/unit/design/catalogBrowser.test.ts` (own and pending
items), `e2e/public.spec.ts` (catalogue filters through the URL). Nothing tests the own-furniture
routes (`/api/design/models`), and the product page itself is covered only through
`canViewProductPage`.

## Known gaps

- Admin has no bulk import: one GLB per product through the form. Files uploaded in a form that
  is then abandoned (never saved) stay in storage — only plans have a sweeper
  (`pnpm uploads:cleanup`). Converting a partner's
  archive drop is still an entry in `SOURCES` per archive and `pnpm models:convert`.
- Partner stores and their prices in the seed are **fictional** placeholders for the Georgian
  market. Replacing them with signed partners is a data change, not a code change.
- The product form offers no `radiator` kind, so a radiator product's kind shows as unknown
  (`?`) in the select.

