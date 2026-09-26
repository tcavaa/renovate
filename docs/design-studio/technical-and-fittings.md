# Technical setup, fittings, radiators, doors and windows

Everything in the flat that is not furniture or a finish: technical points (water, drains,
panel, gas, radiators, AC, extractors, boiler, heating pipe) and the works checklist on step 3;
sockets, switches and lights (the electrical layer); radiators bought by the section; doors and
windows as editable openings and as products. Read this before touching
`lib/design/technical.ts`, `autoTechnical.ts`, `technicalRates.ts`, `electrical.ts`,
`radiators.ts`, `openings.ts`, `lib/design3d/buildStructure.ts`, the fitting/opening cards, or
the technical step.

Related: [overview.md](overview.md) (step order: the technical step moves for renovations;
what the flat already has) · [plan-board.md](plan-board.md) (points and openings on the board)
· [3d-engine.md](3d-engine.md) (models in 3D) · [../budget.md](../budget.md) (how they are
priced) · [../3d-assets.md](../3d-assets.md) (`models:fixtures`, `models:radiators`,
`models:photos`) · [../calculator.md](../calculator.md) (phases and labour keys).

## Key files

| File | Responsibility |
|---|---|
| `lib/design/technical.ts` | `TECHNICAL_KINDS`, `technicalElevation`, `WORK_ITEMS` / `WORK_STAGES` / `normalizeWorks`, `effectivePhases`, `technicalAnchors`, `technicalSuggestions` |
| `lib/design/autoTechnical.ts` | `suggestTechnical` — water, drains, extractors, gas, AC, one panel and one boiler placed by a fitter's rules (the technical step's button; `origin: 'user'`) |
| `lib/design/existing.ts` | what the flat already has (`EXISTING_KEYS`, `defaultExistingForHomeState`) — [overview.md](overview.md#what-the-flat-already-has-libdesignexistingts) |
| `lib/design/technicalRates.ts` | estimate prices and labour keys: `ELECTRICAL_LABOUR` (`electric_point`), `TECHNICAL_RATES` (`plumbing_install`, `radiator_mount`, `heating_piping`, `ac_install`, `extractor_install`), `OPENING_ESTIMATE_GEL`, `ENTRANCE_DOOR_GEL`, `TRIM_INSTALL_DEFAULT_GEL` |
| `lib/design/electrical.ts` | sockets, switches, lights: `suggestElectrical`, `placeElectrical`, `reprojectElectrical`, `slideAlongWall`, `fittingClashes`, fixture products (`FIXTURE_PRODUCT_KIND`, `withFixtureProducts`, `fixtureCandidates`, `fixtureQuantity`) |
| `lib/design/radiators.ts` | sections per room, `suggestRadiators`, radiator products (`withRadiatorProducts`, `radiatorCandidates`) |
| `lib/design/openings.ts` | doors and windows: move, update, remove, add, twins (`alignTwins`, `mirrorHinge` / `mirrorSwing`, `leafOnOtherSide`), `moveOpeningToWall`, products (`openingProductKind`, `withOpeningProducts`, `openingCandidates`) |
| `lib/design/planGeometry.ts` → `deriveOpenings` | doors inferred for a plan read by the CV parser ([plan-reading.md](plan-reading.md)) |
| `lib/design3d/buildStructure.ts` | fittings (`buildElectrical` / `buildFitting`), radiators (`buildRadiators`), `lightsFrom` |
| `lib/design3d/buildScene.ts` → `buildOpeningTrim` / `attachOpeningModel` | door and window models in their holes |
| `lib/design3d/fixtureManifest.ts`, `radiatorManifest.ts` | the generated model lists (`FIXTURE_MODELS`, `RADIATOR_MODELS`) |
| `components/studio/FixturePanel.tsx`, `OpeningPanel.tsx` | the selected fitting's and opening's cards |
| `components/plan/ElementInspector.tsx`, `components/plan/icons.ts` | editing a point or opening on the board; one icon per system |
| `app/(main)/design/[id]/technical/page.tsx` | step 3: kinds as tiles, existing ticks, works checklist, radiators |

## Technical setup (`lib/design/technical.ts`), electrical (`lib/design/electrical.ts`)

Technical points (`water_supply`, `sewer`, `floor_drain`, `electrical_panel`, `gas`,
`radiator`, `ac_unit`, `extractor`, `boiler`, `heating_pipe`) live in `plan.technical` with
the works checklist (`WORK_ITEMS`, keyed to the calculator's phases; `effectivePhases`
replaces the home state's phase list when works are ticked — `calculateMaterials` /
`calculateWorkerCosts` / `buildProjectSummary` take the override as their last argument).
`technicalAnchors` feeds the layout engine (`LayoutOptions.anchors`): a fixture scores up
to +40 for standing near the point it needs, and a kitchen run takes the wall the water
comes to; `LayoutOptions.obstacles` keeps furniture off the columns. `technicalSuggestions`
is the hint list on step 3 (a toilet, shower or bath far from the sewer; a sink, kitchen run
or washer more than 2.2 m from the water; a bathroom with no floor drain or sewer; a radiator on
an interior wall; no extractor in a bathroom or toilet). `suggestTechnical`
(`lib/design/autoTechnical.ts`) places the water, drains, extractors, gas, air conditioning, one
panel and one boiler by a fitter's rules at a click, all `origin: 'user'`. The step offers the kinds as a grid of icon tiles that is always
on screen (`components/plan/icons.ts` is the one icon per system, shared with the toolbar
and the inspector): a tile arms the point tool with that kind and stays armed until it is
clicked again, and a click on a point already placed picks it up instead of stacking
another. The works checklist is four collapsible groups by the stage the works take the
house through (`WORK_STAGES`: old renovation → black frame, black → white frame, white →
green, green → moving in), each with an all / none toggle.

Sockets, switches and lights are `scene.electrical` (`ElectricalPoint`: kind, wall +
position, height, outlets, on/off, a lighting `category`). `suggestElectrical` places them
from the furniture with the usual heights — 45 cm sockets, 60 cm bedside, 115 cm above a
90 cm worktop, 170 cm high sockets, 105 cm switches by the handle side of every door, one
main light per room — and keeps every point that is not `'generated'` (the person's and the
existing ones), skipping entirely any room that holds one; `generate` re-runs it with the
person's points. `placeElectrical` snaps a hand-placed point to the nearest wall; `reprojectElectrical`
follows moved walls; `slideAlongWall` moves one along the wall it is on (the card's
slider and its 5 cm nudges).

**Two fittings may not hold the same piece of wall** (`fittingClashes`). The rule is about
plates, not points: two argue only when their footprints overlap *both* along the wall and
in height, so a switch at 105 cm still sits directly above a socket at 45 cm while two
sockets a centimetre apart do not. A bought fitting is measured by its real `sizeM`, an
estimate by the plate it would have (`fittingFootprintM`: a double socket twice a single's
width, a strip as long as it was drawn); two on different walls are measured across the
room, which catches the pair that meet inside a corner. Placing, dropping and dragging all
go through it, and a refusal raises the studio's banner rather than looking like a click
that did nothing. Before this a socket dropped on a socket went in regardless — the second
plate sunk inside the first, invisible, unselectable, and paid for twice in the budget.

**A technical point's height can depend on its room** (`technicalElevation`). Every kind
has one usual height — a socket is a socket whatever the ceiling — except the air
conditioner, which is hung from the ceiling down: `technicalElevation('ac_unit', room)` is the
ceiling less the fitter's `AC_CEILING_GAP_M` (18 cm, the middle of the 15–20 cm rule) and the
unit's own `AC_UNIT_HEIGHT_M` (30 cm), floored at `AC_MIN_ELEVATION_M` (1.8 m) so a low ceiling
does not bring it to head height (`TECHNICAL_KINDS.ac_unit.defaultElevationM`, 2.1 m, is only
the fallback with no room). Placing a point takes that height, and so does re-kinding one —
a socket turned into an air conditioner used to stay at 45 cm off the floor. It stays
editable, and the inspector says where the number came from. The unit is not drawn in 3D
yet: there is no model for it, and the radiators are the precedent for writing one
(`scripts/radiator-models.ts`, in code, no download).

**Every fitting is a product**, like every piece of furniture. `FIXTURE_PRODUCT_KIND` maps
a point's kind to the `model3dKind` a product carries — the four socket kinds are one
`socket` product (a double socket is two of it, `fixtureQuantity`), `switch`, `socket_tv`,
`socket_data`, and one kind per light — and `withFixtureProducts` / `withFixtureProduct`
give a point the catalogue's best product of that kind (`fixtureCandidates`: the style's
first, the cheapest next) as a `SceneProduct` with its size (`sizeM`). The store attaches
them wherever points are made or re-kinded (`addElectricalPoint`, `suggestElectrical`,
`generate`, `changeElectricalKind`) and `setElectricalProduct` swaps one; a point whose
kind has no product yet stays an estimate (`ELECTRICAL_MATERIAL_GEL`). The budget prices a
bought fitting as a real line (`product-<id>`, folded across points) and the rest by kind;
the electrician's labour is per point either way. The admin product form offers the
fixture kinds (⚡) next to the archetypes; `FIXTURE_CATEGORY_SLUGS` (sockets & switches,
lighting) are part of the design catalogue, and `pnpm models:seed` writes one product per
entry of `public/models/fixtures/manifest.json` that carries a `product` (photo from the
source, store Lumina). The furniture shelf leaves fixture kinds out (`isFixtureProductKind`).

