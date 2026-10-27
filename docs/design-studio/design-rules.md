# Interior design rules (the brief, and how the app follows it)

The owner's "Interior Design Rules Brief" (technical rules, layout rules, practical sizes and the
four styles) turned into what the app does. `lib/design/rules.ts` holds every number of the brief
in one place; the engine, the fittings, the technical points, the AI designer and the warnings all
read them from there. Read this before changing a height, a clearance, a placement rule or the
rule warnings.

Related: [technical-and-fittings.md](technical-and-fittings.md) (sockets, switches, radiators,
the boiler, water) · [layout-and-matching.md](layout-and-matching.md) (the layout engine) ·
[decor.md](decor.md) (the AI designer and its room check) · [finishes.md](finishes.md) (ceilings)
· [ai-layout-plan.md](ai-layout-plan.md) (the rules module was its phase 0) ·
[../budget.md](../budget.md).

## Status

The brief was built in five stages, each tested, documented and committed on its own:

| Stage | What | State |
|---|---|---|
| 1 | `rules.ts` (the numbers and the first checks), sockets and switches, radiators, the boiler's room | **built** |
| 2 | hot and cold water: two point kinds, a pair at every fixture; the sewer as the plumbing shaft | **built** |
| 3 | layout rules: WC not facing the door, bed out of the door's sight, wardrobe in a niche, kitchen out of the entrance's sight, the practical sizes, door widths, warnings in the studio | **built** |
| 4 | gypsum and stretch ceilings lower the room, the LED cove's sizes, the wall-hung WC's gypsum box, the boiler's ventilated cabinet (priced by material, like kitchens) | **built** |
| 5 | light colour by room (3D and lamp choice), the four styles' guides for the AI designer and the matcher, warnings on the plan PDF and in the AI's room check | **built** |

## The decisions (owner, 28 Oct 2026)

**Part 1 — technical**

- **Radiators**: bottom 12 cm off the floor (`RADIATOR_FLOOR_GAP_M`), 4 cm off the wall
  (`RADIATOR_WALL_GAP_M`), their top at least 10 cm under the sill (`RADIATOR_SILL_GAP_M`). Each
  radiator takes the tallest radiator product that fits under its window; a window too low for any
  (a floor-length window) gets its radiator on the nearest stretch of the same outside wall beside
  it. The layout keeps furniture out of a strip in front of every radiator
  (`RADIATOR_KEEP_CLEAR_M`). Curtains stay floor-length, hung from just under the ceiling.
