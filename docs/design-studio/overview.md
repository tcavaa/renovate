# Design studio: overview

The 3D design product (`/design`): one guided eight-step journey from a floor plan to a
furnished, priced flat built from real products, and the team to build it. This document is the
map of the studio — the steps, the modes, the pipeline, what state lives where — and points to
the detailed documents. Read it first for any task under `app/(main)/design/`, `lib/design/`,
`lib/design3d/` or `store/designStore.ts`.

| Detailed document | Covers |
|---|---|
| [plan-board.md](plan-board.md) | walls ⇄ rooms, studios (split rooms), the 2D board (`PlanEditor`), snapping, room moves, dimension chains, the plan PDF |
| [plan-reading.md](plan-reading.md) | uploading a plan: images and PDFs, the CV parser, the Claude reader + solver, door inference |
| [layout-and-matching.md](layout-and-matching.md) | archetypes and room programs, the automatic layout, matching products to slots, fit checks, tight passages |
| [studio.md](studio.md) | the build mode page (steps 5–6): trays, shelf, catalogue modal, carrying, dragging, direct manipulation, photos |
| [3d-engine.md](3d-engine.md) | `lib/design3d/` + `Viewer3D`: scene building, wall geometry, model loading, lighting, the Three.js gotchas |
| [finishes.md](finishes.md) | floor and wall finishes, the paint brush (strips and square metres), zones, skirting and cornices |
| [technical-and-fittings.md](technical-and-fittings.md) | technical points, sockets/switches/lights, radiators, doors and windows as products |
| [../budget.md](../budget.md) | the budget (step 7): `priceScene`, lines, ticks, baskets, kitchens, trades |
| [../project-flow.md](../project-flow.md) | the project around it: hubs, gate, autosave, resume, locks, the calculator → 3D handoff |

## The eight steps

| # | Path (`app/(main)/design/[id]/…`) | What | Main code |
|---|---|---|---|
| 1 | `start/` | upload a plan or start on a blank sheet; wall defaults; *design only* or *renovation + design* (and the home state); or an empty start | `PlanUploadCard`, `HomeStateSelector`, [project-flow.md §14](../project-flow.md) |
| 2 | `plan/` | the existing house on the 2D board: walls, rooms, doors, windows, columns, beams | `PlanWorkspace`, `ElementInspector`, `RoomsPanel` — [plan-board.md](plan-board.md) |
| 3 | `technical/` | technical points, what the flat already has, the works checklist, radiators | `lib/design/technical.ts`, `existing.ts`, `radiators.ts` — [technical-and-fittings.md](technical-and-fittings.md) |
| 4 | `style/` | the five-question style test (or a direct pick), budget, **generate** | `StyleQuiz`, `StylePicker`, `GenerationOverlay`, `designStore.generate` |
| 5 | `studio/` | the 3D studio in build mode: furniture, fittings, lights | [studio.md](studio.md) |
| 6 | `studio/?tool=finishes` | materials on rooms, single walls, strips, square metres, floor zones | [finishes.md](finishes.md) |
| 7 | `summary/` | the budget: materials + products + labour, a quantity on every line; checkout; plan PDF | [../budget.md](../budget.md), [../marketplace.md](../marketplace.md) |
| 8 | `workers/` | the trades the budget needs and the brigades that cover them; booking | `lib/design/trades.ts`, `BookingDialog` — [../marketplace.md](../marketplace.md) |

`app/(main)/design/page.tsx` is the hub (`ProjectHub`), `[id]/layout.tsx` the owner check →
`ProjectGate` + `DesignAutosave`, `[id]/page.tsx` the entry that resumes (and carries a
calculation in). The strip is `components/design/DesignSteps.tsx`; step URLs come from
`designStepHref` / `designEntryHref` in `lib/design/steps.ts`, never by hand.

## Where the state lives

- `store/designStore.ts` (zustand, persisted per project as `renovate-design:<id>`): the plan
  (`FloorPlan`: rooms, walls, columns, beams, technical), the scene (`DesignScene`: items,
  finishes, electrical, style profile, excluded/quantities), versions, undo history, progress
  (`step`, `at`, `generated`, `modeChosen`, …) and the carry state. The same factory makes the
  calculator's drawing board.
- Domain types are plain JSON in `lib/design/types.ts` and round-trip into `projects.plan` /
  `projects.scene` / `projects.versions` ([data-model.md](../data-model.md)).
- The catalogue is fetched once (`hooks/useDesignCatalog.ts` ← `GET /api/design/catalog`) and
  matched on the client.
- Saving: `lib/design/saveDesign.ts` → `POST /api/design/projects`, which reprices every product
  line from the catalogue ([project-flow.md §10](../project-flow.md)).

