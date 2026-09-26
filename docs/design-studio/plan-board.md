# The plan: walls, rooms and the 2D board

The plan's model (walls are lines, rooms are the faces they enclose), studio rooms split in
two, and the 2D drawing board both products use. Read this before touching
`lib/design/walls.ts`, `lib/design/drawing.ts`, `lib/design/studio.ts`, `components/plan/` or
the plan actions of `store/designStore.ts`.

Related: [overview.md](overview.md) · [plan-reading.md](plan-reading.md) (where uploaded rooms
come from) · [technical-and-fittings.md](technical-and-fittings.md) (doors and windows on the
board) · [finishes.md](finishes.md) (what the board draws of finishes) ·
[../calculator.md](../calculator.md) (the calculator's plan step uses this board with its own
store) · [../ui-design-system.md](../ui-design-system.md) (the full-window board steps).

## Key files

| File | Responsibility |
|---|---|
| `lib/design/walls.ts` | walls ⇄ rooms: `roomsFromWalls`, `wallsFromRooms`, `ensureWalls`, `rebuildRooms`, junction splitting, room clusters and moves, clash tests |
| `lib/design/drawing.ts` | snapping (junction → wall → axis → alignment → grid), hit tests, `snapRoomMove`, `snapRectangle`, `snapWallOffset` |
| `lib/design/studio.ts` | a studio room split into two parts (`effectiveSplit`, `studioParts`) |
| `lib/design/planGeometry.ts` | edges, inward normals, wall segments, areas — the geometry every consumer works against |
| `lib/design/types.ts` | `FloorPlan`, `Room`, `Wall`, `Column`, `Beam`, `Opening`, … |
| `components/plan/PlanEditor.tsx` | the canvas board: tools, gestures, pan/zoom; everything else is callbacks to the store |
| `components/plan/PlanWorkspace.tsx` | the board wired to a store (the studio's by default, or the calculator's), with toolbar, hint line and undo keys |
| `components/plan/PlanToolbar.tsx` | tool tiles, wall shape and thickness, kinds, layers (`PlanToolTiles`, `PlanViewControls` on the full-window steps) |
| `components/plan/ElementInspector.tsx`, `RoomsPanel.tsx` | edit the selected element; the rooms list and typed rooms |
| `components/plan/draw.ts` | plain canvas drawing routines (rooms, walls, openings, chains, finishes) — shared with the PDF export |
| `components/plan/palette.ts`, `icons.ts` | room tints, origin and system colours; one icon per technical system and electrical kind |
| `lib/design/planPdfExport.ts` | the plan as an A4 PDF |
| `lib/calculator/planSync.ts`, `hooks/useCalculatorPlan.ts` | keep the calculator's rooms in step with its board |

## Walls are lines; rooms are what they enclose (`lib/design/walls.ts`)

The plan's source of truth is `plan.walls`: centreline segments with a thickness (10 / 12 /
15 / 20 / 25 cm offered, any value stored), an optional height and material, and an
`origin` (`existing` / `user` / `generated`). `roomsFromWalls` splits the walls at every
junction (crossings, T-junctions, ends that stop a hair short — `NODE_TOL_M`), prunes dead
ends, traces the faces of the planar graph (at each junction take the first edge clockwise
from the one arrived along; faces with positive area are rooms) and offsets each face
inwards by half of each wall's thickness — so a room's `polygon` is still the inner floor
every downstream module already understands, and `room.wallIds` says which wall each edge
lies on. Rooms keep their identity across edits: a re-derived face takes over the previous
room whose centroid it contains (ids, names, types, heights, doors re-projected by world
position). `wallsFromRooms` goes the other way for plans that arrive as polygons (the
parser, Claude, the calculator, old saves): facing edges of neighbours merge into one wall
as thick as the gap between them, exterior edges get the default thickness outside, and
vertices are moved onto the crossings of the centrelines so the graph is watertight.
**A wall runs from junction to junction and no further** (`splitAtJunctions`). A plan built
from polygons is one wall per line of the flat, so the partition between four rooms came back
as a single wall: selecting it selected all of it and dragging it moved every room along it.
Every wall is cut where another meets it — in `wallsFromRooms`, in `rebuildRooms` after every
edit, and in `ensureWalls`, so a plan drawn before the rule existed is put right on load.