In 3D each point is one group standing at its spot (`buildFitting`) holding a model and
nothing else: the product's own model when it has one (a file under `/models/fixtures` is
framed as a fixture already — back on the wall, top on the ceiling — and anything else, a
partner's upload, is scaled to `sizeM` and turned to the wall by `reframe`), else the
kind's default from `public/models/fixtures` (the first entry of `FIXTURE_MODELS` with that
kind: the EU socket, the switch, the industrial wall lamp, the bulb on a cord, the flush
spot, one photoscanned tube for the strips, stretched to the point's length). **Nothing in
the studio is drawn by hand any more** — no plates, roses, cords, rings or bars — so the
group is empty for the beat the file takes to arrive; the same goes for doors and windows
(below). A double socket is two of the same plate side by side; a ceiling point under a
hanging lamp from the catalogue shows only the rose (`role: 'rose'`, a flush light); the
ghost that rides on the pointer while a fitting is dragged in is the same model in one
translucent material; a light that is on has the materials named for the light (`light`,
`lamp`, `bulb`, `glow`, `led`, `tube`, `shade`, `emiss`) glowing, copied for that instance so the
cached file's materials stay untouched. `pnpm models:fixtures` writes the files from Poly
Haven (CC0: the industrial wall lamp and sconce, the glass globe pendant, the fluorescent
tube) and poly.pizza (Quaternius, Kenney and reelpersen CC0, the rest CC-BY 3.0 credited in
the manifest: two sockets, two switches, a brass sconce, a pendant, a disc lamp, the flush
light that is both the rose and the recessed spot, a square spot) — two or three products
per kind so the card has something to swap to — and `pnpm models:photos` renders each
one's product photo from the model itself (a transparent PNG under `uploads/furniture`,
lit and framed like the studio; the sources' own thumbnails sit on garish gradients). The lights that
are on become point lights (`lightsFrom`; at night they replace the per-room lamps). With
one room in focus, the other rooms' fittings, lights and tight-passage outlines are left out
along with their furniture. The selected fitting's card in the studio (`FixturePanel`) is
the furniture card's twin: photo, price and shop (or the estimate), the kind as a dropdown,
height with presets, the slider along the wall, outlets, on/off, and "შეცვალე პროდუქტი" —
every product of that kind — in the drawer along the bottom.