## The pipeline (`lib/design/` + `lib/design3d/`)

```
upload image or PDF (step 1) ─ plan-reading.md
  → parse-plan (Claude: aiPlan → planSolver)   or, without a key,
    planImage (File → RGBA ≤1100 px) → planParser (deskew, threshold, watershed, outlines)
  → planGeometry           polygons → metric FloorPlan; doors inferred (deriveOpenings)
  → walls.ts               wallsFromRooms / roomsFromWalls: walls are lines, rooms their faces
  → /design/<id>/plan      the board: confirm and edit walls, rooms, openings ─ plan-board.md
  → technical step         points, works, what the flat already has ─ technical-and-fittings.md
  → style step → generate  autoLayout (slots) → matcher (real products) ─ layout-and-matching.md
  → studio                 Viewer3D composes buildRoomShells + syncPlacedItems + buildElectrical
                           + buildRadiators (lib/design3d) ─ 3d-engine.md; manipulate.ts for
                           everything a person moves ─ studio.md
  → pricing.ts             priceScene → BudgetLine[] → baskets per store ─ ../budget.md
```

## The four styles

The ids are defined once in `lib/design/styles.ts` and referenced everywhere (DB tags, 3D
materials, UI); the names and blurbs are dictionary keys (`lib/i18n/ka.ts` and the others):

| id | ka | Palette signature |
|---|---|---|
| `modern` | თანამედროვე | matte white/graphite, chrome, glass, large-format tile |
| `scandinavian` | სკანდინავიური | light oak, off-white plaster, wool grey, soft pastel accents |
| `industrial` | ინდუსტრიული | exposed brick, black steel, cognac leather, concrete |
| `vintage` | ვინტაჟი | walnut, brass, deep velvet, patterned rug, rattan |

## Two modes

- `mode: 'design_only'` — the home is finished and only designed: the furniture and decor,
  every floor and wall the flat is shown in (the style's own products as much as chosen ones —
  a surface the person keeps is ticked off on the summary), delivery, and anything the person
  added (`origin: 'user'` sockets, doors, radiators…) are costed.
- `mode: 'full'` — also folds in bulk materials and labour from the existing calculator engine;
  the floors and walls are bought whatever the home state ([finishes.md](finishes.md),
  [../budget.md](../budget.md)).

## Two products, two boards (`store/designStore.ts`, `hooks/useCalculatorPlan.ts`)

The design store is a factory over its localStorage key, and every project has two instances
of it — the studio's (`useDesignStore`) and the calculator's drawing board
(`useCalculatorPlanStore`); a drawing crosses between them only when the person asks. See
"Two boards" in `docs/project-flow.md`.

## The order of the eight steps depends on the home (`lib/design/steps.ts`)

A green frame — or a design-only project, or one whose home state is not chosen yet — is a
home that is finished: its technical step *records* what is already there, so it stays third,
right after the flat is drawn (`technicalComesFirst`). Every
other condition is a renovation, where the pipes, radiators and wiring follow the furniture:
there the technical step comes **after** the design, sixth, next to the budget it feeds (the
walking order is `1, 2, 4, 5, 6, 3, 7, 8`).
The step *numbers* never change (3 is always the technical step); what changes is the
position it is walked in. `designStepOrder` / `designStepPosition` / `nextStep` /
`previousStep` own it, `DesignSteps` renders the strip from it, and every page's `StepNav`
and `StepHeader` read their position and their neighbours from it rather than hard-coding a
number. `StageBrief` keys on the step, not the position.

## Step 1: the ways in (`app/(main)/design/[id]/start/page.tsx`)

