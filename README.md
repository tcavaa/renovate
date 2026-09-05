# რემონტი.ge — RenovateGE

Georgian-language home renovation planner & cost estimator. Plan your renovation, calculate materials, browse partner catalog, choose furniture and book workers — all in Georgian.

> **Tagline**: გეგმე. გამოთვალე. გააკეთე. (Plan. Calculate. Build.)

---

## Stack

| Layer        | Technology                                      |
| ------------ | ----------------------------------------------- |
| Framework    | Next.js 14 (App Router)                         |
| Language     | TypeScript (strict)                             |
| DB           | MySQL 8 via `mysql2`                            |
| ORM          | Drizzle ORM (`drizzle-kit` for migrations)      |
| Styling      | Tailwind CSS 3                                  |
| UI           | shadcn/ui style components, Radix primitives    |
| Icons        | lucide-react                                    |
| State        | Zustand (with `persist` middleware)             |
| Forms        | React Hook Form + Zod                           |
| Auth         | NextAuth.js v5 (Credentials + optional Google)  |
| Fonts        | Noto Sans / Noto Serif Georgian                 |
| Package mgr  | pnpm                                            |
| Deployment   | Self-hosted (PM2 + Nginx reverse proxy)         |

---

## Features

### 3D Design Studio (`/design`)

Upload a 2D floor plan, pick a style — see your home in 3D, furnished with real products you
can actually buy.

- **Floor-plan parsing** — a photo or export of a 2D plan is read into room polygons in the
  browser (~90 ms, no server round trip, no AI). Photographs are deskewed, unevenly lit paper
  is thresholded locally, and room labels and dimension figures are filtered out before
  anything is measured. You confirm the scale and the room types.
- **Correct anything the parser got wrong** — change a room's type, name, ceiling height or
  its width and depth; delete a room, or add one by hand.
- **Procedural 3D** — walls extruded with real door and window openings, floors, skirting,
  and a doll's-house cutaway that hides whichever walls you are looking through.
- **Real models, never stand-ins** — every object in the room is a downloadable 3D product:
  the partners' own files where they exist, and CC0 stock furniture (Poly Haven, Kenney) for
  the kitchens, bathrooms, rugs and lamps no partner sells yet. Each has a photo, a price and
  a shop, and the swap panel offers 3–4 alternatives per slot.
- **Four styles** — თანამედროვე / სკანდინავიური / ინდუსტრიული / ვინტაჟი. Switching style
  swaps the furniture for that style's range and redresses the surfaces without rearranging
  the flat.
- **Floors and walls per room** — parquet, laminate, tiles, plaster, brick, wallpaper, each a
  real product priced by the room's area; bathrooms default to tiles. Click a floor or a wall
  in 3D to change it.
- **Calculator and studio are one flow** — upload the plan in the calculator's first step,
  pick materials and furniture, and the summary's "see the flat in 3D" button furnishes the
  same rooms with what you chose (labelled as yours) and fills the rest by style.
- **Every rate is editable in admin** — material quantities per m² and labour prices live in
  the `rates` table, not in code.
- **Automatic furniture layout** — rule-based, the way a designer works: the bed goes on the
  wall you see when you walk in, the sofa on the longest wall, the coffee table a metre in
  front of it, nothing blocking a door.
- **Move it yourself** — drag furniture straight in the 3D view. It squares up to the wall you
  push it against, snaps flush, and refuses a drop that would overlap something. Rotate with
  the panel buttons or **R**.
- **Walk through it** — switch from the doll's-house view to standing inside at eye height.
  Drag to look, WASD or the arrow keys to walk, shift to hurry. You can walk from room to room
  through the doorways, but not through the walls.
- **Every object is a real SKU** — hover any piece for its price, the partner store that
  stocks it, that shop's address, rating and delivery time. Click to swap it for an
  alternative and watch the total change.
- **Two modes** — *design only* (furniture and decor for a finished home) or
  *renovation + design* (materials and labour folded in from the calculator engine).
- **Shopping list grouped by store**, with per-store delivery and a per-room breakdown.

