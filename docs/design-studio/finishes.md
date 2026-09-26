# Finishes: floors, walls, paint, zones and mouldings

What floors and walls wear in the studio (step 6, the finishes category): finish products and
their textures, the style's own finishes (products too), whole rooms, single walls, the paint
brush (metre-wide strips and square metres), floor zones, skirting boards and cornices — and
how each is priced: only where it shows.
Read this before touching `lib/design/surfaces.ts`, `paint.ts`, `zones.ts`, `trims.ts`,
`finishQuantity.ts`, `components/design/FinishPanel.tsx`, the `FinishesTray`, or the finish
actions of `store/designStore.ts`.

Related: [studio.md](studio.md) (the tray and the brush in the page) ·
[3d-engine.md](3d-engine.md) (wall geometry, spans, materials) ·
[plan-board.md](plan-board.md) (what the board draws of finishes) ·
[../budget.md](../budget.md) (finish lines) · [../3d-assets.md](../3d-assets.md)
(`textures:stock`, the trim range) · [../calculator.md](../calculator.md) (the calculator's
per-room floor and wall picks, carried into 3D).

## Key files

| File | Responsibility |
|---|---|
| `lib/design/surfaces.ts` | what a finish product is (`specs.surfaces`, `wet`, `textureScaleM`, maps), the style's look per wetness (`defaultFinish`, `isWetRoom`) and the product it is (`styleFinishProduct`, `styleFinish`, `isStyleFinish`, `withStyleFinishes`), `pricePerM2` |
| `lib/design/zones.ts` | finishes on part of a surface: one wall (`wallIndex`), floor zones (`halfZone`, `wallStripZone`, `zoneFromRect`, clipped to the room), `wallFinishFor`, `finishCoverage`, `isBaseFinish` |
| `lib/design/paint.ts` | the brush: floor cells, wall strips (`span`) and wall patches (`cells` as [column, row]) — `paintCell`, `paintSpan`, `paintPatch`, `patchAt`, `patchSpans`, `patchSpansOnWall`, `erasePatchFromStrip`, `patchesAreaM2` |
| `lib/design/trims.ts` | skirting and cornice specs (`trimOutline` profiles, `trimLengthM`, `STYLE_TRIMS`, `trimFromProduct`, `defaultTrim`) |
| `lib/design/finishQuantity.ts` | `finishQuantity` / `finishUnit` — what a finish covers, shared by the store and the save route; `visibleFinishes` — what of it shows, which is what the budget buys |
| `lib/design3d/wallGeometry.ts` | spans on a wall face (`buildWallGeometry`), `buildMouldingGeometry` |
| `components/studio/Trays.tsx` → `FinishesTray` | surfaces (floor · walls · skirting · cornice), scopes, swatches |
| `components/design/FinishPanel.tsx` | the picker shown under the inspector for a selected floor zone |
| `store/designStore.ts` | `setFinish`, `setWallFinish`, `paintSurface`, `clearPartialFinishes`, zone actions, `ensureFinishProducts`, `defaultFinishes` / `keepChosen`, `fitToPlan` (refits and re-measures) |
| `components/design/DesignFinishProducts.tsx` | in the design layout: keeps a generated design's floors and walls the style's products (`ensureFinishProducts`) |
| `scripts/stock-textures.ts`, `scripts/lib/trimProducts.ts` | the finish products and the moulding range |

## What the studio offers