**Step 1 asks before it assumes.** Nothing leaves the page until the one continue button at the
bottom. The plan is either an upload or a blank sheet (`planMode` `'upload' | 'scratch'`); a
blank plan is created on continue and the rooms are drawn on step 2. An uploaded plan waits in
page state: `PlanUploadCard` with `showContinue={false}` hands it over at once when Claude read
it, and on the CV fallback as soon as the entered area is valid, taking it back through `onReset`
when it is not (the calculator's step 1 uses the card the same way). A plan that came from a PDF
was rasterised first ([plan-reading.md](plan-reading.md)).

- **What do you need** is not preselected: *design only* or *renovation + design* (which reveals
  the home states, old renovation first) — `designStore.modeChosen`; the continue button refuses
  with a message until a plan and a mode exist. Each card lists what it covers
  (`modeDesignOnlyCovers` / `modeFullCovers`), and a chosen home state shows three columns —
  what is standing, what the estimate charges for, **what happens to the technical points** (a
  green frame records its sockets and pipes rather than pricing them). Keep that third column
  truthful if the phase gating changes.
- **The third card is an empty start** (`emptyStart`, `chooseEmptyStart`, `startEmpty`): the
  studio on the flat as drawn with every room empty — no layout, no furniture, the style's
  ordinary finishes, no style test, no technical step. Priced as `design_only`; `startEmpty` is
  the hinge like `generate` (`generated`, step 5, no versions, an empty history), and version 01
  is the empty flat. With rooms to open on, step 1 goes straight to the studio; a blank sheet is
  drawn on step 2 first.
- `?way=upload|draw` from a hub tile applies only while the project has no drawing.


## What the flat already has (`lib/design/existing.ts`)

A green frame is wired, plumbed, heated and has its doors, and pricing it from the scene charged
for all of it — the scene describes the whole flat and cannot know what was already
standing. So the technical step asks, with ten ticks (`EXISTING_KEYS`: floor, wall, ceiling,
trim, openings, electrical, lighting, plumbing, heating, climate) stored on the plan as
`plan.technical.existing`. A green frame starts with openings, electrical, plumbing and
heating ticked (the team's definition: it still needs its paint, tiles, floors and ceiling),
everything else with nothing. `priceScene` leaves each ticked one out of the lines, the
baskets and the totals, and drops the phase that would redo it; the checklist shows for any `mode: 'full'` project,
because the person always knows better than the phase defaults.

## The style test

Five questions × four answers (`lib/design/styleQuiz.ts`, `components/design/StyleQuiz.tsx`),
each weighted towards a style; a tie goes to the strong lean of the first question answered —
the palette question, when it was answered. The result is `scene.styleProfile`; picking a plate
directly (`StylePicker`) marks `direct`.

## Generation, versions and undo

The store records a snapshot (plan, items, finishes, electrical) before every change
(`commit`), so Ctrl+Z / Ctrl+Y walk `lib/design/history.ts`.

**Generating is the journey's hinge, not an undoable edit.** `generate` (called by the style
step) does not go through `commit`: it clears `versions` and the history itself and sets
`generated`. One Ctrl+Z in the
studio used to undo the whole layout and leave every room bare — and, coming from the
calculator, carry on into the walls drawn there, because `startFromCalculator` kept the
versions of whatever was in the studio before and the baseline only ran when none existed.
The new layout becomes version 01, with its furniture, when the studio next opens (below).
Generation also lays every room's floor and walls in the style's own partner products (tiles in
the bathrooms, the style's laminate and paint elsewhere — `styleFinish`), keeping the finishes
somebody chose, so the budget buys what the flat is shown in ([finishes.md](finishes.md)).

**The studio's baseline is where undo stops.** `ensureExistingVersion` is called whenever the
studio mounts (and when the room count changes) and does something only while no baseline
version exists — in effect once per layout: version 01 is the flat as the studio found it, *with* the
furniture, and the undo history starts there. Taken when step 2 was left, as it used to be, it
was an empty flat, so restoring it emptied the rooms. The working state is the implicit
"modified house", `saveVersion` keeps a named one, `restoreVersion` keeps the present first,
and "empty the rooms" (`clearDesign`, `build.emptyRooms`, behind a dialogue of ours) takes out
the furniture, fittings and chosen finishes while the flat and version 01 stay. Versions are persisted locally and in `projects.versions`.

## AI is optional, and only at the plan

**The scene is built procedurally from structured data** — deterministic, free per view, the
same result every time, fully interactive. That was the core recommendation in
`AI_FEATURE_PLAN.md` and it is what shipped. The one place an AI is called is reading an
uploaded plan: Claude reads it when `ANTHROPIC_API_KEY` is set, and the deterministic CV parser
(`parseFloorPlan`) takes over when it is not ([plan-reading.md](plan-reading.md)). An LLM
product ranker remains a possible addition at `matchProducts`. The app works fully without any
API key and must keep doing so.

## Tests

`tests/unit/design/styleQuiz.test.ts`, `history.test.ts`, `fromCalculator.test.ts` (the
calculator's picks landing on their surfaces), `budget.test.ts` (what the flat already has),
`tests/unit/store/designStore.test.ts` (the empty start, carry, swap, paint),
`e2e/design-studio.spec.ts`. Nothing tests `designStepOrder` / `nextStep`, `generate` clearing
the versions and history, or `ensureExistingVersion` / `restoreVersion`.

## Known gaps

- What a flat "already has" is ten ticks, not a survey: ticking "sockets" excludes every
  socket in the flat, not the three that are actually there. On the budget a placed piece is
  ticked on its own, but a line the budget folds per product — a finish over every room it is
  on, the doors of one model, the sockets of one model, the radiators of one design — is in or
  out as a whole.
