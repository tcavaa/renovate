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
| `app/admin/layout.tsx` + `components/layout/AdminSidebar.tsx` | the admin shell; the sidebar shows the sections the role has |
| `lib/admin/guard.ts` | `requireAdminPage(section)` — every admin page's first call |
| `lib/admin/list.ts` | `parseListParams`, `hrefWith` — list state (filters, sort, page) in the URL |
| `components/admin/FilterBar.tsx`, `AdminList.tsx` (`Pager`) | the list chrome |
| `components/admin/*Form.tsx` | `ProductForm` (+ `ModelUploader`, `ImageUploader`), `StoreForm`, `CategoryForm`, `WorkerForm`, `TeamForm`, `UserForm`, `SettingsForm`, `RatesTable`, `PartnerApproval`, `RevenueChart` |
| `app/api/auth/register-partner/route.ts` + `components/auth/PartnerRegisterForm.tsx` | a store or worker registering themselves |
| `app/api/stores/[id]/approval`, `app/api/workers/[id]/approval` | admin's (and, for stores, the catalogue agent's) verdict |
| `lib/validations/partner.schema.ts` | self-registration and a worker's self-edit (`workerSelfSchema`) |
| `lib/partner/context.ts` | `loadPartnerContext` (which partner, its `approvalStatus`), `partnerHref`, admin preview via `?store=` / `?worker=` / `?team=` |
| `app/partner/*`, `components/partner/*` | the portal: dashboard, orders, a store's products (`ProductForm` with `partner`), a worker's card (`WorkerSelfForm`, `WorkerServiceFields`) |
| `lib/features.ts` | `WORKERS_DIRECTORY` — the switched-off public workers directory |
| `app/(main)/teams/`, `components/teams/TeamCard.tsx`, `lib/teams/queries.ts` | the public brigade pages |
| `scripts/seed-partners.ts`, `seed-teams.ts`, `seed-workers.ts` | partner logins, brigades, worker profiles and reviews |

## The admin panel

One folder per section under `app/admin/` (dashboard, orders, projects, products, categories,
stores, workers, teams, rates, revenue, users, settings). Which role sees which section is
`canAdmin` in `lib/auth/roles.ts` ([auth-and-roles.md](auth-and-roles.md)). The dashboard
(`app/admin/page.tsx`) lists what needs attention — pending partners, products without a
model, orders waiting on a partner, partners without e-mail or login — each linking to the
matching filtered list.

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
`partner` prop (`/partner/products/new`, `/partner/products/[id]`). `requireUploader()` opens
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
server, links). A filtered view is therefore a URL: the dashboard's
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

No unit tests cover the admin or portal pages; `tests/unit/api/helpers.test.ts` covers
`requireAdmin` and the route helpers, and `e2e/public.spec.ts` the workers-directory redirect.

## Known gaps

- A brigade's rating, reviews and completed jobs are fields, not a history: nothing computes
  them from finished orders yet, and a team has no portfolio of its own (its workers do).
- Brigades cannot register themselves (logins come from `pnpm db:seed:teams`), and the admin
  user form cannot link an account to a team.
- Admin previewing `/partner/products/new` or `/partner/products/[id]` gets an empty page; only
  `/partner/profile` sends admin to the admin form.
- Rejecting a store sets it inactive even if it had been approved before.