- **Boiler**: on an outside wall, in a utility (storage) room with an outside wall, else the
  balcony, else the kitchen, else the bathroom; a ventilated cabinet around it — a joinery line
  priced by material per m² of façade, the materials catalogue products the admin edits (like the
  made-to-measure kitchen), its size the boiler's plus 10 cm round; service access kept in front
  ([technical-and-fittings.md](technical-and-fittings.md#equipment-is-bought-one-per-point-libdesignequipmentts)).
- **Kitchen sockets**: the run is one piece, so the app assumes a standard order
  (`kitchenRunZones`): the sink at the end nearer the water (or the drain), the dishwasher beside
  it, the hob and the oven under it towards the middle, the hood over the hob. Worktop sockets at
  105 cm (`KITCHEN_SOCKET_M`, 100–110): three doubles — the prep zone between sink and hob, the
  coffee/kettle zone past the hob, one extra — kept off the sink and the hob. Low (30 cm) sockets
  behind the dishwasher, the oven and the hob's ignition; the hood's at 215 cm over the hob; one
  in the wall cabinets for the under-cabinet LED; the fridge's at 40 cm. An island's sockets are
  not placed (no wall to put them on — roadmap).
- **Other sockets**: general 45 cm. Bedside: with a nightstand on that side, 10 cm over its top
  within 45–75 cm; without one, 35 cm. TV 110 cm. Desk: 10 cm over the desktop.
- **Switches**: 105 cm, 20 cm from the opening's edge (about 15 cm from the frame) on the
  handle side. **Two-way** (`switch_two_way`): in a bedroom the door's switch and one by the bed
  on each side of a double bed (one by a single bed, on its open side); a hallway 4 m or longer
  gets a two-way pair at its two ends. Bought as their own product kind; an estimate until the
  catalogue has one.
- **Water** (წყალმომარება): cold water (blue) and hot water (red) as two point kinds
  on the technical step; the automatic placement puts them at every fixture — kitchen sink 🔵🔴,
  dishwasher 🔵, WC 🔵, basin 🔵🔴, bidet 🔵🔴, shower 🔵🔴, bath 🔵🔴, washing machine 🔵, boiler
  🔵 in + 🔴 out (hot on the left, cold on the right). Each is a plumbing point in the budget.
  The sewer point stands for the plumbing shaft: WC, the kitchen's sink end and the washer are
  drawn to it (the layout's anchors already pulled them), with a warning past 2 m
  (`far_from_shaft`). How it is placed: [technical-and-fittings.md](technical-and-fittings.md).
- **Ceilings**: a gypsum ceiling lowers the room 10 cm (3D and every height that
  hangs from the ceiling), a stretch (barisol) one 3 cm; the LED cove: 12 cm drop, a 15 cm niche,
  the strip 5 cm back from the edge. Curtains hang from just under the ceiling.
- **Wall-hung WC**: a gypsum box 20 cm deep behind it, half height (~1 m, its top a
  shelf) by default or to the ceiling (a choice on its card), finished in waterproof paint or
  tiled — the design's choice — priced by its plasterboard and its tiles, like the rest of the
  decor ([decor.md](decor.md), the `box` family).

**Part 2 — layout** (how the engine does it: [layout-and-matching.md](layout-and-matching.md#the-design-rules-in-the-layout-libdesignrulests))

- The WC never faces the door when any other spot fits; in a room too small for that it may, with
  a warning.
- The bed out of the door's line of sight, and a wardrobe in a niche (60 cm deep, or a shallow
  35–40 cm one) — preferred, never forced, no warning.
- The kitchen run prefers a wall out of the entrance door's sight; a warning when the only wall
  that works faces it.

**Part 3 — sizes**: the layout places by them and a check flags a room breaking
them — paths 100 cm, door swings that collide, doors 80 cm (70 cm for a bathroom or toilet; new
doors take these widths), the kitchen triangle, 120 cm between facing counters, wall units 55 cm
over the worktop, 60–70 cm beside a bed, wardrobes 60 (or 35–40) cm deep, sofa to TV 2.5–3.5 m,
coffee table 42 cm from the sofa, TV centre 105 cm, dining 75 cm high with 60 cm a person, a
shower at least 80×80, the WC's centre 40 cm from a side wall, the basin's top 85 cm, bathroom
sockets IP44 and out of the splash zones. Light at 2700–3000 K in living rooms and bedrooms,
3500–4000 K in kitchens and offices (`roomLightK`: the 3D night light and the fittings' glow, and
lamps whose `specs.cct` is in range preferred — [technical-and-fittings.md](technical-and-fittings.md)).

**Part 4 — styles** (`lib/design/styleGuide.ts`): the app's four styles are the brief's four. Each
has the brief's guide (`STYLE_GUIDES`: look, palette, materials, lighting, furniture, kitchen,
walls, the colour families of its palette, its material words, and its sub-styles — Scandinavian
one; industrial urban, loft and concrete minimal; modern contemporary and mid-century; vintage
traditional, French country, farmhouse and bohemian). The AI designer is given the guide and the
flat's sub-style (`subStyleFor`: the one the style test's answers point to by each sub-style's
`cues`, drawn when the plate was picked), the AI's check the style's look; the matcher weights a
product up for a colour of the palette and a material of the style (`guideFit`).

**Where the warnings show**: the technical step's hints (the building's, `TECHNICAL_RULES`), the
studio's pill and list for the room in focus (`RuleWarnings`), the AI's room check (each piece's,
in English — `ruleProblem` into `reviewFindings`' PROBLEMS) and the foot of the plan PDF
(`ruleNotes`).

## The rules module (`lib/design/rules.ts`)

- The brief's numbers as named constants, each with the range it came from. A leaf module (plan
  geometry and types only), so the fittings, the technical points and the radiators all import it.
- `kitchenRunZones(room, run, points, items)`: where the sink, dishwasher, hob and oven are taken
  to stand along a kitchen run (metres along its wall, and world points) — shared by the run's
  sockets (`electrical.ts`) and its water, waste, gas and hood (`autoTechnical.ts`), so they agree.
  A run under 2.1 m has no dishwasher.
- `WATER_NEEDS` (what each fixture is fed and at what height), `KITCHEN_SINK_WATER`,
  `DISHWASHER_WATER`, the pair's spacing, `SHAFT_FIXTURES` and `SHAFT_MAX_DISTANCE_M`.
- `minDoorWidthM(type)` and `doorWidthFor(type, other)`: a new door is 80 cm, 70 cm when either
  room is a bathroom or toilet, 90 cm to the outside (`addOpening`; `deriveOpenings` too).
- The layout's numbers (`BED_SIDE_FREE_M`, `SOFA_TV_M`, `COFFEE_TABLE_GAP_M`, `TV_CENTRE_M`,
  `DINING_SEAT_M`, `FACING_COUNTERS_M`, `WALL_UNIT_BOTTOM_M`, the wardrobe depths, `SHOWER_MIN_M`,
  `WC_SIDE_M`, `BASIN_TOP_M`, `SPLASH_ZONE_M`) and the geometry they need: `footprintQuad`,
  `quadsOverlap`, `rayToPolygon`, `doorSightBand` / `roomSightBands` / `entranceSightBands`,
  `roomNiches`.
