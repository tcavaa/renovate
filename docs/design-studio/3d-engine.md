# The 3D engine: scene building, models, lighting

How the 3D view is built: plain three.js scene builders in `lib/design3d/` driven by the R3F
viewer `components/design/Viewer3D.tsx`, the wall geometry, model loading and framing,
materials, daylight and the world around the flat — and the Three.js mistakes already paid for.
Read this before touching `lib/design3d/`, `Viewer3D.tsx`, `WalkControls.tsx`, or anything
that draws in 3D.

Related: [overview.md](overview.md) · [studio.md](studio.md) (the page around the viewer) ·
[../3d-assets.md](../3d-assets.md) (where the GLBs come from) ·
[finishes.md](finishes.md) (what walls and floors wear) ·
[technical-and-fittings.md](technical-and-fittings.md) (fittings, doors, windows, radiators in
3D) · [plan-board.md](plan-board.md) (the plan the scene is built from).

## Key files

| File | Responsibility |
|---|---|
| `components/design/Viewer3D.tsx` | the R3F canvas (client-only, `dynamic(…, { ssr: false })`): camera and orbit, the doll's-house cutaway, picking and dragging, carry, hover, the `ViewerApi` handed to the page (`floorPointAt`, `dropCarriedAt`, `moveCarriedTo`, `carryPose`, `electricalAt`, `previewElectricalAt`, `fixtureSpotAt`, `screenshot`, zoom, reset, `cameraPose`), keyboard panning, day/night, the sky |
| `components/design/WalkControls.tsx` | the walk-through (no collision; `findStandingSpot` picks the start) |
| `components/projects/ProjectViewer.tsx` | the same `Viewer3D` with `readOnly` — hover, picking and dragging off, the camera and the walk-through kept — for a brigade looking at the flat it is hired for ([../partners-and-admin.md](../partners-and-admin.md)) |
| `lib/design3d/buildScene.ts` | `buildRoomShells` (floors, walls, ceilings, trims, openings), `syncPlacedItems` / `buildPlacedItem` (furniture wrappers reconciled by product and size; `fitToItem`, ghost box on a failed load), `attachOpeningModel`, `wallMaterialFor`, `HIDDEN_LAYER`, `disposeOwnedGeometry`. The viewer composes these itself (`buildScene()` has no callers) |
| `lib/design3d/buildStructure.ts` | free walls, columns, beams (`buildStructure`), fittings (`buildElectrical` / `buildFitting`), radiators (`buildRadiators`), the technical points' equipment (`buildEquipment`: a panel, boiler, air conditioner, hood or fan on its wall at the product's size, a drain set into the floor), the lights after dusk — one per room (`nightLights`, from the fittings' `lightsFrom`; gotcha 25) — the hanging lamps the fittings read (`hangingLampsKey`), floor zones and painted cells |
| `lib/design/wallPieces.ts` + `lib/design3d/wallGeometry.ts` | each room edge cut into pieces by what stands behind it; each piece's mesh face by face (mitres, spans, far-face material slots); `buildMouldingGeometry` |
| `lib/design3d/wallSide.ts` | `wallSideAt` — whose wall a hit on a wall face is (the outside of the flat is nobody's) |
| `lib/design3d/materials.ts` | cached materials and textures by key; `metreSurface`, `whenLoaded`; `releaseUnused` lets go of the finishes no shell wears (gotcha 23) |
| `lib/design3d/modelLoader.ts` | `loadModel` / `loadFixture`: one GLB per URL (meshopt or Draco), clones out, pivot onto y = 0, glass made plain, footprint mask registration; a failed load is forgotten so the next placement asks again |
| `lib/design3d/loadProgress.ts` + `components/design/SceneLoading.tsx` | how many files the view asked for are still on their way (`trackLoad`, `loadStarted`), and the loading screen that waits on it (`useSceneLoading` in the viewer) |
| `lib/design3d/glass.ts` | `plainGlass`: a transmissive glTF material (`KHR_materials_transmission`) turned into plain transparency (gotcha 20) |
| `lib/design3d/instancing.ts` | `instanced` / `alongX`: one model at several places as one `InstancedMesh` per mesh — radiator sections, a socket's plates, railing modules (gotcha 21) |
| `lib/design3d/draco.ts` | `DRACO_DECODER_PATH`: where every browser loader finds the Draco decoder (`public/vendor/draco`, `pnpm draco:decoder`) |
| `lib/design3d/footprintFromModel.ts` | a model's covered floor read off its triangles (→ `lib/design/footprintMasks.ts`) |
| `lib/design3d/daylight.ts`, `environment.ts` | lighting for an hour (`lightingForHour`); the sky texture and the ruled ground |
| `lib/design3d/outline.ts`, `primitives.ts` | selection outlines (wireframe boxes); the few geometry helpers |
| `lib/design3d/modelPreview.ts` | the catalogue page's turntable (plain three.js) |
| `lib/design3d/fixtureManifest.ts`, `radiatorManifest.ts`, `equipmentManifest.ts` | generated model lists ([../3d-assets.md](../3d-assets.md)) |

## Three.js gotchas already paid for

Each of these cost real debugging time. Don't undo them.

1. **Stop propagation in pointer handlers.** R3F calls a handler once for *every* object the
   ray passes through, nearest first. Without `event.stopPropagation()` in `pick()`, the last
   call — the wall behind the sofa — is the one that sticks.
2. **Handlers go on an R3F-created `<group>`, not on `<primitive>`.** R3F only registers
   objects it constructed in its interaction list.
3. **Selection is resolved from pointerdown/up travel, not `onClick`.** OrbitControls captures
   the pointer, and the click that would follow does not reliably reach the scene.
4. **Never yield with `requestAnimationFrame` before CPU work.** rAF does not fire in a
   background tab, so a user who switches away mid-parse would sit on a spinner for ever.
   `setTimeout(…, 16)` yields just as well and always fires.
5. **Ceilings face down**, so they are backface-culled and invisible from the doll's-house
   camera. The studio exposes a *walls* toggle instead; `showCeiling` is on only in the
   walk-through (`showCeiling: walking`), where the camera is inside.
6. **The dev server's `next/dynamic` chunks go stale** after a run of Fast Refresh edits to
   the viewer (`ChunkLoadError … /_next/undefined`). A hard reload fixes it; it is not a bug
   in the app and does not affect production builds. Separately, and more destructively:
   `pnpm build` or `rm -rf .next` against a *live* dev server makes every page 404 while
   `/public` keeps serving — see the warning next to the command list.
7. **Highlighting must not tint materials.** Materials are cached and shared by colour and
   finish, so setting `emissive` on a mesh lights up every item that shares it. Selection and
   hover use a wireframe outline box instead.
8. **Drag has to listen on the canvas, not on the R3F object.** The moment the pointer
   outruns the object it is dragging, R3F stops delivering moves for it.
9. **`@types/three` is pinned via a pnpm override.** drei pulls a floating newer copy, and two
   copies of the types make `camera.quaternion.setFromEuler(...)` a type error.
10. **Never dispose a GLB clone's geometry.** Furniture wrappers are `clone(true)` of a cached
    model and share its buffers; disposing them makes every model re-upload on the next rebuild.
    Only geometry the builders created themselves (`buildScene`, `buildStructure`'s `own()`,
    ghost and edge meshes) is tagged `ownsGeometry` and disposed.
11. **Surface UVs are in metres, so `materials.metreSurface` is what tiles them.** Every
    surface the studio builds carries its real size as its UVs (a `ShapeGeometry` floor its
    plan coordinates, a wall its metres along and up), so one tile of a texture covers
    `textureScaleM` metres whatever the surface's size. Passing the surface's own size to
    `surface()` on top of metre UVs tiled it by the *square* of the size: a four-metre wall
    got four times the bricks per metre that a two-metre one did. A map is also only put on
    the material once its image has arrived (`whenLoaded`) — a texture with no image samples
    as black, which is what left a freshly painted strip pitch black for a beat.
12. **The CSP needs `connect-src blob:`.** GLTFLoader hands the textures packed inside a GLB to
    the browser as blob URLs and fetches them back. Without it every model loads untextured and
    the only symptom is a console warning. (`connect-src` in `next.config.mjs` is `'self' blob:`
    plus the `S3_PUBLIC_URL` origin when set, and `ws: wss:` in development.)
13. **Furniture is reconciled, not rebuilt.** `syncPlacedItems` moves wrappers whose product and
    size are unchanged and replaces the rest; the room shells are a separate group memoised on
    the plan, finishes, style, materials and the shell options (walls, ceiling, focused room),
    and the fittings, the radiators and the equipment are groups of their own. Rebuilding everything on every drag was the studio's biggest stutter.
    The fittings read one thing of the furniture — where its hanging lamps hang (a ceiling point
    under one shows only the rose) — so they are memoised on that (`hangingLampsKey`), not on the
    items: every drop of a sofa used to clone every socket, switch and lamp in the flat anew.
14. **A wall is written out face by face, mitred, and cut where what is behind it changes**
    (`lib/design/wallPieces.ts` + `lib/design3d/wallGeometry.ts`). `ExtrudeGeometry` could
    not do any of the three: a slab as long as the room's inner edge stopped short of the
    corner, so every outside corner and every T-junction had a notch a wall thick cut out of
    it — walls that met on the plan stood apart in 3D. Each piece is now mitred (its far
    face runs on to where the two walls' outer lines cross, or stops short at an inside
    corner), an edge is cut into pieces wherever the room behind it begins or ends (a wall
    shared for four of its six metres used to be half-depth for all six), and the top and
    the cut ends get their own neutral material instead of the room's paper. Where the
    geometry is ambiguous the piece is built full depth and allowed to overlap: a gap is
    what the eye catches, an overlap inside a wall is invisible. The old note still holds
    for *why* a shared wall is half as deep —
    **each half's far face wears the neighbour's finish.** Each room builds its own walls
    outwards from its inner face, and two rooms either side of one wall sit a thickness apart —
    so a full-depth wall from each put room A's outer face exactly on room B's inner face, and
    the two colours z-fought, flicking as the camera turned. (An edge on a room separator is
    open, `PlanRoom.open`: `planEdgeWalls` gives it no pieces and `buildRoomScene` builds no
    wall or moulding along it — [plan-board.md](plan-board.md#room-separators-libdesignseparatorsts).)
    `planEdgeWalls` (in
    `wallPieces.ts`) therefore gives a piece half the wall's depth wherever another room's edge
    stands behind that stretch (`piece.neighbour`), full depth elsewhere, so the halves meet on
    a plane nobody sees while both stand. The cutaway
    hides one half at a time, though, and then the other half's face on that middle plane is
    what the camera sees from the first room — so each piece's far face is painted with the
    material of whoever stands behind *that stretch* (`farSlots`, from `piece.neighbour`).
    Before this the bathroom's tiles showed up on the living-room side of the wall whenever
    the living room's half was cut away. A far face with nobody behind it (the outside of the
    flat) is the building's brick (`FACADE_LOOK` in `lib/design/styles.ts`, the exposed red
    brick finish's texture, no product, never priced) — except a balcony's own walls, whose
    outside keeps the neutral cut material (`WALL_SLOT_CAP`): the balcony is the person's to
    finish. The tops and ends of every wall are always the cut.
    **A flat has one ceiling.** Every new room starts at `DEFAULT_CEILING_M` (2.8 m,
    `lib/calculator/constants.ts`) — or the flat's `wallHeightM`, or the height its rooms
    already have — whatever kind it is (`roomsFromWalls`, the CV and Claude readers, a room
    drawn in the studio). Each kind had a height of its own once (a kitchen 2.7 m, a bathroom
    2.5 m), so a kitchen's walls stood a step lower than the rest. A room's height can still be
    set by hand (the inspector, the calculator's form); rooms saved before keep theirs.
15. **`visible = false` does not stop a raycast.** Three's raycaster honours `layers` and
    ignores `visible`, so a cut-away wall still caught every click aimed at the sofa behind it.
    Anything hidden from the pointer goes on `HIDDEN_LAYER` (the cutaway walls, the idle
    opening slabs); the default raycaster only tests layer 0.
    **The walls menu works the same way** (`lib/design3d/wallMode.ts`). Every room wall is built
    twice — at its height and as a 25 cm stub (`WALL_STUB_M`, holed only where a door, a railing
    or a floor-length window comes down that far) — and each part that stands with a wall
    carries `userData.wallCut` (`WallCut`: wall, stub, skirting, cornice, opening, beam; its
    wall's outward side and middle; whether an opening is to the outside). Free-standing walls
    get a stub too and beams are tagged. The viewer's `useFrame` asks `wallPartVisible(mode,
    kind, cameraFacesWall(…), exterior)` for each part and moves a hidden one's whole subtree
    to `HIDDEN_LAYER` — every frame while hidden, since a door's model lands in its group after
    the shell is built (the opening slab keeps its own rule). A change of mode rebuilds
    nothing: it only asks for a frame.
16. **`fetch(dataUrl)` is refused by the CSP.** `connect-src` has no `data:`, so the usual
    trick for turning a canvas data URL into a Blob dies silently in the console. The photo
    dialog decodes the base64 by hand (`dataUrlToBlob`). Images may *display* data URLs
    (`img-src` allows them); nothing may fetch them.
17. **The shared glass material was the night-time windows.** Every window pane used one
    cached `glass` material, so setting its `emissive` at night lit every window at once — the
    one place tinting a shared material is the point, not the bug of gotcha 7. The viewer still
    does this, but windows are now GLB models with their own materials, so nothing uses the
    cached `glass` any more and no window glows at night (Known gaps).
18. **Screenshots must render first.** Without `preserveDrawingBuffer` the canvas is blank
    between frames, so `ViewerApi.screenshot` calls `gl.render(scene, camera)` and reads the
    canvas in the same tick.
19. **Never set `scale` or `position` on a node that came out of a GLB — wrap it.** The
    fixtures pipeline compresses with meshopt, whose quantisation leaves each node carrying
    an offset and a scale that put its integer vertices back in metres. `attachOpeningModel`
    once stretched a door by writing `part.scale.set(...)` and `part.position.set(...)` on
    the loaded nodes: every leaf stood half in the floor and every window was a third taller
    than its hole. Each part now sits inside a `Group` of its own that carries the stretch and
    the hinge offset. `stretchTo` and `reframe` are fine because they scale the model's root.
20. **Glass is plain transparency, never transmission.** A glTF material with
    `KHR_materials_transmission` makes three render every opaque object in the flat a second
    time, into a full-size target, every frame one is on screen. That was two wall clocks (the
    stock `ph-wall_clock`), about 25 of a 46 ms frame. `plainGlass` (`glass.ts`) turns it into a
    transparent material that writes no depth, on the cached original as it loads — so every
    clone, every upload, and the catalogue's turntable get it too. The files are stored with plain
    glass as well — the five stock and fixture models that had it (`pnpm models:compress`) and
    every upload (`plainGlassMaterials` in the upload recipe) — so the loader's pass is the net
    under a file that still carries transmission.
21. **An instanced run shares its model's geometry — dispose only the instances.** Radiator
    sections, a double socket's plates and a railing's modules are one `InstancedMesh` per mesh
    of their model (`instancing.ts`). Its geometry and materials are the loader's cache, so
    `disposeOwnedGeometry` calls the instanced mesh's own `dispose()` (its instance buffers)
    and never its geometry's (gotcha 10). A group that holds runs — fittings, radiators, the
    shells with their railings — must be disposed when it is dropped, or the per-copy buffers
    stay on the GPU. Each placement is a matrix in the frame the model would have stood in; the
    model's own node transforms are read and kept under it (gotcha 19).
22. **Lights are lights only from dusk.** By day a switched-on fitting is its glowing shade
    (`litModel`) and no `pointLight` at all: every point light is paid on every lit pixel, and a
    generated flat's dozen cost about a third of the frame. The count of point lights is part of
    three's shader key, so the switch at dusk recompiles the materials once.
23. **Finishes let go of their maps.** `StyleMaterials` keeps every surface material and
    texture it makes; after each rebuild of the shells the viewer hands `releaseUnused` the
    materials the shells wear, and the rest are disposed with the textures only they held — kept
    30 s first (a room back in view, an undo), unless more than 24 idle textures pile up, when
    the longest idle go at once. A 1024-pixel map is about 5.6 MB of GPU memory with its mips,
    and every tile tried used to stay until the studio closed.
24. **The canvas draws when something changes, not every frame** (`frameloop="demand"`; the
    walk-through, which moves the camera every frame, keeps `always`). An idle studio used to
    draw its whole frame sixty times a second. A frame is drawn when R3F sees a React change (a
    new shell, a prop on a light), when drei's `OrbitControls` moves the camera or eases it, and
    when `SceneContent` asks with `invalidate()` — after everything it changes outside React: the
    furniture synced (`syncPlacedItems`), an outline, the carry and every drag step, the paint
    glow, the fitting's preview, the framing and the zoom, the exposure and the night glass, the
    keyboard pan (whose frame loop asks for the next frame while a key is held). Models, fixtures
    and textures land in the scene asynchronously, so the viewer also asks for a frame whenever
    `loadProgress` changes: every first load is counted there, and the frame comes after the
    handlers that put the file in place have run (a cached one is in place before the frame its
    change asked for). **Anything new that changes the scene outside React must call
    `invalidate()`**, or it shows only when the camera next moves. The cutaway's `useFrame` runs in
    each frame drawn, which is all it needs: it follows the camera. A frame-counting measurement
    sees nothing while the studio rests — time a render with `ViewerApi.screenshot()` instead.
25. **After dusk a room is lit by one light, not one per fitting** (`nightLights`). Every point
    light is paid on every lit pixel, and their number is part of three's shader key: a lamp
    switched off took one away and recompiled every lit material in the flat (22 programs on the
    sample flat), a stutter at each switch. Now the switched-on fittings of a room light it
    together — from where their light is centred, weighted by brightness, as bright as they are
    together and reaching as far as the furthest did — and a room whose lights are all off keeps
    its light at zero, so a switch changes an intensity and never the count. A room with no light
    fittings gets none; with no light on anywhere every room in view is lent a lamp under its
    ceiling (`standIn`, dimmed with the evening). The fittings that are on still glow where they
    hang (`litModel`). On the sample flat (12 lights on in 7 rooms) the night's lighting went from
    ≈ 2.4 to ≈ 1.0 ms of a 2520 × 1361 render on an M4; the first switch compiles only that lamp's
    own unlit materials (3 programs), later ones nothing.

## A gap to the top of the wall: a balcony's railing

Every hole in a wall stopped 2 cm under its top and 2 cm in from its ends, and the wall's top was
one quad over the whole piece. A railing's gap (`lib/design/openings.ts`) has no wall above it,
so `buildScene` cuts it from the floor to the wall's full height and from corner to corner, and
`buildWallGeometry` cuts the top too wherever a gap reaches it — each stretch of the top drawn
from whichever of its two sides is longer, since at a mitred corner what is left is a triangle.
A gap given as running past the edge's end (`left: -Infinity` / `right: Infinity`) takes the
corner's triangle and the piece's end face with it: `buildScene` asks for that only when the next
side's railing runs into the same corner, so two railings meet with no post of wall between them
while a railing against a standing wall leaves that wall's mitred end whole. `WallHole.floor`
closes the gap's floor across the wall's depth (the slab running out under the railing). Tested
in `tests/unit/design/railings.test.ts`.

## Wall-mounted geometry: use `edge.facing`, never the edge direction

`edge.facing` is the rotation that puts a box's **width along the wall** and its **depth
through it**. `Math.atan2(edge.dir.x, edge.dir.z)` is 90° off and lays everything across the
wall at right angles — that bug shipped once in the window frames, door casings and skirting
and is very easy to reintroduce. Doors also have to pivot from a group placed at the hinge;
rotating the leaf itself spins it about its middle like a revolving door.

## Loading models

**Models stand on y = 0, centred on x/z.** That is the converters' output and what the
wrapper (placed at the centre of the footprint, on the floor) assumes. `loadModel` shifts
every file onto that origin on a pivot above its own transform, because an uploaded GLB
comes with whatever origin its tool chose — Meshy centres on the bounding box and half the
piece sat below the floor.

**A model that fails to load is not an empty slot.** `buildPlacedItem` used to swallow the
error, so a 404 or a broken file looked exactly like "no product" — an invisible item with a
selection box around it. Now the item gets a translucent ghost box in the product's colour
and a `console.warn` naming the product and URL; a slot with no product at all still draws
nothing. The loader forgets a failed file (`remember` in `modelLoader.ts`): the next placement
of that product asks the server again, where one dropped request used to leave it a ghost box
until the page was reloaded.

**Geometry arrives compressed one of two ways.** The larger shipped models and every upload
since the Draco recipe are Draco (`KHR_draco_mesh_compression`, about 40 % of meshopt's bytes
as the studio serves them); small pieces and older uploads are meshopt. The loader has both
decoders: meshopt's is inline, Draco's is fetched from `public/vendor/draco` the first time a
Draco model arrives and decodes in web workers of its own (the CSP allows `worker-src blob:` and
`'wasm-unsafe-eval'`). Textures are WebP. How the files are made: [../3d-assets.md](../3d-assets.md).

## The loading screen (`lib/design3d/loadProgress.ts`)

A freshly generated flat used to appear piece by piece: the walls at once, then each sofa,
lamp and floor as its file landed. Now `SceneLoading` covers the canvas until the flat is all
there:

- `loadProgress` counts the files the view asks for and has not got yet — a model's or a
  fixture's first load in `modelLoader` (the promise up to the parsed, readied model) and a
  texture's in `StyleMaterials.whenLoaded` — and tells its listeners once per batch (a scene
  build asks for dozens in one go). A file already in a cache is not counted; a failed one is
  done.
- `Viewer3D`'s `useSceneLoading` puts the screen up from the moment the viewer mounts, waits for
  `SceneContent`'s first build (`onBuilt`, an effect that runs after the shells, fittings and
  radiators were built while rendering and the furniture in its layout effect — by then every
  file the first scene needs has been asked for), then for nothing to be pending for 300 ms (a
  bare door leaf asks for its casing only once it is in, a finish product may arrive with the
  catalogue), and fades out. The bar counts the files asked for since the viewer mounted.
- It never holds the studio longer than 45 s, however slow the connection.
- Once a flat has been shown whole on the page, a viewer of *that flat* mounted again (from the
  2D board, or the walk-through) skips the screen (`sceneShownWhole`, by the viewer's `sceneKey`
  — the project id in the studio): the models are cached, and only textures — per viewer — come
  again. It was one flag for the page, so the next project opened in the tab skipped its screen. Later loads (a piece added, a style changed) show as before, as each arrives.
- The studio's `ViewerFallback` (while three.js and the viewer's chunk arrive) is the same
  screen without a count, so the two follow on without a jump. The project page's viewer gets
  the screen too.

Measured on the sample flat over a throttled 1.5 MB/s link, cache off: the screen is up from
1.8 s, counts 50 files (36 GLBs, the rest textures) from 5 s and is gone at 9 s.

## When the 3D view fails (`components/design/ViewerGuard.tsx`)

The viewer's `<Canvas>` and its loading screen sit inside `ViewerGuard`:

- **No WebGL** (`webglAvailable()`, asked once with a throwaway canvas): a notice in the person's
  language says so, and the rest of the page — trays, the 2D board, the budget — works. R3F's
  renderer used to reject unhandled, and the loading screen spun for its 45 s cap over a blank
  canvas.
- **A builder that throws** while the scene is built (R3F re-throws its errors into the page's
  tree): an error boundary shows "the 3D view could not be built" with *try again* (a fresh
  canvas and build), and the error goes to Sentry (`area: viewer3d`). It used to take the whole
  studio down to the page's error screen.
- **A lost GPU context** (a driver reset, a tab long in the background): three takes the context
  back by itself, and `webglcontextrestored` asks for a frame — under demand rendering nothing
  else would, and the view stayed black until the next touch.
- **A texture that failed** is forgotten (`whenLoaded`), so the next surface that wears it asks
  again; kept, the image-less texture sampled black on every later use. Tested in
  `tests/unit/design3d/materials.test.ts`.
- **A Draco decoder that failed to arrive** is replaced (`modelLoader`'s `dracoDecoder` /
  `replaceDecoder`): DRACOLoader keeps its decoder promise for good, a rejected one too, so every
  Draco model was a ghost box until a reload. The replacement fetches the decoder again when the
  next Draco model asks (`tests/unit/design3d/dracoRecovery.test.ts`).

## Time of day and the world around the flat

**Time of day** is a preset in the top bar (morning / noon / evening / night → hours 8, 13,
19, 23). `lightingForHour(hour, style)` is pure arithmetic over a 24-hour clock: the sun's
position swings east to west and rises and sets, its colour warms when low, the sky and the
exposure follow, and from dusk the flat's own lights come on: each room with lights of its own is
lit by one `pointLight`, its switched-on fittings merged (`nightLights`, gotcha 25), and when the
flat has none on, one per room under the ceiling, sized to the room. By day a fitting that is on
only glows — its lamp materials lit (`litModel`) — and is no light (gotcha 22), so a room's
shaded walls and floor — most of what is seen indoors — are lit by the sky alone: the day's sky
light is 1.25 × the style's `ambientIntensity` (`DAY_SKY_LIGHT`), the flat fill 0.14 at noon and
0.22 with the sun low, the exposure 1.02–1.14. That brightened the sample flat's rooms by about a
fifth at noon (the shadowed quarter by two fifths) and an eighth morning and evening; the night
is unchanged. (The viewer also turns the cached window glass
emissive, which no longer shows — see gotcha 17.) The style still tints the sun and the lamps.
Tested in `tests/unit/design/daylight.test.ts`.

**The flat stands in a world** (`lib/design3d/environment.ts`, September 2026, after a
reference floor-planner): a sky behind everything — the hour's colour overhead
(`Daylight.skyTop`: a clear blue at noon, a paler warm morning, an evening glowing orange low
down, a near-black night) paling to a haze at the horizon (`skyHorizon`) — as an
equirectangular `DataTexture` on `scene.background`, and a ground under it: one large lit plane
a centimetre below the floors (and pushed back with `polygonOffset`, since from far off a
centimetre is below the depth buffer's resolution), ruled like the 2D board's sheet — half-metre
cells, a darker line every 2.5 m — in its own shader (`onBeforeCompile`, lines anti-aliased
with `fwidth` and let go before they turn to moiré), centred under the flat, taking its shadow
and darkening at night like everything else. Its `raycast` is a no-op: a click on the ground is
a click on nothing. **The fog is the horizon colour** (`Daylight.background === skyHorizon`,
60 → 190 m against a 200 m far plane), and that is what makes the ground meet the sky without a
seam: three mixes fog in *after* tone mapping and the output conversion, and an sRGB background
is not tone-mapped, so one hex colour comes out the same on both.

## Tests

`tests/unit/design3d/wallGeometry.test.ts`, `wallSide.test.ts` (including the removed accent
wall), `environment.test.ts`, `cornice.test.ts`, `footprintFromModel.test.ts`, `nightLights.test.ts`
(a light per room, a switch that keeps the count, the stand-in lamps, the hanging-lamp key);
`tests/unit/design/wallPieces.test.ts`, `daylight.test.ts`. Pure three.js runs under Vitest's
`node` environment as long as nothing needs a WebGL context. R3F 9 configures the renderer
asynchronously, so anything waiting for the first model (e2e, screenshots) has to poll.

## Known gaps

- At night the viewer still tints the cached `glass` material, but windows are GLB models with
  their own materials now, so no window glows (gotcha 17 describes the intent).
- The first-visit tour (`TutorialOverlay`) opens at once, over the loading screen, rather than
  after it.
### Performance

**Measured** on an Apple M4 with the sample-plan flat furnished (about 40 items, 37 fittings,
12 lights on), locally on a production build and on production, at a 1440 × 900 window (a
2520 × 1361 canvas at the 1.75 pixel-ratio cap). GPU time was read with
`EXT_disjoint_timer_query_webgl2`, draw calls by wrapping `drawElements` (`threejs-performance`
skill); the timer is noisy once a frame is cheaper than the gap between frames, so the counts
are the firmer evidence.

| Per frame | Before | After gotchas 20–23 and the instanced runs |
|---|---|---|
| GPU time | ≈ 46 ms (≈ 22 fps at best) | ≈ 10–12 ms |
| Draw calls | 743 | 373 |
| Full-scene passes besides the picture | 3 (shadows, transmission, its resolve and mipmaps) | 1 (shadows) |
| Triangles | ≈ 1.0 million | ≈ 0.59 million |
| Point lights by day | 12 | 0 |
| Shader programs | 39 | 25 |

Since then (October 2026, the sample flat with 45 items, headless Chrome on the M4): **resting, the
studio draws nothing** — 0 frames in 3 s — where it drew sixty a second; an orbit drag draws while
it moves and eases, a drop draws its steps and a few frames when the autosave answers. **At night**
the flat's 12 lights on are 7 point lights, one per room: ≈ 4.7 ms a render against ≈ 6.0 ms for
twelve (3.6 ms by day). **On production** (1 Oct 2026, Chrome 154, 55 items, a 2520 × 1065 canvas):
GPU ≈ 5.4 ms and JavaScript ≈ 5 ms a frame, 545 draw calls (338 for the picture, 207 in the shadow
pass), 0.67 million triangles; **GPU memory ≈ 424 MB**, 401 MB of it textures (65 at 1024 px, 41
at 512) — WebP files do not shrink that, a texture is uncompressed on the GPU — 5.4 MB of buffers
(Draco decodes geometry to floats: the same 59 models hold 5.1 MB where meshopt's quantised
buffers held 3.5) and 17.5 MB of the canvas's own buffers. The Claude app's Browser pane measures
the same scene far slower (≈ 40 ms of JavaScript a frame under its viewport emulation): compare
pane with pane.

What is still open, in order of expected payoff:

- **The cost grows with pixels.** The pixel-ratio cap of 1.75 draws three times the pixels of
  a 1.0 canvas on a retina screen; drei's `PerformanceMonitor` could lower it when frames fall.
  At night each lit room still adds a point light (gotcha 25).
- **Every paint click rebuilds every room's shell** (`shell` depends on `scene.finishes`).
- **Switching between the 2D board and 3D rebuilds the 3D view from scratch.** `Viewer3D` is
  unmounted while the board shows, so coming back makes a new WebGL context, compiles every
  shader and uploads every model and texture again. Only the parsed GLBs survive in
  `modelLoader`'s cache.
- **Textures are not GPU-compressed.** A decoded 1024-pixel map is ≈ 5.6 MB of GPU memory with
  its mipmaps whatever its file format; KTX2 (Basis) would cut that four to eight times but
  needs an encoder in every pipeline and the upload recipe, and a transcoder in the studio.
- Smaller: the studio page reads the whole design store (`useDesignStore()` with no
  selector), so every store change, the autosave's status included, re-renders the page and
  the viewer. The materials of lit lamps (`litModel`), the fitting preview's ghost material
  and the opening slabs' materials are never disposed. A ghost box's geometry is not freed
  when its item goes.
