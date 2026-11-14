# Custom wall decor and the AI designer

Wall treatments that are not a product with a model — slatted fields, stone slabs, picture-frame
mouldings, built-out niches, light lines and coves, upholstered or relief panels, brick or concrete
cladding, murals, tiled fields — built in code and fitted to the walls, and the AI designer that
places them (with the furniture and the finishes) after the style test. Read this before touching
`lib/design/decor/`, `lib/design3d/decor.ts`, `lib/design/aiDesign.ts`, `aiReview.ts`,
`aiProposal.ts`, `generateScene.ts`, `generationJob.ts`, `lib/api/designJob.ts`, the
`/api/design/ai-generate` or `/api/design/ai-review` route, `DecorPanel`, or the decor materials.

Related: [overview.md](overview.md) (step 4, `generate`) · [ai-layout-plan.md](ai-layout-plan.md)
(the plan this realises in part) · [layout-and-matching.md](layout-and-matching.md) (the engine the
proposal goes through) · [3d-engine.md](3d-engine.md) · [studio.md](studio.md) ·
[../budget.md](../budget.md) · [../catalog.md](../catalog.md) · [../data-model.md](../data-model.md).

## Key files

| File | Responsibility |
|---|---|
| `lib/design/decor/reference-library.json` | the reference library: per room type × style, the concepts, the families they use, the composition rule and the room constraint; the primitives' parameters and fit rules (what the prompt quotes) |
| `lib/design/decor/families.ts` | `DECOR_FAMILIES`: each family's slots, the material kinds each slot takes, its default knobs; `slotTakes`, `hasLed`; `STYLE_DECOR_FAMILIES` (the families each style takes) and `styleTakesLed` (Modern only) |
| `lib/design/decor/resize.ts` | a piece resized and moved by hand: `dragDecorHandle` (an arrow dragged to a point on its wall), `resizeDecor` (the card's width, height, height off the floor, distance from the wall's start), `moveDecor` (dragged by its body: along its wall, up it, onto another wall), `decorExtent`, `isResizable`, `isMovable`, `standsOnFloor`, `resizesFromMiddle` |
| `lib/design/decor/housing.ts` | furniture and what is built for it kept together: `housingOf`, `adoptHoused`, `followHoused` (the furniture moved), `carryHoused` / `carryCompanions` (the housing moved; a dryer, a tap, a mixer ride with their piece), `houseItem` / `boxFor` (built for a piece set down), `cabinetAtExtent` (joinery resized section by section), `freeExtent` (joinery never runs into anything), `joineryObstacles` / `withJoinery` (furniture keeps out of joinery) |
| `lib/design/fitted.ts` | what the store runs: `settleFitted` (after every change to the furniture), `withFitted` (a piece set down, or asked on its card), `takesHousing`, `lacksHousing` |
| `lib/design/kitchenCorner.ts` | a corner (L-shaped) kitchen: `kitchenLeg`, `kitchenLegOf`, `runIntoCorner`, `runFromCorner`, `followKitchenLegs`, `resizedKitchenLeg`, `fitKitchenCorners` (the generation's) |
| `lib/design3d/decorHandles.ts` | the selected piece's arrows and frame in 3D: `makeDecorHandles`, `placeDecorHandles`, `hideDecorHandles`, `decorDepth` |
| `lib/design/decor/materials.ts` | decor materials: `DECOR_MATERIAL_CATEGORY` (`decor-materials`), the kinds (`decor-<kind>` sub-categories), `isDecorMaterial`, `decorMaterialsOf`, `defaultDecorMaterial` (an LED defaults to the warmest), `decorSpecs`, `ledColor` |
| `lib/design/decor/layout.ts` | the fit, pure and in the wall's frame: `decorWall`, `freeSpans`, `fitSlats`, `fitMoulding`, `fitNiche`, `fitField`, `fitLight` |
| `lib/design/decor/quantities.ts` | what a piece uses per slot in m², metres and pieces (`decorUses`), bought in the material's unit with the waste (`quantityIn`, `DECOR_WASTE`), per piece (`piecePurchases`, `pieceCost`) and folded per product across the flat (`decorPurchases`); `decorProductIds` for the save route |
| `lib/design/decor/resolve.ts` | intents → pieces: `resolveDecor` / `resolveRoomDecor` (anchors, walls, stretches off doors and windows, heights, `sanitizeParams`, `resolveMaterials`), `wallBehind`, `decorMaterialFrom` |
| `lib/design3d/decor.ts` | `buildDecor` / `buildDecorPiece`: every family in 3D from the same fit; its own material cache (`decorMaterial`, `releaseDecorMaterials`); LED glow cards |
| `lib/design/aiProposal.ts` | the proposal's shape and how it becomes a flat: `proposalPicks`, `withProposalFinishes`, `proposalDecor`, `proposalNotes`, `MAX_AI_GENERATIONS`; `withoutArtOverDecor` (no print over built decor); `applyReviewFixes` (the check's fixes, pure) |
| `lib/design/aiReview.ts` | server only: the designer's check of the furnished flat — `reviewFindings` (what measuring each room finds wrong), `buildReviewBrief`, `REVIEW_SCHEMA`, `validateReview`, `reviewWithClaude` |
| `lib/design/aiDesign.ts` | server only: `buildBrief` (the flat, the candidates, the decor materials and references), `SYSTEM_PROMPT`, `DESIGN_SCHEMA`, `designWithClaude`, `validateProposal`, `DESIGN_MODEL` |
| `lib/design/generateScene.ts` | laying the flat out, pure and isomorphic: `generateScene` (the store's `generate` and the server's job both run it), `reviewedScene` (the check's fixes and notes), `defaultFinishes`, `keepChosen`, `placeableOnly` |
| `lib/design/generationJob.ts` | the job as the style page sees it, pure: `GenerationJobView`, `GenerationStatus`, `JOB_STALE_MS` (6 min), the deadlines, `JOB_POLL_MS`, `isStale`, `generationAction` (wait / reload / engine / none) |
| `lib/api/designJob.ts` | server only: the generation job — `startDesignJob`, `runDesignStage`, `runReviewStage`, `settleStaleJob`, `generationStatus`, `jobToken` / `validJobToken` |
| `lib/api/designJobRows.ts` | the job's queries, one each (`withJobLock`, `claimJob`, `writeDesignForJob` …) — mocked in memory by the tests |
| `lib/api/designWrite.ts` | a design write's columns (`designWriteColumns`: repriced, its budget worked out) and the plan's locks (`refusedDesignChange`) — the save route's and the job's |
| `lib/design/aiDesignClient.ts` | the browser's side: `generationStatus`, `startAiGeneration` (each null on any failure) |
| `app/api/design/ai-generate/route.ts` | `GET` → `{ enabled }`, with `?projectId=` also `{ job, designGenerated }`; `POST` starts a job → 202 `{ job }`, or 503/429/409 with `fallback: 'engine'` (402 on the plan's locks) |
| `app/api/design/ai-review/route.ts` | the job's second invocation: `POST` from the server itself, signed (`x-design-job`, `x-design-job-token`) → 202, the check run after the answer; 403 otherwise |
| `components/design/GenerationOverlay.tsx` | the overlay, paced by the job's stage |
| `lib/db/migrations/0009_design_jobs.sql` | the `design_jobs` table |
| `components/studio/DecorPanel.tsx` | the card of a selected piece |
| `lib/db/migrations/0005_decor_materials.sql` | the category tree, the starter materials and the workshop store |
| `tests/unit/design/decor.test.ts` | the fit, the quantities, the budget lines, the resolver, the proposal and its validation (the families and LED a style takes) |
| `tests/unit/design/decorResize.test.ts` | the arrows dragged (one side, from the middle, kept on the wall and under the ceiling, the smallest size) and the card's sizes |
| `tests/unit/design/housing.test.ts` | a WC and its box, a machine and its column, a basin and its vanity moved either way; a section leaving a longer run; joinery resized for real and stopped by doors, furniture and other joinery; decor moved by hand; a catalogue shower's glass; a generated flat left as it is by the pass |
| `tests/unit/design/kitchenCorner.test.ts` | the leg at either corner, under a window, stopped by a door or furniture, resized, following its run, the generation's corner kitchens |
| `tests/unit/design/fittedStore.test.ts` | the store's actions: a drag takes the column (one undo), a dragged column takes the machine, delete and the card's button, the corner switch; furniture kept out of joinery |
| `tests/unit/design/placementSettle.test.ts` | the check's findings, its validation and its fixes applied; no print over slats |
| `tests/unit/design/generateScene.test.ts` | the store and `generateScene` make the same flat for a seed, with the designer and without; `reviewedScene` |
| `tests/unit/design/generationJob.test.ts` | a stale job; what the style page does with each job, on starting one and on opening the project again |
| `tests/integration/design-job.test.ts` | the job end to end with its rows in memory and Claude mocked: both stages over their revisions, every fallback, a design changed under it, the cap, a dead job settled, the locks on Free, an unsigned check refused |

## The data (`DecorPiece` in `lib/design/types.ts`)

`scene.decor: DecorPiece[]` — each piece is one family on one wall of one room (`wallIndex`, the
room edge), over a stretch of it (`span`, metres along the edge from its first corner, as a
finish's span) and a band of height (`height`); a cove runs round the room's ceiling and has
`wallIndex: null`. `params` are the family's knobs (`DecorParams`, every one optional over
`DECOR_FAMILIES[family].params`). `materials` is a record by slot (`DecorSlot`) of
`DecorMaterial`: the catalogue product as a snapshot, a colour where the material takes one
(`specs.tintable`), and the specs it draws with copied from the catalogue (`textureScaleM`,
`tintable`, `cct`, `profileMm`, `roughness` — a `SceneProduct` carries no specs). `reference` is
the library entry and concept it realises, `note` the designer's sentence, `origin` `ai` or
`studio` (edited since). A piece built for a piece of
furniture names it: a box its WC or its bath and a kitchen's corner leg its run (`itemId`), a
cabinet's section the basin or the machine standing in it (`CabinetSection.itemId`) — see
[Furniture and what is built for it](#furniture-and-what-is-built-for-it-housingts). `scene.generation` records how the flat was generated (`engine` or `ai`,
the model, the time, the per-room notes, how many AI runs the design has had). Both are saved with
the scene, versioned, undone and persisted like the rest (`decor` is in `DesignSnapshot`,
`partialize`, `scene()`, `DESIGN_SAVED`).

A piece is fitted again wherever it is drawn: a wall that got shorter clips its stretch
(`decorWall`), a stretch too small to build (under 10 cm) draws nothing and buys nothing, and a
piece whose room went is dropped (`reconcile`).

## The families (`families.ts`, `layout.ts`)

The reference library's rules, as code:

- **slats** — a real section (20–45 mm, gap 10–25, depth 10–30) repeated a whole number of times,
  the remainder centred; a board behind (`backing`, felt or MDF) or none (a see-through screen); a
  light line under, over or both (`led`). Slots: face (wood / board), backing (board), led.
- **moulding** — picture frames on every clear stretch between doors and windows, a whole number
  of bays per stretch sized to divide it evenly (`bayWidthMm`), lower and upper rows about a chair
  rail (`dadoMm`), a frame under a window and over a door or window where there is room; never a
  stretched profile. Slot: profile (moulding, tintable).
- **niche** — a plasterboard build-out the whole stretch and height of the piece, `count` arched
  or square niches spaced evenly in it (a pair either side of a decorative mantel with its firebox
  when `mantel` and the wall is 3.2 m or more), shelves inside, a light inside. Built out because a
  wall's construction is unknown. Slots: body (gypsum, tintable), shelf (wood), surround (stone),
  led.
- **slab / panel / cladding / mural / tile** — a field (`fitField`): its thickness, a stand-off
  for a floating slab (with a halo light behind), seams at the material's real size balanced
  across the field (slabs, flat panels, large cladding), upholstered channels or flutes as rounded
  modules, a tile field's border band, an edge trim. Slots by family (face, trim, border, led).
- **light** — a cove (a lowered ceiling panel 15 cm in from every wall and 12 cm under the
  ceiling, the strip on it 5 cm back from its edge — the design rules' `COVE_*`; rectangular rooms
  only; measured from a new ceiling when one is hung) or a line set into the wall. Slots: led, body (the cove's
  plasterboard).
- **box** — a wall-hung WC's installation box (`lib/design/decor/wcBox.ts`): plasterboard 20 cm
  deep on the wall behind the WC, 80 cm wide (the whole wall when a sliver under 30 cm would be
  left beside it), half height (1 m, its top a shelf) or to the ceiling (`params.full`, the card's
  "სიმაღლე"; the store sets the band with it). Slots: body (gypsum), face (tile or stone,
  optional — without it the box is painted, the body's colour). Measured as its front, its two
  sides and, half height, its top. **Not the AI's**: `AI_DECOR_FAMILIES` leaves it out of the
  prompt, the schema and the validation; `generateScene` puts one behind every WC (`wcBoxes`,
  anchor `wc`, so it follows its WC — `reanchorDecor`), and the WC stands in front of it
  (`clearOfDecor`, `STANDS_OUT`). A WC set down in the studio gets one too (`withWcBoxes`, in
  `addItem` and `finishCarry`), its materials copied from a box the flat has (the store has no
  catalogue). A **bath's enclosure** is a box too (anchor `bath`, `lib/design/bathroom.ts`): as
  deep as the bath (up to 1 m), drawn hollow — its front, its ends and a strip on the wall round
  the bath standing in it — and the bath is not pushed out of it (`clearOfDecor`).
- **cabinet** — made-to-measure joinery (`lib/design/decor/joinery.ts`, the rulebook of 6 Nov
  2026): `params.sections`, left to right along the wall, each `{ kind, widthMm, heightMm,
  depthMm, dryer?, itemId? }` — `basin` (a vanity), `washer` (a column open in front round the machine, a
  shelf for a dryer on it), `boiler` (louvred doors), `coats`, `shoes`, `doors`, `open` (shelves).
  Resized by hand it is resized section by section (`cabinetAtExtent`, below). Slot:
  face, in the kitchen maker's materials (`kitchen-custom`, kind `joinery` — `decorMaterialKind`),
  the flat's kitchen run's own when it has one (`joineryMaterial`), so the joinery is one design.
  Measured as the joiner prices it: every section's front and the sides that show
  (`cabinetFacadeM2`). Drawn as carcasses with shadow gaps between doors (a door under 60 cm), a
  plinth, the boiler's louvres. **Not the AI's** (`AI_DECOR_FAMILIES`; its materials are not
  offered to it); every style takes it (`STYLE_DECOR_FAMILIES`). Not in `STANDS_OUT`: what it
  houses — the basin on the vanity, the washer in its column — stays where it stands. Built by the
  bathroom pass (vanity, washer column), the hall pass (`lib/design/hall.ts`: the hall's wardrobe
  with the boiler's section) and the bedroom pass (`lib/design/bedroom.ts`: a wall of wardrobe); the
  AI room check sees them as fixed (`ENGINE_DECOR` in `aiReview.ts`).

## What it costs (`quantities.ts`)

Each slot is measured in m², metres and pieces from the fit (slats: the field's area, the slats'
metres and their count; mouldings: every metre of frame and rail; a niche: the build-out's front
less its openings plus each niche's sides, head and back, the shelves, the mantel's stone; a
field: its face, its trim, its border; LED: the lit length) and bought in the **material's own
unit** as admin set it — m² and metres with the cutting waste (×1.1 and ×1.05, up to a tenth),
pieces whole. Admin can sell oak slats by the m² or by the metre and the budget follows. Each piece
rounds on its own (it is cut on its own); `decorPurchases` folds the flat into one purchase per
material product, which `priceScene` turns into budget lines: key `decor-<productId>`, tick
`tickFor.decor(productId)`, section `finishes` (an LED line `lighting`), bucket `finishes`, the
product snapshot with its store — so the workshop is a store card on the summary sheet, its lines
ticked and their quantities edited like any other, and the checkout orders them
([../budget.md](../budget.md)). The save route reprices every decor material from the catalogue
and takes its unit from there (a material no longer sold in m², metres or pieces leaves its slot);
the quantities are never the client's — `priceScene` measures them on the server.

## Materials (the catalogue)

Decor materials are ordinary products in the sub-categories of `decor-materials` (not `decor`,
which holds artwork, plants and mirrors): `decor-wood`, `-board`, `-led`, `-moulding`, `-gypsum`,
`-stone`, `-fabric`, `-relief`, `-brick`, `-concrete`, `-tile`, `-wallpaper`, `-trim`. The kind is
the category, so admin adds a new one by filing a product there with a unit (m², linear metre or
piece) and a price; its `specs` may carry `textureScaleM`, `tintable`, `cct` (an LED's kelvin),
`profileMm` (a moulding's face). The design catalogue loads them (`DECOR_MATERIAL_SLUGS` in
`KNOWN_SLUGS`); they are not furniture, not in the calculator and not on the shelf.

Migration 0005 made the tree, a store ("დეკორის სახელოსნო" / Decor Workshop) and 36 starter
materials at placeholder prices for admin to set: five slat veneers (textures baked in code to
`public/textures/decor/wood-*`), two boards, three LED lines (2700/3000/4000 K), three mouldings,
plasterboard, four stones (white, grey and verde marble, travertine — copied from the library into
`public/textures/decor/`, since `public/library` is not deployed), two concrete panels, two
upholstered fabrics, two reliefs, two brick slips, four tiles, three wallpapers and three trims;
photos in `public/uploads/products/decor-*.webp`.

## In 3D (`lib/design3d/decor.ts`)

`buildDecor(plan, scene.decor, roomFilter)` is a group of its own in the viewer, memoised on the
decor, the plan and the rooms in view and disposed like the shells. Every piece is built in its
wall's frame (x along the edge, y up, z into the room) and put on the edge; meshes carry metre UVs
(gotcha 11) and `ownsGeometry`; each is tagged `pickKind: 'decor'`, `decorId`. A piece on a wall
carries `wallCut` with `kind: 'decor'` and goes with its wall in the cutaway and with the walls
down (`wallPartVisible`); the viewer collects wall parts from the shells and the decor group.

- **Its own materials.** `StyleMaterials.releaseUnused` disposes every surface the shells do not
  wear, which would take the decor's with it; and a tinted fabric or lacquer multiplies its colour
  over its texture, which a finish deliberately does not. So decor materials are cached here by
  texture, colour, scale and roughness, their textures counted in `loadProgress`, and
  `releaseDecorMaterials` frees them when the viewer unmounts.
- **Light without lights.** An LED line is an emissive strip and a glow card — an additive plane
  with a gradient on the surface it washes (under slats, round a stood-off slab, inside a niche, on
  the walls above a cove). No `RectAreaLight`, no point light: every light is paid on every lit
  pixel (gotcha 22).
- **A cove from above.** The lowered panel is its underside and edges only (backface-culled from
  the doll's-house camera like the ceiling), so the room stays open from above.
- `group.add(...[])` logs an error in three: add a list only when it has something.

## The studio (`DecorPanel`)

A click on a piece (furniture mode) selects it (`ElementSelection` `{ kind: 'decor' }`) and opens
its card on the right: what it is (the concept, the family, its wall, its size), the designer's
note, its light line (the family's options — under, over, behind, inside — the warmest LED added
when turned on), each slot's materials from the catalogue as swatches (none for an optional
slot), a colour row for a tintable material (the studio's paints and a few accents, or the
material's own), and the materials it buys with their cost. Edits are undoable store actions
(`setDecorMaterial`, `setDecorColor`, `setDecorParams`, `setDecorExtent`, `removeDecor`) and mark
the piece `origin: 'studio'`.

**Resizing** (the owner's notes of 29 Oct 2026). A piece on a wall (not a cove round the ceiling)
has its size on the card — width, height and its bottom off the floor, in metres (`resizeDecor`:
the width about its middle, the height from its bottom up) — and, while selected in 3D, four
arrows just in front of it, at its sides and on its top and bottom, with a frame round it
(`decorHandles.ts`, drawn without depth testing like the selection outline). Dragging an arrow
moves that edge to the pointer on the plane of the piece's face (`dragDecorHandle`); the arrows and
the frame follow live and the piece is rebuilt at its new size on release (`setDecorExtent`, one
undo step). A piece centred on furniture (`anchor` bed, sofa, TV…) grows both ways from its middle,
so it stays centred when `reanchorDecor` follows the furniture — and once its far side reaches the
end of the wall, the dragged side goes on following the pointer alone, so a piece near a corner
still grows; any other moves the dragged side. The frame round it and the selection outline are
never picked (`raycast` emptied): a line answers the pointer up to a metre round it, and the frame
took the second click on the piece and some presses meant for an arrow.
A piece keeps to its wall, under the (lowered) ceiling, and is never narrower than 20 cm or lower
than 10 cm (`DECOR_MIN_WIDTH_M`, `DECOR_MIN_HEIGHT_M`). The arrows show only where the flat can be
changed — not in a view that only looks, nor while building, wiring or painting.

**Moving** (the owner's notes of 13 Nov 2026). A piece is dragged by its body: a press selects it
and, held, slides it along its wall and up it (`moveDecor`: its size kept, on the wall and under the
ceiling), and onto another wall of its room — the pointer's ray is put on the piece's own wall while
it is over it, else on the wall of the room it looks at from inside (`Viewer3D`, `handle: 'move'`).
The built piece and the frame follow live; the store takes the place on release (`moveDecor`, one
undo step). The card has the distance of its near side from the wall's start beside its width and
height. A piece that was centred on a piece of furniture stops following it once it is put somewhere
by hand (`anchor: 'wall'`). **Joinery and boxes move as furniture does** (`standsOnFloor`): the
pointer's spot on the floor picks the wall — the nearest of the room, the piece's own holding on a
little — and the place along it, so a cupboard is dragged across the room onto any wall; they stay
on the floor and have no bottom arrow (`hiddenHandles`).

**Joinery is resized for real** (`cabinetAtExtent`). A cabinet's sections each have their own
height, so a height dragged on the piece used to change nothing. Now the sections that reached the
old top go to the new one and the lower ones stay (a vanity beside a column); the width is shared
out over the sections that stretch — a washing machine's column keeps its own while another section
can take the change — and no section is made narrower or lower than what stands in it.

## Furniture and what is built for it (`housing.ts`)

A washing machine and its column, a basin and its vanity, a WC and its box, a built-in bath and its
surround are one thing to the person and two records here — a `PlacedItem` with a model, a
`DecorPiece` built in code — so one module keeps them together (the owner's notes of 13 Nov 2026):

- **The link** is by id: `CabinetSection.itemId`, and `DecorPiece.itemId` for a box. The generation
  writes it (`fitBathrooms`, `wcBoxes`); a design saved before it existed takes it from where the
  pieces stand (`adoptHoused`), read off the flat *before* the change in hand (`linkedDecor` in the
  store) — read after, a box would be lost the moment its WC was dragged away.
- **The furniture moved** (`followHoused`, run by `settleFitted` after `placeItem`, a swap, a carry
  set down, a delete, a kitchen's new length): a piece set down by another wall with its back not
  to it is turned to stand with its back on that wall (`turnedToWall`), so its housing can go there;
  a box sits centred behind its WC or its bath on whatever wall that now is (the WC stood out in
  front of it); a basin moved about on its vanity's top — its own section and the plain doors beside
  it at its height — changes nothing (the vanity used to shrink to the basin); a piece that is the
  only thing its joinery was built for takes the whole of it, every section, to its new wall; and
  where a run houses two things, the one that left takes its section with it as a piece of its own,
  at the size it had, the run closing up behind it. Where the new place has no wall
  behind the piece or no room, the housing is given up. A housing whose piece was deleted goes too.
- **The housing moved or resized** (`carryHoused`): what stands in it goes with it — carried with a
  section that moved, left where it stood when the section was only made wider (its pipes are
  there), a basin at its vanity's new height.
- **What rides on a piece goes with it** (`carryCompanions`, by id: `<id>-tap`, `-dryer`, `-mixer`):
  the dryer on a dragged machine, the tap of a dragged basin, a bath's mixer.
- **A piece set down from the catalogue** is given what a generated one has (`withFitted`, in
  `addItem` and `finishCarry`): a WC its box, a washing machine its column and a countertop basin in
  a bathroom its vanity (not in Vintage, as at generation — `takesHousing`), a built-in bath its
  surround, a shower its floor and glass (`withShowerArea`). The joinery is made in the material the
  flat's joinery already has, else the joiner's for the flat (`joinerFace`).
- **The card builds it again.** A piece whose housing was deleted (or never built) has a button on
  its card (`SwapPanel` `onAddFitted`, `lacksHousing`; the store's `addFitted`) — "add fitted
  cupboard", "add installation box", "add tiled bath surround", "add shower glass". With no wall
  behind the piece or no room, it says so.
- **Joinery never runs into anything** (`freeExtent`, `freeStretch`): built, moved or resized, a
  cabinet stays inside the stretch of its wall clear of the doors and windows, the furniture (but
  what it houses) and the other joinery and boxes (`decorFootprint`), and keeps off a corner whose
  other wall has a door or a window it would stand in front of (`cornerClearance`). Only a side
  that was dragged is held back. The other way round, a piece of furniture being moved keeps out of
  joinery (`joineryObstacles`, `withJoinery` in `Viewer3D`): each section is a block of its own
  height, and the piece a housing was built for may stand in it.

A generated flat is left exactly as it is by this pass (a test holds it to that): the studio runs it
on every move of any piece, so a pass that shifted anything would shift it on the first drag.

**By style.** The AI designer's decor is cut to the families its style takes
(`STYLE_DECOR_FAMILIES`): Modern all of them; Scandinavian slats, niches, tiles and the WC's box
(no mouldings or decorative wall treatments); Industrial no mouldings, light lines or panels;
Vintage no light lines or panels. LED (a slat wall's line, a niche's, a slab's halo) only in a
Modern flat (`styleTakesLed`; `validateProposal` turns it off elsewhere). Anyone can still add a
light line on a piece's card.

## The AI designer

Generation after the style test asks Claude for the whole flat when the server has
`ANTHROPIC_API_KEY` (docs/design-studio/ai-layout-plan.md's principles: intent, not coordinates;
real products from short lists; the engine checks). **It runs on the server as a job**
(`lib/api/designJob.ts`, table `design_jobs`), so a flat asked for is furnished and checked whether
or not the page stays open: closing the tab, losing the connection or reloading changes nothing, and
the project opens furnished afterwards.

1. **The style page** asks `GET /api/design/ai-generate?projectId=` when it opens: whether the
   designer is there, the project's last job, and whether its design is laid out on the server. On
   "generate" (after the hinge, whose "continue" puts the budget in and saves the design with the
   autosave held — `saveBeforeGenerating`), with the designer there and the design under
   `MAX_AI_GENERATIONS` (5) AI runs, it starts a job (`POST`, `{ projectId, baseRev, locale }` —
   `baseRev` the revision that save made) and from then on only asks after it every
   `JOB_POLL_MS` (3 s; a failed request is asked again), the overlay showing the job's real stage
   (`GenerationOverlay` `stage`: the designer's steps while `designing`, never past them; the check
   while `checking`; the rest once `done`). Done, it lets go of this browser's copy of the design
   (`dropCachedCopy`) and loads the studio, which reads the design from the row — the way a
   revision saved in another tab is taken (`lib/flow/projectSync`). **Opening the project while a
   job runs** lands on the style page (the design is not laid out yet), which finds the job and
   waits on it again; a job that finished meanwhile laid the flat out, so the project opens in the
   studio. What the page does with each answer is `generationAction`: `wait`, `reload` (the server's
   design is laid out and this browser's is not), `engine` (the job it waits on came to nothing, or
   a failed job newer than this browser's last generation), `none`.
   **The autosave is held while the page waits** (`designStore.autosaveHeld`, `DesignAutosave`):
   the job writes the design over the revision it started from, so nothing else may move it — not
   a change, not the flush on leaving (`useAutosave` flushes only while enabled), not the autosave
   repeating the hinge's save (it no longer writes a signature a save of the page's own just wrote —
   `savedSignature`). Leaving the style page for another step lets the autosave go again: a change
   made there is saved and wins, and the job, finding the design moved, writes nothing.
2. **The start** (`startDesignJob`; signed in, the project the caller's, `RATE_RULES.aiGenerate`)
   settles a dead job first, refuses what the plan's locks refuse (laying a laid-out flat out again
   without the catalogue — 402, as the save route would), then in one transaction holding the
   project's lock (`pg_advisory_xact_lock`): hands back the job already running (two clicks, two
   tabs: one job), refuses a design not at `baseRev` (409), counts the cap from the jobs the project
   has had (and the scene's `generation.aiCount` from before jobs existed — every job is one AI run,
   so a repeat cannot bill past it; 429), and writes the job (`designing`, a seed, its `aiCount`).
   It answers 202 at once; everything after runs in `after()` (`afterResponse`).
3. **The design stage** (`runDesignStage`, after the start's answer, in its function's 300 s):
   the brief is built from the row's plan (`ensureWalls`, as the browser opens it) and the cached
   design catalogue (`buildBrief`): per room its walls by index (side of the plan, length, doors,
   windows with sills and heads, clear stretches), the engine's pieces for the room program with 12
   products per kind, 10 floor and 10 wall finishes for the room, every decor material, and the
   reference library's entries for the style and the room types.
   **Every generation is offered a fresh draw** (the job's seed, logged): the products are drawn
   at random from every product of the kind that fits the room (`fitsRoom`, `candidatesFor`) —
   the style's own and the well-priced more likely (`generationWeight`, weighted sampling without
   replacement), any of them possible — and so are the finishes; the decor materials and each
   reference's concepts come in a random order; and the run gets a **direction**, a palette and
   mood within the style drawn from `DIRECTIONS` (six per style). The brief also carries the
   owner's **style guide** (`lib/design/styleGuide.ts`: the style's look, palette, materials,
   furniture, kitchen, lighting and walls) and the flat's **sub-style** — the one the style test's
   answers point to (`subStyleFor`: loft or concrete minimal for industrial, contemporary or
   mid-century for modern, traditional, French country, farmhouse or bohemian for vintage), drawn
   when the plate was picked directly — and the system prompt the design rules a designer chooses
   by (palette of 2–3 colours and an accent, light in three layers at the room's colour
   temperature, curtains from the ceiling, the sizes of a shower, a basin, a wardrobe). What the flat's saved design
   already uses is drawn far less often (`PREVIOUS_WEIGHT`) and named in the brief, so generating
   again gives a new design. The prompt tells the designer the lists are random and unordered.
   Measured on two flats in one style: 10 of 28 products shared, no finish shared; one flat
   generated twice: 1 of 30 products, no finish and no decor family shared. Small pools (curtains,
   desks, TV units — 8 to 16 products) are where two flats still meet. One Claude call (`DESIGN_MODEL`, adaptive thinking, effort medium,
   server-side refusal fallback, the system prompt cached, structured output against
   `DESIGN_SCHEMA`, let go after `DESIGN_DEADLINE_MS` — 240 s) answers per room: furniture picks,
   floor, wall, up to three decor intents, a note — in the person's language. `validateProposal`
   keeps only what was offered — and no tiled field (`tile`) in a bathroom or a toilet: their walls
   are tiled as their wall finish already, so a field over them was the tiling twice (the prompt
   says so too). The flat is then laid out by **`generateScene`**
   (`lib/design/generateScene.ts`) — the function the browser's store runs for `generate`, from the
   same seed (the job's), so the server's flat is the one the browser would have laid out — and
   written as a design save made on the server (`designWriteColumns`: every product repriced, the
   budget worked out, the calculation's columns left alone; the versions emptied, as a generation
   does), over `baseRev` only and in one transaction with the job's stage (`writeDesignForJob`).
   It is written **not yet laid out** (`progress.generated` false): until it is checked, a page
   that opens the project waits on the style step, and the check's write is still the
   generation's own on every plan. The job is then `checking`, and the stage starts the check with
   a request of its own (`POST /api/design/ai-review` to the origin the start came in on, signed
   with `jobToken` — an HMAC of the job id under `AUTH_SECRET`, `validJobToken`), which answers at
   once. A check that cannot be started leaves the flat as laid out (`REVIEW_NOT_STARTED`).
   What `generateScene` does with the proposal: the engine lays the flat out as always, with
   the picks taken where they fit their slot (`MatchOptions.picks`), the designer's floors and walls
   over the style's draw (`withProposalFinishes`, a finish somebody chose stays), and the decor
   intents resolved against where the engine put the bed, the sofa or the TV unit
   (`proposalDecor`). A print or a mirror that would hang over built decor that covers its wall
   (slats, a slab, panels, cladding, a mural, tiles, niches — not mouldings or light lines) is left
   out (`withoutArtOverDecor`): the decor is the picture there. The other way round, such decor keeps
   off what hangs on a wall for use at its height — the mirror over a bathroom's or toilet's basin,
   the kitchen's wall cabinets (`fixturesOnWall` in `resolve.ts`; a backsplash runs under the
   cabinets): a niche goes beside the mirror, or not at all. **A niche wall is built out about
   30 cm, so it keeps off everything standing against its wall** (`floorPiecesOnWall`): one used to
   run the whole bathroom wall behind the bath and the washing machine. Thinner decor stays, and what
   stands in front of it is moved off it by its depth (`clearOfDecor`, `decorDepth`). **Tiles in a
   kitchen are its backsplash** (anchor `kitchen`): behind the run, from the worktop to the bottom
   of the wall cabinets (or 1.5 m), whatever wall was named — and so is a slab asked for behind the
   run, on the run's wall or as a band no higher than 1.8 m (`isBacksplash`; a slab floor to
   ceiling on another wall stays a feature wall). **A backsplash is as long as the run**, whatever
   width was asked: a 1.2 m strip of marble behind a 2.5 m worktop looked unfinished. Every piece records what it was centred
   on (`DecorPiece.anchor`) and follows that piece to its wall when a swap or the check moves it
   (`reanchorDecor`) — the tiles stayed on the old wall when the run was swapped onto another. When
   the piece stands at a door or a window (a desk under a window), the decor takes the nearest clear
   stretch of that wall beside it, and goes when there is none 30 cm wide: slats followed a desk onto
   the window over it. Under
   a cove's floating panel (12 cm down, 15 cm in from the walls) the hanging lamps and ceiling
   points are hung from the panel (`underCeilingDecor`), not through it.
   `scene.generation` records the run.
4. **The designer checks the flat it furnished** (`runReviewStage`, in the second invocation's own
   300 s; `lib/design/aiReview.ts`): the pieces as the row holds them (their products the
   catalogue's, repriced on the design write), every one with a product and a kind the engine
   knows, and the decor. The brief describes each room as built — its walls with doors and windows, every piece
   with its product, real size and where it stands (back to which wall, how far along, hung how
   high, or free-standing) — and what **measuring the room found wrong** (`reviewFindings`): pieces
   in each other or through a wall, a piece standing off the wall it backs onto, one deeper than wide
   where that kind never is (a model turned sideways or the wrong product), a piece hung into what
   stands under it, a mirror not over the basin, a standing floor mirror in a bathroom, a nightstand
   away from the bed's head, a passage too tight (`tightSpotsByItem`), and what the owner's design
   rules say about a piece (`ruleViolations` worded by `ruleProblem`: a WC the door opens onto, a
   kitchen facing the entrance, a squeezed bed or WC, the TV too near or too far, a blocked
   radiator, a small shower, a basin's height). The brief names the style's look, palette and materials. Each piece is offered five
   alternatives of its kind that fit the room, the style's own likelier and — when the piece is in
   trouble — the ones no bigger than it six times likelier. One call (same model and settings as the
   proposal, `REVIEW_SCHEMA`, let go after `REVIEW_DEADLINE_MS` — 200 s) answers per room a note and fixes: `replace` with one of that piece's
   alternatives, or `remove`. `validateReview` keeps an item of that room, a replacement it was
   offered — applied to every piece of its set (both nightstands) — a removal only of what the room
   can do without (never the bed, the sofa, the desk, the dining table, the toilet, the basin or the
   kitchen), at most six fixes a room. `reviewedScene` → `applyReviewFixes`: a replacement
   goes where the old piece stood, its back on the same wall (`fitSwapped`), a hung one at the height
   it should hang (`settledElevation`), only if it fits; the nightstands, coffee table or desk chair
   of a replaced bed, sofa or desk move to the new one (`settledPosition`), one with no room beside it
   goes. The room's note gets the check's sentence; `generation.reviewed` counts the fixes. The flat
   is then written laid out (`progress` generated, step 5, `at` 5 — the studio is where the project
   opens) over the design stage's revision, and the job is `done` with the review on it
   (`finishFlat`). A check that fails or times out writes the flat as laid out, unchecked, the job
   `done` with its error; a design changed since the design stage is left as it is (`PROJECT_CHANGED`).
   The style step's flow guard holds while the page waits (`DesignFlowGuard` `hold`). Rate rule
   `aiGenerate` (8 starts an hour) covers both calls; the stages log `ai-generate` and `ai-review` with
   the job id, tokens, cost and the number of fixes. **Besides replacing and removing, the check
   moves**: `to_wall` (back against the wall behind a piece, or the nearest), `move_to_wall` (against
   wall N, as near its middle as it stands well — clear of windows if tall, `blocksWindow`, and of
   doorways, `inDoorway`), `remove_decor` and `decor_to_wall` (a decor piece fitted again on wall N).
   The brief lists every decor piece with its id, wall, size and depth, and the findings now include a
   tall piece in front of a window, a piece standing in decor, decor something stands in, and a
   kitchen backsplash away from the run; a piece's back against its own wall is no passage. After the
   fixes: the pieces placed off a replaced or moved bed, sofa or desk stand by it again, the chairs
   round a replaced table are seated round it (`reseatChairs` — a chair stood 1.3 m from a new bistro
   table), decor follows its piece, and the room is tidied (`settleToWalls`, `clearOfDecor`).

**Two invocations, because of the 300 s.** Work in `after()` counts towards the function that
answered, from the request's start; the designer (one to two minutes, longer for a big flat or a
slow answer) and the check (about 40 s) together run too close to Vercel's 300 s to share one. Each
stage has its own function and its own deadline inside it.

**What fails, and what then.** The designer failing — an error, a refusal, an answer that does not
validate, the deadline — is the engine's flat, laid out by the design stage in the same write, no
decor, the job `done` with the error (`generation.by` `engine`; the run still counts against the cap,
it was billed). A job whose function died stays in its stage; past `JOB_STALE_MS` (6 minutes — a
stage's function lives 300 s at most) it is **settled the next time it is read** (`settleStaleJob`,
from the page's status call or the next start; claimed by its `stageAt`, so two readers settle it
once): dead while `checking`, its flat is written laid out, unchecked (`REVIEW_TIMEOUT`), and the
page reads it again; dead while `designing`, nothing was written, the job is `failed` (`TIMEOUT`) and
the page lays the flat out with the engine. Every way a job cannot start — no key, the cap, the design
changed, the server unreachable — is the engine's flat in the page, at once, as before the designer
existed. **The plan's locks** hold for the job's writes: each is checked with `refusedSceneChange`
against the design stored, with none of the studio's features (a generation over a flat not laid out
passes on every plan), and with the account's own plan otherwise.

**The structured output's limit.** A schema may hold at most 16 nullable (union-typed) fields;
`DESIGN_SCHEMA` has none: "the default" is a sentinel (0, -1, "", "auto"), read back by
`validateProposal`. An enum cannot sit beside a nullable type either.

**Measured** (16 Oct 2026, projects #311 and #300, five rooms): 57–76 s, about 20k input and
5.5–7.3k output tokens, $0.21–0.23 on Claude Opus 5.5 (the system prompt's ~4k tokens cached for
the next run). The route logs every run's tokens, cost and seed (`ai-generate`).

## Known gaps

- A decorative piece (slats, a panel, mouldings…) cannot be added by hand in the studio — it is
  moved, resized, re-materialled or removed; with no key there is none at all. Joinery and boxes are
  added from their furniture's card.
- A housing follows its furniture on release, not live during the drag; the 2D board neither draws
  decor nor keeps furniture out of joinery.
- A cabinet's sections cannot be added, removed or re-ordered on its card (they are resized with
  the piece).
- No labour line for fitting decor: the materials are bought, the installation is not priced.
- A cove needs a rectangular room; niches and fields do not check a socket or a radiator on their
  wall (the rules module of [ai-layout-plan.md](ai-layout-plan.md) is not written).
- The model's furniture choices are product picks for the engine's slots (the plan's phase 1); it
  does not yet decide the room program or the walls the furniture stands against.
- No evaluation set yet: the model and the prompt are not compared against the engine on fixed plans.
- The check reads the flat as measurements, not as a picture: a model that faces the wrong way while
  its size looks right (a washing machine turned to the wall) is invisible to it — the library's
  facing was audited once instead ([../3d-assets.md](../3d-assets.md#facing)).
- The decor 3D is checked in the studio by eye; the walk-through shows it best.
- The overlay's steps within the designing stage are paced by time (one every 7 s), not by the
  designer's progress: one call answers the whole flat.
- The check is started by a request from the server to the origin the start came in on. Locally
  `http://renovate.localhost:3000` (the Flitt test origin) may not resolve inside Node: the check
  then does not start and the flat opens as laid out.
- A job started and then left (another step opened, a change saved there) writes nothing, but the
  run is billed and counted against the cap.
