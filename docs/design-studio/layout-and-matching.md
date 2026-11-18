# Furniture layout and product matching

How a generated design gets its furniture: the archetypes and room programs, the rule-based
layout engine, matching every slot to a real product in the chosen style and budget, the fit
check, and the tight-passage warnings. Read this before touching `lib/design/catalog.ts`,
`lib/design/autoLayout.ts`, `lib/design/matcher.ts`, `lib/design/clearance.ts` or
`designStore.generate`.

Related: [overview.md](overview.md) (step 4 generates) · [studio.md](studio.md) (what a person
does to the result: add, swap, drag) · [../catalog.md](../catalog.md) (the products) ·
[technical-and-fittings.md](technical-and-fittings.md) (technical anchors, fittings and doors
as products).

## Key files

| File | Responsibility |
|---|---|
| `lib/design/catalog.ts` | `ARCHETYPES` (every placeable kind: real size, category, placement rule, labels in three languages), `ROOM_PROGRAMS` (which slots each room type gets), `SHELF_ROOMS` / `kindsForRoom` / `unroomedKinds` (which kinds belong in which room — the studio rooms' starting point; the shelf itself is admin's, [../categories.md](../categories.md)) |
| `lib/design/autoLayout.ts` | `layoutPlan` / `layoutRoom` (rule-based placement, collision-checked; a studio half by half — `partRoom`; `LayoutOptions.anchors` from technical points, `obstacles` for columns and the strip in front of every radiator — `radiatorKeepouts`, [design-rules.md](design-rules.md)), `placeAdditional` (a free spot for one more piece), `FURNISHABLE_ROOM_TYPES` |
| `lib/design/matcher.ts` | `matchProducts` (client-side; drops products without `model3dUrl`, scores style tag + budget tier, checks the fit), `candidatesFor` (the swap list), `toSceneProduct`, `applySwap` |
| `lib/design/arrangedOff.ts` | `arrangedOff` (which piece a kind is arranged off, read from the archetypes' rules), `withoutOrphans` (a piece that is gone takes what was arranged off it) |
| `lib/design/random.ts` | seeded randomness for generating (`seededRng`, `randomSeed`, a stream per key — `streamRng`, `rngStreams`, `roomStreams` — `weightedPick`, `weightedOrder`, `pickNearBest`) |
| `lib/design/clearance.ts` | `tightSpots`, `tightSpotsByItem` |
| `lib/design/footprintMasks.ts` | a model's real footprint when it is not its box (filled by `lib/design3d/modelLoader.ts`) |
| `lib/design/styles.ts`, `styleQuiz.ts` | the style a design is matched to |
| `store/designStore.ts` → `generate` | layout + matching + fittings + openings' products, the hinge of the journey ([overview.md](overview.md)) |

## Flow

```
plan (rooms, openings) + technical anchors ──layoutPlan──▶ slots (archetype, position, size)
slots + catalogue (useDesignCatalog) + style + budget ──matchProducts──▶ scene items (real products)
  per floor slot: placeFitting — the product's real footprint must fit, else the next best
scene ──tightSpots──▶ amber warnings (not a rule)
```

## The design rules in the layout (`lib/design/rules.ts`, [design-rules.md](design-rules.md))

- **What is seen through a doorway** (`roomSightBands`: a band as wide as the opening, from it to
  the far wall). A WC never stands in one when any other spot on its walls fits (its spots in a
  band are dropped before the draw); a bed in one scores 12 less (no fault, the brief says, only
  a preference). Studios pass the whole room's bands to both halves.
- **A studio is furnished half by half** (`layoutRoom`): the kitchen's program in the kitchen half,
  the living room's in the other, each half a room of its own for the engine (`partRoom` in
  `lib/design/studio.ts`, which `autoTechnical` uses too) — the room's doors and windows moved onto
  the half's own edges (each to the half its middle is in), and the line between the halves and
  whatever lies on the room's own separators marked open (`PlanRoom.open`), so nothing stands
  against the line, runs along it or hangs on it. The halves were once handed no openings and the
  line as a wall: a gallery of prints hung on the line in mid-air, and the TV across a window.
  **An opening that reaches across the line** is the half's its middle is in, whole, and the other
  half is told of the stretch on its own wall (`Opening.reachesIn`, never stored): nothing tall
  stands or hangs over it there (`coversOpening`), and a kitchen run counts that wall as one with a
  window, but the window is dressed once, by the half that has it (`ownWindows`), and only a
  half's own doors and windows are the points its pieces are scored by (`openingPoints`). A half
  used to see plain wall there and stood a fridge or a bookcase across the window's end. A stretch
  of 5 cm or less is none (`ONTO_WINDOW_M`, the 5 cm a piece may reach onto a window and not be
  across it — `blocksWindow`): 2 cm of the next half's window on a wall (#392's studio) made it a
  windowed wall to the layout and to the automatic technical placement.
- **What is seen through the flat's front door** (`entranceSightBands`: the band from a door on an
  outside wall, carried on through a doorway straight ahead into the next room; passed by
  `generateScene` as `LayoutOptions.entranceSight`): the kitchen run is looked for out of it
  first, and only when no wall works out of it, in it (`placeWallRun` runs twice).
- **A wardrobe in a niche** (`roomNiches`: a recess 30 cm–1 m deep and 60 cm–3 m wide, its two
  corners turning out to the room — a recess in a room's corner cannot be told from an L's arm
  and is not taken): the widest niche it fits, the recess's width less 2 cm a side, 60 cm deep or
  a shallow 38 cm one in a recess under 60 cm (`placeInNiche`), before any wall.
- **A WC's 40 cm**: its spot is looked for 80 cm wide and it stands in the middle; that envelope is
  what it takes from the room, so the basin or the washer placed after it keep their distance.
- **The sofa 2.5–3.5 m from the screen** on the wall it faces: +10 in range, −16 a metre out of it.
  A big room with no pair of walls in range still gets its sofa against a wall (the check warns).
- **The sofa stands where its TV unit then has a wall.** For every spot of the sofa the engine
  runs what it will do next (`layoutArea`'s dry run, handed to `bestAlongWalls` as
  `RuleContext.screenFor`): the coffee table off the sofa, then the TV unit by its own rule and
  tests. A spot is good when the unit lands with the whole of its back on a wall (`standingWall`:
  the wall `pieceWall` finds behind it, one of the room's walls — a room separator's line and a
  studio's dividing line are none — and its back inside that wall's length, `wallRun`). Where any
  spot is good, only the good ones are drawn from, and the 2.5–3.5 m are measured to the wall the
  unit stands on. A spot is good at whatever distance the unit's own rule allows (up to 4.2 m of
  clear floor): a room whose only walls for the unit are further than 3.5 m from every spot of the
  sofa has its TV on a wall and out of range, and the check says so (`sofa_tv_distance`: the
  living rooms of #357, #365 and #397 and the studio #399 on the fixtures, none of which has a
  good spot in range). **Where no spot is good the room is laid exactly as before** — the screen is
  whatever the sofa faces, a separator's line too, and the unit stands on that line or free on the
  floor: what should stand there (a sofa with its back to the open side, the unit as a divider, no
  TV) is a rule the room does not have yet. On the generation fixtures those are the living rooms
  of #381, #368, #361, #359 and #358 (the unit on a separator's line), #408 and #405 r2 (the unit
  free on the floor, the wall ahead over 4.2 m off) and the studio #385 (on the dividing line on
  one draw in eight, else no unit); and the rooms that get no unit at all — #407,
  #394 r5, #373 r5 and the studios #393, #392, #386 and #384 — are rooms with no good spot too
  ([generation-audit.md](generation-audit.md), RL2–RL5). Only generating runs the dry run: a sofa a
  person adds (`placeAdditional`) is placed as it was.
