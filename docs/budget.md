# Budget and summaries

The one sheet both products end on: what the project comes to, line by line, what of it the
person is taking (ticks) and in what quantity — and the rule that orders are made from those
lines. Covers the design's pricing (`priceScene`), the calculator's sheet (`calculatorSheet`),
ticks and quantity edits, baskets and delivery, kitchens and trades. Read this before touching
`lib/design/pricing.ts`, `lib/design/ticks.ts`, `lib/summary/`, `components/budget/`, either
summary page, or anything that turns a project into order lines.

Related: [calculator.md](calculator.md) (the engine behind the calculator's sheet) ·
[design-studio/overview.md](design-studio/overview.md) (what the scene holds) ·
[design-studio/technical-and-fittings.md](design-studio/technical-and-fittings.md) (doors,
fittings, radiators as products) · [design-studio/finishes.md](design-studio/finishes.md)
(finish quantities) · [marketplace.md](marketplace.md) (checkout and orders made from the
lines) · [project-flow.md](project-flow.md) (the project page that re-reads both sheets).

## Key files

| File | Responsibility |
|---|---|
| `lib/design/pricing.ts` | `priceScene(plan, scene, options)` → `DesignCost` (`lines`, totals, `contingencyTotal`, `baskets` per store, `coverage`, `kitchens`); `renovationEstimate` (its works alone); `finishPurchase`; `budgetSummary`, `budgetSections`, `orderedLines`; `BudgetLine` |
| `lib/design/ticks.ts` | line keys (`tickFor`), `toggleTick`, `pruneTicks` / `pruneQuantities`, `withEdits` |
| `lib/design/technicalRates.ts` | estimate prices and labour keys for fittings, technical points, openings and trims (`ELECTRICAL_LABOUR`, `TECHNICAL_RATES`, `OPENING_ESTIMATE_GEL`, …) |
| `lib/design/kitchen.ts` | measured kitchens: the kitchen maker's material per m² of façade (`kitchenMaterial`), else `KITCHEN_RATES`; `boughtProduct` / `itemCostGel` for what a placed piece is bought as |
| `lib/design/equipment.ts` | the technical points bought as products (panel, boiler, air conditioner, hood or fan, drain) — one piece per point |
| `lib/design/finishQuantity.ts` | how much of its product a finish covers (`finishQuantity`, shared by the store and the save route) and how much of it shows (`visibleFinishes`) — what the budget buys |
| `lib/design/trades.ts` | `tradesNeeded` — the labour keys of a budget → the six worker specialties (step 8) |
| `lib/summary/calculatorSheet.ts` | the calculation priced as a design (`calculationCost` → `priceScene`) and its sheet (`calculatorSheet`) with its edits; `orderedCalculationLines` |
| `lib/design/boardPicks.ts` | `dressBoard`: a product for the whole flat on every door, window, radiator or fitting of its kind — the calculator's board and the design alike |
| `lib/summary/quantity.ts` | `quantityOptions` — what the quantity dropdown offers |
| `components/budget/BudgetSheet.tsx`, `lineName.ts` | the sheet both summaries and the project page render; `budgetLineName` |
| `lib/projects/sheets.ts` | `loadProjectSheets` — a saved project's two sheets, server-side, for `ProjectDetail` |
| `lib/projects/checkoutParts.ts` | `designCheckoutPart` / `calculatorCheckoutPart` — the checkout dialogue's lines of each half, each marked furniture (its `bucket`) or not |
| `app/(main)/design/[id]/summary/page.tsx` | the design's budget (step 7) |
| `app/(main)/calculator/[id]/summary/page.tsx` | the calculator's summary (step 6) |

## Flow

```
design:     plan + scene ──priceScene──▶ raw lines ──withEdits(scene.excluded, scene.quantities)──▶ lines
calculator: board + picks ──boardWithPicks──▶ a scene with no furniture ──priceScene (+ extraLines, missing counts)──▶ lines
lines ──▶ BudgetSheet (both summary pages, the project page via loadProjectSheets)
lines ──orderedLines──▶ baskets, checkout dialogue, store orders (both halves)
lines (section 'materials', still ticked) ──projectMaterials──▶ the construction-materials supplier's order
lines (section 'labour', still ticked) ──projectLabour──▶ a brigade's or a worker's booking
save routes: reprice from the catalogue first, then lay the edits over → cost columns as edited
```

## One sheet for both summaries

**One sheet for both summaries** (`lib/summary/`, `components/budget/BudgetSheet.tsx`). The
calculator's last step and the design's budget are the same thing to the person reading
them — what it all comes to, and what of it they are taking — so they are the same sheet:
`BudgetLine[]` (`lib/design/pricing`), rendered by `BudgetSheet`. Both come from `priceScene`:
the design's from its plan and scene, the calculator's from its board dressed in its picks
(`calculationCost` → `calculatorSheet`, [calculator.md](calculator.md)) — so a calculation and a
design of the same flat with the same products are the same lines, the design's placed furniture
(and what it brings) aside. No calculator pick records its shop, so who sells each one is looked
up: `usePickStores` → `GET /api/products?ids=…` + `/api/stores` on the client, the database
(`loadProductStores`) on the server; the board's own doors, radiators and fittings carry theirs.
Units are the dictionary's (`unitLabel`: "ერთ.", "სექცია", …).

- **Shown once, under whoever sells it.** Everything a shop sells stands in that shop's card —
  that is who is asked for it and what its delivery is charged on — with the ticks, the
  quantities and a box at the head that takes the whole shop in or out. What nobody sells (bulk
  materials, labour, estimates for things not chosen yet, picks without a shop) stays under its
  kind. The first version listed products twice, by kind with the ticks and again by shop
  without them. Shops stand in the order they first appear on the sheet, never by subtotal,
  which would reshuffle the page at every tick.
- **Every line has a key, not only the products** (`tickFor` in `lib/design/ticks`):
  `item:`, `kitchen:`, `finish:`, `opening:`, `opening-estimate:`, `fixture:`, `radiator:`,
  `equipment:`, `estimate:`, `material:`, `labour:`, and for the calculator `pick:<selection key>` and
  `furniture:<room>:<product>:<n>` (the n-th copy, because the same bed can be picked twice for
  one room). Only delivery has none: it is not chosen, it follows from what the shops bring.
- **Two kinds of edit hang on the key**: a tick (`excluded`) and a quantity (`quantities`). The
  quantity is a *choice*, not a free field — the pencil opens a list around the figure that was
  worked out (`quantityOptions`: counted things 1, 2, 3…, measured things −50 % … +50 % in
  fives, the original marked) — because a typed "300" where "30.0" was meant is an order
  somebody has to unpick with a shop. Choosing the original again lets go of the edit.
- **The original never leaves the sheet.** `withEdits` is applied in one pass after every
  section has said what it works the line out to be: a ticked-off line stays where it stood,
  struck through; a changed quantity carries `originalQty` and shows it beside the new one; the
  totals card says what was worked out, what the changes came to (it can be *more* — three
  sofas), and the way back (`clearBudgetEdits` / `clearEdits`). Nothing about "the original" is
  stored: the row keeps the rooms, the picks, the scene and the edits (`calculatorEdits`,
  `scene.excluded`, `scene.quantities`), and both versions are priced from those whenever
  somebody looks — which is why the saved project's page (`ProjectDetail` ←
  `loadProjectSheets`) can show every edit with what was there before it.
