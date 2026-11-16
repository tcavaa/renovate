# Generation audit (16 Nov 2026)

What generating a flat really does today — read from the code and measured on real plans — and
what is wrong with it: pieces it leaves out, clashes it creates, products it can never place, where
the AI designer and the engine disagree, rules stated twice with different numbers, and code written
more than once. This is the list to work from, before the owner's per-room rules are written in:
an item is ticked (`[x]`) in the commit that fixes it, with the new behaviour described in the topic
document, and the numbers in section 3 are as measured on 16 Nov 2026, before any fix —
`pnpm audit:generation` gives today's.

Related: [layout-and-matching.md](layout-and-matching.md) (the engine and the matcher) ·
[decor.md](decor.md) (the AI designer, its check, the joinery) · [design-rules.md](design-rules.md)
(the owner's rules and `rules.ts`) · [technical-and-fittings.md](technical-and-fittings.md) ·
[../roadmap.md](../roadmap.md).

## How it is being fixed

Decided with the owner on 16 Nov 2026:

- **Bugs only, for now** — what is wrong under any rules: pieces left round a piece that is gone,
  a TV unit on a room separator's line, joinery built into the shower, a basin hanging in the air,
  sockets in radiators, a pick placed with no fit test. **No fallback ladders yet** (a smaller or a
  single bed, the TV before the coffee table, a shallower door zone, a studio's line placed by its
  doors): which piece gives way to which is the owner's to say, room by room, and those rules come
  later. So a room that loses a piece today for want of a ladder (M1, RS1–RS3, RL2–RL5, RB1,
  RK1–RK4) keeps losing it — and no fix may make a room lose a piece it has today.
- **Strict style has a way out** (M2): when nothing of the style fits a slot, a smaller piece of
  the same style (a three-seat in place of the corner sofa), then the nearest other style's piece
  that fits — never an empty slot with the room arranged round it.
- **In batches**, each tested, measured and pushed to `main` on its own.

**How a fix is measured.** `pnpm audit:generation` generates every fixture plan
(`tests/fixtures/generation`: the app's sample flat and 29 plans of the team's test projects, with
the catalogue as it was on 16 Nov — 1,341 products) in each style, several draws, and checks each
finished flat as a whole (`lib/design/sceneAudit.ts` → `auditScene`): what each room ends without,
what no rule allows, and which of the app's own rule checks the flat fails. `--examples` says where
to look and `--flat '#412/modern/1' [--room r2]` prints one flat. The first draw of every plan and
style (120 flats) is the baseline (`tests/fixtures/generation/baseline.json`), and
`tests/unit/design/generationInvariants.test.ts` fails when any count rises — or falls without
being recorded (`--write-baseline`, which refuses a baseline that is worse). So each fix lowers a
number in its own commit, and nothing slides back.

## How it was audited

- **Read**: `generateScene.ts`, `autoLayout.ts`, `catalog.ts`, `matcher.ts`, `rules.ts`,
  `ruleChecks.ts`, `bathroom.ts`, `hall.ts`, `bedroom.ts`, `kitchenCorner.ts`, `productRoles.ts`,
  `aiDesign.ts`, `aiProposal.ts`, `aiReview.ts`, `lib/api/designJob.ts`, the parts of
  `manipulate.ts`, `shower.ts`, `decor/joinery.ts` and `styleGuide.ts` they call, at commit
  `9d7e68a3`. Side reviews covered the technical placement and duplicated code across
  `lib/design/`; their claims quoted here were spot-checked against the source unless marked *(not
  re-checked)*. The technical findings (G) and five mechanisms first inferred from reading were then
  each handed to an independent reviewer told to refute them by running the code: 16 were
  confirmed and 3 corrected (the corrections are in the text).
- **Second round**: eight narrower reviews, each with its own scripts on the same plans — the root
  causes of what studios, living rooms, bedrooms and kitchens lose (L), floors and walls (I), the
  partitions, doors and windows and the calculator's picks (M), the generation job (N) and the
  generation tests (O). The job and the tests, which rest on reading, were each put to a skeptic: 15
  findings confirmed, 5 corrected. Their largest claims were re-run for this document. The saved
  measurements of an earlier, interrupted round on the joinery and the wall decor are in H.
- **Caveats**: the plans are the team's test projects (several have very small or oddly shaped
  rooms), so the rates say how often a thing happens *on these plans*, not on every flat. A stand-in
  designer picks at random where Claude would pick the style's own, so its "pick lost" rates are an
  upper bound; the structural point (it is offered what the engine refuses) holds either way. Four
  rooms are not credible (a 0.77 m² bathroom, three bedrooms under 7 m² or 2.2 m wide); without
  them the rates move by 0–4 points (no shower 36 → 33 %, no bed 14 → 12 %, no TV unit 20 → 20 %).

## The short version

1. **A piece that cannot meet every rule is dropped, never downgraded.** There is no "try a smaller
   bed", "relax the door zone" or "drop the coffee table before the TV". On the test plans 36 % of
   bathrooms end with no shower or bath, 11 % with no WC, 14 % of bedrooms with no bed, 20 % of
   living rooms and 77 % of studios with no TV. Each loss is traced to its rule in L, with what one
   change brings back: a second try for the bed and any style when the style's own does not fit
   give every bedroom a bed (1,293 → 1,504 of 1,504).
2. **The room is laid out with one set of sizes and furnished with another.** The engine places
   archetype boxes (a 1.6 m bed, a 1.8 m wardrobe); the matcher then swaps in products that are
   often 25 % or more wider or narrower, and its fit test knows nothing of the door zones, radiator
   strips or working floors the engine kept clear. That is where most "overlaps" come from.
3. **"Strictly the style's own" has no way out when nothing of the style fits.** Vintage has one
   corner sofa (4.17 × 3.47 m): every Vintage living room of 22 m² or more is generated without a
   sofa — with the coffee table, armchair, rug and TV still arranged round the gap.
4. **Studios are the weakest room**: each half is laid out as a room of its own and most lose the
   lounge. And in a living room that opens onto another room, the TV unit is stood on the open
   line between them (57 % of living-room TV units on these plans).
5. **There is no single answer to "what floor does this piece take".** A shower's tray, a WC's
   80 cm, a door's zone (five definitions), a radiator's strip (two) and the kitchen's working floor
   (three) are each known to some code and not to the rest. The vanity is built into the shower
   tray in 9 % of flats; a wall of wardrobe is built with the bed or a nightstand within 30 cm of
   its doors in a third of the bedrooms that get one; 15 % of bathroom basins hang in the air where
   their vanity could not be built.
