# Generation audit (16 Nov 2026)

What generating a flat really does today — read from the code and measured on real plans — and
what is wrong with it: pieces it leaves out, clashes it creates, products it can never place, where
the AI designer and the engine disagree, rules stated twice with different numbers, and code written
more than once. This is the list to work from, before the owner's per-room rules are written in:
an item is ticked (`[x]`) in the commit that fixes it, with the new behaviour described in the topic
document, and the numbers in section 3 are as measured on 16 Nov 2026, before any fix —
`pnpm audit:generation` gives today's; "Where it stands" compares the two.

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

**A fix moves only the rooms it touches.** Each room draws its layout, its products, its bathroom
pass and its floor and walls from a stream of its own, keyed by the stage and the room
(`lib/design/random.ts`: `rngStreams`, `roomStreams` — [layout-and-matching.md](layout-and-matching.md#generating-is-random)),
and each half of a studio its layout and products from one keyed by the half too
(`layout:<studio>:p0`), so the owner's rules for one half are measured without the other's noise.
When the flat drew from one stream, a fix that added, dropped or re-sized one piece made its room
draw a number more or less and re-drew every room after it, so counts moved in rooms the fix never
touched and the baseline could not be recorded for the noise. Now a count moves where the change
is, or where something deterministic reads across rooms on purpose (a product used in an earlier
room drawn less often, the budget level, the flat's one floor from its lead room, the washer's
fallback room, one door and one window product). Because a stream is keyed by the room's id and
the fixture plans reuse ids (175 rooms, 59 ids; r2 is a room in 15 plans, a bathroom in 6), each
plan's draw *n* has a seed of its own (`runSeed(planId, n)`, the plan's id mixed into *n* × 1000 +
7): one seed for every plan would draw every room of an id the same numbers in every plan, and the
audit would sample far fewer draws than it has flats. Each new draw had the baseline recorded
again, once, with `--allow-worse` (every count is re-drawn, so some rise and some fall on 120
flats) — the plans' own seeds, and the studio halves' own streams. On 2,880 flats (24 draws) at two offsets of
the seeds, the one stream of main and the streams per room, with each plan's own seed, agree within
the draw's noise: mirror 860 and 864 against 804 and 856, sink 216 and 176 against 240 and 220,
basin height 471 and 465 against 435 and 466, door zone 220 and 212 against 224 and 237. The sink is
noise too: it moves in one room, #375's r6, missing its basin 96 and 100 times in 1,200 draws of
main against 105 and 89 per room (and #392's r6 381 and 370 against 394 and 375 in 600).

**The rare clashes left after three waves are fixed** (O3, O4, W2): on 720 flats `floor_overlap`,
`hung_clash`, `basin_in_air`, `in_joinery` and `out_of_room` are 0, each case traced to a step
that placed or moved a piece without testing it again — the bath's floor mixer tested as a ghost
(neither in a piece's way nor a piece in its) and pushed to the wall into the washer, the dryer
stacked under a mirror wider than its basin, a print hung inside the TV (by the matcher, and by the
AI check's swap), a shower cabin under a lifted basin, a WC's box built into the basin beside it, a
corner piece settled 0.04 mm through a wall drawn off square — and the invariants test holds all
five at 0. At 12 draws (1,440 flats) a washer's own column was built into the vanity planned for
the basin beside it (`in_joinery` 5: the column, wider than its machine, ran back over the vanity
that had stopped at the machine's side) — now the vanity, built after the column, stops at it
(`clearOfBuilt` in `bathroom.ts`), `in_joinery` 5 → 0 with nothing lost; one kind is left, of
another cause and not fixed yet: a WC in a shower's tray (`in_shower_tray` 1) — [roadmap](../roadmap.md).
Two clashes the audit does not count are kept as they were: where the cut would leave the vanity
narrower than its basin and 5 cm it stays into the column (2 of 1,440 flats, #375's r3, 4.9 cm),
and a basin stands 1.9 cm past a vanity cut back to a corner column (#373's r2) — what gives way
there is the owner's choice ([decor.md](decor.md#known-gaps)).

## Where it stands (18 Nov 2026)

Four batches are on `main` (the bugs of sections A–O that need no rule choice; each item says
*Fixed*, *Partly* or nothing). `pnpm audit:generation --seeds 6`, 720 flats, before (16 Nov) →
now — the draws differ (one stream then, a stream per room now), so a count the fixes did not
touch moves only within the draw's noise:

| What | Before | Now |
|---|---|---|
| Living rooms with no sofa | 48 | 0 |
| Bedrooms with no bed | 158 | 96 |
| Living rooms with no TV unit | 92 | 72 |
| Flats with a bathroom and no washing machine | 192 | 48 |
| Pieces arranged round a piece that is gone (every orphan) | 343 | 0 |
| A piece within 90 cm in front of a door | 292 | 56 |
| A TV unit on a room separator's line / free of every wall | 217 / 83 | 124 / 48 |
| A hung piece into what stands below (now canopy beds' pendants) | 369 | 102 |
| A hung piece into another (the mirror into the tap) | 274 | 0 |
| A basin hanging in the air | 106 | 0 |
| Joinery or a piece in a shower's tray | 58 / 19 | 0 / 0 |
| Joinery in a door's way / before a wall of wardrobe's doors | 157 / 129 | 0 / 0 |
| A socket inside a radiator · two main lights at one spot | 516 · 1,246 | 0 · 0 |
| The app's own checks: door swing blocked · radiator blocked · socket in a splash zone | 161 · 98 · 51 | 56 · 19 · 0 |
| A flat the save route would refuse | (not counted) | 0 |

Measured outside the command, in the lanes' scripts: Modern balconies in laminate 150 of 150 → 0;
flats with doors of two products 48 of 360 → 0 (one door and one window through a flat); calculator picks
out of the room, in a piece or on a door's floor 45 % → 14 %; the AI designer's picks the engine
ignored 1,009 of 3,465 → 494; the AI check shown the engine's own work as problems 481 times in 360
flats → 0, and an empty check changing 122 of 360 flats → 0.

Still as before, because each is a matter of which piece gives way (the owner's per-room rules):
bathrooms with no shower or bath 36 %, no mirror about 30 %, no WC 11 %; studios with no TV unit
76 %, no sofa 22 %, no fridge 22 %.

**Waiting for the owner** — decisions the fixes ran into, each written at its item:

1. *The TV on a real wall beyond 3.5 m* (O7, RL1): the sofa is now placed where its TV unit gets a
   real wall, at any distance the unit's rule allows; where that wall is 3.7–4.8 m off (#357, #365,
   #397, #399) the sofa–TV check fires (67 → 160 in 720 flats), and studio #399 gives up its
   bookcase, plant and lamp for it. Keep it, or prefer the open line, or something else?
2. *Rooms where no sofa spot gives the TV unit a wall* (15, listed under O7): left as they were —
   a sofa with its back to the open side, the unit as a divider, or no TV?
3. *The per-room ladders* (M1, RS1–RS3, RL2–RL5, RB1, RK1–RK4): what gives way when an essential
   does not fit — the numbers above.
4. *A wall of wardrobe needs its 75 cm clear in front* (W3): built ones fell from 213 to 54 in 360
   flats, the shop's wardrobe standing instead, and the bed-side check fires where it stands
   beside the bed (255 → 305, more beds placed counted in it too).
5. *The hall wardrobe's boiler section* (W6, E-4) is never built now that every boiler gets its own
   cupboard: which should win?
6. *A style's own floor in dry rooms* (F3): with wet-flagged tiles allowed in dry rooms an Industrial
   balcony takes the style's own floor 33 times in 150 (106 before); Industrial's bathroom slate is
   flagged dry, so no bathroom gets it — catalogue data.
7. *A door with no product on an outside wall* is estimated at the entrance door's price, a
   balcony's included (Q7b's remainder; the calculator's estimate would change).
8. *Decor beside low joinery* loses the wall above it (W4).
9. *Catalogue data* (K1–K4, P1): products filed under the wrong kind or with wrong sizes, and shop
   kitchens never generated (their names do not say sink and hob) — admin's, or a rule.
10. *An AI start refused by the plan's locks* is told as a failure (subscriptions), and *a row or
    track of spots* loses the one under a hanging lamp (the one-light rule, O5).

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
- [x] **M2 (high) — Strict style has no fallback when nothing of the style fits.**
  `STRICT_STYLE_KINDS` narrows sofas, beds, baths, wardrobes, dining tables and kitchens to the
  style's own products whenever the style has *any* (`matcher.ts:91`, `:156-159`) — not whenever one
  *fits*. Vintage's only corner sofa is 417 × 347 cm: 60 of 60 Vintage rooms with a corner-sofa slot
  got no sofa. Beds: 38 slots with no product (Industrial 22, Modern 14). *Fixed:* a slot none of
  the style's own fits takes a three-seat of the style (a corner sofa's slot), then the nearest
  other style's product of its kind that fits, then another style's three-seat (`slotSteps`); in
  360 flats no sofa, bed or wardrobe slot is left without a product (30, 19 and 8 before).
- [x] **M3 (high) — When a piece is dropped, what was arranged off it stays.** `placeableOnly`
  (`generateScene.ts:160`) removes a slot with no product and nothing else. In 720 flats: a coffee
  table with no sofa 60 times, a rug 87, an armchair 53, a TV unit 41, a TV 40; nightstands with no
  bed 34; a fridge or wall cabinets with no run 24. *Fixed:* what the engine arranged off a piece
  goes with it (`withoutOrphans`, `lib/design/arrangedOff.ts`, read from the archetypes' rules),
  after matching, after the calculation's picks and after the designer's check. The whole-flat
  check reads the same rules, so it no longer counts what the engine stands on its own when the
  other piece was never laid — a fridge in a kitchen with no run (a missing run). A rug is arranged
  off the piece it lies under or, in a room without it, the piece the room is laid out round
  (`mainSlot`): it stays while either stands and goes with both.
- [ ] **M4 (high) — Studios** (why, measured: RS1–RS5 in L). Each half is a room of its own (`layoutRoom`, `partRoom`), with the
  whole room's door zones and the open line as no wall. Two 40 m² studios never get a sofa; seven
  never get a TV. With no sofa the living half's rug is laid under whatever was placed first — a
  bookcase (`placeUnder`'s fallback, `autoLayout.ts:1424-1426`). *Partly:* the rug is fixed — it is
  laid under its own piece or, in a room with none, under the piece the room is laid out round (an
  office's desk), and nowhere without either: no rug under a bookcase or a wardrobe. The rest is
  RS1–RS5.
- [ ] **M5 (medium) — Program entries that cannot be placed.** An armchair is placed off a sofa
  (`placeRelative`, `:929-930`): the balcony's is never laid (0 of 684) and the office's cannot be. An entry
  with no gate silently takes the archetype's (`:291`): a balcony's plants need 10 m² (92 % of
  balconies are empty), a closet's wardrobes 8 m² (40 % get them), the office's bookcase 14 m² (0 of
  72), and the bedroom's "always a wardrobe" 8 m².
- [ ] **M6 (medium) — Slots no product can fill.** Products are matched by exact kind
  (`candidatesFor`, `matcher.ts:698`). The bedroom's rug is kind `rug_bed`, which has **no product**
  (the 15 rugs are `rug`): the rug is laid in 77 % of bedrooms and dropped in all of them. The hall's
  `shoe_cabinet` has none either. The shelf, by contrast, groups by slot (`kindsForRoom`). *Partly:*
  the bedroom's rug is given a rug — a kind with no product of its own takes another kind's where
  the matcher names the two as the same thing (`FILED_AS` in `matcher.ts`: `rug_bed` → `rug`, and
  nothing else: a blind takes no curtain, a single bed no double): 412 of 564 bedrooms have their
  rug, and a bedroom where no bed was laid has none (it lay under the wardrobe: `placeUnder`, M4).
  *Left:* the hall's shoe cabinet has no product (264 slots in 360 flats stay empty until the
  catalogue has one).
- [ ] **M7 (medium) — No washing machine in 31 % of flats with a bathroom.** It needs a bathroom of
  4.5 m², else a hall, else a room typed kitchen (`WASHER_FALLBACK_ROOMS`, `autoLayout.ts:212-226`) —
  never a studio's kitchen half, never a flat with no room typed bathroom.
  *Partly:* a studio's kitchen half is a kitchen for the fallback (`areasOfType`): 96 → 24 of the
  312 flats with a bathroom have none (the six studio flats have theirs: against a wall in five,
  free on the kitchen half's floor in #384, where no wall has room — the fallback's last resort,
  as in #412's hall). In a kitchen the machine keeps off the floor the kitchen's corner is then
  built on (`kitchenCornerFloor`): it first stood 60 cm along the leg's wall, and #393's studio
  lost its corner leg and the leg's wall cabinets on every flat that had them (19 of 24 over six
  draws; 22 of 24 have them now — the two without had none before the machine either — and no
  other plan's legs changed). The floor is the corner pass's own answer, asked before the flat is
  matched (`turnableCorners`, every run taken as made to measure). Where a kitchen has no wall
  for the machine off that floor it stands as it did and the kitchen has no corner: the flat
  keeps its washing machine (no flat of the fixtures; `layoutRules.test.ts` has the case).
  **Left:** the 24 are #394 —
  a bathroom of 4.39 m² under the 4.5 m² gate, a hall of 1.5 m², a kitchen that is part of the
  living room — and #353 — bedrooms and a 3 m² bathroom, no hall, no kitchen: where the machine
  goes in such a flat (a smaller bathroom, the living room's kitchen side) is a rule to write, and
  so is where it stands in a kitchen (in the run under the worktop, beside it, away from the
  table: with the machine by the fridge #393's and #389's studios seat a chair fewer on some
  draws — 99 → 91 and 29 → 26 chairs over 24 flats). A flat with no room typed bathroom still
  gets none: that is the rule.
- [ ] **M8 (medium) — Dining chairs disappear in the matcher.** (1) The 1.2 m minimum (K-10, L-6)
  is on the slot, not the product: 13 of the 31 dining tables are under 1.2 m (70 × 70, 80 × 80) and
  the draw only penalises products *wider* than the slot (`generationWeight`, `matcher.ts:123`) —
  the larger cause. (2) `seatAtTable` gives the n-th chair the n-th seat of the real table
  (`matcher.ts:450-458`), whatever seats the engine had found free: of 124 tables where the engine
  had skipped a seat (a wall behind it) every one lost chairs and 78 ended with one or none;
  skipping the same seats in the matcher kept 216 chairs where 171 are kept today. (3) `seatSlots`
  takes the width for the long side (`autoLayout.ts:1115-1160`); seven tables are filed 100 × 240.
  *Partly:* the second is fixed — each chair sits at the seat of the real table that answers to
  the one the engine gave it (the same side, the nearest along it), and only a chair whose own seat
  is not there or does not fit tries the seats that are no chair's (`seatsAtTable`, `seatingAt`):
  at the 52 tables in 360 flats where the engine had skipped a seat, 87 of the 132 chairs laid are
  kept (67 with the n-th seat) and 24 tables end with one chair or none (37); no table has fewer
  chairs than the n-th seat gave it. The first and the third are as they were.
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
  moves use it. *Partly:* a slot now takes a product that keeps a door's way, the layout's
  keep-clear floor (radiator strips, columns, a partition's floor) and a run's working floor clear
  wherever one does, and only else the one it would have had (`placeFitting`, two passes): pieces
  in a door's way 146 → 23 in 360 flats (12 of them the made-to-measure run, which is the
  layout's), on keep-clear floor 37 → 18, `door_swing_blocked` 77 → 19. Still not known to the
  matcher: a WC's 80 cm, an island's ring, a shower's tray (O2); and a chair seated round a table
  stands at its own seat where it fits there at all, in a door's way or not (M8).
- [ ] **O2 (high) — The shower's floor.** `PlacedItem.areaM` (the tray and its glass) is read by the
  layout's slot, `wallClear.ts:61` and one check (`ruleChecks.ts:284`). Everything else measures the
  50 cm column: `freeStretch` (`decor/joinery.ts:208-212`, so the vanity, the washer's column, the
  bath's box, the hall wardrobe and the kitchen leg), the matcher's blockers once the shower is
  matched, `tightSpots`, the studio's drag test, `reviewFindings`, the splash zone
  (`ruleChecks.ts:304`) and the boiler's clearance (`ruleChecks.ts:153`).
  *Partly:* one function answers "the floor this piece takes" (`floorTaken`, `shower.ts`: a
  shower's tray and glass, a cabin larger than its tray its own size, anything else its box) and
  `freeStretch` reads it — so the vanity, the washer's column and where the washer is moved to, the
  bath's box, the hall wardrobe and the kitchen leg stop at the tray: `joinery_in_tray` 34 → 0 and
  `in_shower_tray` 15 → 0 in 360 flats, nothing lost. Still reading the column: the matcher's
  blockers, `tightSpots`, the studio's drag test, `reviewFindings` and the boiler's clearance.
- [x] **O3 (medium) — The passes after the matcher test for themselves, partly.** The bathroom pass
  moves the washer beside the vanity (`bathroom.ts:116-146`) and stands a floor mixer in front of the
  bath with no test at all (`:268-271`). `fitHall` reads the hall's width off its bounding box
  (`narrowSide`, `hall.ts:138`): in an L-shaped hall a 60 cm wardrobe left 68 cm. The joinery may
  stand in front of 25 cm of a door's width (`CORNER_OVERLAP_M`), which the engine's own door zone
  would refuse: a bedroom's wall of wardrobe does, by 10–25 cm, 61 times in 720 flats.
  *Fixed:* what the bathroom pass moves or adds on the floor is tested where it is put
  (`standsClear`: `isPlacementValid` with a shower as its tray, the joinery built, `inDoorway`,
  the keep-clear floor `generateScene` now hands the pass): the washer goes into a column beside
  the vanity only where it then stands clear, else its column is built where it stands; a floor
  mixer goes to the bath's other end, else a wall mixer — `on_keep_clear` 15 → 8 and
  `rule:radiator_blocked` 18 → 11 in 360 flats (washers moved onto a radiator's strip). The hall's
  wardrobe is as deep as the hall's clear width in front of its wall's free span (`widthInFront`),
  and generation's joinery keeps out of every door's way, across the room too (`freeStretch` with
  `strict`) — `joinery_tight` 3 → 0 in 360 flats; generation's corner no longer allows 25 cm (W7).
  *Fixed:* the residual cases too — a floor mixer is tested as the solid it is (`isPlacementValid`
  with `solid`, which `blockingItems` honours too: its archetype is a ghost, so nothing had stood in
  its way and no piece moved had found it in its own) and the tidy-up leaves it
  by its bath (`settleToWalls` passes over `hostOf`'s companions) and keeps a settled piece inside
  its room (`shiftWithFront`), and a WC's box stops at what stands beside the WC on its wall
  (`wcBoxes`) — `floor_overlap` 3 → 0, `out_of_room` 1 → 0, `in_joinery` 1 → 0 in 720 flats.
- [ ] **O4 (medium) — Hung pieces.** The bathroom mirror's middle is set at 1.5 m whatever is under
  it but a floor piece (`settledElevation`, `matcher.ts:641-660`); the tap is added later at the rim
  plus 12 cm (`bathroom.ts:219`) — about 1.02 m, under a mirror that starts at 1.12 m: 421 in each
  other in 1,080 flats. A tall mirror in the hall (every hall mirror placed is 1.4 m or taller)
  keeps the slot "over the console" and is hung 30 cm off the floor (`matcher.ts:650`, which
  returns before the lift over what stands below): 418 run into the console, 156 of them in halls
  that did get the wardrobe. A pendant hangs in the middle of the room whatever stands under it but
  a table. *Partly:* the hall's mirror is fixed — over the console it is one that hangs clear of it
  (`slotPool`), and the full-height one hangs where the wall is free from the floor up: across from
  the wardrobe (`fitHall`) or on a bare wall; no mirror runs into a console in 360 flats (143
  before). The bathroom mirror is fixed too: once the pass has put the tap on, the mirror over the
  basin is raised clear of the basin and the tap by the matcher's 12 cm (`hungClearOfBasin`) —
  `hung_clash` (every one of them a mirror into a tap) 140 → 0 in 360 flats — and a tap that goes
  on the wall because the basin leaves no deck behind it is a wall tap where the catalogue has one
  (`tapSpot`), not a deck mixer up to 52 cm tall hung on the wall: mirrors with their middle over
  1.75 m 105 → 38 of 308 (4 before the mirror was raised). Of the 38, 22 hang over the 43 cm black
  panel mixer with its wall plate (a wall tap) and the rest are tall mirrors over high basins —
  whether such a tap or mirror goes there is the owner's rule. The pendant is as it was.
  *Partly:* hung pieces no longer run into one another — the matcher hangs a piece clear of what
  already hangs under it on its wall (`hungClearOfHung`: a print over a TV on its stand; the AI
  check's swap the same, `rehungClear`), the washer's column and its dryer go where they stand clear
  of a mirror over them (`hungOver`), and where none does the mirror gives way to the best mirror of
  the style that hangs clear of them at a mirror's height (`mirrorClearOfColumn`; with none it stays
  as it hung — never lifted out of sight) — `hung_clash` 3 → 0 in 720 flats (6 → 0 in 1,440). The
  matcher still hangs a mirror without a fit test (a 1.29 m mirror over a 55 cm basin's slot).
- [x] **O5 (low) — Two main lights at one spot.** The program's `pendant` (an item with a product)
  and the wiring's ceiling light (a point with a product) are both put in the middle of the room —
  `electrical.ts` never reads the pendant: 59 % of bedroom pendants, 53 % of living-room ones and
  every office one have a ceiling point within 35 cm. The 3D view draws one lamp (the point shows
  only its rose under a hanging lamp, `lib/design3d/buildStructure.ts:234`), but the lighting plan
  lists two primary lights and a renovation's budget buys both (a design-only budget leaves
  generated points out, `pricing.ts:669`). In an L-shaped room the two middles differ (area
  centroid, `planGeometry.ts:78`, against the corners' mean, `electrical.ts:239`). *Fixed:* the
  ceiling point under a hanging lamp is that lamp's outlet (`lampOutlets`, `isLampOutlet`,
  `ElectricalPoint.lampOutlet`): no product, not in the lighting plan, not bought, not given the
  flat's ceiling light (`dressBoard`), still wired — `two_main_lights` 213 → 0, which counts every
  ceiling point at a hanging lamp that is not its outlet; and both middles are the area's centre
  (`roomMiddle`). The outlet goes by the lamp that hangs at it, not by a lamp's id: in 323 rooms
  whose wiring was kept and the flat generated again, 311 outlets are the new lamp's and 12 — the
  lamp now hangs elsewhere — are ceiling lights with a lamp of their own. With the lamp deleted or
  moved off the point is given a lamp like any other fitting, and a lamp picked for it in its panel
  is put on it ([technical-and-fittings.md](technical-and-fittings.md), Known gaps, for when).
- [ ] **O7 (high) — The TV unit is stood on a room separator's open line.** `placeRelative` is
  handed the room's whole outline (`autoLayout.ts:468`, `:1031`: "the wall the sofa faces" is
  whatever the ray meets), not the walls: in a living room that opens onto the kitchen or the hall
  the unit stands in the opening, its back to the next room, and the TV, with no wall behind it,
  only if it is one on a stand. **208 of 364 living-room TV units** on these plans; 56 more stand
  free of every wall. The cause is upstream, in how the sofa's wall is scored (RL1).
  *Partly:* the sofa now stands where its unit has a wall whenever its room has such a spot (RL1) —
  at the layout stage 288 of 608 living-room units on a wall (108 before), 160 on a line (280).
  Where no spot of the sofa gives the unit a wall the room is laid as before, and what should
  stand there — a sofa with its back to the open side, the unit as a divider, no TV — is the
  owner's rule to write: the unit on a separator's line in the living rooms of #381, #368, #361,
  #359 and #358, free on the floor in #408 and #405 r2, on the studio's dividing line in #385 (one
  draw in eight); no unit at all in #407, #394 r5, #373 r5 and the studios #393, #392, #386 and
  #384 (RL2–RL5). The studio #399 had no such spot until a wall as long as its corner sofa could
  be stood on (RB6) — and pays for the one it has: the 2.7 m sofa on the 2.72 m wall takes the
  wall the bookcase stood on, so over six draws the studio has no bookcase (16 of 24 flats
  before: its slot is laid 72 cm wide where it was 90, and the matcher finds no product for it),
  no plant (16 before; no spot at the layout stage) and a floor lamp on 8 flats of 24 (24
  before), and its TV is 4.2 m from the sofa. Whether a spot whose unit has a wall only beyond
  3.5 m, at the cost of other pieces, is a good spot is the owner's to say (RL1).
- [ ] **O6 (low)** — A pendant, a door mat, a rug and curtains are never fit-tested (`fitMatters`,
  `matcher.ts:353`): a 3.16 × 3.96 m pendant cluster in a bedroom, a 2.03 × 1.27 m door mat in a hall.
  *Partly:* a door mat and a hanging lamp take the first product that lies within the room
  (`liesWithinRoom`), and only with none the one drawn (a rug and a curtain are sized to the room
  by the layout): door mats through a wall 103 → 21 in 360 flats, hanging lamps 5 → 0. *Left:* 21
  door mats still lie through a wall — Scandinavian halls, which keep the one mat that fits out as
  black — and the mat that lies inside most halls (87 of them) does so only because it is filed
  15 × 11 cm; the other five are filed 2.03 × 1.27 m (the catalogue's sizes, K2).

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

- [x] **A1 (high) — It is offered what the engine will refuse.** The offer is every product of the
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

  *Fixed:* the designer's offer and the check's alternatives are one pool, `pickPool` (`aiDesign.ts`),
  built with the matcher's own functions — `kindPool` (strict style, the style's rejects) and
  `slotPool` (with the budget level the matcher infers) — on the slot as it stands for the check, and
  for the brief, which has no layout yet (A3), on the archetypes laid against the room's longest
  wall under the room's real ceiling. The stand-in designer of the audit (six plans, four styles, one
  pick per offered kind): picks the engine had the kind for and did not take 1,009 of 3,465 → 494 of
  3,479 — what is left is fit and the hall's mirror the hall pass hangs (the bathroom pass's own pool
  is the joinery lane's). `decor.test.ts`'s "rarely offers again" (V2) now has a pool of the style's
  own to draw from.

- [x] **A2 (high) — It is asked about pieces the room will not have** (27 % of kinds offered).
  `programKinds` (`aiDesign.ts:153-163`) re-implements the engine's gate without the archetype's
  minimum area, the bath-by-style rule, the window test, the optional-decor draw or a studio's
  halves (it offers a corner sofa for the whole studio while the half gets a three-seat), and knows
  nothing of the passes that replace pieces (the wardrobe by a wall of wardrobe in 34 % of bedrooms,
  the coat rack by the hall wardrobe in 46 % of halls). Its room note can describe a piece that is
  not there.
  *Fixed:* `programKinds` asks the engine's own gate — `programPiece`, lifted out of `layoutArea` and
  exported (the room's or the part's area against the entry's and the archetype's minimum, the bath
  by style, a window for a curtain) — on each half of a studio (`partRoom`). On the fixture flats
  (one draw, four styles) kinds offered 4,704 → 4,425 and kinds the engine flat then lacks 1,259
  (27 %) → 934 (21 %). Left — they need the layout first (A3) — the draw and the passes: the optional decor
  (`OPTIONAL_DECOR`), the coat rack the hall wardrobe replaces, the wardrobe a wall of wardrobe
  replaces, and pieces with no room left (a balcony's armchair, a shower).
- [ ] **A3 (high) — It designs before the layout exists.** The layout does not depend on its answer
  and takes 40 ms; run first, the brief could name the real slots (size, wall, what stands beside),
  the matcher's own pool per slot, and the walls that are really free for decor. Today a decor
  intent on "wall 2" is chosen blind and dropped when the engine put the wardrobe there.
- [x] **A4 (high) — The check is shown the engine's own work as PROBLEMS.** `reviewFindings` reports
  a WC in front of its box as "stands 21 cm off the wall behind it" (559 times in 720 flats), a washer
  in its column and a bath in its box as "stands in the cabinet decor" (337 times)
  (`aiReview.ts:121-130`, `:143-146`). A `to_wall` on the WC is accepted and does nothing.
  *Fixed:* a piece is no problem for standing in or in front of what was built for it (`builtFor`:
  the link, a box from before it, the piece's tap, dryer or mixer), a WC's distance off its wall is
  measured from its box's face — and a `to_wall` is kept only for a piece measured off its wall
  (`offWall`; a WC on its box's face: refused, 112 of 112 on 120 fixture flats), putting it on the
  face — and the brief names what each piece stands in (on 360 fixture flats: 279 + 202 such
  findings → 0; what is left on fitted pieces is the rule checks' — a WC the door opens onto, a
  basin's height, a radiator).
- [x] **A5 (high) — The check's actions ignore what belongs together.** Verified through
  `validateReview` and `reviewedScene`: `move_to_wall` on the kitchen run is accepted (the prompt
  suggests it) and leaves the wall cabinets and the fridge on the old wall; on the sofa it leaves the
  coffee table, TV unit, TV, armchair and rug round empty floor; `remove` on the TV unit leaves the TV
  on the wall; `remove` on a blind and on a pendant is accepted, against "every window dressed" and
  "one main light". Only three relations are hand-listed (`PLACED_OFF`, `IN_FRONT`,
  `aiProposal.ts:113`, `:196`). Its moves test doors and windows but not radiators or columns.
  *Fixed:* a removal takes what was laid out off the piece with it (`withoutOrphans`, now tested
  through `reviewedScene`) and a curtain, a blind or the ceiling lamp is never removed; a move takes
  along what rides and stands on the piece (`carryCompanions`, `carryRiders`) and is tested against
  the matcher's keep-clear floor (`keptClear`: columns, radiator strips, a partition's floor, the
  run's working floor); `move_to_wall` is refused for a piece anything else is laid out off, one
  laid out off another, and one made to its place (`heldByMove`, every relation the placement rules
  name) or placed off the walls (`movable`: at a window, from the ceiling, under a piece, free in
  the room), and the brief marks those "stays on its wall" or "stays where it is" — on 60 fixture
  flats the sofa (46 of 52), the run (61 of 67), the bed (80 of 86) and the TV unit (36 of 36) stay;
  `to_wall` is kept only for a piece measured off its wall (`offWall`: no lamp, rug, curtain, blind
  or kitchen cabinets pushed alone onto a wall — 0 of 704 on 60 flats); a curtain and the ceiling
  lamp, which may not be removed, are offered alternatives; and a move is kept only where the piece
  stands well once what was built for it is settled behind it (`standsAfterMove`: 59 of 345 WC moves
  dropped — the box rebuilt into a shower, bath, basin or washer, or the WC pushed into a doorway).
- [x] **A6 (medium) — The wiring is not redone after the check.** `finishFlat`
  (`lib/api/designJob.ts:289-290`) writes the items and decor the check changed and keeps
  `scene.electrical` as laid: bedside sockets stay where the bed was.
  *Fixed:* `reviewedScene` re-wires every room whose furniture or decor the check changed, as
  `generateScene` wires (a room wired by hand kept, the calculation's choices applied), leaves the
  other rooms' fittings as they were and changes none when the check changed nothing; `finishFlat`
  writes the fittings it returns.
- [ ] **A7 (medium) — The rules are restated in two prompts**, numbers and all (85 cm basin, 80 × 80
  shower, 60 cm wardrobe, 1.2 m in front of the run, decor heights; `aiDesign.ts:266-289`,
  `aiReview.ts:291-315`) — a third copy to keep in step. "At most one decor piece in a hall, kitchen
  or bathroom" is in the prompt only: the code allows three (`aiDesign.ts:446`).
- [ ] **A8 (medium) — What the engine draws ignores the designer's palette**: the kitchen's
  material, the joinery's, the taps, the lamps on the wiring.
- [x] **A9 (low)** — The brief calls every room that is not four-cornered "L-shaped"
  (`aiDesign.ts:184`). *Fixed:* the brief says what the outline is (`outlineText`): rectangular,
  L-shaped (six square corners), so many corners (and "not square" when it is not; a wall drawn as
  two edges is one wall), and the box it fits in.

### E. Rules that contradict each other

- [ ] **X1 — The basin's top**: 0.85 ± 0.07 in the rule and its check (`rules.ts:327`,
  `ruleChecks.ts:291`), 0.86 in the matcher (`matcher.ts:642`), 0.90 for the vanity
  (`decor/joinery.ts:28`); a "countertop basin" is under 45 cm in `matcher.ts:475` and under 50 cm in
  `bathroom.ts:79`. 163 basins in 1,080 flats fail the app's own check.
  *Partly:* what places the basin puts its top at `BASIN_TOP_M` — the matcher's lift
  (`settledElevation`) and the vanity, whose height follows from the basin's (`vanityTop`: 85 cm
  less the basin, between 70 and 90 cm) — and a countertop basin is one under
  `COUNTERTOP_BASIN_MAX_M` (45 cm, the matcher's) for the bathroom pass and the studio's
  `takesHousing` alike (the matcher's own `slotPool` and `settledElevation` still write 45 / 0.45 as
  literals — the matcher lane's to point at the constant). `rule:basin_height` stays 105 in 720
  flats: none of the 105 was the 86-against-90 cm mismatch (those tops were within the check's
  7 cm). 88 are Vintage's standing basins the matcher takes from any product 60 cm or taller
  (`slotPool`'s `standing`): a console washbasin 95 cm tall (#2366, 74), a vanity of 1.27 m (#2431),
  pedestals of 77 cm and 1.17 m, a vanity of 1.01 m — choosing a standing basin by its height is
  the matcher's rule to add, and the products' heights are catalogue data (K); 17 are a basin 30 cm
  tall (#1817, a kitchen's granite double sink with a drainer filed as a basin — K) on the lowest
  vanity, 70 cm, its top at a metre — what such a basin becomes is the owner's rule (W2).
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
- [x] **X7 — A radiator's floor**: its length plus 10 cm by its depth plus 30 cm for the layout
  (`radiatorKeepouts`, `ruleChecks.ts`); a 90 cm square block for the kitchen leg (`kitchenCorner.ts:50-54`).
  *Fixed:* one definition, the strips — generation's corner pass already kept off them; the
  studio's own corner (the store's `setKitchenCorner`, `setKitchenLegLength`) now reads them too
  (`radiatorObstacles(plan)`: `radiatorKeepouts` read off the plan, by where the radiator hangs), a
  change to a person's own action on purpose; `kitchenCorner.test.ts` holds that the person's leg
  is the one generation builds there, beside a radiator named for a room the plan no longer has.
- [ ] **X8 — Rules the next stage undoes**: the table of 1.2 m (slot) and a 70 cm table (product);
  "always a wardrobe" and the 8 m² gate; "a TV only with a unit" and "every window dressed" against
  the AI check's `remove`.
- [x] **X9 — One name, two lists**: `WET_ROOM_TYPES` is bathroom, toilet, kitchen in
  `lib/calculator/constants.ts:69` and bathroom, toilet in `rules.ts:243`. Which rooms are heated,
  which fixture needs water and which points a room gets are each tabled two or three times with
  different members (`radiators.ts:46`, `technical.ts:33-43`, `autoTechnical.ts:46-70`,
  `rules.ts:121`) *(the last three not re-checked)*.
  *Fixed:* the calculator's list is `WATER_ROOM_TYPES` (rooms with water, the kitchen among them),
  the design's `WET_ROOM_TYPES` is a table of its own (today the members of the calculator's
  `BATH_ROOM_TYPES`, which a test pins, not the same array), read by `isWetRoomType` — renamed from
  `isWetRoom`, the calculator room's flag that means the rooms with water — and by the wiring's and
  the lighting's bathroom checks; every piece fed water drains (`sewer` attracts
  `COLD_WATER_SLOTS`); the
  water a piece is fed is `COLD_WATER_SLOTS` / `HOT_WATER_SLOTS`, from which the layout's pull to
  the pipes and the hints' lists are named differences (the WC drawn to its shaft, the island to the
  water, a shower checked by its drain); `TECHNICAL_KINDS[*].rooms`, read by nothing, is gone, so
  `BY_ROOM` and `isHeatedRoom` are the one table each — no change in behaviour. *For the owner:* the
  calculator's plan-less `ROOM_POINTS` heat neither a toilet nor a hall, which `suggestRadiators`
  heats (from 3.5 m²); and an island is drawn to the water though nothing brings it a pipe.
- [x] **X10 — Unused numbers in `rules.ts`**: `COFFEE_TABLE_GAP_M` and `TV_CENTRE_M` are read by
  nothing — the live 0.42 and 1.05 are literals in `catalog.ts:217`, `:241`; `KITCHEN_WORKTOP_M` is
  only re-exported; `BASIN_TOP_M` and `SPLASH_ZONE_M` are read by the check and not by what places
  the basin or the sockets.
  *Fixed:* the coffee table's gap and the TV's centre are read from `rules.ts` by their archetypes,
  the wall cabinets hang half their height over `WALL_UNIT_BOTTOM_M`, which is `KITCHEN_WORKTOP_M`
  and the 55 cm over it, and the basin's socket keeps out of `SPLASH_ZONE_M` (`splashBlocks`) while
  the bathroom pass lifts a basin to `BASIN_TOP_M` — the same values, the audit's output unchanged.
  The duplicates left are in other lanes' code: the matcher's 0.86 basin (X1), the island's 1.2 m in
  `autoLayout.ts` (X6) and the backsplash's 0.9 m worktop in `decor/resolve.ts`.

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
- [x] **D3 — What is built round a piece, twice**: the vanity in `bathroom.ts:79-97` and `vanityFor`
  (`decor/housing.ts:308`); the washer's column in `bathroom.ts:110-162` and `columnFor` (`:283`); the
  bath's box in `bathroom.ts:279` and `boxFor` (`:489`, without Vintage's surround); the WC's box in
  `decor/wcBox.ts` and `housing.ts`. Generation uses the first of each, the studio the second.
  *Fixed:* one set of builders for both (W10).
- [ ] **D4 — "A product takes a slot", four ways**: the matcher (`matcher.ts:281-302`), the AI
  check (`aiProposal.ts:385-392`), the studio's swap (`store/designStore.ts`), the calculator's picks
  (`fromCalculator.ts:109-116`, with no fit and no height) *(the last two not re-checked)*.
- [x] **D5 — "What stands in front of this wall", twice**: `wallBlocks` + `clearOf`
  (`wallClear.ts`) and `freeStretch`'s own loop (`decor/joinery.ts:207-230`), with different lists of
  what does not count; the margin round an opening is 0, 5, 8 or 10 cm by caller.
  *Fixed:* one test of what stands in front of a wall (`alongWall`), one list of what stands before
  no wall (`NOT_IN_THE_WAY`) and one floor per piece (`floorTaken`, a shower's tray) for both; the
  joinery's own extra list is named for what it is (`OVER_JOINERY`: hung over it or riding on a
  piece, which a fitting is kept off), and each caller's reach and margin round an opening stay its
  own — every flat of 360 unchanged, byte for byte. One reading did change outside generated
  flats: `wallBlocks` read a shower by its tray (`showerArea`) and now by `floorTaken`, the tray or
  the cabin, whichever is larger — a cabin the studio's resize left larger than its tray
  (`resizedShower` clamps the tray whatever the cabin) is now a block as wide as the cabin.
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
  behind lower pieces — the kitchen run (57), the bed's headboard (40). *Partly:* every generated
  fitting slides along its wall off a radiator or a towel rail (`radiatorBody`, `makeOnWall`), and a
  general socket keeps off a kitchen run and a wardrobe however low — `socket_in_radiator` 83 → 0.
  *Left:* a general socket behind a bed's headboard, a sofa's back or another low piece — which
  pieces hide a socket is for the per-room rules (one set, `HIDES_A_SOCKET`).
- [ ] **T3 (high) — A towel rail is a radiator point that no radiator rule knows.** Hung over the WC
  (the rulebook's BA-19) it makes that WC `radiator_blocked` (60 of 60), and on the next generation
  its strip is a keep-clear floor: the WC is moved (55 of 60) or dropped (5). Every rail raises
  `radiator_not_exterior`. Placed before the furniture, its 0.58 × 0.375 m strip costs a
  2.4 × 3.2 m bathroom its shower on 14 seeds of 40 (`ruleChecks.ts:85-135`, `technical.ts:288-298`,
  `radiators.ts:228-247`). *Partly:* a rail is in the way only of what stands up into it, raises no
  `radiator_not_exterior`, and hung over a WC takes no floor (in four test bathrooms × 40 draws the
  WC was flagged 40 of 40 and moved 40 of 40 on the next generation; now 0 and 0). A rail hung at
  60 cm in a bare bathroom still keeps its strip: with the floor freed and no height-aware obstacle
  in `autoLayout.ts`, a basin or a washer's column was generated up into the rail in 7–29 of 40 draws
  (0–4 with the strip).
- [x] **T4 (medium) — A studio kitchen's spots hang in the living half.** The row is put on the
  line through the room's middle, taken for the whole studio (`electrical.ts:516-528`): 2.9 m in
  front of the worktop, one of them 2 cm from the room's own ceiling light. In L-shaped kitchens
  every spot was outside the room in 36 of 200 runs. *Fixed:* the row runs through the middle of
  the floor in front of its run — a studio's kitchen half, and the shallowest floor the run has
  before it where the room is no rectangle (`kitchenSpots`): over 360 flats a studio's row was in
  the living half in 48 of 96 runs and is in none, on average 1.0 m in front of the worktop
  rather than 2.0 m; in the five L-shaped kitchens the row was wholly outside the room in 36 of
  200 runs and partly in 20 more, and is inside in all 200.
- [x] **T5 (medium) — A corner kitchen's leg is taken for a second run.** The leg copies the run's
  slot (`kitchenCorner.ts:178-189`) and `autoTechnical.ts:122-129` has no `legOf` test: all 74 legs
  in 240 flats got a hot and cold pair of their own, and where the leg is the longer piece (9) the
  sewer, the gas and the hood went to the leg, which has no sink or hob. *Fixed:* the technical
  points, the kitchen's wiring and the step's hints all leave a piece with `legOf` out — the run is
  what is served.
- [x] **T6 (medium) — Radiators are moved clear of furniture one at a time**, and the fallback
  returns the wanted spot even across a door (`radiators.ts:261-271`, `:311-331`): two radiators
  touching or on one spot (8 pairs in 120 flats), a radiator across a door by 30–50 cm in a hall
  with a door in every wall. *Partly:* a room's radiators are hung together — the ones that stay
  first, the ones that move clear of them — and one whose spot is across a door slides beside it
  (`clearSpot`): hanging them in 360 generated flats, 20 pairs overlapped and none does (one pair
  is side by side, 5 cm apart), and in the 30 bare plans 7 radiators were across a door and 2 are.
  *Left:* a radiator is placed as 80 cm long and the catalogue's panel is up to 1.4 m, so 9 of
  1,846 still reach 3–20 cm across a door they were hung beside — `suggestRadiators` would need
  the style's product before it places (T13).
  *Fixed:* given the style, each radiator is placed at the length of the product it will be (its
  window's, its share of the room's sections) and the room's count from that product's watts; an
  80 cm radiator only where no wall holds its length between the doors. The 30 plans bare and
  furnished (3 draws), four styles, 600 flats: radiators across a door 15 of 2,272 → 0 of 2,376
  (more radiators: a section of the style's radiator gives less than 170 W), overlapping pairs 0.
- [ ] **T7 (medium) — The boiler looks at nothing.** `hallCupboardSpot` and `clearOfWet` take no
  furniture (`autoTechnical.ts:234-274`): the cupboard through the WC on 15 of 30 seeds of one flat,
  the boiler exactly on the electrical panel in 8 of 30. *Partly:* the cupboard's stretch of wall is
  clear, from the floor up, of the furniture, the joinery and the equipment already hung there
  (`cupboardBlocks`), in the hall, the bathroom and the old rooms alike; a room with no such
  stretch keeps its boiler, off the panel first. In the 30 bare plans the boiler was on the panel
  in 9 and is in none; placed in 240 furnished flats, it was on the panel in 6 and is in none,
  through a WC in 4 and its box in 7 (now none and 1), through a basin in 7 (now 4), on a
  studio's air conditioner in 6 (now none). *Left:* a hall or a bathroom with no stretch
  clear (the hall's mirror on the only wall that holds the cupboard, 9, a basin, 4), and the Vintage boiler,
  whose cupboard is 1.4 m wide once it has its product — the placement goes by the 62 cm of a
  boiler without one (T13).
  *Partly:* given the style and the catalogue, the cupboard is measured at the size of the boiler
  the style will buy (`boilerSizeFor`) in every room it may go to; in the hall and the bathroom
  each strictness is tried at that size and then at a default boiler's (`tierBySize`), so the
  cupboard is never put through furniture at full size where a default one's stretch was clear of
  it, and the room does not change: in the same 600 flats a cupboard through furniture, a door or
  a window, or past its wall's end, 82 of 480 → 33 (Vintage 75 of 120 → 26; past a wall's end 69 →
  22, through furniture 19 → 16, through an opening 4 → 0; none worse than before). *Left:* the 26
  Vintage flats with no clear 1.4 m keep the default cupboard's spot, the real one past its wall's
  end or through the furniture beside it — which room takes a cupboard the hall has no wall for
  is the owner's.
- [ ] **T8 (medium) — One edited fitting freezes a room's wiring.** Any edit, a product swap
  included, marks the point the person's (`store/designStore.ts:1247`); `wiredByHand` then skips the
  whole room (`electrical.ts:181-184`): generating again moves the furniture and keeps every old
  socket and light in that room (12 of 12 plans).
- [x] **T9 (medium) — The studio's own "wire it" does not pass the decor**
  (`store/designStore.ts:1180`): a switch or a socket inside built joinery in 42 of 129 bedrooms
  with a cabinet (none when the decor is passed). *Fixed:* it passes the decor, as generation does.
- [x] **T10 (medium) — A washing machine gets no socket**, in any room (`furnitureFor` has no
  washer), and one the layout sent to the hall gets cold water and no drain (84 of 108 halls;
  `BY_ROOM` has no hallway). *Fixed:* it has a socket behind it at 30 cm, out of the splash zone
  (196 of 216 machines in 360 flats; the rest stand on a room separator's open line or by a wall
  that is in a splash zone from end to end), and a room with a machine and no sewer gets one at it.
- [x] **T11 (medium) — A fitting that falls on a door or a window is dropped, not moved**
  (`makeOnWall` returns nothing and no caller tries again): every run under a window (40 of 600)
  loses the hood's socket and one worktop socket. A run of exactly 3.0 m gets two worktop sockets
  where 3.01 m gets three (`0.8999… >= 0.9`, `electrical.ts:488`). *Fixed:* it slides along its wall
  to the nearest clear spot (`clearSpotOnWall`) — over 360 flats 150 switches, 87 two-way switches,
  61 wall lights, 52 sockets and 20 each of the hood's sockets, the worktop's sockets and the
  under-cabinet lights are no longer lost — and a 3.0 m run gets its third socket.
- [ ] **T12 (low)** — A switch 1–3 cm from the corner where the wall beside the door is short (24
  of 544 switches; `electrical.ts:139-152`) — *not fixed: no plate runs past the wall's end any more
  (168 did in 360 flats) and the switch leaves the handle side only when its spot there is taken,
  but a plate that slides stops a centimetre from the corner (137 of 3,543 switches, 39 more within
  3 cm) — how far from a corner a plate keeps is a clearance nobody has set.* The basin's own socket inside the splash zone its
  check reports (23 of 335; `electrical.ts:536-543` does not read `SPLASH_ZONE_M`) — *fixed: it is
  placed out of the zone, which is now measured from the shower's tray, not the column standing in
  it (`rule:socket_in_splash` 6 → 0; 11 → 0 by the tray).* A room's middle
  taken as the mean of its corners: 29 of 107 lights over 50 cm off the real middle, an L-shaped
  hall's arm unlit (`:239`, `:324-337`) — *fixed for the room's main light and the bedroom's track:
  the area's own centre (`roomMiddle`), inside the room; an L-shaped hall's arm is still unlit when
  no light of the row along its longer side falls in it (`hallLightSpots`).*
- [ ] **T13 — Reported, not re-checked**: rooms under 1.2 m² get no points and bathrooms under
  3.5 m² no towel rail; a room entered through a separator gets a light and no switch; a second
  sofa, desk or basin gets nothing; `CLEAR_WALL_M` 0.5 against cupboards of 0.62 and 0.8 m;
  `BESIDE_RADIATOR_M` 0.8 against radiators of up to 1.12 m; radiators counted at 170 W a section
  whatever the product; "an outside wall" defined two ways (`technical.ts:296`); margins round an
  opening of 5, 8, 10 and 15 cm; `TECHNICAL_KINDS[*].rooms` read by nothing.
  *Partly* (each re-checked, 18 Nov): a room entered through a separator alone has its switch at
  the separator, 20 cm from it as at a door (`separatorEnds`) — rooms with a light and no switch in
  360 generated flats 498 of 2,220 → 232, every one left a room with no door and no separator (plans
  whose doors were never drawn) — and on the calculator's board too, whose sheet then counts the
  switch: 16 of the 30 fixture boards gain switches, 11 sheets 52–272 ₾ ([calculator.md](../calculator.md));
  a second TV unit, sofa, desk or basin gets the sockets the first
  has (none is generated today; the studio adds them); the 80 cm radiator, the 170 W section and
  the kinds' room lists are fixed under T6 and X9; `CLEAR_WALL_M` 0.5 is the cupboard's own width
  once the style's boiler is known (T7), and stays the fallback where nothing wider fits, so no
  boiler is lost. *Left for the owner:* the size gates (no points under 1.2 m², no radiator or towel
  rail under 3.5 m²); which "outside wall" a radiator is judged by — the geometry's (nothing behind
  it in the plan, which takes a stair-hall wall too: `outsideEdges`, where `suggestRadiators` hangs
  one in a windowless room) or the hint's (a window or an outside door in it), so a radiator the
  button hangs on a windowless outside wall is hinted `radiator_not_exterior`; and the margins round
  an opening — 5 cm for equipment, 8 cm for a fitting's middle, 10 cm for a radiator's or a
  cupboard's stretch, 15 cm for a radiator beside a window — which are clearances for different
  things, not one number.

### H. Wall decor and joinery

Measured on 360 generated flats (1,004 cabinets and boxes) and, for the designer's decor, on 240
flats fed hand-written intents for every family and anchor. W1–W3 and O7 were re-run for this
document; the rest is from a side review that was stopped before it reported — its scripts and
outputs were read, not re-run.

- [x] **W1 (high) — After the AI check the built pieces are settled again by other formulas.**
  `reviewedScene` runs `settleFitted` (`generateScene.ts:152`), which uses the studio's builders
  (`decor/housing.ts`), not the ones generation built with (`bathroom.ts`, `decor/wcBox.ts`). With
  **no fixes at all** 108 of 360 flats change: WC boxes slide or change width (108), 76 boxes built
  flush to the wall's end now leave a 2 cm sliver, and in 7 flats the WC itself is moved 18 cm —
  into the washer (5) or the basin (2).
  *Fixed:* `reviewedScene` hands `settleFitted` the pieces the check changed, and only what was built
  for those (or for a piece now gone) is settled again; the check's own tidy-up (`reanchorDecor`,
  `settleToWalls`, `clearOfDecor`) touches only what the check changed. A check with no fixes now
  changes 0 of 360 fixture flats (was 122), one that takes out a lamp or a print changes nothing
  else, and `aiCheck.test.ts` holds it on a bathroom with a WC box built to the wall's end (V4).
- [x] **W2 (high) — A basin lifted for a vanity that is never built.** The matcher lifts a
  countertop basin to washing height (`matcher.ts:642`) before the bathroom pass tries the vanity;
  when the pass finds no stretch for one (`bathroom.ts:79-97`: the basin beside a door or window,
  a WC straddling the stretch, a stretch narrower than the basin plus 5 cm) the basin stays in the
  air: **106 of 692 bathroom basins hang at about 70 cm with nothing under them**.
  *Fixed:* of the 39 in 360 flats (one more once the vanity stopped at the shower's tray, O2), 21
  stood under a window (a vanity is now built under a sill at or over the basin's rim), 10 were
  refused by a WC on the next wall whose 40 cm side room ended within 5 cm of the vanity's face (the
  side room is now met, not kept 5 cm off — and a WC is measured 20 cm out, where it stands once
  boxed, which four of the newly allowed vanities would have run into), and 8 had no room for a
  vanity 5 cm wider than the basin. Those still without a vanity take a basin that stands on the
  floor at that height, given by the matcher (`standingBasin`) — `basin_in_air` 38 → 0, no basin
  lost. A basin a vanity holds keeps it and its product, even one too tall for the lowest vanity
  (70 cm): `rule:basin_height` 61 → 62 in 360 flats, the one more being #393/modern/3 r2, a 30 cm
  granite basin that hung in the air for the window over it and now stands on the vanity built
  under that window's sill, its rim at a metre — like the 11 such basins on a vanity before. What a
  basin too tall for any vanity should become (a lower vanity, another basin) is the owner's rule.
  *Fixed:* a lifted basin also takes its floor for the pieces the matcher fits after it, so a
  shower cabin is no longer stood under it and its vanity can be built — the last `basin_in_air`
  in 720 flats, 1 → 0.
- [x] **W3 (high) — A wall of wardrobe is built without looking in front of it.** `fitWardrobes`
  asks only for a free stretch as deep as the wardrobe (`bedroom.ts:41`). Of 402 built, 217 have
  something within 60 cm of their doors and 129 within 30 cm — the bed (97) or a nightstand (31).
  *Fixed:* it is built only where the floor before the whole of it is as clear as the layout keeps
  before a wardrobe (the archetype's 75 cm, `clearInFront`); elsewhere the shop's wardrobe stays —
  `wardrobe_blocked` 70 → 0 in 360 flats, `joinery_in_door_zone` 76 → 49 by the way, no wardrobe
  lost. The app's check then sees the shop's wardrobe beside the bed where it did not see the wall
  of wardrobe (`ruleViolations` reads furniture, not joinery): `rule:bed_side_tight` 146 → 162, every
  one of the 16 in a room that had a wall of wardrobe along the same wall before.
- [x] **W4 (medium) — The designer's decor is fitted without the engine's joinery.**
  `proposalDecor(laid, proposal, items, catalog)` is given the furniture only
  (`generateScene.ts:122`), after the passes have swapped the shop's wardrobe for a built one: slats,
  slabs, panels and cladding are fitted on the stretch the hall wardrobe, the wall of wardrobe or the
  vanity then covers — about 13 % of the decor's cost in that run was behind joinery.
  *Fixed:* the WC boxes are built before the designer's decor and `proposalDecor` is handed every
  piece of joinery and every box; decor covering its wall that would stand behind one is fitted
  again beside it (`clearOfBuilt`, the joinery's stretch an opening), or left out where nothing
  beside is clear — and so is a decor piece the check moves (`decor_to_wall`). Fed an intent of each
  covering family on three walls of every room of 60 fixture flats: 79 slat, slab and cladding pieces
  and 43 niches behind joinery → 0; 16 of 1,012 found no clear stretch beside it. Beside, not above:
  joinery is kept off as a fixture hung at the decor's height is (`fixturesOnWall` — a slab goes
  beside the bathroom mirror, floor to ceiling), so the wall over a low box is not covered; fitting
  decor over joinery instead would change the height the designer asked for — the owner's choice.
  *Open:* the re-fit opens the joinery's stretch for every intent of the room, so a second intent on
  that wall that cleared the joinery (hung above it) is fitted beside it too.
- [ ] **W5 (medium) — Decor behind the bed is dropped in most bedrooms.** A bed 1.2 m tall or more
  takes none (`aiProposal.ts:91-94`, the rulebook's B-6), and two thirds of the beds placed are
  that tall (322 of 485): of the intents anchored on the bed 57 % are dropped for it and 14 % for
  want of a bed. The designer is not told the rule.
- [x] **W6 (medium) — The hall wardrobe always has a boiler section** (168 of 168 built), with
  `hall.ts:60` reading the hall's width only: 105 flats had no boiler point, in 63 the boiler was
  elsewhere (the balcony 36, the hall outside the wardrobe 19, another section 8), and in 27 it also
  had a cabinet of its own (1,400–1,900 ₾) — paid for twice.
  *Fixed:* `fitHall` is handed the flat's technical points and builds the section only where the
  boiler hangs in that hall at the wardrobe with no cabinet of its own, at the end it hangs at; the
  wardrobe's stretch and length are as they were, the coats taking the section's room. On the test
  plans every hall boiler has a cabinet of its own: boiler sections 164 → 0 of 164 hall wardrobes
  in 360 flats.
- [x] **W7 (medium) — Tall joinery and the openings round the corner.** A wall of wardrobe stands
  in front of 6–23 cm of a window on the next wall (15 in 360 flats) and in the sweep of a door's
  leaf by 15 cm or more (30). `cornerClearance` allows 25 cm of an opening
  (`decor/joinery.ts:137-140`).
  *Fixed:* `cornerClearance` keeps a door's whole way clear (any of its width within the joinery's
  depth) and a window but for the 5 cm a piece may stand onto one (`ONTO_WINDOW_M`), whatever stands
  in the corner, for generation's joinery (`StretchOptions.strict`, passed by the bathroom, hall and
  bedroom passes); the studio's own builder (`freeExtent`, `houseItem`) and the kitchen's corner leg
  keep the older corner, so dragging and resizing joinery by hand is as it was — in 360 flats
  joinery in front of a door round the corner 59 → 0, of a window 19 → 0, `joinery_in_door_zone`
  77 → 0 (the detector takes joinery within a millimetre of a door's way as touching it, and
  still finds 2.5 cm in it). With W3, walls of wardrobe 213 → 54: 97 refused for the floor before
  their doors (W3), 62 for the corner; each room keeps the shop's wardrobe, nothing lost. That
  wardrobe is then seen by the app's checks where the wall of wardrobe was not: besides
  `rule:bed_side_tight` (W3), `rule:door_swing_blocked` 18 → 19 (#375/industrial/2 r4, the layout's
  wardrobe in the door's swing) and `hung_into_floor` 39 → 40 (#384/vintage/2 r2, the pendant into
  the wardrobe) — the layout's own placements, not this pass's.
- [x] **W8 (medium) — Joinery does not read the radiators**: a radiator's body inside the hall
  wardrobe (9), a vanity (15) or a vanity with its column (11) in 360 flats — `freeStretch` is given
  furniture and decor, never `plan.technical`.
  *Fixed:* `freeStretch` takes the flat's radiator bodies (`StretchOptions.radiators`) and stops at
  one on its wall or round the corner, unless it hangs over the joinery's top; `generateScene` hands
  them to the bathroom, hall and bedroom passes. In 360 flats a radiator's body in joinery 30 → 0;
  7 halls keep their coat rack and shoe cabinet instead of the wardrobe and 3 washers stand without
  a column, nothing lost. The studio's builder (`housing.ts`) is not given them yet.
- [ ] **W9 (low)** — A WC under a window gets no box (48 of 336: the box is refused at the
  opening); 76 boxes are more than 5 cm off their WC's middle. A washer the layout stood free in a
  hall gets no column (9: no wall within 15 cm). Mouldings are not cut at openings (42 across a
  door or a window in 240 flats). A light cove is dropped in any room with more than four corners
  (30 % of bedrooms, 53 % of living rooms and halls); a niche is built on 25–48 % of the walls
  asked and a panel on 37–74 % (each needs 1.2 m clear) — the designer cannot know which.
  *Partly:* a WC at a toilet's high window gets its box under the sill (`wcBoxStretch`: a window
  whose sill is over the box's top is no obstacle where the WC stands at one, or partly under one —
  there the box between the openings had stopped short of the WC, 8 of 360 flats), only where the
  WC stood out in front of it stands clear (no door's way, no shower's tray, no piece, no rule check
  it kept broken — `wcStandsClear`), by generation and by the studio's set-down and card alike
  (`wcBoxToBuild`): WCs with no box 100 → 14 of 672 in 720 flats, every count of the audit as it
  was. Not fixed: *the WC box off its WC's middle* (169 of 572 boxes more than
  5 cm off in 720 flats; 229 of 658 with the new boxes under windows, small toilets' sliver joins)
  — the box is off-centre where it runs on to a stretch's end rather than leave a sliver; centring
  it means running it as far past the WC on the other side, where joinery may stand (a vanity
  comes up to the WC's 41 cm side room), and `wcBoxes` is handed no joinery
  (`generateScene.ts:126` calls `wcBoxes(laid.rooms, items, catalog)`): it needs `generateScene` to
  hand it the joinery built so far, outside this lane. *Mouldings across openings:* not reproduced
  in the fit — a moulding on every wall of every room of 60 flats (1,988 pieces) has no frame or
  rail inside a door or a window (`fitMoulding` stops each rail at an opening and puts frames only
  under a window's sill and over an opening's head); what does cross a door is the piece's span,
  which `resolveDecor` sets to the whole wall, so readers of the span (`wallBlocks` reads it as flat
  decor before a radiator; `overlaps`) see it across the door — cutting it needs a choice: which
  stretch a moulding (one piece a wall, four a room) keeps when a door splits its wall. *The cove
  in a room of more than four corners:* its panel is a rectangle in `fitLight` and drawn as one in
  `lib/design3d/decor.ts` (`buildCove`) and read as one by `underCeilingDecor` (`aiProposal.ts`):
  following the outline needs the panel as an outline in those, outside this lane. *A hall washer
  stood free:* no bug under the code's rule — of 15 in 360 flats, 12 stand past the end of the wall
  behind them (no wall within `wallOf`'s or `backWall`'s reach) and 3 have 45 cm of free wall
  between a coat rack and the corner; a column for them needs the machine moved to another wall.
- [x] **W11 (high) — A generated flat that cannot be saved** *(found after the audit)*: where the
  washer's column stands at the wall's end beside a vanity, the gap between them became a `doors`
  section of whatever width was left — 5–10 cm in 4 of 360 flats — and the save route refuses a
  section under 10 cm, so the whole design could not be saved. *Fixed:* `cabinetPiece` folds a
  section narrower than `MIN_SECTION_MM` into the one beside it (`withoutSlivers`), and the gap is
  always the vanity's, so the column stays round the machine moved there. The whole-flat check
  counts what the save route would refuse (`unsaveable`), and `generationInvariants.test.ts` runs
  every generated flat through the save schema.
- [x] **W10 — D3 in numbers**: the studio's builder makes the washer's column 0.9 m lower than
  generation's wherever a dryer is stacked (41 of 63 compared), on another wall in 16, and the
  bath's box smaller in Vintage (no surround); its boxes have no tiles (generation's: plasterboard
  and tiles); taps, the bath's mixer and the dryer are added by generation only.
  *Fixed:* one set of builders (`decor/housing.ts`: `columnSection`, `columnStart`, `vanityTop`,
  `vanitySpan`, `bathBoxFor`; `decor/wcBox.ts`: `wcBoxFor`) builds for generation and for the studio
  — a piece set down or the card's button gets generation's carcass, read as generation reads the
  stretch (Vintage's surround, the column with its dryer, a WC box stopped at what stands beside it,
  a box in the flat's plasterboard and tiles) — and a box that stands where the builder builds it
  for its piece as it stands is left as it is (`builtAsItStands`): the studio's `settleFitted` with
  no changed piece now changes 0 of 360 fixture flats (was 83 by today's draw: 69 WC boxes, 16 bath
  boxes, a WC), 3 of 1,440 (a bath box run on to a radiator, which the studio does not read — W8).
  A WC dropped back against its wall in its box is stood out in front of it again where there is
  room, tested as generation's `clearOfDecor` tests it (111 of 112 boxed WCs of the first draw — the
  one left is a WC generation left in its box, #381's r8; `main` stood out 88), the
  studio's set-down builds no box under a high window where generation refuses one (it built 14,
  6 into a door's way), and a moved WC's box follows it under a high window as its builder builds
  it there (`wcBoxStretch`). Generation's bath box also stops at the joinery beside it now (it ran
  2.8 cm into a washer's column in 2 of 360 flats). `housing.test.ts` holds these on hand-built
  rooms (V4).

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
- [x] **F2 (high) — Every Modern balcony and closed kitchen is floored in laminate** (150 of 150
  balconies). Modern's tile look has no product in the catalogue — six of the seed products the
  looks name are gone — and the fallback is the style's general floor (`surfaces.ts:165`,
  `styles.ts:66`).
  *Fixed:* a floor the app tiles (`hasTiledFloor`: wet rooms, balconies, closed kitchens) falls back
  to the best floor tile, never the style's general floor (`styleFinishProduct`): Modern balconies
  are tiled in 150 of 150 flats (laminate 0, was 150), closed kitchens 6 of 6; an open kitchen still
  wears the flat's floor.
- [x] **F3 (high) — The wet flag keeps a style's own tile out of the rooms the style names it
  for.** The generated draw takes only finishes whose wet flag equals the room's
  (`surfaces.ts:207`); terrazzo, checkerboard and terracotta are flagged wet, so a Scandinavian or
  Vintage balcony or closed kitchen draws from the only two dry tiles, dark slate or grey
  microcement: the style's own look 0 times in 300.
  *Fixed:* "wet" means a finish may go in a wet room (`mayLay`): a wet room takes only wet
  finishes — the style's own look included (Industrial's dry slate is no longer laid in a bathroom
  without a draw) — and any other room any finish of the category it draws from. The style's own
  look on a balcony: Scandinavian 34 of 150, Vintage 22 of 150 (was 0 and 0); in a closed kitchen
  3 of 6 and 2 of 6 (was 0).
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
  *Partly:* the skirting and the cornice are the style's moulding as a product where the
  catalogue has one (`styleTrim`), bought by the metre as the floors are: in 360 flats 24,622 m of
  skirting and 13,370 m of cornice drawn, none bought → all of it (2,030 ₾ of mouldings a flat;
  `trim_install` fits them, about 422 ₾ a flat, in a renovation only — in a design-only project
  the style's mouldings get no fitting, as its floors and walls get none). The
  six of the eight mouldings that are a style's own are laid; the other two (548, 553) only when
  chosen. *Left:* the 75 finish products never laid (not this lane's).
- [x] **F6 (medium) — Labour is priced from another table than the one that lays.**
  `TILED_FLOOR_ROOM_TYPES` (kitchen, balcony — `lib/calculator/constants.ts:79`) decides the tiling
  labour whatever the design lays: an open kitchen wears the flat's laminate, a Modern balcony too.
  Laminate bought with tiling labour in 438 of 720 flats, 8.5 m² a flat.
  *Fixed:* in a design's budget the floor's tiling and laying labour follow each room's
  whole-floor products (`tiledShares` → `EstimateOptions.tiledShare`, an optional figure the
  calculator never passes); the calculation's own sheet passes `floorLabourByRoomType` and is
  priced as before, to the tetri. 720 flats (white frame, after F2/F3): tiling labour off the
  tiles laid outside the bathrooms in 600 flats, 9.9 m² of laminate a flat under tiling labour
  (studios' kitchen halves counted) → 0. A calculation whose kitchen was picked in laminate still
  charges tiling on its own sheet (budget.md, Known gaps).
- [x] **F7 (medium) — `keepChosen` keeps the first product of a floor two products share**
  (`generateScene.ts:188`): a floor the calculation split 60/40 comes back with 40 % of it bare, on
  every plan edit and every generation.
  *Fixed:* `keepChosen` keeps every chosen base finish of a surface: on the 30 plans × 4 styles with
  every floor split 60/40, a generation and a plan edit keep 100 % of the floor (was 60 %; 0 of
  1,480 rooms with part of it bare, was 1,480).
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
- [x] **RS4 (medium) — An opening that straddles the line is given to one half only**
  (`studio.ts:222`): the other half sees plain wall — 20 pieces stood over a window their half does
  not know of.
  *Fixed:* `partRoom` gives the other half the stretch of the opening on its own wall
  (`Opening.reachesIn`): in the way of what stands or hangs there, dressed and counted by the half
  that has the opening — the 20 (a fridge in #393, a bookcase in #385) are gone at the layout stage.
  A stretch of 5 cm or less is none (`ONTO_WINDOW_M`, the 5 cm `blocksWindow` allows a piece onto
  a window): #392's kitchen half was told of 2 cm of window on a wall.
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
  *Partly:* for every spot of the sofa the engine dry-runs the coffee table and the TV unit, and
  where any spot lands the unit with its whole back on a wall only those spots are drawn from, the
  2.5–3.5 m measured to that wall (`layoutArea`, `bestAlongWalls`, `standingWall`) — the unit placed
  as before, on the wall straight ahead only (RL4 is the owner's), its own ray still cast at the
  whole outline. **Left:** a room with no such spot keeps the old scoring on purpose — its sofa is
  still scored against an open line, and the unit stands on it or free on the floor (the 15 rooms
  O7 lists). And a spot is good at any distance the unit's rule allows: the check
  `sofa_tv_distance` now fires in the living rooms of #357, #365 and #397 and in #399's studio
  (10 → 21 on the first draw), none of which has a spot whose unit is on a wall 2.5–3.5 m off —
  their sofas were "2.96 m from the screen" when the screen stood in the opening, and are about
  3.7 m (#357, #365), 4.8 m (#397) and 4.2 m (#399) from it on the only wall it can stand on.
  Whether a wall out of range is better than the open line in range is the owner's rule.
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
  *Partly:* a spot earns the bonus by the wall its unit would really stand on, so a corner sofa
  too near for its unit no longer wins where another spot has a wall (RL1); the distance is still
  from the sofa's middle, as the check measures it, and #408 and #405 r2 keep their unit mid-floor
  (64 of 608 runs).
- [x] **RL7 (low) — A unit across the end of a wall's edge gets no TV** (`placeAbove`, `:1387`):
  where one wall is two edges in line, the TV is refused — every "unit and no TV" case.
  *Fixed:* the wall behind a piece is its edge and the edges that run on from it in line
  (`wallRun`): the TV hangs across the joint, clear of the windows of both. The cases on these
  plans (#360, #375 r2: the next edge bends away) went with RL1 — a unit across its wall's end is
  not on a wall, and the sofa takes a spot where it is.

**Bedrooms** — 47 bedrooms, 1,504 runs: no bed slot 160, a slot with no product 51, a double bed
with fewer than two nightstands 135.

- [ ] **RB1 (high) — No bed slot: five rooms each miss by centimetres, with no second try**
  (`autoLayout.ts:627`); door zones refuse most spots. As a second try only, of the 160: a single
  bed with its side on a wall 160; a double side-on 96; a single head-on 128; a double under a
  window 64; a 1.2 m double 64; a 1.4 m double 32; a door zone 0.6 m deep 64 (0.7 m: none — it
  misses by 1–2 cm).
- [x] **RB2 (high) — A slot with no product: the wardrobe's slot refuses the bed.** The engine lays
  the wardrobe 5 cm off the 1.6 m bed slot, and a slot not matched yet blocks at its archetype's
  size (`matcher.ts:383`): any bed over 1.74 m is refused — Modern's start at 1.81 m, Industrial's
  at 1.77 m. The room ends with two nightstands, a wall of wardrobe and no bed (41 runs). Any style
  when none of the style's own fits: +51 beds, nothing lost. *Fixed:* the bed's slot then takes the
  nearest other style's double that fits (M2). The wardrobe is still laid 5 cm off the bed's slot:
  the bed such a room now has, or the wardrobe it now has beside its bed, leaves a side of the bed
  under 60 cm (`bed_side_tight` on 7 more beds in 120 flats, each in a room that had no bed or no
  wardrobe).
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
  *Partly:* a piece that fits its wall stands on it (the 25 cm were no rule's): #388's bedroom has
  its bed, and halls, short kitchen walls and #399's studio gain by it. The corner spots are as
  they were: judging the engine's spots as the matcher's are (`footprintInRoom`) was measured and
  not done — on the first draw of the 120 flats the newly allowed corners gain four showers and two
  studio runs and cost #381 r8 its basin and mirror (the basin takes the corner by its pipe, the WC
  then has no way past), #407's bathroom its mirror, five nightstands and three wardrobes. It
  needs the rooms' ladders first (who gives way when a fixture's best spot shuts another out). The
  third is fixed: a slot that got no product is in nothing's way, and nothing is measured off it or
  hung clear of it.

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
  *Partly:* the generation's corner pass keeps its legs off the radiators' strips — the layout's own
  (`radiatorKeepouts`, by position), the ones `generateScene` read off the plan and hands to both
  (read again from the rooms under their ceilings a strip came out a section shorter): 12 of 102
  legs stood on one (#408), now none, and none is lost. The floor in front of the fridge is as it
  was; the studio's own corner keeps off the same strips now (X7).

### M. Partitions, doors and windows, the calculator's picks

- [x] **Q1 (high) — A calculator pick takes its slot at the product's size with no fit test**
  (`fromCalculator.ts:104-116`). Of 1,424 picks replacing a piece, 658 (46 %) end out of the room,
  in another piece or on a door's floor — the style's own piece in the same slots: 3 %. A pick with
  no slot is given a spot found for the archetype's box (`placeAdditional` is called without the
  product's size): 45 % do not fit, and 12 % vanish without a word (a shower: 40 of 40).
  *Fixed:* a pick takes its slot through the matcher's own test (`placeFitting`, exported): stood
  where the real product belongs, inside the room, clear of the pieces, the windows, a door's way
  and the keep-clear floor; what was placed off the piece is measured again off it; where the slot
  cannot take it, and for a pick with no slot, a free spot is found with the product's real size
  (`placeAdditional` with it). Slot and spot are tried keeping a door's way and the keep-clear floor
  clear first, then by the room and the pieces alone (the matcher's careful pass first). Never
  another product. On the same 120 flats (fixtures): picks replacing a piece out of the room, in
  another piece or on a door's floor 653 of 1,451 → 184 (45 % → 13 %; >20 cm 308 → 104; on a door's
  floor 64 → 46); picks with no slot 372 of 845 placed → 101 of 894 (44 % → 11 %), dropped 126 → 77
  (showers 40 → 5). Fits nowhere, so placed as before: 99 of 1,451 slot picks (into their slot at
  their size) and 174 of 971 picks with no slot (97 at a spot found for the kind's typical size, 77
  dropped) — counted before the careful-first order, which moves picks between slot and spot only.
  Left open: a pick that moves to a free spot leaves the rug laid under it, the TV over it and the
  joinery built for the piece it replaced at its old slot, and picks applied in the studio
  (`applyPendingPicks`) keep no radiator strip, column or partition floor clear
  ([project-flow.md](../project-flow.md#18-known-gaps)).
- [x] **Q2 (medium) — Three more things a pick does not do.** A picked kitchen is not made a
  kitchen piece (no `asPlacedKitchen`: a 12,000 ₾ shop's unit stays "made to measure" at the slot's
  size); the TV is not re-seated when its unit is picked (its bottom below the unit's top in 265 of
  408); the quantity is dropped (`:45`: four chairs picked, one placed).
  *Fixed:* a picked kitchen goes through `asPlacedKitchen` — a shop's unit is a unit at its own size,
  its back on the run's wall, a maker's material makes the run in it: of 420 shop units picked for a
  run (q2's draw), made to measure 420 → 234, those that fit nowhere. The unit is tested at its own size like any floor piece (the matcher
  leaves a run out of `placeFitting` because the layout sizes one made to measure; `fitPick` tests a
  shop's unit as the fridge is tested), and the wall cabinets over the run it took come down, as the
  matcher hangs none over a shop's unit (`cabinetsOver`). Every shop unit picked for every run of the
  fixtures (Modern, 2 seeds, 2,800 picks): out of the room 0, standing through wall cabinets 0, more
  than 5 cm into a floor piece 0 (taking it at its own size with no test had made them 1,580, 1,856
  and 1,614); 753 take the run, 467 a free spot elsewhere, and 1,580 fit nowhere — 1,473 of them
  wider than their run — and stay in the run at the run's size, made to measure, as before. What hangs over a
  picked piece (`placement.above`) is hung again (`rehung`): a TV inside a picked unit 269 of 432 →
  50: 46 where the unit fitted only at a free spot elsewhere and the TV stayed on its wall (with the
  careful pass first a few more units take a spot that keeps a door clear: 43 in all before it), 4
  over the unit, 3 of them with the 148 cm unit. A pick sold by the piece is placed as often as its quantity: 117 chairs
  picked in 35 flats, 37 → 117 placed. Whole-flat fixtures are stood in their slots by the same
  test.
- [x] **Q3 (high) — A screen kept from an earlier generation loses its free floor.** The loop skips
  a screen that already stands before recording its keep-clear floor (`autoPartitions.ts:203`):
  generating #386 again stands furniture through the screen in 30 of 36 flats. The old screen also
  stays where today's rules would add none.
  *Fixed:* the floor behind every screen that stands is recorded first, read off the wall as it is
  (`standingScreens`, `floorBehind`) — also behind one today's rules would not build, which still
  stays: #386 has a piece through its screen in 0 of 36 flats (27, with one on the floor behind it
  in 31); #385's layout stood clear of its screen already. With its lobby free #386's studio (29 m², no run) has its fridge further
  along the entrance wall, off the screen, and no room left for the dining table it had in 36 of
  36 while the fridge stood through the screen; which of the two gives way in a kitchen half that
  small is the kitchen's rule to write (RK1–RK4).
- [ ] **Q4 (medium) — No partition is added on any of the 30 plans** (the front door opens into a
  hall, or the studio is under 30 m², or the bedroom under 12 m²), so the stage is exercised only by
  its unit tests. On plans altered to qualify, a screen's joined end lands in a window or an archway
  in 10 of 58, and the matcher stands pieces in the lobby (53 of 348 flats).
- [x] **Q5 (medium) — Doors and windows never follow a change of style** (`openings.ts:584`: any
  product already on an opening is kept — a style's own choice is not told from a person's, as it is
  for finishes): of 1,219 that should have changed, none did.
  *Fixed:* an opening keeps the id of the product the style laid on it (`Opening.styleProductId`,
  added to `openingSchema` so a save keeps it); while its product is that one a generation or a
  load in another style lays the new style's, and any other product (the studio's swap — which
  clears the mark —, the calculation's, a plan saved before) is kept. Of 1,219 halves that should
  change, 1,219 do (was 0); a door the person chose survives the other style in 100 of 100.
- [ ] **Q6 (medium) — 11 of the 52 door and window products can ever be laid**: the cheapest with
  the style's tag, with no seed and no budget (`:585`) — doors 4 of 42, entrance doors 3 of 5,
  windows 4 of 5, the same on every seed.
- [x] **Q7 (medium) — A product's size is never compared with its opening** (the model is stretched
  to the hole, so it is never seen): a 144 cm entrance door in holes of 30–113 cm. And every outside
  door gets an entrance door — four on one plan, 18,000 ₾.
  *Fixed:* the flat has one front door (`frontDoor`, from `isFrontDoor` — now the test
  `entranceSightBands` reads too): the hall's, else the first; every other outside door, a
  balcony's included, is bought as a door. Of the style's candidates the flat takes one door and
  one window through it, the one nearest all its holes' widths together (`flatOpeningProducts` —
  a door per hole's width had hung doors of two colours in one flat). 120 flats: entrance doors bought 0/1/2/4 a flat in
  44/60/12/4 → 44/76/0/0 (207,350 ₾ in all, was 271,250); products more than 20 cm off their hole —
  doors 141 → 83 of 352, windows 407 → 346 of 560, outside doors 46 → 39 of 100: what is left is
  what the style has (Scandinavian's one entrance door is 144 cm, its window 90 cm), Q6's. The
  budget names a door line the entrance door only when it holds the front door.
  *Left open* (Q7b below): a calculation's entrance-door pick still goes on every outside door.
- [x] **Q7b (medium) — A calculation's entrance-door pick goes on every outside door** (`dressBoard`,
  `boardPicks.ts:62`, with no style mark, so `withOpeningProducts` keeps it as somebody's choice): a
  flat made from a calculation with an entrance-door pick buys one for each outside door, a
  balcony's included, as the calculation's sheet prices it; a door with no product on an outside
  wall is estimated at the entrance door's price in both (`openingEstimate`). The fix changes the
  calculator's sheet too ([technical-and-fittings.md](technical-and-fittings.md#known-gaps)).
  *Fixed:* `dressBoard` puts an entrance door on the front door alone (`frontDoor`) and a door on
  every other, a balcony's outside door included, for the sheet and the design alike. The 30 plans as
  the calculator's boards (`calculationCost`, white frame, with no picks, a door, an entrance door,
  both and a window): the renovation's materials and labour do not depend on the picks in any of
  the 120 (against main they do change in 11 of the 30 boards, by the separator switches of T13:
  each room entered only through a separator gains a switch whose point, chasing and switch the
  sheet counts, 52–272 ₾ — see [calculator.md](../calculator.md)); the door lines
  change in the two plans with more than one outside door (#389: 4 entrance doors → 1, 2,610 ₾
  less with both picks; #392: 2 → 1). *Left:* a door with no product on an outside wall is still
  estimated at the entrance door's price (`openingEstimate`) — changing it changes the calculator's
  estimate.

### N. The generation job

Read, and replayed with the rows in memory (no AI call); each item was then put to a skeptic.

- [x] **J1 (high) — One save from anywhere ends a running job after the designer is paid.** The
  designer is called (`lib/api/designJob.ts:170`) and the revision compared only at the write
  (`:213`); the save route knows nothing of jobs. A second tab, or a nudge on the board, and the
  proposal is thrown away, the run counted, and the page lays out with the engine.
  *Fixed:* the save route refuses any save of a design whose last job is designing or checking and
  not dead (409 `DESIGN_GENERATING`, forced or not — `jobRunning`), the browser keeps the change
  under a *generating* banner of its own (`DesignGeneratingError`) to save once the job is over, and
  each step reads the revision again right before its paid call (`mayCall`) and gives up unpaid
  (`design:CHANGED` / `check:CHANGED`).
- [x] **J2 (high) — Every job uses one of the five AI runs for the life of the project** (`:116`
  counts the job rows): a designer that failed, a write refused, a function that died. After five,
  the page is refused and lays out with the engine without a word.
  *Fixed:* the cap counts only the runs that wrote the designer's flat (`wroteDesignersFlat`; the
  engine's flat records one run fewer), with a safety stop per design on the jobs that asked the
  designer at all within an hour, at the start route's own rate rule (8 — `AI_PAUSED`).
- [x] **J3 (high) — A design changed during the check: the check is paid and dropped**, and the row
  keeps the designer's flat not laid out (`:262`, `:288`); a later visit finds the style step again.
  *Fixed:* whatever ends a check — a change the save route cannot see (before the call: not paid;
  during it: its fixes not applied), a failure, a throw, fixes the write refuses — writes the
  designer's flat laid out, unchecked, the change kept (`finishFlat`, `isJobsFlat`) — a change
  landing between the check's read and its write too (read again, laid out over it); only a row
  holding another design is left alone, and the flat as written refused by the save's checks (a
  plan or the catalogue changed since the design stage wrote it) stays not laid out.
- [x] **J4 (high) — The person is never told the designer failed, was refused or was skipped.** Any
  answer that is not ok becomes the engine's flat (`lib/design/aiDesignClient.ts:35`), under an
  overlay that ends "The AI designer has finished". Nothing reads the generation record or the
  job's error.
  *Fixed:* the overlay ends on "the AI designer could not design this flat, so it was laid out
  automatically" and why — the runs used up and what to do, too many asked, the design changed, a failure
  (`aiFallback`, `startRefusal`; ka, en, ru) — and waits for a press.
- [x] **J5 (medium) — The browser's fallback flat is another draw, from a seed kept nowhere**
  (`store/designStore.ts:1397`; the record holds who, when and the count): two draws of one plan
  share 26 % of their pieces. A flat cannot be reproduced to be explained.
  *Fixed:* `generateScene` records the seed it was given (`GenerationRecord.seed`, kept by
  `generationRecordSchema`) — the browser's drawn one and the job's row's — and
  [overview.md](overview.md#generation-versions-and-undo) says how a flat is drawn again from it.
- [x] **J6 (medium) — What is kept cannot explain a flat.** `generation.reviewed` counts the fixes
  accepted, not applied (`generateScene.ts:156`: of 1,380 accepted, 865 changed a piece); a refused
  job's proposal is gone; ignored picks, dropped slots, the job's id and the cost are kept nowhere.
  *Fixed:* `generation.reviewed` counts the fixes that change the flat each on its own, and the job's
  row keeps the proposal (also when its write was refused) and the check with their calls' cost and
  the fixes applied, its error naming the step (`<step>:<code>`); ignored picks and dropped slots
  belong to the whole-flat record of step 3 below, and the seed to J5.
- [x] **J7 (medium) — A dead function keeps the overlay up to six more minutes**: a stage is taken
  for dead after 360 s (`lib/design/generationJob.ts:37`), a function lives 300 s, and the hint says
  two to three minutes.
  *Fixed:* a stage is dead after `FUNCTION_MAX_MS` + `REVIEW_START_MS` (320 s, tested against the
  routes' `maxDuration`), and the hint says usually two to three minutes, never more than 11.
- [x] **J8 (low)** — A failed job lays the flat out when the style step is next opened, with no
  press on that visit and no age limit (`generationJob.ts:81`; the documented fallback — the hinge
  was confirmed when the job was started). The start route settles a project's stale job before it
  checks whose project it is (`lib/api/designJob.ts:104`).
  *Fixed:* only the visit waiting on the job lays the flat out with the engine — a later one waits
  for the press — and the start checks the project is the caller's before it settles anything.

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
  *Partly:* `decor.test.ts`'s "rarely offers again" draws from 40 sofas of the flat's style (the
  matcher's pool), with 20 of another style that are never offered (A1).
- [ ] **V3 (high) — Defects stand inside the tests' own scenes and pass**: the washer and its
  column 55–64 cm inside the shower's tray (`bathroom.test.ts:170`); the TV unit on the studio's
  line on 30 of 30 seeds (`studioLayout.test.ts:89` looks at hung pieces only); a bed with one
  nightstand in `generateScene.test.ts`'s own flat.
  *Partly:* `studioLayout.test.ts` now looks at the TV unit — against a wall of the living half,
  never on the line or the separator, on 30 of 30 seeds (O7, RB6). `bathroom.test.ts` joins the
  vanity and the washer's column in its room with the shower taken out, and in the room as laid
  out holds that nothing is built or moved into the tray (O2).
- [ ] **V4 (medium) — Tests that cannot fail**: `housing.test.ts:306` (its flat has no joinery to
  settle — W1), `generationRandom.test.ts:167` and `:194` and `placementSettle.test.ts:668`
  (branches that never run — P1), and seven assertions that are always true.
  *Partly:* the check's settling has a test that can fail (`aiCheck.test.ts`, W1: a bathroom whose WC
  box the studio's builder would slide); so does the studio's own settling (`housing.test.ts`, "is
  left as generation built it": a bathroom whose WC box runs on to the wall's end, a built-in bath, a
  Vintage surround, a column with its dryer — it failed before W10), and on the real plans the
  studio's own `settleFitted` (no changed pieces given) changes 0 of 360 untouched flats. The other
  tests named here are not changed.
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
and budgets (`tests/helpers/generationAudit.ts`: a plan's draw *n* is seed *n* × 1000 + 7 mixed with
the plan's id — `runSeed(planId, n)`, so rooms that share an id in two plans do not share a stream —
with no budget, a generous one and a tight one in turn; a plan's four styles share its seed. Since
each room draws from its own streams and each plan from its own seed, these draw other flats than
the ones section 3 was measured on, with totals that agree within the draw's noise), each finished flat audited with the app's own geometry
(`footprintOf`, `quadsOverlap`, `inDoorway`, `showerArea`, `decorFootprint`, `pieceWall`,
`ruleViolations`). It counts what can be read off the finished flat; *where* a piece was lost — no
slot laid, or no product fitted — was measured by replaying `layoutPlan` and `matchProducts` with
the same seeded draws as `generateScene` (now its streams per room — `roomStreams(rngStreams(seed),
'layout')` for the layout, `'match'` for the matcher), and "what one change recovers" (L) with an instrumented
copy of `autoLayout.ts`, one switch per rule: scratch scripts, not kept. The AI designer's side (D)
and the technical placement run from the technical step (G) are not in the command either.
`--refresh-catalog` saves the database's catalogue as the fixture; every count then moves, so the
baseline is recorded again in the same commit.
