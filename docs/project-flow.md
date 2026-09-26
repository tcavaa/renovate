# Projects: from the hub to the summary

How a person makes a project, works in it, leaves and comes back — for both products, the
calculator and the 3D design studio — and how the two halves of one project stay one project.
Read this before touching anything under `lib/flow/`, `store/projectScope.ts`, the hubs,
`components/projects/ProjectGate.tsx`, the save routes or the step URLs.

Written 26 September 2026, after the "projects first" rework (25–26 September) and the changes
the day after it (no "start over", no placement step, a floor and a wall per room). Linked from
`CLAUDE.md`; the rest of the app is described there.

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
  guest sees the explanation, the tiles and "sign in / create an account"; nothing else.
- **The steps are signed in only.** `auth.config.ts` gates `/^\/(calculator|design)\/\d+(\/|$)/`
  (numeric ids only), and `proxy.ts` matches `/calculator/:path+` and `/design/:path+` — one
  segment or more, never the hubs themselves.
- **The server layout checks the owner** (`app/(main)/<journey>/[id]/layout.tsx` →
  `loadProjectForSteps` in `lib/projects/loadForSteps.ts`): a non-numeric id goes to the hub,
  nobody signed in goes to `/login?callbackUrl=…`, somebody else's project or one that is gone is
  a 404. The calculator journey never receives the design's versions (they can be megabytes).
- **Old URLs.** A step URL from before projects (`/calculator/plan`, `/design/studio`) is sent to
  the hub by the proxy with a real 307. `/calculator/<id>/placement` (the step that went into the
  catalogue, §13) is sent to `/calculator/<id>/catalog`.
- **Step URLs are never written by hand**: `calculatorStepHref(id, step)` /
  `calculatorEntryHref(id)` (`lib/calculator/steps.ts`), `designStepHref(id, step)` /
  `designEntryHref(id, from?)` (`lib/design/steps.ts`). `calculatorStepFromPath` /
  `designStepFromPath` read a URL back into a step.
- Checkout and brigade bookings require the project's owner too (`app/api/checkout`,
  `app/api/bookings`).

## 4. The hubs (`components/projects/hub/`)

`ProjectHub` is one server component for both products (`journey` prop):

1. **What it does and how it works** — the steps in a sentence each (`hub.calculatorSteps`, six;
   `hub.designSteps`, eight).
2. **How to draw a plan the calculator can count on** — the explanation the user asked for.
3. **Tiles** (`HubTiles`, client). Calculator: *draw the plan* (`?way=draw`), *upload a plan*
   (`?way=upload`), *from a 3D design*. Design: *upload a plan*, *blank sheet*, *from a
   calculation*. The first two of each ask for a name, create the row and open step 1 on that
   way in (`?way=` preselects it only when the project has no drawing yet). The third lists the
   person's projects that have the *other* half and opens this product's half of one.
