# Categories: one tree, and the studio's rooms

How products are sorted everywhere: one category tree that admin keeps (parents, up to three
levels, icons, order), what each place reads from it — the site's catalogue, the calculator's
tabs, the studio's shelf through **studio rooms** — and how a product finds its category.
Read this before touching `lib/catalog/`, `lib/design/shelf.ts`, `/admin/categories/**`, the
category and studio-room API routes, the catalogue sidebar, the studio's furniture tray and
catalogue modal, or the seeds that make categories.

Related: [catalog.md](catalog.md) (products, stores, the public catalogue) ·
[design-studio/studio.md](design-studio/studio.md#adding-furniture-in-the-studio) (the tray and
the modal) · [calculator.md](calculator.md) (its catalogue and furniture steps) ·
[partners-and-admin.md](partners-and-admin.md) (the admin) ·
[data-model.md](data-model.md) (`categories`, `shelf_rooms`, `shelf_room_categories`) ·
[3d-assets.md](3d-assets.md#what-pnpm-modelsseed-does) (where `models:seed` files products).

## Key files

| File | Responsibility |
|---|---|
| `lib/catalog/tree.ts` | pure: `buildCategoryTree`, `pathOf`, `depthOf`, `subtreeIds`, `subtreeHeight`, `flattenTree`, `treeOptions` (indented select options), `subtreeCounts`, `moveError` (where a category may go), `nearestSlug`, `subtreeOfSlugs`, `categoryForKind`; `MAX_CATEGORY_DEPTH` = 3 |
| `lib/catalog/queries.ts` | server: `loadCategoryTree`, `subtreeOfSlug`, `loadShelf` (the studio's rooms and the tree, icons drawn), `roomTypesOf` |
| `lib/catalog/shelfRooms.ts` | server: `setRoomCategories`, `setCategoryRooms`, `roomsOfCategory` — the room ↔ category links |
| `lib/catalog/iconNodes.ts` | server: `iconNodeFor(name)` — an icon's drawing (the studio's own first, then lucide's) for payloads that must not ship an icon set |
| `lib/catalog/defaultTree.ts`, `lib/db/migrations/0018_category_tree_defaults.sql`, `0020_equipment_kitchen_categories.sql` | the tree and the studio rooms the platform starts with, and the migrations that wrote them in (kept in step by `tests/unit/catalog/defaultTree.test.ts`) |
| `lib/catalog/kinds.ts` | `PRODUCT_KINDS` — every 3D kind a category may take |
| `lib/design/shelf.ts` | pure: the studio shelf — `shelfIndex`, `shelfRoomCounts`, `inShelfRoom`, `roomCategories`, `subcategoryCounts`, `shelfTrail`, `shelfRoomForType`, `shelfName` |
| `lib/admin/icons.ts`, `components/admin/IconPicker.tsx`, `CategoryIcon.tsx`, `components/ui/node-icon.tsx` | icon names (`iconLookupKey`), the studio's own furniture icons (`STUDIO_ICONS`), the suggested icons with Georgian/Russian/English search words; the picker; drawing an icon by name (server/admin) or from its drawing (`NodeIcon`) |
| `app/api/categories/route.ts`, `[id]/route.ts`, `reorder/route.ts` | the tree's reads and writes (`categorySchema`, `categoryReorderSchema`) |
| `app/api/shelf-rooms/route.ts`, `[id]/route.ts`, `reorder/route.ts` | the studio rooms' reads and writes (`shelfRoomSchema`, `shelfRoomReorderSchema`) |
| `app/admin/categories/page.tsx` + `components/admin/CategoryTree.tsx`, `CategoryTabs.tsx` | the tree page |
| `app/admin/categories/new`, `[id]` + `components/admin/CategoryForm.tsx`, `lib/admin/categoryPages.ts` | the category form |
| `app/admin/categories/rooms/**` + `components/admin/ShelfRoomList.tsx`, `ShelfRoomForm.tsx`, `lib/admin/shelfRoomPages.ts` | the studio rooms |
| `scripts/lib/categoryTree.ts` | `defaultPlacement` — where the seeds put a category they make |

## The tree

Every category is a row of `categories` with a `parentId` (null at the top). A category sits
at depth 1, 2 or 3 (`MAX_CATEGORY_DEPTH`); siblings go in `sortOrder`, then by Georgian name.
A **product sits in one category, at any level**, and **a category stands for its whole
subtree** wherever it is listed: the catalogue's "Sofas & armchairs" shows the corner sofas,
the calculator's "Sanitary" tab the toilets, a studio room listing "Beds" the double and the
single beds. `subtreeCounts` counts that way everywhere a count is shown.

What a category carries beyond its names, slug and icon:

- **`isVisible`** — shown in the site's catalogue. A hidden category hides its subtree there
  (the sidebar and `GET /api/categories`); the calculator's tabs look at the category itself
  only, so hiding a group from the catalogue (say "Materials") does not empty the calculator.
- **`inCalculator`** — offered as a tab in the calculator, with every product under it
  (`GET /api/categories?calculator=true`, `GET /api/products?category=<slug>` takes the
  subtree). The flat catalogue's 21 categories are the calculator's tabs, as before; groups
  and the kind subcategories are not. Its picks keep the tab's slug, so the calculator's
  slug-keyed rules (`selectionKey`, `suggestedQuantity`, `FINISH_WASTE`, `SURFACE_OF_SLUG`,
  `usualFinishCategory`) see what they always saw.
- **`isFurniture`** — the calculator's furniture step against its materials step.
- **`calculationType`** — how the calculator counts it (floor and wall m² decide the finish
  surface, `surfaceOfCategory`).
- **`model3dKind`** — the 3D kind whose products belong here ("Corner sofas" takes
  `sofa_corner`). `categoryForKind` files a product by it: `models:seed`, and a person's own
  upload (`/api/design/models`). Choosing such a category in the product form gives a product
  that has no kind yet this one.

**The kind is not the category.** `products.model3dKind` stays the studio's technical type:
it decides size, placement and matching (`matcher.ts` matches by kind, never by category).
The category decides where a product is listed. They usually agree — the starting tree has a
subcategory per kind — but admin may file differently.

**The code's own categories.** A few slugs are named in code: the calculator's finishes and
tabs, the studio's furniture, fittings, openings, radiators, mouldings and finishes
(`DESIGN_CATEGORY_SLUGS`, `SURFACE_CATEGORY_SLUGS`). A product in a subcategory of one of them
is, to that code, a product of it: the design catalogue gives each product `categorySlug` =
`nearestSlug(tree, its category, known slugs)` — a toilet in "Toilets" is `sanitary` to the
studio's pricing and to `isTrimProduct` — and its own `categoryId` for the shelf. Keep those
slugs; rename the categories freely.

**Where a category may go** (`moveError`): not under itself or anything under it
(`CATEGORY_CYCLE`), not under a parent that is gone (`UNKNOWN_PARENT`), and not so deep that
its own subtree would pass the third level (`CATEGORY_TOO_DEEP`, a category moves with its
children). A new or moved category goes last among its siblings; the tree page's arrows order
siblings (`POST /api/categories/reorder` takes exactly the parent's children, or answers
`STALE_ORDER`). A category with subcategories (`CATEGORY_HAS_CHILDREN`) or products
(`CATEGORY_HAS_PRODUCTS`) is not deleted, and deleting is admin's (`canDeleteIn`); the
catalogue agent makes, edits, moves, orders and hides. A slug another category has is
refused (`SLUG_EXISTS`).

## The starting tree (`lib/catalog/defaultTree.ts`, migrations 0018 and 0020)

The flat catalogue became five groups — **Materials** (tiles, flooring, walls and ceilings,
doors, windows, sockets and switches, radiators, building services), **Lighting**, **Sanitary**,
**Furniture** (sofas and armchairs, beds, tables, chairs, wardrobes, storage, kitchen furniture,
made-to-measure kitchens) and **Decor** (with rugs under it) — with the old categories under
them and **a subcategory per 3D
kind** under those ("Sofas & armchairs" → three-seat sofas, corner sofas, armchairs; "Storage"
→ nightstands, dressers, TV units, bookshelves, open shelving, console tables, shoe
cabinets…), each with an icon. Every product with a kind moved to its kind's subcategory
(`DEFAULT_KIND_CATEGORY` — floor lamps from "Decor" and shoe cabinets from "Tables" landed
where they belong); products without a kind stayed where they were. A category that takes one
kind only keeps it on itself (windows, wardrobes, radiators). The old categories kept their
names and slugs, took `inCalculator`, and lost `phase` (0017 dropped the column: the tree's
order is the order).

Added since, by migration 0020 in the same form: **TV sockets** (`socket_tv`) and **data
sockets** (`socket_data`) under sockets and switches; **Building services**
("საინჟინრო სისტემები", `engineering`) under Materials, with a subcategory per piece of
equipment the technical points are bought as — electrical panels, boilers and water heaters,
air conditioners, cooker hoods, extractor fans, floor drains
([design-studio/technical-and-fittings.md](design-studio/technical-and-fittings.md#equipment-is-bought-one-per-point-libdesignequipmentts));
and **made-to-measure kitchens** ("სამზარეულოს ავეჯი — ინდივიდუალური დამზადება",
`kitchen-custom`) under Furniture, beside kitchen furniture rather than under it — the
calculator's kitchen-furniture tab lists its whole subtree, and these are materials priced per
m² of façade, not pieces — and not furniture to the seeds (`isFurniture: false`), which switch
off model-less products in furniture categories. What it (or a subcategory under it) holds
that is sold by the m² is a kitchen material, from whichever store; anything sold by the piece
there is an ordinary product. None of them is a calculator tab.

Migrations 0018 and 0020 are idempotent SQL generated from the definition: a category that
exists is placed under its parent only while it has none; one that does not is made — so a
database migrated before its seeds gets the whole tree too. `pnpm db:seed` / `db:seed:design` make a
missing category where the tree puts it (`defaultPlacement`) and leave an existing one where
admin put it. Nothing reads the definition at run time.

## The studio's rooms (`shelf_rooms`, `shelf_room_categories`)

The furniture shelf's top row is **rooms admin makes**: a name in three languages, a slug, an
icon, whether the studio shows it, the plan's **room types** it is for, and the **categories it
lists, in its order**. The shelf reads them with the catalogue (`getDesignCatalog` →
`loadShelf`, icons already drawn by `iconNodeFor`, so the studio ships no icon set):

- a product is in a room when one of the room's categories covers its category — so a
  product can be in several rooms (a pendant light in every room that lists pendants);
- the rooms with nothing in them are not offered, and what no room covers is under "other"
  (its row lists the categories those products sit in);
- the shelf opens on the first visible room whose room types include the type in focus
  (`shelfRoomForType`; a studio room's part resolves to its own type), and follows the focus;
- inside a room the line lists its categories; **a category with subcategories that hold
  something opens onto them** — a chip at the head of the line for each step back
  (`shelfTrail`). The starting rooms list the kind subcategories, so the line reads as the
  kinds did; a room may list "Beds" instead and open onto its children.

The catalogue modal reads the same (`browseCatalog(…, { shelf })`): rooms, then under the open
one its categories and under a chosen category its subcategories, indented, each with its count.

The starting rooms are the ten the shelf had in code (`SHELF_ROOMS`), each for its own room
type, listing the subcategories of the kinds its program furnishes it with (`kindsForRoom`).
`SHELF_ROOMS` and `kindsForRoom` are only the starting point now.

Rooms are staff's with the categories section to make, change and reorder
(`POST /api/shelf-rooms/reorder`), and admin's to delete; a room's categories stay when it goes,
and a category deleted leaves the rooms that listed it.

## The admin (`/admin/categories`)

Two tabs. **The tree**: every category under its parent, folded below the second level the first
time (expand/collapse all) and **then as it was left**: the folds are kept in the browser
(`localStorage`, `renovate-admin-category-tree`, read through `storedValue` — the server renders
the default and the browser's own folds follow on hydration), so editing a category and coming
back by the breadcrumbs, the tree's tab or a save finds the tree folded the same way. A search or
a filter unfolds everything it found, and its folds are its own: the page keys the tree on the
search (`key`), and clearing the search brings the kept folds back. The tree's tab and the
breadcrumbs also come back to the search and filter it was left with (`lib/admin/listMemory`,
[partners-and-admin.md](partners-and-admin.md#admin-lists-filters-sort-and-paging-live-in-the-url)).
Each category shows its icon, name and slug, where it shows (hidden from the catalogue,
a calculator tab, its 3D kind, the studio rooms that list it — each a link), how many products
it holds (and how many directly, when it has children — a link to the product list filtered to
its subtree), and its buttons: up and down among its siblings, "+" for a subcategory (not on the
third level), edit. A search and a filter (empty, hidden, calculator tabs, in studio rooms, with
a 3D kind) keep what answers and the categories above it, for context; the dashboard's "empty
categories" links to `?show=empty` (a category with no products and no subcategories). A folded
"How does the tree work?" says the rules above in five lines.

**A category's page** has its whole path as breadcrumbs — the dashboard, categories, then each
category above it, each a link to its own page — with a back button to its parent; the new
category and the studio-room pages have theirs too.

**The category form**: its parent (the tree as an indented select, only the places it may go,
"level N of 3" under it), names, slug (following the English name until typed), icon
(`IconPicker`: the studio's own furniture icons first, then lucide's, searchable in three
languages), calculation type, and where it shows — catalogue, calculator tab, furniture — the
studio rooms that list it (ticked here, ordered in the room) and its 3D kind; how many products
it holds; delete for admin, off while it has subcategories or products. A new subcategory takes
its parent's furniture and calculation settings until changed.

**The studio rooms**: in the shelf's order with arrows, each with its icon, room types,
categories (links) and product count; the form edits names, slug, icon, visibility, room types
(chips) and the categories — an ordered list with up, down and remove, and an indented picker to
add one with its product count.

Product lists (admin's and a store's) filter by category as an indented tree, a category taking
its subtree; the product form picks from the tree.

## Tests

`tests/unit/catalog/tree.test.ts` (order, paths, subtrees, loops kept, counts, where a category
may go, the code's slugs, filing by kind), `tests/unit/catalog/defaultTree.test.ts` (the
starting tree's shape and its migration in step), `tests/unit/design/shelf.test.ts` (rooms,
"other", counts, trails, the room for a type), `tests/unit/design/catalogBrowser.test.ts` (the
modal's rooms → categories → subcategories), `tests/unit/admin/categoryIcons.test.ts` (icon
names, the studio's own icons, drawings), `tests/integration/category-tree-routes.test.ts` (the
routes: last among siblings, depth, loops, slugs, children, reorder, the calculator's tabs, the
studio rooms' guards), `tests/integration/catalog-delete-routes.test.ts` (deleting is admin's).

## Known gaps

- Categories move between parents through the form, not by dragging on the tree page.
- A product sits in one category: a piece that belongs under two branches is listed under one
  (the studio rooms, which may share categories, are the many-to-many part).
- `models:seed` files manifest products by kind every deploy: one admin moved within its
  archetype's category stays, one moved outside it goes back (as prices in the manifest win).
- A new 3D kind gets no category or icon by itself: admin makes its subcategory (with the
  kind and an icon) and lists it in the rooms it belongs in; until then its products go to the
  archetype's category and show wherever that is listed.
