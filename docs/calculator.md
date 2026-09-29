# Renovation calculator

The calculator product (`/calculator`): pick the home's condition, draw or upload the rooms, get
materials and labour from the rate book, choose every room's floor (one product or two sharing
it) and walls (the whole room or wall by wall) and products for the whole flat, add furniture,
and read the summary. Read this before touching
`lib/calculator/`, `lib/summary/`, `store/calculatorStore.ts`, `components/calculator/`,
`app/(main)/calculator/` or the rate book.

Related: [project-flow.md](project-flow.md) (the project around it: hub, gate, autosave, resume,
locks, "see it in 3D") · [budget.md](budget.md) (the summary sheet shared with the design) ·
[design-studio/plan-board.md](design-studio/plan-board.md) (the drawing board on step 2) ·
[design-studio/plan-reading.md](design-studio/plan-reading.md) (plan upload on step 1) ·
[catalog.md](catalog.md) (the products the catalogue step offers) ·
[marketplace.md](marketplace.md) (ordering the summary).

## Key files

| File | Responsibility |
|---|---|
| `lib/calculator/materials.ts` | the pure engine: `computeRoomAreas`, `aggregateRoomTotals`, `calculateMaterials`, `calculateWorkerCosts`, `expandStudios`, `estimateCounts`; `buildProjectSummary` (only the landing page's sample now — the sheet is `calculationCost`) |
| `lib/calculator/constants.ts` | the shipped rate book (`MATERIAL_RATES_PER_M2`, `WORKER_RATES`), phases per home state, room-type sets (`BATH_ROOM_TYPES`, `TILED_FLOOR_ROOM_TYPES`, wet rooms), `ROOM_POINTS`, `RETIRED_RATE_KEYS`, `PHASE_NAMES` |
| `lib/calculator/rates.ts` | rows of the `rates` table → a `RateBook` (`rateBookFromRows`, `defaultRateRows`, `DEFAULT_RATE_BOOK`, `LABOUR_PHASE`) |
| `lib/calculator/types.ts` | `HomeState`, `Room`, `SelectedProduct`, `WorkChoices`, … |
| `lib/calculator/quantities.ts` | selection keys (`selectionKey`, `categorySlugFromKey`, `roomIdFromKey`, `partFromKey`), `suggestedQuantity`, a room's walls (`roomWalls`, `roomWallAreasM2`), `roomFinishAreaM2` / `roomFinishQuantity` / `finishPickQuantity` |
| `lib/calculator/roomFinishes.ts` | each room's floor and walls: `roomFinishesOf`, `withRoomFinish`, `withFloorProduct`, `withFloorShare`, `withWallProduct`, `withWallsOneByOne`, `withSameFinish`, `normalizeRoomFinishes`, `withRoomFinishQuantities`, `roomsLike`, `migrateFinishPicks`, `boardFinishesFromPicks` / `calculatorSurfaceFinishes` |
| `lib/calculator/steps.ts` | step URLs (`calculatorStepHref`, `calculatorEntryHref`, `calculatorStepFromPath`), `fromSevenSteps` |
| `lib/calculator/planSync.ts` + `hooks/useCalculatorPlan.ts` | keep the calculator's rooms and its drawing board agreeing (`reconcileCalculatorPlan`); `withBoardWalls` for rooms saved without their walls |
| `lib/calculator/boardCounts.ts` | what the calculator counts off the board (`boardCounts`): the partition walls (`boardPartitionCounts`), the doors (`boardDoorCounts`) and the windows (`boardWindowCounts`) — every place that prices a calculation passes it as `counts` |
| `lib/calculator/layout.ts` | `findFreeSpot` for rooms typed by size |
| `lib/calculator/saveProject.ts` | the client save (`saveCalculatorProject`: queue, `baseRev`, save ids, board finishes) |
| `lib/summary/calculatorSheet.ts`, `lib/summary/quantity.ts` | the calculation priced as a design: `calculationCost` (the board dressed in the picks → `priceScene`), `calculationEstimate` (its works, for the materials step), `calculatorSheet`, `orderedCalculationLines`, `boardWithPicks` / `placedQuantity`; the quantity dropdown |
| `lib/design/boardPicks.ts` | `dressBoard` / `pickTarget`: a product chosen for the whole flat on every door, window, radiator or fitting of its kind, a moulding round every room — one rule for the calculator's board and the design (`applyBoardPicks`) |
| `lib/projects/saved.ts` | `calculationInput(project)`: a saved calculation as `calculationCost`'s input (its board, fittings, picks, edits) — the project page, the orders and the checkout price it from this |
| `hooks/useCalculatorBoardProducts.ts` | the design catalogue for the board: every door, window, radiator and fitting on it a product (`ensureBoardProducts`), as the design has them |
| `store/calculatorStore.ts` | rooms, home state, picks, furniture, edits (`excluded`, `quantities`), `choices`, progress; persist version 4 (`migratePersisted`, `liftFlags`) |
| `hooks/useRateBook.ts` / `lib/api/rateBook.ts` | the rate book on the client / server (`loadRateBook`) |
| `hooks/usePickStores.ts` | who sells each pick (for the summary's shop cards) |
| `lib/api/projectSave.ts` | server: `repriceCalculatorPicks` (prices and per-room quantities recomputed from the catalogue), `ownProject` |
| `app/api/projects/route.ts` | `POST` = the calculation's save (see [project-flow.md §10](project-flow.md)) |
| `app/api/calculator/rates/` | the rate book API (public GET, admin writes); `/admin/rates` edits it (`components/admin/RatesTable.tsx`) |
| `components/calculator/` | `StepIndicator`, `HomeStateSelector`, `MaterialsTable`, `SummaryCard`, `WorkChoicesPicker`, `AskFurnitureDialog`, `CalculatorAutosave`, `RoomFinishCards` (a room's floor and walls on the catalogue step), `PlanGlyphs` (the little plans beside its rooms and walls), `RoomRow` (the rooms in a row on the catalogue and furniture steps, `flatOutlines`) |
| `lib/validations/calculatorSave.schema.ts`, `project.schema.ts`, `rate.schema.ts`, `room.schema.ts` | the save payload, `calculatorEdits`, a rate row, a room (and its studio split) |

## Data flow

1. The hub (`app/(main)/calculator/page.tsx`) creates the project (`POST /api/projects/create`);
   `[id]/layout.tsx` checks the owner and `ProjectGate` → `loadCalculatorHalf` fills the
   project's `useCalculatorStore` and `useCalculatorPlanStore`; `[id]/page.tsx` redirects to
   `calculatorResumeStep` ([project-flow.md §7, §11](project-flow.md)).
2. `start/` — `setHomeState`; an uploaded plan → `replaceRooms(calculatorRoomsFromPlan(plan))` +
   the board's `setPlan`.
3. `plan/` — `PlanWorkspace` on the calculator's own board store; `useCalculatorPlan` →
   `reconcileCalculatorPlan` → `setRooms` after every edit; the technical setup (below);
   "გამოთვლის დაწყება" → `setCalculated`.
4. `materials/` — `useRateBook()` → `calculationEstimate` (the works of the sheet: the board,
   its points and fittings, the person's `choices` — `WorkChoicesPicker` → `setChoices`).
5. `catalog/` — a room's floor through `setFloorProduct` / `setFloorShare`, its walls through
   `setRoomFinish` (the whole room) or `setWallProduct` / `setWallsOneByOne` (wall by wall);
   `selectProduct('<slug>_global', qty)` for whole-flat products, `qty` being what the board has
   of its kind (`placedQuantity`) or else `suggestedQuantity`. `furniture/` — `addFurniture` per
   room.
6. `summary/` — `calculatorSheet({ rooms, homeState, picks, board, electrical, edits, book,
   storeOf, … })` → `BudgetSheet`; save, order (`CheckoutDialog`, `calculatorCheckoutPart`),
   plan PDF, "see it in 3D".
7. `CalculatorAutosave` (drafts) and the summary's save → `saveCalculatorProject` →
   `POST /api/projects`: revision check → the board's doors, windows, radiators and fittings
   repriced (`repricePlan`) → `repriceCalculatorPicks` → `calculatorSheet` with the server's rate
   book → cost columns (as edited, the contingency in `totalCost`), `calculatorEdits`,
   `calculatorBoard` (repriced), `calculatorRev + 1`; it answers `{ id, sheet, rev }`.
8. Read back: `loadProjectSheets` (`lib/projects/sheets.ts`) for the project page, and the
   checkout and the orders (`calculationLinesByStore`, `projectSheetLines`), all through
   `calculationInput`.

## The six steps

| # | Path | What |
|---|---|---|
| 1 | `start` | the way in (upload a plan or say you will draw one; a hub tile's `?way=` preselects it when there is no plan on file) and the home's condition |
| 2 | `plan` | the board — the uploaded plan to check, or a blank sheet to draw on; **"გამოთვლის დაწყება"** here (needs rooms) sets `calculated` |
| 3 | `materials` | the engine's materials and labour; laminate/parquet and ceiling choices |
| 4 | `catalog` | **each room's floor and walls**, and the products for the whole flat |
| 5 | `furniture` | optional, room by room (`AskFurnitureDialog` asks on leaving the catalogue) |
| 6 | `summary` | the sheet, the PDF of the plan, save, order, "see it in 3D" |

### Steps 1–2

- **Nothing leaves step 1 until its continue.** `PlanUploadCard` with `showContinue={false}`
  hands the plan to page state as soon as the area makes sense. Until the journey is past the
  board, steps 1 and 2 are open to each other.
- **The board** (`PlanWorkspace` with the calculator's own store) reads the calculator's rooms
  off the plan after every edit (`calculatorRoomsFromPlan`: width and depth from the outline,
  `x`/`z` from its corner, the floor its polygon's area, the walls less the doors and windows in
  them — below).
- **A door and a window both take their area off the walls, and both are priced** — as the
  hub's tips (`tipsCalculator`) tell the person drawing. The design measures a wall the same way
  (`edgeWallAreaM2` / `roomWallAreaM2`, `lib/design/planGeometry.ts`): its length × the room's
  height, less every door, window and archway in it — an interior door in the walls of both
  rooms. The room keeps each wall's net area (`Room.wallsM2`, the board's order; an open edge 0)
  and their sum as `wallM2`, a studio's parts theirs; so the plaster, the paint, the tiles and
  the strip-out are all counted without the openings, in the calculator and the design alike,
  and so is a wall chosen on its own on the catalogue step. An opening on a room separator's
  open edge counts for nothing (there is no wall). The sample plan's eight windows, three doors
  and archway take 37.1 m² off its 233.35 m² of wall (196.25 m² to plaster and paint).
- **The technical part is set up on the board too, with the studio's own trays.** The tool
  rail's technical and electrical tools open, along the bottom of the sheet, the studio's
  `TechnicalTray` and `ElectricTray` (`components/studio/Trays.tsx`, in its `Tray`): the same
  kinds (the ten technical ones; power · lighting), each tile with how many of it the plan
  holds, and the same buttons — the technical points the rooms imply (`suggestTechnical`,
  `lib/design/autoTechnical.ts`: water, waste, gas, the panel, the extractor, the air
  conditioners, the boiler), the radiators each room's heat calls for under its outside windows
  (`suggestRadiators`, in the style's radiator product), the fittings (`suggestElectrical`,
  which with no furniture is `standardElectrical`: a ceiling light per room, a switch by each
  door, general sockets), and clearing them. A fitting set down is its catalogue product at once
  (`PlanWorkspace`'s `catalog`), as in the studio.
  **A tray opens with its last kind in hand, and it stays in hand**: every click on the sheet
  sets down another (the page drives the tool — `tool`, `boardTool` — so the board does not go
  back to "select" after one). The tile again, or Escape, puts the kind down and the tray stays,
  the sheet selecting; Escape once more puts the tray away; with something selected, Escape lets
  go of that first. A room the person has wired by hand is kept as it is. The board is the
  design's store (`useCalculatorPlanStore`), its style the design's default (scandinavian), and
  `useCalculatorBoardProducts` makes every door, window, radiator and fitting on it a catalogue
  product (`ensureBoardProducts`).
- **What is picked on the board has a card of its own**: a wall, a door or window, a technical
  point or a fitting opens the inspector in a card beside the rooms panel, not in it, with its
  delete and a ✕ (`InspectorClose`); the rooms panel lists the rooms only.
- **"გამოთვლის დაწყება" asks first** when the board has neither a technical point nor a
  fitting: place them all by the standards (`placeByStandards(catalog)`: the three above and
  every door and window a product, one step of the history, then on), or carry on without — the
  points are then estimated from the room types (`ROOM_POINTS`), as below.
- **Typed rooms.** A room typed by size (`RoomsPanel`) becomes four walls at the first free
  spot (`findFreeSpot`, `lib/calculator/layout.ts`). Sizes are exact to the centimetre; a
  dragged room snaps wall to wall exactly as on the design's board (`snapRoomMove`,
  `lib/design/drawing.ts` — see [design-studio/plan-board.md](design-studio/plan-board.md)).
  `snapToNeighbours` in `layout.ts` is only exercised by its test now.
- **A re-uploaded plan** is a new plan in the same project: `replaceRooms` drops every pick
  with the rooms, and the id stays. `setRooms` prunes the furniture of rooms that vanished
  and re-counts or drops their floors and walls.
- **Open spaces are divided into rooms by room separators** — the wall tool's third shape, and
  the dashed line the board draws on from a partial wall in a living room or a kitchen
  ([design-studio/plan-board.md](design-studio/plan-board.md#room-separators-libdesignseparatorsts)).
  Each side is a room of the calculation. What a separator gives a room is open, not wall: read
  off the board, the room's wall area and perimeter leave it out and its wall one by one measures
  0 (`calculatorRoomsFromPlan`).
- **A black frame asks which partitions already stand.** It is the home state that builds the
  partition walls (phase 1), and a wall selected on the board offers "already built"
  (`Wall.built`, drawn grey; the legend sits over the area plate) — see
  [design-studio/plan-board.md](design-studio/plan-board.md#the-partition-walls-a-black-frame-builds-libdesignpartitionsts).

### Step 4: every room's floor and walls (`lib/calculator/roomFinishes.ts`)

Until 26 September the catalogue was a **cart**: floor and wall materials went in under
`<slug>_item:<productId>` with no quantity, and a fifth step, **placement**, had the person lay
them on the rooms of the board by hand (whole floors, walls, square metres, strips). The area laid
was the quantity. It was an extra step and a confusing one: everything it asked for is known from
the rooms. So:

**The page.**
- The rooms stand in a row under the step's head (`RoomRow`: a `ScrollRow`, sideways on a
  narrow screen), each with the flat drawn small — every room's outline where it lies on the
  calculator's board, else its rectangle where the calculator placed it (`flatOutlines`) — and
  itself filled in on it (`RoomGlyph`), and how many of its two surfaces are chosen. The
  furniture step has the same row (below). The side column keeps the "other
  products" only. The room open shows two cards, **floor** and **walls**
  (`components/calculator/RoomFinishCards.tsx`). Each row in them is something the product
  grid under them can choose for, and the one in hand is marked and named beside the category
  tabs ("choosing for: wall 2 · 18.76 m²"); a chosen product clicked again takes it off that
  row.
- **The floor** is one product, or two: "second product" adds a row, the product chosen for it
  takes half the floor, and a slider under the two (0–100 %, in fives) splits it, each side
  showing its share and its m². Never more than two. Taking the first off leaves the second
  over the whole floor; the same product in both rows is that product over the whole floor.
- **The walls** are the **whole room** in one product, or **per wall** — a switch at the
  card's head. Per wall, each of the room's walls is a row: a little drawing of the room with
  that wall picked out (`WallGlyph`; both drawings as the board draws, x across and z down), its
  number and its m², and the product on it or nothing. Switching to per wall keeps the room's product on
  every wall; switching back keeps the product that covers the most wall (the first wall's on
  a tie). Until a wall is chosen, "per wall" is only the page's state.
- **The walls one by one leave out what is not a wall to finish**: a room separator's open
  side (it measures 0) and slivers under `MIN_LISTED_WALL_M` (the end face of a partial wall
  running on as a separator); they still count in the room's walls as a whole. The numbers stay
  the board's, so a list can read "walls 1, 2, 3, 6". A room divided off by a separator says
  which room it opens onto under its name (`openNeighbours`), and each of the two takes its own
  floor and walls.
- A row is chosen from the categories of its surface (`surfaceOfCategory`: `per_m2_floor` /
  `per_m2_wall`), opening on the category of what the row has. The calculator's categories are
  the ones admin marks as its tabs (`inCalculator`, `useCategories` → `GET
  /api/categories?calculator=true`); each lists every product under it in the category tree
  (`GET /api/products?category=<slug>` takes the subtree), and a pick keeps the tab's slug, so
  the slug-keyed rules below see what they always saw ([categories.md](categories.md)). The usual one is offered first
  (`usualFinishCategory`: floor tiles for a bathroom, toilet, kitchen or balcony floor,
  laminate for the rest; wall tiles for bathroom and toilet walls, paint for the rest), and a
  bathroom or toilet sees products marked `specs.wet` first (a kitchen is not reordered).
- The "chosen" column names where each pick goes: the room, and its walls ("walls 1, 3, 4") or
  its share of the floor ("floor 70%").
- "Other products" (sockets, lights, sanitary ware, doors, windows…) are one product for the
  whole flat (`<slug>_global`). One the board has a place for goes **on every one of its kind on
  the board** (`boardWithPicks` → `dressBoard`, `lib/design/boardPicks.ts`; what it goes on is
  `pickTarget`: the product's 3D kind, else its tab): a door on every interior door (an entrance
  door on the front door), a window on every window, a radiator on every radiator — its
  sections counted from its room — a socket, switch or light on every fitting of its kind, a
  skirting board or cornice round every room. It is bought for what it is on (`placedQuantity`):
  the sample plan's 3 doors and 8 windows, a radiator's sections over all six radiators, a
  moulding's metres. The rest (sanitary ware, a pendant) is a line of its own at
  `suggestedQuantity`, as is one whose kind the board has none of.

**How a room's picks are kept.**
- Under the room's own key, `<slug>_room:<roomId>` (`selectionKey`), with `roomId` and
  `surface` on the pick. A floor's second product is `…/floor2`, and both carry their `share`
  of the floor, the two making 1 (one product alone has none, and covers it all). Walls chosen
  one by one are **one pick per product**, `…/walls<productId>`, carrying the walls it is on
  (`walls`, by index) — so a paint on three walls is one line, its tins rounded up once rather
  than per wall.
- Every change goes through `roomFinishes.ts` — `withRoomFinish` (the whole floor or all the
  walls in one product; null clears the surface), `withFloorProduct`, `withFloorShare`,
  `withWallProduct`, `withWallsOneByOne`, `withSameFinish` — and the result is put back in that
  shape by `normalizeRoomFinishes`: at most two floor products (the first one's share stands,
  the second has the rest), a lone second one moved up to the whole floor, a wall claimed twice
  left to the first pick, walls the room does not have dropped, and a whole-room walls product
  found beside walls chosen one by one spread over the walls nobody chose. The store runs it
  after every edit and on `removeProduct`; the server runs it before it counts a save.
- **"The same in N more rooms like this"** copies a room's floor — both products and the split —
  or its walls product to the rooms of the same kind of work that have nothing chosen for that
  surface (`roomsLike` / `finishGroup`: tiled floor, laid floor, tiled wall, painted wall). It
  never overwrites. Walls chosen one by one are that room's own and are not copied.

**A room's walls one by one are the board's** (`Room.walls`).
- Each wall's length, metres, in the order of the room's outline on the calculator's board —
  the `wallIndex` the board and the studio know that wall by — read off the board with the rest
  of the room (`calculatorRoomsFromPlan` → `edgeLengthsM`), so it reaches the server with the
  rooms; `sameCalculatorRooms` compares it, so the plan step writes it in. Each wall's net area
  comes with them (`Room.wallsM2`, m², the same order: the length × the height less the doors,
  windows and archways in it, `edgeWallAreaM2`), compared and carried the same way, and the room
  schema keeps it (`room.schema.ts`).
- A room saved before it carried its walls reads their lengths off the board when the project
  opens (`withBoardWalls`, in the loader's `normalizeFinishPicks`). That is worked out, not work:
  it is not marked unsaved, and the next save carries it. A room with none at all is the four
  sides of its rectangle (`roomWalls`); either way, without net areas beside the walls they were
  read with, a wall counts whole (`roomWallAreasM2`) until the plan step reads the room again.

**The quantity is the room's** (`roomFinishQuantity` in `lib/calculator/quantities.ts`).
- The area the pick covers (`roomFinishAreaM2`): the room's floor m² times its share; its wall
  m² — the estimate's own figure, less the doors and the windows; or, wall by wall, the sum of
  its walls' net areas (`roomWallAreasM2` → `Room.wallsM2`). Then in the product's units
  (`finishPickQuantity`): m² plus a tenth of cutting waste for laminate and tiles, whole litres
  of paint by the product's coverage (8 m²/L when the row says nothing), one unit per m²
  otherwise. **The sheet buys the same way**, folded per product over the flat
  (`finishPurchase` in `pricing.ts`, for the design too — [budget.md](budget.md)): a paint on
  three rooms is its litres rounded up once.
- The server uses **the same functions** with the catalogue's own unit and coverage
  (`lib/api/projectSave.ts`, `repriceCalculatorPicks`): it puts each pick on the surface its
  category is for (`SURFACE_OF_SLUG` for the seeded categories, the pick's own for one made in
  admin), runs `normalizeRoomFinishes`, and counts each pick from its room, share and walls — the
  figure the person saw is the figure saved, and a forged share or wall list is put in shape
  before it is priced.
- A resized room re-counts its picks and a deleted one drops them (`withRoomFinishQuantities`,
  run by `setRooms`, `updateRoom`, `removeRoom` and on every open). A flat with no rooms at all
  is left alone — that is a flat not read yet.

**Where the finishes go.**
- **The board wears them without being told** (`boardFinishesFromPicks` →
  `calculatorSurfaceFinishes`): each room in its floor and walls, a wall chosen on its own as
  that wall's finish (`wallIndex`), a floor two products share as both, each with its `share`
  (the larger first — it is the one drawn over the floor; see Known gaps). The save stores them
  as the board's finishes, and the sheet prices them. Nothing is laid by hand any more. The
  board and its PDF draw white paper: the finishes are its "zones" layer, off by default.
- **Into 3D.** Per-room picks travel as `roomProducts` with their surface, `share` and `walls`
  (`picksFromCalculator`), and `applyFinishPicks` lays them with the same
  `calculatorSurfaceFinishes`: on the surface they were chosen for only (a wall tile that could
  also be laid on a floor used to land on the floor too), a wall chosen on its own on that wall
  and bought by its own area, a shared floor in both products by their shares. A skirting board
  or a cornice chosen for the whole flat goes round every room. The doors, windows, radiators
  and fittings chosen for the whole flat go on the design with them (`applyBoardPicks`,
  [project-flow.md](project-flow.md)).
- **Studios** (kitchen + living room in one room) can take two floor products and a split, but
  the split is a share of the floor, not the studio's parts — a known gap.

**Picks from before** are moved onto the rooms when the project opens (`migrateFinishPicks`,
run by the loader, written back once).
- A cart pick goes to the rooms whose floor or walls the board had in that product. A whole-room
  finish counts; a tile or a strip does not. Laid nowhere, it is dropped.
- A whole-flat finish (`<slug>_global` of a finish category — the first catalogue, and projects
  designed first) goes to every room its kind of work suits.
- Never over a room's own pick. `picksFromScene` (a project designed first) now makes per-room
  picks from each room's whole-room finish too.

**Six steps, and the seven before them.**
- The placement step's page, `lib/calculator/placement.ts` and their strings are gone. Steps
  renumber: old 1–4 stay, old 5 (placement) → 4, 6 → 5, 7 → 6 (`fromSevenSteps`,
  `lib/calculator/steps.ts`).
- The browser's copy migrates with the store's persist version (3 → 4, `migratePersisted`).
- The row's progress is recorded with `steps: 6` from now on, and `calculatorProgress` maps any
  progress without it. The schema still accepts a step up to 7, so a tab left open from before
  can save, and its progress is read as the seven steps it is.
- The proxy sends `/calculator/<id>/placement` to the catalogue.

### Step 5: furniture

Optional, room by room (`AskFurnitureDialog` asks on leaving the catalogue). The rooms are the
catalogue's row under the step's head (`RoomRow`), each on its little plan with its name and
how many pieces it has ("3 ნივთი", or "ცარიელი"); the categories are the side column (the
furniture tabs admin marks for the calculator, each with its whole subtree) and the
products the grid, every piece added going to the room open — the first room until another is
picked. Each piece is `addFurniture(roomId, product)` at its own price; the same product again is
one more of it.

## The engine (`lib/calculator/materials.ts`) — pure, deterministic, UI-free

- `computeRoomAreas({ id, nameKa, type, width, length, height, … })` → a `Room` with floorM2,
  wallM2, ceilingM2, perimeterM, isWetRoom
- `aggregateRoomTotals(rooms, counts?)` → totals incl. wet-room m², door/window counts (a door a
  room and a window a room that usually has one, unless `counts.doors` / `counts.windows` — the
  board's, `OpeningCounts` — are given)
- `calculateMaterials(rooms, homeState, book?, options?)` → `MaterialItem[]` from the rate book
- `calculateWorkerCosts(rooms, homeState, book?, options?)` → labour per phase from the rate book
- `buildProjectSummary(rooms, homeState, products, furniture, book?, options?)` → subtotals +
  grandTotal + 15 % contingency — the landing page's sample only; a calculation is priced by
  `calculationCost` (below)
- `options: EstimateOptions = { phases?, choices?, counts? }` — a phase list that replaces the
  home state's (the studio's ticked works), the `WorkChoices`, and the `EstimateCounts`
- `expandStudios` prices a studio room's two parts separately (a room saved without parts gets
  the default 35 / 65 split, `DEFAULT_FIRST_SHARE`)

**The rate book is data, not code.** `MATERIAL_RATES_PER_M2` / `WORKER_RATES` in
`constants.ts` are only the defaults; the `rates` table (`pnpm db:seed:rates`, edited at
`/admin/rates`, served by `/api/calculator/rates`) is what the estimate actually uses.
`lib/calculator/rates.ts` turns rows into a `RateBook`; `useRateBook()` fetches it once per
page load and hands back the defaults until the server answers, so an unseeded table is not
an error. Material lines can be added in admin (new key, phase, basis, quantity per m²);
labour lines are fixed keys the engine knows and can only be repriced or switched off (the
admin UI creates material rows only; the API would accept a new labour key, which the engine
then ignores).
**Nothing has to be run on a server for a new rate book.** `/admin/rates` lists exactly the book
the engine uses (`ratesForAdmin`): the table's rows, then every shipped default the table has no
row for, marked "default" and carrying a negative id; saving one of those creates its row
(`POST /api/calculator/rates`) instead of updating one. So a production database seeded with an
older book is fine as it is — it prices with the new defaults at once, and admin reprices them
there — and `pnpm db:seed:rates` is only a local tidy-up.
**A default key the table has never heard of still counts, at its shipped rate** — a line the
app gained after a database was seeded (the phase 0 strip-out was the first) would otherwise
price at nothing until someone ran the seed; a row that exists but is switched off stays off,
and an empty table is still simply the defaults (`rateBookFromRows`).

**The rate book is the renovation team's (September 2026).** Every work they price is one
phase, and a home state is the set of phases it still needs — so a work common to several
states (the laminate, the ceiling, the bathroom tiles) is one line whichever state is chosen,
never one per state (`tests/unit/calculator/materials.test.ts` pins that a lighter state's lines
are the *same* lines in a heavier one). Phases: 0 strip-out (floor 15, walls 20, tiles 12 ₾/m²,
old rubbish 40 ₾/m²) · 1 partition walls (45 + 45 ₾/m²) · 2 heating (25 m of pipe at 3.60 ₾,
piping 50 and hanging 50 per radiator) · 3 screed (35 ₾/m², material included, not the
bathroom) · 4 electrics (cable 12 ₾/m² of floor, 35 per point, +5 chasing per point when the
walls are already plastered — i.e. phase 5 is not running) · 5 plaster (12 + 16.5 ₾/m², not the
bathroom walls) · 6 painting (5 + 35 ₾/m², walls only, not the bathroom) · 7 plumbing (32.5 + 80
per point) · 8 bathroom floor (40 + 80) and walls (12 + 80) · 9 bathroom tiles (60, floor +
walls) · 10 kitchen/balcony floor tiles (60) · 11 laminate 15 **or** parquet 80 · 12 plasterboard
(12 + 30) and its painting (35) **or** a stretch ceiling 35 · 13 doors 150 each · 14 new-build
rubbish 5 ₾/m² (never with phase 0). Home states: `black_frame` 1–14; `white_frame` 2, 4, 6–14
(walls built and plastered, floor screeded); `green_frame` 6, 9–12, 14 (wired, plumbed, heated,
doors hung); `old_renovation` 0, 2–13 (the walls stand; its own removal carries the rubbish).
Where the team gave a range the middle is used. **"Bathroom" is `bathroom` + `toilet`**
(`BATH_ROOM_TYPES`); the kitchen and balcony floors are tiled (`TILED_FLOOR_ROOM_TYPES`).
Laminate/parquet and plasterboard/stretch ceiling are `WorkChoices` — the calculator's store
(`choices`, saved in `calculatorEdits.choices`) and the plan (`plan.technical.choices`), picked
on the materials step and the technical step (`WorkChoicesPicker`). The counts the phases
multiply by (`EstimateCounts`: points, radiators, doors, partition m²) come from the plan: the
points placed, `countDoors` (`lib/design/openings.ts`: an interior door's two halves once),
`partitionArea` (`lib/design/partitions.ts`: walls with a room on both sides — a partial wall
has its room on both — or none, never a room separator, less the ones marked already built).
**The calculator counts off its own board** where the board can say, and from the room types
where it cannot (`missingCounts` in `calculatorSheet.ts`; the same rules as `boardCounts`,
`lib/calculator/boardCounts.ts`):
- the partition walls (`boardPartitionCounts`) once the board is a flat drawn joined up — a wall
  between two rooms, or a single room; rooms typed by size stand apart, share no wall, and are
  still estimated from the rooms;
- the doors (`boardDoorCounts` → `countDoors`) once the board has its doorways drawn — a door or
  an archway anywhere on it. A plan read from an upload has them (the doors read off it, or
  inferred by `deriveOpenings`, and checked on the plan step): the sample plan's board has three
  doors and an archway, and "კარის დაყენება" is 3, not the 5 of a door a room. A board drawn by
  hand, or rooms typed by size, usually has no doorway at all, and none drawn is not no doors:
  those are still a door a room. Only archways drawn is no door to hang;
- the windows (`boardWindowCounts` → `countWindows`) once the board has any: the sample plan's
  eight, where the rooms would say five. The estimate itself hangs no window; they are what a
  window for the whole flat is bought for;
- the points (`ROOM_POINTS`, `estimateCounts`) only while the board has neither a technical point
  nor a fitting — the start dialog above offers to place them first.

**The calculation is priced as a design** (`calculationCost`, `lib/summary/calculatorSheet.ts`).
Its board — or, for rooms that never reached one, the rooms as rectangles with no doorways
(`calculationBoard`) — is dressed in the whole-flat picks (`boardWithPicks`), the rooms' floors
and walls laid on it (`boardFinishesFromPicks`) with the mouldings, and the whole thing priced
by the design's own `priceScene` in `full` mode with no furniture: the same works, the same
counts, the same fittings as products, the same finishes bought the same way, the same
contingency. What the board has no place for (sanitary ware, a pendant) and the calculator's
furniture come in as lines of their own (`extraLines`), and the counts the board cannot give as
`missingCounts`. Every place that prices a calculation goes through it: the materials step
(`calculationEstimate`, the works alone), the summary, the save route (the board it carries,
else the row's), the project page (`loadProjectSheets`), the checkout (`calculatorCheckoutPart`)
and the orders (`calculationLinesByStore`, `projectSheetLines`), the last three through
`calculationInput`. So **the calculation and a design of the same flat with the same products
come to the same sheet, line for line, the design's placed furniture aside**
(`tests/unit/summary/calculatorSheet.test.ts`). **A point's
labour belongs to exactly one place** (`technicalWork` in `pricing.ts`): to the phase when that
phase runs (it counts every point the plan holds), to the point's own line when it does not —
never both. The book before the team's is `RETIRED_RATE_KEYS`: `rateBookFromRows` never reads a
row under one, the admin list and `GET /api/calculator/rates` hide them, the schema refuses
them, and `pnpm db:seed:rates` deletes them locally; left in a production table they are inert.
No new key may reuse a retired one.
The studio's works checklist (`WORK_ITEMS`, one per phase) keeps a legacy map
(`normalizeWorks`) for plans saved with the old work keys. A green frame's default "already
has" is openings, electrical, plumbing and heating (not the finishes), and every "already has"
tick drops the phase that would redo it (`withoutExisting`).
Wet rooms = bathroom, toilet, kitchen. The per-point labour keys the studio also prices points
with are the team's own (`electric_point` phase 4, `plumbing_install` phase 7, `heating_piping`
and `radiator_mount` phase 2); `WORKER_RATES` also carries three keys only the studio uses —
`ac_install`, `extractor_install`, `trim_install` (see
[design-studio/technical-and-fittings.md](design-studio/technical-and-fittings.md)).

**The Design Studio reuses this engine unchanged** — it feeds it the plan's rooms
(`planToCalculatorRooms`, the same `calculatorRoomsFromPlan` the calculator reads its rooms with)
plus `options`: the phases (`effectivePhases` less what the flat already has), the choices
(`plan.technical.choices`) and the counts (points placed, `countDoors`, `partitionArea`, and
whatever `options.counts` adds) — `renovationEstimate` in `lib/design/pricing.ts`.

## Selection keys

**Calculator selection keys** (`selectedProducts`): `<slug>_global` is a product chosen for the
whole flat, `<slug>_room:<roomId>` one chosen for a single room (floor and wall finishes only),
and `<slug>_room:<roomId>/<part>` a room's surface in more than one product — `floor2` for a
floor's second product, `walls<productId>` for a product over the walls it was chosen for one
by one. What a pick covers is on the pick (`share`, `walls`); the part only keeps the keys
apart. `lib/calculator/quantities.ts` owns the format — `selectionKey`, `categorySlugFromKey`,
`roomIdFromKey`, `partFromKey` — and a per-room snapshot also carries `roomId` so the
summaries, the order lines and the studio can name the room. Never build or parse these
strings by hand.

The first catalogue's cart key, `<slug>_item:<productId>` (no room, no quantity), is still read
(`cartKey` / `isCartKey`) so old projects open; `migrateFinishPicks` moves such picks onto the
rooms when the project is loaded (see "Picks from before" above).

## Tests

- `tests/unit/calculator/materials.test.ts` — areas and totals, materials by phase and basis,
  every home state's labour, a lighter state's lines being the same lines in a heavier one,
  work choices, phase overrides, the contingency.
- `tests/unit/calculator/rates.test.ts` — `rateBookFromRows` (defaults, unseeded keys, inactive
  and retired rows), `defaultRateRows`.
- `tests/unit/calculator/quantities.test.ts`, `roomFinishes.test.ts` — keys and their parts,
  suggested and per-room quantities, a room's walls one by one, a floor in two products and its
  split, walls chosen one by one and the switch back, the shape every edit is put back in,
  groups, the migration of old picks, the board's finishes.
- `tests/unit/calculator/planSync.test.ts`, `layout.test.ts` — rooms ⇄ board, the walls read
  off it and filled in for rooms saved without them; free spots.
- `tests/unit/calculator/boardCounts.test.ts` — `countDoors` (twins once), `countWindows`, the
  board's doors and windows and when it has none drawn, the counts together, and the sample plan
  read the way step 1 reads it: three doors ("კარის დაყენება" 3), eight windows, its walls
  painted without the doors and windows (196.25 m², not 233.35).
- `tests/unit/calculator/planSync.test.ts` also takes the doors and windows off the walls read
  off the board — one by one and together, never on a room separator's open edge, a studio's in
  the part they are in; `roomFinishes.test.ts` counts a wall chosen on its own without them.
- `tests/unit/summary/calculatorSheet.test.ts` — the calculation and a design of the same flat
  come to the same sheet, line for line, the design handed the board without the shops and
  given them back from the catalogue (`applyBoardPicks`); a whole-flat pick on every one of its
  kind and bought for them; own lines; the contingency; the counts the board cannot give; ticks
  and quantities; `quantity.test.ts` — the quantity dropdown.
- `tests/unit/store/calculatorStore.test.ts` — the seven-to-six step migration, re-counting
  finishes when rooms change, the floor and wall actions.
- `tests/unit/design/fromCalculator.test.ts` — the picks in 3D on their surface, their walls
  and a floor two products share; `tests/unit/design/electrical.test.ts` — the standard
  fittings, and a room wired by hand kept whole.
- `tests/integration/save-routes.test.ts` (`POST /api/projects`) — ownership, pending saves,
  repricing, per-room quantities on the server (shares and walls one by one included, forged
  ones put in shape), the doors on the board it carries (the labour and a door for the whole
  flat), the windows (the rooms' walls less them, a wall chosen on its own, a window for the
  whole flat by the board's), the sheet it answers with, revisions, unknown products,
  throttling.
- `lib/calculator/**` is in the coverage gate ([testing.md](testing.md)).

## Known gaps

- A floor in two products says how much of the floor each covers, not where: both are bought,
  by their shares, in the calculation and the design alike, but the board, the PDF and 3D show
  the one with the larger share over the whole floor. A studio's split is a share like any other
  room's, not its two parts (the engine prices the parts separately, `expandStudios`; the picks
  do not).
- Walls are chosen whole; a strip of a wall, a square metre or a tiled splashback is the
  studio's job.
- The summary, the checkout and the order lines name a pick's room, not its walls or its share
  of the floor (the catalogue step's "chosen" column does).
- A design made from the calculation is the calculation plus its furniture — and what the
  furniture brings: its lamps, the sockets beside the bed, the television and the worktop, and
  their wiring in the electrician's points (`suggestElectrical`). A room the person wired by
  hand keeps exactly its points and gets none for its furniture. The shops' free delivery
  (2 000 ₾ a basket) can then change with the furniture's baskets. Nothing else differs.
- "See it in 3D" again, onto a design already laid out, puts the calculation's doors, windows,
  radiators and fittings for the whole flat over the design's (`applyPendingPicks`) — also over
  one chosen in the studio since, which a floor or a wall chosen in the studio is protected
  from (`origin: 'studio'`); a door or a socket has no such mark yet.
- The calculator's rooms are read off its board only on its plan step, so a project saved
  before room separators existed keeps its rooms as they were until that step is opened again —
  and one saved before the doors and windows came off the walls keeps them in (its wall-by-wall
  areas, `wallsM2`, are missing and its walls count whole, `roomWallAreasM2`); a partition marked
  already built counts only once the board holds the flat joined up.
- A room read off the board with more than four corners (an L-shape) shows as the rectangle of
  the same width and area (`calculatorRoomsFromPlan` takes length = area ÷ width); its floor, its
  walls and its perimeter are the outline's own, as the design measures them.
- The rate API accepts a new `labour` row with any key (`rate.schema.ts`) although the engine
  only knows fixed labour keys; such a row is ignored. The admin UI only creates material rows.
- Dead code: `components/calculator/RoomForm.tsx` and `RoomList.tsx` have no importers, and
  nothing calls `POST /api/calculator/materials` (which also ignores work choices).
