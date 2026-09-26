# Projects: from the hub to the summary

How a person makes a project, works in it, leaves and comes back — for both products, the
calculator and the 3D design studio — and how the two halves of one project stay one project.
Read this before touching anything under `lib/flow/`, `store/projectScope.ts`, the hubs,
`components/projects/ProjectGate.tsx`, the save routes or the step URLs.

Written after the "projects first" rework of September 2026 (named projects, per-project
stores, revisions; then no "start over", no placement step, a floor and a wall per room).
Listed in the index in `CLAUDE.md`; the calculator's own steps are [calculator.md](calculator.md),
the design's are [design-studio/overview.md](design-studio/overview.md).

---

## 1. The shape of it

```
header "გამომთვლელი" / "დიზაინი"
  → hub  /calculator · /design            what it does, how to draw a plan, new-project tiles,
                                           the person's projects (public; guests see how to sign in)
  → "new project" (named in a dialogue)
      POST /api/projects/create { name, journey }  → the row exists before any step
  → entry  /calculator/<id> · /design/<id>  opens the project where it was left (lib/flow/resume)
  → steps  /calculator/<id>/{start,plan,materials,catalog,furniture,summary}
           /design/<id>/{start,plan,technical,style,studio,summary,workers}
      every change autosaved into the same row, per half, with a revision
  → the other product: "see it in 3D" / "open in the calculator" — the same row, the other half
```

Nothing in either product opens without a project, and every project is a named row made on
purpose. That replaced the old model — two journeys living in fixed localStorage keys, saved
into rows only when somebody pressed "save", and a project opened from the profile overwriting
whatever was in the browser — which is the one thing this whole design exists to prevent: **no
action anywhere can write one project's work over another's.**

## 2. Words used below

| Word | Meaning |
|---|---|
| **project** | one `projects` row, owned by one user, named by them |
| **half** | the calculation or the 3D design of a project (`ProjectHalf = 'calculator' \| 'design'`); a project can have either or both |
| **journey** | which product's steps are open (`/calculator/<id>/…` or `/design/<id>/…`) |
| **step** | how far a journey got (`step`) — drives the strip and the locks; only moves forward |
| **at** | the page that was open last — what the project reopens on |
| **hinge** | the act that shuts the steps before it: "გამოთვლის დაწყება" (`calculated`) in the calculator, the generation or an empty start (`generated`) in the studio |
| **entry** | `/calculator/<id>`, `/design/<id>`: works out where to open and redirects there |
| **revision** | `calculator_rev` / `design_rev` on the row, one per half, +1 per write |
| **base revision** | `baseRev` in a store: the row revision that copy was made from |
| **dirty** | this browser holds changes to a half that the server has not confirmed |

## 3. Routes, sign-in and the proxy

- **The hubs** (`app/(main)/calculator/page.tsx`, `app/(main)/design/page.tsx`) are public. A
  guest sees the explanation, how the product works and "sign in / create an account"; no tiles,
  no projects.
- **The steps are signed in only.** `auth.config.ts` gates `/^\/(calculator|design)\/\d+(\/|$)/`
  (numeric ids only), and `proxy.ts` matches `/calculator/:path+` and `/design/:path+` — one
  segment or more, never the hubs themselves.
- **The server layout checks the owner** (`app/(main)/<journey>/[id]/layout.tsx` →
  `loadProjectForSteps` in `lib/projects/loadForSteps.ts`): a non-numeric id goes to the hub,
  nobody signed in goes to `/login?callbackUrl=…`, somebody else's project or one that is gone is
  a 404. The calculator journey never receives the design's versions (they can be megabytes).
- **Old URLs.** A step URL from before projects (`/calculator/plan`, `/design/studio`) is sent to
  the hub by the proxy with a real 307. `/calculator/<id>/placement` (the step that went into the
  catalogue — [calculator.md](calculator.md#the-six-steps)) is sent to `/calculator/<id>/catalog`.
- **Step URLs are never written by hand**: `calculatorStepHref(id, step)` /
  `calculatorEntryHref(id)` (`lib/calculator/steps.ts`), `designStepHref(id, step)` /
  `designEntryHref(id, from?)` (`lib/design/steps.ts`). `calculatorStepFromPath` /
  `designStepFromPath` read a URL back into a step.
- Checkout and brigade bookings require the project's owner too (`app/api/checkout`,
  `app/api/bookings`).

## 4. The hubs (`components/projects/hub/`)

`ProjectHub` is one server component for both products (`journey` prop). From the top:

1. **What it does** — the introduction.
2. `LegacyWorkNotice` — old work from before projects, offered to be kept (§16).
3. **Tiles** (`HubTiles`, client). Calculator: *draw the plan* (`?way=draw`), *upload a plan*
   (`?way=upload`), *from a 3D design*. Design: *upload a plan*, *blank sheet*, *from a
   calculation*. The first two of each ask for a name, create the row and open step 1 on that
   way in (`?way=` preselects it only when the project has no drawing yet). The third lists the
   person's projects that have the *other* half and not this one yet (calculator hub: a design
   with rooms and no calculation; design hub: a calculation that is started and ready, with no
   design) and opens this product's half of one.