- **An island 120 cm off the run** (`placeCentre` rejects a spot nearer, before shrinking).
- **Sizes**: 60 cm free beside a double bed (`BEDSIDE_M`), a dining seat per 60 cm of table
  (`seatSlots`), the dining table 75 cm high, the coffee table 42 cm off the sofa, the TV's middle
  at 1.05 m, the wall cabinets' bottom 55 cm over the worktop (1.45 m; their middle `heightM`
  1.81), nothing in front of a radiator (`radiatorKeepouts`).

## The owner's layout rules of 29 Oct 2026 ([design-rules.md](design-rules.md#the-second-round-the-guidelines-for-ai-website-owner-29-oct-2026))

- **A bathroom's fixtures each keep a way to them** (`BATH_PASSAGE_M` 60 cm preferred,
  `BATH_PASSAGE_MIN_M` 40 cm at least): a fixture's spot is refused while its front would run
  into another piece or it would stand in another's free floor (`RuleContext.passages`), unless
  nothing else fits; under 60 cm scores 10 less. The owner's screenshot had a basin facing the WC
  across a 1.1 m bathroom and no way past either.
- **Which order a wet room is laid out in is tried, not fixed** (`wetOrders`, `wetScore`): the basin
  first, then the bath and the shower, then the WC; the WC after the basin; the WC first; the bath
  and shower first — the layout with the WC, then the most fixtures (by worth), each with its way,
  is kept (the first on a tie). A WC laid out first in the middle of a wall left a 7 m² bathroom no
  corner wide enough for a shower; the shower first left a narrow one no place for the WC. The
  program's own order (`ROOM_PROGRAMS`) stays the shelf's.
- **The basin is what the door opens onto and the basin and the bath take the long walls** (+6 in
  a doorway's sight, + twice the wall's length); the WC still keeps out of sight when anything
  else fits. **The mirror hangs over the basin only** in a bathroom or a toilet (no basin, no
  mirror).
- **The shower is an area** (`PlacedItem.areaM`): the largest of `SHOWER_SIZES_M` (120 × 90,
  100 × 90, 90 × 90, 80 × 80 — the larger only from 5 m², `SHOWER_ROOMY_M2`) that fits a corner with
  its way, squared into the corner a centimetre off both walls, either wall at its back; the
  product (a shower column or panel, about 50 cm across) stands at the back of it (the matcher's
  corner settle). The size check measures the area (`shower_too_small`); it measured the column and
  warned of a 49 cm shower the engine had laid out. A bath (from 7.5 m²) comes before a separate
  shower, which goes in only when there is room besides; a smaller bathroom has the shower alone.
  **Its glass** stands on the sides of the tray off the walls (`showerGlass`, `lib/design/shower.ts`:
  the tray found from the piece, so it follows it; 3 cm on the plan, 2–5, and 2 m tall,
  `PlacedItem.glass`), drawn on the board and in 3D; the card resizes the tray and the glass, and so do the arrows on
  the selected shower in 3D (`showerHandleSpots`, `dragShowerHandle`: a free side, the front, the
  top of the glass — a side on a wall has none and stays on it).
- **Partitions at generation** (`withGeneratedPartitions`, `lib/design/autoPartitions.ts`, first in
  `generateScene`): a front door into a living room or a studio gets a screen 1.3 m in front of it
  (`ENTRY_DEPTH_M`), an en-suite's door a lobby 1.1 m deep in its bedroom (`ENSUITE_DEPTH_M`, a
  bedroom from 12 m²) — parallel to the door's wall, across the door and 30 cm past it, an end
  within 90 cm of a wall run on to it (`PASSAGE_M`), the other end leaving a way through. The room
  stays one (`keepWhole`) and the floor behind the screen is an obstacle for the layout. A flat laid
  out again keeps its screens and adds none twice — and the floor behind every screen that stands
  is kept free again, read off the wall as it is (`standingScreens`, `floorBehind`: between the
  screen and the room's wall parallel to it with a door within the screen's length), whether or
  not today's rules would build that screen (another style, a studio under 30 m²): nothing is laid
  out through a wall that is there. A screen whose door is gone is a wall like any other.
- **The rulebook's bathrooms** (6 Nov 2026, [design-rules.md](design-rules.md#the-third-round-the-rulebook-nini-6-nov-2026)):
  a Scandinavian or Industrial bathroom takes a bath only from 9 m² (the shower first); a 1.4 m
  walk-in shower from 7 m², along the room's length; the WC in the middle of its wall; a towel shelf
  and a stool from 6 m²; after matching, the bathroom pass (`lib/design/bathroom.ts`) builds the
  vanity, the taps, the washer's column and the bath's enclosure and mixer, gives a basin lifted for
  a vanity that cannot be built a standing one through the matcher (`standingBasin`; a basin on a
  vanity keeps it, too tall or not), and hangs the
  mirror clear of the basin and its tap ([design-rules.md](design-rules.md), stage 1). What it looks
  at for free wall and floor is each piece's floor (`floorTaken`: a shower's tray, not its column).
  The hallway's program
  starts with a door mat at the front door (`entrance` placement, `placeAtEntrance`) and a coat
  rack near it (`prefer: 'near-entrance'`). Products by style in `slotPool`: a countertop basin but
  in Vintage, the bath's kind by style, no shower door, no towel shelf below `premium`.
- **The rulebook's kitchens** ([design-rules.md](design-rules.md#the-third-round-the-rulebook-nini-6-nov-2026),
  stage 2): the table and chairs before the island, the island 1.2 m clear all round, a table 1.2 m
  or more (1.8 m in a long room) or against a wall, a living room's table 1 m off the lounge pieces
  in the most open spot; the big pieces strictly the style's own (`STRICT_STYLE_KINDS`) — which
  narrows "every product can appear" below to the other kinds.
- **The rulebook's entrance, living room and bedrooms** (stages 3–4): the hall's wardrobe and mirror
  (`lib/design/hall.ts`), a bedroom's wall of wardrobe (`lib/design/bedroom.ts`), a stool in a bedroom
  from 12 m², every window dressed, the sofa–TV floor off the ways between doors, no entrance screen in
  Industrial or a small studio.
