# Reading an uploaded floor plan

How an uploaded image or PDF becomes rooms: the browser-side CV parser, the optional Claude
reader with its least-squares solver, and how doors are placed when the reader cannot see them.
Read this before touching anything that turns a picture into a `FloorPlan`.

Related: [overview.md](overview.md) · [plan-board.md](plan-board.md) (what happens to the rooms
next: `wallsFromRooms`) · [../calculator.md](../calculator.md) (the calculator's step 1 uses the
same upload card).

## Key files

| File | Responsibility |
|---|---|
| `components/design/PlanUploadCard.tsx` | the upload card used by both products' step 1: file → upload → read (Claude, else CV) → confirm scale/area |
| `app/api/design/upload-plan/route.ts` | stores the uploaded image (open to signed-in and guest callers; 12 MB, bytes sniffed, never the declared type, GIF refused; `RATE_RULES.uploadPlan`) |
| `app/api/design/parse-plan/route.ts` | the Claude reader (`readPlanWithClaudeDetailed`, model `PLAN_MODEL`): reads only stored plan keys or the bundled sample, downsizes with `sharp` to what the vision API accepts; answers 503 with `fallback: 'cv'` when no `ANTHROPIC_API_KEY` is configured; `RATE_RULES.parsePlan` |
| `lib/design/planPdf.ts` | browser: page 1 of a PDF rasterised through pdf.js to a PNG `File` |
| `lib/design/planImage.ts` | browser: `File` → RGBA at ≤ 1100 px — the only part of the CV path that touches the DOM |
| `lib/design/planParser.ts` | the deterministic CV parser: raster in, room polygons out |
| `lib/design/aiPlan.ts` | the prompt and the parsing of Claude's reading into rooms, labels and adjacency |
| `lib/design/measure.ts` | reading printed dimension strings |
| `lib/design/planSolver.ts` | grid lines + printed dimensions → exact wall positions (least squares) |
| `lib/design/planGeometry.ts` | pixel regions → metric `FloorPlan`; edges, normals, `deriveOpenings` |
| `lib/validations/plan.schema.ts` | the parse-plan payload |
| `scripts/test-plan-parser.ts`, `scripts/test-plan-solver.ts`, `scripts/diagnose-plan.ts`, `scripts/read-plan-ai.ts` | `pnpm test:parser`, `test:solver`, `plan:diagnose`, `plan:ai` |

## Flow

```
file (image or PDF) ─ planPdf (PDF → PNG, page 1) ─▶ POST /api/design/upload-plan → stored URL
   ├─ POST /api/design/parse-plan  (Claude: names, types, rough boxes, printed dimensions)
   │     → aiPlan → measure → planSolver (exact walls) → FloorPlan (lowConfidence flags)
   └─ 503 fallback:'cv' → planImage (RGBA ≤1100 px) → planParser (rooms as pixel polygons)
         → the person confirms the total area/scale → planGeometry → FloorPlan
FloorPlan → wallsFromRooms (plan-board.md) → the board on step 2
```

A PDF is rasterised first, so the upload route, the Claude reader and the CV parser only ever
see images. pdf.js's worker is served from `public/vendor/pdf.worker.min.mjs` because the CSP
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

## Reading a plan with Claude (`aiPlan.ts` + `planSolver.ts` + `measure.ts`)

The CV parser reads *ink*, and a real estate agent's plan is mostly ink that is not a wall:
sofas, beds, kitchen counters, dimension arrows, room labels. On a sample 1-bedroom estate
agent's plan (not in the repo — `public/uploads/plans` is git-ignored; its room boxes are
encoded in `scripts/test-plan-solver.ts`) it returned two regions — a 364×312 blob and a sliver — losing the
bedroom, bathroom and balcony entirely. Annotation lines that run to the image edge also let
interior space leak into the exterior region, which is then discarded as "outside". No
threshold tuning fixes that; the plan has to be read, not measured.

**The division of labour is the whole design.** Claude is asked for what it is good at — room
names, types, roughly where each sits, what the dimension labels *say*, what connects to what
— and explicitly *not* for coordinates, which vision models return a few percent out with
nothing downstream able to tell. Then `planSolver` reconciles:

1. Room edges snap onto shared grid lines, so neighbours agree on the wall between them.
2. Those lines become the unknowns of a least-squares problem: each printed dimension is a
   strong constraint, each line's observed position a weak one.
3. Solving gives the wall positions that best satisfy every printed dimension at once.

That is what makes it exact. On that sample plan the solved walls land within about **4.4 cm**
of the printed dimensions (the test asserts under 8 cm) — and that residual is the *drawing's* inconsistency, not the solver's: the
bathroom (1.88 m) and hallway (1.73 m) sit above a bedroom labelled 3.73 m, but 1.88 + 1.73 =
3.61. The labels are measured to different wall faces. Least squares spreads the 13 cm rather
than letting the last constraint win, and sets `lowConfidence` when it is large.

Two axes need **two scales** — boxes are normalised against image width for x and height for
y, and drawings are rarely square. Sharing one scale stretches an axis by the aspect ratio and
then every dimension on it looks like a misread.

`pnpm test:solver` covers all of this without an API key, which is the point: the half that
has to be right is testable before a single token is spent.

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
room > kitchen. The AI path starts from this inference too (`aiPlan.ts` runs `deriveOpenings`)
and then replaces each room's openings with the ones read off the drawing
(`applyReadOpenings`); a room with none read keeps the inferred ones, and a read opening more
than 1.2 m from a wall is dropped.

## Tests

- `pnpm test:parser` (`scripts/test-plan-parser.ts`) — synthetic plans (a five-room flat, a
  corridor flat with a small bathroom, an L-shaped studio, a "photographed" plan with skew,
  uneven light and clutter) through the whole CV parser: room counts, total area, L-shapes.
  Run it after touching `planParser.ts`. It runs in CI.
- `pnpm test:solver` (`scripts/test-plan-solver.ts`) — dimension labels and the solver, no API
  key. Runs in CI.
- `tests/unit/design/aiPlan.test.ts` — `normaliseReading`, `buildPlanFromReading`.
- `pnpm plan:diagnose <plan.png>` and `pnpm plan:ai <plan.png> [--save r.json | --replay r.json]`
  are the tools for one real plan (the second needs a key unless replaying).

## Known gaps

- PDF plans: only the first page is rasterised; a multi-page set has to be split by hand.
  The plan *export* is one A4 page with the drawing on it as an image — no vector geometry,
  no selectable text, no furniture schedule, no second sheet.
- Floor-plan parsing has two paths: Claude reads the drawing when `ANTHROPIC_API_KEY` is set,
  and the deterministic CV parser takes over when it is not. The CV path cannot read
  dimensions, so it still asks the user for the total floor area.
- The AI path has not yet met a real plan with a real key. Everything around the call is
  done — `pnpm plan:ai <file>` runs one drawing through the reader and prints the reading,
  the parsed labels, the solved walls and the residuals; `--save reading.json` keeps the raw
  reading and `--replay reading.json` rebuilds the plan from it without a key, which is how
  to tune the solver deterministically. The route downsizes images to what the vision API
  accepts (5 MB, ~1568 px) with `sharp`, logs tokens and duration per read, and rooms whose
  printed dimension the solver could not honour come back `lowConfidence` so the review step
  points at them. First contact will most likely want prompt and label-parsing tuning.
