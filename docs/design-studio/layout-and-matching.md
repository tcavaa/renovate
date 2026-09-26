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
| `lib/design/catalog.ts` | `ARCHETYPES` (every placeable kind: real size, category, placement rule, labels in three languages), `ROOM_PROGRAMS` (which slots each room type gets), `SHELF_ROOMS` / `kindsForRoom` / `unroomedKinds` (the furniture shelf's rooms and kinds) |
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
  each seat tucks in towards the table when the room is tight.
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

## Tight passages (`lib/design/clearance.ts`)

`tightSpots` flags a piece a person could not get past: a big piece (≥ 0.8 m², ≥ 1.2 m
long) with less than 60 cm between its long side and a wall, two big pieces less than 35 cm
apart, or anything within 30 cm of a doorway's inside point. Small things (chairs, a
nightstand), the short ends of big ones, touching pieces and floating ones do not count —
the first version flagged half the flat. The gap to a wall is measured to the room's bounding
box, and a doorway's inside point is 45 cm into the room. The viewer draws an amber outline
around every flagged item and a generic warning floats above the tray. It is a warning, not a
rule: the layout is still saved as arranged.

## Tests

`tests/unit/design/matcher.test.ts` (same product per kind per room, rotation between rooms,
fit with rooms, the model filter), `tests/unit/design/studio.test.ts` (`layoutRoom` for studio
parts), `tests/unit/design/manipulate.test.ts` (`placeAdditional` with real sizes),
`tests/unit/design/clearance.test.ts`, `tests/unit/design/shelfRooms.test.ts`. The sample plan
`public/samples/plan-2br.png` run through `layoutPlan` is the manual check for the layout as a
whole. `lib/design/matcher.ts` is in the coverage gate.

## Known gaps

- A model's real footprint (`footprintMasks`) is known only once the 3D view has loaded that
  file in this session; the 2D board still draws every piece as its box, and the layout
  engine, the matcher's fit check and the tight-passage warning all use the box.