- **The washing machine** is the bathroom's (from 4.5 m²); when no bathroom has room for it, the
  hall's, else the kitchen's (`layoutPlan`, `WASHER_FALLBACK_ROOMS`) — the largest of the type,
  and a studio's half of that type counts as a room of it (`areasOfType`: the half as a room of
  its own, the whole studio's door approaches kept clear), so a studio flat with a small bathroom
  has its machine in the kitchen half. It is placed as a piece a person adds (`placeAdditional`):
  against a wall where one has room, else on any free floor — in a hall or a kitchen half with no
  free wall it stands free (#412's hall, the studio #384 on the fixtures). **In a kitchen it keeps
  off the floor the kitchen's corner is then built on**: a run short of a kitchen turns its corner
  only after the flat is matched (`fitKitchenCorners`), so the fallback first asks the corner pass's
  own search which floor that would take as the furniture stands (`kitchenCornerFloor`: at each end
  the run could turn, the run stretched into its corner and the leg with its 90 cm of working
  floor) and looks for a wall off it; only where the kitchen has no such wall does the machine
  stand as it would with no corner to keep — the flat keeps its washing machine, the kitchen loses
  its leg. (It used to stand 60 cm along the leg's wall: #393's studio lost its corner on every
  flat.) A flat with no room typed bathroom gets none.
- **The kitchen run keeps 1.2 m of working floor** in front of it (`KITCHEN_CIRCULATION_M`, a
  keepout once the run stands): the table and its chairs go beyond it, the table as far from the
  run as the room allows — the short wall of a long kitchen (`placeCentre`). The run already takes
  the longest wall and the fridge the run's end (`beside`, +40).
- **The armchair beside the sofa is turned 45° towards the TV** (`placeRelative`): at either end of
  the sofa, a little ahead of its front, turned in; it keeps 80 cm from the dining table and its
  chairs (`ARMCHAIR_DINING_GAP_M`). The old rule (facing the sofa across the room) is the fallback.
  The layout's boxes are the turned footprint's bounding box (`boxFor`), exact at right angles.
- **The sofa faces the TV, not a window**: a sofa spot whose wall ahead has a window where the TV
  would hang scores 14 less. **The TV unit leaves 60 cm before the coffee table**
  (`TV_UNIT_CLEAR_M`); with no spot that does, there is no TV unit (and so no TV).
- **A bookcase stands beside or behind the sofa** (+8 behind, +4 beside), never on the TV's wall in
  its line of sight (−20). **A wardrobe stands beside the bed** (+6 on a side wall), never facing it
  from its foot (−20), and every bedroom of 8 m² or more has one (the program has no gate, but the
  archetype's 8 m² still applies — [generation-audit.md](generation-audit.md), M5).
- **Windows by style** (`windowDressing` in `rules.ts`, `LayoutOptions.styleId`): the program's
  curtain is a roller blind (`blind`, an archetype of the curtain's slot — sized to its window,
  `quantityFor` one a window) in a Modern or Industrial flat and in every kitchen, bathroom and
  toilet (the kitchen's and the bathroom's programs list a blind), full-length curtains otherwise.
  A blind hangs on the wall over its window, 5 cm wider each side (`BLIND_OVERLAP_M`), its cassette
  10 cm over the head (`BLIND_OVER_HEAD_M`, under the ceiling), let down a third of the way
  (`BLIND_LOWERED`), so the room keeps its daylight; it is drawn stretched to that size
  (`fitToItem` measures a curtain's slot per axis). A room with no window draws nothing for either.
  The AI designer is offered the room's kinds dressed the same way (`programKinds`). The blinds are
  code-built models (`pnpm models:blinds`, [../3d-assets.md](../3d-assets.md)).
- **A Scandinavian flat has nothing whose main colour is black** (`styleRejects`, `styleGuide.ts`):
  the matcher draws from the rest of a kind (all of it if every candidate is black), the AI designer
  is not offered it; the swap list still is.
- **A picture hangs at gallery height**: its middle at 150 cm on a free wall, its bottom 25 cm over
  a bed or a sofa under it (`aboveHeightM: 0`, `aboveGapM: 0.25` on the artwork; `settledElevation`
  keeps the gap once the product's size is known).

## Generating is random

The same plan generated twice gives two flats. `generate` draws a fresh seed (`randomSeed`) and
`generateScene` draws everything from it — but not as one stream through the flat: **each room
draws each stage from a stream of its own**. `rngStreams(seed)` gives, for a key, a stream seeded
from a hash of the seed and the key (`streamRng`: the same however many numbers other keys draw and
in whatever order they are asked for; asking for a key again carries on its stream), and
`roomStreams(streams, stage)` names a stage's per-room streams: `layout:<room>` (the room's
placement and decor — both halves of a studio), `match:<room>` (its products, the kitchen run's
material or unit), `match:<room>:way-out:<slot>` (a slot's way out, below), `bathroom:<room>` (its
taps, bath mixer and dryer) and `finish:<room>` (its floor and walls). The engine, the matcher and
the bathroom pass take them as `roomRng` beside their `rng` (which the tests and other callers
still pass: one stream for everything they lay out); everything else that lays out or matches
(adding a piece, a swap, a change of style) passes neither and is deterministic, so a person who
swaps one product does not have the rest of the flat jump around.

So a change in one room — a piece more or less, a wall moved, the room retyped, a door added —
leaves every other room's draws as they were. When it once drew from one stream, a room that drew
one number more re-drew every room after it, and every count of `pnpm audit:generation` moved in
rooms a fix never touched. What still reads another room is not a draw, and is meant to:

- the matcher's "a product already placed in another room is drawn a third as often"
  (`usedByKind`) reads the rooms matched before, in the plan's order;
- with a budget, the budget level is estimated over the whole flat (`budgetLevel`);
- the one floor and wall through the flat are the lead room's draw (`withFlatFinish`,
  `flatFinishRoom`: the largest living room or studio);
- the washing machine goes to the hall or the kitchen only when no bathroom laid one out
  (`layoutPlan`; that placement draws nothing);
- the flat hangs one door and one window product through it, for all its openings' widths
  (`withOpeningProducts`), and the partitions the app adds, the entrance's sight and the wiring
  read the plan as a whole.

- **Placement** (`LayoutOptions.rng` / `roomRng`): a piece against a wall goes to any spot scoring within
  `SPOT_SPREAD` (10) of the best — another wall of similar merit, another stretch of the same
  wall — the better the likelier (`pickNearBest`); a fixture's pull to its pipe (up to +40) is
  far above the spread, so a toilet stays by the sewer. A corner piece takes any corner nearly as
  empty as the emptiest, a wall-hung piece any wall wide enough (the longer the likelier), the
  kitchen run any long-enough wall when the plan shows no water point.
- **Decor comes and goes** (`OPTIONAL_DECOR`): a print 80 %, a plant 70 %, a floor lamp 95 % (the
  owner wants more of them: bedrooms from 12 m² and offices from 9 m² have one in their program too),
  an armchair or a bookshelf 75 %, a dresser 80 %, a rug 85 % (under the bed 80 %), curtains
  90 %, a roller blind 95 % — of the rooms they would fit in. The pieces a room is for (a bed, a sofa, a toilet) are
  always laid out.
- **Products** (`MatchOptions.rng` / `roomRng`, `generationWeight`): each slot's product is drawn from
  **every** candidate of its kind with a model — the style's own ten times as likely as an
  untagged one (a kindred tag three times), one whose colour is of the style guide's palette a
  third more and whose name or tags carry one of its materials a quarter more (`guideFit`,
  `lib/design/styleGuide.ts`), a price that suits the budget level up to half again
  as likely, one much wider than its slot a seventh, one already placed in another room a third.
  None is ever zero in the draw (`pnpm audit:studio-products` lists, per kind, how many there are
  and which rooms generate them) — but what is filtered out before it never appears: another
  style's big piece while one of the style's own fits (below), what a slot can hold (`slotPool`), a
  kind no program lays out, a product too big for any slot. About 160 of the 934 furniture products did not appear in 1,080
  generated flats ([generation-audit.md](generation-audit.md#c-products-that-can-never-appear)). A
  product that does not fit gives way to another draw (`weightedOrder`). Still one product per
  kind per room.
- **Floors and walls** (`generatedFinish`, [finishes.md](finishes.md)): drawn from the finishes
  like the style's own for the room.
- **The kitchen run** is made to measure in a drawn material, or about a third of the time a
  shop's unit that fits the run (only a run-shaped one: worktop-high, deeper than 45 cm, wider than
  deep — the library files hobs and coffee machines under the same kind) — when one qualifies:
  none of today's 40 does, since its name must say it has a sink and a hob (`hasSinkAndHob`), so
  every generated run is made to measure ([generation-audit.md](generation-audit.md), P1). **The wall cabinets**
  (`kitchen_wall`, in the kitchen's program after the run and the fridge) hang over it: `placeAbove` puts them on
  the run's wall, as long as the run, shortened and slid along it to keep a window or a door clear
  — and on the longest clear wall when the room has no run; made to measure in the run's
  material's wall version, none over a shop's run ([../budget.md](../budget.md#kitchens-a-shops-units-or-made-to-measure-libdesignkitchents)).

The seed is kept in the generation record (`GenerationRecord.seed`) — how a flat is drawn again
from it is in [overview.md](overview.md#generation-versions-and-undo).

## Layout fallbacks that keep rooms furnished (`autoLayout.ts`, `matcher.ts`)

- Storage against a wall, the three-seat sofa and the desk (`NARROWABLE`) retry at 80 % and
  65 % of their default width when
  the full width finds no wall — and the matcher then scores down products wider than the slot
  they were given, so a 2 m cabinet is not dropped into a 1.2 m gap beside a door.
- A centred relative item (TV unit, coffee table) is nudged sideways in growing steps before
  giving up; the spot dead ahead of the sofa is usually a door keepout.
- **A piece that fits its wall may stand on it** (`bestAlongWalls`): a wall as long as the piece
  is wide is tried, corner to corner (`sampleAlong`). A wall used to have to be 25 cm longer than
  the piece — a number no rule asks for — so a 1.84 m wall refused a 1.6 m bed (#388's bedroom had
  none), and a hall, a short kitchen wall and a 2.72 m wall for a 2.7 m corner sofa were passed
  over the same way. The same search finds the first spot of a piece a person adds
  (`placeAdditional`), so that too may now be a wall exactly the piece's width.
- A `fill` ring of dining chairs skips a seat that hits a wall instead of ending the ring. **Every
  chair stands a little under its table** — its seat `DINING_CHAIR_TUCK_M` (12 cm) under the
  edge, from the chair's own depth (`seatSlots`): a ring standing clear of the edge looked set out
  for a photograph — and tucks in further when the room is tight (10 or 18 cm more), tested
  against everything but the table. **A desk chair stands with its seat under the desk** too
  (`gapM` −0.18, tested against everything but the desk). `TUCKS_UNDER` in `manipulate.ts` names
  each chair and the top it slides under; the matcher lets the products of such a chair and its
  top overlap (below), and the studio lets a chair stand under its table or desk for the same
  reason ([studio.md](studio.md#direct-manipulation-libdesignmanipulatets)).

## One product per kind per room

Within one room, every slot of a kind gets the same product (six matching dining chairs) —
unless that product does not fit one of the slots, which then gets the next that does
(`placeFitting`, below; a pair of nightstands is then made one again where a product fits both,
`pairsAlike`);
the next room gets the next-best product of the same style tier — generating, another draw, a
product already used three times less likely — so a flat with five pendants hangs five
different lamps. The swap panel lists every candidate for the slot,
matching style first, each with its photo.

## The big pieces in the flat's style, with a way out (`matcher.ts` → `slotSteps`)

A flat's kitchen, sofas, beds, bath, wardrobes and dining table are its style's own
(`STRICT_STYLE_KINDS`, the rulebook's K-15 and Y-7): where the catalogue has any product of the
kind tagged with the style, the slot is drawn from those alone (`kindPool`). When **none of them
fits the slot** — Vintage's one corner sofa is 4.17 × 3.47 m; a style's doubles may all be wider
than the wardrobe beside the bed's slot allows — the slot is not left empty with the room arranged
round it (the owner's decision of 16 Nov 2026). It is offered, in this order, and the first product
that fits takes it:

1. the style's own products of the slot's kind, as drawn (the pick, the draw, the next that fits);
2. for a corner sofa, the style's own **three-seat sofas** (`SMALLER_KIND`);
3. the other styles' products of the slot's kind, **the nearest style first** (`styleAffinity` 1 —
   a kindred tag — before 0);
4. for a corner sofa, the other styles' three-seats.

A double bed takes steps 1 and 3 only — never a single bed (the catalogue's "single beds" are day
beds and a bunk). What a slot can hold (`slotPool`) and what the style keeps out of a flat
(`styleRejects`: nothing black in a Scandinavian one) hold at every step. **A product of another
kind makes the piece that kind**: a three-seat in a corner sofa's slot is a `sofa_3seat` in the
`sofa` slot — its label, its swap list and its box are a three-seat's — standing with its back on
the wall the slot's back was on, and the coffee table is measured off it as off any real sofa
(`settledPosition`). The TV unit stays on the wall the engine found for the slot, so behind a
three-seat the screen is the corner sofa's depth further off (the rule check may say so).

**A kind the catalogue has no product of takes another kind's only where the two are the same
thing** — a short table of facts in the matcher (`FILED_AS`), today one line: the bedroom's rug is
laid as `rug_bed` — under the bed — and the catalogue's rugs are all `rug`, so it is given a rug,
and is a `rug` from then on (at the size and place it was laid; its swap list is the rugs). Filling
the same slot (`kindsOfSlot` in `catalog.ts`, what the shelf groups a room's kinds by) does not
make two kinds the same: a blind's slot never takes a curtain (it would be squeezed to the blind's
size), a single bed's never a double, an open shelf's never a bookcase — with no product of its own
kind such a slot stays empty, as does the hall's `shoe_cabinet`, which has no product at all. Where
the kind has products of its own it keeps to them.

Generating, a way out is drawn like the slot's own (`weightedOrder`), but with a draw of its own
(generating a flat, the slot's own stream, `match:<room>:way-out:<slot>`; given one `rng`, a stream
begun from its last number): the pieces matched after it get the products they would have had, and
a flat whose own pieces all fit is the flat it was.

## A piece that is gone takes what was arranged off it (`lib/design/arrangedOff.ts`)

A slot no product fits is dropped (`placeableOnly`) — and so is what the engine arranged off it
(`withoutOrphans`): with no sofa there is no coffee table, armchair or TV unit, with no TV unit no
TV, with neither a coffee table nor a sofa no rug; with no bed no nightstands and no rug under it;
with no table no chairs. `generateScene` calls it wherever it drops pieces: after matching (against the
engine's slots, so each piece is read as it was arranged), after the calculation's picks, and
after the designer's check (`reviewedScene`: a TV goes with the unit the check removed).

Which piece is arranged off which is read from the archetypes' own rules (`arrangedOff`), as the
engine applies them:

| Rule | Pieces | With the other piece gone |
|---|---|---|
| `relative` (off its `to`) | coffee table, TV unit, armchair (sofa) · nightstand (bed) · dining chair (table) · desk chair (desk) · bath mixer (bath) | goes — the engine lays it nowhere without it |
| `wall-mounted` with `onlyAbove` | TV (TV unit) · tap (basin) · dryer (washing machine) | goes |
| a bathroom's or a toilet's mirror | over the basin and nowhere else | goes |
| `under` (its `to`, else the room's main piece) | rug (coffee table, else the piece the room is laid out round — `mainSlot`: the sofa, an office's desk) · the bedroom's rug (bed) | stays while either stands, goes with both — the engine lays a rug nowhere in a room with neither (never under whatever stands first: a wardrobe, a bookcase) |
| `wall-mounted` with `above`, no `onlyAbove` | a print (bed, sofa) · a hall's mirror (console) · wall cabinets (run) | stays — without the piece the engine hangs it on a wall anyway |
| `wall` with `beside` | fridge (run) | stays — without a run it stands on a wall |

Only what was arranged off a piece that **stood and is gone** goes (the nearest of that slot in the
room as laid): a fridge in a kitchen where no run was ever laid is a missing run, not an orphan.
The whole-flat check (`lib/design/sceneAudit.ts`) reads the same function: a piece of the first
three rows standing in a room without the other is counted as an `orphan`.

## The product has to fit the slot (`matcher.ts` → `placeFitting`)

The layout engine sizes a slot from the archetype; the product that fills it has its own
size, often bigger. `matchProducts` now takes the rooms and, for every floor-standing slot,
checks the preferred product's real footprint at the slot — nudged inside the room when it
only just pokes out — against the polygon and the other pieces. A product that does not fit
gives way to the next-best that does; when nothing fits — of the slot's own products, then of its
ways out (above) — the slot stays empty. Before this a 3.2 m sofa in a 2.4 m room sat through the
window.

**A product keeps clear what the layout kept clear, wherever one can** (the slot's second test,
tried first): a door's way (`inDoorway`: 90 cm into the room, the opening's width), the floor the
layout was told to keep clear (`MatchOptions.keepClear`, which `generateScene` fills with the
layout's own `obstacles` — the strip before each radiator, the columns, the floor behind a
partition) and, for anything but the kitchen's own furniture (the run, the wall cabinets, the
island, the fridge), the working floor in front of a kitchen run (`KITCHEN_CIRCULATION_M`,
`workingFloor`). The engine keeps all of that free of its slots, but a product is rarely its slot's
size — a third of the double beds placed are over a quarter wider — and the fit test knew only the
room, the windows and the pieces. So each slot is gone through twice: first only a product that
also keeps those clear, through every step of the slot's order (above: another style's bed that
keeps out of a door's way before the style's own that stands in it); and when none does, by the
room, the windows and the pieces alone, so that no room loses a piece for it. **The AI designer's
pick is held to the same** (`MatchOptions.picks`): a pick that fits its slot only by standing in a
door's way, on keep-clear floor or on a run's working floor gives way to a product that keeps them
clear — the room's other candidates, then the slot's ways out — and takes the slot only when no
product does. The rugs and the
curtains are sized to the room by the layout and take any product. **A door mat and a hanging
lamp** are in no piece's way either, but have a size of their own (`liesWithinRoom`): the mat
takes the first product that lies inside its room — its edge by the door, eased in like any piece
— and the lamp the first that hangs within the room where it is hung; with none that does, the
one drawn. (The catalogue files five of six door mats 2.03 × 1.27 m and a cluster of lamps
3.16 × 3.96 m.) The mat is not tested for the door's way: the layout lays it inside the front door. On the fixture flats this took the floor pieces within 90 cm of a door from 146 to 25
in 360 flats (the 25: kitchen runs and their legs, and chairs seated round a table, which have no
other place to stand).

**The other pieces are the ones that stand**: those already matched at the size they got, those
still to be matched at their archetype's. A slot that got no product is not there — it is in no
later piece's way, nothing is measured off it and nothing hangs clear of it (`settled` holds the
matched pieces only; a chair's turn at its table is counted off every slot gone through, `seen`).

**Two pieces may touch by 2 cm, and a chair the engine tucked under its table may stand under
it by half its depth** (`tuckedChair`, with the studio's pair rule `tucksUnder`). A seat the
engine pushed in (above) overlaps its table's slot by up to 15 cm, and with every pair held to
the 2 cm the matcher found no product for the table nor for the chairs tucked under it:
`generate` dropped them (`placeableOnly`) and left the other chairs round empty floor, and
where the tuck was only 3 cm it took a far smaller table that cleared it (0.8 × 0.8 in a
1.6 × 0.9 slot). Half the chair is its seat under the table's top and its back clear of it:
a table product bigger than its slot reaches no further over the chair than that, while a
deeper chair in the same place — its seat further in, its back further out — still fits and
the six chairs stay a set. Only the engine's tucks count, read off the slots as laid out
(`slots`): a chair it seated clear of the table keeps the table to the 2 cm, as before.
Letting any chair and table overlap freely, as the studio does for a person, let bigger table
products stand over chairs the engine had seated clear — some chairs all but wholly under —
and changed the table in 53 local rooms where the engine had tucked no chair.

## Pieces measured from the real products (`settledPosition`, `settledElevation`)

The engine lays a room out with the archetypes' sizes; the products that fill the slots have their
own. The matcher re-measures every piece from the product it got, so the room still looks arranged:

- **A piece with its back on a wall keeps it there** (`backOnWall`): a deeper wardrobe does not poke
  into the wall, a shallower bed does not stand off it. It used to keep the slot's centre, so a
  product shallower than the archetype stood away from the wall by the difference. A corner piece
  (the shower) is taken back to the wall it turned its back to.
- **Pieces placed off another are measured from both pieces' sizes** — the `relative` rule's
  `beside`, `gapM` and `toWall`: a nightstand stands beside the bed's head, its back in line with the
  bed's (on the wall), 4 cm off the bed's side (`beside`); the coffee table 42 cm of clear floor off
  the sofa's front (`gapM`); the desk chair 18 cm under the desk (`gapM` −0.18); the TV unit against
  the wall the sofa faces when that leaves 1.5–4.2 m of floor between them (`toWall`), else 3 m off
  as before — a spot whose wall is clear of windows up to 1.5 m (`TV_TOP_M`, `blocksWindow`) first,
  since the TV hangs over it; one under a window only when no other fits. The engine places them so with the archetypes' sizes (`relativeSpots`), the matcher
  again with the products' (`settledPosition`, from the anchor as matched). The nightstand rule used
  to be "5 cm behind the bed's centre, 1.06 m to the side": every nightstand stood by the middle of
  the bed. A piece still to be matched that follows this one (the nightstands of a bed being matched)
  is not in its way: they move to it once it is matched — a wider bed used to be refused because the
  nightstands at the archetype's positions were in its way.
- **A double bed takes the middle of the wall furthest from the door**, with room for a nightstand
  each side (+14 for a spot whose 55 cm each side, at the head, is in the room, off every opening on
  that wall and clear of everything already placed — a door's swing included; a stronger pull to the
  middle — 20 points at the middle, falling off to the ends — and a narrower draw than other
  pieces get — `BED_SPREAD`, 3 points: another wall of the same merit, or within about 25 cm of the
  middle, rather than another stretch of the same wall; a bed drawn 50–80 cm off the middle left a
  wider real bed room for one nightstand). The "opposite the door" preference used to score each spot's own distance from the door,
  so the far corner beat the middle of the wall and left room for one nightstand; and the free-side
  test looked only at the wall's own openings, so a door on the side wall pushed a bed to 45 cm off
  the far wall, and that side's nightstand had to be a narrower one.
- **A big piece leaves room to walk past it** (a bed, a sofa, a wardrobe: `isLargeSize`): a spot that
  would leave 15–60 cm between its long side and the room's edge — what the studio flags amber
  (`tightSpots`) — scores 16 less than it would, so it is taken only when nothing better is left.
- **Both nightstands are one product** (`pairsAlike`, after matching; `PAIRED_SLOTS`): when the
  room's product did not fit one side and that side got another, each product the pair got is tried
  on both — the one most of it has first, then the narrowest — and the first that fits both, each
  beside the bed, takes the pair. The designer's check replaces both or neither (`applyReviewFixes`).
  **A room's dining chairs are one product too**: once its first chair is placed, a seat that chair
  does not fit is left empty rather than given another — a step stool stood among six dining chairs.
  A piece the check replaces is re-measured as the matcher would (`settledPosition`): a wider fridge
  against the end of the run, not 2 cm under its wall cabinets.
- **The kitchen run takes a wall with no window first** (2.2 m or longer; the water point, when the
  plan has one, still decides): the wall cabinets and the backsplash need the wall over the worktop,
  and a run under a window had them shortened round it or none at all. **A shop's unit is taken for
  the run only when it is shaped like one** — at least 1.8 m long, 55–72 cm deep, 85 cm high or more
  (a range cooker filed under kitchen units, 166 × 67 × 80 cm, was taken for the whole kitchen) —
  and stands with its back on the run's wall at its own depth.
- **A short run turns the corner** (`fitKitchenCorners`, `lib/design/kitchenCorner.ts`, after the
  bathroom, hall and bedroom passes): a made-to-measure run under 2.6 m standing in a corner whose
  next wall is free gets a leg along it and wall cabinets over the leg, furniture copied from the run's — an L-shaped kitchen
  ([../budget.md](../budget.md#a-corner-l-shaped-kitchen-libdesignkitchencornerts)). The leg and
  the run stretched into its corner keep off the floor a radiator keeps clear — the very strips the
  layout stood the run clear of: `generateScene` reads them off the plan once (`radiatorKeepouts`,
  by where the radiator stands) and hands the same ones to the layout as obstacles and to the pass
  (`fitKitchenCorners`' last argument; `radiatorFloor` in `kitchenCorner.ts`). The pass is fitted
  in the rooms under their ceilings and must not read the strips again from those: a radiator
  nobody set the sections of is as long as its room's height asks, so under a lowered ceiling the
  strip came out a section shorter than the one the layout and the check use. The pass used to
  read each radiator by the room id stored on it, as a 90 cm square: one whose id named a room the
  plan no longer had was no obstacle, and #408's leg stood on its strip on every draw. A corner a
  person makes by hand in the studio is still measured against the squares (`radiatorObstacles`,
  the store's `setKitchenCorner`).
- **A small kitchen goes on one wall**: the run, the fridge at its end, the wall cabinets over the
  run. The run tries first to start in one corner and leave the other end of the wall for the fridge
  (`leaveFor: 'fridge'` — the fridge's width and 8 cm, clear of openings and door swings), and only
  then runs the whole wall as before; the fridge (placed next, `beside: 'kitchen_run'`) scores +40
  hard against an end of the run on its wall, backs in line, 2 cm off it; the wall cabinets come
  after the fridge in the program, so they hang over the run alone. The matcher keeps a real fridge
  of another width against the run's end (`settledPosition`). The cabinets used to be placed before
  the fridge, which then stood at the run's end under them.
- **A TV over the TV unit** (`tv`, after the unit in the living room's program; `onlyAbove`, so
  none where the room has no unit): laid out on the unit's wall, centred over it, its middle at
  1.05 m (seated eye level, the design rules' `TV_CENTRE_M`), as wide as a 65" TV and no wider than the unit — smaller (85 %, 70 %) and slid along the
  unit when that would cover a window beside it (a unit running past a window had no TV at all).
  The wall is the edge behind the unit and the edges that run on from it in line (`wallRun`,
  `lib/design/planGeometry.ts`): one wall drawn as two edges is one wall, the TV may hang across
  the joint, and a window or a door in either edge is in its way — measured against the one edge
  nearest the unit's middle, a TV over a unit that stood across the joint "ran past the wall's
  end" and the unit was left without one. The same holds for whatever else is hung over a piece
  (`placeAbove`: the wall cabinets, a mirror, a print).
  Over a unit standing free in the room (its back to no wall — a big room's sofa faces a wall too
  far off for the unit to stand against) the slot is on the unit's top, and only a TV on a stand
  fills it.
  Matched, only a TV no wider than its slot (none rather than one across the window); one on its
  own stand (deeper than 12 cm, `onStand`) **stands on the unit's top**, in the middle of it front
  to back, and only one no wider than the unit (`slotPool`); a flat one **hangs on the wall over it**, its back where the unit's back is,
  12 cm clear of its top (`settledElevation`, `hungPosition`). A standing TV moves with its unit
  (`shiftWithFront`), and a TV on the wall is hung on a slab behind it, not inside it
  (`clearOfDecor`). The studio's swap hangs or stands a TV again for the new product (`rehung`).
- **Pieces on a wall hang over their piece** (`wall-mounted` with `above`): the wall cabinets over
  the run (`stretch`: as long as it), the mirror over the basin — or over the hallway's console — its
  middle at 1.55 m, a print over the bed or the sofa, its middle at 1.45 m; each at least 15 cm over
  the piece's top, its own width, centred on it. With none of those pieces, any clear wall as before.
  **Nothing hangs into what stands below it** (`hangsIntoFloorPiece`): a mirror used to hang 45 cm
  off the floor over the washing machine.
- **The height of a hung piece comes from the product and its rule** (`settledElevation`), never
  from the piece it replaces (a wall mirror swapped in for a floor mirror stood on the floor with
  it): a mirror's middle at 1.5 m, a print's at the rule's height (1.45 m over a bed or a sofa),
  each clear of anything standing below by 12 cm; a mirror as tall as a person and deep enough to
  stand (a floor mirror on its stand) stands on the floor, a flat one hangs 30 cm off it
  (`hungPosition` keeps its back on the wall at its depth). A basin too short to stand (countertop,
  wall-hung) is lifted, its top at 86 cm. **A hanging lamp hangs from the ceiling by its own
  length**, its bottom no lower than 1.9 m (1.45 m over a table): every pendant used to hang at
  2.25 m whatever its length, so a 0.9 m one went through the ceiling; the slot takes only lamps
  short enough (`slotPool`).
- **No tall product stands across a window** (`blocksWindow`, `lib/design/manipulate.ts`: a piece
  with its back to the window's wall, taller than the sill by 5 cm, across its width): the matcher
  passes over one (a wardrobe for a dresser slot under a window), and a shop's kitchen unit with
  wall cabinets is not taken for a run under a window.
- **Dining chairs sit round the table as matched** (`seatsAtTable`, on `seatSlots` with the real
  table): each chair at **its own seat** — the one that answers to the seat the engine gave it
  round the table as laid: on the same side of the table, the nearest along it (`seatingAt`,
  `seatPlace`; of two as near, the one nearer the middle, so two chairs laid before a 1.2 m table
  take the middle two seats of a 2.4 m one). The engine seats no chair where a wall or a piece is
  behind the seat, so the chairs it laid say which sides of the table can be sat at; the n-th chair
  taking the n-th seat sent every other chair of a table against a wall to the wall's side, where
  it did not fit, and the room lost it. A chair whose own seat is not there (a real table too
  shallow for a seat at its ends, or with fewer along a side) or does not fit tries the seats that
  are no chair's, in the table's order, and sits at the first where it fits; a chair with no seat
  left to try goes — six chairs used to stand round a 0.8 m round table. A seat is 60 cm of table
  edge (`DINING_SEAT_M`). Chairs still to be seated are in neither the table's nor one another's
  way, and a re-seated chair counts as tucked in (its seat 12 cm under the edge). A bigger table no
  longer gives way to the chairs round its slot.
- **Tidied once everything stands** (`designStore.generate`, after the decor is fitted; again
  after the AI check — `lib/design/aiProposal.ts`): every piece the engine stands against a wall
  back against it (`settleToWalls`, with what stands in front of it — the desk chair, the coffee
  table — moved the same); nothing standing in built decor (`clearOfDecor`: moved off it by the
  decor's depth, `decorDepth`); the lamps and ceiling points under a cove's lowered panel hung from
  it (`underCeilingDecor`).
- **What a slot can hold** (`slotPool`, before the draw): a basin that stands on the floor (60 cm or
  taller — a countertop basin needs a counter the flat has not got; the library also files taps and
  mixer panels under the kind), and in a bathroom or toilet a mirror that hangs flat and is no taller
  than 1.2 m. **A hall's mirror** is the full-height one (`isFullHeightMirror`: 1.4 m or taller, flat,
  no wider than 90 cm) only where the wall under its slot is free from the floor up; over the
  console, or anything else standing there (`standingBelow`), it is one that hangs clear of the
  piece's top and under the ceiling (`settledElevation` says where each would hang) — and when the
  catalogue has none that does, the mirror it would have had. The hall pass hangs the full-height
  mirror across from the wardrobe it builds ([design-rules.md](design-rules.md), E-8). The swap list
  still offers the rest.

## Nothing stands through a wall

Every spot a layout rule tries is judged by `fitsInRoom`, which is `boxInPolygon`
(`lib/design/planGeometry.ts`): every corner of the piece's box in the room's outline, and no edge
of the outline running through the box (a wall it only touches does not count: 5 mm of slack,
`wallsEnterBox`). This covers the wall, the wall run, the centre, the corner, the pieces placed
off another (the TV unit, the coffee table, the chairs round a table), the rug under a piece and
any free floor. The matcher checks a product's real footprint at its slot the same way
(`placeFitting` → `footprintInRoom`). Corners alone let the end of a partial wall stand inside a
box whose four corners were all on the floor. In test project #219 the living room's TV unit,
placed 3 m off the sofa and nudged sideways, stood on the tip of a diagonal partial wall with the
rug under it; with the wall test it takes the next spot along. The corners are still tested
exactly. Giving them the same slack as the walls let pieces into spots just past the outline
that the engine never took, and changed the layout of about a hundred local rooms; comparing
every local plan before and after, the wall test alone changed only #219's living room and its
copy.

The box judged is exact at a right angle on both sides of that test: the engine's `boxFor`
squares the rotation, and the studio's and the matcher's `footprintOf` squares its cosine and
sine (`Math.cos(-Math.PI / 2)` is 6e-17, not 0), so a piece the engine placed is judged by the
numbers the engine judged it by. The noise put a bed the engine had pushed flush into a corner
at −π/2 1e-16 m past the wall, and the studio outlined it red; wherever a product stood flush
against a wall, or touched a neighbour by exactly the 2 cm allowed, it also decided the
matcher's choice between two products.

**The matcher's product is in its room flush against any wall** (`footprintInRoom`, the studio's
test too: `boxInPolygon` a nanometre in from the box's sides). A product that pokes out of its
slot is eased back inside the room's box (`clampInsideRoom`), which leaves it exactly on the
wall, and the exact corner test's ray cast counts a point on an east or south wall (the larger x
or z) as outside and one on a west or north wall as inside — so on two sides of every room a
product that only just fitted gave way to a next-best: a smaller plant in the corner, another
wardrobe or dresser. Laid out again with the nanometre, the local plans in the four styles
changed 993 product choices, 911 of them on an east or south wall (mostly plants, then
wardrobes, dressers, bookshelves and toilets), in 307 of 312 project-and-style runs; 15 slots
that had been left empty got a product, and none lost one. The engine's own spots are unchanged:
it keeps the exact test — so of the two spots hard in the corners at a wall's ends, the engine
never takes the one on an east or south wall. Giving `fitsInRoom` the nanometre was measured on
the generation fixtures (16 Nov 2026, 120 flats) and not done: the layout is greedy, and the
newly allowed corners gain four showers and two studio runs but cost a bathroom its basin and
mirror (#381 r8: the basin takes the corner by its pipe and leaves the WC no way past), another
its mirror (#407: a mirror as wide as a basin hard in the corner is "past the wall's end" by a
rounding error), five nightstands and three wardrobes — it waits for the rooms' own rules of who
gives way ([generation-audit.md](generation-audit.md), RB6).

## Tight passages (`lib/design/clearance.ts`)

`tightSpots` flags a piece a person could not get past: a big piece (≥ 0.8 m², ≥ 1.2 m
long) with less than 60 cm between its long side and a wall, two big pieces less than 35 cm
apart, or anything within 30 cm of a doorway's inside point. Small things (chairs, a
nightstand), the short ends of big ones, floating pieces, and pieces that touch or all but
touch — a gap under 15 cm (`NO_PASSAGE_M`) is nobody's way through (a desk stood 6 cm off its wall
in front of a wall panel was flagged) — do not count; the first version flagged half the flat. The gap to a wall is measured to the room's bounding
box, and a doorway's inside point is 45 cm into the room. Rooms a room separator divides are
judged as one floor (`openFloor`; `tightSpotsByItem` takes each floor once). The box is the
floor's, so a separator is no wall to be squeezed against, and two pieces facing each other
across the line are a passage like any other. The viewer draws an amber outline
around every flagged item and a generic warning floats above the tray. It is a warning, not a
rule: the layout is still saved as arranged.

## Tests

`tests/unit/design/showerGlass.test.ts` (the tray found from the piece, the glass off the walls
and round the matched column, following the shower, resized with its wall side kept),
`tests/unit/design/autoPartitions.test.ts` (the entrance screen run to the corner, a free one, none
into a hall or a shallow room, an en-suite's lobby, nothing added twice and the floor behind a
screen that stands — the entrance's and the en-suite's — kept free when the flat is laid out
again),
`tests/unit/design/styleRules.test.ts` (the flat's one floor and wall, an open kitchen and a
floor chosen by hand; no black in a Scandinavian flat; a picture's height; blinds or curtains by
style and room, a blind's size and height, sold one a window),
`tests/unit/design/matcher.test.ts` (same product per kind per room, rotation between rooms,
fit with rooms, not through the end of a partial wall, the model filter, a product flush in each
corner of a room, a chair tucked under its table — both get products, no table over more than
half the chair, a chair seated clear still in the table's way),
`tests/unit/design/matcherStyle.test.ts` (a slot none of the style's own fits: a three-seat of the
style in a corner sofa's slot, then the nearest other style's, a double bed never a single, no
black in a Scandinavian flat's way out, the same product for the same seed where an own one fits; a
kind with no product takes its slot's other kinds'),
`tests/unit/design/matcherFit.test.ts` (a slot that got no product in nothing's way; a door's
way, the keep-clear floor and a run's working floor kept clear wherever a product does, and the
piece kept where none does; a door mat and a hanging lamp within the room; the chairs of a table
against a wall at their own seats, at a free one where theirs is not there or does not fit),
`tests/unit/design/arrangedOff.test.ts` (which piece each kind is arranged off, what goes with a
piece that is gone and what stays, a generated room whose sofa or bed no product fits),
`tests/unit/design/hallLiving.test.ts` (the hall's mirror over the console and the full-height one
on a free wall or across from the built wardrobe),
`tests/unit/design/autoLayout.test.ts` (`boxInPolygon` — the gap of a U, touching a wall — `wallRun`
— edges in line joined, a corner and a left-out edge ending the wall — and
nothing of a layout standing through a wall, on project 219's corner),
`tests/unit/design/layoutRules.test.ts` (the rules a room is laid out by, each on a small room: a
living room open onto the next room has its TV unit on a wall with the whole of its back, on every
draw, and one with no wall for it keeps its unit; a TV hangs across the joint of a wall drawn as
two edges, clear of a window in the next edge; a 1.6 m bed on a 1.84 m wall; the washing machine in
the hall, else in a studio's kitchen half, none in a flat with no bathroom — in a kitchen off the
floor its corner is then built on, and kept where the kitchen has no other wall for it),
`tests/unit/design/placementSettle.test.ts` (nightstands beside the bed's head, laid out and with a
wider real bed; a shallower wardrobe kept on its wall; the bathroom mirror over the basin at eye level
and only standing basins; a floor mirror standing; the desk chair under the desk; room to walk past a
double bed and one product for both nightstands; a small kitchen on one wall; a TV on or over its
unit), `tests/unit/design/clearance.test.ts` (a piece 6 cm off its wall is no passage),
`tests/unit/design/studio.test.ts` (`layoutRoom` for studio
parts), `tests/unit/design/studioLayout.test.ts` (project 26's studio: `partRoom`'s open line and
moved openings; over 30 seeds nothing hung on the line, the TV unit on a wall of its half and
never on the line, the TV clear of the windows; a window
across the line known to both halves, nothing tall over it in either, dressed once; a sliver
of it past the line no opening), `tests/unit/design/manipulate.test.ts` (`placeAdditional` with real sizes; the engine's
chair tucked under its table and its bed flush in a corner at −π/2, both let stand by the studio),
`tests/unit/design/clearance.test.ts`, `tests/unit/design/shelfRooms.test.ts`,
`tests/unit/design/generationRandom.test.ts` (a stream per key the same whatever else is drawn;
the same seed the same flat and seeds apart different flats; a room retyped or resized leaving
every other room's pieces, products and finishes as they were; the seed recorded and kept by the
save schema; the audit's seed of its own per fixture plan, so a room id two plans share draws two
streams; every piece inside its room, a bed in every bedroom, every sofa drawn over 400
generations and the style's own most often, the best without an `rng`; drawn finishes in their
category and wetness, kept by `withStyleFinishes` until the room is retyped). The sample flat
(`lib/design/samplePlan`, an ordinary 150 m² apartment) run through `layoutPlan` is the manual check for the layout as a
whole. `lib/design/matcher.ts` is in the coverage gate.

## Known gaps

- **The generation audit of 16 Nov 2026** ([generation-audit.md](generation-audit.md)) lists what
  the engine and the matcher leave out, where they clash and what they can never place, measured on
  1,080 generated flats. Its ticked items are fixed (the matcher's: a way out of the strict style,
  what goes with a dropped piece, a kind with no product, what the layout kept clear, the hall's
  mirror, the door mat and the hanging lamp, the chairs' own seats); the rest is open.
- **Only TVs of the home electronics are placed.** The library files a few appliances under
  kinds that do not fit them — coffee machines, a built-in oven and range cookers as
  `kitchen_run` — and there is no kind for a soundbar, speakers or a microwave; a kitchen's
  appliances are the run's own.
- A model's real footprint (`footprintMasks`) is known only once the 3D view has loaded that
  file in this session; the 2D board still draws every piece as its box, and the layout
  engine, the matcher's fit check and the tight-passage warning all use the box.
