# Data model

The MySQL schema (Drizzle ORM), how JSON and decimal columns behave, and how the schema is
changed. Read this before touching `lib/db/`, adding a column or table, or writing a query.

Related: [architecture.md](architecture.md) · [operations.md](operations.md) (migrations in
deploys) · [project-flow.md §6](project-flow.md) (the `projects` row as the flow uses it) ·
[calculator.md](calculator.md#selection-keys) (keys inside `selectedProducts`) ·
[marketplace.md](marketplace.md) (checkouts and orders).

## Key files

| File | Responsibility |
|---|---|
| `lib/db/schema.ts` | every table (Drizzle `mysqlTable`) |
| `lib/db/index.ts` | the mysql2 pool + drizzle instance; TLS when `DATABASE_SSL=true` (`DATABASE_SSL_CA` for a provider's CA) |
| `lib/db/json.ts` | the `json()` column type used by the schema — parses the strings MariaDB returns for JSON (LONGTEXT); a no-op on MySQL |
| `lib/db/migrations/` | generated SQL migrations `0000`–`0013` + `meta/` (never edit a generated file) |
| `drizzle.config.ts` | drizzle-kit config (honours `DATABASE_SSL`) |
| `scripts/migrate.ts` | `pnpm db:migrate` / `db:migrate:baseline` |
| `scripts/db-indexes.ts` | `pnpm db:indexes` — idempotent secondary indexes (a stopgap where push is not an option) |
| `lib/validations/*.schema.ts` | the Zod schemas for every payload that writes a row |

## Changing the schema

1. Edit `lib/db/schema.ts`.
2. `pnpm db:generate` (drizzle-kit generate) → commit the new file under `lib/db/migrations/`.
3. `pnpm db:migrate` applies pending migrations (what deploys run — [operations.md](operations.md)).
   A database created with `db:push` before migrations existed needs `pnpm db:migrate:baseline`
   once.
4. Add or extend the Zod schema in `lib/validations/`.

`pnpm db:push` is for local experiments only. `drizzle-kit push` is interactive and hangs in a
non-interactive shell; for a scripted change apply the DDL with `mysql` directly.

## Tables

| Table | Columns and notes |
|---|---|
| `users` | id, name, email (unique), passwordHash (null for social logins), `role` (`user` / `admin` / `agent_orders` / `agent_catalog` / `store` / `worker` / `team`), `storeId` / `workerId` / `teamId` (a partner account's link), `emailVerifiedAt`, createdAt — see [auth-and-roles.md](auth-and-roles.md) |
| `auth_tokens` | single-use e-mail verification and password-reset tokens: userId (cascade), kind, SHA-256 `tokenHash`, expiresAt, usedAt |
| `categories` | nameKa / nameEn / nameRu, slug, icon, `phase` (a sort and filter key — the seed uses 9–16 for materials and 20 for furniture; not the rate book's 0–14 phases), `calculationType` enum (`per_m2_floor`, `per_m2_wall`, …), isVisible, `isFurniture`, sortOrder |
| `stores` | nameKa (**unique**) + en/ru, descriptions, logoUrl, websiteUrl, phone, address, `city`, `rating`, `reviewCount`, `deliveryDays`, `deliveryFeeGel`, `email` (order notifications), `commissionRate`, **`approvalStatus`** (`pending` / `approved` / `rejected` — self-registered stores start pending and inactive), isActive |
| `products` | categoryId, storeId, nameKa + en/ru, descriptions, slug, sku, pricePerUnit (decimal-as-string), unit enum, coveragePerUnit, brand, imageUrl, `images` / `specs` / `tags` json, **`styleTags`** json, **`model3dKind`**, **`model3dUrl`**, **`model3dStatus`** (`none` / `pending` / `ready` / `failed`), **`textureUrl`**, **`colorHex`**, **`widthCm` / `depthCm` / `heightCm`**, **`ownerUserId`** (a person's own furniture, cascade — migration 0010), isActive, isFeatured, sortOrder — see [catalog.md](catalog.md) |
| `rates` | the calculator's rate book: kind (`material` / `labour`), unique `key`, labelKa, phase, unit, basis, qtyPerM2, wasteFactorPct, pricePerUnit, linkedCategorySlug, sortOrder, isActive — see [calculator.md](calculator.md) |
| `workers` | nameKa + en/ru, specialty, specialtySlug, phone, email, pricePerM2 / pricePerUnit, priceUnit, rating, reviewCount, bio (+ en/ru), avatarUrl, `city`, `experienceYears`, `completedJobs`, isVerified, **`approvalStatus`**, `commissionRate`, isActive |
| `worker_reviews` | workerId (cascade), authorName, rating 1–5, textKa/En/Ru, jobKa/En/Ru — `workers.rating` / `reviewCount` are the aggregates |
| `worker_works` | workerId (cascade), titleKa/En/Ru, descriptionKa/En/Ru, imageUrl, areaM2, city, year, sortOrder — the portfolio |
| `teams` | a brigade: nameKa (+ en/ru, descriptions), slug (**unique**), `leadName`, phone, email, city, logoUrl, rating, reviewCount, completedJobs, experienceYears, `markupPct` (its own fee over the trades' rates), `commissionRate`, `capacityJobs`, isVerified, `approvalStatus`, isActive — the trades it covers come from `team_members` |
| `team_members` | teamId (cascade), workerId (cascade), `isLead` (the foreman), sortOrder |
| `projects` | see below |
| `project_renders` | projectId (cascade), userId, `sourceUrl` (the studio's own screenshot, stored at once), `renderUrl` (filled when the realistic render exists), status `queued` → `processing` → `ready` / `failed`, `roomName`, `camera` json |
| `platform_settings` | one row: `calculatorFeePerM2`, `designFeePerM2`, `storeCommissionPct`, `workerCommissionPct` — edited at `/admin/settings` |
| `checkouts` | a customer ordering a project: projectId, userId, kind `calculator` / `design`, totalM2, feePerM2, `platformFee`, goodsTotal, commissionTotal, customer name/phone/email, note |
| `orders` | what one partner fulfils: checkoutId, projectId, userId, `partnerType` store / worker / team, storeId / workerId / teamId, `staffNote` (the agent's own, never shown to the customer or the partner), status `new` → `confirmed` → `in_progress` → `done` (or `cancelled`), subtotal, deliveryFee, `commissionPct` (frozen at creation), `commissionAmount`, customer contact, `customerNote`, `partnerMessage`, `viewedAt` |
| `order_items` | orderId (cascade), productId (nullable), name snapshots, categorySlug (`labour:<key>` for labour lines), roomName (255 chars), unit, qty, unitPrice, total, `removed`, note |

**`commissionRate`** on stores, workers and teams defaults to `5.00`, so a new row (a
self-registered one too) gets 5 % rather than the platform setting; only an explicit NULL falls
back to `platform_settings` (`effectiveCommissionPct` in `lib/finance/money.ts`). The store form
cannot clear it.

### `projects`

One row per named project, holding both halves (the calculation and the 3D design). Column by
column, as the flow uses it, is [project-flow.md §6](project-flow.md); in short:

- identity and state: userId (every project since September 2026 has one; older guest rows
  have none), sessionId, `nameKa` (the person's name for it — set by
  `POST /api/projects/create`, changed only by `PATCH /api/projects/[id]`), status (`draft` =
  in progress / `saved` = confirmed with the save button or the checkout / `submitted` =
  ordered), createdAt, updatedAt;
- the calculation: `homeState` (NULL until chosen — migration 0011), totalM2, `rooms`,
  `selectedProducts`, `selectedFurniture`, **`calculatorEdits`** (`{ excluded, quantities,
  choices, progress }` — migration 0009), **`calculatorBoard`** (`{ plan, floorPlanUrl,
  finishes }` — 0011);
- the design: `mode`, `styleId`, `budgetGel`, `floorPlanUrl`, **`plan`** (rooms + walls,
  columns, beams, technical), **`scene`** (items, finishes incl. per-wall and zones, electrical,
  style profile, excluded, quantities, progress), **`versions`** (`DesignVersion[]` — 0006);
- concurrency: **`calculatorRev` / `designRev`** (each half's revision; a save from an older one
  is refused with 409 — 0012) and **`calculatorSaveId` / `designSaveId`** (the id of each
  half's last save — 0013);
- cost columns (`totalMaterialsCost`, `totalFurnitureCost`, `totalWorkersCost`, `totalCost`),
  stored **as edited** (ticks and quantities applied).

Which half a project has is `projectKind` (`lib/projects/saved.ts`): a calculation is
`selectedProducts IS NOT NULL OR mode = 'full'`, a design is `plan IS NOT NULL`; a project can
be both.

## Rules for working with the data

- **Decimals are strings** (Drizzle mysql `decimal`). Always `Number(...)` before arithmetic and
  `String(...)` before insert.
- **JSON columns** go through `lib/db/json.ts` and come back parsed; their shapes are the types
  in `lib/design/types.ts` and `lib/calculator/types.ts` and the Zod schemas that validate them.
- **Public product queries** must require `products.isActive`, `storeId IS NULL OR
  stores.isActive` (a pending store is inactive) and `ownerUserId IS NULL` (people's own
  furniture). `publicProductCondition` in `app/api/products/route.ts` is the reference; the
  catalogue page, the landing wall, related products and the design catalogue apply the same
  conditions in their own queries ([catalog.md](catalog.md)).
- **Server code never trusts a client's prices**: saves and checkouts reprice from the catalogue
  ([project-flow.md §10](project-flow.md), [marketplace.md](marketplace.md)).

## Drizzle: correlated subqueries in `.select({})` don't correlate

A `sql` template with a correlated `select count(*) ... where products.store_id = stores.id`
used as a *field* inside `.select({})` silently returned 0 for every row — it was emitted
uncorrelated. Use `leftJoin` + `groupBy` + `count()` instead (`app/admin/stores/page.tsx` does,
with a comment). A correlated `NOT EXISTS (…)` inside `.where()` is in use on the admin
dashboard (`app/admin/page.tsx`); check the result of any new correlated subquery by hand.

## Tests

The schema itself has no tests; `tests/integration/save-routes.test.ts` mocks `@/lib/db` to test
the project routes' writes (revisions, column ownership, repricing).
