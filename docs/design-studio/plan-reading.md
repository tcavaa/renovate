# Reading an uploaded floor plan

How an uploaded image or PDF becomes rooms: the browser-side CV parser, the optional Claude
reader — its ruler, the drawing's ink, the least-squares solver and the grid the walls are built
from — and how doors are placed when the reader cannot see them.
Read this before touching anything that turns a picture into a `FloorPlan`.

Related: [overview.md](overview.md) · [plan-board.md](plan-board.md) (what happens to the rooms
next: `wallsFromRooms`) · [../calculator.md](../calculator.md) (the calculator's step 1 uses the
same upload card).

## Key files

| File | Responsibility |
|---|---|
| `components/design/PlanUploadCard.tsx` | the upload card used by both products' step 1: file → upload → read (Claude, else CV) → confirm scale/area; the game while it reads |
| `components/design/PlacementGame.tsx`, `lib/design/placementGame.ts` | "Where does it go?" — real catalogue pieces on a 3D turntable to put in the rooms of a little flat while the plan is read (below) |
| `app/api/design/upload-plan/route.ts` | claims a plan the browser sent straight to storage and publishes it under `plans/` (open to signed-in and guest callers; 20 MB, bytes sniffed, never the declared type, GIF refused; `RATE_RULES.uploadPlan` when the place is asked for — [uploads.md](../uploads.md)) |
| `lib/uploads/browserImage.ts` (`optimizePlanForUpload`) | browser: a plan goes as it came unless its longest side is over 4096 px or it is over 20 MB — then scaled down, aspect kept, a PNG staying PNG |
| `lib/design/samplePlan.ts` | the sample flat behind "სანიმუშო გეგმის მოსინჯვა" on step 1 of both halves: about 150 m² laid out like an apartment — a hallway with the entrance and, off it, two bedrooms, a bathroom, a toilet, an office and the living room, the kitchen open to the living room, a balcony off the living room and one off the first bedroom (ten rooms; about 144 m² of floor once the walls stand) — with every door, archway, window and railing; handed over by `PlanUploadCard` at once (drawn as `SamplePlanDrawing`), nothing read, the same with or without a key. The doors are cut in one room and their twins found on the board (`withOpeningTwins`). `public/samples/plan-2br.png` stays as the parser's and the reader's test drawing |
| `app/api/design/parse-plan/route.ts` | the Claude reader (`readPlanWithClaudeDetailed`, model `PLAN_MODEL`): reads only stored plan keys (from storage) or the bundled sample (`public/samples`, traced into the function by `outputFileTracingIncludes`), prepares them with `planVision`, builds the plan with the ink; answers 503 with `fallback: 'cv'` when no `ANTHROPIC_API_KEY` is configured; `RATE_RULES.parsePlan`; may run 300 s (`maxDuration`) |
| `lib/design/planVision.ts` | Node only (sharp): `prepareForVision` — the image within the API's limits (`fitForVision`) with a coordinate ruler drawn on for the model, and the same image without it as ink for the geometry |
| `lib/design/rulerDigits.ts` | the ruler's numbers as stroked SVG paths (`rulerLabel`) — a Vercel function has no fonts, so `<text>` drew nothing there |
| `lib/design/planPdf.ts` | browser: page 1 of a PDF rasterised through pdf.js to a PNG `File` |
| `lib/design/planImage.ts` | browser: `File` → RGBA at ≤ 1100 px — the only part of the CV path that touches the DOM |
| `lib/design/planParser.ts` | the deterministic CV parser: raster in, room polygons out |
| `lib/design/aiPlan.ts` | the prompt and schema, the call (structured output), `normaliseReading`, `labelMetres`, and `buildPlanFromReading`: reading + ink → walls, rooms, openings |
| `lib/design/planInk.ts` | the drawing's ink: the wall band beside a box side (`wallBandNear`), bare stretches of a boundary (`bareRuns`, `inkShare`), the doorways and windows in a solid wall (`gapsAlong`) |
| `lib/design/measure.ts` | reading printed dimension strings |
| `lib/design/planSolver.ts` | box sides → wall centrelines with thicknesses, solved so every printed dimension holds face to face (least squares); the image ⇄ plan mapping |
| `lib/design/planGrid.ts` | solved lines → cells per room (overlaps, holes, pieces) → boundary runs → walls and room separators |
| `lib/design/planGeometry.ts` | pixel regions → metric `FloorPlan`; edges, normals, `deriveOpenings` |
| `lib/validations/plan.schema.ts` | the parse-plan payload |
| `scripts/test-plan-parser.ts`, `scripts/test-plan-solver.ts`, `scripts/diagnose-plan.ts`, `scripts/read-plan-ai.ts` | `pnpm test:parser`, `test:solver`, `plan:diagnose`, `plan:ai` (with `--overlay`, the result drawn over the plan) |

## Flow