## Radiators are bought by the section (`lib/design/radiators.ts`)

A radiator is a `technical` point of kind `radiator` that carries a product, and the product
is **one section**: `pnpm models:radiators` writes four designs (a steel panel module, an
aluminium sectional, a cast-iron column, a classic), each a single section framed exactly one
pitch wide with its back on z = 0, and the 3D view repeats it along the wall (`buildRadiators`).
How many sections is arithmetic, not a guess: ~100 W per m² at a 2.7 m ceiling, a fifth more
in a room with two outside walls (`outsideEdges`, from the wall pieces), divided by the
product's `wattsPerSection`, then shared between the radiators in the room and kept between
4 and 14 — above 14 the far end runs cold and the card says to add a second. The technical
step shows the demand per room and hangs radiators at a click (`suggestRadiators`: as many
as the room's sections call for — `ceil(sections / 14)`, at least one — under its widest
windows and never more than it has windows, on the longest outside wall when it has none;
rooms that already have one, unheated rooms (balcony, storage, closet) and rooms under 3.5 m²
are skipped). They are marked `origin: 'user'` because the person asked for them, so a
finished home still costs them. The budget buys the sections and charges `radiator_mount` per
radiator — on the radiator's own line, or inside the heating phase (2) when that phase runs.

## Doors and windows are editable (`lib/design/openings.ts`)