No AI is involved anywhere in that pipeline: the same plan and style always produce the same
flat, in milliseconds, at zero cost per view.

### Renovation calculator

- **5-step calculator** — home state (black/white/green frame) → rooms → materials → catalog → furniture → summary
- **Auto material engine** — computes cement, paint, tile, cable, screed quantities with industry-standard waste factors
- **Worker labor estimation** — applies per-m² labor rates to the relevant phases automatically
- **Real product catalog** — browse and select products from partner stores; running cart in calculator step 3-4
- **Workers directory** — verified freelancers per specialty with ratings
- **Project save** — guests get session-only drafts; logged-in users save permanently
- **Admin panel** — `/admin` (role=admin) with dashboard, products CRUD (including the 3D design fields), partner stores, categories, workers, projects
- **Fully Georgian UI** — every string sourced from `lib/i18n/ka.ts`

---

## Quick start

```bash
# 1. Install
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Edit DB credentials and AUTH_SECRET

# 3. Create the database
mysql -u root -p -e "CREATE DATABASE renovate_ge CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 4. Push schema and seed
pnpm db:push
pnpm db:seed          # categories, products, workers, admin user
pnpm db:seed:design   # partner stores + the design categories (no furniture yet)

# 5. Extract the 3D assets (optional — textures and product renders)
pnpm assets:extract

# 6. Convert the partner 3D models, fetch the CC0 stock, and seed them as products.
#    This is where the furniture comes from — without it the studio places nothing.
pnpm models:convert     # needs the partner asset drop
pnpm models:stock       # downloads from polyhaven.com and kenney.nl (cached beside the drop)
pnpm models:seed
pnpm textures:stock     # floor and wall textures → surface products (Poly Haven, ambientCG, the drop)
pnpm db:seed:rates      # the calculator's rate book (editable at /admin/rates)

# 7. Run
pnpm dev
```

Without `db:seed:design` the Design Studio loads but has nothing to furnish rooms with.

`drizzle-kit push` is interactive; in a script, apply the DDL with `mysql` directly instead.

App will be available at <http://localhost:3000>.

Default admin login (after seed): the email in `ADMIN_EMAIL` (default **admin@remonti.ge**) with the password in `ADMIN_PASSWORD`. Leave `ADMIN_PASSWORD` empty and the seed generates a random one and prints it once; in production it refuses to run without one.

---

## Scripts

| Script            | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `pnpm dev`        | Start Next.js dev server                    |
| `pnpm build`      | Production build                            |
| `pnpm start`      | Run production server (port 3000)           |
| `pnpm db:generate`| Generate Drizzle migrations                 |
| `pnpm db:push`    | Push schema directly to DB (dev)            |
| `pnpm db:migrate` | Apply migrations                            |
| `pnpm db:studio`  | Open Drizzle Studio                         |
| `pnpm db:seed`    | Seed categories, products, workers, admin   |
| `pnpm db:seed:design` | Seed partner stores + the design categories |
| `pnpm assets:extract` | Pull renders and PBR textures out of the partner 3D asset drop |
| `pnpm models:convert` | Convert partner OBJ exports into textured, compressed, validated GLBs (`--only=a,b` to redo some) |
| `pnpm models:stock`   | Fetch and convert CC0 stock furniture (Poly Haven + Kenney) into `public/models/stock` |
| `pnpm models:seed`    | One product per model in both manifests; deletes every other placeable product |
| `pnpm textures:stock` | Download floor/wall textures and create or update the surface products |
| `pnpm db:seed:rates`  | Create the `rates` table and seed the calculator's default rate book |
| `pnpm test:parser`| Run synthetic floor plans through the parser |
| `pnpm type-check` | TypeScript strict check                     |
| `pnpm lint`       | ESLint                                      |

---

## Folder Structure