- `backWallOf`, `alongWall`.

## Ceilings (`lib/design/ceiling.ts`)

- **When.** A full renovation whose works — the ticked ones, else the home state's — include the
  ceiling (phase 12): 10 cm for plasterboard, 3 cm for a stretch ceiling (`choices.ceiling`), none
  for a design-only project or works without the ceiling (`ceilingDropFor`). A balcony gets none.
- **Where it is kept.** On the plan, `plan.technical.ceilingDropM` (saved, validated by
  `technicalSetupSchema`), so one number is read everywhere: `ceilingHeightM(room, plan)`, and
  `underCeiling(room, plan)` — the room with the ceiling's height as its `heightM` — for code that
  measures to the ceiling from a room alone. The store keeps it in step (`keepCeiling` in
  `store/designStore.ts`: a subscription that runs `withCeiling` when the plan, the mode or the
  home state changes — the works and the choice are on the plan), and `withCeiling` hangs again
  what hung from the old ceiling: ceiling lights at the new height, a pendant from it, a curtain
  run from 3 cm under it, an air conditioner still at its usual height. Walls, paint and the
  estimate's wall areas stay the slab's (`room.heightM` is the structure).
- **Who reads it.** The 3D ceiling plane (`buildScene`), the fittings and the night lights
  (`buildStructure`), new ceiling lights (`suggestElectrical`, `standardElectrical`,
  `placeElectrical` given the room under its ceiling), an air conditioner's height
  (`technicalElevation` — the technical points, the inspector, the 3D), the generation's layout and
  matching (pendants, curtains: `generateScene` lays out the rooms under their ceilings), and the
  decor — floor-to-ceiling decor stops at the new ceiling and a cove hangs from it (`buildDecor`,
  the budget's `decorPurchases`, the decor card, `proposalDecor`, `underCeilingDecor`, the check's
  moves).
- **The cove** (`fitLight`): its panel's edge `COVE_GAP_M` (15 cm) off the walls and `COVE_DROP_M`
  (12 cm) under the ceiling, the strip `COVE_STRIP_BACK_M` (5 cm) back from the edge.

## The checks (`lib/design/ruleChecks.ts`)