In the studio's **build** category, with the structure unlocked, every door and window wears a
translucent slab, and dragging a slab slides the opening along its wall (the trim moves live;
the wall's hole follows when the plan commits on release). The selected opening's card
(`OpeningPanel`) and the inspector do the rest. An interior door is two openings, one per
room, because each room builds its own wall; `moveOpening`/`updateOpening`/`removeOpening` keep the twin in step, and `addOpening`
cuts a twin when the chosen wall is shared (and refuses a window there). Writing these tests
found a real bug in `deriveOpenings`: the shared run is measured in plan order but applied in
id order, so when the two disagreed each door landed on the wrong wall of its room.

The same editing exists on the 2D board (`PlanEditor`, see [plan-board.md](plan-board.md)): a press
on a door or window starts a drag that can end along the same wall (`onMoveOpening`) or on
**any wall of any room** (`onMoveOpeningToWall` → `openings.moveOpeningToWall`, which slides
when the wall is the same or its twin's copy and otherwise cuts the opening out and in again
with its size kept, so it gets a new id); the door and window tools drop new openings on the
nearest wall (`nearestWall`: inside a room, the nearest of that room's walls; outside every
room, the nearest wall within reach); a window let go on a shared wall is refused and the
page says so.

**The two halves of an interior door describe one leaf.** Each room's edge runs the other
way along the shared wall, so the jamb that is `hinge: 'left'` from one room is `'right'`
from the other, and a leaf that swings `'in'` to one room swings `'out'` of the other.
`addOpening` and `deriveOpenings` write the twin mirrored (`mirrorHinge`/`mirrorSwing`),
the store's `updateOpening` mirrors an edited hinge or swing onto the twin, `alignTwins` (run by
`ensureWalls`, so every plan taken in is put right) repairs plans from before, and the half
whose swing is `out` draws no leaf in 2D or 3D (`leafOnOtherSide`) — its twin, swinging
into the room the door opens into, does. Before this both halves hung "left" (the opposite
corners) and both swung "in", and one door showed two leaves. The `ElementInspector` edits the selected opening — width, height, sill,
material, hinge side, swing direction, the open angle shown in 3D — and offers a door, a
window or a plain opening on the selected wall.

**In 3D, `hinge: 'left'` is the jamb at `edge.a` and `swing: 'in'` goes to local +z**, the
same as the 2D board draws them. `edge.facing` puts local +x along the edge towards
`edge.b`, so the left jamb is the pivot at −w/2 and the leaf turns by −angle to come into
the room. The first 3D leaf had both signs the other way — hung from the b-end and
swinging out of its room — and matched the board only by accident of symmetry;
`scratchpad`-style checks with three.js (`pivot.updateMatrixWorld`, then the leaf tip's z)
are the quickest way to be sure of any change here.

**Every door and window is a product**, like every fitting (`lib/design/openings.ts`,
"Doors and windows as products"). `openingProductKind` maps an opening to the
`model3dKind` a product carries — `door`, `entrance_door` (a door on an exterior wall),
`window`; an archway buys nothing — and `withOpeningProducts` gives every door and window
without one the catalogue's best (`openingCandidates`: its own kind first, the style's
before the rest, the cheapest within that), the same product on both halves of an interior
door. The store attaches them in `generate`, `addOpening` / `dropOpening` and
`updateOpening` (a change of kind drops the product and takes one of the new kind), the
studio's `ensureOpeningProducts` fills in the rest once the catalogue is in (a saved design
from before, a door dropped on the 2D board), and `setOpeningProduct` swaps one on both
halves; `alignTwins` keeps twins agreeing on the product too. An opening keeps its product
across `moveOpeningToWall`. The budget prices a bought door or window as a real line
(`product-<id>`, a pair counted once, folded across openings) and the rest as estimates
(`openingEstimate`). The admin product form offers the three kinds (🚪) next to the
archetypes; `OPENING_CATEGORY_SLUGS` (doors, windows) are part of the design catalogue;
the furniture shelf leaves them out (`isOpeningProductKind`).