```
file (image or PDF) ─ planPdf (PDF → PNG, page 1) ─ optimizePlanForUpload (only when huge)
   ─▶ POST /api/uploads (a place) → PUT to storage → POST /api/design/upload-plan → stored URL
   ├─ POST /api/design/parse-plan  planVision: image + ruler for Claude, the same image as ink
   │     Claude: rooms as boxes, printed dimensions, doors/windows/open sides/railings
   │     → planInk (box sides onto wall bands) → planSolver (centrelines, thicknesses)
   │     → planGrid (cells, walls, separators) → roomsFromWalls → openings onto the gaps
   │     → FloorPlan with walls (lowConfidence flags)
   └─ 503 fallback:'cv' → planImage (RGBA ≤1100 px) → planParser (rooms as pixel polygons)
         → the person confirms the total area/scale → planGeometry → FloorPlan
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
  face: a rectangle is one part, an L two, a T or U three. Labels go on the part they measure.
  A space labelled as two things at once ("Living Room and Kitchen") is one `studio`.
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
outer face and takes the typical thickness (an exterior wall twice a partition is left alone). A side the ink pins becomes a
wall **centreline and thickness**; one it does not becomes the box face pushed out by half a
default 12 cm wall. The raster is Otsu-thresholded (capped below mid-grey, so pale fills do not
count) — on a pure black-and-white drawing Otsu's threshold is 0, hence `<=`.

**Solving** (`planSolver`):

1. Every side's centreline estimate is snapped onto shared grid lines (a band the ink showed
   outranks a guess from a box face), so neighbours agree on the wall between them. Each line
   carries one wall thickness, the median of its members' bands.
2. Those lines become the unknowns of a least-squares problem: each printed dimension is a
   strong constraint **face to face** — the two centrelines stand the label plus half of each
   wall apart — each line's observed position a weak one.
3. The solve gives the wall positions, and a piecewise mapping between the image and the plan
   (`toPlan` / `toImage`, linear between consecutive lines) that every opening and every ink
   check goes through. The mapping used to be one global scale with no origin, which put every
   door off by the plan's margin.

Counting the walls is what makes a drawing's labels agree. On the sample plan the bathroom
(1.88 m) and hallway (1.73 m) sit side by side over a bedroom labelled 3.73 m: 13 cm short when
labels were taken centreline to centreline — and exactly the 12 cm wall between bathroom and
hallway. Every label is now met to about a centimetre (`pnpm test:solver` asserts under 3 cm),
and `lowConfidence` is left for drawings that really disagree.

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
same opening read from both rooms is placed once. A door hangs from the jamb its arc pivots on
(`hinge: 'left'` is the jamb at the edge's start) and swings into the room the arc sweeps; a
front door read with no arc swings in. An opening between two rooms is cut in both, as one
opening's two halves (the twin's id is `<b>-<a>-d-<primary id>`, its hinge and swing mirrored).
A gap from the flat to the outside is its entrance: an exterior archway becomes a door. A
railing goes only on a balcony's outer walls.

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
labels are the drawing's own, verbatim. Both then go through `withRoomNames`
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
- `tests/unit/design/placementGame.test.ts` — the game's answers from the room programs, what is
  left out, a round's spread over the rooms, scoring, the hint.
- `pnpm plan:diagnose <plan.png>` and `pnpm plan:ai <plan.png> [--save r.json] [--replay r.json]
  [--overlay out.png] [--model <id>]` are the tools for one real plan. `plan:ai` needs a key unless replaying;
  replay with the image to use its ink. `--overlay` draws the walls, separators, doors,
  windows and railings back onto the drawing through the solve's mapping — the quickest way to
  see a wall off the drawing's wall.

## Known gaps

- PDF plans: only the first page is rasterised; a multi-page set has to be split by hand.
  The plan *export* is one A4 page with the drawing on it as an image — no vector geometry,
  no selectable text, no furniture schedule, no second sheet.
- Floor-plan parsing has two paths: Claude reads the drawing when `ANTHROPIC_API_KEY` is set,
  and the deterministic CV parser takes over when it is not. The CV path cannot read
  dimensions, so it still asks the user for the total floor area.
- A plan whose doors are inferred can come with no front door: `deriveOpenings` places the
  windows before the front door, and an entry room whose outside walls have all taken a window
  has no wall left for it. The sample plan read the CV way is one — its living room's two
  outside walls both get a window, so the flat has three interior doors, an archway and no
  entrance (the drawing has one, in the bottom-left room's outer wall, which the CV path cannot
  see).
- A line of the grid carries one wall thickness. A drawing whose walls on one line differ —
  a thick plumbing wall behind a bathroom sharing its living-room face with a thin partition
  behind the bedroom — gets the line's median for both; widening one run moves the faces the
  printed dimensions are measured to, so it is not done.
- A double door is read as one door of a single leaf's width (the CAD plan's front door).
- Dimensions the model cannot parse (hand-lettered "55-14\"") leave the plan at the assumed
  scale of about 12 m across, with nothing to flag it.
- The ink helpers assume a light background and dark walls; walls drawn only as two thin
  outlines are found as thin bands, and their doorways are not snapped (`gapsAlong` needs a
  solid band). A photographed plan is read without deskewing on this path.
- Every opening keeps the default height and sill of its kind (a bathroom window is set high);
  the drawing says nothing about heights.
- A studio read from a plan has no line of its own and reads the default kitchen line
  (`effectiveSplit`), not the one the drawing shows.
- A read takes 20 s to 2 minutes at high effort (the upload card shows "reading" meanwhile) and
  costs $0.05–0.30; the `lowConfidence` flag and the model's `notes` are returned but the upload card
  shows neither yet.