```
renovate-ge/
├── app/
│   ├── (auth)/         login & register pages
│   ├── (main)/         marketing + calculator + design studio + catalog + workers
│   │   ├── calculator/{,materials,catalog,furniture,summary}
│   │   ├── design/{,plan,style,studio,summary}    2D plan → 3D studio
│   │   └── catalog/[slug]
│   ├── admin/          dashboard + CRUD (role=admin)
│   ├── api/            REST endpoints (products, categories, stores, workers, calculator, projects, design/*)
│   ├── globals.css
│   └── layout.tsx
├── auth.ts             NextAuth v5 config
├── components/
│   ├── ui/             Button, Card, Input, Select, ...
│   ├── layout/         Header, Footer, AdminSidebar
│   ├── calculator/     StepIndicator, HomeStateSelector, RoomForm, RoomList, MaterialsTable, SummaryCard
│   ├── catalog/        ProductCard, ProductGrid
│   ├── workers/        WorkerCard, WorkerList
│   ├── design/         DesignSteps, PlanCanvas, StylePicker, Viewer3D, ItemCard, SwapPanel
│   ├── admin/          ProductForm, StoreForm, CategoryForm, WorkerForm
│   └── providers/      SessionProvider
├── hooks/              useCalculator, useProducts, useCategories, useWorkers
├── lib/
│   ├── calculator/     constants.ts, materials.ts (engine), types.ts
│   ├── design/         planParser, planGeometry, autoLayout, matcher, manipulate, pricing, styles
│   ├── design3d/       materials, primitives, buildScene, outline
│   ├── db/             schema.ts, index.ts (mysql pool + drizzle)
│   ├── i18n/ka.ts      ALL Georgian strings
│   ├── validations/    Zod schemas
│   └── utils.ts        cn(), formatGEL(), formatM2()
├── store/              calculatorStore.ts, designStore.ts (Zustand + persist)
├── types/              shared TS types
├── scripts/            seed.ts, seed-design.ts, convert-models.ts, stock-models.ts, seed-models.ts, tests
├── drizzle.config.ts
├── tailwind.config.ts
├── next.config.ts
└── tsconfig.json
```

---

## Calculator engine

All business logic lives in `lib/calculator/`. The engine is **pure, deterministic, and UI-free** — components only render what it returns.

### Key functions

| Function                  | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `computeRoomAreas(input)` | Returns floor/wall/ceiling/perimeter from W×L×H            |
| `aggregateRoomTotals(rooms)` | Sums all areas across rooms (incl. wet-room area)       |
| `calculateMaterials(rooms, homeState)` | Returns `MaterialItem[]` with qty, unit, est. price (waste-adjusted) |
| `calculateWorkerCosts(rooms, homeState)` | Returns `WorkerCost[]` (labor by phase)         |
| `buildProjectSummary(...)` | Combines materials + products + furniture + workers + 15% contingency |

### Home states

- `black_frame` — empty concrete shell, all phases 1–18 included
- `white_frame` — walls plastered, electrical/plumbing roughed in, finishing only (phases 9–17)
- `green_frame` — move-in ready; only furniture (phase 17)

### Wet rooms

`bathroom`, `toilet`, `kitchen` are flagged as wet rooms — they receive waterproofing and tile coverage automatically.

---

## Auth

NextAuth v5 with JWT sessions:

- **Credentials provider** — bcrypt password hash, email lookup
- **Google provider** — auto-enabled when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Sessions include `user.role` (`'user' | 'admin'`) — used to gate `/admin`

To create more admins:

```sql
UPDATE users SET role='admin' WHERE email='you@example.com';
```

---

## Deployment (VPS / self-hosted)

```bash
# On the server
git clone <repo> && cd renovate-ge
pnpm install --prod=false
pnpm db:push
pnpm db:seed
pnpm build

# Run with PM2
pm2 start "pnpm start" --name renovate-ge --time
pm2 save
pm2 startup
```

### Nginx reverse proxy snippet

```nginx
server {
  listen 80;
  server_name remonti.ge www.remonti.ge;

  client_max_body_size 20M;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## Roadmap

- [ ] Image uploads to S3 (currently `/public/uploads`)
- [ ] PDF export for the summary page (server-side `puppeteer` job)
- [ ] Worker booking flow + commission tracking
- [ ] Saved-projects page for logged-in users
- [ ] Multi-store comparison view per category
- [ ] SMS notifications via Bog/TBC SMS gateway

---

## License

Private / proprietary. © RenovateGE.
