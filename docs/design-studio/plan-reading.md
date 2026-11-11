# Reading an uploaded floor plan

How an uploaded image or PDF becomes rooms: the browser-side CV parser, the optional Claude
reader — its ruler, the drawing's ink, the least-squares solver, the grid the walls are built
from and the fit of every room to the area printed in it — and how doors are placed when the
reader cannot see them.
Read this before touching anything that turns a picture into a `FloorPlan`.

Related: [overview.md](overview.md) · [plan-board.md](plan-board.md) (what happens to the rooms
next: `wallsFromRooms`) · [../calculator.md](../calculator.md) (the calculator's step 1 uses the
same upload card).

## Key files

| File | Responsibility |
|---|---|
| `components/design/PlanUploadCard.tsx` | the upload card used by both products' step 1: file → upload → read (Claude, else CV) → for a plan with no size of its own, one wall's length (`ScalePlanDrawing`); an upload that is not a plan refused; the game while it reads |
| `lib/design/planCheck.ts` | the cheap look before the read — is it a floor plan at all? (`claude-haiku-5-5`, low effort, thinking off, on a 512 px copy: `checkIsPlan`); fails open |
| `lib/design/planScale.ts` | a plan given its size from one wall: `defaultScaleEdge` (the longest inside edge on an outside wall), `scalePlanToEdge`, `scalePlan` |
| `components/design/PlacementGame.tsx`, `lib/design/placementGame.ts` | "Where does it go?" — real catalogue pieces on a 3D turntable to put in the rooms of a little flat while the plan is read (below) |
| `app/api/design/upload-plan/route.ts` | claims a plan the browser sent straight to storage and publishes it under `plans/` (Premium's and Professional's — `PLAN_REQUIRED` otherwise, [subscriptions.md](../subscriptions.md), as is `parse-plan`; 20 MB, bytes sniffed, never the declared type, GIF refused; `RATE_RULES.uploadPlan` when the place is asked for — [uploads.md](../uploads.md)) |
| `lib/uploads/browserImage.ts` (`optimizePlanForUpload`) | browser: a plan goes as it came unless its longest side is over 4096 px or it is over 20 MB — then scaled down, aspect kept, a PNG staying PNG |
| `lib/design/samplePlan.ts` | the sample flat behind "სანიმუშო გეგმის მოსინჯვა" on step 1 of both halves: about 150 m² laid out like an apartment — a hallway with the entrance and, off it, two bedrooms, a bathroom, a toilet, an office and the living room, the kitchen open to the living room, a balcony off the living room and one off the first bedroom (ten rooms; about 144 m² of floor once the walls stand) — with every door, archway, window and railing (each balcony stands out from the facade, so its front and both ends are railings); handed over by `PlanUploadCard` at once (drawn as `SamplePlanDrawing`), nothing read, the same with or without a key. The doors are cut in one room and their twins found on the board (`withOpeningTwins`). `public/samples/plan-2br.png` stays as the parser's and the reader's test drawing |
| `app/api/design/parse-plan/route.ts` | the Claude reader (`readPlanWithClaudeDetailed`, model `PLAN_MODEL`): reads only stored plan keys (from storage) or the bundled sample (`public/samples`, traced into the function by `outputFileTracingIncludes`), prepares them with `planVision`, builds the plan with the ink; answers 503 with `fallback: 'cv'` when no `ANTHROPIC_API_KEY` is configured; `RATE_RULES.parsePlan`; may run 300 s (`maxDuration`) |
| `lib/design/planVision.ts` | Node only (sharp): `prepareForVision` — the image within the API's limits (`fitForVision`) with a coordinate ruler drawn on for the model, and the same image without it as ink for the geometry |
| `lib/design/rulerDigits.ts` | the ruler's numbers as stroked SVG paths (`rulerLabel`) — a Vercel function has no fonts, so `<text>` drew nothing there |
| `lib/design/planPdf.ts` | browser: page 1 of a PDF rasterised through pdf.js to a PNG `File` |
| `lib/design/planImage.ts` | browser: `File` → RGBA at ≤ 1100 px — the only part of the CV path that touches the DOM |
| `lib/design/planParser.ts` | the deterministic CV parser: raster in, room polygons out |
| `lib/design/aiPlan.ts` | the prompt and schema, the call (structured output), `normaliseReading`, `labelMetres`, `labelArea`, and `buildPlanFromReading`: reading + ink → walls, rooms fitted to their printed areas, openings |
| `lib/design/planInk.ts` | the drawing's ink: the wall band beside a box side (`wallBandNear`), bare stretches of a boundary (`bareRuns`, `inkShare`), the doorways and windows in a solid wall (`gapsAlong`), a solid block's own edges and the ink without the blocks (`blockBox`, `withoutInk`) |
| `lib/design/measure.ts` | reading printed dimension strings (`parseLength`) and printed areas (`parseArea`) |
| `lib/design/planSolver.ts` | box sides → wall centrelines with thicknesses, solved so every printed size holds — a room's face to face, a dimension line from outer face or wall middle to outer face or wall middle (least squares); the walls' thicknesses (measured and rounded, or 30 / 12 cm); the image ⇄ plan mapping; the same solve with its lines moved (`withLines`) |
| `lib/design/planGrid.ts` | solved lines → cells per room (overlaps, holes, pieces, solid blocks) → boundary runs → walls and room separators |
| `lib/design/planAreas.ts` | one step of the area fit (`areaStep`): how far to move each line so the rooms measure what is printed in them, the lines nothing is built on first; `squeezedPairs` |
| `lib/design/planGeometry.ts` | pixel regions → metric `FloorPlan`; edges, normals, `deriveOpenings` |
| `lib/validations/plan.schema.ts` | the parse-plan payload |
| `scripts/test-plan-parser.ts`, `scripts/test-plan-solver.ts`, `scripts/diagnose-plan.ts`, `scripts/read-plan-ai.ts` | `pnpm test:parser`, `test:solver`, `plan:diagnose`, `plan:ai` (with `--overlay`, the result drawn over the plan) |

