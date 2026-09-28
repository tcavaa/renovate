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
| `lib/design/autoLayout.ts` | `layoutPlan` / `layoutRoom` (rule-based placement, collision-checked; `LayoutOptions.anchors` from technical points, `obstacles` for columns), `placeAdditional` (a free spot for one more piece), `FURNISHABLE_ROOM_TYPES` |
| `lib/design/matcher.ts` | `matchProducts` (client-side; drops products without `model3dUrl`, scores style tag + budget tier, checks the fit), `candidatesFor` (the swap list), `toSceneProduct`, `applySwap` |
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

## Layout fallbacks that keep rooms furnished (`autoLayout.ts`, `matcher.ts`)

- Storage against a wall, the three-seat sofa and the desk (`NARROWABLE`) retry at 80 % and
  65 % of their default width when
  the full width finds no wall — and the matcher then scores down products wider than the slot
  they were given, so a 2 m cabinet is not dropped into a 1.2 m gap beside a door.
- A centred relative item (TV unit, coffee table) is nudged sideways in growing steps before
  giving up; the spot dead ahead of the sofa is usually a door keepout.
- A `fill` ring of dining chairs skips a seat that hits a wall instead of ending the ring, and
  each seat tucks in towards the table when the room is tight (12 or 24 cm, up to 15 cm under
  its edge), tested against everything but the table. The matcher lets the products of such a
  chair and its table overlap too (below), and the studio lets a chair stand under a table for
  the same reason ([studio.md](studio.md#direct-manipulation-libdesignmanipulatets)).

## One product per kind per room

Within one room, every slot of a kind gets the same product (six matching dining chairs) —
unless that product does not fit one of the slots, which then gets the next that does
(`placeFitting`, below);
the next room gets the next-best product of the same style tier, so a flat with five
pendants hangs five different lamps. The swap panel lists every candidate for the slot,
matching style first, each with its photo.

## The product has to fit the slot (`matcher.ts` → `placeFitting`)

The layout engine sizes a slot from the archetype; the product that fills it has its own
size, often bigger. `matchProducts` now takes the rooms and, for every floor-standing slot,
checks the preferred product's real footprint at the slot — nudged inside the room when it
only just pokes out — against the polygon and the other pieces. A product that does not fit
gives way to the next-best that does; when nothing fits the slot stays empty. Before this a
3.2 m sofa in a 2.4 m room sat through the window.

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
it keeps the exact test.

## Tight passages (`lib/design/clearance.ts`)

`tightSpots` flags a piece a person could not get past: a big piece (≥ 0.8 m², ≥ 1.2 m
long) with less than 60 cm between its long side and a wall, two big pieces less than 35 cm
apart, or anything within 30 cm of a doorway's inside point. Small things (chairs, a
nightstand), the short ends of big ones, touching pieces and floating ones do not count —
the first version flagged half the flat. The gap to a wall is measured to the room's bounding
box, and a doorway's inside point is 45 cm into the room. Rooms a room separator divides are
judged as one floor (`openFloor`; `tightSpotsByItem` takes each floor once). The box is the
floor's, so a separator is no wall to be squeezed against, and two pieces facing each other
across the line are a passage like any other. The viewer draws an amber outline
around every flagged item and a generic warning floats above the tray. It is a warning, not a
rule: the layout is still saved as arranged.

## Tests

`tests/unit/design/matcher.test.ts` (same product per kind per room, rotation between rooms,
fit with rooms, not through the end of a partial wall, the model filter, a product flush in each
corner of a room, a chair tucked under its table — both get products, no table over more than
half the chair, a chair seated clear still in the table's way),
`tests/unit/design/autoLayout.test.ts` (`boxInPolygon` — the gap of a U, touching a wall — and
nothing of a layout standing through a wall, on project 219's corner),
`tests/unit/design/studio.test.ts` (`layoutRoom` for studio
parts), `tests/unit/design/manipulate.test.ts` (`placeAdditional` with real sizes; the engine's
chair tucked under its table and its bed flush in a corner at −π/2, both let stand by the studio),
`tests/unit/design/clearance.test.ts`, `tests/unit/design/shelfRooms.test.ts`. The sample plan
`public/samples/plan-2br.png` run through `layoutPlan` is the manual check for the layout as a
whole. `lib/design/matcher.ts` is in the coverage gate.

## Known gaps

- A model's real footprint (`footprintMasks`) is known only once the 3D view has loaded that
  file in this session; the 2D board still draws every piece as its box, and the layout
  engine, the matcher's fit check and the tight-passage warning all use the box.
