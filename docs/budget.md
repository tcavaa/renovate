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
| `lib/design/pricing.ts` | `priceScene(plan, scene, options)` → `DesignCost` (`lines`, totals, `baskets` per store, `coverage`, `kitchens`); `budgetSummary`, `budgetSections`, `orderedLines`; `BudgetLine` |
| `lib/design/ticks.ts` | line keys (`tickFor`), `toggleTick`, `pruneTicks` / `pruneQuantities`, `withEdits` |
| `lib/design/technicalRates.ts` | estimate prices and labour keys for fittings, technical points, openings and trims (`ELECTRICAL_LABOUR`, `TECHNICAL_RATES`, `OPENING_ESTIMATE_GEL`, …) |
| `lib/design/kitchen.ts` | measured kitchens (`KITCHEN_RATES`) |
| `lib/design/finishQuantity.ts` | how much of its product a finish needs — shared by the store and the save route |
| `lib/design/trades.ts` | `tradesNeeded` — the labour keys of a budget → the six worker specialties (step 8) |
| `lib/summary/calculatorSheet.ts` | the calculator's estimate and picks as `BudgetLine`s with its edits; `orderedPickLines` |
| `lib/summary/quantity.ts` | `quantityOptions` — what the quantity dropdown offers |
| `components/budget/BudgetSheet.tsx`, `lineName.ts` | the sheet both summaries and the project page render; `budgetLineName` |
| `lib/projects/sheets.ts` | `loadProjectSheets` — a saved project's two sheets, server-side, for `ProjectDetail` |
| `lib/projects/checkoutParts.ts` | `designCheckoutPart` / `calculatorCheckoutPart` — the checkout dialogue's summary of each half |
| `app/(main)/design/[id]/summary/page.tsx` | the design's budget (step 7) |
| `app/(main)/calculator/[id]/summary/page.tsx` | the calculator's summary (step 6) |

## Flow

```
design:     plan + scene ──priceScene──▶ raw lines ──withEdits(scene.excluded, scene.quantities)──▶ lines
calculator: rooms + picks ──buildProjectSummary──▶ calculatorSheet(…, { rooms, edits, storeOf }) ──▶ lines
lines ──▶ BudgetSheet (both summary pages, the project page via loadProjectSheets)
lines ──orderedLines / orderedPickLines──▶ baskets (design), checkout dialogue, store orders
save routes: reprice from the catalogue first, then lay the edits over → cost columns as edited
```

## One sheet for both summaries

**One sheet for both summaries** (`lib/summary/`, `components/budget/BudgetSheet.tsx`). The
calculator's last step and the design's budget are the same thing to the person reading
them — what it all comes to, and what of it they are taking — so they are the same sheet:
`BudgetLine[]` (`lib/design/pricing`), rendered by `BudgetSheet`. The design's lines come from
`priceScene`; the calculator's from `calculatorSheet(summary, picks, { rooms, edits, storeOf })`,
which lays the engine's materials and labour and the person's picks out in that shape. No
calculator pick records its shop, so who sells each one is looked up: `usePickStores` →
`GET /api/products?ids=…` + `/api/stores` on the client, the database in `loadProjectSheets`
on the server.

- **Shown once, under whoever sells it.** Everything a shop sells stands in that shop's card —
  that is who is asked for it and what its delivery is charged on — with the ticks, the
  quantities and a box at the head that takes the whole shop in or out. What nobody sells (bulk
  materials, labour, estimates for things not chosen yet, picks without a shop) stays under its
  kind. The first version listed products twice, by kind with the ticks and again by shop
  without them. Shops stand in the order they first appear on the sheet, never by subtotal,
  which would reshuffle the page at every tick.
