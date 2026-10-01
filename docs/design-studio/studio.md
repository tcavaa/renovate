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
| `components/design/SceneLoading.tsx` | the loading screen over the canvas until the flat's models and finishes are in ([3d-engine.md](3d-engine.md#the-loading-screen-libdesign3dloadprogressts)) |
| `components/studio/BuildBar.tsx` | `CategoryRail` (the six categories down the left: build, furniture, electric, technical, finishes, budget) and `Tray` (the open category along the bottom) |
| `components/studio/Trays.tsx` | `BuildTray`, `ElectricTray`, `TechnicalTray`, `FinishesTray` (with `StylePicker.tsx`), `BudgetTray` |
| `components/studio/FinishCatalog.tsx` + `lib/design/finishBrowser.ts` | every finish as a modal, the finishes tray's "catalogue" ([finishes.md](finishes.md#browsing-finishes-the-shelfs-filters-and-the-catalogue-libdesignfinishbrowserts)) |
| `components/studio/FurnitureTray.tsx` | the furniture shelf: admin's studio rooms → their categories (→ subcategories) → tiles, colour swatches, style chips (`lib/design/shelf.ts`, [../categories.md](../categories.md#the-studios-rooms-shelf_rooms-shelf_room_categories)) |
| `components/studio/CatalogBrowser.tsx` + `lib/design/catalogBrowser.ts` | the whole catalogue as a modal (search, filters with counts, details, "place") |
| `components/studio/OwnModelDialog.tsx` | adding a person's own furniture ([../catalog.md](../catalog.md)) |
| `components/studio/FurnitureDrawer.tsx`, `RoomItemsPanel.tsx` | what is placed, by room, with its total (a made-to-measure kitchen at what it is made for — `itemCostGel`) |
| `components/design/SwapPanel.tsx`, `ItemCard.tsx`, `HoverCard.tsx` | the selected piece's card (turn, mirror, duplicate, lock, delete, angle, a made-to-measure kitchen's material, alternatives); the hover card |
| `components/studio/FixturePanel.tsx`, `OpeningPanel.tsx`, `VersionsPanel.tsx` | a fitting's card, a door/window's card, the versions list |
| `components/studio/StudioTopBar.tsx`, `TutorialOverlay.tsx`, `NavHelp.tsx` | the top bar, the first-visit tour, the controls card |
| `components/design/StudioControls.tsx` | `ViewSwitch` (2D / 3D / walk, the walls and time-of-day menus — `WallModeMenu`, `DaylightMenu` — start from scratch, photo) and `ZoomControls` |
| `components/design/PhotoDialog.tsx`, `components/projects/ProjectRenders.tsx` | photos and the realistic renders queued from them |
| `components/ui/scroll-row.tsx` | rows that scroll without a scrollbar |
| `lib/design/manipulate.ts` | snapping, collision, rotation, hanging on walls, swaps that must fit, the walk-through's start spot |
| `lib/design/clearance.ts` | tight-passage warnings |
| `store/designStore.ts` | `beginAdd`, `placeItem`, `finishCarry`, `cancelCarry`, `swapProduct`, copy/paste/duplicate, lock, `clearDesign`, versions |
| `app/api/design/renders/**` | photos: POST (queue), GET, DELETE |

## The studio's build mode (`app/(main)/design/[id]/studio/page.tsx`)