| Surface | Scopes (smallest first) |
|---|---|
| floor | a square metre (a cell of the room's grid) · the whole room |
| walls | a square metre (3D only) · a metre-wide strip · one wall · the whole room |
| skirting, cornice | the whole room |

With no room in focus the tray applies to every room. Floor zones (half a room, a strip along
a wall, a drawn rectangle) are still in the data model, drawn, selectable (the inspector shows
`FinishPanel` for a selected zone) and priced — but nothing in the UI creates one at the moment:
no page offers the board's `zone` tool and the tray has no zone scope (see Known gaps).

## Finishes (`lib/design/surfaces.ts`, `components/design/FinishPanel.tsx`)

A finish is an ordinary product from `laminate`, `floor-tiles`, `wall-tiles` or `paint` that
carries a `textureUrl`; its `specs` say which surfaces it is for (`surfaces`), whether it is
made for wet rooms (`wet`), how many metres one tile covers (`textureScaleM`) and its normal
and roughness maps. `pnpm textures:stock` writes ~35 of them: the partner drop's own floors,
plasters and bricks, plus Poly Haven parquets, tiles, a plaster, a paint and slate, and
ambientCG tiles, a microcement floor and paints (all CC0), written straight to the database. Paint is sold by the litre, so `pricePerM2` divides by `coveragePerUnit`.

The style's look comes first: bathrooms and toilets take the style's `wetFloor` / `wetWall`
(tiles) rather than its parquet and plaster (`defaultFinish`). A finish with a product carries
its own maps and scale into `StyleMaterials.surface`, replacing the style's — a marble tile with
the oak floor's normal map underneath was the first bug here. Re-laying out the furniture keeps
chosen finishes; switching style resets them.

**The style's own floors and walls are partner products, and the budget buys them.** The
textures the styles lay are the textures of `textures:stock` products (modern's bathroom walls
are *wall-tile-textured-grey*, its bedroom floor *laminate-grey-10mm*, scandinavian's walls
*paint-marshall-eco-5l*…), so `styleFinishProduct` finds, for each room and surface, the
catalogue finish whose texture is the style's look (compared by path, whatever host or query
the URL carries); a catalogue without it gives the best-ranked finish of the same wetness
(`surfaceOptions` — never a laminate in a bathroom), one without any leaves the look alone,
unpriced. `styleFinish` lays that product over the whole surface as `origin: 'style'` — nobody
chose it — in the style's colour when the product has none of its own (what shows until the
texture loads). The flat was generated in the style's look with nothing behind it, so a person
had to paint every wall and tile every bathroom again before any of it reached the summary.
Where the style's products are laid:
- `generate` and `setStyle` (they have the catalogue): every room's floor and walls, through
  `defaultFinishes(plan, styleId, catalog)`. `keepChosen` keeps what somebody chose (`studio`,
  `calculator`) and replaces the style's own with the fresh defaults — a new style, a retyped
  room. A plan edit (`reconcile`) has no catalogue: it keeps the style's product the room had.
- **"The style's own"** in the tray (`setFinish(ids, surface, null, catalog)`) lays the style's
  product, and that swatch — not the product's own — is the active one while a room wears it
  (`isStyleFinish` in the studio page and `FinishPanel`).
- `DesignFinishProducts` (in the design layout, on every step of a generated design) runs
  `ensureFinishProducts` → `withStyleFinishes` whenever the plan, the style or the finishes
  change: a design generated before the style's finishes were products, a room drawn or split
  since, a room retyped (a bedroom made a bathroom is tiled), the empty start, a version brought
  back. What somebody chose is never touched; it is not a step of the history; a design saved
  before gets its products the next time any of its steps is opened.
- Both modes buy them: a renovation whatever the home state, a design-only project as much —
  the design shows the flat in partner products, and those are what it buys. A floor or wall
  the person means to keep is ticked off on the summary (or, in a renovation, ticked as already
  there on the technical step) ([../budget.md](../budget.md)).