## Flow

```
file (image or PDF) ─ planPdf (PDF → PNG, page 1) ─ optimizePlanForUpload (only when huge)
   ─▶ POST /api/uploads (a place) → PUT to storage → POST /api/design/upload-plan → stored URL
   ├─ POST /api/design/parse-plan  planVision: image + ruler for Claude, the same image as ink
   │     planCheck (Haiku, a glance): not a floor plan → 422 NOT_A_PLAN, the card asks again
   │     Claude: rooms as boxes with the area printed in each, solid blocks (shafts, columns),
   │       dimension lines, sizes in rooms, doors/windows/open sides/railings
   │     → planInk (box sides onto wall bands) → planSolver (centrelines, thicknesses; the scale
   │       from the areas when no length is printed)
   │     → planGrid (cells, walls, separators) → roomsFromWalls → planAreas (every room its
   │       printed area) → openings onto the gaps, the doorways the reading missed
   │     → FloorPlan with walls (lowConfidence flags, scaleKnown)
   └─ 503 fallback:'cv' → planImage (RGBA ≤1100 px) → planParser (rooms as pixel polygons)
         → planGeometry at an assumed 70 m² → ensureWalls → FloorPlan
   nothing printed (scaleKnown false), or the CV path → one wall's length → planScale → FloorPlan
FloorPlan → ensureWalls (plan-board.md: wallsFromRooms for the CV path's polygons) → the board
```

A PDF is rasterised first, so the upload route, the Claude reader and the CV parser only ever
see images. The bytes never pass through a function: the browser sends them to storage and the
route claims them ([uploads.md](../uploads.md)), so a 15 MB scan is fine although a Vercel
function takes at most 4.5 MB of request body. pdf.js's worker is served from `public/vendor/pdf.worker.min.mjs` because the CSP
allows workers from this origin only (`pnpm pdf:worker` re-copies it after upgrading
`pdfjs-dist`).

## How the floor-plan parser works, and why

**Preprocessing** handles the difference between an export and a photograph. A drawing shot a
couple of degrees off square comes back as a flight of stairs, so the skew is estimated from
the orientation histogram of the edge gradients (mod 90°, because plans are made of two
perpendicular families of lines) and corrected. Unevenly lit paper defeats a global threshold,
so `hasUnevenLighting` picks between Otsu and a local Bradley-Roth threshold. Room labels,
dimension figures and furniture symbols are ink but not walls, so small blobs are despeckled
away. On a synthetic photograph — the five-room flat at 3.2° skew with a lighting gradient
and text clutter — this is the difference between a dozen or more spurious rooms and the real
ones (`scripts/test-plan-parser.ts` accepts 4–7 for that case).

Rooms are then separated by **clearance, not connectivity**. The obvious approach — dilate the
walls until the door gaps close — cannot work: a door gap is ~0.9 m and a wall stroke is
~0.1 m, so any kernel wide enough to bridge a doorway also swallows a small bathroom. Instead
the distance transform of the open space is thresholded from wide to narrow, and each room is
claimed at whatever clearance it first appears at (a watershed flooded from the distance
maxima). That finds a 3 m² toilet and an open-plan living room in the same pass.

Outlines come from **marching-squares crack following** — walking the boundary *between*
pixels — which is axis-aligned by construction and therefore exactly the shape a room outline
wants to be. Moore-neighbour tracing was tried first and is not worth revisiting.