- **The server lays the edits over its own figures, never the client's.** Both save routes
  reprice and re-quantify from the catalogue and the geometry first; the edits are keys and
  numbers applied on top (`calculatorSheet` in `POST /api/projects`, `priceScene` in the design
  save), and the cost columns are the totals *as edited*. `orderedLines` (the calculator's
  through `orderedCalculationLines`) is what the checkout dialogue and the store orders are made
  from, so a changed quantity is the quantity a shop is sent.
- The sheet rounds each line and adds the lines up, so what is read down the page comes to
  the figure under it; the engine rounds the sum once. They can differ by a few tetri.
- **Every product line shows its product**: the photo from the snapshot beside the name, and
  the name (with `ProductPageLink`) as the way to `/catalog/<slug>` in a new tab, where the
  real photos are. The same link stands on the selected piece's card in the studio and on
  the fitting's and the door's. A snapshot from before the slug travelled with the product
  gets the name and no link — and so, for now, does every line of the calculator's sheet
  (see Known gaps).

## Budget (`lib/design/pricing.ts`) and trades (`trades.ts`)

**A tick belongs to a line, not to a product** (`lib/design/ticks.ts`). Unticking a line
leaves it in the design — still in the room, still in 3D — and takes it out of the order.
`scene.excluded` holds one key per *line*: a placed piece is `item:<its id>` (named "product — variant"
and priced at the variant's price when it is in a material variant —
[design-studio/material-variants.md](design-studio/material-variants.md)), and the lines
the budget folds per product are that product within its kind (`finish:<id>`,
`opening:<id>`, `fixture:<id>`, `radiator:<id>`, `equipment:<id>`). The first version kept bare product ids, and
a flat with the same bed in four bedrooms is four lines of one product: unticking one struck
all four, which read as three rows appearing from nowhere. (A bare number in an older scene
still means "every line of that product" when read; `toggleTick` never writes one, and
`pruneTicks` / `pruneQuantities` drop the edits of a piece since deleted before a save.)
`priceScene` builds the sheet as it works it out (`raw`), lays the person's edits over it in
one pass (`withEdits`: ticks and `scene.quantities`), and counts every total, section, basket
and header figure off the result — a ticked-off line is **in `lines`, flagged, exactly where
it would otherwise stand**, and counted nowhere. The page used to list what was ticked off
*after* the rest, from a second pricing, so the sheet reshuffled under the pointer at every
tick; and the radiators never asked the ticks at all, so one ticked off stayed in the total
and was listed twice. The second pricing survives only to say what the edits came to, because
a product that is out can take its store's delivery with it. **A tick takes out that line and
nothing else**: unticking a socket leaves the electrician's point — a socket somebody already
owns still has to be wired — and the point has a tick of its own for the person who is wiring
it themselves; the same goes for the bags of plaster and the plastering. See "One sheet for
both summaries" above for the keys, the quantities and the page.
`tests/unit/design/ticks.test.ts` pins all of it, including that the totals card's rows, the
sections and the header figures each come to the grand total in both modes — the card hid its
labour row outside a renovation, and a design-only project that chose a skirting board pays to
have it fitted, so its rows came up short of the total under them. `budgetLineName` reads the
*kind* of line before the shape of its key (`components/budget/lineName.ts`): labour keys
such as `electric_point` and `plumbing_install` are labour, not a kind of fitting, and read by
their prefix they were rows with no name.