**Walls never fuse into each other.** Every collinear wall that touched used to be unioned,
so a room drawn against its neighbours dissolved into them — four walls became one
eleven-metre wall running under three rooms, and from then on there was no such thing as
*this room's* wall. `addWalls` now only drops the stretches a wall of the same thickness
already covers (drawing over one twice); everything else is added as drawn. `innerPolygon`
therefore merges a *run* of equally thick walls into one room edge — one side of a room is
routinely two walls end to end, its neighbour's and then its own, and treating that as two
edges gave the room a phantom vertex, an extra wall index and a finish that stopped halfway
along a flat wall.

**Rooms that share a wall are one body, and nothing is ever pulled apart** (`roomCluster`).
For a while a room could be dragged away from its neighbour — the wall between them was
*split*, the original staying and a copy leaving — and every version of that came back broken:
a room with a side missing, a stub left on the neighbour, and, pushed back, two walls six
centimetres apart on what had been one line, which the wall graph cuts into slivers and jogs.
Nobody needed it (a flat is moved as a flat), so it is gone: a drag takes the closure of the
grabbed rooms under "has a wall in common", and **Ctrl+Z is the way back** from a room pushed
up against the wrong neighbour. `wallsForMove(plan, roomIds)` is what travels, worked out once
when the drag begins: the cluster's walls, the partitions and stubs standing inside those
rooms, and any free wall hanging off them (a half-drawn room on the side of the flat goes with
the flat) unless it also touches a room that stays. `moveRooms` shifts those, the columns and
beams standing in the moved rooms, and hands the previous rooms to `rebuildRooms` already
shifted so identity survives; the store's `moveRooms` takes the furniture, fittings, technical
points and painted zones of the whole cluster along, to the millimetre like the walls.

**Pushed together means one wall between them.** Where a travelling wall lands on the line of
a wall that stayed, the stretch the two have in common is kept once — the wall that was there
stands for both, *whatever its thickness* (`uncoveredPieces(…, anyThickness)`; a wall being
*drawn* still only gives way to one of its own thickness) — and the traveller keeps what
sticks out past it. That shared wall is also what makes them one body from then on. What two
parallel walls may never do is stand half inside each other (`wallsClash`: off each other's
line, closer than their bodies plus `WALL_CLEARANCE_M`, overlapping along their length); the
board snaps so that it does not happen by accident and refuses the drop when it would happen
anyway — a room pushed into a gap a hand too narrow for it.

**Which walls are a room's is asked of the geometry, not of `wallIds`.** `room.wallIds` names
one wall per *edge*, and walls are cut at every junction — so a side that a neighbour covers
only half of is two walls, and only the first is named. `wallsBoundingRoom(walls, room)` sweeps
every wall and keeps the ones running parallel to an edge, half a thickness outside it,
overlapping it along its length — all of them, however the side was cut. The cluster, the move
and the store's `removeRoom` all ask it (deleting a room used to leave the unnamed half of a
side standing as a stub). `orphanWallSegments` has the mirror-image rule: a wall piece is
measured against a room side's *line*, because a side is routinely longer than the piece
behind it — measured to the piece, every such piece read as free-standing and the 3D view stood
a second wall inside the room's own.

`ensureWalls` is what `setPlan` and `openSaved` call. Every wall edit in the store —
`addWall`, `offsetWall` (sideways along `wallNormal`, connected walls follow),
`moveWallNode`, `resizeWall` (a typed length; the far end and whatever meets it follow),
`removeWall`, `updateWall` — ends in the store's `withWalls`: `rebuildRooms` (split the walls
at every junction, re-derive the rooms, set the bounds), then the store's `reconcile`, which
re-homes furniture whose room merged away, refits the finishes (`fitToPlan`) and re-projects
the electrical points.
`orphanWallSegments` are the pieces of wall that bound no room; the 3D view draws them as
free-standing walls. Tested in `tests/unit/design/walls.test.ts`; touching rooms from an
old calculator layout lose half a thickness on the shared wall, by design.

## A studio is one room in two parts (`lib/design/studio.ts`)