**It opens behind a loading screen.** From "დიზაინის გენერაცია" the style step plays its own
overlay (`GenerationOverlay`) and then opens the studio; there the canvas is covered by
`SceneLoading` — first as `ViewerFallback` while three.js itself arrives, then by the viewer,
counting the flat's models and textures in ("ჩაიტვირთა 12 / 50") — until everything the first
build asked for is in, and it fades. The person sees the flat whole, not a sofa, a lamp and a
floor at a time. The bars and trays around the canvas stay usable. How it decides it is done
is in [3d-engine.md](3d-engine.md#the-loading-screen-libdesign3dloadprogressts).

Full-bleed canvas; the categories are a narrow rail of tiles down the left edge
(`CategoryRail`, the rooms list beside it) and the open category's tray runs along the bottom
(`Tray`), one at a time — build (tools + the wall's shape + thickness + the unlock button, **on
one line**: what the tool in hand can be told scrolls sideways in a `ScrollRow` if it runs
long, the thicknesses are bare numbers with the unit once, and unlocked is only a green lock
icon with its words on hover — a click on it locks the walls again, as the top bar's lock does;
wrapped, the lock fell onto a second row; a
drawing tool switches to the 2D view; the tools are select, the drawing tile, doors & windows
(one tile — "კარ-ფანჯარა" — with the door, the window, the plain opening and the balcony's
railing beside it while it is in hand), column and beam — no pan tile, because on the 2D board, in every category, the select tool
slides the view when dragged from the empty sheet or from anything that cannot move there, as
[plan-board.md](plan-board.md#the-2d-board-componentsplanplaneditortsx) describes), furniture (the catalogue as a shelf of small tiles —
a picture and a price — browsed by room and then by kind, narrowed by colour swatches; click
to carry or drag into 3D; the project's own style is marked on the style chips, and a list of
what is already standing in the room sits in the right-hand panel beside it — see "Adding
furniture in the studio"), electric & light (four tiles — socket, switch, aerial,
data — and the lights; the double, high and kitchen sockets are still placed by the
automatic wiring and still re-kindable from a fitting's card, but four extra tiles only made
the shelf harder to read), **technical** (the ten kinds as tiles that arm the 2D board, the
radiators at a click, the works checklist one link away — the technical step opened on its
works check, `technicalCheckHref`), finishes (the same kind of shelf:
floor · walls · skirting · cornice, then where it goes — a square metre, a 1 m strip, this
wall, the whole room ([finishes.md](finishes.md#what-the-studio-offers)) — with the colour
swatches, the style picker and the "catalogue" button on that line, then the swatches, the
style default first ([finishes.md](finishes.md#browsing-finishes-the-shelfs-filters-and-the-catalogue-libdesignfinishbrowserts))), budget (totals at a glance). **"Empty the rooms"** (`clearDesign`,
`build.emptyRooms`, in the view controls, behind a confirmation) takes out the furniture,
fittings and chosen finishes and leaves the flat.
Dragging from a tray is shown live and the tile's own picture is never dragged
(`emptyDragImage`): a product is put on the pointer in 3D the moment the drag starts
(`beginAdd`, then `ViewerApi.moveCarriedTo` on every `dragover`) and set down on drop; a
fitting shows a ghost snapped to the nearest wall (`previewElectricalAt`) and is added on
drop. Placed fittings drag along the walls of their room in 3D (hopping to the nearest
wall) and are re-projected on release. The top bar carries the room chip, undo/redo, the
view switch, the walls and time-of-day menus, start from scratch, photo, the structure lock,
versions, the item count, the save state, help and the next step. The middle of the bar is one
glass group (`ViewSwitch`): 2D · 3D · the walk-through as its eye alone, then two menu buttons
that show what is on and open their choices below (`WallModeMenu`, `DaylightMenu`, the
project page's viewer uses the same two), then the eraser and the camera. The bar sits at
`z-[45]` so an open menu lies over the right panel. **The walls menu** has four modes
(`lib/design3d/wallMode.ts`): all walls up; the cutaway (the default — a wall between the
camera and its room goes, with its mouldings and its windows and doors to the outside, so none
hangs in the air); the low cutaway (those walls drop to a 25 cm stub instead); walls down
(every wall a 25 cm stub, no doors, windows, cornices or beams — the walls used to vanish
whole and leave white strips where the floor stops at their face). The walk-through always
has the cutaway. **ნავიგაცია and the zoom column** sit in the bottom-right corner beside the
tray (880 px at most, centred); a window narrower than 1040 px lifts them over it.
Whatever opens on the right — the item card (`SwapPanel`), the fitting card (`FixturePanel`),
the door or window card (`OpeningPanel`), what is placed (`FurnitureDrawer`), the inspector
(`ElementInspector`, with `FinishPanel` under it for a selected floor zone), the versions —
is an overlay (`z-40`) the full height of the studio, scrolling inside itself under its
alternatives drawer: nothing is pushed aside for it; the help card and zoom (`z-30`) are
the bottom-right corner's. The electric tray is one compact row.

**A made-to-measure kitchen's card is its material.** A kitchen run or island is bought as the
kitchen maker's material by the façade ([../budget.md](../budget.md#kitchens-are-measured-and-made-in-the-makers-material-libdesignkitchents)),
so its card (`ItemCard` through `boughtProduct`) shows the material, its price for this piece
(façade × price per m²) and the maker's shop, and `SwapPanel` lists the maker's materials
under the actions (`KitchenMaterials`: each with its price per m² and what the piece comes to
in it, tagged **3D** when it brings a model of this piece's kind; `setKitchenMaterial`). Choosing
one with a model redraws the kitchen as that model (`drawnModelUrl` — the wrapper's key follows
it, so the swap rebuilds it); without, the kitchen model placed stays. The alternatives below
are the kitchen models — what is drawn while the material has none. The studio gives every such piece the style's material as the catalogue arrives and
buys it again when the piece is stretched (`ensureKitchenMaterials`, watching
`kitchenMaterialSignature`); like every re-derivation on the way in, that is not autosaved
until the person edits something.

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
(power · lighting); the technical tray has a label and a count there. **A kind's tile says how
many of it stand on the plan** (a small count in its corner, the socket tile counting every
kind of socket), in both the electric and the technical tray — the calculator's plan step shows
the same two trays ([../calculator.md](../calculator.md)). A fitting set down on the 2D board is
its catalogue product at once, as one set down in 3D is (`PlanWorkspace`'s `catalog`). The build tray has no sentence at all — the unlock button stands where
it used to, because that is the one thing to do there.

**The side panels fit without scrolling.** The product card is one compact row (photo, name,
price) with the shop on a line under it — no address, no telephone, no "visit the shop"
button; the hover card keeps the address and the delivery time, since that is the moment
that proves the sofa is a real sofa. Everything that can be done to a piece is one row of square icon buttons
(`IconAction`): turn, mirror, duplicate, lock, delete. Inputs are 32 px, and the swap drawer
carries its own padding.

**The studio opens on the whole flat** — the room list's "მთელი ბინა". The page clears
`focusRoomId` when it mounts and `generate` clears it too: the plan and technical boards keep
the room picked out on them in the same field, and it used to open the new layout on that one
room ([overview.md](overview.md#generation-versions-and-undo)). Between steps 5 and 6 the page
stays mounted, so a room chosen here stays chosen there.

**The camera frames on the plan's identity, never on the plan object** (`Viewer3D.frameKey`
← `designStore.planSerial`). A door slid along its wall, a wall dragged, a radiator moved:
each makes a new plan object, and framing on that threw the person's view away mid-edit —
they lined the camera up on a door, nudged it, and were back at the doll's-house view. **The
camera is born at that framing** (the `Canvas` camera starts at `frameFor`'s position looking at
its target, and the framing runs in a layout effect): switching to 3D used to show, for the
beat the scene took to load, three.js's default camera at floor level beside the flat before
the framing caught up.

## Adding furniture in the studio

The furniture tray (`FurnitureTray`) is the catalogue browser scoped to the focused room.
**It is browsed by room, then by category — both admin's.** Thirty-four kinds in one row of
look-alike icons was a row nobody could read, so the line is two levels: the **studio rooms**
admin makes (`shelf_rooms`: name, icon, the plan's room types it is for, the categories it
lists in order), and inside a room its categories, one icon each; a category that has
subcategories with something in them opens onto those, a chip at the head of the line for
each step back. A product is in a room when one of the room's categories covers its own, so a
pendant light is in every room that lists pendants; what no room covers is under "other"; a
room or a category nothing is sold for is not offered. The opened room's chip stands at the
head of the line as the way back and stays put while the categories scroll; the shelf opens
on the room admin made for the type in focus and follows it. The icons come drawn with the
catalogue (`iconNodeFor` → `NodeIcon`), so the studio ships no icon set; the studio's own
furniture icons (the tables, chairs, storage, corner sofa and rugs lucide lacks) are
`STUDIO_ICONS`. The starting rooms are the ones this line had in code (`SHELF_ROOMS`, with
`kindsForRoom`'s kinds as their subcategories — a kind belongs to a room by the **slot** it
fills in the room's program, pinned by `tests/unit/design/shelfRooms.test.ts`). The rules are in
[../categories.md](../categories.md#the-studios-rooms-shelf_rooms-shelf_room_categories).

**The whole catalogue is a page, one button away** (`components/studio/CatalogBrowser.tsx`,
`lib/design/catalogBrowser.ts`). The shelf is fine for fifty tiles; a catalogue of thousands
wants search, filters and names. The "კატალოგი" button on the shelf's line opens a modal: a
search box across names, brands, shops, kinds and categories in any language; the rooms and
their categories (a chosen one unfolding its subcategories),
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
studio's own keys are off (`if (catalogBrowser === 'open' || finishCatalog === 'open') return`
in the key handler — a Delete there must not take the selected piece out of the room behind
it), and its Escape is its own: `onEscapeKeyDown` stops the event while `open` is true, and
only then, because Radix keeps the layer for the beat of its closing animation and an Escape
in that beat has to reach the studio to give up the piece just placed. The finishes tray has a
catalogue of its own built the same way (`FinishCatalog`, its chip shown in the finishes
category only — [finishes.md](finishes.md#browsing-finishes-the-shelfs-filters-and-the-catalogue-libdesignfinishbrowserts)). `isFurnitureProduct` is the one rule for what
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

**A room separator is a line on the floor, not a wall: furniture stands over it.** The rooms a
separator divides (a living room and the kitchen it opens onto) are one floor for placing
things. `snapPlacement`, `isPlacementValid`, `rotateItem` and `fitSwapped` take the plan's rooms
as a last argument, and every caller passes them (the 3D drag and carry, the selection outline,
the card's turn and angle, the swap, duplicate and paste, the 2D board). They then work on
`openFloor(room, rooms)` (`lib/design/planGeometry.ts`): the room and every room joined to it
across separators, however many in a row. A piece is clamped to that floor's box rather than
its room's. It is valid when its centre is on the floor and no wall of the floor runs through
it (`footprintOnFloor` against `floorWalls`: every edge but a separator's line, so the partial
wall a separator carries on from still holds it back). The pieces in all of the floor's rooms
are in its way. It squares up to and snaps flush against only the walls of the room it is in:
near the end of a partial wall both faces are within reach, and with the whole floor's walls a
coffee table jumped through to the far face. A piece belongs to the room its centre is in (the
drag already re-homed it by the point under the pointer). A room with no separator is judged by
`footprintInRoom`: `boxInPolygon` (`lib/design/planGeometry.ts`) — all four corners in its
polygon *and* no edge of it running through the box — taken a nanometre in from the box's sides.
Corners alone let a box stand across the end of a partial wall or the gap of a U with every
corner on the floor. The matcher's fit uses the same test, and the layout engine the same without
the nanometre ([layout-and-matching.md](layout-and-matching.md#nothing-stands-through-a-wall)).

**A piece flush against a wall is in the room, whichever wall** (`footprintInRoom`, for a piece
moved, turned, swapped or hung). The corner test is exact, and its ray cast counts a point on an
east or south wall (the larger x or z) as outside and one on a west or north wall as inside: a
sofa pushed edge-on into the east wall, which `clampInside` leaves exactly on it, was outlined
red and its drop refused where the same push into the west wall was fine; a piece fitted into any
corner but the north-west was red, and so was a clock hung at the east or south end of a wall.
Judged a nanometre in from its sides, a box on any wall is in, and so is one a clamp's rounding
leaves 1e-16 m past it (`wall + half − half` need not be the wall); a centimetre past is still
out. The matcher judges a product by the same test; only the layout engine keeps the exact one,
because it chooses its spots by it
([layout-and-matching.md](layout-and-matching.md#nothing-stands-through-a-wall)).

**A piece's box is exact at a right angle** (`footprintOf` squares the cosine and sine first —
`trigOf` reads anything under 1e-9 as 0). The corner test is exact, and `Math.cos(-Math.PI / 2)`
is 6e-17, not 0: a bed the engine had pushed flush into a corner at −π/2 got a box 1e-16 m past
the wall and was outlined red, while the engine's own box (`boxFor`) squares the rotation and had
found it inside. The fix belongs in the box, not the test: giving `boxInPolygon`'s corners a few
millimetres of slack lets the engine into corner spots it never took and changes about a hundred
local layouts ([layout-and-matching.md](layout-and-matching.md#nothing-stands-through-a-wall)).

**A rug gets in nothing's way, and nothing gets in a rug's** (`blockersFor`). `blockingItems`
always left the ghosts (rugs, pendants, artwork, curtains) out of what a dragged piece must
avoid, but the rule ran one way: the layout engine laid the rug under the sofa, and once a
person picked that rug up there was no floor in the room to put it down on again, because
every spot worth a rug has furniture on it. A moving ghost now has no blockers; the walls
still hold it in.

**A dining chair tucks under its table** (`tucksUnder`, in `blockersFor`). When a room is tight
the layout engine pushes a seat 12 or 24 cm in towards its table — up to 15 cm of it under the
table's edge — and tests it against everything but the table (`placeSeatAroundTable`); adding a
chair from the shelf seats it the same way (`placeAdditional`). The studio kept the two apart, so
it outlined such a chair and its table red, and a person could not push a chair in. Now a dining
chair and a dining table, either way round, are not in each other's way: a chair drags in under
a table, a table is set down or turned over its chairs, and the walls, the other chairs and
everything else still hold both off. The matcher shares the rule but bounds it — only the
engine's tucks, and only up to half the chair — because it puts products of other sizes into
the engine's slots, where no person is looking
([layout-and-matching.md](layout-and-matching.md#the-product-has-to-fit-the-slot-matcherts--placefitting)).

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
stays as set. A wall-hung piece has no angle row (below).

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

**Turning a hung piece takes it round to the next wall** (`turnOnWall`, which `rotateItem`
hands every wall-hung piece). Turned 45° in place like a chair, a picture stood off its wall on
one corner. Now the card's turn buttons and R move it to the wall whose face looks a quarter turn
that way (the smallest turn in that direction; a slanted wall is a wall of its own): flat
against it, its back a centimetre off the plaster, at the height it hung at, at the spot of that
wall nearest to where it was — round the room corner by corner, four turns bringing it back to
its own wall. The wall it is on is read from where it stands (`hungWall`), so a piece turned off
its wall before this still lands on one. The card offers no angle row for a hung piece
(`onRotateTo` is left out), and R on one riding on the pointer does nothing — the wall under the
pointer decides which way it faces. `tests/unit/design/manipulate.test.ts`.

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
keep taking photos or moving furniture, and that it will be in their profile's renders under
the project: "გაგრძელება" closes the dialog and "რენდერის ნახვა" opens `/profile?view=renders`
scrolled to the project's group (`profileRendersHref`, `lib/projects/links.ts`). The project's
page shows them too — `ProjectRenders` lists every shot with its status and a download of the
screenshot now and of the render once `renderUrl` is set (`GET /api/design/renders`,
`DELETE /api/design/renders/[id]`). **No generator is wired to the queue yet**: rows wait in `queued` until an image model
(or a person) fills `renderUrl` and flips the status.

## Tests

`tests/unit/design/manipulate.test.ts` (rotation, validity, `placeAdditional`, rugs, every wall
alike — a sofa dragged into each, a piece in each corner, a clock at either end of each wall —
dining chairs under their table, a box exact at a right angle, the engine's tucked chair and
corner bed let stand, footprint masks, `fitSwapped`, `hangOnWall`, furniture over a room
separator — straight and diagonal, the partial wall it carries on from, pieces across the line,
no snap through a wall's end),
`tests/unit/design/clearance.test.ts` (with passages across a separator),
`tests/unit/design/catalogBrowser.test.ts`, `tests/unit/design/finishBrowser.test.ts`, `tests/unit/design/shelfRooms.test.ts`,
`tests/unit/store/designStore.test.ts` (carry and swap as one history step, `beginAdd` giving a
carry up), `tests/unit/design3d/footprintFromModel.test.ts`, and `e2e/design-studio.spec.ts`
(a furnished studio with a price). The page, the trays and `ScrollRow` have no tests.

## Known gaps

- **Realistic renders are queued, not produced.** `project_renders` rows wait in `queued`; wiring an image model (the plan is an AI API called with the screenshot and the scene) means a worker that reads the queue, writes `renderUrl` and flips the status — the project page, and the renders of the hubs and the profile, already show both states.
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