**The rate book's construction materials are ordered too**, from the one store that supplies
them (`platform_settings.materialsStoreId`): `projectMaterials` in `lib/finance/orders.ts` reads
the sheet's `materials` lines as the customer left them — ticked-off ones out, at their
quantities — the same way `projectLabour` reads the labour ([marketplace.md](marketplace.md#construction-materials-the-materials-supplier)).

**What is bought is read off the budget, by everyone** (`orderedLines`). Every product line
carries its `product` — the snapshot with its three names, its category and its shop, holding
the *line's* quantity and total, so a folded line (one paint over five rooms, twelve sockets of
one model, a radiator's sections) is every instance together and not the first of them — and
an `item`, what the product is here ("Sofa", "Wall covering", "Interior door"). The lines that
have one and are still ticked are the one list three things are made from: the **baskets**
per store, built at the end of `priceScene` from those lines and only then charged delivery
(`deliveryFeeFor`, once per store, on everything that store is bringing); the **checkout
dialogue** (`designCheckoutPart(plan, cost, …)`, which takes the priced design, not the scene);
and the **orders** (`costLinesByStore` in `lib/finance/money.ts`, fed by `sceneLinesOf` in
`lib/finance/orders.ts`; `sceneLinesByStore` is the same in one call, used by the tests). All
three used to walk `scene.items` and `scene.finishes` themselves, from when nothing else was a
product: a door from Domus or a socket from Lumina had a price and a tick on the sheet, no
basket, no delivery and no order — a flat whose budget said 31 873 ₾ of products was offered
29 697 ₾ of them at checkout. Walking the scene a second time is also the wrong shape for the
fix, because only `priceScene` knows which door is new work (`all` / `origin: 'user'`, the
ticked phases), what the flat already has (`plan.technical.existing`), that two halves of an
interior door are one door, and how many sections a radiator comes to. **Do not re-derive any
of that in an order builder; add the product to the line.** Three things follow from reading
the lines that the old loops got wrong in the other direction: a finish the flat already has
and a made-to-measure kitchen with no material chosen (an estimate, a joiner's job) are on
nobody's order, and a paint brushed on in twenty strips is one order line of its square metres
rather than twenty. A kitchen in one of the kitchen maker's materials is that maker's product
line, and so their basket and their order (below).
The basket labels follow the `surfaceLabels` pattern — `productLabels` in `PriceOptions`, the
four sockets as one key, Georgian defaults — and `basketLabels(t)` in `lib/i18n/labels.ts`
hands a page both maps from the dictionary (the `ek*`, `tk*` and `line*` strings the fitting
cards and the estimates already use: `tkPanel`, `tkBoiler`, `tkAc`, `tkHood`, `tkFan` and
`tkDrain` for the equipment, `lineKitchenRun` / `lineKitchenIsland` for a kitchen in a material). **Delivery rose for scenes whose doors or
fittings come from a shop below `FREE_DELIVERY_THRESHOLD_GEL`** — that shop was always going to
charge for the van; the budget now says so.

`priceScene` returns `lines` — one `BudgetLine` per product, finish (m²), door or
window (its product, else an estimate — `OPENING_ESTIMATE_GEL`; a pair of interior door halves counted once),
electrical kind (materials + per-point labour from the rate book: `electric_point`, with an
LED strip or a furniture light counted as half a point — `ELECTRICAL_LABOUR`), technical point
(`TECHNICAL_RATES`: `plumbing_install`, `radiator_mount`, `heating_piping`, `ac_install`,
`extractor_install`; the electrical panel is four `electric_point`s; a panel, boiler, air
conditioner, extractor or floor drain that is a product — `lib/design/equipment` — is a product
line of one piece per point, the same product folded, `equipment:<id>`, in place of the point's
material estimate, its labour counted as before) — a point's labour only
when its phase is not running (`technicalWork`, [calculator.md](calculator.md)) — bulk material
and labour line — plus `openingsTotal`,
`technicalTotal`, `lightingTotal` and `coverage`. In `design_only` mode only what the person
added (`origin: 'user'`) is new work; in `full` mode the ticked phases decide. The engine's rooms
come from the plan (`planToCalculatorRooms`), their walls measured without the edges on a room
separator (`wallPerimeterM`), and the partition walls a black frame builds are measured off the
plan's walls, less the ones marked already built and never a room separator (`partitionArea`,
[design-studio/plan-board.md](design-studio/plan-board.md#the-partition-walls-a-black-frame-builds-libdesignpartitionsts)).

**A renovation's contingency is 15 % of its works** (`contingencyTotal`, `CONTINGENCY_PCT`):
of the lines in the `materials` and `labour` sections still ticked, in `full` mode only — never
of the furniture, the finishes, the doors, the fittings or the equipment bought, and nothing in
a design-only project. It is a figure beside the grand total, not a line: the totals cards show
it under the subtotal and the headline is "total + contingency" (`totalCost` on both saves
stores it so); the checkout orders what the lines are, not the reserve — its dialogue shows the
same figure as a row of its own (on the first order of a project), counted in the dialogue's
total and on nobody's order ([marketplace.md](marketplace.md#checkout-flow)). `productsTotal` is the
calculator's lines of its own (`extraLines`: sanitary ware, a pendant, anything the board has no
place for) and counts in the grand total.

**Finishes are bought as they are sold** (`finishPurchase`). Each finish's product carries how it
is sold (`SceneProduct.sale`: its unit, price and coverage); the area a product covers over the
whole flat is turned into what is bought by the calculator's own rule (`finishPickQuantity`):
m² plus a tenth of cutting waste for laminate and floor and wall tiles, paint in whole litres
by its coverage, a moulding by the metre. So a paint over five rooms is its litres rounded up
once, and the calculator and the design buy the same. The line's quantity is in the product's
unit; its room shares (`perRoom`) are split by area. A snapshot from before `sale` is bought by
the m², as before.

**Finishes: every floor and wall the flat is shown in, bought where it shows.** Generation
lays each room's floor and walls in the style's own partner products — the bathroom's tiles,
the bedroom's laminate and paint ([design-studio/finishes.md](design-studio/finishes.md),
`styleFinish`) — so they are finish lines like any tile somebody picked, in either mode and
whatever the home state: the design shows the flat in partner products, and those are what it
buys. A floor or wall the person means to keep is ticked off on the summary like any line.
Before any line is made, `visibleFinishes` cuts every finish down to the part
of it nothing lies on: the paint under a tiled strip, the room's walls under a wall papered on
its own, the laminate under painted floor tiles, the first colour of a strip painted twice are
not bought as well, and a finish wholly covered is not a line at all. The line, its basket,
the room's share (`perRoom`) and the "m² per material" list (`coverage`) all count the visible
area; the scene's own finishes keep what they cover. What the flat already has (`existing`:
floor, wall… — the technical step's checklist, offered in a renovation) drops the surface
whatever laid it.
`budgetSummary` folds the lines into materials + products + labour; `budgetSections`
into the sections the budget page lists. `tradesNeeded` maps the labour keys to the six
worker specialties for step 8.

## Custom wall decor (`lib/design/decor/quantities.ts`)

The code-built wall decor ([design-studio/decor.md](design-studio/decor.md)) is bought by its
materials: each piece's slots measured from the same fit the 3D view draws, in the material's own
unit (m², metres with ×1.1 / ×1.05 cutting waste up to a tenth, pieces whole), folded per product
across the flat (`decorPurchases`) — one line per material: key `decor-<productId>`, tick
`tickFor.decor(productId)`, section `finishes` (an LED line `lighting`), bucket `finishes`, item
label "კედლის დეკორი — დამზადება ზომაზე". The lines carry the product and its store (the decor
workshop), so they are a store card on the sheet, ticked, edited and ordered like any other. The
save route reprices the decor materials; the quantities are measured on the server by `priceScene`.

## Kitchens: a shop's units, or made to measure (`lib/design/kitchen.ts`)

There are two kinds of kitchen, and an item says which it is (`PlacedItem.custom`,
`isCustomKitchenItem`):

- **A shop's kitchen unit** (`custom: false`) — the kitchen units, wall cabinets and islands the
  furniture shops sell (`kitchen-units`, `kitchen-wall-units`, `kitchen-islands`): furniture like any other, at its own size, drawn
  as its own model and bought at its shop's price. Its item panel swaps it for the shops' other
  units (`candidatesFor` never lists a material).
- **Made to measure — "ავეჯის დამზადება"** (`custom: true`) — a run or island a joiner makes
  for the flat, from the kitchen maker's materials (category `kitchen-custom`, "სამზარეულო —
  ავეჯის დამზადება", first on the kitchen's shelf: migration `0002_kitchen_made_to_measure`).
  A material with a run's model is placeable (`isMadeToMeasureKitchen`, so `isFurnitureProduct`):
  off the shelf or out of the catalogue it lands as a run stretched along a wall in that material,
  drawn as the material's model. Its panel has no shop alternatives but its **length** (a slider
  and a number in centimetres, `KITCHEN_LENGTH_M` 0.6–8 m, and "to the end of the wall":
  `stretchedKitchen` / `kitchenToWall` — refused where it would leave the room or stand on another
  piece) and its **material**. **The rate per m² is the material's price** — each kitchen maker's
  product is sold by the m² of façade and admin sets that price in the product form like any
  other; `models:seed` (run by hand) writes a material's price only when it creates
  it, and leaves admin's alone after. The joiner's fallback rates below apply only when the
  catalogue has no material at all.

Which one a piece becomes is decided by the product put in it (`asPlacedKitchen`, from
`applySwap` — adding, carrying and swapping all go through it): a kitchen maker's material makes
it made to measure, a shop's unit makes it that unit (sized by the product, its material
dropped). An item saved before `custom` was set is made to measure when it carries a material
(every kitchen was given one then) or its product is a material, a shop's unit otherwise. Generating a design lays the kitchen's wall run made to
measure in a material drawn for the style — and about a third of the time
(`STORE_KITCHEN_SHARE`) a shop's unit that fits the run instead; an island is a shop's island
([design-studio/layout-and-matching.md](design-studio/layout-and-matching.md#generating-is-random)).

**Wall (hanging) cabinets are a piece of their own** (`kitchen_wall`, hung with their bottom at
1.5 m — 60 cm over the worktop — 35 cm deep): a shop's, or made to measure in the kitchen maker's
wall-cabinet materials (`kitchen-wall-material-ldsp`, `-mdf`, `-veneer`, 520 / 680 / 920 ₾ per
m² of front to start — lighter than the base units), placed off the same shelf category and given
the same length control. Generating lays them over a made-to-measure run in the run's own
material's wall version (grey oak over grey oak), and none over a shop's run.

A made-to-measure kitchen is built for the flat it stands in, so it is **measured**. The
measure is the façade by the square metre (`kitchenFacadeM2`): a run's base units to the
worktop's height, an island's from both sides, wall cabinets their own front. A run no longer
counts uppers — it used to add 70 % of its length in wall units that were neither placed nor
drawn; the wall cabinets are bought as their own line (`kitchen_wall_custom` as an estimate).

- **In a material** (`PlacedItem.kitchenMaterial`): the kitchen maker's product for it, in the
  `kitchen-custom` category — "სამზარეულოს ავეჯი — ინდივიდუალური დამზადება", seeded with three
  materials (laminated chipboard 650, painted MDF 850, oak veneer 1 150 ₾ per m² of façade, all
  in: carcases, fronts, the worktop's share and the fitting — `scripts/lib/kitchenMaterials.ts`).
  The line is that product at `façade × price`, not an estimate: key `product-<id>`, tick
  `kitchen:<item id>`, bucket and section furniture, `item` "სამზარეულოს ავეჯი — ინდივიდუალური
  დამზადება" (or the island's), so it is the maker's basket and the maker's order. **Only a
  product sold by the m² is a material** (`isKitchenMaterial` in `lib/design/catalog.ts`:
  `kitchen-custom` or under it, unit `m2`); anything else filed there — a unit sold by the
  piece — is an ordinary product, and a snapshot that is not per m² prices nothing
  (`kitchenMaterialOf`). The studio gives every made-to-measure piece the style's material (its
  first style tag, else the cheapest — `withKitchenMaterials`), buys it again for the façade
  when the piece is stretched, keeps the snapshot as the catalogue has it now (a price, a photo,
  a model uploaded since; a product no longer sold by the m² gives way to the next material),
  and lets the person choose another in the item's panel — and buys it again whenever its length
  changes (`kitchenMaterialSignature`). The save reprices the snapshot from
  the catalogue for the façade the piece has, and drops one the catalogue does not sell by the
  m² — that kitchen is the estimate again (`app/api/design/projects/route.ts`).
- **A material with a 3D model is how the kitchen is drawn — once the person chooses it**
  (`drawnModelUrl`, `kitchenMaterialChosen`): the material the studio assigns by itself only
  prices the piece, so the kitchen unit placed stays as it is. Chosen in the swap panel, its model replaces the placed kitchen's own in 3D, stretched to the measured run like
  any kitchen model. Its 3D kind says for which pieces — a `kitchen_run` model on runs, a
  `kitchen_island` model on islands, a model with no kind on both; a piece of the other kind
  keeps its own model (the snapshot's `model3dUrl` is left empty for it). A material placed off
  the shelf is chosen from the start, so the run is drawn as it at once. A material is never a
  shop's unit's alternative (`candidatesFor`).
- **With no material** (the catalogue has none): the quote a joiner gives — the façade by the
  square metre, the worktop and the fitting by the running metre (`KITCHEN_RATES`) — marked as
  an estimate, in no basket and on no store's order.

The measurement is in `DesignCost.kitchens` either way. The furniture list and the item's card
show a made-to-measure kitchen at what it is made for (`itemCostGel`, `boughtProduct`), and a
shop's unit (`custom: false`) at its price — an ordinary product and order line.

## Tests

- `tests/unit/design/ticks.test.ts` — per-line ticks, legacy bare ids, pruning, and that the
  totals card, sections and header figures each come to the grand total; that basket,
  dialogue and order agree line for line; and that ticking off a radiator or a socket leaves
  its fitting labour (`radiator_mount`, `electric_point`) whole — found by key through a
  helper that fails when the line is missing, so a renamed labour key breaks the test instead
  of comparing two missing lines.
- `tests/unit/design/pricing.test.ts` — baskets, the delivery threshold, per-room totals, full
  mode with and without a rate book, finishes (the style's bought in a renovation for every
  home state and in a design-only project, not once ticked off, none on a surface the flat
  has).
- `tests/unit/design/visibleFinishes.test.ts` — what shows is what is bought: strips, squares,
  walls of their own, zones and tiles; a strip painted twice bought once, through `priceScene`.
- `tests/unit/design/budget.test.ts` — technical points, doors and fittings, what the flat
  already has, partitions, work choices, `tradesNeeded`; `tests/unit/design/partitions.test.ts`
  — which walls are partitions, built walls, room separators, the calculator's board.
- `tests/unit/design/kitchen.test.ts` — measured runs and islands, `custom: false`; the maker's
  materials: the style's default, re-bought when a run is stretched, the product line and its shop.
- `tests/unit/design/equipment.test.ts` — what a technical point is bought as, the candidates
  (an air conditioner sized to its room), the plan's equipment kept to its rooms, whole-flat
  picks, and the product lines in the budget.
- `tests/integration/save-routes.test.ts` — the design save reprices the equipment one per
  point and a kitchen's material by its façade.
- `tests/unit/summary/calculatorSheet.test.ts`, `tests/unit/summary/quantity.test.ts` — the
  calculation and a design of the same flat come to the same lines; the calculator's sheet, its
  edits and legacy flags, its contingency; the quantity options.
- `tests/unit/projects/checkoutParts.test.ts` — both checkout parts respect ticks and
  quantities.
- `lib/design/pricing.ts` is in the coverage gate ([testing.md](testing.md)).

## Known gaps

- A summary's edits are ticks and quantities on the lines the sheet works out; a line cannot
  be *added* there, a price cannot be changed, and a folded line (a finish over every room it
  is on, twelve sockets of one model) is edited as a whole.
- A wall's own height is drawn, not priced. Every area the budget works out — a room's walls,
  one wall, a strip, a square metre, the calculator's plaster and paint — is against
  `room.heightM`; a wall raised in the inspector costs what it cost before. The room's
  "ceiling height" is the field that moves walls, cornice and quantities together. Ceiling
  lights and pendants hang from `room.heightM` too.
- The calculator's sheet links no product line to its page: `snapshot()` in
  `lib/summary/calculatorSheet.ts` sets `slug: ''` although the picks carry one. The design's
  sheet links as described above.
- A shop's kitchen unit placed as a wall run keeps its own length; nothing joins two units into
  one run, or fills a run with several.
- The made-to-measure tiles on the shelf show the material's price per m² without saying "per m²".