- The 2D sheet still leaves the style's own as the room's paper (`drawBaseFinishes` skips
  `isStyleFinish`), so a generated flat is not tinted room by room; ceilings stay the style's
  colour (the ceiling is the engine's phase 12, not a product).

**No wall wears the style's `featureWall` by
itself** (removed 26 September 2026): it drew industrial's brick on the longest clear wall of
every dry room with no product behind it — unpriced, not on the 2D board, and impossible to
erase, since "the style's default" fell back to it — and people took it for paint gone astray.
A wall wears what was chosen for it, or the style's `wall` / `wetWall`; the accent stays on the
style cards (`wallMaterialFor` in `buildScene`, `tests/unit/design3d/wallSide.test.ts`).

In the finishes category, clicking a floor or a wall in the 3D view selects that surface
(`onSelectSurface`): the tray opens on that surface, on the one-wall scope for a wall and the
square-metre scope for a floor, and a choice there applies to that room only. In every other
category a click on a floor or a wall is just the room.

## Walls and floor zones

A painted strip (`span`) and a painted square metre (`cells`) lie *on top of* a wall's
finish and are not it — `wallFinishFor` skips both, and forgetting the second put the patch's
material on the whole wall the first time the 1 m² brush touched it.

A finish is still `SurfaceFinish`, with `wallIndex` (one wall) or `zone` (a floor
patch, a polygon clipped to the room by Sutherland–Hodgman — half a room, a strip along a
wall, or a rectangle drawn in 2D with the zone tool). `wallFinishFor` resolves a wall to
its own finish or the room's base; `finishCoverage` is the "m² per material" list.
`findFinish` in the builder only ever returns the *base* finish.

**What is bought is what shows** (`visibleFinishes`, run by `priceScene` before anything is
priced). Each finish's product keeps what the finish *covers* (`finishQuantity` — the save route
stores that), and the budget counts only the part nothing lies on: the room's walls less every
wall with a finish of its own and every strip and square metre on a bare wall; a wall's own
finish less the strips and squares on it; a strip less the squares painted on it (a square lies
on the strip that holds the middle of its column); on the floor, the room's floor less the zones
and painted tiles, and a zone less the tiles over it (a tile's square clips the zone exactly).
Tile the lower metre of a painted wall and the paint under the tiles is not bought; repaint a
strip and only the colour on top is. A finish wholly covered — every wall papered on its own,
a floor painted edge to edge — leaves the budget (less than 0.1 m² showing counts as none). A
layer with no product (an old zone still waiting for its tile) hides nothing, and of two
finishes claiming a whole surface only the first, the one drawn, is bought. The overlaps are
worked out from the geometry; the areas themselves are the finishes' own quantities.

## Painting a piece at a time (`lib/design/paint.ts`)

The finishes tray has three scopes that behave like a game's brush rather than a form:
**1 m²** paints one square of a room's floor, **1 m** one metre-wide strip of a wall floor
to ceiling, and **1 m²** on a wall one square metre of it — its column along the wall and
its row up it (`patchAt`, `patchSpans`), the last column and the top row running on to the
corner and the ceiling. A swatch picked in those scopes goes into the *brush* (page state,
`brush`) and paints nothing until a floor or a wall is clicked; dragging paints everything
the pointer crosses; the style default is the eraser. All of them live in `scene.finishes`
on top of the room's base finish — all the tiles of one product in one room are **one**
finish with a list of grid `cells`, all the patches of one product on one wall **one**
finish with a list of cells read as [column, row], neighbouring strips of one product on
one wall **one** finish with one `span` — so undo, versions, autosave and the budget get
them for free, and a painted flat is a handful of rows rather than hundreds. A wall patch
needs the height of the click, so it is painted in 3D only: on the 2D board the square-metre
chip stands disabled with the reason in its tooltip (`FinishesTray.flat`), the brush falls
back to the metre-wide strip while the board is the view (`finishScope` is derived from the
stored scope and the view in the studio page), and the board draws a patch painted in 3D as
a band along the wall. `WallFaceSpan` carries
an optional `bottom`/`top` for it, and `buildWallGeometry` cuts the wall's face horizontally
as well as vertically. The grid is the room's own (counted from its bounding
box, each tile clipped to the outline, so the last column is a part tile), and a strip
shorter than 25 cm at the end of a wall joins the strip before it. `fitToPlan` in the store
shortens a strip to a wall that got shorter (dropping it when less than 5 cm is left), and drops
wall patches out of range, finishes on walls that no longer exist and tiles a room no longer
reaches — and measures every finish left again on its room (`finishQuantity`, the save route's
rule): a room made bigger used to keep its old floor area in the budget until the page was
loaded again from the server.

**The layers of a wall lie like paint: base, this wall's own finish, strips, square metres.**
`buildWallGeometry` gives each spot the *last* span that covers it, and `buildScene` lists the
strips before the patches, so a square painted over a strip is what shows (it took the *first*
match once, the strips came first, and the 1 m² brush seemed not to apply anywhere a strip had
been painted; the data was there all along). The other direction is settled in the data: a
strip is floor to ceiling, so `paintSpan` takes every square in the stretch it paints off the
wall — and only in that stretch, not in the rest of a span of the same product it runs on into
— and the strip eraser clears them with it. The 1 m² eraser on a strip cannot leave a hole in
one, so the column leaves the strip and goes on wearing its product as squares, every row but
the erased one (`erasePatchFromStrip`), priced as what is left. The 2D board draws the same
order — whole wall, strips, squares — whatever order the finishes are stored in.

**The brush opens on the smallest piece.** The scope chips run smallest first — a square
metre, a metre-wide strip, one wall, the whole room; on a floor a square metre, then the
room — and the first chip is what the tray opens on and what a surface tab or a tap on a
floor switches to (a tap on a wall picks *that wall*). "The whole room", the one that
erases, comes last.

**"The whole room" is the whole room.** A swatch picked in the room scope (`setFinish`) takes
everything off that surface in those rooms before it lays the new base: a wall's own finish,
the strips, the square metres; on a floor the painted tiles and the drawn zones (a zone that
was selected is let go of). It used to replace the base only, so a room painted white kept
its old stripes on top and nothing said why — the accents are one Ctrl+Z away, or painted
again over the new colour. The style's own in that scope is therefore the room's eraser — back
to the style's product, with nothing on it.
`finishQuantity` reads `cells` on a *wall* as square metres of that wall (`patchesAreaM2`);
it read them as floor tiles once, and a patch near the ceiling was priced at nothing.

