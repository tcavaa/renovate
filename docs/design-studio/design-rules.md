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

Later rounds: the guidelines (29 Oct), the rulebook (6 Nov), the fitted pieces (13 Nov) and the generation decisions (23 Nov, in stages — below).

## The second round: the "guidelines for AI website" (owner, 29 Oct 2026)

A second document of notes (general principles, the four styles, lighting, furniture, bathrooms,
the plan reader, the board, the steps), with style reference photos and ten uploaded plans
compared against what the app built from them. Answered question by question on 29 Oct and built
in six stages:

| Stage | What | State |
|---|---|---|
| 1 | plan reading and the 2D board: printed sizes read like the drawing, wall thicknesses, one wall's length when nothing is printed, uploads that are not plans refused, stray walls and a fit button, several walls selected with Shift, a manual thickness, door and opening bugs | **built** ([plan-reading.md](plan-reading.md), [plan-board.md](plan-board.md)) |
| 2 | steps and technical: Materials and the post-design Technical step become studio sections, one Generate for the points and radiators, "ელექტრო და შუქი" → "განათება", the 3D view-only after the Budget, the boiler's place, radiators on the board, the heated towel rail | **built** ([overview.md](overview.md), [studio.md](studio.md), [technical-and-fittings.md](technical-and-fittings.md)) |
| 3 | room layout rules: kitchen, living room, bedroom, bathroom, washing machine, bookcases (windows' blinds with stage 5) | **built** ([layout-and-matching.md](layout-and-matching.md)) |
| 4 | lighting: kitchen's three layers, bedroom, hallway, living room, style fixtures, more floor lamps, the lighting plan (LED strips with stage 5's decor) | **built** ([technical-and-fittings.md](technical-and-fittings.md), [plan-board.md](plan-board.md)) |
| 5 | styles, finishes and decor: one floor through the flat, walls consistent, Scandinavian without black, no mouldings in Scandinavian, no cornices in Industrial, panels only in Modern, decor on free walls at gallery height, decor resizable, windows by style (roller blinds or curtains) | **built** ([finishes.md](finishes.md), [decor.md](decor.md), [layout-and-matching.md](layout-and-matching.md), [studio.md](studio.md)) |
| 6 | glass shower walls on the board, partitions added at generation (entrance out of the living room's sight, an en-suite's entrance by the wardrobe), partitions run to the corner | **built** ([layout-and-matching.md](layout-and-matching.md), [plan-board.md](plan-board.md), [studio.md](studio.md)) |

**Plans and the board**