`pnpm test:parser` runs synthetic plans (5-room flat, corridor flat with a 5 m² bathroom,
L-shaped studio, and a "photographed" plan with skew + uneven light + clutter) through the
whole thing and asserts room counts, total area and that L-shapes survive. Run it after
touching anything in `planParser.ts`.

## Reading a plan with Claude (`aiPlan.ts`, `planInk.ts`, `planSolver.ts`, `planGrid.ts`)

The CV parser reads *ink*, and a real estate agent's plan is mostly ink that is not a wall:
sofas, beds, kitchen counters, dimension arrows, room labels. On a sample 1-bedroom estate
agent's plan (not in the repo — uploads are not kept in git; its room boxes are
encoded in `scripts/test-plan-solver.ts`) it returned two regions — a 364×312 blob and a sliver — losing the
bedroom, bathroom and balcony entirely. Annotation lines that run to the image edge also let
interior space leak into the exterior region, which is then discarded as "outside". No
threshold tuning fixes that; the plan has to be read, not measured.

**The division of labour is the whole design.** Claude is asked for what it is good at — room
names and types, each room's shape as one or more rectangles, what the dimension labels *say*,
and every door, window, archway, open connection and balcony railing — and trusted for none
of the coordinates, which a vision model returns a few percent out with nothing downstream
able to tell. Three things make the geometry exact instead: the drawing's own ink, the printed
dimensions, and one grid the walls are built from.

**What is asked** (`SYSTEM_PROMPT`, `PLAN_SCHEMA`, answered as structured output by
`claude-opus-5-5` at high effort, with the server-side refusal fallback on):

- **Rooms as parts.** Each room is one or more rectangles covering its floor, inner face to inner
  face: a rectangle is one part, an L two, a T or U three. A size written *in* a room (or in a
  table of rooms by name — "Bed 01: 3.5 x 3.0m") goes on its part: the room's clear inside size.
  A space labelled as two things at once ("Living Room and Kitchen") is one `studio`. A
  staircase is floor of the room it starts in.
- **The area printed in a room** (`areaLabel`: "10.8 m²", "10,8 მ²", "116 sq ft"), exactly as
  printed — never a total of the flat. A developer's plan often prints nothing else, and it is
  the number the buyer holds the flat to (below).
- **Solid blocks** (`voids`): a column, a shaft or duct — a small box, hatched, crossed or
  filled, in a corner or against a wall — a chimney, each as its own rectangle. Not floor, not
  a room, and not furniture (a counter or a wardrobe is not one).
- **Dimension lines on their own** (`dimensions`). Every size between two arrows or ticks — each
  segment of a chain outside the plan, and the overall size beyond it — with its `axis`
  (across / down), its two ends along that axis (`from`, `to`, where the extension lines meet the
  walls) and where the line is drawn (`at`). They used to go on the rooms whose wall they ran
  along, as if each were a clear room size: a chain adds up to the overall, measured to the walls'
  outer faces and middles, so every wall's thickness was added on top — project 375's printed
  11.50 × 7.75 m came out 12.29 × 8.52.