**While the finishes category is open the pointer sees the room and nothing else**: the
viewer picks through `shellHitAt` (floors, walls, zones), so the sofa in front of the wall,
the socket on it and the door in it can be neither clicked nor dragged, and the 2D board
does the same through `roomsOnly`. Which side of a shared wall was clicked is answered by
`wallSideOf`: the room face is the room's own, the far face belongs to the room behind that
stretch of it (`wallFrame.behind`), so the wall that gets painted is always the one that was
looked at — the old code measured the cutaway from the mesh's origin and hid the wrong half,
which is why a click near a shared wall painted the neighbour's side in the neighbour's
colour. **The far face of a stretch with no room behind it is the outside of the flat, and
nobody's wall** (`wallSideAt`, `lib/design3d/wallSide.ts`, tested): a brush, a surface tap or a
hung mirror there does nothing. It used to fall back to the room's own wall, so painting the
outside painted the room inside it. The outside of the flat wears the neutral cut material and
cannot be finished (a façade would be a feature of its own).

## Skirting boards and cornices (`lib/design/trims.ts`)

A moulding is the one thing in the studio with no model file: it has no fixed length, so it
is *swept* — its cross-section (`trimOutline`: flat, rounded, stepped, ogee, cove) is run
along every wall by `buildMouldingGeometry`, mitred at the corners (each run gives way by
`tan(turn/2)` per metre it stands out) and broken at the doorways for a skirting board.
It travels in `scene.finishes` as `surface: 'skirting' | 'cornice'` with a `trim` spec, is
sold by the running metre (`trimLengthM`: the perimeter, less the doorways for a skirting
board), and `trim_install` is its labour. A room with no product wears the style's own
moulding for nothing (`STYLE_TRIMS`; modern and industrial have no cornice at all).
`scripts/lib/trimProducts.ts` is the seeded range — profile, height and depth in `specs`.

**A cornice runs along the top of *its wall*, not at the room's ceiling height.** A wall can be
given a height of its own in the inspector (`wall.heightM`; the 3D wall is built to it, the
room's `heightM` is only the default), and the cornice was built at `room.heightM` — raise a
wall and it stayed behind, a white line part of the way up. `buildRoomShell` works out every
side's top once (`tops`) and hands `buildTrim` this wall's and its two neighbours': the run
sits at its own wall's top, and it only meets the next wall's cornice on the mitre when the
two stand level — beside a wall at another height it is cut square and runs corner to corner
(`tests/unit/design3d/cornice.test.ts`). The painted square metres follow the same top
(`patchSpansOnWall`: the room's grid, its top row running on to the top of *that wall*, or cut
off by a wall that stops short), and so does the brush's glow.

## Tests

`tests/unit/design/paint.test.ts`, `zones.test.ts`, `trims.test.ts`, `pricing.test.ts`
(finishes; the style's bought in a renovation for every home state and in a design-only
project, a line ticked off not),
`visibleFinishes.test.ts` (what shows is what is bought, strips painted twice),
`styleFinishes.test.ts` (the style's product, the fallbacks, `withStyleFinishes`),
`planDrawing.test.ts` (the sheet leaves the style's own as paper),
`tests/unit/design3d/wallGeometry.test.ts` (the last span on top, the moulding mitre),
`cornice.test.ts`, `wallSide.test.ts` (the accent wall is gone; whose side a hit is),
`tests/unit/store/designStore.test.ts` (paint; the style's products on generation, "the style's
own", re-measuring after a resize, `ensureFinishProducts`),
`tests/integration/save-routes.test.ts` (a strip over the style's paint, bought once).

## Known gaps

- Surface finishes are per room: the studio's right panel offers every catalogue product with
  a `textureUrl` for the focused room's floor and walls (or all rooms at once), priced by what
  of it shows. `pnpm textures:stock` is what gives products textures; a product without one
  never appears there, and a catalogue without the style's own texture products gives the
  generated flat stand-ins of the same wetness (or leaves the look unpriced). Ceilings stay the
  style's colour.
- **The style's skirting boards and cornices are still only its look**: drawn in 3D, not
  products, not in the budget (`defaultTrim`, product null). The same treatment as the floors
  and walls would need a trim product per style profile.
- A design saved before the style's finishes were products has none in its stored budget (the
  project page, an order placed from the list) until one of its steps is opened again.
- `visibleFinishes` takes floor zones not to overlap one another; two that do are both bought
  where they overlap (nothing in the UI draws zones any more).
- **Floor zones cannot be created any more.** `PlanEditor` still has a `zone` tool and the store
  an `addFinishZone`, but no page lists the tool (`CATEGORY_TOOLS` in the studio, the plan and
  technical steps) and nothing calls `addFinishZone`; zones in older saves still show and price.
- `findFinish` in `buildScene.ts` returns the base finish because base finishes precede painted
  cells in the list, not because its filter excludes `cells` — keep that order or add the filter.
