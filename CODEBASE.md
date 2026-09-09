# RenovationRoom (რემონტი.ge / RenovateGE) — Codebase Reference

> Purpose: quick orientation file for AI-assisted sessions. Summarizes architecture, data model,
> and where things live so the whole codebase doesn't need to be re-read every time.
> Last updated: 2026-07-29. App is NOT yet shipped.

## What the app is

Georgian-language home renovation planner & cost estimator. Users pick their home's state
(black/white/green frame), enter rooms, get an auto-computed materials + labor estimate,
pick real products from partner stores (local Georgian market), pick furniture, and get a
full cost summary. Admin panel manages products/categories/workers/orders.

Tagline: გეგმე. გამოთვალე. გააკეთე. (Plan. Calculate. Build.)

## Stack

- Next.js 14 App Router, TypeScript strict, React 18
- MySQL 8 + Drizzle ORM (`drizzle-kit`), pnpm
- Tailwind 3 + shadcn/ui-style components (Radix primitives), lucide-react icons
- Zustand + persist (localStorage) for calculator state
- React Hook Form + Zod validation
- NextAuth v5 beta (Credentials + optional Google), JWT sessions, role: 'user' | 'admin'
- i18n: ka (primary), en, ru — all strings in `lib/i18n/*.ts`
- Images: local uploads to `public/uploads/*` via `/api/upload` (admin-only, 8MB max)
- Deploy target: self-hosted VPS, PM2 + Nginx, port 3000

## Directory map

```
app/
  (auth)/login, (auth)/register        auth pages
  (main)/                              public site
    page.tsx                           landing
    calculator/                        step 1 (home state + rooms)
      materials/  catalog/  furniture/  summary/   steps 2–5
    catalog/[slug]                     product catalog by category
    workers/  about/  contact/  privacy/  terms/  profile/
    profile/projects/[id]              saved project detail (16KB, rich)
  admin/                               dashboard + CRUD: products, categories, workers, users, orders
  api/
    products/ [id]                     GET public list (pagination, category filter), POST admin
    categories/ [id]                   CRUD
    projects/ [id]                     GET user's projects; POST saves project + computes summary server-side
    calculator/materials               materials calc endpoint
    workers/ [id]                      CRUD
    upload                             admin image upload -> public/uploads/<folder>/
    auth/[...nextauth], auth/register
components/
  ui/          button, card, input, select, dialog, accordion, badge, label, skeleton, textarea
  layout/      Header, Footer, AdminSidebar, LanguageSwitcher, UserMenu
  calculator/  StepIndicator, HomeStateSelector, RoomForm, RoomList, MaterialsTable, SummaryCard
  catalog/     ProductCard, ProductGrid
  workers/     WorkerCard, WorkerList
  admin/       ProductForm, CategoryForm, WorkerForm, UserForm, ImageUploader
lib/
  calculator/  constants.ts (rates), materials.ts (pure engine), types.ts
  db/          schema.ts, index.ts (mysql2 pool + drizzle)
  i18n/        ka.ts (41KB, primary), en.ts, ru.ts, client.tsx, server.ts, labels.ts
  validations/ zod schemas: product, category, project, room, worker
  utils.ts     cn(), formatGEL(), formatM2()
store/calculatorStore.ts   Zustand store (persisted, key 'renovate-calculator')
types/                     re-exports of calculator + product types
scripts/seed.ts            seeds categories, products, workers, admin user
```

## DB schema (lib/db/schema.ts)

- **users**: id, name, email (unique), passwordHash, role enum('user','admin')
- **categories**: nameKa/nameEn, slug, icon, phase (int, renovation phase 1–18),
  calculationType enum(per_m2_floor, per_m2_wall, per_m2_ceiling, per_linear_m, per_unit, per_room, fixed),
  isVisible, isFurniture, sortOrder
- **stores**: nameKa, logoUrl, websiteUrl, phone, address, commissionRate (default 5%), isActive
- **products**: categoryId FK, storeId FK, nameKa, descriptionKa, slug, sku,
  pricePerUnit decimal, unit enum(m2, linear_m, piece, liter, kg, pack, set),
  coveragePerUnit, brand, imageUrl, **images json**, **specs json**, **tags json**,
  isActive, isFeatured, sortOrder
  → `tags` json is where style tags (modern, minimalist…) go for AI matching.
  → no 3D model field yet; would need e.g. `model3dUrl` / `model3dStatus` columns.
- **workers**: nameKa, specialty, specialtySlug, phone, pricePerM2/pricePerUnit,
  priceUnit enum(m2, unit, fixed), rating, reviewCount, bio, avatarUrl, isVerified, isActive
- **projects**: userId FK (nullable → guest), sessionId, nameKa, homeState enum,
  totalM2, **rooms json**, **selectedProducts json**, **selectedFurniture json**,
  totalMaterialsCost/totalFurnitureCost/totalWorkersCost/totalCost, status enum(draft, saved, submitted)
  → no floor-plan image or 3D scene field yet.

## Calculator engine (lib/calculator/) — pure, deterministic, UI-free

- `computeRoomAreas({width,length,height,type})` → Room with floorM2, wallM2, ceilingM2, perimeterM, isWetRoom
- `aggregateRoomTotals(rooms)` → totals incl. wet-room m², door/window counts (heuristic: 1 door per room, window for non-bath/toilet/hall/storage)
- `calculateMaterials(rooms, homeState)` → MaterialItem[] from MATERIAL_RATES_PER_M2 table
  (each rate: qtyPerM2, unit, wasteFactorPct, phase, basis floor|wall|ceiling|wet_floor|perimeter,
   estimatedPriceGEL, optional linkedCategorySlug → links generic material to catalog category)
- `calculateWorkerCosts(rooms, homeState)` → labor per phase from WORKER_RATES
- `buildProjectSummary(rooms, homeState, products, furniture)` → all subtotals + grandTotal + 15% contingency
- Home states gate phases: black_frame = phases 1–18, white_frame = 9–17, green_frame = 17 only
- Wet rooms: bathroom, toilet, kitchen (waterproofing + tiles; tile area = wet floor × 1.5)
- Phase names in PHASE_NAMES (1 structure/demolition … 17 furniture, 18 cleanup)

## Calculator flow (5 steps, state in Zustand)

1. `/calculator` — pick homeState + add rooms (RoomForm: type, W×L×H)
2. `/calculator/materials` — auto-computed materials table
3. `/calculator/catalog` — pick real products per material category (selectedProducts: Record<key, SelectedProduct>)
4. `/calculator/furniture` — pick furniture per room (selectedFurniture: Record<roomId, SelectedProduct[]>)
5. `/calculator/summary` — SummaryCard; POST /api/projects saves + recomputes server-side

## API conventions

- All routes return `{ data, error }` JSON envelope; `runtime='nodejs'`, `dynamic='force-dynamic'`
- Admin-gated writes check `session.user.role === 'admin'` via `auth()` from auth.ts
- Zod safeParse on every POST body; decimals stored as strings (Drizzle mysql decimal)

## Known gaps / roadmap (from README)

- Images stored locally, S3 planned; no PDF export yet; no worker booking flow;
  multi-store comparison and SMS notifications planned.
- No AI features exist yet anywhere in the codebase.
- No 3D/rendering code or deps (no three.js) yet.

## Conventions to follow when extending

- Every user-facing string goes through lib/i18n (ka primary)
- Business logic stays in lib/ pure functions; components render only
- New tables in lib/db/schema.ts + drizzle push; new validation schema in lib/validations
- Product ↔ material linkage via category slug (`linkedCategorySlug`)