6. **The AI designer is asked before the room is laid out and offered products the engine will
   refuse**; 27 % of the pieces it chooses a product for do not exist in the finished room. Its check
   is told that every WC "stands off its wall" (the engine's own box), may move a kitchen run away
   from its wall cabinets and fridge, and may take out a room's blinds and main lamp.
7. **The generator breaks its own rule checks** more than once a flat (bed sides, WC in the
   door's sight, pieces in a door's swing, basin height, sockets in the splash zone).
8. **About 160 of the 934 furniture products never appeared** in 1,080 flats, at least 100 of them
   by rule: no shop kitchen (40), no island (9), no storage shelf (22), no bedroom rug (the slot has
   no product), misfiled taps, mixers and shower doors, pendants longer than 90 cm.
9. **The catalogue is trusted blindly**: 77 % of "floor lamps" placed are table lamps under 1 m,
   42 % of "fridges" are under-counter coolers, door mats are 2 m wide, vases hang as wall art.
10. **Sockets, radiators and technical points are placed by two automata that never read each
    other**: 39 % of general sockets land on a radiator, and points placed before the furniture (a
    finished home's flow) stay where they were when the kitchen is laid out elsewhere.
11. **Floors, doors and picks.** Every Modern balcony is laid in laminate and a style's own tile
    is kept out of its kitchen by a wet flag; 75 of 195 finishes are never laid; 11 of 52 doors and
    windows can ever be chosen and none follows a change of style; 46 % of the pieces carried in
    from a calculation do not fit where they are put.
12. **The AI run as a job.** A save from any tab ends a run already paid for; failed runs use up
    the five a project gets; and the person is never told that the engine took over.
13. **The tests cannot see any of this.** 911 pass; `generateScene` is only ever run on a doorless
    two-room flat with 14 products; three tests assert today's defects as right.
14. **The same thing is written many times**: twelve "which wall is behind this piece" functions
    with six tolerances, the vanity, the washer's column and the WC's box each built twice, two area
    gates per piece, about 240 `kind === '…'` comparisons outside `catalog.ts`, and rule numbers in `catalog.ts`,
    `autoLayout.ts`, eight other files and two AI prompts as well as in `rules.ts`.

## 1. How a flat is generated today

One pure function, `generateScene` (`lib/design/generateScene.ts`), run by the browser's store
(engine only) and by the server's job (with the AI designer). In order:

| # | Stage | Code | What it decides |
|---|---|---|---|
| 0 | *(AI only)* the designer's proposal | `aiDesign.ts` → `designWithClaude` | a product per kind per room, a floor and a wall per room, up to three decor intents per room, notes — **before any layout exists** |
| 1 | partitions | `autoPartitions.ts` | an entrance screen, an en-suite's lobby; the floor behind them kept free |
| 2 | keep-clear floor | `ruleChecks.radiatorKeepouts`, `walls.columnFootprints` | boxes per room nothing may stand on |
| 3 | layout | `autoLayout.layoutPlan` | **slots**: for each room its program (`catalog.ROOM_PROGRAMS`) in order, each archetype placed by its rule (wall, wall-run, centre, relative, corner, ceiling, wall-mounted, under, window, entrance) at the **archetype's size**; first failure drops the piece |
| 4 | matching | `matcher.matchProducts` | a **product** per slot (drawn by style, budget, the AI's pick), re-measured from the product's real size, kept only if it fits |
| 5 | bathroom pass | `bathroom.fitBathrooms` | vanity under the basin, tap, the washer's column (moves the washer), dryer, the bath's box and mixer |
| 6 | hall pass | `hall.fitHall` | the built-in wardrobe (removes coat rack and shoe cabinet), the mirror moved across |
| 7 | bedroom pass | `bedroom.fitWardrobes` | a wall of wardrobe in place of the shop's (removes the dresser) |
| 8 | kitchen corner | `kitchenCorner.fitKitchenCorners` | a leg and wall cabinets for a run under 2.6 m |
| 9 | finishes | `surfaces`, `aiProposal.withProposalFinishes` | floors and walls |
| 10 | decor | `aiProposal.proposalDecor`, `decor/wcBox` | the AI's decor fitted to the walls; a box behind every WC |
| 11 | wiring | `electrical.suggestElectrical` | sockets, switches, lights from the furniture and decor |
| 12 | tidy-up | `aiProposal.settleToWalls`, `clearOfDecor`, `underCeilingDecor` | wall pieces back on their wall, pieces moved off decor |
| 13 | *(AI only)* the check | `aiReview.ts` → `applyReviewFixes` | replace / remove / to wall / move to wall N / remove decor / decor to wall N, then the tidy-up again — **the wiring is not redone** |

Nothing after stage 4 re-runs the layout, and no stage verifies the flat as a whole: stages 5–8,
12 and 13 each move or add things with a test of their own.

## 2. Where the rules live

| Place | What is in it |
|---|---|
| `catalog.ts` → `ARCHETYPES` | 42 kinds: size, placement rule with its numbers (18 clearances, 8 hanging heights, the coffee table's 0.42, the TV's 1.05), a minimum room area, `ghost` |
| `catalog.ts` → `ROOM_PROGRAMS` | per room type: which kinds, in which order, how many, a second minimum area |
| `autoLayout.ts` | the scoring of every wall spot (about 30 bonuses and penalties written inline), the wet-room orders and weights, optional-decor odds, table sizes, the island's ring, the door zone, TV-unit distances |
| `matcher.ts` | strict-style kinds, what a slot can hold (`slotPool`: basin, bath, shower, island, towel shelf, TV, pendant, mirror), hanging heights, the weights of the draw |
| `bathroom.ts`, `hall.ts`, `bedroom.ts`, `kitchenCorner.ts`, `decor/joinery.ts`, `decor/housing.ts` | what is built round the furniture and its sizes |
| `rules.ts` | the owner's numbers — meant to be the one place; about 95 constants, three of them unused |
| `ruleChecks.ts`, `clearance.ts`, `aiReview.reviewFindings`, `manipulate.isPlacementValid` | four detectors of "something is wrong", each with its own geometry |
| `aiDesign.ts`, `aiReview.ts` | two prompts that restate the rules in prose, numbers included |
| `productRoles.ts`, `matcher.ts`, `electrical.ts`, `openings.ts` | about 20 regular expressions on product names that decide what a product is |

### What each room gets (as the code has it)

| Room | Program, in order (gate) | Its own rules |
|---|---|---|
| Bedroom | double bed (single under 9 m²) · 2 nightstands · wardrobe (8 m², from the archetype) · dresser (13 m², 80 %) · rug (80 %, **no product**) · pendant · print (80 %) · curtains or blinds, one a window · plant (12 m², 70 %) · floor lamp (12 m², 95 %) · stool (12 m², 60 %) | bed on the wall furthest from the door, in the middle, room for both nightstands, out of the door's sight if it can; wardrobe in a niche first, beside the bed, never facing its foot; pass: a wall of wardrobe when 85 % of its wall is free |
| Living room | sofa (corner sofa from 22 m²) · coffee table · TV unit · TV · armchair (16 m², 75 %) · bookcase (15 m², 75 %) · rug (85 %) · floor lamp (11 m²) · pendant · print · plant (12 m²) · curtains · dining table and chairs (26 m²) | sofa on the longest wall, 2.5–3.5 m from the wall it faces, not facing a window, off the way between doors; TV unit across from it (1.5–4.2 m clear) and 60 cm from the coffee table, else none; armchair at the sofa's end turned 45° |
| Kitchen | run · fridge · wall cabinets · table (10 m²) · chairs · island (17 m²) · pendant · blind | run on the water's wall, then a wall with no window, the longest; out of the entrance's sight; fridge at the run's end; table beyond 1.2 m of working floor, 1.2 m long at least, else against a wall; island 1.2 m clear all round; pass: an L for a run under 2.6 m |
| Bathroom | WC · basin · bath (7.5 m²; 9 m² in Scandinavian and Industrial) · shower · washer (4.5 m²) · mirror · blind · towel shelf (6 m², top budget only) · stool (6 m², 60 %) | four fixture orders tried, the best kept; each fixture 40–60 cm of free floor; WC out of the door's sight, 80 cm wide; shower in a corner, 80 × 80 to 140 × 90 by area; mirror over the basin only; pass: vanity, tap, washer column, dryer, bath box, mixer; a box behind the WC |
| Toilet | WC · basin · mirror | as the bathroom |
| Hall | door mat (only with the front door) · coat rack · console · shoe cabinet (**no product**) · mirror · plant (8 m²) | pass: a built-in wardrobe by the front door from 1.2 m of width (replaces the coat rack and shoe cabinet), the mirror across from it |
| Office | desk · chair · bookcase (14 m², from the archetype) · armchair (14 m²: **never placed**) · rug · pendant · floor lamp (9 m²) · print · curtains | desk beside the window |
| Balcony | armchair (**never placed**) · 2 plants (10 m², from the archetype) | — |
| Closet | 2 wardrobes (8 m², from the archetype) · mirror | — |
| Storage | 2 open shelves | — |
| Studio | the kitchen's program in one half, the living room's in the other | each half a room of its own |
| Whole flat | a washing machine in the hall, else the kitchen, when no bathroom took one | only when the flat has a bathroom |

## 3. What the measurement found

**Essential pieces missing from the finished flat** (1,080 flats):

| Room | Piece | Missing | Lost where |
|---|---|---|---|
| Bathroom (1,008) | shower or bath | **36 %** | no slot |
| | mirror | 27 % | no slot |
| | WC | 11 % | no slot |
| | basin | 7 % | no slot |
| Bedroom (1,692) | bed | **14 %** | 180 no slot, 60 no product fits |
| | nightstand | 15 % | mostly with the bed |
| | wardrobe (shop's or built) | 10 % | rooms under 8 m² |
| Living room (684) | TV unit / TV | 20 % / 22 % | no slot |
| | sofa | 11 % | no product fits (all Vintage) |
| Kitchen (612) | fridge | 6 % | no slot |
| Studio (324) | TV unit and TV | **77 %** | no slot |
| | sofa | 28 % | 72 no slot, 18 no product |
| | fridge / kitchen run | 22 % / 11 % | no slot |
| Flat with a bathroom | washing machine | 31 % | — |
| Balcony (900) | anything at all | 92 % empty | — |

**Clashes in the finished flat** (over 3 cm; per flat in brackets):

| What | Count | Caused by |
|---|---|---|
| Two floor pieces in each other | 2 in 1,080 (0.002) | bath mixer in a stool — the plain case is **not** the problem |
| A piece within 90 cm in front of a door | 292 in 720 (0.41); 163 of them by more than 15 cm | the matcher, 90 % (bed 68, dining chair 52, table 31, plant 19, bookcase 15) |
| Wall mirror into the tap under it | 420 (0.39) | bathroom pass + mirror height |
| Tall mirror hung behind the hall's console | 418 (0.39) | slot "over the console", product a 1.8 m mirror hung 30 cm off the floor |
| A pendant and the wiring's ceiling light at one spot (drawn as one; listed, and in a renovation bought, as two) | 952 rooms in 720 flats (1.3) | the furniture and the wiring each hang a main light |
| Vanity or column built into the shower tray | 99 (0.09), up to 58 cm | `freeStretch` measures the shower's column, not its tray |
| Washer standing in the shower tray | 21 (0.02) | the bathroom pass moves it |
| A piece on a radiator's strip, a column or a partition's floor | 102 (0.09) | the matcher and the bathroom pass |
| Table or chairs inside the run's 1.2 m | 62 of 600 kitchens | the matcher |
| Pendant into a canopy bed | 123 | none checks |
| Hall wardrobe leaving under 70 cm | 15 (one L-shaped hall, every run) | the hall judged by its bounding box |

**The engine's own checks on its own flats** (`ruleViolations`, per flat — 1.3 in all): bed side tight 0.35 ·
WC in the door's sight 0.27 · a piece in a door's swing 0.21 · basin height 0.15 · radiator blocked
0.13 · sofa–TV distance 0.09 · socket in a splash zone 0.07 · door swings clash 0.03. `reviewFindings`
(what the AI check is shown as PROBLEMS) reports 4.0 per flat, of which 1.2 are the engine's own
fitted pieces (A4).

**Dining**: of 447 tables standing free, 81 (18 %) kept every chair the engine laid; 178 (40 %)
ended with two or fewer, typically "six laid, two left". Of 117 tables against a wall, 70 (60 %)
ended with one chair or none.

**The AI designer's offer** (360 briefs, no model call): 14,202 kinds offered, **3,805 (27 %) for a
piece the room ends without**. A random pick from the offer was used for 48 % of pendants, 24 % of
mirrors, 20 % of wardrobes, 39 % of double beds, 43 % of dining tables, 53 % of basins, 29 % of TVs,
25 % of baths, 17 % of corner sofas.

## 4. Findings

Severity: **high** = seen by anyone who generates; **medium** = wrong in some rooms or styles;
**low** = small or rare. Line numbers are at `9d7e68a3`.

### A. Things generation leaves out

- [ ] **M1 (high) — An essential piece that fails any rule is dropped.** `layoutArea` stops at the
  first failure (`autoLayout.ts:304-310`) and nothing retries with a smaller piece or a relaxed rule.
  The cases behind the table above (each traced to its rule, with what one change recovers, in L):
  - *The door zone* is 0.95 m deep and the door plus 20 cm wide for every piece
    (`autoLayout.ts:1608-1634`). On the 19 bathrooms of 2.5–5.5 m², laying them out again with a zone
    0.70 m deep and the door's own width brought back **every** missing WC and basin (89 % → 100 %,
    97 % → 100 %) and a third of the missing showers (52 % → 69 %).
  - *The bed* is a 1.6 × 2.05 m double with its head on a wall, or a single only under 9 m²
    (`resolveVariant`, `catalog.ts:780-786`). No smaller double, no single when the double does not
    fit, no bed along a wall in a narrow room: a 9.9 m² bedroom 2.28 m wide gets a wardrobe, a lamp
    and no bed.
  - *The sofa*: from 22 m² only the corner sofa (2.7 × 1.75 m) is tried; `NARROWABLE`
    (`autoLayout.ts:575`) has the three-seat only, and `placeAgainstWall` takes the full width on any
    wall before a narrower sofa on a better one (`:511-523`). No sofa → no coffee table, TV unit, TV
    or armchair (all placed off it).
  - *The TV unit* needs 1.5–4.2 m of clear floor to the wall the sofa faces, else a spot 3 m ahead
    of the sofa or nearer — else there is no unit and no TV (`:972-997`, `:1028-1049`). In a living
    room 2.84 m across the facing wall is 1.46 m clear, four centimetres short, and the nearer spots
    fall on the door zones: no TV on any of 160 runs. (The last fallback, 1.14 m ahead, is where the
    coffee table stands; without it the unit would float mid-room, 47 cm from the sofa.)
  - *The shower* stands in a corner in one of five sizes (`placeInCorner`, `:1169-1224`); it is never
    laid across the end of a narrow bathroom.
  - *The mirror* hangs "over the basin only" (`:478`), and the basin's spot is chosen without
    looking at the wall above it: beside a door or under a window there is no mirror.
- [ ] **M2 (high) — Strict style has no fallback when nothing of the style fits.**
  `STRICT_STYLE_KINDS` narrows sofas, beds, baths, wardrobes, dining tables and kitchens to the
  style's own products whenever the style has *any* (`matcher.ts:91`, `:156-159`) — not whenever one
  *fits*. Vintage's only corner sofa is 417 × 347 cm: 60 of 60 Vintage rooms with a corner-sofa slot
  got no sofa. Beds: 38 slots with no product (Industrial 22, Modern 14).
- [ ] **M3 (high) — When a piece is dropped, what was arranged off it stays.** `placeableOnly`
  (`generateScene.ts:160`) removes a slot with no product and nothing else. In 720 flats: a coffee
  table with no sofa 60 times, a rug 87, an armchair 53, a TV unit 41, a TV 40; nightstands with no
  bed 34; a fridge or wall cabinets with no run 24.
- [ ] **M4 (high) — Studios** (why, measured: RS1–RS5 in L). Each half is a room of its own (`layoutRoom`, `partRoom`), with the
  whole room's door zones and the open line as no wall. Two 40 m² studios never get a sofa; seven
  never get a TV. With no sofa the living half's rug is laid under whatever was placed first — a
  bookcase (`placeUnder`'s fallback, `autoLayout.ts:1424-1426`).
- [ ] **M5 (medium) — Program entries that cannot be placed.** An armchair is placed off a sofa
  (`placeRelative`, `:929-930`): the balcony's is never laid (0 of 684) and the office's cannot be. An entry
  with no gate silently takes the archetype's (`:291`): a balcony's plants need 10 m² (92 % of
  balconies are empty), a closet's wardrobes 8 m² (40 % get them), the office's bookcase 14 m² (0 of
  72), and the bedroom's "always a wardrobe" 8 m².
- [ ] **M6 (medium) — Slots no product can fill.** Products are matched by exact kind
  (`candidatesFor`, `matcher.ts:698`). The bedroom's rug is kind `rug_bed`, which has **no product**
  (the 15 rugs are `rug`): the rug is laid in 77 % of bedrooms and dropped in all of them. The hall's
  `shoe_cabinet` has none either. The shelf, by contrast, groups by slot (`kindsForRoom`).
- [ ] **M7 (medium) — No washing machine in 31 % of flats with a bathroom.** It needs a bathroom of
  4.5 m², else a hall, else a room typed kitchen (`WASHER_FALLBACK_ROOMS`, `autoLayout.ts:212-226`) —
  never a studio's kitchen half, never a flat with no room typed bathroom.
- [ ] **M8 (medium) — Dining chairs disappear in the matcher.** (1) The 1.2 m minimum (K-10, L-6)
  is on the slot, not the product: 13 of the 31 dining tables are under 1.2 m (70 × 70, 80 × 80) and
  the draw only penalises products *wider* than the slot (`generationWeight`, `matcher.ts:123`) —
  the larger cause. (2) `seatAtTable` gives the n-th chair the n-th seat of the real table
  (`matcher.ts:450-458`), whatever seats the engine had found free: of 124 tables where the engine
  had skipped a seat (a wall behind it) every one lost chairs and 78 ended with one or none;
  skipping the same seats in the matcher kept 216 chairs where 171 are kept today. (3) `seatSlots`
  takes the width for the long side (`autoLayout.ts:1115-1160`); seven tables are filed 100 × 240.
- [ ] **M9 (low) — The kitchen island is never placed** (0 of 432): 1.2 m clear on every side, after
  the table and chairs, from 17 m² (`placeCentre`, `:893-896`).
- [ ] **M10 (low)** — A door mat only where the hall has the front door (43 % of halls); none when
  the front door opens into a living room or a studio. A kitchen under 10 m² has nowhere to eat.

### B. Overlaps and clashes

- [ ] **O1 (high) — The matcher does not know what the engine kept clear.** `placeFitting`
  (`matcher.ts:363-419`) tests the room's outline, the windows and the other pieces — not the door
  zones, radiator strips, columns, a partition's floor, the run's working floor, a WC's 80 cm or an
  island's ring. And the product is rarely the slot's size: of double beds placed 32 % were over
  25 % wider than the slot, of bookcases 31 %; of wardrobes 83 % were over 25 % narrower, of dining
  tables 54 %, of TV units 54 %. `inDoorway` exists (`manipulate.ts:795`) and only the AI check's
  moves use it.
- [ ] **O2 (high) — The shower's floor.** `PlacedItem.areaM` (the tray and its glass) is read by the
  layout's slot, `wallClear.ts:61` and one check (`ruleChecks.ts:284`). Everything else measures the
  50 cm column: `freeStretch` (`decor/joinery.ts:208-212`, so the vanity, the washer's column, the
  bath's box, the hall wardrobe and the kitchen leg), the matcher's blockers once the shower is
  matched, `tightSpots`, the studio's drag test, `reviewFindings`, the splash zone
  (`ruleChecks.ts:304`) and the boiler's clearance (`ruleChecks.ts:153`).
- [ ] **O3 (medium) — The passes after the matcher test for themselves, partly.** The bathroom pass
  moves the washer beside the vanity (`bathroom.ts:116-146`) and stands a floor mixer in front of the
  bath with no test at all (`:268-271`). `fitHall` reads the hall's width off its bounding box
  (`narrowSide`, `hall.ts:138`): in an L-shaped hall a 60 cm wardrobe left 68 cm. The joinery may
  stand in front of 25 cm of a door's width (`CORNER_OVERLAP_M`), which the engine's own door zone
  would refuse: a bedroom's wall of wardrobe does, by 10–25 cm, 61 times in 720 flats.
- [ ] **O4 (medium) — Hung pieces.** The bathroom mirror's middle is set at 1.5 m whatever is under
  it but a floor piece (`settledElevation`, `matcher.ts:641-660`); the tap is added later at the rim
  plus 12 cm (`bathroom.ts:219`) — about 1.02 m, under a mirror that starts at 1.12 m: 421 in each
  other in 1,080 flats. A tall mirror in the hall (every hall mirror placed is 1.4 m or taller)
  keeps the slot "over the console" and is hung 30 cm off the floor (`matcher.ts:650`, which
  returns before the lift over what stands below): 418 run into the console, 156 of them in halls
  that did get the wardrobe. A pendant hangs in the middle of the room whatever stands under it but
  a table.
- [ ] **O5 (low) — Two main lights at one spot.** The program's `pendant` (an item with a product)
  and the wiring's ceiling light (a point with a product) are both put in the middle of the room —
  `electrical.ts` never reads the pendant: 59 % of bedroom pendants, 53 % of living-room ones and
  every office one have a ceiling point within 35 cm. The 3D view draws one lamp (the point shows
  only its rose under a hanging lamp, `lib/design3d/buildStructure.ts:234`), but the lighting plan
  lists two primary lights and a renovation's budget buys both (a design-only budget leaves
  generated points out, `pricing.ts:669`). In an L-shaped room the two middles differ (area
  centroid, `planGeometry.ts:78`, against the corners' mean, `electrical.ts:239`).
- [ ] **O7 (high) — The TV unit is stood on a room separator's open line.** `placeRelative` is
  handed the room's whole outline (`autoLayout.ts:468`, `:1031`: "the wall the sofa faces" is
  whatever the ray meets), not the walls: in a living room that opens onto the kitchen or the hall
  the unit stands in the opening, its back to the next room, and the TV, with no wall behind it,
  only if it is one on a stand. **208 of 364 living-room TV units** on these plans; 56 more stand
  free of every wall. The cause is upstream, in how the sofa's wall is scored (RL1).
- [ ] **O6 (low)** — A pendant, a door mat, a rug and curtains are never fit-tested (`fitMatters`,
  `matcher.ts:353`): a 3.16 × 3.96 m pendant cluster in a bedroom, a 2.03 × 1.27 m door mat in a hall.

### C. Products that can never appear

162 of the 934 furniture products with a model never appeared in 1,080 flats. By rule, not chance:

- [ ] **P1 — Shop kitchens (40).** A shop's run is taken only when its name says it has a sink and
  a hob (`hasSinkAndHob`, `matcher.ts:97-100`): **none of the 40 names does**, and it must also be
  90–100 % of the run's length (`:214`). `STORE_KITCHEN_SHARE` and its branch are dead code; every
  generated kitchen is one of three made-to-measure materials.
- [ ] **P2 — Kitchen islands (9)** — M9.
- [ ] **P3 — Open shelves (22)** fill the bookcase's slot on the shelf but are generated only in a
  room typed storage.
- [ ] **P4 — Shut out by a name test with nowhere else to go (about 30):** seven wall bath mixers
  filed under showers (kept out of the shower's slot, `matcher.ts:492`; `refinedKind` re-files only
  kind `sink`), three shower doors and enclosures, six floor-standing taps and bath fillers (a basin
  never takes a floor tap, `bathroom.ts:101`), eleven `kitchen_sink` (a kind nothing places), five
  appliances filed as kitchen runs.
- [ ] **P5 — Pendants longer than the drop (13):** under a 2.8 m ceiling a pendant may be 0.9 m
  (1.35 m over a table) (`slotPool`, `matcher.ts:513-516`); the models' heights include the cord.
- [ ] **P6 — Baths by style:** built-in only in Scandinavian and Industrial, freestanding in Modern,
  a rectangular freestanding one in Vintage (`slotPool`, `:482-488`), on top of strict style — a
  built-in bath tagged Modern alone has no flat.
- [ ] **P7 — Bigger than any slot (about 30):** sofas over 2.9 m, corner sofas over 3.1 m, a
  2.67 m bed, a 6.88 m wardrobe, desks of 2–3.4 m, eight armchairs and chaises over 1.2 m.
- [ ] **P8 — One of a kind:** one washing machine, one dryer, one towel shelf, three blinds, four
  curtains: every flat has the same.

The documents say "every product with a model can appear in a generated flat"; the weights are never
zero, but the filters before the draw are.

### D. The AI designer against the engine

How it works: the style page starts a job; `designWithClaude` (Opus 5.5, one call) is sent each
room's walls and openings, twelve products per kind the room's program lists, ten floors and ten
walls, the decor materials, the style guide and a "direction", and answers with picks, finishes,
decor intents and notes; `validateProposal` keeps only ids that were offered; `generateScene` lays
the flat out with it; a second call (`reviewWithClaude`) is shown every piece with where it stands,
PROBLEMS and five alternatives, and may answer six actions. It never decides a position, which
pieces a room has, the kitchen, the joinery, taps, lamps on the wiring, radiators or doors.

- [ ] **A1 (high) — It is offered what the engine will refuse.** The offer is every product of the
  kind that fits the room's box, less the style's rejects (`buildBrief`, `aiDesign.ts:205-212`). The
  matcher then applies strict style and `slotPool` and silently ignores a pick outside them
  (`matcher.ts:250-256`): with every offered id tried as a pick (six plans, four styles), 5,421 of
  7,836 were taken — 583 fell outside the strict-style pool, 1,167 outside `slotPool`, 665 did not
  fit. Four pools are built four ways:

  | Pool | No black in Scandinavian | Strict style | `slotPool` | Fits |
  |---|---|---|---|---|
  | matcher (`matcher.ts:149-160`, `:234`) | yes | yes | yes, with the budget level | the real slot |
  | AI offer (`aiDesign.ts:205-209`) | yes | **no** | **no** | the room's box |
  | AI check's alternatives (`aiReview.ts:259-264`) | **no** | **no** | yes, no level | the room's box |
  | bathroom pass (`bathroom.ts:62-68`) | yes | — | name tests | — |

- [ ] **A2 (high) — It is asked about pieces the room will not have** (27 % of kinds offered).
  `programKinds` (`aiDesign.ts:153-163`) re-implements the engine's gate without the archetype's
  minimum area, the bath-by-style rule, the window test, the optional-decor draw or a studio's
  halves (it offers a corner sofa for the whole studio while the half gets a three-seat), and knows
  nothing of the passes that replace pieces (the wardrobe by a wall of wardrobe in 34 % of bedrooms,
  the coat rack by the hall wardrobe in 46 % of halls). Its room note can describe a piece that is
  not there.
- [ ] **A3 (high) — It designs before the layout exists.** The layout does not depend on its answer
  and takes 40 ms; run first, the brief could name the real slots (size, wall, what stands beside),
  the matcher's own pool per slot, and the walls that are really free for decor. Today a decor
  intent on "wall 2" is chosen blind and dropped when the engine put the wardrobe there.
- [ ] **A4 (high) — The check is shown the engine's own work as PROBLEMS.** `reviewFindings` reports
  a WC in front of its box as "stands 21 cm off the wall behind it" (559 times in 720 flats), a washer
  in its column and a bath in its box as "stands in the cabinet decor" (337 times)
  (`aiReview.ts:121-130`, `:143-146`). A `to_wall` on the WC is accepted and does nothing.
- [ ] **A5 (high) — The check's actions ignore what belongs together.** Verified through
  `validateReview` and `reviewedScene`: `move_to_wall` on the kitchen run is accepted (the prompt
  suggests it) and leaves the wall cabinets and the fridge on the old wall; on the sofa it leaves the
  coffee table, TV unit, TV, armchair and rug round empty floor; `remove` on the TV unit leaves the TV
  on the wall; `remove` on a blind and on a pendant is accepted, against "every window dressed" and
  "one main light". Only three relations are hand-listed (`PLACED_OFF`, `IN_FRONT`,
  `aiProposal.ts:113`, `:196`). Its moves test doors and windows but not radiators or columns.
- [ ] **A6 (medium) — The wiring is not redone after the check.** `finishFlat`
  (`lib/api/designJob.ts:289-290`) writes the items and decor the check changed and keeps
  `scene.electrical` as laid: bedside sockets stay where the bed was.
- [ ] **A7 (medium) — The rules are restated in two prompts**, numbers and all (85 cm basin, 80 × 80
  shower, 60 cm wardrobe, 1.2 m in front of the run, decor heights; `aiDesign.ts:266-289`,
  `aiReview.ts:291-315`) — a third copy to keep in step. "At most one decor piece in a hall, kitchen
  or bathroom" is in the prompt only: the code allows three (`aiDesign.ts:446`).
- [ ] **A8 (medium) — What the engine draws ignores the designer's palette**: the kitchen's
  material, the joinery's, the taps, the lamps on the wiring.
- [ ] **A9 (low)** — The brief calls every room that is not four-cornered "L-shaped"
  (`aiDesign.ts:184`).

### E. Rules that contradict each other

- [ ] **X1 — The basin's top**: 0.85 ± 0.07 in the rule and its check (`rules.ts:327`,
  `ruleChecks.ts:291`), 0.86 in the matcher (`matcher.ts:642`), 0.90 for the vanity
  (`decor/joinery.ts:28`); a "countertop basin" is under 45 cm in `matcher.ts:475` and under 50 cm in
  `bathroom.ts:79`. 163 basins in 1,080 flats fail the app's own check.
- [ ] **X2 — Two minimum areas per piece** in `catalog.ts`, different for nine kinds (dresser 12 and
  13, bath 6 and 7.5, island 16 and 17…), the archetype's applied whenever the program has none (M5).
- [ ] **X3 — Sofa to TV**: 2.5–3.5 m scores the sofa's wall and is what the check flags
  (`rules.ts:265`); the TV unit is placed at 1.5–4.2 m (`autoLayout.ts:1035`). The engine places what
  its check reports.
- [ ] **X4 — A mirror's height**: 1.55 m in the archetype, 1.5 m in the matcher (which wins),
  another rule in the hall pass (`catalog.ts:541`, `matcher.ts:656`, `hall.ts:108`); the gap over a
  piece is 15 cm in the engine and 12 cm in the matcher.
- [ ] **X5 — A door's clear floor, five ways**: 0.95 m × door + 20 cm (archway 0.55) in the engine;
  0.90 m × the door in `inDoorway`; the leaf's square, inward doors only, in the check; a point 45 cm
  in with 30 cm round it in `tightSpots`; 0.90 m in the joinery. The matcher uses none.
- [ ] **X6 — Free floor in front of kitchen units**: 1.2 m (`KITCHEN_CIRCULATION_M`), 0.9 m for a
  leg (`kitchenCorner.ts:39`), 0.38 m when the run itself is placed (`0.95 × 0.4`,
  `autoLayout.ts:816`); the island's 1.2 m is declared twice.
- [ ] **X7 — A radiator's floor**: its length plus 10 cm by its depth plus 30 cm for the layout
  (`radiatorKeepouts`, `ruleChecks.ts`); a 90 cm square block for the kitchen leg (`kitchenCorner.ts:50-54`).
- [ ] **X8 — Rules the next stage undoes**: the table of 1.2 m (slot) and a 70 cm table (product);
  "always a wardrobe" and the 8 m² gate; "a TV only with a unit" and "every window dressed" against
  the AI check's `remove`.
- [ ] **X9 — One name, two lists**: `WET_ROOM_TYPES` is bathroom, toilet, kitchen in
  `lib/calculator/constants.ts:69` and bathroom, toilet in `rules.ts:243`. Which rooms are heated,
  which fixture needs water and which points a room gets are each tabled two or three times with
  different members (`radiators.ts:46`, `technical.ts:33-43`, `autoTechnical.ts:46-70`,
  `rules.ts:121`) *(the last three not re-checked)*.
- [ ] **X10 — Unused numbers in `rules.ts`**: `COFFEE_TABLE_GAP_M` and `TV_CENTRE_M` are read by
  nothing — the live 0.42 and 1.05 are literals in `catalog.ts:217`, `:241`; `KITCHEN_WORKTOP_M` is
  only re-exported; `BASIN_TOP_M` and `SPLASH_ZONE_M` are read by the check and not by what places
  the basin or the sockets.

### F. The same thing written more than once

- [ ] **D1 — "Which wall is behind this piece": twelve implementations, six tolerances.**
  `backWallOf` (`rules.ts:571`, no facing test, 45 cm), `pieceWall` (`manipulate.ts:761`, 6 cm) and
  its line-for-line copy `wallBehind` (`aiReview.ts:89`), another `wallBehind`
  (`decor/resolve.ts:122`, 1.2 m), `wallOf` (`decor/joinery.ts:243`, 15 cm), `backWall`
  (`decor/housing.ts:91`, 30 cm; `electrical.ts:155`), `backOnWall` and `backGap`
  (`matcher.ts:535`, `:600`), `hungWall` (`manipulate.ts:371`) and two inline
  (`autoLayout.ts:842`, `:1356`). One generation runs nearly all of them on the same piece.
- [ ] **D2 — Three footprints and three overlap tests**: the engine's `boxFor` + `overlaps` (no
  tolerance), the matcher's and the studio's `footprintOf` + `footprintsOverlap` (2 cm), the checks'
  `footprintQuad` + `quadsOverlap` (the turned quad, 1 cm). A chair turned 45° is one thing to the
  engine and another to the checks.
- [ ] **D3 — What is built round a piece, twice**: the vanity in `bathroom.ts:79-97` and `vanityFor`
  (`decor/housing.ts:308`); the washer's column in `bathroom.ts:110-162` and `columnFor` (`:283`); the
  bath's box in `bathroom.ts:279` and `boxFor` (`:489`, without Vintage's surround); the WC's box in
  `decor/wcBox.ts` and `housing.ts`. Generation uses the first of each, the studio the second.
- [ ] **D4 — "A product takes a slot", four ways**: the matcher (`matcher.ts:281-302`), the AI
  check (`aiProposal.ts:385-392`), the studio's swap (`store/designStore.ts`), the calculator's picks
  (`fromCalculator.ts:109-116`, with no fit and no height) *(the last two not re-checked)*.
- [ ] **D5 — "What stands in front of this wall", twice**: `wallBlocks` + `clearOf`
  (`wallClear.ts`) and `freeStretch`'s own loop (`decor/joinery.ts:207-230`), with different lists of
  what does not count; the margin round an opening is 0, 5, 8 or 10 cm by caller.
- [ ] **D6 — Who belongs to whom, five tables**: `placement.to` in `catalog.ts`; `PLACED_OFF` and
  `IN_FRONT` (`aiProposal.ts`); `TUCKS_UNDER` (`manipulate.ts:217`); `COMPANIONS`
  (`decor/housing.ts:43`); the matcher's `followers` (`matcher.ts:377-382`).
- [ ] **D7 — About 240 `slot === '…'` / `kind === '…'` comparisons** outside `catalog.ts` (matcher
  48, autoLayout 45, aiProposal 18, ruleChecks 17, housing 17…) and more than twenty named sets of kinds; "not in the
  way on the floor" is listed five times with five memberships, two of which test `'blind'` as a
  slot, which it is not (`wallClear.ts:34`, `decor/joinery.ts:209`).
- [ ] **D8 — Small copies**: `rayToOutline` (`autoLayout.ts:1053`) is `rayToPolygon`
  (`rules.ts:363`); point-in-polygon four times; point-to-segment about ten; `round2` seventeen;
  seven local "style affinity" scales beside `styleAffinity`.

### G. Technical placement and fittings

Two automata that never run together: `generateScene` wires the fittings (sockets, switches,
lights — `suggestElectrical`, after the furniture and the decor); the technical points and the
radiators come from a button (`suggestTechnical`, `suggestRadiators`). In a finished home or a
design-only project the button comes **before** generation, on bare rooms; in a renovation, after
it. Neither reads the other's points. Every item to T12 was reproduced by an independent reviewer
running the repo's own functions.

- [ ] **T1 (high) — Points placed before the furniture are never moved to it.** In the
  technical-first flow the kitchen's sewer, gas and hood are placed in a bare room
  (`autoTechnical.ts:312-330`: the furniture is read only for the run's zones) and `generateScene`
  returns them untouched (a kind a room already has is skipped, `:94`). On 17 kitchens × 30 seeds ×
  4 styles the hood ended more than 60 cm from the run's hob on every seed in 9 kitchens (up to
  4.1 m) and the sewer more than 60 cm from its sink in 13; in every bare kitchen the sewer and the
  gas share one spot. The boiler's cupboard, placed first, had the hall's wardrobe built over it on
  11–29 of 30 seeds in four plans.
- [ ] **T2 (high) — Sockets and radiators do not read each other.** `standardFor` never reads
  `plan.technical`, and `wallBlocks` has no radiators (`electrical.ts:232-280`,
  `radiators.ts:249-254`): over 240 generated flats **435 of 1,115 general sockets are inside a
  radiator's body**. The filter that keeps sockets off "tall furniture" (1.2 m or more) leaves 337
  behind lower pieces — the kitchen run (57), the bed's headboard (40).
- [ ] **T3 (high) — A towel rail is a radiator point that no radiator rule knows.** Hung over the WC
  (the rulebook's BA-19) it makes that WC `radiator_blocked` (60 of 60), and on the next generation
  its strip is a keep-clear floor: the WC is moved (55 of 60) or dropped (5). Every rail raises
  `radiator_not_exterior`. Placed before the furniture, its 0.58 × 0.375 m strip costs a
  2.4 × 3.2 m bathroom its shower on 14 seeds of 40 (`ruleChecks.ts:85-135`, `technical.ts:288-298`,
  `radiators.ts:228-247`).
- [ ] **T4 (medium) — A studio kitchen's spots hang in the living half.** The row is put on the
  line through the room's middle, taken for the whole studio (`electrical.ts:516-528`): 2.9 m in
  front of the worktop, one of them 2 cm from the room's own ceiling light. In L-shaped kitchens
  every spot was outside the room in 36 of 200 runs.
- [ ] **T5 (medium) — A corner kitchen's leg is taken for a second run.** The leg copies the run's
  slot (`kitchenCorner.ts:178-189`) and `autoTechnical.ts:122-129` has no `legOf` test: all 74 legs
  in 240 flats got a hot and cold pair of their own, and where the leg is the longer piece (9) the
  sewer, the gas and the hood went to the leg, which has no sink or hob.
- [ ] **T6 (medium) — Radiators are moved clear of furniture one at a time**, and the fallback
  returns the wanted spot even across a door (`radiators.ts:261-271`, `:311-331`): two radiators
  touching or on one spot (8 pairs in 120 flats), a radiator across a door by 30–50 cm in a hall
  with a door in every wall.
- [ ] **T7 (medium) — The boiler looks at nothing.** `hallCupboardSpot` and `clearOfWet` take no
  furniture (`autoTechnical.ts:234-274`): the cupboard through the WC on 15 of 30 seeds of one flat,
  the boiler exactly on the electrical panel in 8 of 30.
- [ ] **T8 (medium) — One edited fitting freezes a room's wiring.** Any edit, a product swap
  included, marks the point the person's (`store/designStore.ts:1247`); `wiredByHand` then skips the
  whole room (`electrical.ts:181-184`): generating again moves the furniture and keeps every old
  socket and light in that room (12 of 12 plans).
- [ ] **T9 (medium) — The studio's own "wire it" does not pass the decor**
  (`store/designStore.ts:1180`): a switch or a socket inside built joinery in 42 of 129 bedrooms
  with a cabinet (none when the decor is passed).
- [ ] **T10 (medium) — A washing machine gets no socket**, in any room (`furnitureFor` has no
  washer), and one the layout sent to the hall gets cold water and no drain (84 of 108 halls;
  `BY_ROOM` has no hallway).
- [ ] **T11 (medium) — A fitting that falls on a door or a window is dropped, not moved**
  (`makeOnWall` returns nothing and no caller tries again): every run under a window (40 of 600)
  loses the hood's socket and one worktop socket. A run of exactly 3.0 m gets two worktop sockets
  where 3.01 m gets three (`0.8999… >= 0.9`, `electrical.ts:488`).
- [ ] **T12 (low)** — A switch 1–3 cm from the corner where the wall beside the door is short (24
  of 544 switches; `electrical.ts:139-152`). The basin's own socket inside the splash zone its
  check reports (23 of 335; `electrical.ts:536-543` does not read `SPLASH_ZONE_M`). A room's middle
  taken as the mean of its corners: 29 of 107 lights over 50 cm off the real middle, an L-shaped
  hall's arm unlit (`:239`, `:324-337`).
- [ ] **T13 — Reported, not re-checked**: rooms under 1.2 m² get no points and bathrooms under
  3.5 m² no towel rail; a room entered through a separator gets a light and no switch; a second
  sofa, desk or basin gets nothing; `CLEAR_WALL_M` 0.5 against cupboards of 0.62 and 0.8 m;
  `BESIDE_RADIATOR_M` 0.8 against radiators of up to 1.12 m; radiators counted at 170 W a section
  whatever the product; "an outside wall" defined two ways (`technical.ts:296`); margins round an
  opening of 5, 8, 10 and 15 cm; `TECHNICAL_KINDS[*].rooms` read by nothing.

### H. Wall decor and joinery

Measured on 360 generated flats (1,004 cabinets and boxes) and, for the designer's decor, on 240
flats fed hand-written intents for every family and anchor. W1–W3 and O7 were re-run for this
document; the rest is from a side review that was stopped before it reported — its scripts and
outputs were read, not re-run.

- [ ] **W1 (high) — After the AI check the built pieces are settled again by other formulas.**
  `reviewedScene` runs `settleFitted` (`generateScene.ts:152`), which uses the studio's builders
  (`decor/housing.ts`), not the ones generation built with (`bathroom.ts`, `decor/wcBox.ts`). With
  **no fixes at all** 108 of 360 flats change: WC boxes slide or change width (108), 76 boxes built
  flush to the wall's end now leave a 2 cm sliver, and in 7 flats the WC itself is moved 18 cm —
  into the washer (5) or the basin (2).
- [ ] **W2 (high) — A basin lifted for a vanity that is never built.** The matcher lifts a
  countertop basin to washing height (`matcher.ts:642`) before the bathroom pass tries the vanity;
  when the pass finds no stretch for one (`bathroom.ts:79-97`: the basin beside a door or window,
  a WC straddling the stretch, a stretch narrower than the basin plus 5 cm) the basin stays in the
  air: **106 of 692 bathroom basins hang at about 70 cm with nothing under them**.
- [ ] **W3 (high) — A wall of wardrobe is built without looking in front of it.** `fitWardrobes`
  asks only for a free stretch as deep as the wardrobe (`bedroom.ts:41`). Of 402 built, 217 have
  something within 60 cm of their doors and 129 within 30 cm — the bed (97) or a nightstand (31).
- [ ] **W4 (medium) — The designer's decor is fitted without the engine's joinery.**
  `proposalDecor(laid, proposal, items, catalog)` is given the furniture only
  (`generateScene.ts:122`), after the passes have swapped the shop's wardrobe for a built one: slats,
  slabs, panels and cladding are fitted on the stretch the hall wardrobe, the wall of wardrobe or the
  vanity then covers — about 13 % of the decor's cost in that run was behind joinery.
- [ ] **W5 (medium) — Decor behind the bed is dropped in most bedrooms.** A bed 1.2 m tall or more
  takes none (`aiProposal.ts:91-94`, the rulebook's B-6), and two thirds of the beds placed are
  that tall (322 of 485): of the intents anchored on the bed 57 % are dropped for it and 14 % for
  want of a bed. The designer is not told the rule.
- [ ] **W6 (medium) — The hall wardrobe always has a boiler section** (168 of 168 built), with
  `hall.ts:60` reading the hall's width only: 105 flats had no boiler point, in 63 the boiler was
  elsewhere (the balcony 36, the hall outside the wardrobe 19, another section 8), and in 27 it also
  had a cabinet of its own (1,400–1,900 ₾) — paid for twice.
- [ ] **W7 (medium) — Tall joinery and the openings round the corner.** A wall of wardrobe stands
  in front of 6–23 cm of a window on the next wall (15 in 360 flats) and in the sweep of a door's
  leaf by 15 cm or more (30). `cornerClearance` allows 25 cm of an opening
  (`decor/joinery.ts:137-140`).
- [ ] **W8 (medium) — Joinery does not read the radiators**: a radiator's body inside the hall
  wardrobe (9), a vanity (15) or a vanity with its column (11) in 360 flats — `freeStretch` is given
  furniture and decor, never `plan.technical`.
- [ ] **W9 (low)** — A WC under a window gets no box (48 of 336: the box is refused at the
  opening); 76 boxes are more than 5 cm off their WC's middle. A washer the layout stood free in a
  hall gets no column (9: no wall within 15 cm). Mouldings are not cut at openings (42 across a
  door or a window in 240 flats). A light cove is dropped in any room with more than four corners
  (30 % of bedrooms, 53 % of living rooms and halls); a niche is built on 25–48 % of the walls
  asked and a panel on 37–74 % (each needs 1.2 m clear) — the designer cannot know which.
- [ ] **W10 — D3 in numbers**: the studio's builder makes the washer's column 0.9 m lower than
  generation's wherever a dryer is stacked (41 of 63 compared), on another wall in 16, and the
  bath's box smaller in Vintage (no surround); its boxes have no tiles (generation's: plasterboard
  and tiles); taps, the bath's mixer and the dryer are added by generation only.

### I. Floors and walls

Measured on 720 generated flats (4,440 rooms) and 360 designer's briefs. No room ends without a
floor or a wall product, and no wet finish is laid in a dry room or the reverse; what is wrong is
which product, and what the designer is offered.

- [ ] **F1 (medium) — The designer's floor and wall per room are overwritten.**
  `withFlatFinish(withProposalFinishes(…))` (`generateScene.ts:107`) lays the lead room's floor
  **and wall** in every room but the wet rooms and the balconies: of twenty picks in a test flat ten
  survived. The prompt says so for the floor, but for the walls it offers "the same wall finish, or
  tones of one family" — the tones are discarded. When the designer leaves the lead room to the
  style, the style's draw replaces its picks everywhere else.
- [ ] **F2 (high) — Every Modern balcony and closed kitchen is floored in laminate** (150 of 150
  balconies). Modern's tile look has no product in the catalogue — six of the seed products the
  looks name are gone — and the fallback is the style's general floor (`surfaces.ts:165`,
  `styles.ts:66`).
- [ ] **F3 (high) — The wet flag keeps a style's own tile out of the rooms the style names it
  for.** The generated draw takes only finishes whose wet flag equals the room's
  (`surfaces.ts:207`); terrazzo, checkerboard and terracotta are flagged wet, so a Scandinavian or
  Vintage balcony or closed kitchen draws from the only two dry tiles, dark slate or grey
  microcement: the style's own look 0 times in 300.
- [ ] **F4 (medium) — The designer's lists cannot give what its prompt asks.** A dry room's floor
  list is one pool for a living room, a kitchen and a balcony (`finishCandidates`,
  `aiProposal.ts:52`): 22 laminates, 31 carpets, 14 products of category wall-tiles, 2 tiles —
  carpet is offered for 94 % of kitchens and balconies. Each room's ten are drawn separately
  (`aiDesign.ts:218`), so "one floor through the whole flat" is rarely possible: 266 of 360 briefs
  have no floor id common to the rooms that share one. The brief never says which room leads or
  which kitchen is closed.
- [ ] **F5 (medium) — 75 of 195 finish products and all 8 mouldings are never laid.** The draw
  stays in the category of the style's own product: no look is a carpet (31); dry wall finishes
  filed under wall-tiles — brick, concrete, wallpaper, cladding — enter only through rooms that then
  take the lead's paint (44); `defaultTrim` never has a product, so 68 m of skirting a flat is drawn
  and not bought.
- [ ] **F6 (medium) — Labour is priced from another table than the one that lays.**
  `TILED_FLOOR_ROOM_TYPES` (kitchen, balcony — `lib/calculator/constants.ts:79`) decides the tiling
  labour whatever the design lays: an open kitchen wears the flat's laminate, a Modern balcony too.
  Laminate bought with tiling labour in 438 of 720 flats, 8.5 m² a flat.
- [ ] **F7 (medium) — `keepChosen` keeps the first product of a floor two products share**
  (`generateScene.ts:188`): a floor the calculation split 60/40 comes back with 40 % of it bare, on
  every plan edit and every generation.
- [ ] **F8 (medium) — A floor chosen by hand in the lead room is laid through the flat at the next
  generation** (`surfaces.ts:250` reads the lead's finish whoever chose it): a carpet picked for the
  living room reaches the open kitchen and the hall.
- [ ] **F9 (low)** — The one-floor rule holds only at generation: a room drawn or retyped afterwards
  gets its own type's look (`withStyleFinishes`, `surfaces.ts:287`). 160 of the 195 finish products
  have no colour; twelve share `#C9C4BA`, printed in the brief as theirs.

### J. Catalogue data the generator trusts

The generator takes `model3dKind` and the three sizes as true. They often are not, and only the AI
check (when there is a key) looks:

- [ ] **K1 — Filed under the wrong kind.** Floor lamps: 11 of 23 are table lamps (29–90 cm); **77 %
  of the floor lamps placed are under 1 m**. Fridges: under-counter coolers (42 % of fridges placed
  are under 1.4 m). Prints: vases and table mirrors hung on the wall. Wardrobes: cabinets (27 % of
  those placed are under 1.6 m). Dining tables: 13 of 31 under 1.2 m. Storage shelves: wine racks, a
  trolley, a toilet-roll stand. Kitchen runs: ovens, a hob, coffee machines.
- [ ] **K2 — Wrong sizes.** Door mats 203 × 127 cm (five of six; 68 % of mats placed are over
  1.2 m). Pendants under 8 cm across (11 of 93; 31 % of those placed) or 3–4 m. Tables and a bed
  with width and depth the other way round. A wardrobe 6.88 m wide. "Deeper than wide" is reported
  80 times in 1,080 flats.
- [ ] **K3 — The archetypes' sizes are not the catalogue's.** A double bed is laid out at
  1.6 × 2.05 m; the 24 products run 1.49–3.34 m wide (most 2.0–2.5, several with side tables built
  on). A wardrobe at 1.8 m; most products are 0.8–1.4 m.
- [ ] **K4 — No plausibility bounds per kind** at load (`lib/api/designCatalogLoad.ts` applies
  `refinedKind` by name and nothing by size).

### K. What the documents say that is not so

Corrected in `layout-and-matching.md` with this audit: "every product with a model can appear"
(C), "about a third of the time a shop's unit" (P1), "every bedroom has one (no area gate)" (M5).
Still to re-read against the code when these are fixed: the mirror's 1.55 m, the print's 1.45 m.

### L. Root causes, room by room

Why each piece is lost. Each was measured with a scratch copy of the engine shown identical to it
(no difference over 360–960 flats), one rule switched at a time; "recovers" counts runs of the
rooms named, and side effects outside them were not measured.

**Studios** — 9 studios × 4 styles × 8 seeds = 288 runs. Today: a TV unit on a real wall 16, on
the open line 48, none 220; a sofa 208; a run 256; a fridge 224.

- [ ] **RS1 (high) — Every studio is divided by the default line.** None of the nine has a stored
  split, so `defaultSplit` (`studio.ts:55`) puts the kitchen in the low 35 % across the longer side
  whatever the doors and windows: on the front door (#386: no run on 32 of 32), in a 2 m strip
  holding three doors (#384: no fridge). With the line moved or the halves swapped — the engine
  unchanged — each gets its run, fridge, sofa and a TV on a wall on 32 of 32.
- [ ] **RS2 (high) — The corner sofa.** A living half of 22 m² takes it (`resolveVariant`,
  `catalog.ts:781`) and nothing smaller is tried: no wall takes 2.7 m (#370, #369), or it leaves
  1.06 m in front (#393). A room needs 3.9 m across for a corner sofa and a TV unit, 3.0 m for a
  three-seat. With a three-seat as the second try: sofas 224 → 288, a TV on a wall 16 → 112.
- [ ] **RS3 (medium) — The run is never tried under 1.8 m on a short wall** (`autoLayout.ts:824`:
  the wall less 30 cm, 0.7 of it, half, 1.8 m), and its fallback takes the whole wall and leaves the
  fridge nowhere. Also trying 1.5 and 1.2 m: runs 256 → 288.
- [ ] **RS4 (medium) — An opening that straddles the line is given to one half only**
  (`studio.ts:222`): the other half sees plain wall — 20 pieces stood over a window their half does
  not know of.
- [ ] **RS5 (low)** — After the matcher 36 pieces stand across the line (it tests the whole
  studio's outline, `matcher.ts:390`). Minimum areas are judged per half: a 28 m² studio split 35/65
  passes neither the kitchen's 10 m² nor the living room's 26 m² for a table (none in four studios),
  and no half reaches the island's 17 m².

With RS2 and the living-room changes below: sofas 208 → 288, a TV on a real wall 16 → 224.

**Living rooms** — 19 rooms, 608 runs at the layout stage: no TV unit 120; of the 488 units 108
stand on a real wall (44 of them 2.5–3.5 m from the sofa), 280 on an open line, 72 mid-floor, 28
past a wall's end.

- [ ] **RL1 (high) — The sofa is scored as facing a screen when it faces an open line**
  (`autoLayout.ts:701`): the +10 for 2.5–3.5 m is a ray to the whole outline, and nothing asks
  whether a unit can then stand on a wall. Casting only the unit's ray at walls — O7's obvious fix —
  changes nothing: the unit then stands free, 29 cm short of the line. Choosing the sofa's spot by
  where its unit can stand, the unit allowed on any wall in front: 448 units, all on walls, 352 at
  2.5–3.5 m.
- [ ] **RL2 (high) — The 1.5 m minimum is really 1.62 m.** The wall ahead passes at 1.5 m clear
  (`:1035`), but the unit must keep 60 cm from a coffee table already standing 42 cm off the sofa
  (`:989`): 1.5–1.62 m always fails (#373 r5 has 1.60 m: no unit on 32 of 32). Without the 60 cm
  rule 64 of the 120 come back; with the unit laid before the table all 120, and 56 tables go.
- [ ] **RL3 (high) — The unit is tried at five offsets from the sofa's axis** (0, ±0.45, ±0.9 m,
  `:1026`), never looked for along the wall: #412 r2 has 1.89 m free between two door zones and gets
  a 1.8 m unit on 12 of 32 runs. Searching the wall every 3 cm recovers 24.
- [ ] **RL4 (medium) — Only the wall straight ahead is tried.** A wall beside the sofa recovers 64
  of the 120, any wall in front 68 — all on a wall, with a TV.
- [ ] **RL5 (medium) — `NARROWABLE` lists the TV unit, but a piece placed off another is never
  narrowed** (`:575`, `:468`): at 1.44 m wide 24 come back; at 1.2 m 168 units stand on a wall
  against 108.
- [ ] **RL6 (medium)** — A corner sofa's viewing distance is measured from its centre (`:703`): it
  earns the bonus at 2.55–2.93 m where its unit needs 2.94 m. With the wall spots refused the unit
  is stood mid-floor (`:1048`): 72 units with a wall 0.2–2 m behind them.
- [ ] **RL7 (low) — A unit across the end of a wall's edge gets no TV** (`placeAbove`, `:1387`):
  where one wall is two edges in line, the TV is refused — every "unit and no TV" case.

**Bedrooms** — 47 bedrooms, 1,504 runs: no bed slot 160, a slot with no product 51, a double bed
with fewer than two nightstands 135.

- [ ] **RB1 (high) — No bed slot: five rooms each miss by centimetres, with no second try**
  (`autoLayout.ts:627`); door zones refuse most spots. As a second try only, of the 160: a single
  bed with its side on a wall 160; a double side-on 96; a single head-on 128; a double under a
  window 64; a 1.2 m double 64; a 1.4 m double 32; a door zone 0.6 m deep 64 (0.7 m: none — it
  misses by 1–2 cm).
- [ ] **RB2 (high) — A slot with no product: the wardrobe's slot refuses the bed.** The engine lays
  the wardrobe 5 cm off the 1.6 m bed slot, and a slot not matched yet blocks at its archetype's
  size (`matcher.ts:383`): any bed over 1.74 m is refused — Modern's start at 1.81 m, Industrial's
  at 1.77 m. The room ends with two nightstands, a wall of wardrobe and no bed (41 runs). Any style
  when none of the style's own fits: +51 beds, nothing lost.
- [ ] **RB3 (high) — Nightstands are dropped beside beds over 2 m wide** (`matcher.ts:568`):
  re-measured from the real bed they move 0.2–0.85 m outward, onto the lamp's, the wardrobe's or
  the plant's unmatched slot: 71 rooms lose one or both.
- [ ] **RB4 (medium) — A wide bed is a wide headboard.** The catalogue's width over about 2 m is
  headboard (in one model a throw on the floor), and the nightstands are stood outside it, up to
  75 cm from the mattress: 191 beds.
- [ ] **RB5 (medium) — One of the six "single beds" is a single bed** (the others: two day beds,
  one modelled sideways, a bunk, a child's house bed), so "a single when the double fails" recovers
  slots, not beds to sleep in. And a single's slot may be laid under a window (0.95 m against a
  0.9 m sill passes by equality, `:1654`) where five of the six products are then refused.
- [ ] **RB6 (low) — Three plain bugs.** A wall must be 25 cm longer than the piece (`:606`): a
  1.84 m wall refuses a 1.6 m bed. One of a wall's two corner spots is always "outside the room"
  (the half-open point test, `planGeometry.ts:96`). A slot the matcher dropped still blocks what is
  matched after it (`matcher.ts:282`).

A ladder in the layout and any style in the matcher: a bed in 1,504 of 1,504 (today 1,293).

**Kitchens** — 17 kitchens, 544 runs: the fridge beside the run 480, none 32, on another wall 32;
no table in 60 of the 416 runs of 10 m² or more; an island 0 of 96.

- [ ] **RK1 (high) — "Leave the end for the fridge" tries two arrangements** (`autoLayout.ts:812`):
  one run length, from either corner. Any keep-clear floor in a corner fails both; the fallback then
  fills the wall, and every fallback run has its fridge missing or on another wall (64 of 64;
  studios 120 of 120). A 1.98 m wall is 2 cm short for the branch (`:814`): no fridge on any run of
  #408. Shorter runs with the fridge hard beside recover all 64.
- [ ] **RK2 (medium) — The table is lost to the run's wall.** In a 2.6 × 4.2 m kitchen the run on
  the long wall and its 1.2 m leave a 76 cm strip; the table is dropped rather than the run tried on
  another wall (run, fridge and table on 60 of 60) or shortened to 3 m (60 of 60). 0.9 m of working
  floor recovers none: the table keeps 1.5–1.65 m from the run, its own walking gap added (`:897`).
- [ ] **RK3 (medium) — The island needs 22–27 m², not 17.** Its ring to the walls refuses 64 of
  96 runs, the table laid before it 32 (`:895`). And no island product fits the slot: the six that
  pass the name filter are 1.87–4.81 m wide against 1.8 m — of 19 matched in a variant one kept
  1.2 m all round.
- [ ] **RK4 (medium) — A quarter of the runs are under 1.8 m** (140 of 544): the run goes to the
  water's wall or a wall with no window however short, though the L's leg then goes under a window
  in 151 of 230 cases; 61 finished kitchens keep a run under 1.8 m and no leg.
- [ ] **RK5 (low)** — Nothing keeps the floor in front of the fridge (a table or chair there in 19
  finished kitchens). The corner pass reads a radiator by its stored room id
  (`kitchenCorner.ts:52`), the layout by position: a leg on a radiator's strip on every run of #408.

### M. Partitions, doors and windows, the calculator's picks

- [ ] **Q1 (high) — A calculator pick takes its slot at the product's size with no fit test**
  (`fromCalculator.ts:104-116`). Of 1,424 picks replacing a piece, 658 (46 %) end out of the room,
  in another piece or on a door's floor — the style's own piece in the same slots: 3 %. A pick with
  no slot is given a spot found for the archetype's box (`placeAdditional` is called without the
  product's size): 45 % do not fit, and 12 % vanish without a word (a shower: 40 of 40).
- [ ] **Q2 (medium) — Three more things a pick does not do.** A picked kitchen is not made a
  kitchen piece (no `asPlacedKitchen`: a 12,000 ₾ shop's unit stays "made to measure" at the slot's
  size); the TV is not re-seated when its unit is picked (its bottom below the unit's top in 265 of
  408); the quantity is dropped (`:45`: four chairs picked, one placed).
- [ ] **Q3 (high) — A screen kept from an earlier generation loses its free floor.** The loop skips
  a screen that already stands before recording its keep-clear floor (`autoPartitions.ts:203`):
  generating #386 again stands furniture through the screen in 30 of 36 flats. The old screen also
  stays where today's rules would add none.
- [ ] **Q4 (medium) — No partition is added on any of the 30 plans** (the front door opens into a
  hall, or the studio is under 30 m², or the bedroom under 12 m²), so the stage is exercised only by
  its unit tests. On plans altered to qualify, a screen's joined end lands in a window or an archway
  in 10 of 58, and the matcher stands pieces in the lobby (53 of 348 flats).
- [ ] **Q5 (medium) — Doors and windows never follow a change of style** (`openings.ts:584`: any
  product already on an opening is kept — a style's own choice is not told from a person's, as it is
  for finishes): of 1,219 that should have changed, none did.
- [ ] **Q6 (medium) — 11 of the 52 door and window products can ever be laid**: the cheapest with
  the style's tag, with no seed and no budget (`:585`) — doors 4 of 42, entrance doors 3 of 5,
  windows 4 of 5, the same on every seed.
- [ ] **Q7 (medium) — A product's size is never compared with its opening** (the model is stretched
  to the hole, so it is never seen): a 144 cm entrance door in holes of 30–113 cm. And every outside
  door gets an entrance door — four on one plan, 18,000 ₾.

### N. The generation job

Read, and replayed with the rows in memory (no AI call); each item was then put to a skeptic.

- [ ] **J1 (high) — One save from anywhere ends a running job after the designer is paid.** The
  designer is called (`lib/api/designJob.ts:170`) and the revision compared only at the write
  (`:213`); the save route knows nothing of jobs. A second tab, or a nudge on the board, and the
  proposal is thrown away, the run counted, and the page lays out with the engine.
- [ ] **J2 (high) — Every job uses one of the five AI runs for the life of the project** (`:116`
  counts the job rows): a designer that failed, a write refused, a function that died. After five,
  the page is refused and lays out with the engine without a word.
- [ ] **J3 (high) — A design changed during the check: the check is paid and dropped**, and the row
  keeps the designer's flat not laid out (`:262`, `:288`); a later visit finds the style step again.
- [ ] **J4 (high) — The person is never told the designer failed, was refused or was skipped.** Any
  answer that is not ok becomes the engine's flat (`lib/design/aiDesignClient.ts:35`), under an
  overlay that ends "The AI designer has finished". Nothing reads the generation record or the
  job's error.
- [ ] **J5 (medium) — The browser's fallback flat is another draw, from a seed kept nowhere**
  (`store/designStore.ts:1397`; the record holds who, when and the count): two draws of one plan
  share 26 % of their pieces. A flat cannot be reproduced to be explained.
- [ ] **J6 (medium) — What is kept cannot explain a flat.** `generation.reviewed` counts the fixes
  accepted, not applied (`generateScene.ts:156`: of 1,380 accepted, 865 changed a piece); a refused
  job's proposal is gone; ignored picks, dropped slots, the job's id and the cost are kept nowhere.
- [ ] **J7 (medium) — A dead function keeps the overlay up to six more minutes**: a stage is taken
  for dead after 360 s (`lib/design/generationJob.ts:37`), a function lives 300 s, and the hint says
  two to three minutes.
- [ ] **J8 (low)** — A failed job lays the flat out when the style step is next opened, with no
  press on that visit and no age limit (`generationJob.ts:81`; the documented fallback — the hinge
  was confirmed when the job was started). The start route settles a project's stale job before it
  checks whose project it is (`lib/api/designJob.ts:104`).

### O. The tests

`pnpm vitest run tests/unit/design`: 911 tests pass. Of 18 defects of this audit checked against
them, **none has a test that would notice its fix**.

- [x] **V1 (high) — `generateScene` is only ever run on a doorless two-room flat with 14
  products** (`tests/helpers/generation.ts`): no bathroom, kitchen, hall, door, window or radiator
  goes through the whole pipeline in any test. The tests' rooms with the tests' products lose no
  bed and no TV; the real plans with the real catalogue lose 14 % and 23 %. *Fixed:*
  `generationInvariants.test.ts` generates 120 whole flats from real plans with the real catalogue
  and holds them to a baseline (above).
- [ ] **V2 (high) — Three tests assert today's defects as right**: six chairs laid and two kept at
  an 80 cm table (`placementSettle.test.ts:230`, `:334`); the brief "rarely offers again" what the
  last design used, which holds only because the offer is wider than the matcher's pool
  (`decor.test.ts:363`); the mirror's 1.5 m (`placementSettle.test.ts:124`, `:370`).
- [ ] **V3 (high) — Defects stand inside the tests' own scenes and pass**: the washer and its
  column 55–64 cm inside the shower's tray (`bathroom.test.ts:170`); the TV unit on the studio's
  line on 30 of 30 seeds (`studioLayout.test.ts:89` looks at hung pieces only); a bed with one
  nightstand in `generateScene.test.ts`'s own flat.
- [ ] **V4 (medium) — Tests that cannot fail**: `housing.test.ts:306` (its flat has no joinery to
  settle — W1), `generationRandom.test.ts:167` and `:194` and `placementSettle.test.ts:668`
  (branches that never run — P1), and seven assertions that are always true.
- [ ] **V5 (medium) — Fixtures.** Each file types a few products at the slot's own size and one
  style: 89 % are within 10 % of the slot's width, against 39 % in the real catalogue; 27 of 42
  kinds have a product in some test. Of 58 rooms laid out, 54 are rectangles and 42 have no window;
  a toilet, a balcony, a closet and a storage room never. A missing piece is stepped over
  (`if (!x) return`) in ten places.

What is needed: `generateScene` on real plans with invariants — no essential missing, nothing on a
door's floor or in a tray, no piece arranged off one that is gone — would cover 11 of the 18; a
catalogue fixture with the real spread of sizes and two styles, 5 more.

## 5. Before the per-room rules: what to settle first

In this order — each makes the next smaller, and the per-room table is where the owner's
room-by-room rules go:

0. **First, the means to see a fix** — *done*: `pnpm audit:generation` and the baseline test (see
   "How it is being fixed"). V2–V5 (tests that assert a defect, fixtures at the slots' own sizes) go
   with the fix of the defect each one pins.
1. **One description of the floor a piece takes and keeps clear** (its box; a shower's tray; a WC's
   80 cm; what it needs in front), and one of a door's zone, read by the engine, the matcher, every
   pass, the joinery, the checks and the studio — and "a wall" that is never a separator's line.
   Settles O1, O2, O3, O7, W3, W7, W8, X5–X7, D1, D2, D5.
2. **A ladder for every essential and an order of who gives way** — measured in L. Bed: 1.6 →
   1.4 → single → side on a wall (RB1); any style when the style's own does not fit (RB2). Sofa:
   corner → three-seat → narrower (RS2), its spot chosen by where the TV can stand (RL1). TV unit:
   narrower, along the wall, on any wall in front, before the coffee table (RL2–RL5). Run and
   fridge together, shorter before the fridge is given up (RK1), the run on another wall before the
   table is (RK2). Shower: 90 → 80 → across the end, the door zone relaxed last. A studio's line
   placed by its doors and windows (RS1). Settles M1, M2, M4 and L.
3. **A check of the whole flat at the end that repairs or removes, and says so.** The detectors
   exist (`reviewFindings`, `ruleViolations`); today they only feed the AI. No flat should leave with
   an orphan, a piece in a tray or a missing essential unrecorded — `scene.generation` can carry
   what was dropped and why. Settles M3, W2 and the engine-against-its-checks list.
4. **One table per room** — pieces, minimum area, how many, what each is placed off, what replaces
   it, its ladder — read by the engine, the AI's brief, the shelf and this measurement. One gate, no
   archetype fall-through; products matched by slot where kinds share one. Settles M5, M6, X2, A2, D6,
   D7. **This table is where the owner's per-room rules belong.**
5. **Sizes from the catalogue.** Either slots sized from what the catalogue really holds, or the
   product chosen first and the room laid out with its real size (with the AI: its picks, then the
   layout). Settles the two-sizes problem at its root (O1, M8, K3).
6. **The AI designer on the engine's ground**: brief built from the laid-out slots and the matcher's
   own pool; the check's findings without the fitted pieces; its actions limited to what cannot
   orphan anything, or cascading; the wiring redone after it; the prompts' numbers taken from
   `rules.ts`; its decor fitted with the joinery in place and its finishes told the truth. Settles
   A1–A8, W1, W4, W5, F1.
7. **One technical pass that reads everything**: the fittings, the points and the radiators placed
   after the furniture and the joinery, reading both and each other, and placed again whenever the
   flat is laid out again. Settles T1–T11, W6.
8. **Catalogue**: bounds per kind at load (a floor lamp is over 1 m, a fridge over 1.4 m, a door mat
   under 1.2 m), a report for admin, the misfiled kinds moved. Settles K1–K4, P4.
9. **Floors and walls**: looks that name products the catalogue has, a tiled room falling back to
   a tile; "wet" meaning allowed in a wet room, not only there; one list for the flat; labour from
   what is laid (F2–F8).
10. **One "a product takes a slot"** for the matcher, the AI check, the studio's swap and the
    calculator's picks, with the fit test and what stands on the piece re-seated (Q1, Q2, D4); doors
    and windows marked as the style's and drawn by seed, budget and width (Q5–Q7); a kept screen's
    floor recorded (Q3).
11. **The job**: no save under a live job, the revision compared before each paid call, only runs
    that wrote a flat counted, the seed and what was dropped recorded, and the person told what
    happened (J1–J7).
12. **Then the duplicates** (D1–D8, W10) and the dead paths (P1's shop kitchens: make them reachable or
   remove the branch).

## Reproducing the numbers

`pnpm audit:generation --seeds 6` is the measurement of section 3 on today's code (720 flats; the
tables there were taken on 1,080, nine draws): the same plans, the same catalogue, the same seeds
and budgets (`tests/helpers/generationAudit.ts`: draw *n* is seed *n* × 1000 + 7, with no budget, a
generous one and a tight one in turn), each finished flat audited with the app's own geometry
(`footprintOf`, `quadsOverlap`, `inDoorway`, `showerArea`, `decorFootprint`, `pieceWall`,
`ruleViolations`). It counts what can be read off the finished flat; *where* a piece was lost — no
slot laid, or no product fitted — was measured by replaying `layoutPlan` and `matchProducts` with
the same seeded `Rng` as `generateScene`, and "what one change recovers" (L) with an instrumented
copy of `autoLayout.ts`, one switch per rule: scratch scripts, not kept. The AI designer's side (D)
and the technical placement run from the technical step (G) are not in the command either.
`--refresh-catalog` saves the database's catalogue as the fixture; every count then moves, so the
baseline is recorded again in the same commit.