- **Openings with a side and two ends.** `kind` is `door`, `window`, `archway`, `open` (no wall
  at all between two rooms) or `railing` (a balcony's open side); `side` is which side of
  `roomA` it is on, `from`/`to` its two ends on the wall; a door also gives the point its arc
  pivots on (`hinge`) and the room the leaf swings into (`swingsInto`).
- **Coordinates off a ruler.** `planVision.prepareForVision` draws a blue ruler on the copy the
  model sees — dashed lines at every tenth of the drawing, numbered along the top and left, in a
  white margin — and the prompt asks for every coordinate on it. A model asked for "a fraction
  of the image" estimates; one given a ruler reads, and its doors land on the right stretch of
  wall. The ruler spans the drawing, not the margin, so its coordinates are the ink's. Its
  numbers are drawn as strokes (`rulerDigits.ts`), not `<text>`: sharp renders SVG text through
  the system's fonts, and a Vercel function has none — the ruler came out unnumbered there.

**Which model** (`plan:ai --model`, 9 October 2026, four plans: the estate-agent plan above, the
bundled sample with no labels, a hand-drawn watercolour flat, a CAD ground floor with sizes in
the rooms). Opus 5.5 and Sonnet 5.5 came out alike on three plans — the ink and the labels fix
the geometry, so the models differ only in reading — and Opus was better on the hardest one
(Sonnet lost a small corridor there, leaving a bedroom with no door). Sonnet thinks longer, so it
was only about a third cheaper (about $0.11 a read against $0.17, $0.04–0.28 depending on the
plan) and slower on the hard plans (up to 160 s against 120 s). Haiku 5.5 ran out of its 32 000
output tokens on both hard plans with no answer, and on the estate-agent plan turned the balcony
door into open separators and lost two windows. Hence `claude-opus-5-5`; `--model` reruns the
comparison.

**Pinning boxes onto the ink** (`planInk.wallBandNear`). For each side of each part, the rows
(or columns) within 3.5 % of the image either side of it are scored by how much of the side's
length they cover in ink; consecutive covered rows are a band, and the band with the most ink
(thickness × coverage) is the wall — which outranks the hairline of a kitchen counter drawn
beside it. A band cut off by the search window is followed to its real faces. Bands under half
the drawing's typical wall are dropped (`dropHairlines`): next to an open boundary there is no
wall to find, and the heaviest ink there can be a sofa's outline. A band over 2.6 times the
typical wall is a wall with something drawn against it — a hatched kitchen counter made one
0.5 m band of a CAD plan's kitchen wall and put its printed 11'0" 43 cm out — so it keeps its
outer face and takes the typical thickness (an exterior wall twice a partition is left alone);
when the room was read to end at the band's *inner* face it is the other thing, a mass of
masonry behind the room's wall (a pier, the solid corner a balcony steps round), and the inner
face stays. A side the ink pins becomes a
wall **centreline and thickness**; one it does not becomes the box face pushed out by half a
default 12 cm wall. The raster is Otsu-thresholded (capped below mid-grey, so pale fills do not
count) — on a pure black-and-white drawing Otsu's threshold is 0, hence `<=`. A drawing in light
lines on a dark ground (project 371: cream walls on brown) is inverted first (`darkGround`: most of
a sample darker than mid-grey).

**Is it a plan at all?** (`planCheck`). Before the read, a 512 px copy without the ruler
(`VisionInput.glance`) goes to `claude-haiku-5-5` at low effort with thinking off, asking for
`{ isPlan, depicts }` as structured output — well under a tetri, against the read's $0.05–0.30.
A photo of a room, a building, a car or a person is answered 422 `NOT_A_PLAN` (`notPlan: true`, no
CV fallback) and the card says so and asks for another file; a CAD export, an estate agent's plan,
a hand sketch or a photo of a printed plan is a plan. No key, an error, a refusal or an answer that
does not parse all count as a plan: the check can only save a read, never block one.

**Solving** (`planSolver`):

1. Every side's centreline estimate is snapped onto shared grid lines (a band the ink showed
   outranks a guess from a box face), so neighbours agree on the wall between them. Each line
   carries one wall thickness, the median of its members' bands.
2. Those lines become the unknowns of a least-squares problem; each line's observed position is
   a weak constraint and each printed size a strong one. A size in a room runs **face to face** —
   the two centrelines stand the label plus half of each wall apart. A **dimension line** runs
   between what its two ends land on: each end snaps to the nearest line (within 4 % of the
   image), and measures to that wall's **outer face** where the line is an outside wall at the end
   the chain is drawn by (a room on one side only, there), else to the wall's **middle** — the
   way an architect chains sizes, and the way the board draws its own chains
   (`outerDimensionChains`, [plan-board.md](plan-board.md)), so the board shows the drawing's
   numbers. A chain then adds up to its overall, and the overall is outer face to outer face.
3. The solve gives the wall positions, and a piecewise mapping between the image and the plan
   (`toPlan` / `toImage`, linear between consecutive lines) that every opening and every ink
   check goes through. The mapping used to be one global scale with no origin, which put every
   door off by the plan's margin.

Counting the walls is what makes a drawing's labels agree. On the sample plan the bathroom
(1.88 m) and hallway (1.73 m) sit side by side over a bedroom labelled 3.73 m: 13 cm short when
labels were taken centreline to centreline — and exactly the 12 cm wall between bathroom and
hallway. Every label is now met to about a centimetre (`pnpm test:solver` asserts under 3 cm),
and `lowConfidence` is left for drawings that really disagree.