4. **The person's projects** as a grid of cards, most recently changed first
   (`lib/projects/hub.ts`: `updatedAt desc, id desc`; a small serialisable `HubProject`, the scene
   read for its progress only, versions never). A card: a `PlanSketch` thumbnail
   (`labels={false}`), the name, the status, where it stands (`whereItStands`: "not calculated
   yet · step n of 6 · <label>", "not generated yet · step n of 8 · <label>" with n the walking
   position, "not calculated yet" alone for a design-first project in the calculator hub, or the
   figure) and a "…" menu (`ProjectCardMenu`): open, rename, carry into the other product, the
   project page, delete (hidden for an ordered project).
5. **How it works** (`HubGuide`) — the steps in a sentence each (`hub.calculatorSteps`, six;
   `hub.designSteps`, eight) and how to draw a plan the calculator can count on.
6. `HubCachePrune` (renders nothing) — drops this browser's caches of projects that no longer
   exist (§9).

**Which hub lists a project** is the same predicate everywhere (`projectKind`,
`lib/projects/saved.ts`): a calculation is `selectedProducts IS NOT NULL OR mode = 'full'`, a
design is `plan IS NOT NULL`. A project with both halves is in both hubs, with both tags
(`ProjectKindTags`).

## 5. Making a project

`POST /api/projects/create { name, journey }` (signed in; `RATE_RULES.createProject`, 30 an hour)
answers 201 `{ id }`:

- **a calculation**: `homeState` NULL, `selectedProducts {}`, `calculatorEdits.progress
  { step: 1, calculated: false, at: 1, steps: 6 }`, `mode: 'full'`;
- **a design**: `mode: 'design_only'`, `plan: emptyPlan()` (a blank sheet — `plan IS NOT NULL` is
  what lists it in the design hub from the start), `scene: emptyScene()` (step 1, the mode not yet
  chosen).

The name is the person's (`nameKa`), changed only by `PATCH /api/projects/[id]` (rename) — never
by a save. **Saves never insert**: a save writes into the caller's own row or answers 401 / 404.

## 6. The row, as the flow uses it

| Column | What it holds for the flow |
|---|---|
| `nameKa` | the project's name |
| `status` | `draft` (in progress) · `saved` (the summary's "save", or the checkout) · `submitted` (ordered) |
| `homeState` | NULL until step 1 is answered (migration 0011) |
| `rooms`, `totalM2` | the calculation's rooms (the design's, in a project designed first) |
| `selectedProducts`, `selectedFurniture` | the calculation's picks |
| `calculatorEdits` | `{ excluded, quantities, choices, progress }` — progress `{ step, calculated, at, steps: 6 }` |
| `calculatorBoard` | `{ plan, floorPlanUrl, finishes }` — the calculator's own drawing (migration 0011) |
| `calculatorRev`, `calculatorSaveId` | the calculation's revision and its last save's id (0012, 0013) |
| `plan`, `scene`, `versions`, `mode`, `styleId` | the design; `scene.progress` `{ step, generated, planFromCalculator, at, modeChosen, emptyStart }` |
| `designRev`, `designSaveId` | the design's revision and its last save's id |

`projectKind(row)` also reads whether a half is **pending** (`calculatorPending`,
`designPending`: autosaved before its hinge). A pending half has no totals: the save routes store
none for it, the project page shows a note instead of its sheet, the hubs and the profile say
"not calculated / generated yet", and the checkout, the order button and a brigade booking
leave it out.

