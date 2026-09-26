# The 3D studio: build mode

Steps 5 and 6 of the design (`app/(main)/design/[id]/studio/page.tsx`): a full-window 3D (or
2D) view with a category rail, a tray per category, cards on the right, and every way a person
adds, carries, swaps, drags, turns and hangs furniture. Read this before touching the studio
page, `components/studio/`, the item/fitting/opening cards, `lib/design/manipulate.ts`, the
carry and swap actions of `store/designStore.ts`, or the catalogue modal.

Related: [overview.md](overview.md) · [3d-engine.md](3d-engine.md) (the viewer and scene
underneath) · [layout-and-matching.md](layout-and-matching.md) (where the first furniture comes
from) · [finishes.md](finishes.md) (the finishes category, step 6) ·
[technical-and-fittings.md](technical-and-fittings.md) (the electric and technical categories,
doors and windows) · [plan-board.md](plan-board.md) (the 2D view) ·
[../ui-design-system.md](../ui-design-system.md) (build-mode surfaces) ·
[../catalog.md](../catalog.md) (a person's own furniture).

## Key files

| File | Responsibility |
|---|---|
| `app/(main)/design/[id]/studio/page.tsx` | the page: view switch, categories (`CATEGORY_MODE`, `CATEGORY_TOOLS`), key handling, carry/drag/drop wiring (`pickProduct`, `onDragProduct`), the right-hand panels, hints, photos, versions |
| `components/design/Viewer3D.tsx` | the R3F viewer and its `ViewerApi` ([3d-engine.md](3d-engine.md)) |
| `components/studio/BuildBar.tsx` | `CategoryRail` (the six categories down the left: build, furniture, electric, technical, finishes, budget) and `Tray` (the open category along the bottom) |
| `components/studio/Trays.tsx` | `BuildTray`, `ElectricTray`, `TechnicalTray`, `FinishesTray`, `BudgetTray` |
| `components/studio/FurnitureTray.tsx` | the furniture shelf: rooms → kinds → tiles, colour swatches, style chips |
| `components/studio/CatalogBrowser.tsx` + `lib/design/catalogBrowser.ts` | the whole catalogue as a modal (search, filters with counts, details, "place") |
| `components/studio/OwnModelDialog.tsx` | adding a person's own furniture ([../catalog.md](../catalog.md)) |
| `components/studio/FurnitureDrawer.tsx`, `RoomItemsPanel.tsx` | what is placed, by room, with its total |
| `components/design/SwapPanel.tsx`, `ItemCard.tsx`, `HoverCard.tsx` | the selected piece's card (turn, mirror, duplicate, lock, delete, angle, alternatives); the hover card |
| `components/studio/FixturePanel.tsx`, `OpeningPanel.tsx`, `VersionsPanel.tsx` | a fitting's card, a door/window's card, the versions list |
| `components/studio/StudioTopBar.tsx`, `TutorialOverlay.tsx`, `NavHelp.tsx` | the top bar, the first-visit tour, the controls card |
| `components/design/StudioControls.tsx` | `ViewSwitch` (2D / 3D / walk, walls, time of day, photo) and `ZoomControls` |
| `components/design/PhotoDialog.tsx`, `components/projects/ProjectRenders.tsx` | photos and the realistic renders queued from them |
| `components/ui/scroll-row.tsx` | rows that scroll without a scrollbar |
| `lib/design/manipulate.ts` | snapping, collision, rotation, hanging on walls, swaps that must fit, the walk-through's start spot |
| `lib/design/clearance.ts` | tight-passage warnings |
| `store/designStore.ts` | `beginAdd`, `placeItem`, `finishCarry`, `cancelCarry`, `swapProduct`, copy/paste/duplicate, lock, `clearDesign`, versions |
| `app/api/design/renders/**` | photos: POST (queue), GET, DELETE |

## The studio's build mode (`app/(main)/design/[id]/studio/page.tsx`)

Full-bleed canvas; the categories are a narrow rail of tiles down the left edge
(`CategoryRail`, the rooms list beside it) and the open category's tray runs along the bottom
(`Tray`), one at a time — build (tools + the wall's shape + thickness + the unlock button; a
drawing tool switches to the 2D view), furniture (the catalogue as a shelf of small tiles —
a picture and a price — browsed by room and then by kind, narrowed by colour swatches; click
to carry or drag into 3D; the project's own style is marked on the style chips, and a list of
what is already standing in the room sits in the right-hand panel beside it — see "Adding
furniture in the studio"), electric & light (four tiles — socket, switch, aerial,
data — and the lights; the double, high and kitchen sockets are still placed by the
automatic wiring and still re-kindable from a fitting's card, but four extra tiles only made
the shelf harder to read), **technical** (the ten kinds as tiles that arm the 2D board, the
radiators at a click, the works checklist one link away), finishes (the same kind of shelf:
floor · walls · skirting · cornice, then where it goes — a square metre, a 1 m strip, this
wall, the whole room ([finishes.md](finishes.md#what-the-studio-offers)) — then the swatches,
the style default first), budget (totals at a glance). **"Empty the rooms"** (`clearDesign`,
`build.emptyRooms`, in the view controls, behind a confirmation) takes out the furniture,
fittings and chosen finishes and leaves the flat.
Dragging from a tray is shown live and the tile's own picture is never dragged
(`emptyDragImage`): a product is put on the pointer in 3D the moment the drag starts
(`beginAdd`, then `ViewerApi.moveCarriedTo` on every `dragover`) and set down on drop; a
fitting shows a ghost snapped to the nearest wall (`previewElectricalAt`) and is added on
drop. Placed fittings drag along the walls of their room in 3D (hopping to the nearest
wall) and are re-projected on release. The top bar carries the room chip, undo/redo, the
view switch, the walls toggle, the time of day (four presets), photo, the structure lock,
versions, the item count, the save state, help and the next step.
Whatever opens on the right — the item card (`SwapPanel`), the fitting card (`FixturePanel`),
the door or window card (`OpeningPanel`), what is placed (`FurnitureDrawer`), the inspector
(`ElementInspector`, with `FinishPanel` under it for a selected floor zone), the versions —
is an overlay (`z-40`) the full height of the studio, scrolling inside itself under its
alternatives drawer: nothing is pushed aside for it; the help card and zoom sit above the
top bar (`z-30`) so their buttons are never covered. The electric tray is one compact row.

**Choosing a fitting arms it; only the room places it.** The placing click is caught on the
workspace in the capture phase, and the workspace holds the floating chrome as well as the
canvas — so three gestures that are not "put a socket here" used to look exactly like it,
and all three are now refused: a click whose target is not inside the canvas layer (the
tray sits *over* the canvas, and the ray went straight through it to the wall behind,
which is why choosing a kind appeared to place one by itself); a gesture whose pointer
travelled more than `CLICK_SLOP_PX` between down and up, which is a drag of the camera or
of a fitting and not a click (repositioning a socket used to leave a second one where the
drag began); and a click that lands on a fitting already there, which selects it instead of
stacking another on it. `ViewerApi.electricalAt` answers the last one and **walks up from
the mesh the ray hit**, because `tag` stamps a subtree as it stands and a fitting's model
joins it a beat later, when its file arrives — the meshes actually hit are usually
untagged. While a kind is armed the fitting itself rides on the pointer, ghosted and
snapped to the wall it would go on (`previewElectricalAt` on `pointermove`, the same ghost
the tray's drag-and-drop shows), because the armed tile is a tray away from where the
person is looking.

A tap on a
floor or a wall chooses the surface for the finishes shelf **in the finishes category
only** (`onSelectSurface`: the tray opens on that surface, on the one-wall scope for a wall
and the square-metre scope for a floor); in every other category the floor and the walls are
just the room. `editMode` follows the category (`build` picks walls, columns, beams and,
when unlocked, drags walls along their normal with a ghost slab; `electrical` drags
fittings; `finishes` clicks surfaces with their `wallIndex`; `build` with the structure unlocked also
lets a door or window be dragged along its wall by its slab). The tour (`TutorialOverlay`, eight cards, remembered in
localStorage) opens on the first visit and lights up what each card talks about — the
target is found by a `data-tour` attribute (`rail-furniture`, `lock`, `navhelp`,
`history`…), everything else is dimmed and blurred, and the card sits beside it; the page
opens what a step points at (`onStep`). `NavHelp` keeps the controls on screen: drag turns
(either button), the middle button pans, Space + drag pans, Shift + drag dollies, WASD
slides, 1 / 2 / 3 switch views, R turns, M mirrors, Ctrl+C / V copy and paste, Delete
deletes, Esc clears (the page also handles Ctrl+D to duplicate and Ctrl+Z / Ctrl+Y; the card
starts folded).

**The top bar is one row at any width** (`StudioTopBar`, `.studio-bar` in `app/globals.css`).
It is a CSS size container (Tailwind 3 has no container-query plugin here, so the rules are
plain `@container` blocks), and as it narrows the blocks give up what they can instead of
wrapping: below 1520 px of bar the words beside icons go (`.bar-text` — the lock, the
versions, the save state, which reads "შენახულია" and no more), below 1240 the
walk-through's word, the gaps and the view switch's padding (`.bar-text-2`, `.bar-gap`,
`.bar-pad`), below 1060 the next step's word and the room's name is clipped tighter
(`.bar-text-3`, `.bar-next`, `.bar-room`). Every button keeps its tooltip. Measured: one
row from 820 px up, the labels back from 1553 px of viewport. Before this the bar was
`flex-wrap`, and at 1500 px the right block fell onto a second row over the canvas.

**The floating chrome must not eat the canvas.** The trays are nearly opaque (`bg-white/[0.97]`),
not frosted: small print over a furnished room could not be read. Tiles are 52 px — a price
and a picture, the name in the tooltip. The hint and the tight-passage warning *float above*
the tray (`absolute bottom-full`) instead of stacking with it, and the page-level hint only
speaks for what no tray can say for itself (a piece on the pointer, the walk-through, a
fitting armed; the structure lock is the 2D board's hint) — each tray carries its own hint
for the tool in hand (see Known gaps: the page-level hint does not show while the tray is
hidden). **The choosing trays put their categories down their left edge** and give the rest of
the width to what the person is actually choosing: the finishes tray its surfaces (floor ·
walls · skirting · cornice), the furniture tray its styles, the electric tray its two families
(power · lighting); the technical tray has a label and a count there. The build tray has no sentence at all — the unlock button stands where
it used to, because that is the one thing to do there.

**The side panels fit without scrolling.** The product card is one compact row (photo, name,
price) with the shop on a line under it — no address, no telephone, no "visit the shop"
button; the hover card keeps the address and the delivery time, since that is the moment
that proves the sofa is a real sofa. Everything that can be done to a piece is one row of square icon buttons
(`IconAction`): turn, mirror, duplicate, lock, delete. Inputs are 32 px, and the swap drawer
carries its own padding.

**The camera frames on the plan's identity, never on the plan object** (`Viewer3D.frameKey`
← `designStore.planSerial`). A door slid along its wall, a wall dragged, a radiator moved:
each makes a new plan object, and framing on that threw the person's view away mid-edit —
they lined the camera up on a door, nudged it, and were back at the doll's-house view.

## Adding furniture in the studio

The furniture tray (`FurnitureTray`) is the catalogue browser scoped to the focused room.
**It is browsed by room, then by kind.** Thirty-four kinds in one row of look-alike icons was
a row nobody could read, so the line is two levels: the rooms as icons (`SHELF_ROOMS`,
`roomIcon`), and inside a room the kinds that belong there (`kindsForRoom`, one icon each —
`archetypeIcons` draws the tables, chairs, storage, corner sofa and rugs itself, in lucide's
idiom, because lucide's tables are spreadsheets and it has one sofa). A kind belongs to a room
by the **slot** it fills in the room's program, not by being named there: the program names
the double bed and "bedroom" lists the single bed too. The opened room's chip stands at the
head of the line as the way back and stays put while the kinds scroll; the shelf opens on the
room the studio has in focus and follows it; a kind no program has a slot for is under
"other" (`unroomedKinds`, pinned empty by `tests/unit/design/shelfRooms.test.ts`); a room or a
kind nothing is sold for is not offered.

**The whole catalogue is a page, one button away** (`components/studio/CatalogBrowser.tsx`,
`lib/design/catalogBrowser.ts`). The shelf is fine for fifty tiles; a catalogue of thousands
wants search, filters and names. The "კატალოგი" button on the shelf's line opens a modal: a
search box across names, brands, shops and kinds in any language; the rooms and their kinds,
the styles, the colour swatches, a price band and the shop down the left, every one with a
count; the products as cards with their names; the open product's photo, size, shop and page
link on the right, with the one button that matters. `browseCatalog` is pure and tested
(`tests/unit/design/catalogBrowser.test.ts`): the filters apply from the outside in and each
control's counts are read off the list *before* that control narrows it, so a control says
what choosing it would leave; a room, a shop or a colour that the rest of the filters have
emptied stands aside rather than emptying the list. **"Place" puts the product on the
pointer and folds the modal to a chip** — `placeFromCatalog` is `pickProduct` (the same
`beginAdd` a tile off the shelf uses, in 3D or on the board; the walk-through has no pointer
to carry on, so the button is off there) and then `catalogBrowser: 'minimized'`: the room is
in view to set the piece down in, a click sets it down, Escape gives it up, and the chip at
the top of the canvas opens the modal again with the search, the filters and the open product
exactly as they were, because the modal's state (`CatalogBrowserState`) lives in the studio
page and not in the modal (Radix unmounts a closed dialog). While the modal is open the
studio's own keys are off (`if (catalogBrowser === 'open') return` in the key handler — a
Delete there must not take the selected piece out of the room behind it), and its Escape is
its own: `onEscapeKeyDown` stops the event while `open` is true, and only then, because Radix
keeps the layer for the beat of its closing animation and an Escape in that beat has to reach
the studio to give up the piece just placed. `isFurnitureProduct` is the one rule for what
is furniture (a model, and neither a fitting, a door or window, nor a radiator); the shelf
uses it too.

**Rows scroll without a scrollbar** (`components/ui/scroll-row.tsx`): a bar under a 28 px row
of icons is a third of the row, and the trays take every pixel from the 3D view. `ScrollRow`
hides it (`.scrollbar-none`, outside the layers so it beats the global scrollbar rules) and
says where there is more the way a phone does — the edge the row goes on past is blurred and
washed to the tray's white, the edge it ends at is sharp, a row that fits shows nothing.
A `ResizeObserver` on the scroller and its content keeps the edges honest as filters change
the width; a wheel turned over the row scrolls it sideways (let through at either end), and on
hover each fading edge carries an arrow that pages the row. Every icon row and shelf in the
trays — furniture, finishes, electric, technical — is one. `designStore.beginAdd` creates the item with the product's real
size — `placeAdditional` finds a free spot when there is one (a wall first, then any free
floor; never a narrowed slot, which is how a 1.9 m cabinet used to land on its neighbours),
the middle of the room otherwise — and hands it to the pointer (`carryingItemId`). In the
viewer the piece follows the mouse, the outline is green where it fits and red where it does
not, R turns it (`ViewerApi.carryPose` gives the page the spot under the pointer to turn it
at), a click sets it down only on green, and Escape (`cancelCarry`) removes it. Picking a
room in either panel focuses it in 3D.

**One piece rides on the pointer at a time.** `beginAdd` drops whatever is still being
carried before it creates the new item: reaching for a second tile off the shelf is changing
your mind about the first, not asking for both. Before this the first piece was left standing
wherever `placeAdditional` had put it — usually beside the bed, since that is where the free
floor is — and the person had a sofa they never placed and did not want.

**A swap that does not fit rides on the pointer too** (`swapProduct(itemId, product, { carry })`).
`fitSwapped` (`lib/design/manipulate.ts`) says where the new product stands: a piece against
a wall keeps its *back* on the wall rather than its centre where it was (a deeper sofa with
the same centre has its back through the plaster; only the step towards the wall is taken,
never the grid's rounding along it), anything else stays put when it fits and is otherwise
eased back inside the room. It never goes looking across the room. When it answers null the
3D view gets the new piece on the pointer with the old one kept in `carryRestore`; Escape
(`cancelCarry`) or entering the walk-through puts the old piece back, selected, and reaching
for another tile off the shelf puts it back too (the new tile's piece is then the one
selected). The page passes `carry` only in the 3D view; on the 2D board a swap that does not
fit goes in as it is, outlined red. Before this a sofa twice the size was simply stood through the television.

**A carry is one step of history, and nothing until it is set down.** `beginAdd` and a
carrying swap use `set`, `placeItem` of the carried piece (the R key, the set-down) is
silent, and `finishCarry` pushes the single snapshot — `beforeCarry`, the flat as Escape
would leave it. `commit`, `undo`, the persisted `items` and `scene()` (what is saved and
priced) all read `withoutCarry`, so a reload or an autosave in the middle of a carry never
keeps a piece nobody put anywhere. The 3D view and the 2D board both carry (`pickProduct` calls
`beginAdd` in either view — see [plan-board.md](plan-board.md)); only entering the
walk-through, which has no pointer to carry on, gives a carry up.

Every tile on the shelf is also **draggable straight into the view** (HTML5 drag and drop,
`FURNITURE_DRAG_TYPE` on the `dataTransfer`; the catalogue modal's cards are not draggable):
the carry starts on `dragstart` (`onDragProduct` → `beginAdd`), the piece follows the pointer
on every `dragover` (`moveCarriedTo`), and the drop sets it down with
`ViewerApi.dropCarriedAt` — on the 2D board through the board's own `moveCarriedTo` /
`dropCarriedAt`. When no carry was started, the drop falls back to asking the viewer which
floor point and room lie under the pointer (`ViewerApi.floorPointAt`) and beginning one there.
A spot that does not fit leaves the item on the pointer, outlined red, for the person to move.
With the whole flat selected, `beginAdd(product, null)` tries the rooms largest first and
starts in the first with space. The items list opens on the whole flat as well, grouped under
room names, and with no room in focus the finishes tray applies to every room.

## Direct manipulation (`lib/design/manipulate.ts`)

The layout engine *searches* for a spot and gives up if it can't find one. Dragging is the
opposite problem — the user has already decided roughly where a thing goes, and the job is to
make that land cleanly. `snapPlacement` squares the rotation to the nearest wall, snaps the
position to a 5 cm grid, pushes the item flush if it was shoved against a wall, clamps it
inside the room and reports whether it collides. An invalid drop is refused and the item
returns to where it came from, outlined in red on the way.

**A rug gets in nothing's way, and nothing gets in a rug's** (`blockersFor`). `blockingItems`
always left the ghosts (rugs, pendants, artwork, curtains) out of what a dragged piece must
avoid, but the rule ran one way: the layout engine laid the rug under the sofa, and once a
person picked that rug up there was no floor in the room to put it down on again, because
every spot worth a rug has furniture on it. A moving ghost now has no blockers; the walls
still hold it in.

**A piece covers the floor its model covers, not its box** (`lib/design/footprintMasks.ts`,
`lib/design3d/footprintFromModel.ts`). A corner sofa's bounding box includes the corner it
leaves empty, and nothing could stand there. When `loadModel` has a file, the model is looked
at from above on a 12 × 12 grid — a real triangle-against-square test, because the box of a
cushion's diagonal triangle covers exactly the empty corner — and the covered cells are
merged into at most eight rectangles, as fractions of the box (so `fitToItem`'s stretch does
not matter). A model that fills its box (less than 12 % empty) or is too ragged registers
`null` and stays a box. `itemFootprints` turns and mirrors the parts with the item;
`snapPlacement`, `rotateItem` and `isPlacementValid` test piece against piece with them and
the *walls* against the whole box (the outside of an L is the outside of its box). The
registry is plain data filled when a model loads (`lib/design3d/modelLoader.ts`), so
`lib/design` stays free of three.js; until a
model has loaded, and everywhere else (`placeFitting`, `placeAdditional`, `tightSpots`), a
piece is its box, which only ever errs on the side of keeping things apart.
`tests/unit/design3d/footprintFromModel.test.ts` runs the real Kenney corner sofa through it.

**Any angle.** The card's angle row (`SwapPanel.onRotateTo`: a slider and a number, degrees
from facing +Z — the code's comment says clockwise, while a positive rotation maps +Z towards
+X, which is counter-clockwise as the board draws z downward; check before relying on the
direction) turns the selected piece to an exact angle in place —
`rotateSelectedTo` in the studio is `placeItem` with the new rotation, and the outline goes
red when the turned piece no longer fits (`isPlacementValid`), exactly as the 45° buttons
do. A later drag still squares a rotation that is within 14° of a wall; one further off
stays as set.

**A wall-hung piece goes on the wall face under the pointer, at the pointer's height**
(`hangOnWall` in `lib/design/manipulate.ts`, `hangTargetAt` in the viewer). A mirror or a
picture (`placement.type === 'wall-mounted'` — the wall-mounted archetypes are `mirror` and
`artwork`) carried or dragged in 3D used to
follow the ray's meeting point with the horizontal plane of its own base like everything
else, and a pointer on a wall face has no such point: above the piece's height the ray met
the plane *behind* the wall, below it *short* of the wall, and `snapPlacement`'s nearest
wall to that point was the wall opposite, or the neighbour's room. Now the ray is cast at
the room shell first: a wall face under the pointer names the wall — its own side, or the
room behind a far face, through `wallSideOf` — and the piece hangs flat on that wall,
centred under the pointer along it and kept off its ends, at the height the pointer met the
face (its base between the floor and the top of the room). That height travels as
`elevationM` on the placement (`Placement.elevationM`, `onPlaceItem`'s fifth argument,
`placeItem`'s fifth) and is the one way to set a hung piece's height: the card has no field
for it. A grab off the piece's centre keeps its offset along the wall and up it while the
drag stays on that wall (`DragState.hang`). Over the floor a hung piece still snaps to the
nearest wall from the floor point, as before; on the 2D board nothing changes, since a plan
has no faces and no heights.

`rotateItem` deliberately does *not* go through `snapPlacement`: re-aligning the rotation to
the nearest wall would instantly undo every rotation of anything already sitting flush. It
also never refuses: when the turned piece fits nowhere near where it stands, it turns anyway
and comes back `valid: false`, the selection outline goes red (`isPlacementValid`), and the
person drags it somewhere it fits — a refused drop puts it back where it came from. Refusing
the turn made a sofa impossible to rotate in any room without spare floor.

`buildWalkable` + `canStandAt` pick where the walk-through starts (`findStandingSpot`, used by
`WalkControls`): room polygons are separated by the thickness of the wall between them, so each
door contributes a portal box that bridges the two. The walk itself has no collision (Known
gaps).

## Keyboard panning

In the orbit view **WASD and the arrows slide the view** across the flat: the camera and
its orbit target move together along the camera's own forward and right projected onto the
floor, so W is always "up the screen" (Shift is meant to double the speed but does not — see
Known gaps). Matched on `event.code` like everything else, ignored while an input has focus,
and owned by the viewer (walk mode has its own controls) — the studio page handles the rest:
1/2/3, R, M, Delete/Backspace, Escape and Ctrl+Z / Y / C / V / D.

## Photos and renders

**Photos.** The camera button (`ViewerApi.screenshot`: render, then `toDataURL` — the
canvas does not keep its buffer between frames) opens `PhotoDialog` with the shot and asks
whether to make a realistic photo of it. Yes saves the design first (a draft is enough —
`ensureSaved` → `saveDesign({ draft: true })`), posts the PNG with the room name and the
camera pose to `POST /api/design/renders`, which stores it under `renders/` and queues a
`project_renders` row, and then tells the person the render is being made, that they can
keep taking photos or moving furniture, and that it will be in their profile under the
project — where `ProjectRenders` lists every shot with its status and a download of the
screenshot now and of the render once `renderUrl` is set (`GET /api/design/renders`,
`DELETE /api/design/renders/[id]`). **No generator is wired to the queue yet**: rows wait in `queued` until an image model
(or a person) fills `renderUrl` and flips the status.

## Tests

`tests/unit/design/manipulate.test.ts` (rotation, validity, `placeAdditional`, rugs, footprint
masks, `fitSwapped`, `hangOnWall`), `tests/unit/design/clearance.test.ts`,
`tests/unit/design/catalogBrowser.test.ts`, `tests/unit/design/shelfRooms.test.ts`,
`tests/unit/store/designStore.test.ts` (carry and swap as one history step, `beginAdd` giving a
carry up), `tests/unit/design3d/footprintFromModel.test.ts`, and `e2e/design-studio.spec.ts`
(a furnished studio with a price). The page, the trays and `ScrollRow` have no tests.

## Known gaps

- **Realistic renders are queued, not produced.** `project_renders` rows wait in `queued`; wiring an image model (the plan is an AI API called with the screenshot and the scene) means a worker that reads the queue, writes `renderUrl` and flips the status — the profile page already shows both states.
- The walk-through has no collision at all — walls, furniture, nothing stops the viewer.
  Deliberate: a design tool wants to be explored, not navigated, and getting stuck reads as a
  bug every time. `buildWalkable` only picks the starting spot now.
- The page-level hint renders only while a tray is shown or the board has a hint, so in the
  walk-through its hint never appears, and the carry hint disappears when the tray is folded in
  3D.
- Shift does not speed up the keyboard panning, although the viewer has code for it: the
  pressed-key set only collects the pan keys, so the "fast" check never sees Shift.
- The hover card's phone line never renders (it is gated `!compact` inside a compact-only
  block); the i18n key for "tight passage — n cm" is unused (the warning is generic).
- `NavHelp` lists Ctrl+C / V but not Ctrl+D, which the page handles.
- `designStore.addItem` has no callers.