**Wall thicknesses.** With anything printed, a wall the ink shows keeps its measured thickness
rounded to a standard size (`standardWallThickness`: 8, 10, 12, 15, 20, 25, 30 … 60 cm); one the
ink does not show is 30 cm when it is an outside wall and 12 cm inside (`DEFAULT_EXTERIOR_WALL_M`,
`DEFAULT_WALL_M`). With nothing printed the ink's widths are in no unit, so every wall is 30 / 12.
A line is an outside wall when a room of the flat stands on one side of it only, all along it — a
balcony counts as outside, and a line that is a partition anywhere keeps a partition's thickness
(one thickness per line; an outside wall's 30 cm on the bathroom–hallway line that runs on past
the hallway would push both rooms' faces 9 cm off their sizes). A wall the ink does not show is
widened outwards, the room's face staying where its box put it.

**Areas give the scale, and every room is fitted to its own** (`scaleFromAreas`, `planAreas`).
A plan with an area in each room and no length anywhere used to count as "nothing printed": the
prompt told the model an area is not a dimension, the plan was laid out at an assumed 12 m
across *on each axis* — a tall drawing came out stretched sideways — and one wall's length was
asked. Now:

- **The scale.** Each room with a printed area is measured on the image, face to face — a
  pinned side at its wall band's inner face, the rest where the model put them, less the solid
  blocks standing in it; the printed area over that is m² per unit², and the median over the
  rooms is the plan's (one misread area does not move it). The image's width over its height
  (`SolveOptions.aspect`, from the ink) splits it between the axes: a pixel is as wide as it is
  tall. Used only when no length is printed (`areaScale`); the same shape also gives an axis
  with nothing printed on it the other's scale, and keeps a plan with nothing printed at all
  the shape it is drawn.
- **The fit.** The solve puts each wall where the drawing has it to a pixel or two, and a
  couple of centimetres along four metres of wall is the difference between 10.8 and 10.7. So
  once the walls stand the rooms are measured as the board will measure them (the faces
  `roomsFromWalls` makes) and the grid lines are nudged until each room is its printed area
  (`buildPlanFromReading`, step 5b, at most 16 rounds, to 0.002 m²). One round is a small
  least-squares problem (`areaStep`): a room's area changes with a line by the length of its
  boundary on that line (the grid's boundary runs); every line resists by its stiffness
  (`lineStiffness` — 1 for a wall the image showed, 0.3 for one it did not, 0.03 for a line
  with only room separators on it, so the boundary nothing is built on moves first); and every
  pair of lines a printed size holds apart stays at its distance (`SolveResult.ties`). The plan
  is laid out again after each round, because the wall thicknesses bend the areas a little.
- **What holds it back.** A printed area more than 25 % from the room as drawn is a misread, or
  the area of something else: it is not fitted, and the room is flagged (`MAX_AREA_DRIFT`,
  `lowConfidence`). Two neighbouring lines may come no closer than 60 % of what they stood
  apart (`squeezedPairs`: they are held from then on), and no line may travel more than 40 cm
  from where the walls put it (`MAX_FIT_SHIFT_M`) — areas only a different flat could meet are
  not the drawing's; the best fit within that is kept and the rooms still off are flagged.
- **Openings keep their size.** A gap in a wall is as wide as the image shows at the plan's own
  scale (`edgeGaps`); only its place goes through the solve's mapping, which the fit stretches a
  little between lines.

`AiPlanResult.areas` lists each printed area against the room; `plan:ai` prints them, and
`--no-fit` shows the rooms as the walls alone put them.

**Solid blocks** (`AiPlanReading.voids`). A shaft drawn hatched is ink from edge to edge: beside
a room it read as a wall half a metre thick, and a row of it along a room's side as the wall
that side is on. So each block is first moved onto its own edges (`blockBox`: each side onto
the nearest place the ink starts), then wiped off the ink the rooms are pinned on
(`withoutInk`). In the solver a block is a box like a room's (`RoughRoom.void`) whose lines sit
half a wall *inside* its faces, so the rooms round it keep their faces on the block's; a side
standing against a wall a room was pinned on takes that wall's line (`pinBlocksToWalls`), and
otherwise joins another line only when the two walls would stand in each other (`Estimate.tight`
— a shaft a hand from a partition keeps its own line; 26 cm apart was one wall before). On the
grid its cells are `SOLID`: no room's, never filled, walled off from the rooms and from the
outside alike — an outside wall runs on past a shaft standing against it — at a partition's
thickness (a room facing a block is not facing the outside: `isExterior`). The face the walls
close round a big block is dropped (it is nobody's room).

**A line two rooms meet on with no wall** (`markOpenSides`). Where one room's side and the next
room's lie on one line and the ink shows no wall on either, the rooms run into each other there.
Both sides are marked (`RoughRoom.openSides`) and the line is `tight` like a block's: a kitchen
whose open side is 20 cm short of the partition beside it used to be drawn onto that partition
(every estimate within 2.2 % of the image is one line, and estimates chain), which made the
kitchen 1.2 m² too big, the hallway 0.9 too small, and the area fit pull the whole flat out of
shape to make up for it.

**Thicknesses compare in pixels** (`bandPixels`). A band's thickness is a share of the image's
width on a vertical side and of its height on a horizontal one. `dropHairlines` compared them
as they were, which is only right on a square image: on a 490 × 768 plan an 8 px partition
drawn across made the 14 px outside wall drawn down "2.6 times the typical wall", and it lost
its outer face and two thirds of its thickness.

**No size at all.** When nothing printed could be read (`scaleKnown: false` on the result and the
route's answer) the plan is at an assumed scale; the upload card shows it with its longest outside
wall picked and asks that wall's length, inside the room, as the board shows it — or another wall
the person clicks (`planScale.scalePlanToEdge`: the positions scale, the thicknesses do not, so the
factor is taken on the centreline: the inside length plus the half thicknesses at its two ends).
The CV path, which never knows a size, ends the same way.

Two axes need **two scales** — boxes are normalised against image width for x and height for
y, and drawings are rarely square. Sharing one scale stretches an axis by the aspect ratio and
then every dimension on it looks like a misread. A bare metric number is read in the unit its
size implies (`labelMetres`: 350 → cm, 3500 → mm).

**The grid** (`planGrid`). Between consecutive lines the plan is cells, and each room is the
cells its parts cover:

- a cell two rooms claim goes to the **smaller** room — a hallway's box drawn over a corner of
  the bathroom leaves the hallway the L it really is, instead of the overlap becoming a room of
  its own (it did: a phantom "საძინებელი" between a bathroom and a hallway, both shrunk to half);
- an unclaimed cell shut in by rooms is a sliver the boxes missed, and goes to the neighbour it
  shares most with; a room in pieces keeps its largest;
- every boundary between two owners is a run along its line, and each run a wall of its line's
  thickness — or a **room separator** (thickness 0, `separator: true`, `origin: 'existing'`)
  where the rooms run into each other.

Where a boundary is open (`openStretches`): with the ink, rooms the model called `open` are open
wherever the line is bare; a boundary the model said nothing about is open when it is bare along
all of it (a hallway running straight into the living room) or bare along more than 1.3 m with
no door read between the two rooms; a wall stub under 10 cm between open stretches goes with
them. Without the ink, the model's `open` is all there is. The walls are cut at their junctions
and `roomsFromWalls` derives the rooms, each given back its reading by the anchor of its
largest cell — so the plan arrives **with its walls**, and `ensureWalls` takes it as it is.

**Openings** (`placeReadOpenings`). Doors first, then archways, railings and windows. Each goes
on a wall of its room on the side named, nearest where it was read, and between two rooms on a
wall the other room stands behind (another side only when the named one has none within
1.5 m); the wall decides who is behind it, not the reading — a "window to the outside" in the
wall onto the balcony opens onto the balcony. Where the drawing draws its walls solid
(`gapsAlong`: the band solid along at least a third of its length) the opening moves onto the
gap in the band nearest where it was read, within 1.8 m — a doorway is an empty gap, a window a
glazed one (thin lines across it), and a mismatch costs 0.8 m — and takes the gap's width. The
same opening read from both rooms is placed once. A short wall most of which is a doorway
still counts as drawn solid when it is solid at both its ends (an outlined wall is thin lines
there too). An opening that would overlap one already placed takes what is left of the wall
there instead of going missing (`squeezeOnEdge`: a window between a shaft's corner and the
balcony door, 30 cm at least; a door 60). A door hangs from the jamb its arc pivots on
(`hinge: 'left'` is the jamb at the edge's start) and swings into the room the arc sweeps; a
front door read with no arc swings in. An opening between two rooms is cut in both, as one
opening's two halves (the twin's id is `<b>-<a>-d-<primary id>`, its hinge and swing mirrored).
A gap from the flat to the outside is its entrance: an exterior archway becomes a door. A
railing goes only on a balcony's outer walls.

**What the drawing shows and the reading left out.** After the read openings, every wall between
two rooms is looked over once more: an empty gap of a door's width (0.55–1.3 m) in a wall drawn
solid, with nothing placed on it, is a door — hinge and swing by default. A model that reads a
door onto the wrong wall (the arc ends near a corner) left the right wall blank and, with no
other way in, the room got an inferred door somewhere else. And a balcony's side drawn with a
line under 70 % of the typical wall (`thinBalconySides`, read before the hairlines are dropped)
is a railing along that whole side wherever nothing was placed on it — a reading that names
one railing of three leaves the other two sides walls to the ceiling, and a parapet rail is
not one.

**Inference only where the drawing is silent** (`inferMissingOpenings`, on `deriveOpenings`):
a reading with no openings at all gets the whole inference; otherwise a flat with no way in gets
the inferred front door, a room nothing leads to (through a door, an archway or a separator,
from the way in) gets its inferred door, and a reading with no windows gets the inferred ones.

`pnpm test:solver` and `tests/unit/design/aiPlan.test.ts` cover all of this without an API key,
which is the point: the half that has to be right is testable before a single token is spent.
`aiPlan.test.ts` draws a 400 × 300 px plan whose walls are known to the pixel — doors as gaps,
a window as three thin lines, a kitchen open to the living room with a sofa's hairline beside
the boundary — and checks the reading lands on it.

## The game while the plan is read (`PlacementGame`, `placementGame.ts`)

A read takes 20 s to 2 minutes, so the upload card offers a game in the meantime: **"Where does
it go?"** (სად დგას ეს?). One real catalogue piece at a time turns on a 3D turntable
(`mountModelPreview`, the catalogue's "see in 3D" turntable, still for someone who asked for
reduced motion), and the person drags its card onto the room of a little flat it belongs in — or
taps the room, which is how a phone plays it. The flat is the board in miniature: black walls,
white floors, each room with its type's swatch (`ROOM_TINT_STRONG`).

- **The answers are not written down.** A kind is playable when exactly one of the game's rooms
  (living room, kitchen, bedroom, bathroom, hallway) has it in its room program (`kindsForRoom`)
  and the office, balcony and storage programs do not — a bed, a toilet, a fridge, a sofa, a shoe
  cabinet; never an armchair (living room, office or balcony) or a dining table (kitchen or living
  room). Kitchen runs are left out: they are sold as their material, so their name and photo are
  a veneer swatch, not furniture.
- **The pieces are real**: products from `GET /api/design/catalog` with a ready model, eight a
  round, every room first and then a second each, no kind twice, the last round's pieces only when
  there is nothing else (`pickRound`). A right answer shows what it really is — its price and its
  store. Fewer than four playable pieces and the game does not show.
- **Scoring**: 100 for a first try plus 25 a step for a run of first tries (up to four steps), 50
  for a second try, nothing after; a wrong room shakes with a red outline, and after two the
  right room is lit (`hintRoom`).
- **It never holds anything up.** The plan is handed over the moment it is read, as before. The
  game goes away with the spinner for someone who never touched it; for someone playing it stays,
  says the plan is ready (and how many rooms were read), and closes when they say so.

## Room names

The CV parser reads no text, so a room is named by the type it is guessed to be; Claude's
labels are the drawing's own, verbatim (`AiRoom.printedName`), and a room the drawing prints no
name for is called what it is, like any room the app names — the reading's own `name` for it
("Living room", there so the openings can say which room they are in) is not shown. Both then go through `withRoomNames`
([plan-board.md](plan-board.md#room-names-libdesignroomnamests)): a lone room of its kind has
the kind's name alone and a kind with several is numbered 1…n in the order the plan is read —
"სამზარეულო", "საძინებელი 1", "საძინებელი 2" rather than every room numbered by its place in
the plan. A label Claude reads that is not one of the room types' names ("Bedroom", "ბავშვის
ოთახი") is left as it is.

## Doors are inferred by circulation, not adjacency (`planGeometry.deriveOpenings`)

The CV path cannot see doorways (the parser seals them), so doors are placed on shared
walls. Putting one on *every* shared wall — the original rule — gave the sample plan's 3.7 m
bedroom doors on three walls, a window on the fourth, and no wall left for a bed. Now a
private room (bedroom, office, bathroom…) picks exactly one door of its own, to its best
circulation neighbour (hallway > living room > kitchen; a kitchen and a studio count as
circulation), circulation rooms open into each other — as an archway when a living room shares
more than 2.4 m with a kitchen or hallway — and a room whose only neighbours are private (a
kitchen behind a merged-away hallway) still gets a door so nothing is sealed in (that pass can
give a private room a second door from its neighbour). The front door prefers hallway > living
room > kitchen. The AI path places what the drawing shows and takes from this inference only
what it leaves out (`inferMissingOpenings`, above). Two rooms a room separator divides are open onto each other:
no door is hung between them, a private room open onto another is reached through it, and
neither counts as sealed in; windows go on walls only, never on a separator's open edge
([plan-board.md](plan-board.md#room-separators-libdesignseparatorsts)).

## Tests

- `pnpm test:parser` (`scripts/test-plan-parser.ts`) — synthetic plans (a five-room flat, a
  corridor flat with a small bathroom, an L-shaped studio, a "photographed" plan with skew,
  uneven light and clutter) through the whole CV parser: room counts, total area, L-shapes.
  Run it after touching `planParser.ts`. It runs in CI.
- `pnpm test:solver` (`scripts/test-plan-solver.ts`) — dimension labels and the solver, no API
  key. Runs in CI.
- `tests/unit/design/aiPlan.test.ts` — `buildPlanFromReading` against a drawn plan (ink) and
  from a reading alone, `labelMetres`, `normaliseReading`, and that the board takes the result
  as it is (`ensureWalls`, `withPartialWallSeparators`).
- `tests/unit/design/planGrid.test.ts` — cells (overlaps, holes, pieces), boundary runs and
  separators, and the ink helpers (`wallBandNear`, `gapsAlong`, `bareRuns`).
- `tests/unit/design/planAreas.test.ts` — `parseArea`; `areaStep` (a room gaining what it is
  short of, a separator's line before a wall's, a printed size held, squeezed neighbours); solid
  blocks on the grid; and a 400 × 500 px drawing with nothing printed but each room's area —
  the size taken from the areas, every room exactly its label, the shaft cut out of the living
  room and no room made of it, the doorway the reading left out, a window squeezed beside a
  door, a thin-lined balcony's three railings, the board taking it as it is — then the same
  from a reading alone, a plan with nothing printed keeping the picture's shape, and an area
  far from the drawing not held to.
- `tests/unit/design/placementGame.test.ts` — the game's answers from the room programs, what is
  left out, a round's spread over the rooms, scoring, the hint.
- `pnpm plan:diagnose <plan.png>` and `pnpm plan:ai <plan.png> [--save r.json] [--replay r.json]
  [--overlay out.png] [--model <id>] [--no-fit]` are the tools for one real plan. `plan:ai` needs a key unless replaying;
  replay with the image to use its ink. `--overlay` draws the walls, separators, doors,
  windows and railings back onto the drawing through the solve's mapping — the quickest way to
  see a wall off the drawing's wall.

## Known gaps

- PDF plans: only the first page is rasterised; a multi-page set has to be split by hand.
  The plan *export* is one A4 page with the drawing on it as an image — no vector geometry,
  no selectable text, no furniture schedule, no second sheet.
- Floor-plan parsing has two paths: Claude reads the drawing when `ANTHROPIC_API_KEY` is set,
  and the deterministic CV parser takes over when it is not. The CV path cannot read
  dimensions, so it always asks one wall's length.
- A plan whose doors are inferred can come with no front door: `deriveOpenings` places the
  windows before the front door, and an entry room whose outside walls have all taken a window
  has no wall left for it. The sample plan read the CV way is one — its living room's two
  outside walls both get a window, so the flat has three interior doors, an archway and no
  entrance (the drawing has one, in the bottom-left room's outer wall, which the CV path cannot
  see).
- **Areas.** The fit moves walls, a few centimetres each, to make a room its printed area;
  where a drawing's own areas and lines disagree (a kitchen labelled 6.4 m² and drawn 6.9) the
  walls give. A plan that prints both a length and an area for a room holds the length. The
  flat's total printed in a table is not read or checked against the rooms.
- **Solid blocks.** A block over 0.6 m² inside is walled off at the read, but the board's next
  edit derives the rooms from the walls again and makes a room of it (`MIN_ROOM_AREA_M2`). A
  boxed corner the model does not report (a duct in a bathroom drawn white with thin walls)
  stays part of the room, and the room's printed area is then met by moving its other walls. A
  block wider than about a sixth of the image is taken for a misread room and dropped
  (`normaliseReading`).
- A wall drawn in grey or hatched light (a party wall) is not ink (the threshold stays under
  mid-grey): rooms against it are pinned by their neighbours' lines, a few centimetres out.
- A staircase is floor of the room it starts in; the board has no stair element, and a closet
  under it reads as a door from the next room into that floor.
- A line of the grid carries one wall thickness. A drawing whose walls on one line differ —
  a thick plumbing wall behind a bathroom sharing its living-room face with a thin partition
  behind the bedroom — gets the line's median for both; widening one run moves the faces the
  printed dimensions are measured to, so it is not done.
- A double door is read as one door of a single leaf's width (the CAD plan's front door).
- Dimensions the model cannot parse (hand-lettered "55-14\"") count as nothing printed: the plan
  is at the assumed scale of about 12 m across and the person is asked one wall's length.
- The ink helpers find dark walls on a light ground (a dark ground is inverted first); walls drawn only as two thin
  outlines are found as thin bands, and their doorways are not snapped (`gapsAlong` needs a
  solid band). A photographed plan is read without deskewing on this path.
- Every opening keeps the default height and sill of its kind (a bathroom window is set high);
  the drawing says nothing about heights.
- A studio read from a plan has no line of its own and reads the default kitchen line
  (`effectiveSplit`), not the one the drawing shows.
- A read takes 20 s to 2 minutes at high effort (the upload card shows "reading" meanwhile) and
  costs $0.05–0.30; the `lowConfidence` flag and the model's `notes` are returned but the upload card
  shows neither yet.