- **Every line has a key, not only the products** (`tickFor` in `lib/design/ticks`):
  `item:`, `kitchen:`, `finish:`, `opening:`, `opening-estimate:`, `fixture:`, `radiator:`,
  `estimate:`, `material:`, `labour:`, and for the calculator `pick:<selection key>` and
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
  save), and the cost columns are the totals *as edited*. `orderedPickLines` /
  `orderedLines` are what the checkout dialogue and the store orders are made from, so a
  changed quantity is the quantity a shop is sent. A flag on the pick itself
  (`SelectedProduct.excluded`, the first version) is still read, as the key it meant, and
  lifted into `excluded` when a stored calculator is rehydrated (`liftFlags`).
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
`scene.excluded` holds one key per *line*: a placed piece is `item:<its id>`, and the lines
the budget folds per product are that product within its kind (`finish:<id>`,
`opening:<id>`, `fixture:<id>`, `radiator:<id>`). The first version kept bare product ids, and
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
and a made-to-measure kitchen (an estimate, a joiner's job) are on nobody's order, and a paint
brushed on in twenty strips is one order line of its square metres rather than twenty.
The basket labels follow the `surfaceLabels` pattern — `productLabels` in `PriceOptions`, the
four sockets as one key, Georgian defaults — and `basketLabels(t)` in `lib/i18n/labels.ts`
hands a page both maps from the dictionary (the `ek*`, `tkRadiator` and `line*` strings the
fitting cards and the estimates already use). **Delivery rose for scenes whose doors or
fittings come from a shop below `FREE_DELIVERY_THRESHOLD_GEL`** — that shop was always going to
charge for the van; the budget now says so.

`priceScene` returns `lines` — one `BudgetLine` per product, finish (m²), door or
window (its product, else an estimate — `OPENING_ESTIMATE_GEL`; a pair of interior door halves counted once),
electrical kind (materials + per-point labour from the rate book: `electric_point`, with an
LED strip or a furniture light counted as half a point — `ELECTRICAL_LABOUR`), technical point
(`TECHNICAL_RATES`: `plumbing_install`, `radiator_mount`, `heating_piping`, `ac_install`,
`extractor_install`; the electrical panel is four `electric_point`s) — a point's labour only
when its phase is not running (`technicalWork`, [calculator.md](calculator.md)) — bulk material
and labour line — plus `openingsTotal`,
`technicalTotal`, `lightingTotal` and `coverage`. In `design_only` mode only what the person
added (`origin: 'user'`) is new work; in `full` mode the ticked phases decide.
`budgetSummary` folds the lines into materials + products + labour; `budgetSections`
into the sections the budget page lists. `tradesNeeded` maps the labour keys to the six
worker specialties for step 8.

## Kitchens are measured, not bought (`lib/design/kitchen.ts`)

Every other product is a SKU with a price; a kitchen is built for the flat it stands in, so
`kitchen_run` and `kitchen_island` are **measured** and their model's price is ignored. The
quote is the one a joiner gives: the façade of the lower units and of the upper ones by the
square metre, the worktop and the fitting by the running metre (`KITCHEN_RATES`). The
measurement is in `DesignCost.kitchens` and the budget's line carries the m², marked as an
estimate. A stock kitchen is an item with `custom: false` (a data flag — the studio has no
control for it yet).
An estimate is not a product line, so a measured kitchen is in no basket and on no store's
order — the checkout used to send the shop the model at its catalogue price all the same,
while the budget charged the joiner's quote; `custom: false` makes it a product and an order
line again.

## Tests

- `tests/unit/design/ticks.test.ts` — per-line ticks, legacy bare ids, pruning, and that the
  totals card, sections and header figures each come to the grand total; that basket,
  dialogue and order agree line for line; and that ticking off a radiator or a socket leaves
  its fitting labour (`radiator_mount`, `electric_point`) whole — found by key through a
  helper that fails when the line is missing, so a renamed labour key breaks the test instead
  of comparing two missing lines.
- `tests/unit/design/pricing.test.ts` — baskets, the delivery threshold, per-room totals, full
  mode with and without a rate book, finishes.
- `tests/unit/design/budget.test.ts` — technical points, doors and fittings, what the flat
  already has, partitions, work choices, `tradesNeeded`.
- `tests/unit/design/kitchen.test.ts` — measured runs and islands, `custom: false`.
- `tests/unit/summary/calculatorSheet.test.ts`, `tests/unit/summary/quantity.test.ts` — the
  calculator's sheet, its edits and legacy flags; the quantity options.
- `tests/unit/projects/checkoutParts.test.ts` — both checkout parts respect ticks and
  quantities.
- `lib/design/pricing.ts` is in the coverage gate ([testing.md](testing.md)).

## Known gaps

- A summary's edits are ticks and quantities on the lines the sheet works out; a line cannot
  be *added* there, a price cannot be changed, and a folded line (a finish over every room it
  is on, twelve sockets of one model) is edited as a whole. The calculator's sheet shows no
  delivery — its estimate never included it; the orders do charge it — while the design's does.
- A wall's own height is drawn, not priced. Every area the budget works out — a room's walls,
  one wall, a strip, a square metre, the calculator's plaster and paint — is against
  `room.heightM`; a wall raised in the inspector costs what it cost before. The room's
  "ceiling height" is the field that moves walls, cornice and quantities together. Ceiling
  lights and pendants hang from `room.heightM` too.
- Each finish is priced by its own area: a base wall finish is charged for the whole room's
  walls even where one wall, a strip or a square metre of another product lies over it, so
  overlaid finishes over-count the base by the area they cover.
- The calculator's sheet links no product line to its page: `snapshot()` in
  `lib/summary/calculatorSheet.ts` sets `slug: ''` although the picks carry one. The design's
  sheet links as described above.
- A made-to-measure kitchen can be turned into a stock product only by the data flag
  `custom: false` on the item; the studio has no control for it yet.