`studio` (სტუდიო) is a room type for an open plan — most often a kitchen and a living room.
It is one room (one outline, one set of walls and doors) with a straight dividing line across
it: `room.split = { axis, t, parts }`, the line at right angles to `axis` at the fraction `t`
of the room's extent, `parts[0]` the lower side. Stored as a fraction so it travels with the
room when it is moved or resized; `roomsFromWalls` keeps it. Giving a room the type sets the
default (`withStudioSplit` in the store: across the longer side, the kitchen ~35 %); a studio
without one reads `effectiveSplit` the same way. `studioParts` clips the outline into the two
parts and measures each one's floor and **its share of the room's walls** (the line is not a
wall). On the board the line is dashed and can be dragged (`divider-drag`, 5 cm grid, 1 cm
with Shift, neither part under 1.5 m² or a tenth of the room, whichever is smaller —
`MIN_PART_AREA_M2`; `onSplitRoom`); each half is drawn in its own type's
tint and labelled with its type and m²; a click on a half picks it out
(`designStore.selectedRoomPart`). The inspector's `StudioSplitFields` sets each part's type
and area, turns the line and swaps the parts. The estimate prices the parts
(`Room.parts`, filled by `calculatorRoomsFromPlan` / `planToCalculatorRooms`; `expandStudios`
in the engine, a default 35 / 65 split — `DEFAULT_FIRST_SHARE` — for a studio saved without
them): the kitchen
half's floor tiled, the living half's laid, points and radiators by each part's type, the
doors and the partitions by the room. The layout furnishes each part with its own type's
program (`layoutRoom`), the automatic technical points go on the walls of the part they serve,
and the furniture shelf opens a studio as the half picked out. Not done: the 3D view draws
no line on the floor, and the kitchen half's default floor is the room's (as any kitchen's).
`tests/unit/design/studio.test.ts`.

## The 2D board (`components/plan/PlanEditor.tsx`)

(On the full-screen steps the board runs under everything, its toolbar floating over it —
see "The board steps are the whole window" in [../ui-design-system.md](../ui-design-system.md).)

One canvas, one tool in hand: `select`, `pan`, `wall` — **one tile with two shapes, a line
and a square** (`room` is the square: a rectangle whose inside is exactly what was drawn,
four walls around it), `door` / `window` (dropped on the nearest room edge, the usual twin
logic), `column`, `beam`, `technical`, `electrical`, `zone`. The toolbar and the studio's
build tray both leave `room` out of the tile row and offer it as the wall tool's shape.
`lib/design/drawing.ts` does the snapping — a junction first, then the axis lock (applied
before the wall snap so a T-junction still lands on the axis), then a point on a wall, then
alignment with any junction's x or z, then the 5 cm grid (1 cm with Shift) — and reports the
guides the board draws (the file's own header comment still gives the older order). The select tool drags a wall sideways, its ends as
handles, a door along or onto another wall, columns and points freely, and furniture
footprints with `snapPlacement`; Delete removes the selection.

**Rooms may not lie on top of each other**, drawn (`roomUnderRect`) or dragged
(`polygonsOverlap`, which is an edge-crossing test because a room is not always convex, and
which pulls both outlines in by a hair so two sharing a wall do not count). The wall graph
traces a crossing as a face, so a room dropped on its neighbour came back as slivers with
walls through the middle of them and nothing could be pulled apart again; the preview turns
red and the drop is refused with its own message.

**Rooms are selected like folders on a desktop**: click one, shift-click to add or take out,
or drag a rubber band across empty sheet (panning is still space, the middle button, the hand
tool, and W/A/S/D or the arrows — matched on `event.code`, like the 3D view). The group then drags bodily through `moveRooms`, with a live plate saying how
far it has travelled — and every room joined to it comes too (the ghost shows all of them and
their walls; the *selection* stays what was clicked, so Delete does not take the flat with the
room). **A dragged room snaps wall to wall** (`snapRoomMove`): each axis looks for a wall of the
travellers and a parallel wall staying behind whose centrelines the move would bring close, and
closes the distance exactly. A wall that would run *alongside* wins over one that continues it
end to end, which wins over one merely in line across the sheet; the nearest within a kind; a
wall alongside is in reach for as long as the two bodies would overlap, however far the view is
zoomed in. Each snap draws the full-sheet line the two walls now share (and the neighbour's
wall, when it is one) — the "lines room to room" that say what it is squaring up with. A drop
that would still leave a wall half inside another turns the ghost red and is refused with the
same message as a room over a room; both boards show it (the calculator's had no banner, so a
refusal there looked like a drag that had not worked). Delete takes the whole
selection. **Every gesture that changes a size carries its ruler**: the wall being drawn,
the rectangle being pulled out, a wall dragged sideways (with its offset), a wall stretched
by an end, and the selected or hovered wall — and a wall's length is an input in the
inspector (`resizeWall`), not just a figure. `locked` keeps the structure
pickable but immovable. The editor owns only pan/zoom (wheel zooms about the pointer, Space
or the middle button pans; the view refits on resize until the person moves it) and the
gesture in progress — everything else is the store's, through callbacks. `PlanWorkspace`
wires it to the store with the toolbar and the hint line; the design flow's steps 2 and 3,
the studio's 2D view and the calculator's plan step (2) (`useCalculatorPlan` keeps the
calculator's `rooms` read off the plan) all use it. (`EditorTool` also has `zone` and `paint`;
no page currently offers `zone` — [finishes.md](finishes.md#known-gaps).) The transform is exposed on the canvas
as `data-scale` / `data-offset-x/y` for tests.

**The board carries too.** A tile clicked or dragged off the studio's shelf goes on the
pointer on the 2D board exactly as in 3D (`PlanEditor.carryingItemId`, wired by
`PlanWorkspace` from the store): the footprint follows the pointer from room to room, dashed
green where it fits and red where it does not, a click sets it down (`onMoveItem`, then
`onCarryPlaced` → `finishCarry`), R turns it (`PlanEditorApi.carryPose`), and Escape is the
page's `cancelCarry`. It used to be stood in the room by itself wherever the layout found a
spot, which read as the shelf placing furniture on its own. Only the walk-through gives a
carry up, since it has no pointer to carry on. **Escape puts every tool down**: the studio's
Escape disarms a fitting or a technical point whatever the view, and the board hands the rest
on through `PlanEditor.onEscape`, which fires only when the board had nothing of its own to
end — a wall or beam run in progress is ended by the first Escape, and the second one drops
the tool (`putToolsDown` in the studio: the build tool back to select, the brush put down).

**Shift drags a wall alone** (`offsetWallAlone`, `moveWallEnd`). A wall dragged sideways
takes the walls that meet it along (`offsetWall`), and a junction dragged takes every wall
end on it (`moveNode`) — so a wall could not be shortened without its corner, and the whole
room, coming with it. With Shift held at the drop the board asks for the wall alone: the
sideways drag moves only that wall (`onOffsetWall(id, distance, alone)`), the handle drag
only that wall's end (`onMoveNode(from, to, onlyWallId)`), and whatever met it stays where it
was. The corners come apart on purpose; the room they closed is open until the wall is put
back or the neighbours are dragged after it, and Ctrl+Z is the way back. Shift also keeps
its old meanings (the 1 cm grid, the free angle) — it is the board's "precisely, and only
this" key.

**Walls line up across the sheet** (`snapRectangle`, `snapWallOffset`). A rectangle being
drawn and a wall being dragged sideways both pull onto the line of a parallel wall they come
close to — a wall alongside first, then one continuing them end to end, then one merely in
line somewhere else on the sheet — and draw the line the two now share right across the
sheet (`align` guide), the way a dragged room does. That is how two rooms one above the
other get walls on one line and the same width: both sides of the new rectangle land on the
lines of the room above. A dragged wall does not snap onto a wall that runs *alongside* it
(that would stand one wall inside another; the drop refuses it), and Shift's "alone" drag
snaps like any other.

**Corners close on the board** (`wallEndExtensions`). A wall is drawn as a stroked
centreline with butt ends, and two such strokes meeting at an L-corner each stopped at the
node — a square of half a thickness a side was left empty at the outer corner and a hairline
of paper ran between the inner faces. Now every end at which another wall meets at an angle
runs on by half of *that* wall's thickness (to its far face at a corner, harmlessly inside
it at a T); walls in line butt against each other; a free end stays put. The PDF draws the
same.

**The flat's sizes stand outside the plan** (`outerDimensionChains`, `drawOuterDimensions`,
under the `dimensions` layer). Every exterior wall — one with a room on one side and nothing
on the other — contributes its ends to the chain on the side it faces, so a side reads
"3.12 · 5.31" wall by wall with arrowheads and extension lines, and the outer faces of the
walls give the overall width under the bottom chain and the overall depth beside the right
one; a wall with rooms on both sides is interior and in no chain. The board fits the plan
with a hundred pixels of margin when the layer is on, and a blank sheet opens two and a half
metres in from the corner so the first room's chain is not under the totals plate. The room's
own edge lengths stay inside, as before. **What the rooms wear is on the board too**
(`drawBaseFinishes`): a room's base floor finish as a fill in its product's colour, its base
wall finish as a band along every edge, under the strips, squares and zones — only finishes
that carry a product; the style's default is the room's ordinary paper.

Three things the board does *not* do, each a correction from the architect's review: it
never recentres itself after an edit (the view refits only when a different plan arrives —
`designStore.planSerial`, bumped by `setPlan`, `openSaved`, `openBoard`, `reset` and
`startFromCalculator` when the plan actually changed
— and a blank sheet opens at about a hundred square metres with the origin near the top
left); a room rectangle snaps onto the wall that runs *alongside* it, never onto one that
only meets its corner (`snapRectangle` ranks candidates by overlap, and the preview shows
the snapped rectangle while it is dragged — before this a room drawn beside a flat with a
12 cm jog got a doubled wall a hand apart); and Ctrl+Z / Ctrl+Y work on the board itself
(`PlanEditor.onUndo/onRedo`, wired by `PlanWorkspace` unless `keyboardUndo={false}` — the
studio handles the keys page-wide). The sheet's corner shows the flat's total area and
room count (`showTotals`).

## Room names

Room names follow their type on the plan page: a generated name ("მისაღები ოთახი 1") is
replaced when the type changes ("საძინებელი 2"); a name the user typed is kept.

## The plan as a PDF

**The plan leaves as a PDF** (`lib/design/planPdfExport.ts`). The board already knows how to
draw a plan — `components/plan/draw` is plain canvas over plain data — so the page is that
drawing at 200 dpi on an A4 sheet with a title block, and the PDF around it is written by
hand. The sheet carries a heading large enough to be read first with a subtitle under it
(the style and the date, or the home's condition), the dimension chains outside the walls
with room reserved for them, every door and window with its width × height
(`drawOpeningSize` — an interior door once, on the half that draws the leaf, not on each of
its twins), the furniture footprints with the kind of each piece (`itemLabel`), and what
each room wears (`finishes`). Everything written on the sheet is written at print scale
(`ui: SCALE` on the routines that take it — the room labels, the furniture, the openings'
sizes, the chains): the board's 9–14 px type is a smudge at 200 dpi. The room names go on
last, on a white plate (`drawRoomLabel`, split out of `drawRoom` for that), because a name
drawn first vanished under the bed standing on it; the edge lengths the board writes inside
each room (`dimensions`) are left off the sheet, since the chains carry every size and the
small figures at the walls' middles only collided with the radiators there. A furniture
label is shortened until it fits its piece — turned along a piece deeper than wide — or
left off, on the sheet and on the board alike: a name spilling past the edge read as the
neighbour's. The calculator's summary exports its own board the same way (its plan and the
laid finishes, no furniture): a vector page would have meant embedding and subsetting a font
for the Georgian room names, while a JPEG goes into a PDF as it is (`/DCTDecode`). The
cross-reference table is the only fiddly part and `tests/unit/design/planPdfExport.test.ts`
parses the result back with pdf.js.

## Tests

`tests/unit/design/walls.test.ts`, `drawing.test.ts`, `planDrawing.test.ts`, `studio.test.ts`,
`planPdfExport.test.ts`, `tests/unit/calculator/planSync.test.ts`,
`tests/unit/store/designStore.test.ts` (plan actions).

## Known gaps

- New walls are drawn in the 2D view only; in 3D a wall can be selected, unlocked and
  dragged sideways, not drawn. Rooms are likewise selected and dragged in 2D only. Rooms that
  share a wall cannot be pulled apart by dragging — undo, or delete and redraw, is the way
  back — and a plan saved while detaching still existed may hold two walls a few centimetres
  apart that nothing repairs on load. A door on an outside wall that becomes a shared wall when
  its room is pushed against a neighbour stays one-sided (no twin is cut in the neighbour). Floor
  zones are drawn in 2D (the whole room, one wall, half the floor, a painted tile, a painted
  strip and a painted wall patch all work from 3D). Beams are not obstacles for the layout
  engine.
- The wall graph is rectilinear in practice (angled walls draw and enclose rooms, but the
  room programs, `snapPlacement` and the footprints assume right angles).
