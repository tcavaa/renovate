# Partners, the partner portal and the admin panel

Stores, workers and brigades as partners (self-registration, approval, what they may edit,
their portal), the public brigade and worker pages, and the admin panel's sections and lists.
Read this before touching `app/admin/`, `app/partner/`, `components/admin/`,
`components/partner/`, the registration routes, or the public `/teams` and `/workers` pages.

Related: [auth-and-roles.md](auth-and-roles.md) (roles and guards — who may open which section)
· [marketplace.md](marketplace.md) (orders, the order editor, revenue, settings) ·
[catalog.md](catalog.md) (products, stores and the product form) ·
[calculator.md](calculator.md) (the rate book at `/admin/rates`) ·
[data-model.md](data-model.md) (`stores`, `workers`, `teams`, `team_members`, reviews, works).

## Key files

| File | Responsibility |
|---|---|
| `app/admin/layout.tsx` + `components/layout/AdminSidebar.tsx` | the admin shell; the sidebar shows the sections the role has, with counts of what waits (`lib/admin/badges.ts`) |
| `app/admin/page.tsx` | the dashboard, cut to the role: its buttons, figures, queue and to-dos |
| `lib/admin/guard.ts` | `requireAdminPage(section)` — the first call of every admin page and section layout |
| `lib/admin/list.ts` | `parseListParams`, `hrefWith` — list state (filters, sort, page) in the URL; `inIdOrder` — a page read by id, back in its sorted order |
| `lib/admin/listMemory.ts`, `lib/admin/storageStore.ts` | where each list was left in the tab (`rememberList`, `listHref`, `rememberedListHref`, `useListMemory`); a value kept in session or local storage, read as an external store (`storedValue`) |
| `lib/admin/crumbs.ts`, `components/admin/AdminCrumbs.tsx` | the breadcrumbs and back button every admin page carries (`sectionCrumb`) |
| `lib/admin/filters.ts` | what a filter button says: a tree option's plain name, option search, `rangeSummary`, `dateRangeSummary` |
| `components/admin/FilterBar.tsx`, `AdminList.tsx` (`AdminPageHeader`, `Pager`, `SegmentedLinks`), `RememberList.tsx` | the list chrome: the filter bar (and its pieces, `FilterFrame`, `FilterSearch`, `FilterMenu`, `FilterToggle`, for a list that filters in the browser), the page header with its crumbs, the pager, a list's views as one control |
| `components/admin/*Form.tsx` | `ProductForm` (+ `ModelUploader`, `ImageUploader`), `StoreForm` (the commission and the building-materials switch for admin only), `CategoryForm`, `WorkerForm`, `TeamForm`, `AccountForm` (accounts — [auth-and-roles.md](auth-and-roles.md#managing-accounts-adminusers-admin-only)), `SettingsForm`, `RatesTable`, `PartnerApproval`, `RevenueChart` |
| `components/admin/BulkSelect.tsx`, `ProductRowActions.tsx` | ticking rows of a server list and acting on them together (`POST /api/products/bulk`); a product row's edit / hide-show / delete buttons — the admin's product list and a store's own (delete only where `canDelete`) |
| `lib/admin/icons.ts`, `components/admin/CategoryIcon.tsx`, `IconPicker.tsx` | icon names (`iconLookupKey`, `iconKebabName`, `iconMatches`), the studio's own furniture icons (`STUDIO_ICONS`) and the suggested icons with Georgian / Russian / English search words; an icon from its stored name; the searchable icon window |
| `app/admin/categories/**`, `components/admin/CategoryTree.tsx`, `CategoryForm.tsx`, `ShelfRoomList.tsx`, `ShelfRoomForm.tsx` | the category tree and the studio's rooms ([categories.md](categories.md#the-admin-admincategories)) |
| `app/api/auth/register-partner/route.ts` + `components/auth/PartnerRegisterForm.tsx` | a store or worker registering themselves |
| `app/api/stores/[id]/approval`, `app/api/workers/[id]/approval` | admin's (and, for stores, the catalogue agent's) verdict |
| `lib/validations/partner.schema.ts` | self-registration and a worker's self-edit (`workerSelfSchema`) |
| `lib/partner/context.ts` | `loadPartnerContext` (which partner, its `approvalStatus`), `partnerHref`, admin preview via `?store=` / `?worker=` / `?team=` |
| `app/partner/*`, `components/partner/*` | the portal: dashboard with analytics (`lib/partner/analytics.ts`), orders, a store's products (list with filters and bulk actions; `ProductForm` with `partner`), a worker's card (`WorkerSelfForm`, `WorkerServiceFields`), a brigade's company profile and crew (`TeamProfile`, `TeamSelfForm`) |
| `app/partner/projects/`, `lib/partner/projects.ts`, `components/projects/ProjectViewer.tsx` | a brigade's projects: the ones it is booked for, to look at only — `teamMaySeeProject`, `teamProjectBookings`; the read-only 2D / 3D / walk-through viewer |
| `lib/features.ts` | `WORKERS_DIRECTORY` — the switched-off public workers directory |
| `app/(main)/teams/`, `components/teams/TeamCard.tsx`, `lib/teams/queries.ts` | the public brigade pages |
| `scripts/seed-partners.ts`, `seed-teams.ts`, `seed-workers.ts` | partner logins, brigades, worker profiles and reviews |

## The admin panel

One folder per section under `app/admin/` (dashboard, orders, projects, products, categories,
stores, workers, teams, rates, revenue, payments — the card transactions,
[payments.md](payments.md#admin) — users, settings). Which role sees which section is
`canAdmin` in `lib/auth/roles.ts` ([auth-and-roles.md](auth-and-roles.md)); every page and every
section layout calls `requireAdminPage(section)`.

**The dashboard is cut to the role** (`app/admin/page.tsx`). Every quick button, figure and
"needs attention" line belongs to a section, and only the role's own are shown:

- the **orders agent** gets "orders to confirm · N" as its button, four figures (to confirm,
  waiting for partners, in progress, done this month — each a link to the filtered orders), the
  queue of store orders waiting for confirmation (oldest first, each with "confirm" into its
  project's orders) and the recent projects;
- the **catalogue agent** gets "add product / store / category", the catalogue's figures
  (active products, products without a photo, without a 3D model, stores waiting for approval)
  and its to-dos (products without a model, hidden products, empty stores and categories);
- **admin** gets all of it, plus this month's revenue, workers, accounts, rates and settings.

The revenue report is only queried for admin. The building-materials supplier sells no
catalogue products by design and is not flagged as an empty store; the stores list marks it
with a badge beside its name, and admin makes a store the supplier on its form ("ამ მაღაზიიდან
შეიკვეთება სამშენებლო მასალები" — one store for all of them, so ticking it moves them from the
store that had them, which the form names) or in the settings
([marketplace.md](marketplace.md#construction-materials-the-materials-supplier)). The sidebar shows beside a
section what waits on the person looking (`lib/admin/badges.ts`): orders to confirm, stores and
workers waiting for approval.

## Partners register themselves; admin approves (`lib/validations/partner.schema.ts`)

`/register` carries two more doors under the ordinary form: `/register/store` and
`/register/worker`. `POST /api/auth/register-partner` creates the `stores` / `workers` row
**first** — `approvalStatus: 'pending'`, `isActive: false` — then the account with the
matching role and `storeId` / `workerId`, and sends the verification mail;
`PartnerRegisterForm` then signs the person in (`signIn('credentials')`) and opens `/partner`.
They land in the partner portal with a "waiting for verification" banner (`loadPartnerContext` carries
`approvalStatus`) and can already fill in products or their card.

**What "pending" hides.** A store's `isActive` is the visibility switch everywhere it was
before (store sidebar, studio's store list, workers' `isActive` for the directory). Products
of a pending store are the new case: every public product query — `/catalog`, the landing
wall, `GET /api/products`, `lib/api/designCatalog.ts`, the related products on a product
page — joins `stores` and requires `products.storeId IS NULL OR stores.isActive` (with
`products.isActive` and `ownerUserId IS NULL`; `publicProductCondition` in
`lib/api/productAccess.ts`), so a pending store can add products without them showing; the
product page and `GET /api/products/[id]` answer 404 for them to the public, while the store
itself (through the API) and staff can still read them
([catalog.md](catalog.md#who-sees-a-product-libapiproductaccessts)). Do the same in any new
public product query.

Admin decides on the store / worker edit page (`PartnerApproval`, `POST
/api/stores/[id]/approval` — admin or `agent_catalog` — and `/api/workers/[id]/approval` —
admin only): approving sets `approved` + `isActive` (workers also become `isVerified`),
rejecting sets them inactive (even a store approved before). The dashboard's
"needs attention" list and the `status=pending` filter on the admin store and worker lists
are where they surface.

**What partners may edit.** `requireCatalogEditor()` in `lib/api/route.ts` admits admin,
`agent_catalog` or a linked `store` account to the product routes; a store may only write its own products
(`storeId` forced, `isFeatured`/`sortOrder` ignored), through the same `ProductForm` with a
`partner` prop (`/partner/products/new`, `/partner/products/[id]`). **A store's product page**
(`/partner/products`) counts its shelf at the top — all, shown, hidden, without a photo,
without a 3D model, each a link to that view — then search (name, SKU, brand), filters
(category, visibility, 3D, photo), sorting (newest, best-selling, by revenue, name, price) and
paging in the URL like the admin's lists; each row shows what the product sold (revenue,
units, orders — only orders the store was sent, cancelled ones and struck lines left out) and
has edit / hide-show / delete buttons, and ticked rows are shown, hidden or deleted together
(`POST /api/products/bulk`, the store's own products only). A hidden product leaves the
catalogue and the studio at once; its orders stay. **A brigade** edits its company profile at
`/partner/profile` (`TeamSelfForm` → `PUT /api/teams/[id]` with `teamSelfSchema`: names and
descriptions in three languages, foreman, phone, e-mail, city, logo, experience, how many sites
it runs at once), sees its standing (rating, load against capacity — "busy" to customers when
full —, commission, verified) and its crew with their trades; the crew, the markup, the
commission and the standing stay with admin. **A brigade sees the whole project it is hired
for, and changes none of it**: `/partner/projects` lists its bookings' projects (customer,
phone, area, the booking's stage) and `/partner/projects/[id]` opens one — the project page
(`ProjectDetail`: figures, the customer's name and phone, layout and rooms, the calculator's and
the design's budget sheets as the customer left them, photos and renders) with a viewer on top
(`ProjectViewer`: the 2D plan on the board with its layers — furniture, electrical, technical
points, zones (off to start with: white floors), dimensions — the furnished 3D model, and the
walk-through; the uploaded plan file and the plan as a PDF). A project with no design shows the
calculator's board, its technical points and its fittings (`calculatorBoard.electrical`). Nothing there writes: the board is `readOnly` and locked (nothing hovered or selectable; every
drag pans, the wheel zooms), `Viewer3D` takes `readOnly` (no hover, no picking, no drag),
and the sheets are the read-only `BudgetSheet`. The project opens only while the brigade has a
sent, not-cancelled booking for it (`teamMaySeeProject`; a turned-down booking closes it again);
the booking's page, the order list and the dashboard link to it. **No partner changes an
order's lines, prices or delivery** — they move the order along and comment ([marketplace.md](marketplace.md#order-review-the-platform-confirms-every-store-order)). `requireUploader()` opens
`/api/upload` (images) to every linked partner; `/api/upload/model` (GLB) takes
`requireCatalogEditor()`, so of the partners only stores. A worker edits their own card at
`/partner/profile` with `WorkerSelfForm` — the same service and price fields as registration
(`WorkerServiceFields`), sent to `PUT /api/workers/[id]` which accepts `workerSelfSchema`
from the worker themself and the full admin schema from admin; rating, verification,
commission and activation are never theirs. Admin previewing a worker's `/partner/profile`
with `?worker=` is sent to the admin form instead; the portal's product pages render nothing for
admin (see Known gaps).

## Admin lists: filters, sort and paging live in the URL

Every admin list (`/admin/products`, `categories`, `stores`, `workers`, `teams`, `orders`,
`projects`, `users`) is a server component that first calls `requireAdminPage(section)`, then
reads its state from the query string through `parseListParams` in `lib/admin/list.ts` and
renders `FilterBar` (client, writes the URL) plus `Pager` (`components/admin/AdminList.tsx`,
server, links). The projects list, and the dashboard's newest projects, sort and cut the page on
the ids alone and then read those rows by id, put back in order by `inIdOrder`: their rows read
a project's plan and picks, which MySQL would otherwise carry through its sort buffer
([data-model.md](data-model.md#mysql-out-of-sort-memory-dont-sort-rows-that-carry-big-json)).

**The filter bar** (`FilterBar`, declarative: the page lists its fields) is two rows in one
frame: the search box (a pause after typing, or Enter; its own ×) and the sort menu on top; under
them "Filters" with how many are set, then one button per filter and "clear filters" at the end
while anything is set. A filter button reads as its name while unset; set, it turns dark, says
what it is set to ("Status: active", "Price: 15–40 ₾") and carries its own ×. It opens a panel:
a list of choices with "all" first — a list longer than eight gets a search box of its own
(the category tree's options are searched by their plain names), the arrow keys move through it,
a choice closes it — or, for a `range` (price, cost, a rating's lower end) and a `dateRange`,
both ends in one form with "apply" and "clear". A `select` with a single choice ("featured
only", "unread") is a switch, not a list. The panel closes on a click outside and on Escape
(matched on `event.code`) and puts the focus back on its button after a choice. The rate book,
which filters in the browser, builds the same bar from the pieces (`FilterFrame`,
`FilterSearch`, `FilterMenu`). A list split into views — the order queue and every order, the
revenue report's periods — shows them as one segmented control (`SegmentedLinks`, links).

**A list is remembered where it was left** (`lib/admin/listMemory.ts`): the filter bar writes
the list's query string to session storage as it changes (`RememberList` does it for the revenue
report, whose controls are links), and every road back to the list reads it — the breadcrumbs
and back button, the sidebar's section links (`AdminSidebar`), the categories' tree tab, and the
forms' redirect after a save or a delete (`rememberedListHref` in `ProductForm`, `StoreForm`,
`WorkerForm`, `TeamForm`, `CategoryForm`, `ShelfRoomForm`, `AccountForm`; the partner portal's
product list comes back the same way). So a product opened from "laminate, 15–40 ₾, active,
page 2" goes back to exactly that. A link that carries its own query (a dashboard figure) goes
where it says, and that view becomes the one remembered; "clear filters" is the way to the whole
list. Session storage: a new tab or tomorrow starts on the whole list.

**Every admin page carries breadcrumbs** at its top (`AdminCrumbs`,
through `AdminPageHeader`'s `crumbs`, or on its own over a page with a custom head — an order,
a project through `ProjectDetail`'s `crumbs`): a back button to the crumb above, then the
dashboard, the section (`sectionCrumb`, a link back to its remembered list) and the thing open —
a product, a store, an account, a category with its whole path. The dashboard's own crumbs start
at the site. A detail page's title is the thing's name (a product's, a worker's), the section's
"new" pages say what is being made ("New product"). The product list also filters by photo, ticks rows for bulk show / hide /
delete (`BulkSelect`) and has per-row actions (`ProductRowActions`); people's own furniture is
not listed there. **Deleting is admin's** (`canDeleteIn`): the catalogue agent's product list
offers show and hide only, and its product, category and store forms have no delete button —
the agent switches a product or a store off instead (the routes refuse a delete from it with a
403 all the same). **The categories section** is the category tree and the studio's rooms —
two tabs: the tree folds and unfolds, orders siblings with arrows, adds subcategories, and
shows where each category appears (catalogue, calculator, 3D kind, studio rooms); the rooms tab
makes and orders the furniture shelf's top row and the categories each lists. How it works and
what each switch means is in [categories.md](categories.md#the-admin-admincategories). The orders list opens on its queue tab; the users list counts the account
groups ([auth-and-roles.md](auth-and-roles.md#managing-accounts-adminusers-admin-only)). The
same `FilterBar` and `Pager` serve the partner portal's orders and products. A filtered view is therefore a URL: the dashboard's
"needs attention" items link straight to the matching filter
(`/admin/products?model=none&status=active`), and a colleague can be sent a filtered list.
Adding a filter is one `where.push(...)` in the page and one field in the `FilterBar`
config; strings live under `admin.filters` in the dictionaries. The rates table filters
client-side because every row is an editable form.

## The public brigade and worker pages

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
  `aria-current="page"`.
- **Brigades** (`/teams`, `/teams/[slug]`): the public list and page of each brigade
  (`components/teams/TeamCard.tsx`, `lib/teams/queries.ts`); its members are names, not links,
  while the workers' directory is off.

## Tests

No unit tests cover the admin or portal pages themselves; `tests/unit/api/helpers.test.ts`
covers `requireAdmin` and the route helpers, `tests/unit/api/accounts.test.ts` who may open
which section, who may delete (`canDeleteIn`) and where each role lands,
`tests/integration/order-routes.test.ts` and `tests/integration/product-routes.test.ts` what
the portal's order and product actions may do, `tests/integration/catalog-delete-routes.test.ts`
who may delete a category, a store and products in bulk, `tests/unit/admin/categoryIcons.test.ts`
the icon names (every lucide icon found again from its stored name; the suggested ones real and
searchable in three languages; the studio's own icons), `tests/unit/admin/listMemory.test.ts`
(the stored value, where each list was left, the section crumbs) and `filters.test.ts` (what a
filter button says), the category tree's and studio rooms'
routes ([categories.md](categories.md#tests)),
and `e2e/public.spec.ts` the workers-directory redirect. The partner analytics
(`lib/partner/analytics.ts`) read the database and are exercised through the pages.

## Known gaps

- A brigade's rating, reviews and completed jobs are fields, not a history: nothing computes
  them from finished orders yet, and a team has no portfolio of its own (its workers do).
- Brigades cannot register themselves (logins come from `pnpm db:seed:teams` or admin's
  new-account page), and a brigade cannot change its own crew — admin does, in `TeamForm`.
- Admin previewing `/partner/products/new` or `/partner/products/[id]` gets an empty page; only
  `/partner/profile` sends admin to the admin form.
- Admin previewing the portal (`?team=` and the others) sees the generic sidebar: a layout
  gets no query string, so it does not know which partner is being previewed — a brigade's
  "Projects" link is not in it (the pages themselves are right).
- A brigade sees a project as it is now, not as it was when it was booked: a customer who
  edits the design afterwards changes what the brigade sees (the booking's own lines stay).
- Rejecting a store sets it inactive even if it had been approved before.