**Progress from before this was recorded** is read by `calculatorProgress` / `designProgress`: a
saved or ordered project was finished; a draft counts as calculated only when products were
picked, and as generated only when furnished. **Calculator progress recorded before 26
September 2026 is in seven steps** (it had a placement step): it has no `steps: 6`, and
`calculatorProgress` maps it with `fromSevenSteps` ([calculator.md](calculator.md#the-six-steps)).

## 7. Opening a project (`ProjectGate`)

The server layout hands the owner's row (`savedProjectInput`, `lib/projects/saved.ts`) to
`ProjectGate` (client; nothing under it renders until it is done):

1. **`claimBrowser(userId)`** (`lib/flow/owner.ts`): another account's caches are wiped
   (`forgetAllProjects`, the legacy keys too — a previous owner of `'guest'` keeps them); then
   the old keys are migrated (§16; it runs on every claim and is idempotent).
   `releaseBrowser()` — signing out — forgets nothing. `components/providers/StoreOwnerGuard.tsx`
   (mounted in the root layout) claims or releases the browser on every session change.
2. **`openProjectStores(journey, project)`** (`lib/flow/openProject.ts`):
   - the calculator journey loads **the calculation only** — it never opens the design's store.
     What its summary says about the design, and orders of it, it reads off the row
     (`useProjectMeta().snapshot`), so a design being edited in another tab is never written over
     by a calculator merely looking at it;
   - the design journey loads **the calculation first** (when the calculator has written its
     half — `calculatorStarted`; the handoff and the budget's order read it), **then the
     design**, then — when the studio has a plan — makes the design's home state the
     calculation's (the calculation owns it, §15).
3. **`useActiveProject.getState().setId(id)`** — the hooks now reach this project's stores (§8).
4. **`pruneCaches(id)`** — trims the clean caches beyond the four used last (§9).

It then provides `useProjectId()`, `useProjectMeta()` (`{ id, name, status, journey, setStatus,
snapshot }`) and `useOptionalProjectMeta()`, mounts `StepRecorder` (records `at` from the URL on
every page — the calculator's step, the design's step with `?tool=finishes` as 6) and
`SaveProblemBanner` (§10).

### The loaders

**`loadCalculatorHalf(project)`**

- **From the cache** when the calculation is this project's own (`calculatorStarted`, or this
  browser has unsaved changes to it), the cache is current (`cacheIsCurrent`, §9) and both the
  calculator store and the board store carry this project's id. The picks are normalised
  (below) and, if that changed anything, the half is marked dirty.
- **Otherwise from the row**:
  - `openSavedProject` with the rooms, home state, picks, edits and progress;
  - the board from `calculatorBoard`. If the row has no board but this browser has a drawing
    of the same rooms (a calculation from before the board was saved), that drawing is kept
    and marked to be written (the *rescue*). Otherwise the design's plan is used if it has
    rooms, or the plan step rebuilds rectangles from the rooms;
  - a project designed first: the plan's rooms, the studio's products as picks
    (`picksFromScene`, per room), the home state only for a renovation with rooms (it then
    opens calculated, on step 3), otherwise step 1. Opening it writes nothing;
  - `baseRev` = the row's revision, the sync line clean. The picks are then normalised and
    written back once when they came from before (the calculation's own only).
- **Normalising the picks** (`normalizeFinishPicks`): `migrateFinishPicks` (old cart and
  whole-flat finishes onto the rooms, §13), then `withRoomFinishQuantities` (every room's
  floor and walls counted from the room).

**`loadDesignHalf(project)`** — from the cache under the same rule (dirty, or `baseRev` at
`designRev`, and the store's `projectId` is this one), else `openSaved(row)` (plan, scene,
versions, progress: `at`, `modeChosen ?? true`, `emptyStart ?? false`) and `baseRev` =
`designRev`. A design carried in from the calculation gets its `calculatorPicks` read off the
calculation again on either path — they are cached in the browser's design store but never
saved to the row, and the calculation may have changed since the copy was made.

## 8. One set of stores per project (`store/projectScope.ts`)

`useCalculatorStore`, `useCalculatorPlanStore` (the calculator's drawing board) and
`useDesignStore` are each made by `projectScopedStore(prefix, make)`: **one zustand store per
project id**, persisted to its own localStorage key — `renovate-calculator:<id>`,
`renovate-calculator-plan:<id>`, `renovate-design:<id>`.

- The hooks and `getState()` reach the **open** project's (`useActiveProject`, set by the
  gate). `.for(id)` addresses one by id; `peek`, `drop`, `storageKey(id)`, `cachedIds()`.
- **Anything that can run late addresses by id**: the save helpers capture the store instances
  before they queue, the loaders and the autosave use `.for(id)`. So a save finishing after the
  person moved to another project writes into the right one.
- Outside a project (the hubs, the profile, tests) the hooks reach an in-memory store that
  nothing persists.
- Persisted with each store's content: `projectId`, `baseRev`, `pendingSaveId`, `at`; the
  calculator's `step` (the calculator store is at persist version 4 — the seven-to-six migration,
  [calculator.md](calculator.md)); the design and board stores (version 2) also keep `step`,
  `generated`, `planFromCalculator`, `calculatorPicks` and `pendingPicks`.

**Two boards.** The design store is a factory over its storage key, so every project has two
instances of it: `useDesignStore` (the studio) and `useCalculatorPlanStore` (the calculator's
drawing board). They once shared one plan and one key, so starting a flat in either product
found the other one waiting. `PlanWorkspace` takes a `store` prop (the studio's by default); the
calculator hands in its own, and `useCalculatorPlan` reconciles *that* board with the
calculator's rooms (`reconcileCalculatorPlan`, in one step from one snapshot of both). A drawing
crosses between the two only when the person asks: "see it in 3D" carries the board into the
design (`handOffToDesign`), and opening a design-first project in the calculator puts the
design's plan — the plan alone, none of its furniture or finishes — on the board
(`loadCalculatorHalf`).

## 9. The browser's copy and the server's (`lib/flow/projectSync.ts`, `lib/flow/storage.ts`)

**The server is the truth; the browser's cache is the safety net.** Each half has a line
`renovate-sync:<half>:<id>` = `{ dirty, usedAt }` — nothing else:

- `markDirty` the moment there is something to write; `markClean` when a save of exactly that
  content is confirmed; `touch` on every open; every write of a line counts as a use.
- **`cacheIsCurrent(half, id, cachedRev, serverRev)`**: a dirty cache always wins (it is work the
  server does not have); a clean one only while its `baseRev >= serverRev`. A copy that names
  no revision is never current.
- **The base revision lives in the store, beside the content**, not in the line. The first
  version kept it in the line, which every tab shares: one tab's save lent its revision to
  another tab's older copy, which then passed the server's check and wrote over newer work.

**Keeping the cache small.**

- `safeLocalStorage` evicts the clean caches used longest ago when a write hits the quota. It
  never evicts a dirty one, nor the project being written. If the write still does not fit,
  it drops the stale key rather than leave an older copy under a key that claims to be current.
- `pruneCaches(openId, knownIds?)`: the gate calls it with the open project only, which trims
  the clean caches beyond the four used last (never the open one or a dirty one);
  `HubCachePrune` passes the hub's full list, which also drops the caches of projects that are
  gone — unsaved work included, since the row it belonged to no longer exists.
- **It never drops an id above the newest listed**: a hub restored by Back holds a list older
  than a project made since.
- `forgetProject(id)` removes a project whole (`DeleteProjectButton`).

## 10. Saving

### Autosave (`hooks/useAutosave.ts`)

`CalculatorAutosave` and `DesignAutosave` are mounted inside the gate with the project id.

- **What it watches.** The signature is the whole payload: the calculator's board and picks,
  ticks, quantities, the design's version names, step 1's answers, `at`.
- **When it writes.** 2.5 s after the last change, one write at a time, never the same
  signature twice. A signature that returns to the last saved one marks the half clean.
- **Dirty first.** The half is marked dirty as soon as the signature changes, before the
  sign-in check. A reload, a closed tab, a failed save or an outage then opens on this
  browser's copy and writes it.
- **Leaving.** Unmount, `pagehide` and `visibilitychange` flush what is waiting (best effort).
- **Opening is not editing.** The first settled signature after a load is taken as saved, but
  only when nobody has touched the page since (a module-level `pointerdown` / `keydown` /
  `drop` listener) and the half is not dirty. Re-derivation on the way in is therefore not
  written back. An edit in the first seconds is, and so is a calculation carried into 3D (it
  marks itself dirty).
- **Stops.** Nothing is saved for a project that is gone. Autosaves have their own rate bucket
  (`RATE_RULES.autosave`, 400 an hour).

### The save helpers and the queue (`lib/calculator/saveProject.ts`, `lib/design/saveDesign.ts`, `lib/flow/saveQueue.ts`)

**Sending.**
- `enqueueSave` sends one save at a time per half.
- Each save carries `baseRev` (the store's), a fresh `saveId` (`newSaveId`), and `prevSaveId`
  (the store's `pendingSaveId`: a save sent whose answer has not arrived) and `force`.
- The calculator sends its board: the plan, `floorPlanUrl`, and each room in its chosen floor
  and walls (`boardFinishesFromPicks`). It also sends `progress` with `steps: 6`.

**Answers.**
- **Success** returns `{ id, rev }`: `baseRev = rev`, `pendingSaveId = null`, no problem, and
  the half is marked clean if the store did not change while the write was on its way.
- **409 `PROJECT_CHANGED`** becomes `ProjectChangedError`, raised as the *conflict* problem.
- **Other problems** (`useSaveProblems`, shown by `SaveProblemBanner`): `error` (retry),
  `unknown-product` (a product the catalogue no longer has), and `gone` (the row was deleted:
  `PROJECT_NOT_FOUND` / `no-project`; nothing more is saved, and the banner links to the hub).

**The conflict banner.**
- *Load the latest* reads the row again. The browser's copy is dropped for it; nothing is
  written.
- *Keep mine* saves with `force`.

**What sets the status.** The summary's "save" and the checkout save with `draft: false`, which
turns a draft into `saved` and never touches `submitted`. A photo and a brigade booking save
first too.

### The save routes (`POST /api/projects` — the calculation, `POST /api/design/projects` — the design)

**Checks, in order.**
1. The rate limit (`RATE_RULES.autosave` for drafts, `RATE_RULES.saveProject` otherwise), then
   the body's schema (400; the calculator's refuses a calculated save with no home state or no
   rooms — `lib/validations/calculatorSave.schema.ts`; the design's is
   `lib/validations/design.schema.ts`).
2. Signed in (401), the caller's own project (404).
3. **The conflict rule** (only when the body carries a `baseRev`). The save is refused with 409 when `!force`, `baseRev < row rev`, and it
   is not *this browser's own unconfirmed write*. It is its own when `prevSaveId === row's save
   id` and `baseRev === row rev − 1` — exactly one write since this copy, and it was this
   copy's save whose answer never arrived.

**What each route writes.**
- **The calculation**, while pending, gets no pricing and no totals.
- **The design** is repriced from the catalogue first (furniture per slot, finishes per m²,
  doors, fittings, radiators). A product the catalogue does not know refuses the save.
- **Column ownership** (§15).

**The write itself.**
- One `UPDATE … SET rev = rev + 1, save_id = saveId WHERE id AND rev = <the revision read>`.
  Forced saves use the same condition, so two saves racing each other cannot interleave; zero
  affected rows is a 409.
- The answer carries `rev: <read> + 1`, never a re-read that could pick up somebody else's
  later write.

### Renaming, deleting, the profile

- `PATCH /api/projects/[id]` renames (`renameProjectSchema`).
- `DELETE /api/projects/[id]` (the owner, or admin) removes the row and its renders' files. An
  ordered project is refused (`PROJECT_HAS_ORDERS`) unless admin deletes it.
  `DeleteProjectButton` also forgets the browser's caches of it.
- The profile, the project page (`ProjectDetail`) and the hubs open a project with plain links
  to its entry. `OpenIn3dButton` and `CalculateCostsButton` are links now, not store operations.
- `GET /api/projects`, `GET /api/projects/[id]` and `GET /api/design/projects` read projects
  back (the caller's own).

### The project page (`components/projects/ProjectDetail.tsx`, `FoldSection.tsx`)

`/profile/projects/[id]` and `/admin/projects/[id]` share `ProjectDetail`: the title on its
own line with the action buttons under it (side by side, the buttons squeezed the name into a
column of words), then the blocks in a fixed order — layout · rooms, the calculator's sheet,
the 3D design's budget (each the read-only `BudgetSheet` of that journey as it was left, with
every edit showing what was there before it — `loadProjectSheets`; a renovation designed first
has no calculator sheet of its own, its materials and labour are the design's), photos &
renders (the `renders` slot), orders (the `orders` slot), and last the breakdown. Each block is
a `FoldSection` (client; the title row toggles, + / − in the corner, open by default): the
layout is always open, a sheet with no lines is not rendered, the design's sheet starts folded
when there is a calculator sheet above it, and the renders and orders fold when empty.
`ProjectRenders` and `ProjectOrders` render their own `FoldSection`, so a page passes them in
whole. `PlanSketch` draws a saved layout as static SVG — the plan's outlines when there are any,
otherwise the rooms at their `x`/`z` (`labels={false}` for the hub cards' thumbnails).

## 11. Where a project opens (`lib/flow/resume.ts`, pure, `tests/unit/flow/resume.test.ts`)

The entry pages (`app/(main)/<journey>/[id]/page.tsx`) redirect to the step the project reopens
on: **the page last open (`at`) when it can still be shown**, else the nearest one that can,
looking back before forward in the project's own order.

- **`calculatorResumeStep`** — no home state yet: step 1. Not calculated: the way in and the plan
  only (the plan when there is a board). Calculated: steps 1–2 are shut, so 3 at least, and never
  beyond how far the journey got (`step`).
- **`designResumeStep`** — works in the design's walking order (`designStepOrder`: a renovation
  walks `1, 2, 4, 5, 6, 3, 7, 8`; a green frame, a design-only project or one with no home state
  yet walks `1…8`). Generated (with rooms): the studio or
  after. Not generated: never the studio or past it; nothing after step 1 before step 1 is
  answered (`modeChosen`); a flat drawn in the calculator has 1–2 shut; the technical step and
  the style test need rooms. A flat laid out and then emptied of every room counts as not laid
  out. `at` is trusted (the design records `step` only on its "next" buttons, so a flat left
  half drawn has `step` 1 and `at` 2).

The design entry also carries a calculation in first when it has to (§15). **`step` only moves
forward** — `StepIndicator` records a step only when the page really has it to show and only when
it is further on; the design records on its "next" buttons. `at` is where the person *was*.

## 12. Locks, and why there is no "start over"

- **Calculator.** "გამოთვლის დაწყება" on the plan step sets `calculated`, which shuts steps 1–2
  (padlocks in the strip — `StepStrip.lockedBefore`, tooltip `flow.lockedStepCalculator` — and
  `CalculatorFlowGuard` sends a typed URL onward). Redrawing the rooms or changing the home state
  would pull the ground out from under every quantity and pick made since.
- **Design.** Once `generated` (and the flat has rooms), every step before the studio is shut; in
  the renovation order the technical step comes after the studio and stays open. A flat drawn
  in the calculator (`planFromCalculator`) has its steps 1–2 shut (`flow.lockedStepPlan`).
  Nothing after step 1 opens before step 1 is answered, and once the flat has rooms and the
  journey is past step 1, `DesignFlowGuard` sends step 1 on to the recorded step
  (`components/flow/FlowGuard.tsx`).
- **There is no "start over" (removed 26 September 2026).** The strip had a "თავიდან დაწყება"
  that emptied this half of this project. It lost worked-out calculations and designs to one
  click, and a person who wants to start again can simply make a new project — every project
  is kept. Removed with it: `StartOverButton`, the calculator's `startOver()` and `startedOver`
  flag, the design's "kept" versions (`DesignVersion.kept`) and their strings. What remains:
  - before the hinge, the steps are open to each other (redraw, re-upload, change the answers)
    — in the design, within the limits of `DesignFlowGuard` above;
  - the studio's **versions** — version 01 is the flat as the studio first found it, and
    restoring one keeps the present as a version first;
  - the studio's eraser button, now labelled **"ოთახების დაცლა" / "Empty the rooms"**
    (`build.emptyRooms`). It empties furniture, fittings and chosen finishes and keeps the
    flat; it is undoable and version 01 stays. It used to say "თავიდან დაწყება" too;
  - the "add a plan" link on an empty design step (`design.addPlan`, formerly `design.startOver`).

## 13. The calculator's six steps

Moved to [calculator.md](calculator.md#the-six-steps): the steps and their paths, steps 1–2,
step 4's floor and wall for every room (`lib/calculator/roomFinishes.ts`), per-room quantities
on both sides, where the finishes go, old picks moved onto the rooms, and the seven steps
before the six (`fromSevenSteps`).

## 14. The design's ways in (step 1)

Moved to [design-studio/overview.md](design-studio/overview.md#step-1-the-ways-in-appmaindesignidstartpagetsx):
the mode (not preselected), the home state's three columns, the empty start, `?way=`.

## 15. One project, both halves

A calculation and a 3D design of the same flat are one row — the project, made before either
was started. Each half is saved by its own journey only (the design save no longer carries the
calculator's picks); ordering does not fork a project either ([marketplace.md](marketplace.md):
each half's fee is charged once, `mergeLines` unites the halves).

**Each half owns its shared columns.** Once the calculation exists it owns `homeState`, `rooms`
and `totalM2`; the design writes them only in a project designed first, and writes `mode` unless
the calculation is worked out (so also when there is none) — when it is, the design's save
forces `scene.mode` to `full`. Every non-pending calculator save writes `mode: 'full'`, and when
the row has a design it turns that design into a renovation in place (`scene.mode` → `full`,
with `JSON_SET`), counted as a write to the design (`designRev + 1`). A calculation still on its first step (no home state, no rooms) never blanks
a design's home state or rooms. The studio prices against the calculation's home state
(synced whenever it opens).

**Open in the calculator** (a project designed first — a hub card's menu, the calculator hub's
"from a 3D design" tile, the profile's `CalculateCostsButton`, all links to `/calculator/<id>`):
`loadCalculatorHalf` opens it with the plan's rooms and the same id, so the estimate lands in
the same row. A renovation + design with rooms chose its home state in the studio: it opens
calculated, on the materials step. A design-only project, or a renovation with no rooms yet,
opens on step 1. The studio's products come along as picks (`picksFromScene`: furniture per
room, each room's floor and walls per room) so nothing is chosen twice.

**Create / open in 3D** (the calculator summary's "ნახე ბინა 3D-ში" / "ნახე 3D-ში", a hub card,
`OpenIn3dButton`, the design hub's "from a calculation" tile) all go to the design's entry
(`/design/<id>`). The entry calls `handOffToDesign` → `designStore.startFromCalculator` only when
the link says `?from=calculator` (the calculator's summary is the one that does) or the row has
no design plan yet; a hub card or `OpenIn3dButton` on a project that already has a design
simply resumes it, carrying no picks. The handoff:

- **A design the project already has is kept**, whatever has happened to it — its plan and
  walls, rooms added or split in the studio, furniture, fittings, finishes, versions. It becomes
  a renovation (`mode: 'full'`, `modeChosen: true`, `emptyStart: false`) with the calculation's
  home state and floor/ceiling choices (merged into `plan.technical.choices`), lands where it
  was when it was not generated yet, and the calculator's picks are put into it: applied by the studio once the catalogue is in
  (`pendingPicks` → `applyPendingPicks`) when it is laid out, by the generation when it is not.
  A pick the room already holds is not placed twice (`applyFurniturePicks` counts per room and
  product).
- **An empty design** is laid out from the calculation: the calculator's drawing (or typed rooms
  as rectangles), `mode: 'full'`, the home state, the choices, the picks, landing on the
  **style step** with steps 1–2 shut (`planFromCalculator`).
- **The calculation's own copy that was never laid out** (`planFromCalculator`, not generated,
  nothing placed) is rebuilt from the calculation as it is now, keeping the technical points whose
  rooms survive and the versions — its plan steps are shut, so a room added in the calculator
  since could never reach it otherwise.
- The handoff marks the design dirty, so it is written at once. A calculation with no rooms or
  home state yet has nothing to carry: the entry sends it back to the calculator.
- On `generate`, `applyFurniturePicks` puts each furniture pick into its room's slot of the same
  kind (placing an extra item when there is no such slot), and fixtures picked in the catalogue
  (a toilet, a pendant) take every slot of their kind; `applyFinishPicks` lays each room's floor
  and walls on their surface, and a whole-flat finish (from before) by wetness. Everything the
  person chose is `origin: 'calculator'`; the matcher's own picks `style`; swaps in the studio
  `studio` — and a studio choice always outranks a calculator one.

A project with both halves: the calculator's summary reads the design as it was when the
calculator was opened (the row's snapshot); two tabs do not update each other live — the second
to save gets the conflict banner.

## 16. Old work from before projects (`lib/flow/legacy.ts`)

Until September 2026 the calculator and the studio kept one journey each in fixed keys — the
person's own (`renovate-calculator`, `renovate-calculator-plan`, `renovate-design`) and a project
opened from the profile (`renovate-project-…`) — and a journey could exist without a row.
`migrateLegacyCaches` (run by `claimBrowser`) deals with them once:

- **A journey that belonged to a project** was autosaved into its row, so the row is the copy
  that opens and the old one is let go — an old copy cannot be ordered against the row (every row
  started at revision 0), and taking one as current could write it over newer work. The one thing
  the row never had is the calculator's **drawing board**: that alone moves into
  `renovate-calculator-plan:<id>`, where the loader keeps it (and writes it) when the row has no
  board and it is a drawing of the same rooms.
- **A journey with no project** is offered on its hub (`LegacyWorkNotice`): *keep it* makes the
  row first (`adoptLegacyWork`), moves the work in at revision 0 marked dirty, and removes the old
  keys only once the copy is written (`keep-failed` otherwise, the old work untouched); *let it
  go* (`discardLegacyWork`).
- The old per-tab workspace switch (`sessionStorage 'renovate-workspace'`) is removed.

## 17. Tests, and checking by hand

- **Unit** (`tests/unit/flow/`): `resume`, `projectSync` (lines, pruning, quota),
  `openProject` (cache vs row, rescue, design-first, handoff, old picks moved), `legacy`,
  `saveHelpers` (base revision, save ids, clean-after-save).
- **Calculator** (`tests/unit/calculator/roomFinishes.test.ts`, `tests/unit/store/calculatorStore.test.ts`):
  per-room picks, quantities, groups, the migration of old picks, the board's finishes, the
  seven-to-six step migration, re-counting on room changes.
- **Handoff** (`tests/unit/design/fromCalculator.test.ts`): a room's finish lands on its surface
  only.
- **Rows** (`tests/unit/projects/saved.test.ts`): `projectKind`, `calculatorProgress` (seven-step
  progress), `picksFromScene`; `tests/unit/projects/checkoutParts.test.ts` for the checkout's
  summary of each half.
- **Design store** (`tests/unit/store/designStore.test.ts`): the empty start (§14), carry,
  swap and paint.
- **Integration** (`tests/integration/save-routes.test.ts`): sign-in and ownership, conflicts,
  own-unconfirmed saves, the racing write, column ownership, per-room quantities on the server,
  create and rename.
- **e2e** (`e2e/design-studio.spec.ts`): registers an account, makes a project from the hub and
  checks it reopens where it was left (needs the DB; not in CI).

**By hand** (the user's own `pnpm dev` on :3000 can serve stale API routes after a long pause —
verify on a second server, `NEXT_DIST_DIR=.next-build pnpm exec next dev -p 3100` (the user
keeps this as a launch configuration in `.claude/launch.json`, which is git-ignored and not in
the repository), and remove `.next-build` afterwards; never build over :3000):

- *A conflict*: `UPDATE projects SET calculator_rev = calculator_rev + 1 WHERE id = …` in MySQL,
  then edit in the browser — the banner appears; "keep mine" writes at the next revision, "load
  the latest" writes nothing.
- *Reopening from the server*: remove the project's keys (`localStorage` keys ending `:<id>`)
  and open `/calculator/<id>` — it must come back exactly, on the page left.
- *The handoff*: calculate, "see it in 3D" (style step, `planFromCalculator`), generate, then
  "see it in 3D" again from the summary — the studio, with the same furniture and versions.

## 18. Pitfalls already paid for

Each of these was a real bug found in review or by hand; don't undo the fix.

1. **The base revision must travel with the content.** In a shared sync line, one tab's save
   lent its revision to another tab's older copy, which then overwrote newer work.
2. **A save's answer can be lost** (the write landed, the reply did not): without save ids the
   retry was a "conflict" with the person's own work.
3. **Forced saves still need `WHERE rev =`**, and the answer's revision is `read + 1`, not a
   re-read — two racing saves otherwise interleave, or report somebody else's revision.
4. **Old browser copies are not current**, even when they look it: every row started at
   revision 0. Only the calculator's drawing, which the row never had, is carried over.
5. **A hub restored by Back has an old list**: pruning must never drop an id newer than the
   newest listed, or a project just made loses its unsaved work.
6. **Mark dirty before checking the session**, or an edit made while the session reads as
   unauthenticated is never saved.
7. **A signature back to the saved one is clean** — or undoing an edit leaves the half dirty for
   ever, and the cache wins over newer work from another tab.
8. **Eviction respects work**: never a dirty cache, never the project being written, and a write
   that still does not fit drops the stale key.
9. **`calculatorPicks` are derived, not saved to the row** — the browser's cache keeps a copy,
   so the cache path must re-derive them too.
10. **The calculation's own never-generated copy is rebuilt**, the person's design is kept — or
    rooms added in the calculator never reach 3D (its plan steps are shut).
11. **A project designed first, opened in the calculator, writes nothing** — and counts as a
    renovation only when it has rooms.
12. **A project that is gone stops saving** (`gone`), rather than retrying for ever.
13. **Adoption keeps the old work until the new copy is written.**
14. **The design's `?way=` applies only to a project with no drawing** — or a hub tile could wipe
    a drawing.
15. **Start over was removed** (§12) — it emptied worked-out halves; don't bring it back without
    the user asking.
16. **Quantities are computed by one function on both sides** (`roomFinishQuantity`) — the
    server's old per-room rule (integer m², no waste on wall tiles, 0.16 L/m² of paint) disagreed
    with what the page showed.

## 19. Known gaps

- Two tabs on one project do not update each other live; the second to save gets the conflict
  banner. The calculator's summary reads the design as it was when the calculator was opened.
- Projects saved before September 2026 by the old autosave ("one draft per flat") are still in
  the profiles and hubs, named after the date or "my project"; they are deleted one by one.
- A project made on a hub and never touched stays until deleted.
- The calculator's own gaps (studio rooms taking one floor, whole-room finishes only, gross wall
  areas) are in [calculator.md](calculator.md#known-gaps).
- The design's version 01 and "empty the rooms" are the only ways back inside a project; there is
  no project-level undo across sessions beyond the versions.