- `ruleViolations(plan, items, electrical?)`, each `{ code, roomId, itemId?, pointId?, openingId?,
  valueM?, limitM? }` — the building's (`TECHNICAL_RULES`, listed on the technical step) and the
  furniture's (all of them in the studio's pill, `RuleWarnings`): `radiator_blocked` (a piece standing in the strip in front of a radiator, lower than
  its top; a curtain or a rug does not count), `radiator_under_sill` (a radiator's top within
  10 cm of its window's sill), `boiler_not_exterior` (its nearest wall is not an outside one),
  `door_too_narrow` (an interior door's two halves — found as two rooms' doors at the same spot —
  measured once, against the more lenient room; a half not twinned yet finds the room behind it
  through the wall), `door_swing_clash` (two leaves' squares overlap in the room they open into),
  `door_swing_blocked` (a piece in a leaf's square), `wc_faces_door`, `kitchen_faces_entrance`,
  `bed_side_tight` (under 60 cm beside a double bed's foot half, to a wall or a piece that is not
  a nightstand), `sofa_tv_distance` (sofa centre to the TV unit's back, outside 2.5–3.5 m),
  `counters_too_close` (island to run under 120 cm), `shower_too_small` (under 80 cm),
  `wc_side_tight` (the WC's centre under 40 cm from a wall or a piece either side),
  `basin_height` (a bathroom basin's top more than 7 cm off 85 cm), `socket_in_splash` (a socket
  within 60 cm of a shower or a bath). Worded by `components/design/ruleText.ts`.
- `radiatorKeepouts(plan)`: the strips (the radiator's length plus 5 cm each end, its depth plus
  30 cm) as boxes per room, which `generateScene` adds to the layout engine's obstacles.

On the sample flat (`samplePlan`), laid out with the engine's seeded generation, three pieces
stood in front of radiators without the strips and none with them; over twenty seeds, with the
technical points placed, the only rule broken is the sofa–TV distance in its 44 m² living room
(no pair of walls 2.5–3.5 m apart), and every bathroom kept its WC and basin.

## Tests

`tests/unit/design/rules.test.ts` (the zones of a run, each check, the strips), `electrical.test.ts` (the
heights and the kitchen's and bedroom's fittings), `radiators.test.ts` (the product under the
sill, beside a floor-length window), `autoTechnical.test.ts` (the boiler's room and wall; water at
every fixture, hot on the left, a WC beside a basin, the boiler's pair, nothing twice),
`technical.test.ts` (the shaft warning); in `rules.test.ts` also the niche finder, the wardrobe in
a niche, the WC out of the door's sight over seeds, the kitchen out of the entrance's, the dining
seats and door widths, and every size check; `ceiling.test.ts` (when a ceiling drops and how
far, a balcony, what is hung again, the cove's sizes); `designStore.test.ts` (the store keeps the
drop as the home state, the mode, the choice and the works change; a box's height follows its
card); `wcBox.test.ts` (the box's place, size, materials and quantities, the whole wall, the WC
in front of it and followed by it, not the AI's); `boilerCabinet.test.ts` (size, façade, the
material chosen, taken off, the budget line); `tests/integration/save-routes.test.ts` (a forged
cabinet price repriced by the server's façade); `styleGuide.test.ts` (the guides, the sub-style
from the answers or drawn, the text for the model, `guideFit`); `decor.test.ts` (the guide and
sub-style in the designer's brief); `nightLights.test.ts` (the light's colour by room);
`electrical.test.ts` (a lamp in the room's range first); `rules.test.ts` (the PDF's notes, the
AI check's problems).

## Known gaps

- An island gets no sockets (sockets go on walls only).
- No two-way switch product is in the catalogue yet: two-way switches are estimates
  (`ELECTRICAL_MATERIAL_GEL`, 18 ₾) until the admin adds one (product kind `switch_two_way`).
- A door's other half is found by position (two rooms' doors within 60 cm), not by the twin ids.
- The calculator's board has no furniture, so it has no two-way switches by beds (a long
  hallway's pair it does have).
- A microwave on its own is not a piece, so it gets no socket.
- A bidet has no piece in the app, so it gets no water.
- A WC added in the studio after generating gets no box (only `generateScene` adds them); every
  WC is taken to be wall-hung.
- The water points are drawn on the board and the PDF, not in 3D.
- The engine stands a sofa only against a wall: a room too wide for the sofa–TV range gets its
  warning rather than a sofa floated 3 m from the TV wall.
- A recess in a room's corner (open on one side) is not found as a niche.
- Circulation (100–150 cm paths) is the existing tight-passage warning (`clearance.ts`), not a
  check of its own; IP44 sockets are not a product attribute, only the splash-zone warning.
- The boiler's cabinet is not drawn in 3D; its materials need `pnpm models:seed` (and migration
  `0010_boiler_cabinet`, which a deployment runs) before a boiler gets one.
- The catalogue's lamps carry no `specs.cct` yet, so the lamp preference waits for products that
  say; the sub-style is not recorded in `scene.generation`.