4. **The person's projects** as a grid of cards, most recently changed first
   (`lib/projects/hub.ts`: `updatedAt desc, id desc`; a small serialisable `HubProject`, the scene
   read for its progress only, versions never). A card: a `PlanSketch` thumbnail
   (`labels={false}`), the name, the status, where it stands (`whereItStands`: "not calculated
   yet · step n of 6 · <label>", "not generated yet", or the figure) and a "…" menu
   (`ProjectCardMenu`): open, carry into the other product, the project page, rename, delete.
5. `LegacyWorkNotice` — old work from before projects, offered to be kept (§16).
6. `HubCachePrune` — drops this browser's caches of projects that no longer exist (§9).

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
`calculatorProgress` maps it with `fromSevenSteps` (§13).

## 7. Opening a project (`ProjectGate`)

The server layout hands the owner's row (`savedProjectInput`, `lib/projects/saved.ts`) to
`ProjectGate` (client; nothing under it renders until it is done):

1. **`claimBrowser(userId)`** (`lib/flow/owner.ts`): another account's caches are wiped
   (`forgetAllProjects`, the legacy keys too); then the old keys are migrated once (§16).
   `releaseBrowser()` — signing out — forgets nothing.
2. **`openProjectStores(journey, project)`** (`lib/flow/openProject.ts`):
   - the calculator journey loads **the calculation only** — it never opens the design's store.
     What its summary says about the design, and orders of it, it reads off the row
     (`useProjectMeta().snapshot`), so a design being edited in another tab is never written over
     by a calculator merely looking at it;
   - the design journey loads **the calculation first** (when the project has one — the handoff
     and the budget's order read it), **then the design**, then makes the design's home state the
     calculation's (the calculation owns it, §15).
3. **`setActiveProject(id)`** — the hooks now reach this project's stores (§8).
4. **`pruneCaches(openId, knownIds)`** — keeps this browser's cache small (§9).

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
calculation again on either path — they are not stored, and the calculation may have changed
since the copy was made.

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
- Persisted with each store's content: `projectId`, `baseRev`, `pendingSaveId`, `at`, and the
  calculator's `step` (persist version 4, §13).

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
- `pruneCaches(openId, knownIds)` (the gate, and `HubCachePrune`) drops the caches of projects
  that are gone and keeps the four clean caches used last, the open one, and every dirty one.
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
1. Signed in (401), the caller's own project (404).
2. **The conflict rule.** The save is refused with 409 when `!force`, `baseRev < row rev`, and it
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

## 11. Where a project opens (`lib/flow/resume.ts`, pure, `tests/unit/flow/resume.test.ts`)

The entry pages (`app/(main)/<journey>/[id]/page.tsx`) redirect to the step the project reopens
on: **the page last open (`at`) when it can still be shown**, else the nearest one that can,
looking back before forward in the project's own order.

- **`calculatorResumeStep`** — no home state yet: step 1. Not calculated: the way in and the plan
  only (the plan when there is a board). Calculated: steps 1–2 are shut, so 3 at least, and never
  beyond how far the journey got (`step`).
- **`designResumeStep`** — works in the design's walking order (`designStepOrder`: a renovation
  walks `1, 2, 4, 5, 6, 3, 7, 8`, a finished home `1…8`). Generated (with rooms): the studio or
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
  Nothing after step 1 opens before step 1 is answered.
- **There is no "start over" (removed 26 September 2026).** The strip had a "თავიდან დაწყება"
  that emptied this half of this project. It lost worked-out calculations and designs to one
  click, and a person who wants to start again can simply make a new project — every project
  is kept. Removed with it: `StartOverButton`, the calculator's `startOver()` and `startedOver`
  flag, the design's "kept" versions (`DesignVersion.kept`) and their strings. What remains:
  - before the hinge, the steps are open to each other (redraw, re-upload, change the answers);
  - the studio's **versions** — version 01 is the flat as the studio first found it, and
    restoring one keeps the present as a version first;
  - the studio's eraser button, now labelled **"ოთახების დაცლა" / "Empty the rooms"**
    (`build.emptyRooms`). It empties furniture, fittings and chosen finishes and keeps the
    flat; it is undoable and version 01 stays. It used to say "თავიდან დაწყება" too;
  - the "add a plan" link on an empty design step (`design.addPlan`, formerly `design.startOver`).

## 13. The calculator's six steps

| # | Path | What |
|---|---|---|
| 1 | `start` | the way in (upload a plan or say you will draw one; a hub tile's `?way=` preselects it when there is no plan on file) and the home's condition |
| 2 | `plan` | the board — the uploaded plan to check, or a blank sheet to draw on; **"გამოთვლის დაწყება"** here (needs rooms) sets `calculated` |
| 3 | `materials` | the engine's materials and labour; laminate/parquet and ceiling choices |
| 4 | `catalog` | **each room's floor and walls**, and the products for the whole flat |
| 5 | `furniture` | optional, room by room (`AskFurnitureDialog` asks on leaving the catalogue) |
| 6 | `summary` | the sheet, the PDF of the plan, save, order, "see it in 3D" |

### Steps 1–2 in detail

- **Nothing leaves step 1 until its continue.** `PlanUploadCard` with `showContinue={false}`
  hands the plan to page state as soon as the area makes sense. Until the journey is past the
  board, steps 1 and 2 are open to each other.
- **The board** (`PlanWorkspace` with the calculator's own store) reads the calculator's rooms
  off the plan after every edit (`calculatorRoomsFromPlan`: width and depth from the outline,
  `x`/`z` from its corner).
- **Typed rooms.** A room typed by size (`RoomsPanel`) becomes four walls at the first free
  spot (`findFreeSpot`). Sizes are exact to the centimetre, and dragged rooms snap onto their
  neighbours' edges (`snapToNeighbours`, `lib/calculator/layout.ts`).
- **A re-uploaded plan** is a new plan in the same project: `replaceRooms` drops every pick
  with the rooms, and the id stays. `setRooms` prunes the furniture of rooms that vanished
  and re-counts or drops their floors and walls.

### Step 4: a floor and a wall for every room (`lib/calculator/roomFinishes.ts`)

Until 26 September the catalogue was a **cart**: floor and wall materials went in under
`<slug>_item:<productId>` with no quantity, and a fifth step, **placement**, had the person lay
them on the rooms of the board by hand (whole floors, walls, square metres, strips). The area laid
was the quantity. It was an extra step and a confusing one: everything it asked for is known from
the rooms. So:

**The page.**
- The catalogue lists the rooms (`SideList` "rooms — floors and walls", with how many of the
  two are chosen), and a room shows two slots, **floor** and **walls**.
- A slot is chosen from the categories of its surface (`surfaceOfCategory`: `per_m2_floor` /
  `per_m2_wall`). The usual one is offered first (`usualFinishCategory`: floor tiles for a
  bathroom, toilet, kitchen or balcony floor, laminate for the rest; wall tiles for bathroom and
  toilet walls, paint for the rest), and a wet room sees its wet products first.
- "Other products" (sockets, lights, sanitary ware, doors, windows…) are one product for the
  whole flat, as before (`<slug>_global`, `suggestedQuantity`).

**One pick per room and surface.**
- Stored under the room's own key, `<slug>_room:<roomId>` (`selectionKey`), with `roomId` and
  `surface` on the pick.
- `setRoomFinish(roomIds, surface, product | null)` → `withRoomFinish`: whatever that room had
  for that surface goes, whatever category it was from; null clears it.
- **"The same in N more rooms like this"** copies a room's choice to the rooms of the same kind
  of work that have nothing chosen (`roomsLike` / `finishGroup`: tiled floor, laid floor,
  tiled wall, painted wall). It never overwrites.

**The quantity is the room's** (`roomFinishQuantity` in `lib/calculator/quantities.ts`).
- The room's floor m² or its wall m² — the estimate's own figures, perimeter × height, doors and
  windows not taken off — in the product's units (`finishPickQuantity`): m² plus a tenth of
  cutting waste for laminate and tiles, tins of paint by the product's coverage (8 m²/L when the
  row says nothing), one unit per m² otherwise.
- The server uses **the same function** with the catalogue's own unit and coverage
  (`lib/api/projectSave.ts`): the figure the person saw is the figure saved. The surface comes
  from `SURFACE_OF_SLUG` for the seeded categories, or the pick's own for one made in admin.
- A resized room re-counts its picks and a deleted one drops them (`withRoomFinishQuantities`,
  run by `setRooms`, `updateRoom`, `removeRoom` and on every open). A flat with no rooms at all
  is left alone — that is a flat not read yet.

**Where the finishes go.**
- **The board wears them without being told** (`boardFinishesFromPicks`): each room in its
  chosen floor and walls. The summary's PDF draws them, and the save stores them as the board's
  finishes. Nothing is laid by hand any more.
- **Into 3D.** Per-room picks travel as `roomProducts` with their surface
  (`picksFromCalculator`), and `applyFinishPicks` puts each on that surface only. A wall tile
  that could also be laid on a floor used to land on the floor too.
- **Studios** (kitchen + living room in one room) take one floor for the whole room — a known
  gap.

**Picks from before** are moved onto the rooms when the project opens (`migrateFinishPicks`,
run by the loader, written back once).
- A cart pick goes to the rooms whose floor or walls the board had in that product. A whole-room
  finish counts; a tile or a strip does not. Laid nowhere, it is dropped.
- A whole-flat finish (`<slug>_global` of a finish category — the first catalogue, and projects
  designed first) goes to every room its kind of work suits.
- Never over a room's own pick. `picksFromScene` (a project designed first) now makes per-room
  picks from each room's whole-room finish too.

**Six steps, and the seven before them.**
- The placement step's page, `lib/calculator/placement.ts` and their strings are gone. Steps
  renumber: old 1–4 stay, old 5 (placement) → 4, 6 → 5, 7 → 6 (`fromSevenSteps`,
  `lib/calculator/steps.ts`).
- The browser's copy migrates with the store's persist version (3 → 4, `migratePersisted`).
- The row's progress is recorded with `steps: 6` from now on, and `calculatorProgress` maps any
  progress without it. The schema still accepts a step up to 7, so a tab left open from before
  can save, and its progress is read as the seven steps it is.
- The proxy sends `/calculator/<id>/placement` to the catalogue.

## 14. The design's ways in (step 1)

- **What do you need** is not preselected: *design only* or *renovation + design* (which reveals
  the home states, old renovation first) — `designStore.modeChosen`; the continue button refuses
  until a plan and a mode exist. Each card lists what it covers (`modeDesignOnlyCovers` /
  `modeFullCovers`), and a chosen home state shows three columns — what is standing, what the
  estimate charges for, **what happens to the technical points** (a green frame records its
  sockets and pipes rather than pricing them). Keep that third column truthful if the phase
  gating changes.
- **The third card is an empty start** (`emptyStart`, `chooseEmptyStart`, `startEmpty`): the
  studio on the flat as drawn with every room empty — no layout, no furniture, the style's
  ordinary finishes, no style test, no technical step. Priced as `design_only`; `startEmpty` is
  the hinge like `generate` (`generated`, step 5, no versions, an empty history), and version 01
  is the empty flat. With rooms to open on, step 1 goes straight to the studio; a blank sheet is
  drawn on step 2 first.
- `?way=upload|draw` from a hub tile applies only while the project has no drawing.

## 15. One project, both halves

A calculation and a 3D design of the same flat are one row — the project, made before either
was started. Each half is saved by its own journey only (the design save no longer carries the
calculator's picks); ordering does not fork a project either (see "Marketplace" in `CLAUDE.md`:
each half's fee is charged once, `mergeLines` unites the halves).

**Each half owns its shared columns.** Once the calculation exists it owns `homeState`, `rooms`
and `totalM2`; the design writes them only in a project designed first, and writes `mode` only
while the calculation is pending. The calculator's save turns the design into a renovation in
place (`mode` and `scene.mode` → `full`, with `JSON_SET`), counted as a write to the design
(`designRev + 1`). A calculation still on its first step (no home state, no rooms) never blanks
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
(`/design/<id>`, the summary with `?from=calculator`), which calls `handOffToDesign` →
`designStore.startFromCalculator`:

- **A design the project already has is kept**, whatever has happened to it — its plan and
  walls, rooms added or split in the studio, furniture, fittings, finishes, versions. Only the
  calculator's picks are put into it: applied by the studio once the catalogue is in
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
  progress), `picksFromScene`.
- **Integration** (`tests/integration/save-routes.test.ts`): sign-in and ownership, conflicts,
  own-unconfirmed saves, the racing write, column ownership, per-room quantities on the server,
  create and rename.
- **e2e** (`e2e/design-studio.spec.ts`): registers an account and makes a project from the hub
  (needs the DB; not in CI).

**By hand** (the user's own `pnpm dev` on :3000 can serve stale API routes after a long pause —
verify on a second server, `sh -c "NEXT_DIST_DIR=.next-build pnpm exec next dev -p 3100"` in
`.claude/launch.json`, and remove `.next-build` afterwards; never build over :3000):

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
9. **`calculatorPicks` are derived, not stored** — the cache path must re-derive them too.
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
- A studio room (kitchen + living room) takes one floor for the whole room in the calculator; the
  engine prices its parts separately, the picks do not.
- Floors and walls are chosen for whole rooms only in the calculator; a feature wall or a tiled
  splashback is the studio's job (per wall, strips, square metres).
- The calculator's wall area is gross (doors and windows not taken off) — the engine's figure,
  and the only one the server has; the studio's is net.
- The design's version 01 and "empty the rooms" are the only ways back inside a project; there is
  no project-level undo across sessions beyond the versions.

## 20. Changes, September 2026

- **25 September** — projects first: hubs, named projects, per-project stores, revisions (0012),
  the calculator's board saved (0011), resume by `at`, legacy migration.
- **25–26 September** — a review found 24 problems; all fixed (§18 1–14), including save ids
  (0013).
- **26 September** — "start over" removed; the studio's eraser renamed "empty the rooms"; the
  calculator's placement step removed and the catalogue made per room (a floor and a wall each,
  counted from the room, laid on the board and carried into 3D by themselves); six steps.