- **Printed sizes are read like the drawing.** A chain of sizes outside the walls adds up to the
  overall size: its ends are the outer faces of the outside walls and its breaks the middles of the
  inside walls; an overall size is outer face to outer face. A size written inside a room ("3.5 x
  3.0", a room table) is that room's clear inside size. The board's outside chains are drawn the
  same way, so a plan read from a drawing shows the drawing's numbers.
- **Wall thickness**: measured from the drawing's lines whenever the plan has sizes, rounded to a
  standard size; with no sizes (or when nothing can be measured) 30 cm outside and 12 cm inside.
- **No sizes printed**: after the read the plan is shown with its longest outside wall highlighted;
  the person types its length (or picks another wall first) and the whole plan is scaled from it.
- **Not a plan**: a cheap check runs before the read; a car, a room photo or a selfie is refused
  with "this doesn't look like a floor plan" and the card asks for another file, nothing read and
  nothing counted against the plan's allowance. A photo of a paper plan or a hand sketch is a plan.
- **Several walls at once**: Shift-click gathers walls, and the right-hand panel changes the
  thickness of all of them. A thickness over 25 cm is "manual": the person types it (30, 50 cm…).
- **Lost view**: a button that fits the plan, and one that zooms onto the selected object; a plan
  never fits to a stray wall far from the flat (project 371 had a zero-length wall 479 m away).
- The door bugs (a door not seen whole, an opening cut on one side only), found in the recent
  projects: a door whose other half was lost when a room was re-derived under it (371) is cut
  again in the room behind its wall; a door and a window read on top of each other (373) are
  pulled apart, the door keeping its place; a door wider than its wall on one side (376) is
  narrowed to fit both — all when a plan is taken in (`withOpeningTwins`, `alignTwins`,
  `separateOverlaps`). The "49 cm bathroom" was the shower slot holding a shower column (a
  product about 50 cm across) and the check measuring the column: the shower's own area comes
  with stage 3 and the glass enclosure.

**Steps and technical**

- A renovation (black or white frame, an old flat) walks Plan · Existing home · Style · 3D design ·
  Budget · Brigade. Materials and Technical are sections of the studio's sidebar; the Budget opens
  only once the person has opened the Technical section and pressed its one Generate (the points
  and the radiators together) or confirmed what is there. A green frame or a design-only project
  keeps Technical as step 3, before the style.
- The studio's "ელექტრო და შუქი" section is called "განათება".
- The Budget can still change things (ticks, quantities, back to the 3D); from the Brigade step on,
  and once anything is ordered, the 3D is view-only with the technical points shown.
- **The boiler**: in the hall by the entrance, in a wardrobe-like technical cupboard; when there is
  no room there, on the balcony, enclosed in a cupboard; with no balcony, in the bathroom, never in
  the shower (and never beside the bath). Supersedes the 28 Oct order below.
- Radiators are drawn on the 2D board as well as in 3D. A bathroom gets a wall-mounted heated
  towel rail, hung higher than a radiator.

**Layout**

- Every piece has a purpose: no table in front of the TV, the dining table out of the 1.2 m
  kitchen circulation, more room between the dining table and an armchair.
- Kitchen: 1.2 m of circulation in front of the run; the run along the long wall of an elongated
  room and the dining table against a short wall; the fridge (and the oven tower) beside the run,
  never elsewhere; a table and chairs whenever there is room; a closed kitchen's floor tiled, an
  open one's the flat's floor; the backsplash stays the decor it is. (The fourth round's decision
  3.5 orders what gives way when a kitchen lacks its run, its fridge or its table — the fridge on
  another wall is her second fallback; stage 4, below.)
- Living room: the sofa and the armchairs face the TV, never the window; an armchair beside the sofa
  turned about 45° towards the TV; the TV unit centred under the TV, and a TV whenever there is a
  unit; 60–100 cm in front of the unit before the coffee table, else no TV unit; a bookcase or a
  wine cabinet beside or behind the sofa when there is room (larger living rooms).
- Bedroom: always a wardrobe (built-in preferred; curtains only when chosen) and bedside tables
  (turned when that helps the room); a dressing table and chair in a large one; a large wardrobe
  beside the bed, never facing it.
- Bathroom: the door opens onto free floor — the basin is never placed so that nobody can pass
  (the screenshot: a WC and basin facing across a narrow room); a shower only with 80 × 80 cm, larger
  when the room allows, glass-enclosed and visible from the door; a bath gets its own shower in the
  middle, or the bath and shower combine; too small for a bath, a shower only; the long walls take
  the shower and the basin, never the WC alone; storage when there is room; the mirror on the wall,
  over a basin only; no 10–20 cm leftover gaps.
- Washing machine: in the bathroom, else the entrance, else the kitchen — and, the fourth round's
  decision 3.6, else the balcony.
- Windows: blinds by style — Modern and Industrial compact roller blinds, Scandinavian and Vintage
  full-length curtains from just under the ceiling, bathroom and kitchen windows always blinds.

**Lighting**

- Kitchen: three layers that keep apart — the pendant centred over the dining table (one large, or
  two or three small down a long table or island: decision 10b, stage 5 below), the main light
  (cylindrical spots, recessed spots or a track, by style) over the working area, and light under
  the wall cabinets onto the worktop.
- Bedroom: one large light, or the main light with a pendant (or a track or spots, by style) each
  side of the bed; Industrial a cylindrical track, Scandinavian a large central light and bedside
  pendants.
- Hallway: a light every 3 m or less, evenly spaced down the middle; no floor lamp at its start.
- Living room: a chandelier or a prominent pendant where the room is big enough; more floor lamps
  generally.
- LED strips and coves: only Modern gets them at generation; anyone can add one.
- Industrial: cylindrical fixtures. Scandinavian: simple pendants, floor lamps, warm light.
- **The lighting plan**: a განათება layer on the 2D board showing every fixture, and a lighting
  sheet in the plan PDF with each room's fixtures (type, purpose, height). Heights and positions
  stay editable in the studio.

**Styles, finishes and decor**

- "Minimalist" in the notes is Modern.
- One floor through the flat at generation (bathrooms, and a closed kitchen, excepted); walls the
  same or in tones of one family.
- Scandinavian: no product whose main colour is black or very dark (small black details allowed);
  light, bright colours from the fridge to the sofa; no wall mouldings or decorative wall
  treatments; plants and floor lamps; no LED strips.
- Industrial: no decorative cornices; a fireplace that suits the room, not an industrial one by
  default; no LED strips or hidden decorative light.
- Wall panels only in Modern. Decor mostly in Modern and Vintage, now and then in Scandinavian.
- Decor hangs only on free wall — never in an opening or over a window — at gallery height: the
  picture's centre at 150 cm on a free wall, its bottom 20–30 cm over a sofa, bed or console.
- Every wall decor piece built in code can be moved and resized: arrows on its sides (width) and
  top and bottom (height) in 3D, and width and height on its card.

How stage 5 built it: the flat's one floor and wall finish are the largest living room's (else the
largest room's), laid in every room but a bathroom, a toilet, a balcony and a closed kitchen — a
kitchen with no separator and no archway, whose style floor is tiled already (`withFlatFinish`,
`isClosedKitchen` in `surfaces.ts`); a room finished by hand keeps its own. A Scandinavian flat
draws no product whose main colour is black (`styleRejects` in `styleGuide.ts`: the matcher and the
AI designer's offer leave it out, the swap list still has it). The decor families a style takes are
`STYLE_DECOR_FAMILIES` (`decor/families.ts`): Modern all, Scandinavian slats, niches, tiles and the
WC box, Industrial no mouldings, light or panels, Vintage no light or panels; LED only in Modern
(`styleTakesLed`) — the AI designer's answer is cut to them (`validateProposal`). Industrial and
Modern have no cornice (`STYLE_TRIMS`); Scandinavian keeps its plain 6 cm ceiling cove, the rule
being about wall mouldings. A picture's middle is at 150 cm on a free wall, its bottom 25 cm over a
bed or a sofa under it. Windows: `windowDressing` (`rules.ts`) turns the program's curtain into a
roller blind (`blind`, the curtain's slot) in a Modern or Industrial flat and in every kitchen,
bathroom and toilet; a blind hangs over the window, 5 cm wider each side, its cassette 10 cm over
the head, let down a third of the way (`placeAtWindow`). Decor is resized with `decor/resize.ts`
(the arrows: `lib/design3d/decorHandles.ts`; the card's width, height and height off the floor).

**Shower glass and partitions**

- A shower enclosure's glass is walls on the 2D board, 2–5 cm thick, whose height and width the
  person changes.
- Partitions are added at generation, automatically: the entrance door kept out of the living
  room's sight, an en-suite's entrance enclosed beside the wardrobe; a partition the app draws runs
  to the corner, never leaving a 10–20 cm gap.

How stage 6 built it: a shower's glass rides on the shower (`lib/design/shower.ts`) rather than
being walls of the plan — a wall bounds rooms, and an enclosure of walls would have made the
shower a room. Its tray is found from the piece (its back on the piece's back, centred across
it), so it follows the shower when dragged or turned; a pane stands on each side of the tray off
the walls, inside the tray, `PlacedItem.glass` thick (3 cm, 2–5) and tall (2 m), drawn on the board
and the PDF as thin glass walls (`drawShowerGlass`) and in 3D as clear sheets with a metal top rail
(`lib/design3d/showerGlass.ts`); the piece's card sets the tray's width and depth and the glass's
thickness and height (`resizedShower`: a side on a wall stays on it). The partitions are
`withGeneratedPartitions` (`lib/design/autoPartitions.ts`), run first in `generateScene`: a front
door opening into a living room or a studio gets a screen parallel to its wall 1.3 m in, across
the door and 30 cm past it; a bathroom whose doors all open into one bedroom (12 m² or more) gets a
lobby in the bedroom 1.1 m deep the same way (the wardrobe can stand against its far side). An end
that would leave less than 90 cm to a wall runs on to that wall and joins it; the other end must
leave a way through, or there is no screen. Where the joined end would land in a window, a door or
an archway, or meets a room separator's open line, the fourth round's decision 11 applies (a shorter
screen, a shallower lobby, the screen turned, none; a way through of 90 or 80 cm at an open line —
[layout-and-matching.md](layout-and-matching.md)). The screen joins one wall at most, so the room stays
one room (`keepWhole`, no separator drawn on from it); the floor behind it is kept free of
furniture — when the flat is laid out again too, behind every screen that still stands. A screen is a 10 cm plasterboard wall, `origin: 'generated'`, priced like any partition.

## The third round: the rulebook (Nini, 6 Nov 2026)

The owner's draft notes ("დრაფტი კლოდისთვის", 37 notes and 8 screenshots) were turned into a
numbered rulebook — every rule the app already followed, per room, and the draft's as new rows —
and Nini marked each keep, change or drop (`docs/design-studio/PLAYCE-design-rules-plan.docx`, the
rule numbers below are its). Built in six stages:

| Stage | What | State |
|---|---|---|
| 1 | bathrooms: taps with every basin, the bath's mixer, the made-to-measure vanity and washer column (dryer over it), the built-in and the Vintage bath, a shower in every style, the WC centred and boxed, towel shelf, stool, three spots | **built** |
| 2 | kitchen: island 1.2 m all round, hood, no second hob or oven, four chairs or a counter, a long table, lighting in the room's middle, hidden LED, the style's kitchen along the whole wall | **built** |
| 3 | entrance and living room: the hall's built-in wardrobe (coats, boiler, shoes), full-height mirror, door mat; the TV out of the way through, the dining table at least 1.2 m, curtains at every window, no entrance screen in Industrial or a small studio | **built** |
| 4 | bedrooms, office, storage: a full-wall wardrobe, no extra chest (a desk or a dressing table may stay), a tall headboard takes no panel, stool, clothes rack, no closet mirror on a balcony | **built** (but the clothes rack and the closet mirror — see the gaps) |
| 5 | the whole flat: one main fixture per room, one large light and spots round it (Scandinavian, Modern, Vintage), wall lights on walls, front and interior doors in their places, no glass doors into bedrooms or bathrooms, panels a whole wall, sockets on the decor's face, cornices through room crossings, seams | **built** |
| 6 | the plan board: inner walls' lengths, distances to windows and doors, opposite windows in line, the beam named რიგელი | **built** |

Nini's answers that change earlier rules: main lights are rails, spots and small pendants (a
chandelier, wall and floor lamps are not "main"), all of one model in a room (G-9); every window has
curtains or a blind (G-20); the hall's coats, boiler and shoes are one built-in wardrobe to the
ceiling, the boiler's section ventilated with room to service it (E-4, E-6, E-7); the living room's
dining table is at least 1.2 m, centred in the free floor (L-6); no entrance screen in an Industrial
flat or a studio short of room (L-13); the vanity is made to measure in every style but Vintage, with
a basin and a matching tap (BA-7); Vintage builds a tiled enclosure round a freestanding rectangular
bath, the WC boxed and the basins' taps on the wall (BA-18); a towel shelf only with room and a
higher budget, else the towels hang on the heated rail (BA-19); no shower-door model — showers are
built (BA-24); at least three lights in a bathroom, evenly spaced and the same distance from the
walls (WC-3); Modern and Vintage take mouldings, and one large light per room with spots or pendants
round it (Y-4, Y-6); the beam is labelled რიგელი in Georgian, beam in English (P-2); a cabinet beside
a full-wall wardrobe only when it is a desk or a dressing table with a mirror (B-10); the dryer stands
on the washer, and the joinery may run on from the basin as one piece (G-29). Dropped: S-3, Y-8, BA-24.

How stage 1 built it — **the bathroom pass** (`lib/design/bathroom.ts`, `fitBathrooms`, run by
`generateScene` after matching):

- **Vanity** (BA-7): in every style but Vintage the basin slot takes a countertop or vessel basin
  (`slotPool`: under 45 cm tall, `COUNTERTOP_BASIN_MAX_M` — the bathroom pass and the studio's
  `takesHousing` build a vanity under no taller one), set on a `cabinet` piece's `basin` section —
  its top a basin's height (`BASIN_TOP_M`, 85 cm) less the basin's height, between 70 and 90 cm
  (`vanityTop`), so the basin's top is at 85 cm wherever the vanity allows; 50 cm deep, from the basin's width and 40 cm up to 1.8 m, run on
  to a corner rather than leave a sliver under 30 cm (`JOINERY_SLIVER_M`), clear of the other
  pieces on the wall (`freeStretch`; `vanityFor`) — under a window only where its sill is at or
  over the basin's rim. Vintage keeps a standing basin (60 cm or taller). The matcher lifts a
  countertop basin to washing height before the pass (its top at `BASIN_TOP_M`): where no vanity can be built round it, the
  matcher gives its slot a basin that stands on the floor at a basin's height (85 ± 7 cm,
  `BASIN_TOP_M`; `standingBasin`: `matchProducts` with the room's pieces where they stand — the fit
  test, a door's way, the floor kept clear); with none that fits, the basin stays as matched. A
  basin a vanity holds stays on it even when it is too tall to stand at a basin's height on the
  lowest vanity (70 cm) — `rule:basin_height` says so; what such a basin should become (a lower
  vanity, another basin) is a rule still to be decided. No basin is left hanging with nothing under
  it on the test plans.
- **The mirror over the basin** is raised, after the tap is on, clear of the basin and the tap by
  the matcher's gap over a piece (12 cm, `settledElevation`; `hungClearOfBasin`), never lowered and
  never through the ceiling. Over a tall wall tap (the 43 cm black panel mixer with its wall plate)
  or under a tall mirror on a high basin, its middle ends over 1.75 m (38 of 308 bathroom mirrors in
  360 flats): whether such a tap goes under a mirror at all is a rule still to be decided. Once
  the washers' columns stand, a mirror the column could stand nowhere clear of (below) gives way to
  the best mirror of the style that hangs clear of the washer and the dryer at the matcher's height,
  clear of the basin and the tap (`mirrorClearOfColumn`); with none it stays as it hung — not raised
  over the dryer out of a person's sight: whether the mirror or the dryer gives way is the owner's.
- **Taps** (BA-8, BA-18): every basin not sold with its tap (`includesTap`: "…with … tap/mixer")
  gets one — a wall tap 12 cm over the rim, or a deck tap behind the bowl on the vanity or on a
  standing basin's top; where the basin leaves no deck behind it on the vanity the tap goes on the
  wall, and it is then a wall tap where the catalogue has one (`tapSpot`), not a deck mixer hung
  on the wall at its full height; Vintage's on the wall; never a floor-standing mixer at a basin.
- **Washer column** (BA-12–15): but in Vintage, the machine is built into a `washer` section 65 cm
  deep, its width and 2 × 1.8 cm sides, up to its top (and the dryer's): beside the vanity on its
  wall when there is room, the column at the end of the wall and the gap between filled with doors
  at the vanity's height — one piece; else its own column where it stands, moved to the wall's end
  when that is a sliver away. The joinery keeps clear of a WC by its box's 80 cm and 40 cm either side
  of its middle (`freeStretch`): on a generated flat the column had stood 18 cm off the WC's middle,
  its box running into the column. That side room is the WC's clearance, so joinery may come up to
  it (a vanity on the next wall 91 cm from the WC's middle); and a WC with its back on its wall is
  measured where it will stand once its box is built, 20 cm out (`WC_BOX_DEPTH_M`). A **dryer** (`dryer`, the library's tumble dryer) stacked on the
  machine inside the column at the `premium` budget level with a ceiling of 2.2 m or more (G-29).
  The column goes where it and its dryer stand clear of what hangs on the wall over them (a
  mirror wider than its basin, `hungOver`): beside the vanity, else round the machine on its own
  wall; where neither is clear, where it would have gone, and the mirror is raised clear of the
  dryer (above).
- **Bath by style** (BA-16–18): Modern a freestanding bath (`slotPool` leaves built-in ones out);
  Scandinavian and Industrial a built-in one (a bath only from 9 m², `SHOWER_FIRST_STYLES`,
  `BATH_WITH_SHOWER_M2` — the shower first), boxed and tiled to just under its rim (a `box` piece,
  anchor `bath`); Vintage a freestanding rectangular bath in a tiled enclosure 10 cm wider each
  side and 6 cm over the rim. The **mixer** at the bath's head (the end nearer a corner): on the
  wall over a boxed bath (`isWallTap`), standing on the floor by a freestanding one — where it
  stands clear (`standsClear`: in the room, off the other pieces and a shower's tray, the joinery,
  a door's way and the floor the layout kept clear — tested as the solid it is, though its archetype
  is a ghost, `isPlacementValid(…, solid)`, and in the way of what the pass and the tidy-up move
  after it), else at the bath's other end, else a wall mixer
  over the head when the bath has a wall, and only else where it was put. The tidy-up after
  generating leaves it there (`settleToWalls` passes over a piece that travels with its host,
  `hostOf`): it had pushed a floor mixer back to the wall behind it, into the washer.
- **What the pass moves is tested as it is put** (`standsClear`): the washer is moved into a column
  beside the vanity only where it then stands clear, else its column is built where it stands
  (moved to the wall's end only where that is clear too, else round the machine as the engine put it).
- **Showers** (BA-11, BA-24): a 1.4 × 0.9 m walk-in from 7 m² (`SHOWER_LONG_M2`), its long side
  along the room's length (`alongLength`); a shower-door product is never taken for the shower
  (`isShowerDoor`) — the glass is built. Where a small bathroom would go without a shower, its
  fallbacks of the fourth round (decision 3.1, below) lay one across the end of a narrow room, wall
  to wall with glass in front, and at the last 70 × 90 — which `shower_too_small` still names, since
  Nini allows it "only if permitted by applicable regulations" and the app cannot know them.
- **WC** (BA-4, BA-5): it stands in the middle of its wall (+8 at the middle); a WC set down in the
  studio is boxed too (`withWcBoxes`). Its box (`wcBoxes`) stops at what stands on its wall
  within its depth beside the WC — a basin on a console, a shower's tray — as it stops at a door
  or a window, never short of the WC's own width; built after the basin stood, it ran into it.
- **Towel shelf and stool** (BA-19, BA-20): both from 6 m² in the bathroom's program, the stool 60 %
  of the time; the shelf only at the `premium` budget (`slotPool`), else the towels hang on the
  heated rail, which hangs over the WC — centred on it, its bottom 10 cm over the WC's box
  (`towelRailOverWc` in `radiators.ts`; `suggestRadiators` takes the furniture).
- **Light** (BA-21, WC-3): a bathroom's and a toilet's main light is spots down its length, at least
  three, one a metre or nearer, the gaps to the walls equal to the gaps between them
  (`wetRoomSpots`, `WET_ROOM_SPOTS`, in the standard fittings — the calculator's board too).

How stage 2 built it — **the kitchen**:

- **Island** (K-6, K-8): placed after the table and its chairs (the program's order), only where 1.2 m
  of floor stays free on every side of it — to the walls and to every piece (`ISLAND_CLEAR_M`), and
  nothing placed after it stands in that ring; beside a run, never a product with its own hob, oven,
  sink or burners (`slotPool`) — the screenshot's "second hob and oven" was such an island against a
  wall.
- **Hood** (K-7): the extractor's product is a round (cylindrical) hood first, then a thick one
  (50 cm or taller), a built-in insert last; nothing wider than 1.3 m — an island's suspended shelf
  frame is not a wall's hood (`equipmentCandidates`).
- **Sink and hob** (K-9): the made-to-measure run's model has both; a shop's run is taken by its
  kind (decision 9 of the fourth round: no shop names its sink and hob, so a name test kept every one
  out), when it has a run's shape — not tall units alone, an oven or a range cooker (`KIND_BOUNDS`) —
  and only when it fills 90 % of the run's wall (K-16) — else the run is made to measure along the
  whole wall.
- **Table** (K-10–K-12, L-6, L-8): 1.2 × 0.82 m at least (chairs at its ends too); 1.8 m
  in a long room (1.6 : 1 or longer); 42 cm or more from the walls for the chairs; with no room to
  stand free, against a wall (`placeAgainstWall`, the table's three open sides). Smaller only as the
  fourth round's fallback (decision 3.5): where no table for four fits — and in a kitchen under the
  10 m² a table for four needs — a compact two-seat table, 80 or 70 cm square, against a wall with
  its chairs facing each other along it (stage 4, below). A living room's
  table keeps 1 m from the sofa, the coffee table, the armchair and the TV unit
  (`DINING_LOUNGE_GAP_M`) and takes the spot with the most room round it, walls included.
- **Light** (K-13, K-14): the kitchen's row of spots runs along the run through the middle of the
  kitchen's floor — a studio's kitchen half, not the whole studio — (halfway to the table when the
  table's pendant hangs on that line); the light under the
  wall cabinets is set into their underside at their real height and length, the strip's lowest
  point there (`sitOnPoint` in `buildStructure`), so it never shows below them.
- **Style** (K-15, Y-7): the kitchen maker's material, the kitchen, the sofas, beds, baths,
  wardrobes and dining tables are drawn only from the style's own products when the catalogue has
  any (`STRICT_STYLE_KINDS`, `styleMaterials`).

How stage 3 built it — **the entrance and the living room**:

- **The hall's wardrobe** (E-4, E-6, E-7; `lib/design/hall.ts`, `fitHall`): in the hall with the front
  door, on a wall the hall is 1.4 m wide or more in front of (a shallow 38 cm one from 1.2 m) — the
  clear width square off that wall along its free span (`widthInFront`), so an L-shaped hall's narrow
  arm counts as narrow, not as its bounding box — one `cabinet` piece to the ceiling on the
  free stretch nearest the front door, 2.8 m at most: the `coats` (80 cm–1.4 m) by the door, the
  `shoes` (60 cm) past them, and a ventilated `boiler` section (65 cm, louvred) only where the flat's
  boiler (`plan.technical`, `fitHall`'s `technical`) hangs in this hall — wide enough for the boiler's
  cupboard — at the wardrobe, with no cabinet of its own: the section at the end of the wardrobe the
  boiler hangs at, the wardrobe its cupboard. A boiler with a cabinet, one elsewhere or none gets no
  section (the coats take the room; a hall wide enough for the cupboard still takes a wardrobe only
  on a stretch long enough for the section). It replaces the program's coat rack and shoe cabinet.
  The technical placement hangs a boiler the flat does not have yet in a section there is
  (`housedBoilerSpot`; `suggestTechnical` takes the decor) with no cabinet of its own
  (`cabinet: null`). A narrower hall keeps the coat rack (`prefer: 'near-entrance'`) and the shoe
  cabinet.
- **Mirror** (E-8): the hall's mirror is a tall flat one when the catalogue has any (140 cm or taller,
  `isFullHeightMirror`) **on a wall free from the floor up**: across from the wardrobe, where the
  hall pass hangs it on the facing wall's free stretch just off the floor (`fitHall` takes the
  catalogue's full-height mirror there), or where the engine laid the mirror's slot on a bare wall
  (`slotPool`). Over the console — or anything else standing under the slot — it is a mirror that
  hangs clear of the piece and under the ceiling: a 1.8 m mirror used to hang 30 cm off the floor
  behind the console.
- **Door mat** (E-9): in the hallway's program, on the floor inside the front door (`placeAtEntrance`).
- **TV out of the way** (L-5): a sofa spot whose floor between it and the TV wall crosses the way
  between two of the room's doors (a 70 cm strip, `passagePaths`, `viewingQuad`) scores 25 less.
- **Every window dressed** (G-20, L-11): curtains or a blind at every window of a room (the window
  archetypes' count is the room's windows), never left out at random.
- **Entrance screen** (L-13): none in an Industrial flat, nor in a studio under 30 m²
  (`withGeneratedPartitions` takes the style; `SMALL_STUDIO_M2`).

How stage 4 built it — **bedrooms**:

- **A wall of wardrobe** (B-9, B-10; `lib/design/bedroom.ts`, `fitWardrobes`): when the wall the
  bedroom's wardrobe stands on is otherwise free for 85 % of its length or more (a niche's back counts),
  a `cabinet` piece fills that stretch to the ceiling, in sections of 1.2 m at most, in place of the
  shop's wardrobe; and the room's chest of drawers goes (a desk or a dressing table is another slot
  and stays). The floor before its doors is judged by the fourth round's decision 4: 75 cm clear for
  hinged doors, 60 cm for sliding ones, else a shorter wall of wardrobe on the run whose front is
  clear (the chest of drawers then stays), else a shallow one, else the shop's wardrobe stays
  (`wallOfWardrobeFit` — [decor.md](decor.md)).
- **The bed, its nightstands and the wardrobe, together** (the fourth round's decision 3.2, built in
  its stage 2; `layoutBedroom` in `autoLayout.ts`, the numbers in `rules.ts`): a bedroom under 11 m²
  takes a single bed (`SINGLE_BED_UNDER_M2`). A larger one tries, in Nini's order, the 1.6 m double
  head on a wall, the 1.4 m double (`NARROW_DOUBLE_BED_M`), each with its long side on a wall — one
  side reachable, the one nightstand on the free side, the mattress under a sill
  (`BED_SIDE_HEIGHT_M`), never along a door — and last a single. **The wardrobe is a must**: in a room
  of any size, the usual one, else compact (1.0 or 0.8 m), else shallow (38 cm,
  `SMALLER_WARDROBES_M`), else with one nightstand instead of two, else none; then the next bed of the
  ladder. A double "fits" when its wardrobe and a nightstand stand with it, else the single; with no
  bed that leaves room for the wardrobe, the bed comes first. The essentials — the bed, the wardrobe
  and a nightstand — take the floor before the chest of drawers, the rug, the lamps, the plant and the
  stool, which are laid round them. Her first fallback, the door's smaller clear floor, is decision
  12's. The matcher follows the same order: a double of another style before a single, a single where
  no double fits — only a single a grown-up sleeps in (80 cm × 1.8 m or more, `KIND_BOUNDS`) — and
  the bed's slot as high as a headboard, never under a sill. Over 792 fixture flats every bedroom has
  its bed and its wardrobe (96 and 100 had none) — the numbers in
  [generation-audit.md](generation-audit.md) (M1, RB1). Not built of 3.2: storage round the bed (no
  product or joinery for it yet), and a sliding-door shop wardrobe (the catalogue does not say which
  are; a built wall of wardrobe slides where 60–75 cm is clear, decision 4).
- **Headboard** (B-6): a bed 1.2 m tall or more (`TALL_HEADBOARD_M`) has a headboard of its own; the
  AI designer's decor anchored on it is dropped (`proposalDecor`). The designer is told so per room
  (`bedText` in `aiDesign.ts`): whether the bed the engine laid takes decor behind it, and which of
  the beds it is offered are low enough to.
- **Stool** (B-8): in a bedroom's program from 12 m² (migration 0015 lists the stools on its shelf).

**The AI check and the engine's work**: the room check (`aiReview`) is shown the joinery, the WC's
box and the bath's enclosure as fixed and cannot move or remove them, nor move or remove a basin on
its vanity, the washer, the dryer, the taps, the bath's mixer or the door mat; a basin it replaces
stays on its vanity, and its alternatives are the style's (`slotPool` with the style). Before this,
the check moved a toilet's vanity to another wall — its sections lost — and swapped a bathroom's
countertop basin for a pedestal left at the vanity's height. And a fix that would stand a piece in a
cabinet or a box (the WC moved against the washer's column) is dropped (`inEngineDecor`). A bath
mixer the library filed under showers is never taken for the shower.

How stage 5 built it — **the whole flat**:

- **Main lights** (G-9, Y-3, Y-4, Y-6): a hall, a storage room and a closet are lit by their ceiling
  lights alone (no program pendant beside them — the screenshot's hall mixed the two). A
  Scandinavian, Modern or Vintage living room, bedroom or office of 10 m² or more keeps its one
  large ceiling light in the middle and gets four spots round it at the room's quarters
  (`ringSpots`, category secondary) — round the hanging lamp where it hangs once the ceiling light
  is its outlet (over the bed or the coffee table: decision 10b, `ringAround`).
- **Doors** (G-11, G-12, BA-25): laid out, an interior door takes an interior door product and the
  front door an entrance door when the catalogue has both — the flat's one front door (`frontDoor`:
  of the ways in, `isFrontDoor`, the hall's, else the first); any other door on an outside wall,
  a balcony's included, is a door; a door into a bedroom, a bathroom or a toilet is never a glass
  one (`isGlassDoor`) — `openingCandidates` takes the rooms on either side; one door and one
  window through the flat, of the style's the one nearest all its holes' widths together
  (`flatOpeningProducts`); the person's swap list still offers every door.
- **Panels** (G-23): a wall panel the designer asks for takes its whole clear stretch of the wall
  (`WHOLE_WALL`, its width asked ignored); it stays resizable by hand.
- **Sockets and switches on decor** (the owner, 6 Nov 2026): a fitting on a wall covered by decor —
  slats, a slab, a panel, cladding, tiles, a niche, a box, joinery — is drawn on the decor's face,
  not behind it (`decorFaceAt`; `buildElectrical` takes the decor).
- **Room crossings** (G-24): a skirting board or a cornice that reaches a room separator is cut
  square there, so the next room's run meets it flat — mitred against the separator, the two left a
  notch at the crossing.
- **Seams** (G-25): a colour map whose join jumps more than the image does anywhere inside it (a photo
  crop whose edges do not meet) is repeated mirrored on that axis when it loads (`fitSeams`,
  `lib/design3d/seams.ts`). It is conservative: none of the 51 shipped finish textures is changed (a
  checkerboard whose squares end at its edge tiles as it is and is left alone); a texture whose
  pattern simply does not repeat (the screenshot's arrows) needs a properly tiled image from the
  team.

How stage 6 built it — **the plan board**:

- **Inner walls** (P-1): with the dimensions layer on, every wall with a room on both faces (or one
  room round it) shows its length on a plate (`isInteriorWall` in `components/plan/draw.ts`); the
  outline keeps its outside chains; room separators are not measured.
- **Openings** (P-3): the selected window or door — and one being placed or dragged — shows its
  distances to the two ends of its wall, just inside the room (`drawOpeningOffsets`).
- **In line** (P-4): a window or door placed or dragged within 15 cm of the middle of one of its kind
  on an opposite wall snaps into line with it (`alignAcross`, `ALIGN_ACROSS_M`).
- **რიგელი** (P-2): the beam is რიგელი in Georgian (its tool, hint, layer, inspector, depth); "Beam"
  and "Балка" stay.
- **The hall** (E-10, P-5): the hallway type reads "დერეფანი / ჰოლი" (Hallway / entrance hall,
  Коридор / прихожая); a room still called "დერეფანი" counts as the app's name and is dealt again.

## The fitted pieces (owner, 13 Nov 2026)

Nine notes on what is built round the furniture, and the answers to the three questions asked:

1. **The boiler's cupboard is drawn** round the boiler, as joinery is
   ([technical-and-fittings.md](technical-and-fittings.md#equipment-is-bought-one-per-point-libdesignequipmentts)).
2. **Wall decor is moved by hand**, not only resized — joinery across the floor onto any wall,
   as furniture moves — and joinery's height and width change for real ([decor.md](decor.md#the-studio-decorpanel)).
3. **What is built for a piece goes with it** — a machine's column, a basin's vanity — and a piece
   whose housing was deleted has a button on its card that builds it again; the same for a boiler
   (its card's materials) and every piece that has one
   ([decor.md](decor.md#furniture-and-what-is-built-for-it-housingts)).
4. **A shower set down from the catalogue has its glass**, as a generated one does.
5. **A boiler outdoors** stands in a cupboard from the floor to the ceiling, insulated (the owner's
   photo). Answer: on a balcony only, in a thermal material of its own that admin prices
   (migration 0016); indoors the small louvred cabinet stays.
6. **A corner (L-shaped) kitchen**, as kitchen furniture like the run (its leg and its wall
   cabinets are copies of the run's pieces, not joinery). Answer: a switch on the run's card, and
   the generation turns the corner by itself for a short run ([../budget.md](../budget.md#a-corner-l-shaped-kitchen-libdesignkitchencornerts)).
7. **A WC's installation box moves with its WC.**
8. **Joinery overlaps nothing**: it stops at doors, windows, furniture and other joinery, and
   furniture is not dropped into it.
9. **Automatic technical placement in a furnished flat reads the furniture and the decor first.**
   Answer: new points keep clear; points already placed are left where they are
   ([technical-and-fittings.md](technical-and-fittings.md)).

## The fourth round: generation decisions (Nini, 23 Nov 2026)

The generation audit ([generation-audit.md](generation-audit.md#where-it-stands-18-nov-2026)) left 13
decisions only the owner could take; Nini answered each, with notes
(`docs/design-studio/ROOMIT-generation-decisions-Nini.docx` — the decision numbers below are its). Her
answers, as the app is to follow them, and the stage each is built in:

| # | Decision | Nini's answer | Stage |
|---|---|---|---|
| 1 | The TV unit's only wall is 3.7–4.8 m from the sofa | Keep the TV on that wall and **choose a larger screen the farther the wall** — agreed (23 Nov): about 55″ at 2.5 m, 65″ at 3 m, 75″ at 3.5 m and the catalogue's largest from 4.2 m (the fixture catalogue's largest is 65″: larger TVs are the team's to add) | 3 |
| 2 | No sofa spot gives the TV unit a wall (15 rooms) | Lay the space out as one: a studio's kitchen with an island that is also the dining table, the sofa's back to the kitchen and the TV on the blank wall; better, where the walls allow, the sofa on one wall, the TV opposite and the kitchen along the third, facing the living area | 3, 6 |
| 3.1 | Bathroom fallbacks | In order: the door's clear zone 70 cm and the door's width (where the door still opens and the way is usable) → a shower across the end of a narrow bathroom (glass, a curtain where very tight) → a shower instead of a bath → a smaller or wall-hung WC, a compact or corner basin → the mirror on another wall near the basin → a smaller shower (70 × 90 only where allowed and comfortable). Last resort: a sliding or outward-opening door. **Must-haves**: the WC, then the basin with its mirror and the shower (equal, in a flat's only bathroom), then the washing machine, and a bath only in a larger room | 1 (zone), 2 |
| 3.2 | Bedroom fallbacks | In order: a smaller door zone → a 1.4 m double → the bed's long side on a wall → no or a smaller wardrobe → one nightstand → a single bed. **A wardrobe is a must, smaller if need be**; a room under 11 m², or one no double or queen fits, takes a single bed; compact or sliding wardrobes, storage round the bed; essentials before lamps and accessories | 2 |
| 3.3 | Living-room fallbacks | In order: a 1.2 m TV unit → a two-seat sofa → the unit on a side wall → less room between the coffee table and the unit → a TV on the wall with no unit → no coffee table (she would rather have a console table behind the sofa — agreed 23 Nov; the catalogue has ten `console_table` products). The sofa may stand away from the walls, its back dividing the areas; smaller, round or nesting tables; a TV on a swivel bracket when it cannot face the sofa; **furniture chosen and placed by the room's proportions, walls, doors and circulation, not its area** (4.7 × 4.7 m takes a corner sofa, 2.75 × 8 m a straight one), the dining table towards the kitchen and the sofa and TV in the other part — no clustering in one half | 3, 6 |
| 3.4 | Studio fallbacks | In order: the kitchen placed by the doors, windows and water (not a fixed 35 % strip) → a smaller sofa → the sofa as the divider, back to the kitchen → the fridge as a tall unit at the run's end or under the counter → a shorter run → a TV on the wall with no unit. **The studio is one space**, not two rooms split by a line: the kitchen along one wall with an island or table before it and the sofa's back to it, or the kitchen at one end of a narrow studio; no clustering | 6 |
| 3.5 | Kitchen fallbacks | In order: the run on another wall so the table fits → the fridge on another wall → a shorter run → a smaller table, two seats or a counter → the L's leg under a window → an island. **Must-haves, unranked**: the sink, the fridge, the hob and the oven, and a dining table (or an island where there is room); then the cooking zone, then preparation worktop; a separate tall unit for the oven and microwave. Run: 1.8 m the preferred minimum, 1.5 m in very small kitchens, 1.2 m only in a compact studio. An island only where the geometry gives room all round (about 22–27 m², but by proportions, not area); a peninsula or breakfast counter instead where tight; the fridge–sink–hob relation kept | 4 |
| 3.6 | Washing machine, balcony | The machine in the bathroom, else the hall, else the kitchen, else the balcony; a laundry closet or a stacked washer-dryer integrated in joinery where there is room and connections. **Balconies are furnished**: a compact table and two chairs as the proportions allow, a folding table or one chair on a narrow balcony, planters that keep the way and the light | 4 |
| 4 | A wall of wardrobe's clear floor | **75 cm for hinged doors, 60 cm for sliding doors**; a shorter built wardrobe before giving up, a shallower one where 60 cm deep does not fit, else a compact shop wardrobe; bed, nightstands and wardrobe judged together | 1 |
| 5 | The boiler where the hall wardrobe is | **A ventilated section of the hall wardrobe**, its own compartment apart from the coats and shoes, in the wardrobe's materials, at the boiler's real position, with service room; a separate cupboard only where integrating it would cost essential storage or access; never a section with no boiler; never two enclosures for one boiler | 1 |
| 6 | The style's own floor; Industrial's slate | **The style's own floor first** in tiled rooms without water, not rigidly; a closed kitchen may continue the living room's floor; balconies only outdoor-rated, slip-resistant materials; finishes combined deliberately across the flat, not drawn room by room. The slate in bathrooms where it is technically wet-rated — else a wet-rated slate is added to the catalogue (admin's) | 1 |
| 7 | An outside door with nothing chosen | **A balcony door is priced in the windows' category** — a glazed door in metal-plastic, aluminium or wood, as the windows are — not as an entrance door | 1 |
| 8 | Decor beside low joinery | **Decor is a finish of the wall, free of the low joinery**: floor to ceiling continuing behind a WC box or vanity, from the top of the box to the ceiling, a part of the wall, or beside it — as the design intends, at the height the designer asked, clear of fixtures | 5 |
| 9 | Wrong catalogue products | **Both**: the team corrects kinds and sizes in admin (from a list the app gives) and generation refuses implausible products; shop kitchens taken by their kind | 1 |
| 10a | A plan without the AI designer | Say so plainly, without "failed", with an upgrade ("Your apartment has been generated using our standard design engine. To access AI-powered interior design … upgrade your plan"), and **tell before the generation starts** | 1 |
| 10b | A spot under a pendant | **Move the spot, don't drop it**, and lay the ceiling out as one: spots redistributed symmetrically round a pendant over an island; one pendant large, or 2–3 small ones centred over the surface they light (the coffee or dining table, the bed's middle) | 5 |
| 11 | An entrance screen that would hit an opening | **A shorter screen first**, 20 cm clear of the window or door (not in its swing or way), then a shallower lobby, then the screen square to another wall, then none; a screen meeting an open line stops short for a way through of **80 cm (90 preferred)**; a screen only where it really helps — not a cramped entrance in a small studio | 1 |
| 12 | A door's clear floor | **By room**: bathrooms and toilets 70 cm deep × the door's width; elsewhere 90 cm × the door + 10 cm each side; archways 55 cm — one rule for the layout, the products, the joinery and the check; the door's swing, access and the way on checked apart, and a layout that passes those three is not refused for the zone alone | 1 |
| 13 | A calculator pick that fits nowhere | In order: another position or turn in its room → move, shrink or drop the room's secondary pieces for it (a person's pick before the generated ones) → another room of the same type, saying so → left out of the 3D with a note, kept in the list ("This item could not fit in the selected room…"). Never outside the room or overlapping, never resized; placed and unplaced picks told apart | 5 |

The stages (1 to 6 built, 23–24 Nov 2026): **1** the contained rules (door zones, built wardrobes, the hall's boiler section, screens,
the balcony door's price, the plan message, the style's own floor, catalogue checks); **2** bathroom
and bedroom fallbacks; **3** the living room and the TV; **4** the kitchen, the washing machine and
balconies; **5** decor over low joinery, the ceiling's lighting as one, the calculator's picks; **6**
laying a studio or an open living room out as one space by its proportions — the largest change, the
layout engine's.

**Stage 1 is built** (23 Nov 2026): door zones by room, built wardrobes by door type (hinged 75 cm,
sliding 60 cm, shorter and shallower before a shop wardrobe), the hall wardrobe's boiler section,
entrance screens shortened, made shallower or turned before none, the balcony door priced as a
window, the style's own floor first, catalogue bounds per kind with the team's list
(`pnpm audit:catalog-kinds`), shop kitchens by their kind, the plan message — each topic document
holds the detail, and generation-audit.md items X5, W3, W6, Q4, F3, Q7b, K1–K4 and P1 the numbers.
Not built of stage 1: outdoor-rated balcony finishes (no finish says it is), a closed kitchen
continuing the living room's floor, finishes chosen as one design across the flat, and a zone relaxed
where the swing, the access and the way on all pass.

**Stage 2's bedroom (3.2) is built** (23 Nov 2026): a single bed under 11 m², and where the bed has no
slot the 1.4 m double, the bed's long side on a wall, one nightstand, then a single; the wardrobe always
comes back, smaller if need be — bedrooms without a bed 96 → 0 and without a wardrobe 100 → 0 in 792
flats (the detail in the bedrooms section above and in layout-and-matching.md). Not built: storage round
the bed, a sliding-door shop wardrobe (no product or joinery for either), and the catalogue has no 1.4 m
double but Vintage's 1.49 m bed, no Modern single and no Industrial compact wardrobe.

**Stage 2's bathroom (3.1) is built** (23 Nov 2026): where a bathroom or a toilet would go without an
essential — the WC, the basin, its mirror, a bathroom's shower or bath — her fallbacks are tried in her
order, each only then: the shower across the end of a narrow bathroom (glass in front; no curtain —
the app draws showers with glass only), a shower instead of the bath (and a bath without the shower
beside it), a smaller WC (48 cm before its box) and a compact basin (45 × 35), the mirror on the stretch
of wall nearest the basin, a 70 × 90 shower last; a layout is kept only when it ranks higher by her
must-haves (the WC; the basin and the shower, equal in a flat's only bathroom; the mirror; the washing
machine; a bath), leaves a way to every fixture and the basin's socket out of the splash zone. The
bathroom's program lists its fixtures in that order. Not built: a corner basin (the catalogue has
none), a curtain instead of glass, and her last resort, a sliding or outward-opening door — the rooms
still without a shower are the ones a door leaves no floor for (the detail and the numbers:
[layout-and-matching.md](layout-and-matching.md), generation-audit.md M1).

**Stage 4 is built** (23 Nov 2026): the kitchen (3.5), the washing machine and balconies (3.6). Where a
kitchen would go without its run (its sink, its hob and the oven under it), its fridge or its dining
table — a must-have in a kitchen of any size — or its worktop (the run and the leg it turns round its
corner) is short of 1.8 m, her fallbacks are tried in her order, each laid without a draw and kept only
when it has more of the must-haves (or as many and a longer worktop), takes no piece the kitchen had
and leaves the worktop no shorter than 1.5 m (a studio's kitchen 1.2 m): the run on another wall; the
fridge stood first on a wall of its own; a shorter run slid along its wall with the fridge hard beside
it (down to a 1.2 m run, a 1.98 m wall taking it and a 72 cm fridge); a compact two-seat table, 80 or
70 cm square, against a wall. A kitchen that has everything is laid as it always was. The washing
machine goes to the balcony after the hall and the kitchen, against a wall, the balcony laid round it.
Every balcony is furnished: a compact table against a wall away from the door, two chairs facing each
other along it from 1.5 m deep, one on a narrower balcony, and planters in its corners off its windows
and its door; its table is a product of the slot's size at most, its chairs café chairs (60 × 55 cm,
1 m high at most) — and what it takes is not counted against the flat's rooms' draws. In 792 fixture
flats: kitchens without a table 160 → 24, kitchens and studios without a fridge 72 → 48, flats without
a washing machine 72 → 24 (48 on a balcony), balconies furnished 56 → 672 of 672 (the detail in
[layout-and-matching.md](layout-and-matching.md) and generation-audit.md RK1–RK4, RS3). Not built:
her fifth fallback needs nothing — the L's leg already runs under a sill at the worktop or above; an
island stays where its 1.2 m ring fits, and none is ever matched (no island product fits its slot and
the kitchen maker has no island material); a peninsula, a breakfast or bar counter and the separate
tall unit for the oven and the microwave need a joinery piece the made-to-measure kitchen does not
have (the run is one piece, its sink, hob and oven taken to stand in it — `kitchenRunZones`); a
stacked washer-dryer is the washer's column the bathroom pass builds in whatever room the machine
stands (a dryer on it at the top budget), not a laundry closet; no catalogue product is outdoor-rated;
#408's 6.5 m² kitchen keeps its run and leg without a fridge — the fridge fits only with a 1.2 m worktop
her rule allows a studio alone.

**Stage 3, the living room and the TV (decisions 1, 2 and 3.3), is built** (24 Nov 2026): the TV
stays on a real wall however far, and the matcher takes the screen the sofa's distance asks for —
about 55″ at 2.5 m, 65″ at 3 m, 75″ at 3.5 m, the largest from 4.2 m, the smallest at least as large
where the catalogue has one (`tvInchesFor`). Where the sofa against no wall gives its TV a wall, the
sofa stands free with its back to the open line, 90 (80) cm of way kept behind it, facing its TV on
a wall (decision 2). Where neither does, her fallbacks in her order: a 1.2 m unit, a two-seat (a
corner sofa's three-seat first), the unit on another wall in front of the sofa or a side wall, 45 cm
between the coffee table and the unit, a TV on the wall with no unit, and last no coffee table with
a console table behind the sofa; a smaller (round, nesting or side) table where the usual one does
not fit, else the console. A fallback is kept only where the whole room keeps its pieces (its unit
may give way to the TV on the wall, its table to the console); else the first that gives a room the
sofa or TV it went without. The corner sofa goes by the room's proportions — both sides of its floor
3.8 m or more (4.7 × 4.7 m takes one, 2.75 × 8 m does not), and only where its TV then stands on a
wall. Over 792 flats (6 draws): living rooms without a TV 120 → 0 and without any screen on a wall
— unit on an open line or free on the floor — 172 → 4; studios without a TV unit or TV 188 → 0,
without a sofa 48 → 0; 40 living rooms have the TV on the wall with no unit, 12 studios a console
behind the sofa. The detail: [layout-and-matching.md](layout-and-matching.md), generation-audit.md
O7 and RL1–RL6. Not built: a swivel bracket for a TV that cannot face the sofa (a piece has no
field to say it), TVs over 65″ (the catalogue's largest — larger ones are the team's to add; the
layout's slot already widens for them), a two-seat sofa kind (the three-seat's slot laid narrower),
and her "distribute the furniture, don't cluster" and the studio as one space — stage 6.

**Stage 5's decor (decision 8) is built** (24 Nov 2026): wall decor is a finish of the wall. Over low
joinery — a WC's box, a vanity, a washing machine's column, a bath's box, anything built no higher
than 1.3 m — a slat field, slab, panel, cladding or mural is placed **full height** (floor to ceiling,
behind the box or the vanity), **above** (from its top to the ceiling or the height asked),
**partial** (the width and heights asked, behind it where it reaches it) or **beside** (off its
stretch, as before); the AI designer chooses per piece (`placement` in its schema, plainly offered in
the brief, with a `toilet` anchor to centre a piece on the WC and its box), and where it does not —
and in the studio's card, which offers the four for a piece over low joinery — the engine places it
**above**: her own example, the box's top carried as a line, no material bought behind the box,
nothing on its face or on a vanity's top in its way. Whatever the placement it keeps clear of the
mirror, the basin, its tap, a bath's wall mixer, a radiator, the doors and the windows, and sockets and
switches are wired after it on its face; tall joinery (a wardrobe, a box to the ceiling, a corner
leg's wall cabinets) still keeps it beside, and over a washer's open column or a bath's box, where
what stands in them stands against the wall, full or partial goes above. A full-height piece is
bought as the wall clad, the part behind the box included. With a stand-in designer asking each
covering family on every bathroom or toilet wall with low joinery of 792 flats: on the 792 WC-box
walls 0 → 2,659 pieces above the box (2,490 floor to ceiling behind it when asked full height), beside
2,291 → 194, left out 877 → 315; on the 565 vanity walls 0 → 436 above the vanity, beside its basin
and mirror 1,433 → 1,049; decor on a radiator 255 → 0, on a tap or a wall mixer 30 → 0 — the detail in
[decor.md](decor.md#decor-over-low-joinery-overbuiltts), generation-audit.md W4. The engine alone
lays no designer decor, so `pnpm audit:generation` is unchanged. Not built: the box's front taking
the decor's own material for one continuous surface, a niche over the cistern, decor above a box
under a window, and decor following a box moved by hand.

**Stage 5's ceiling lighting (decision 10b) is built** (24 Nov 2026): the ceiling is laid out as one
(`lib/design/ceilingLights.ts`). A pendant hangs centred over what it lights — a kitchen's dining
table, else its island; a living room's dining table, else its coffee table; the bed's middle — and
in the middle of the room over nothing to light, or where the bed is a four-poster no lamp may hang
over. One pendant is a large one (round, 45 cm to 1 m across); over a dining table or an island of
1.4 m or more, two small ones (round, 12–40 cm), from 1.8 m three, evenly down its length, the same
lamp each (`PENDANT_*` in rules.ts: 1.4 m is where a table seats six; two lamps then hang 70 cm apart
and three 60 cm, inside the seats). The matcher prefers the size among the lamps that hang clear and
matches what hangs from the ceiling after what stands under it; the AI designer is offered only
lamps of the size its slot takes, and its lamp is hung by the same rules. **Spots are moved, never
dropped**, 30 cm clear of a shade (`SPOT_PENDANT_GAP_M`): a kitchen's row laid again symmetrically
either side of the lamps (an odd row gains a spot), or moved whole up to 60 cm off them where the
lamps take most of its length; an industrial bedroom's track moved whole; the ring of four round a
large light laid round the lamp where it hangs. **No excess**: a hanging lamp over a coffee table or
a bed is the room's main light (the ceiling light becomes its outlet, wherever it hangs); a lamp over
a dining table or an island is the table's own layer (a kitchen keeps its row of spots and the light
under the cabinets, a living room its ceiling light over the sitting area); never a ceiling light
beside a lamp, never a spot under one. 792 flats: spots dropped for a lamp 342 → 0, spots under a
shade 48 → 1, lamps centred over what they light 495 → 2,306 of 2,516, lone lamps a median 8 → 65 cm
across, two or three small lamps over 142 kitchens' and 99 living rooms' tables, pendants into a bed
gone from the baseline's flats; lights per m² — kitchen 0.29 → 0.32, living room 0.15 → 0.18,
bedroom 0.25 → 0.27. The detail: [technical-and-fittings.md](technical-and-fittings.md),
generation-audit.md O8. Not built: lamps over an island beside the kitchen's table, a lamp over the
coffee table in a living room with a dining table, lamps following a table moved in the studio, and
the catalogue's gaps (a four-poster in a small bedroom leaves only a tiny lamp; Scandinavian has three
large round lamps, Vintage three small).

**Stage 5's calculator picks (decision 13) are built** (24 Nov 2026): a furniture pick that fits
neither its slot nor its kind's spot is tried, in her order, elsewhere in its room — every stretch of
every wall with its back to it, a bed, a desk or a table with its side to it, free floor for a table
or a chair (`pickPoses`); then with the room's secondary pieces making way — the fewest and least
important first, each moved, else given a smaller product of its kind ("resize" is a smaller product,
never a stretched model), else taken out; never a pick, a piece placed in the studio, a locked one, a
piece a pick stands at, nor what the room is for (the bed, the wardrobe, the sofa, the TV unit, the
kitchen, the bathroom's fixtures, the desk, a kitchen's table — `pickKeeps`); then in another room of
the same type, the piece saying the room it was picked for (`pickedFor`); and else it is left out of
the 3D, its slot keeping the style's piece, recorded in the generation (`unplacedPicks`) and still in
the calculation's list and summary. Each step keeps a door's way clear first; a pick is fitted as
built (no shower's tray, a WC's box), clear of the joinery, at its own size, never out of the room or
in another piece. The studio lists the picks — in their room, moved (and from where), or not placed
with her message ("This item could not fit in the selected room…", in Georgian, English and Russian)
and a "place" button that puts it on the pointer — says over the canvas how many were left out or
moved, and a moved piece's card says so. In 264 fixture flats with 5,016 picks: out of the room 373 →
0, in another piece 302 → 0, in a shower's tray or joinery 198 → 0, dropped without a word 228 → 0;
73 moved to another room, 398 left out and listed (the detail: [layout-and-matching.md](layout-and-matching.md#a-calculator-pick-that-fits-nowhere-placefurniturepicks-libdesignpickfitts),
[studio.md](studio.md#the-calculators-picks-in-the-studio), generation-audit.md Q1). Not built: a pick
may still stand on a door's clear floor or a radiator's strip where only the last pass (the room and
the pieces alone) has a place for it (169 and 32 of 4,283 placed) — whether it should rather be left
out is hers; a moved pick leaves the rug, the TV and the joinery of the piece it replaced at the old
slot; picks put into a flat already laid out (in the studio) skip the second step, the flat being the
person's.

**Stage 6, the studio and the open living room as one space (decisions 2, 3.3 and 3.4), is built**
(24 Nov 2026): a studio is laid out as one space by its proportions, not two rooms split by a line of
a third. Where the line is the app's (none, the first line, or one a generation placed), generation
tries the kitchen part at either end of either axis, 2.0–3.6 m deep, each with the living half's sofa
against a wall and standing free with its back to the kitchen, lays each out whole and scores it:
the essentials (the run, the fridge, the dining table or an island, the sofa, a TV), **the run by the
studio's water** (its sewer or water points, else the wall of a bathroom beside it), **off the front
door** and out of what it sees, the TV on a real wall at 2.5–3.5 m, the sofa's side to the kitchen
(her "better still": the sofa on one wall, the TV across, the kitchen along the third) or its back to
it as the divider — never facing it — the dining table before the kitchen and out of the sitting
group, a way from the door to every zone and no door's swing blocked; the line chosen is written onto
the plan (the board, the estimate, the matcher, the wiring and the AI designer's brief all see it)
and a line the person set is kept. The kitchen half seats the studio at any size, its table in front
of the kitchen; where it has no floor for one the living half lays it in a zone along the line, the
sofa's group beyond. **A studio's sofa is a three-seat, else a two-seat — never a corner sofa.** A
living room with a dining table is laid out as two functions: a zone at one end of its long side kept
for the table, toward the kitchen across its open line, the sofa and the TV in the rest — the corner
sofa tried against a three-seat — and the living room's ladder may give up optional decor for its
TV's wall. "No clustering" is measured (`clustered` in the whole-flat check): the table within 1.2 m
of the sofa, or nearer the sitting group than 40 % of the room's long side (3 m at most). 792 flats
(6 draws): studios without a run 24 → 0, without a fridge 24 → 0 (#386's kitchen is by its water now,
#384's has its fridge), without a dining table 128 → 0, corner sofas in studios 43 → 0, the TV on a
real wall in studios 240 → 240 and in open living rooms 404 → 408, living rooms without a TV unit
40 → 0. Both scores hold the sofa and its screen facing each other (`sofaFacesScreen`: each within
30° of the other; a TV at the right distance on the sofa's side wall loses 40 — scored by distance
alone, a side wall won and the TV faced the sofa in 58 % of living rooms and 38 % of studios), and a
studio's run by its water (within a metre, `RUN_BY_WATER_M`) is taken before any score: the sofa
facing its TV in living rooms 87 % → 82 % (the rest in #358, #359 and #368 — her side-wall unit,
before the TV hung with no unit, now reached by giving up decor — and #408), in studios 70 % → 80 %
(#386's by its water is not); sofa–TV 2.3–3.7 m in studios 201 → 139 (facing, a small studio's TV
stands about 2.6 m off) and open living rooms 271 → 331; `sofa_tv_distance` 290 → 315,
`sofa_tv_off_axis` 140 (a measure); open living rooms' tables clustered 34 → 28 of 144, zones not
walked to 18 → 8; studios' 26 of 112 tables → 66 of 240, zones not walked to 6 → 3. The
detail: [layout-and-matching.md](layout-and-matching.md), [plan-board.md](plan-board.md),
generation-audit.md RS1, RS2 and M4. Not built: an island that is also the dining table (no island is
ever matched); the fridge built into the run, a tall unit at its end or under the counter (a joinery
piece the kitchen maker does not have — the shop's fridge stands hard beside the run); a studio's
table kept out of the sitting group where its kitchen part is too shallow for the table and a way
behind the sofa (#389, #392); #386's kitchen by its water stays in the front door's sight, #384's and
#389's run within 1 m of the front door.

## The decisions (owner, 28 Oct 2026)

**Part 1 — technical**

- **Radiators**: bottom 12 cm off the floor (`RADIATOR_FLOOR_GAP_M`), 4 cm off the wall
  (`RADIATOR_WALL_GAP_M`), their top at least 10 cm under the sill (`RADIATOR_SILL_GAP_M`). Each
  radiator takes the tallest radiator product that fits under its window; a window too low for any
  (a floor-length window) gets its radiator on the nearest stretch of the same outside wall beside
  it. The layout keeps furniture out of a strip in front of every radiator
  (`RADIATOR_KEEP_CLEAR_M`). Curtains stay floor-length, hung from just under the ceiling.
- **Boiler** (superseded on 29 Oct by the second round, above: the hall's cupboard, the balcony,
  the bathroom): on an outside wall, in a utility (storage) room with an outside wall, else the
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
  `DISHWASHER_WATER`, the pieces fed cold and hot (`COLD_WATER_SLOTS`, `HOT_WATER_SLOTS` — what the
  layout draws to the pipes and the step's hints are named against), the pair's spacing,
  `SHAFT_FIXTURES` and `SHAFT_MAX_DISTANCE_M`. The wet rooms, `WET_ROOM_TYPES`: a bathroom and a
  toilet — a table of its own, today with the members of the calculator's `BATH_ROOM_TYPES`, so a
  change to the calculator's tiling does not move the design's doors, mirrors and finishes (its
  rooms with water, the kitchen too, are `WATER_ROOM_TYPES`).
- `minDoorWidthM(type)` and `doorWidthFor(type, other)`: a new door is 80 cm, 70 cm when either
  room is a bathroom or toilet, 90 cm to the outside (`addOpening`; `deriveOpenings` too).
- **A door's clear floor** (decision 12): `doorClearFloor(roomType, opening)` — in a bathroom or a
  toilet 70 cm deep × the door's width (`WET_DOOR_FLOOR_DEPTH_M`), in every other room 90 cm × the
  door + 10 cm either side (`DOOR_FLOOR_DEPTH_M`, `DOOR_FLOOR_SIDE_M`), an archway 55 cm
  (`ARCHWAY_FLOOR_DEPTH_M`); measured in the room it lies in (each room's copy of the opening by
  that room's type); in a bathroom or a toilet also the leaf's sweep of a door swinging into it
  that is wider than 70 cm, so the door still opens. `doorZones(edge, opening, roomType)` draws it
  (`doorFloor`) for the layout engine's keep-outs, `inDoorway` (the later passes, the matcher, the
  whole-flat audit) and generation's joinery
  ([layout-and-matching.md](layout-and-matching.md#the-design-rules-in-the-layout-libdesignrulests)).
  `WC_AS_BUILT_DEPTH_M` (a wall-hung WC's 54 cm and its box's 20) is how deep the layout lays a WC
  out, so its box does not stand it into that floor.
- The layout's numbers (`BED_SIDE_FREE_M`, `SOFA_TV_M`, `COFFEE_TABLE_GAP_M`, `TV_CENTRE_M`,
  `DINING_SEAT_M`, `FACING_COUNTERS_M`, `WALL_UNIT_BOTTOM_M`, the wardrobe depths, `SHOWER_MIN_M`,
  `WC_SIDE_M`, `BASIN_TOP_M`, `SPLASH_ZONE_M`; the fourth round's kitchen worktop `KITCHEN_RUN_M`
  — 1.8 m preferred, 1.5 m in a very small kitchen, 1.2 m in a studio's — the compact table's sides
  `COMPACT_TABLE_SIDES_M` and its slack, and a balcony's `BALCONY_TWO_SEATS_M` and
  `BALCONY_CHAIR_MAX_M`) and the geometry they need — the archetypes read
  them rather than repeating them (`catalog.ts`: the coffee table's gap, the TV's centre, the wall
  cabinets hung from `WALL_UNIT_BOTTOM_M`, itself the worktop's `KITCHEN_WORKTOP_M` and the 55 cm
  over it); `footprintQuad`,
  `quadsOverlap`, `rayToPolygon`, `doorSightBand` / `roomSightBands` / `entranceSightBands`,
  `roomNiches`.
- `backWallOf`, `alongWall`.
- The living room's (the fourth round's decisions 1, 2 and 3.3): `tvInchesFor` (the screen by the
  sofa's distance, `TV_INCHES_BY_DISTANCE`, `TV_LARGEST_FROM_M`, `TV_WIDTH_PER_INCH_M`), the
  fallbacks' numbers (`TV_UNIT_NARROW_M`, `TWO_SEAT_SOFA_M`, `TV_UNIT_CLEAR_MIN_M`,
  `CONSOLE_BEHIND_SOFA_M`, `SMALL_COFFEE_TABLE_M`, `TV_SIDE_MIN_M`), the free sofa's way
  (`SOFA_OPEN_LINE_WAY_M`), and the corner sofa by proportions (`floorRectangle`, `cornerSofaFits`,
  `CORNER_SOFA_SIDE_M`).

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
  its top; a curtain or a rug does not count — and, for a heated towel rail, only a piece standing up
  into the rail where it hangs, never the WC under it), `radiator_under_sill` (a radiator's top within
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
  within 60 cm of a bath or of a shower's tray — `wetFootprints`, `inSplashZone`; the wiring places
  the basin's socket by the same measure). Worded by `components/design/ruleText.ts`.
- `radiatorKeepouts(plan)`: the strips (the radiator's length plus 5 cm each end, its depth plus
  30 cm) as boxes per room, which `generateScene` adds to the layout engine's obstacles and hands
  to the kitchen's corner pass (`fitKitchenCorners`) — read once, off the plan itself. A towel
  rail hung over a WC (90 cm up or higher) has none; one hung lower keeps the strip
  ([technical-and-fittings.md](technical-and-fittings.md#known-gaps)).

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

- From the third round's stages 5–6: "move the beam" (P-2) was read as renaming it; its place in the
  toolbar is unchanged. A wall panel's door is not yet built into the panel (G-23: the panel takes
  the whole wall, the door keeps its own leaf). Walls and beams line up through the board's existing
  snapping guides; only openings snap across the room (P-4). A finish texture whose pattern does not
  repeat cleanly (the arrow pattern in the draft's screenshot) is not caught by the seam check and
  needs a properly tiled image.

- From the third round's stages 3–4: no clothes rack (B-5) — the catalogue has no such product; a
  balcony closet's mirror (S-2) is not decided by its corners yet; "wider passages" and "use the whole
  room" (L-9, L-10) are the existing tight-passage scoring, not rules of their own; the hall wardrobe's
  sections cannot be edited on its card; a boiler already placed before the wardrobe stays where it is.

- From the third round's stage 1: a cabinet's sections cannot be added, removed or re-ordered on
  its card (they are resized with the piece); a basin set down from the catalogue gets its vanity
  but no tap of its own. Vintage's bath enclosure is a tiled surround, not a raised alcove.
- From the notes of 13 Nov: a housing follows its furniture on release, not live; a corner leg has
  no sockets of its own, and a kitchen model whose sink is part of its worktop's mesh shows a second sink on the leg; the thermal cupboard's price is a placeholder
  for admin to set; a point placed before the furniture is not moved when furniture later stands
  in front of it (the rule checks flag a blocked radiator only).

- From the second round's stage 6: a shower's glass in 3D follows a dragged shower on release, not
  live; a pane has no door drawn in it (a walk-in screen leaves its open end). The en-suite's lobby
  is a screen in front of its door — the owner's "entrance enclosed beside the wardrobe" read as
  that; the wardrobe is not yet pushed against it. The AI designer is not told about the
  partitions (they come after its answer, and the room stays one room). A partition the person
  draws is not run on to the corner: the rule is the app's own partitions'.
- From the second round's stage 5: a blind's look is not chosen by the room beyond the style's
  tags (white, charcoal, linen); the blinds are drawn let down a third, whatever the time of day.

- From the second round's lighting: no track-light product exists, so a track is a row of
  cylinder spots; bedside lighting is the wall lights over the nightstands (a pendant each side
  would need a low-hung pendant model); a living room's large chandelier is the matcher's pendant —
  a large one (45 cm to 1 m) wherever one hangs alone since decision 10b, but not chosen by the
  room's size.
- From the second round: no dressing table in a large bedroom yet — the catalogue has no dressing
  table or stool (the owner is sending references); the bedroom keeps its dresser from 13 m². A
  wine cabinet is the bookcase until the catalogue has one; a bathroom's storage cabinet likewise
  waits for a product. A bath has no shower of its own drawn yet — it is taken to have one. The
  bedside tables are not turned (allowed, not asked). Moving the walls for privacy is stage 6.

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
- A sofa stands free only with its back to an open line (decision 2): a closed room too wide for the
  sofa–TV range keeps its sofa against a wall and its warning — the TV stays on the wall (decision 1).
- A recess in a room's corner (open on one side) is not found as a niche.
- Circulation (100–150 cm paths) is the existing tight-passage warning (`clearance.ts`), not a
  check of its own; IP44 sockets are not a product attribute, only the splash-zone warning.
- The boiler's cabinet is not drawn in 3D.
- The catalogue's lamps carry no `specs.cct` yet, so the lamp preference waits for products that
  say; the sub-style is not recorded in `scene.generation`.