The studio's card for a selected door or window (`OpeningPanel`) is the fitting card's
twin: photo, price and shop (or the estimate), the kind as a dropdown, width and height,
the sill of a window, hinge, swing and open angle of a door, the material only while it is
an estimate, and "შეცვალე პროდუქტი" in the drawer along the bottom. The structure lock
keeps the hole (kind, size, sill, deletion); what fills it stays editable.

In 3D (`buildOpeningTrim` → `attachOpeningModel`) an opening holds a model and nothing
else — the product's, or the manifest's default for its kind (`FixtureModel.role`: the
white flush door, the two-leaf window, and Kenney's open doorway as the casing of an
archway and of a bare leaf) — stretched to the opening's width and height (its depth in
proportion, never much more than the wall); the hole is bare for the beat the file takes
to arrive. The only thing drawn by hand is the translucent slab the openings mode uses as
a handle. `pnpm models:fixtures` frames a door or window centred on the opening, standing
on y = 0, centred in the wall with the room side along +z, and sorts a door into the nodes
`leaf` (hung from x min — `hinge: 'left'`) and `frame`, or `body` for a window or a door
kept as one piece: a source that keeps its parts apart is split by node name, a welded one
by the triangles whose centre lies in an inner box (`leaf: { box }`), a bare leaf (Kenney's
doors) is `leaf: 'all'` and gets the default casing around it at runtime, sized to the
inside of the jambs, and a leaf that hangs from the right in the file is mirrored
(`mirror: true`). **A box rule has to start above the threshold.** The three Quaternius
doors (`door-nordic`, `door-flat`, `entrance-door-classic`) are one welded mesh whose
threshold — a strip the frame's full width, 2.5 cm high — lay inside a box that began at
`y: 0`, so it was sorted into the leaf: the leaf's bounds became the frame's, the runtime
hinge (x min of the leaf) stood at the frame's outer edge 3 cm off the leaf's own, and the
open door showed a gap at its jamb with the threshold swinging out with it. The boxes start
at 1.2 % of the height now (check a re-run's result: the leaf's x extent must be inside the
frame's). What remains is the models' own low-poly shape — the casing is a flat trim on
the wall faces rather than a lined reveal, and the leaf is nearly as deep as a wall — which
only another model fixes. The studio re-hangs the leaf on a pivot at its jamb (the scale on a
group around the leaf, under the pivot, so turning it does not shear it — gotcha 19 in
[3d-engine.md](3d-engine.md)), turns it by the open
angle, and mirrors the whole model for a right-hinged door. Of an interior door's two
halves only the one that draws the leaf places the model, of an archway's the room that
sorts first — except in a single-room view, where the half that is shown draws it
(`twinShown`). Doors: Quaternius (oak with frame, white panelled, white flush, dark
classic entrance, white glazed metal entrance), Kenney (country leaf, red glazed
entrance), Wesley Thompson's classic white (CC-BY); windows: Quaternius two-leaf and grid,
Justin Randall's wooden four-pane (CC-BY), Google's square (CC-BY). All sold by Domus
Interior at made-up prices.

## Tests

`tests/unit/design/technical.test.ts`, `autoTechnical.test.ts`, `electrical.test.ts`,
`radiators.test.ts`, `openings.test.ts`, `budget.test.ts` (points, doors and fittings priced,
existing), `tests/integration/save-routes.test.ts` (forged door, socket and radiator prices are
refused).

## Known gaps

- Estimates for pipes and air conditioning (`lib/design/technicalRates.ts`) are market
  averages, not products. Doors, windows, sockets, switches, lamps and radiators are
  products now, and fall back to the same estimates only where the catalogue has none of
  their kind. A radiator's *sections* are counted from the room's heat demand, which is a
  rule of thumb (~100 W/m²) and not a heat-loss calculation: no window area, no glazing, no
  storey, no outside design temperature. A heating engineer's numbers would want all of them.
- The four radiator designs are ours, written in code (`scripts/radiator-models.ts`), not a
  manufacturer's range: the watts per section are plausible, the prices made up. Kitchens are
  measured at `KITCHEN_RATES`, which are Tbilisi averages rather than a joiner's quote, and
  only the run and the island are measured — a fitted wardrobe is still an off-the-shelf
  product.
- The air conditioner is not drawn in 3D: there is no model for it yet
  (`scripts/radiator-models.ts` is the precedent for writing one in code).
- A window with no product falls back to nothing — see [../3d-assets.md](../3d-assets.md#known-gaps).
