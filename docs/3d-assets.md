# 3D assets: models, textures and the catalogue seed

Where every model and texture the studio uses comes from, the scripts that produce them, the
conventions a file must meet to be placed, and how `pnpm models:seed` turns the manifests into
products. Read this before touching `scripts/` (the model/texture pipelines), anything under
`public/models/` or `public/textures/`, the GLB upload routes and their optimizer
(`lib/uploads/glbOptimize*.ts`), or `lib/design3d/modelLoader.ts`.

Related: [catalog.md](catalog.md) (products and the admin form) ·
[design-studio/3d-engine.md](design-studio/3d-engine.md) (how models are loaded and placed) ·
[design-studio/technical-and-fittings.md](design-studio/technical-and-fittings.md) (fittings,
doors, windows and radiators — their models' framing rules) ·
[design-studio/finishes.md](design-studio/finishes.md) (finish products and trims) ·
[operations.md](operations.md) (the deploy runs `models:seed`).

## The pipelines

| Command | Script | Output |
|---|---|---|
| `pnpm assets:extract` | `scripts/extract-assets.sh` | product renders → `public/uploads/furniture/`, PBR maps → `public/textures/`, from the partner asset drop (outside the repo) |
| `pnpm models:convert [--only=a,b]` | `scripts/convert-models.ts` (+ `scripts/lib/objGroups.ts`, `textureClassify.ts`) | the partner's OBJ exports → textured, meshopt-compressed, validated GLBs in `public/models/` + `public/models/manifest.json` (17 entries) |
| `pnpm models:stock [--inspect] [--only=…]` | `scripts/stock-models.ts` | CC0 stock furniture (Poly Haven + Kenney) → `public/models/stock/` + its `manifest.json` |
| `pnpm models:fixtures` | `scripts/fixture-models.ts` | sockets, switches, lamps, doors and windows (Poly Haven, poly.pizza) → `public/models/fixtures/` + manifest, and the generated `lib/design3d/fixtureManifest.ts` |
| `pnpm models:radiators` | `scripts/radiator-models.ts` | four radiator designs written in code, one section each → `public/models/radiators/` + the generated `lib/design3d/radiatorManifest.ts` |
| `pnpm models:equipment [--only=a,b]` | `scripts/equipment-models.ts` | twelve pieces of technical equipment (electrical panels, a boiler, a water heater, air conditioners, cooker hoods, a bathroom fan, a floor drain, TV and data sockets) from CC0 / CC BY / CC BY-SA sources → `public/models/equipment/` + manifest + the generated `lib/design3d/equipmentManifest.ts` ([below](#equipment-models-scriptsequipment-modelsts)) |
| `pnpm models:kitchens [--only=a,b]` | `scripts/kitchen-models.ts` | one straight kitchen run per kitchen-maker material (LDSP, MDF, veneer), a CC BY source re-textured three ways → `public/models/kitchens/` + manifest ([below](#kitchen-runs-scriptskitchen-modelsts)) |
| `pnpm models:photos [--only=a,b]` | `scripts/model-photos.ts` | a product photo per fixture, radiator, piece of equipment and kitchen run, rendered from the model in Playwright's Chromium |
| `pnpm models:colors [--force]` | `scripts/model-colors.ts` (+ `scripts/lib/modelColor.ts`) | each furniture model's colours read off its triangles into the manifests |
| `pnpm textures:stock` | `scripts/stock-textures.ts` | ~35 floor/wall finish textures (partner drop, Poly Haven, ambientCG) written straight to the database as surface products, thumbnails in `public/uploads/products/`, each finish's colours read off its texture into `specs.colors` |
| `pnpm textures:colors [--force]` | `scripts/texture-colors.ts` (+ `lib/uploads/textureColors.ts`) | every textured product's colours read off its texture into `specs.colors`, for the finishes' colour filter — only what is missing unless `--force`; the textures the product form uploads get theirs as they arrive |
| `pnpm models:seed` | `scripts/seed-models.ts` | the catalogue made to match the manifests (below) |
| `pnpm deploy:bundle-seed` | esbuild | `models:seed` as one plain-node file beside the standalone server (the cPanel deploy runs it) |

Generated files (`lib/design3d/fixtureManifest.ts`, `radiatorManifest.ts`, `equipmentManifest.ts`,
the manifests) are never edited by hand — change the script's source list and re-run it.

## What `pnpm models:seed` does

Reads the five manifests — `public/models/manifest.json` (partner), `stock/`, `fixtures/`,
`radiators/`, `equipment/` — and:

- writes one product per manifest entry (prices, stores and names from the manifest win over
  admin edits of those rows), plus the fixtures, radiators, equipment (the credit its licence
  asks for as the description; `rank` and `coverM2` in `specs`; whole centimetres, at least 1)
  and the skirting/cornice range (`scripts/lib/trimProducts.ts`), creating a missing category —
  and its missing parents — where the starting tree puts it (`DEFAULT_CATEGORY_TREE`);
- writes the kitchen maker's three materials (`scripts/lib/kitchenMaterials.ts`: per m² of
  façade, in `kitchen-custom`), each with its kitchen run from `public/models/kitchens/manifest.json`
  as its model (`kitchen_run`) when the manifest has one — a model admin uploaded for a material
  (anything not under `/models/`) is theirs and stays, and without a manifest model a material
  keeps whatever model it has — and makes the kitchen maker's store when the database has none
  ([budget.md](budget.md#kitchens-are-measured-and-made-in-the-makers-material-libdesignkitchents));
- files each product in the category tree by its 3D kind (`categoryForKind`: the category that
  takes the kind — "Corner sofas" — else the archetype's own); one admin filed elsewhere under
  the archetype's category stays where it was put, one moved outside it goes back
  ([categories.md](categories.md));
- deletes every other manifest-managed product with a `model3dKind` — including ones with a
  `model3dKind` and no `model3dUrl`. A product whose `model3dUrl` is not under `/models/` (an
  admin or partner upload) and a person's own product (`ownerUserId`) are left alone;
- deactivates (does not delete) active furniture, sanitary and lighting products that have no
  model, and surface products that have no texture (each category with its subtree) — so only products with a 3D model or a
  texture are on sale in the calculator's catalogue. The doors, windows and sockets & switches
  categories are left alone.

## Where the partner assets come from

Source assets for these live in `/Users/torniketsava/Downloads/3D OBJECTS WITH STYLES_DRAFT_03.03.2026`
(1.6 GB of `.rar`/`.zip` 3ds Max scenes). **macOS `tar` (bsdtar/libarchive) can read `.rar` —
no `unrar` needed.** `scripts/extract-assets.sh` pulls the usable parts out of them:
product renders → `public/uploads/furniture/`, PBR maps → `public/textures/`.
The `.max`/`.fbx` files are offline-render scenes and stay where they are; the `.obj` exports
are what `scripts/convert-models.ts` turns into the GLBs the studio places. A `_PREVIEWS/`
folder holds clean-named renders of every archive and is the quickest way to see what a
cryptically named `.rar` contains.

## What a model file has to be

The studio scales every model to the product's dimensions (`fitToItem`), so a model in the
wrong units still renders at the right size; what it cannot fix is orientation — the front
of a piece has to face +Z with Y up, which is what `pnpm models:convert` produces and what
the uploader's arrow shows. The upload route also refuses a GLB that *requires* Draco or
Basis (`lib/uploads/glb.ts`): the studio's loader has neither decoder, and such a file would
upload fine and then render as nothing. Meshopt is fine. What is stored is not the file as it
was picked but its optimized copy (next section).

## Uploads are optimized

A model uploaded in the product form or as a person's own furniture never goes through the
import scripts, so it arrives the way its tool exported it: a Meshy export is three 2048-pixel
JPEGs (4–5 MB) beside 1–4 MB of 32-bit geometry with tangents, nothing compressed — 5–10 MB for
a sideboard a converted partner model would carry in 0.8. Both upload paths therefore run one
recipe (`glbOptimize.ts`, isomorphic):

- **Geometry**: `dedup` (keeping uniquely named parts), `dequantize` (a converted model sent
  again is quantised; welding and simplifying want floats), `weld`, then `simplify` only as
  far as 0.01 % of the model's size — coplanar triangles merge, nothing visible moves. A model
  still over **100 000 triangles** is taken down to that in steps of 0.05 %, 0.1 % and 0.2 % of
  its size and no further. `prune` keeps empty nodes (a model's named parts are its own
  business), and `meshopt` (level `high`) quantises and compresses, which the studio's
  `MeshoptDecoder` already reads. No `flatten` and no `join`: the node tree stays as uploaded.
- **Textures**: WebP (`EXT_texture_webp`, required — three's loader reads it natively). The
  **colour map keeps up to 2048 px**; normal, metallic-roughness and occlusion maps go to
  1024 px (`getTextureColorSpace` tells them apart). Shrinking the colour map too was tried
  and dropped: AI-made models pack it into hundreds of patches edge to edge with no gutter,
  and at half the size neighbouring patches bleed into each other — green and pink triangles
  across a wooden drawer front, at any resampling filter. A texture already WebP within its
  size is left alone; a conversion that is not smaller is not kept (a resize always is — it is
  GPU memory as much as download).
- **A file that already meets all of it is kept byte for byte**, and so is one the recipe
  cannot read or would not make smaller (`status: 'kept'`, with `already-optimized`,
  `failed` or `not-smaller`) — the upload then goes on exactly as it did before there was a
  recipe. Nothing here ever refuses a file.

**Where it runs.** First in the uploader's browser — `optimizeModelForUpload`
(`components/admin/ModelUploader.tsx`, shared by `components/studio/OwnModelDialog.tsx`)
imports `glbOptimizeBrowser.ts` on demand (one lazy chunk, ~300 kB, 83 kB gzipped, never in
the pages' initial JavaScript) and re-encodes textures through a canvas; the uploader shows
"optimizing…" and then the size it went from and to. This is what lets a typical upload fit
the 4.5 MB a Vercel function accepts. A browser that cannot write WebP (Safari: `convertToBlob`
quietly answers with a PNG) shrinks an oversized JPEG as a JPEG and leaves the rest — the
geometry is still compressed, and the three uploads below came to 1.8–3.6 MB that way. Then in
the route — `optimizeUploadedModel` (`glbOptimizeServer.ts`, sharp, Lanczos) in
`/api/upload/model` and `/api/design/models` — which keeps a browser-optimized file as it is
and finishes any other: a Safari upload, a failed browser pass, a script posting straight to
the route. The log says which: `model uploaded` (and `own model added`) carries
`optimized: server | already-optimized | not-smaller | failed` beside the bytes received, and
`model optimized` the bytes, triangles and time of a pass the route did itself.

**What it measured** (Apple M4, the admin uploads it was written for): a 5.70 MB sideboard →
0.36 MB (44 042 → 25 792 triangles) in 0.4 s; an 8.41 MB figure → 0.85 MB in 0.4 s; a 21.3 MB
scan of 489 062 triangles → 1.16 MB at the 100 000 cap in 0.8 s, the server process peaking
around 500 MB. Renders of the originals and the optimized files through the studio's loader
differ in 0.1 % of pixels at room distance and 0.3–1 % in close-ups. GPU memory for the three
textures halves (67 → 34 MB: a decoded 2048-pixel map is 22 MB with its mipmaps, whatever its
file format). The browser pass took about 1.2 s for each of them in Chrome on the same
machine, the 21 MB scan included, plus the chunk's download the first time; expect a slower
laptop or a phone to take several times that. In the dev server the route's pass is slower
too (about 1.5 s for the figure).

## Every object is a GLB

**Every object in the studio is a GLB; only the architecture is built from the plan.**
Floors, ceilings, walls with their holes, free walls, columns, beams, skirting and cornices,
floor zones and painted floor cells are geometry computed from the plan (they change length
with every edit), and the sky and the ground are the world around it; the editing aids —
opening slabs, the wall drag ghost, outlines, the paint brush's glow, the tight-passage
outlines, the ghost box of a model that failed to load, the admin turntable's grid and arrow —
are helpers. Everything else a
person looks at, down to a socket plate, a ceiling rose or an LED strip, is a `.glb` under
`public/models` with a manifest entry: add a file, not a `box()`. `public/` holds no other
model format; the uploader takes only binary glTF.

## Partner models (`scripts/convert-models.ts`)

The partner's own pieces come from here (17 of them); CC0 stock models (below) and uploads
fill the rest of the catalogue. The asset drop's OBJ exports
become GLBs through pure npm tooling — `obj2gltf`, `@gltf-transform`, `meshoptimizer` — with
no Blender in the loop. `SOURCES` at the top of the script is the catalogue: one entry per
archive with its archetype, Georgian name, price, store, and whatever the archive needs to
come out right. `pnpm models:seed` then makes the database match the manifest.

What the archives are like, and what each fact cost:

1. **They are scenes, not products.** A file routinely holds the whole range — two MECCANICA
   chairs, four CAYDEN tables at different extensions, nine pendants in a row — plus swatch
   cubes and shadow-catcher planes. `scripts/lib/objGroups.ts` measures every `g`/`o` group
   and rewrites the OBJ with only the chosen ones. The default rule (largest group plus what
   touches it) handles most; `groups: { include | exclude }` pins the rest. The peacock chair is the
   opposite case: 193 groups that are *all* one chair, and the automatic rule would have
   dropped its base rings because they sit below the back.
2. **The `.mtl` files say nothing** — 3ds Max placeholder colours, no maps — but the real PBR
   maps usually lie loose in the archive under useless names (`2b2b71175522.jpg`,
   `NODE3.jpg`). `scripts/lib/textureClassify.ts` sorts them by pixel statistics: blue far
   above red and green is a normal map, near-zero saturation is roughness or gloss, colour is
   albedo. Names only confirm. `maps:` on the entry overrides any call it gets wrong. The
   result is embedded in the GLB (albedo, normal, roughness packed into G) and the viewer
   leaves those materials alone — which is why furniture no longer changes colour with the
   style; it changes *product*.
3. **No normals** (`vn=0`); the viewer computes them on load.
4. **Units are unreliable.** mm, cm, inches and metres are tried against `targetSizeCm`, but
   the classic bed is 6134 units long, which is none of them. `sizeFromTarget: true` scales
   the largest axis to the target instead and the other two follow the geometry.
5. **`join` cannot merge across materials**, so strip materials first. **`quantize` rewrites
   POSITION**, so measure and normalise first.
6. **Some geometry cannot be decimated.** The rattan chair's weave is ~60k closed cane
   segments; the simplifier floors at ~260k triangles whatever the error, and meshopt's
   `Prune` flag only shaves that to 240k. So the script compresses instead of thinning:
   `EXT_meshopt_compression` on every model (decoded by three's `MeshoptDecoder`, set up in
   `lib/design3d/modelLoader.ts`), and a per-entry `maxBytes` for the chair alone.

Orientation is chosen by **fit, not heuristic**. 3ds Max is Z-up, obj2gltf sometimes corrects
for that and sometimes does not, and no bounding box can tell a table lying down from a rug.
So all eight right-angle orientations are scored against `targetSizeCm` and the closest wins;
the stored dimensions come from the geometry, not the target.

The script **rejects what it cannot verify** — proportions off by more than
`MAX_ASPECT_ERROR`, or a file over its byte cap — and says why. A rejected entry drops out of
the manifest, and out of the database at the next `models:seed`. **17 of 17 entries pass**
(about 12.6 MB; textures are most of it). `--only=a,b` redoes a few and merges into the manifest.

## Stock models (`scripts/stock-models.ts`)

The partner drop is 17 products in three styles — two pendants among them — and nothing for
kitchens, bathrooms, rugs or anything modern. Until partners cover those, `STOCK` at the top of the script pulls
a whole apartment's worth of **CC0** furniture so every slot has several options:

- **Poly Haven** — photoscanned furniture with real PBR maps and a rendered photo per asset.
  Real metres, Y-up, glTF with 1k maps. `api.polyhaven.com` refuses requests without a
  `User-Agent`. Files are cached under `<asset drop>/_STOCK/polyhaven/<id>/`.
- **Kenney Furniture Kit** — 140 clean low-poly pieces with isometric renders: the kitchen
  cabinets, fridges, toilets, showers, bathtubs, washers, rugs and floor lamps nobody scans.
  Built at toy scale, so `fit: 'uniform'` sizes each to its archetype and `fit: 'axis'`
  stretches counters and rugs. Stylised on purpose; they are placeholders and tagged as such
  (`brand: Kenney`, `source: kenney` in the manifest).

Style tags are deliberately loose (a gothic chair is `vintage`, a leather lounge chair is
`modern`, `scandinavian` *and* `industrial`) so that most styles have more than one option per
kind (many kind × style pairs still have only one or two).
Prices, stores and Georgian names are ours and fictional.

Two things the script works out per model:

1. **Which way it faces.** Seating and beds: the tallest part is the back, so the offset
   from the centroid of the top of the piece (above 62 % of its height) to the footprint centre
points forward. Cabinets: the
   extreme side carrying the most vertices is the back panel — trusted only when it wins by
   2.2×. Everything else is symmetric. Front ends up along +Z, which is what `edge.facing`
   assumes; `yawDegrees` overrides a wrong guess.
2. **Which nodes are the product.** Some Poly Haven files are small scenes (a cabinet open
   beside the same cabinet closed); after `flatten` the largest node plus whatever touches it
   is kept, or `nodes: /regex/` pins it.

Output is the same manifest shape as the partner pipeline, plus `styles`, `source`,
`license`, `brand`; `pnpm models:seed` reads both manifests.

## Equipment models (`scripts/equipment-models.ts`)

The plan's technical equipment sold as products — two electrical panels, a gas combi boiler,
an electric water heater, two air conditioners, two cooker hoods, a bathroom fan, a floor
drain — and the TV and data sockets: twelve models, one product each, all of them other
people's models fetched at build time. `EQUIPMENT` at the top of the script is the list: per
entry the source, what to keep of it, how to turn and size it, and the catalogue product it
is sold as. What it shares with the kitchen script — fetching and caching a source, the
credit, the glTF steps — is `scripts/lib/gltfPipeline.ts`.

**Licences: only what a commercial site may serve.** CC0 and CC BY; CC BY-SA only where
nothing CC0 or CC BY of the thing exists (the gas boiler and the RJ45 socket — the entry's
`note` says why). Never NonCommercial, NoDerivatives, Sketchfab's "Standard"/"Editorial" or
an unknown licence. Every manifest row carries `source`, `sourceUrl`, `author`, `license`
and a `credit` (`title`, `author`, `license`, `url`, `via`, and a ready-made `text`) — the
attribution CC BY asks for. A CC BY-SA model changed by the script is still CC BY-SA.

**Where they come from.** Poly Haven's API (1k glTF; it refuses a request without a
User-Agent), poly.pizza's static GLBs, and Sketchfab uploads through the Objaverse mirror on
Hugging Face (`huggingface.co/datasets/allenai/objaverse`, `glbs/000-NNN/<uid>.glb`, the
path recorded on the entry): Sketchfab needs an account to download, the mirror does not,
and every object keeps its uploader's licence. To look for more, the mirror's
`metadata/000-NNN.json.gz` (name, tags, licence and face count of all ~800 000 objects, about
580 MB) can be searched offline, and `lvis-annotations.json.gz` groups a subset by category
(`water_heater`, `air_conditioner`, `wall_socket`, `fume_hood`…). Downloads are cached in
`node_modules/.cache/renovate-equipment/`.

**What it does to a file**, in this order: keeps the mesh nodes whose name path matches
`keep` (Poly Haven's panel loses the door that hangs open 30 cm into the room, the TV socket
keeps its plate and connector, the grate pack its one clean grate); drops tangents (they would
not survive the turns, and three.js does without); flattens, joins per material, welds;
simplifies towards 6 000 triangles; turns the front to +z (`turn`); squashes what goes into
the wall onto the plate's back (`clampBehindZ`); scales uniformly so the dimension that names
the product (`fit` — a hood's or an air conditioner's width, a panel's or a boiler's height)
is exactly its catalogue size, the other two following the geometry; frames it (below);
renames every material `<slug>-<source name>` with any word the studio lights up
(`light`, `lamp`, `glow`, `bulb`, `emiss`, `led`, `tube`, `shade`) replaced; caps metalness at 0.5
(the studio and the photos have no environment map, so a full metal renders black) unless
the entry sets that material's own values (`materials`: the chimney hood's steel); makes
blended materials opaque; re-encodes the textures as WebP, the upload recipe's format
(colour maps up to 1024 px, data maps 512 px); meshopt-compresses. Then it reads the file
back and fails the entry if it is more than half a millimetre off its frame, the named
dimension is a millimetre off, it is over 12 000 triangles or 1.5 MB, or a material name
still has a lit word in it; a failed entry keeps its previous file and manifest row (the
draft is written under the cache and copied into `public/` only once it passes). Two runs
write the same bytes; `--only=a,b` redoes a few and merges.

**Frames** (metres, front along +z) — what `frame` says and the checks enforce:

- `wall` — standing on y = 0, centred on x, its back on z = 0: the panels, boilers, air
  conditioners, hoods and the fan;
- `fitting` — centred on x and y, its back on z = 0, like the sockets in `/models/fixtures`;
- `floor` — centred on x and z, its top at y = 0 and the rest below: the drain.

`public/models/equipment/manifest.json` has, per model: `slug`, `kind` (the product's
`model3dKind`), `frame`, `url`, the measured `widthCm`/`heightCm`/`depthCm`, `styles`, `title`
(what it is, in English), `triangles`, `bytes`, `imageUrl`
(`/uploads/furniture/equipment-<slug>.png`), the credit fields above, and `product` — the
catalogue product: kind, category, store, price, the three names, styles, and `rank` (the
order a kind's products are offered in) or, for an air conditioner, `coverM2`. The typed copy
`lib/design3d/equipmentManifest.ts` (`EquipmentFrame`, `EquipmentModel`, `EQUIPMENT_MODELS`)
carries the placing fields and the credit ones. `pnpm models:photos --only=<slugs>` renders
the photos with the fixtures' light and framing, no lamp glow, a view per frame (a wall piece
from the front and a little above, an air conditioner from just below, a hood about level,
the drain from above) and a small shadow bias — without it a broad slanted face (a hood's
canopy, an air conditioner's front) shadows itself in rings.

| Slug | Kind | Frame | Source model | Author | Licence |
|---|---|---|---|---|---|
| `panel-12` | electrical_panel | wall | [Simple Fuse Box](https://sketchfab.com/3d-models/f9bd67c84bc84e959b57bd69511f7883) | lightjavacode | CC BY 4.0 |
| `panel-24` | electrical_panel | wall | [Power Box 01](https://polyhaven.com/a/power_box_01), the box without its door | Poly Haven | CC0 |
| `boiler-combi-24` | boiler | wall | [Gaz water heater](https://sketchfab.com/3d-models/2ff78c598c654e36959ed8d3a2c39a43) | 1-3D.com | CC BY-SA 4.0 |
| `water-heater-80` | boiler | wall | [formax_80L](https://sketchfab.com/3d-models/2a1edaa43d61499a905f034640e2877a) | rk_m | CC BY 4.0 |
| `ac-9000` | ac_unit | wall | [airconditioner Electrolux Fusion](https://sketchfab.com/3d-models/d3a156127b2c478dabc40e3a9597df82) | rk_m | CC BY 4.0 |
| `ac-12000` | ac_unit | wall | [conditioner Electrolux Atrium DC](https://sketchfab.com/3d-models/da8f719b60e9406fb16c84a0bf404297) | rk_m | CC BY 4.0 |
| `hood-chimney-60` | cooker_hood | wall | [Range Hood (Kitchen Hood)](https://sketchfab.com/3d-models/e846cb48e88446808af55976ff76b1da) | govindu94 | CC BY 4.0 |
| `hood-flat-60` | cooker_hood | wall | [Kitchen Hood Model 3D fbx](https://sketchfab.com/3d-models/0be84630c8e84508926c5922c541e1ce) | GLOBALO | CC BY 4.0 |
| `fan-100` | bathroom_fan | wall | [Air Vent](https://poly.pizza/m/PCqBwDkgAz) | J-Toastie | CC BY 3.0 |
| `drain-15` | floor_drain | floor | [Floor Grate Small Pack [Free]](https://sketchfab.com/3d-models/d3cb922e9304417bad755b8c7298ff4f), one grate | Jesus Fernandez Garcia | CC BY 4.0 |
| `socket-tv` | socket_tv | fitting | [TV Socket](https://sketchfab.com/3d-models/6c7bd622341945baa49161751b8c6d1e), plate and connector | deslancer | CC BY 4.0 |
| `socket-data` | socket_data | fitting | [Wall rj45 plug](https://sketchfab.com/3d-models/ded403c85dee45b7ad8a6bcc8c3b2754) | 1-3D.com | CC BY-SA 4.0 |

The Sketchfab files were taken from the Objaverse mirror under the licence its metadata
records; the prices, stores and names are ours.

## Kitchen runs (`scripts/kitchen-models.ts`)

A made-to-measure kitchen is priced by the material the maker builds it in
(`kitchen-material-ldsp`, `-mdf`, `-veneer`, per m² of façade), and a material with a model is
drawn in place of the placed kitchen's own (`drawnModelUrl` in `lib/design/kitchen.ts`).
`pnpm models:kitchens` writes that model for each: a straight run of
base units with its worktop, standing on y = 0, centred on x and z, the fronts along +z — the
furniture frame of `public/models/stock` — in `public/models/kitchens/<slug>.glb`.

**One source, three finishes.** All three are made from one downloaded run,
[kitchen.ciete.warszawa](https://sketchfab.com/3d-models/ff403d410a0b4d9b97845482cbc77a17) by
corbaanton (CC BY 4.0, from the Objaverse mirror as in the equipment section): 2.6 m of
drawer-and-door modules on a recessed plinth, with a flush sink and an induction hob in an
anthracite worktop, no wall units. Its fronts, plinth and carcase are one material in the
file, so each variant re-textures that one — a light grey oak for LDSP
(`public/textures/kitchen-oak-grey-diffuse.jpg`: the stock grey floor texture desaturated and
lightened, which as it was rendered as brown as the veneer), the light-oak wood texture for
veneer, flat matt cashmere (`#dcd5c8`) for the painted MDF —
and re-colours the knobs (silver, black, brass); the worktop, sink, hob and legs are the same
in all three. The texture goes on by projecting each face onto the plane it faces, in metres
(0.9 m a repeat), so the grain runs up every door and side whatever the source's UVs were.
Nothing is modelled: the script removes the tap (it stood 37 cm above the worktop, and the
studio stretches a run to the slot by its bounding box, so a tap would push the worktop down)
and the parts inside the sink unit nobody sees (a bin carrying 3.8 MB of textures, two
valves), simplifies to about 10 000 triangles and scales the run to 0.90 m. The materials are
kept apart by name through the clean-up (`dedup` without materials: the hob's body, the legs
and a valve are the same grey), renamed `<slug>-<source name>` with no lit word, and the
textures go WebP as for the equipment. The written file is read back and has to be centred,
standing on y = 0, exactly 0.90 m tall, 2–4 m long and 0.5–0.75 m deep, under 12 000 triangles
and 1.5 MB, or the variant keeps its previous file and row.

`public/models/kitchens/manifest.json` is `{ generatedAt, note, models }`, each model `slug`,
`material` (the product slug), `kind: 'kitchen_run'`, `url`, the measured
`widthCm`/`heightCm`/`depthCm`, `triangles`, `bytes`, `title`, `source`, `sourceUrl`, `author`,
`license`, `credit` (as for the equipment) and `imageUrl`
(`/uploads/furniture/kitchen-<slug>.png`, rendered by `pnpm models:photos --only=<slugs>`
standing on its shadow). The three are `run-ldsp`, `run-mdf` and `run-veneer`, each
259.9 × 90 × 64.2 cm, four 59 cm modules and a narrow end one. Stretched to a 3.72 m run the
modules are about 85 cm wide and the knobs a little oval, which still reads as a kitchen of
the same kind; a much longer run would want a longer source rather than wider fronts.

## Model colours

**The colour filter is swatches of what is on the shelf.** `lib/design/colors.ts` sorts any
hex into twelve families a person would name (hue, lightness and *chroma* — HSL saturation
races to 1 near white, and a pale peach wood read as vivid orange), and the tray shows one
swatch per family present among the products the other filters leave, with a count; a family
ticked that the current room has nothing of stands aside instead of emptying the shelf. The
colours themselves come **off the models**: `scripts/lib/modelColor.ts` reads the triangles'
areas and colours (up to 20 000 triangles per primitive, strided) (the material's factor times the texel its middle maps to, nearest-sampled so
a leaf atlas's cut-outs do not bleed; cut-out texels skipped) and keeps up to three families
that each cover at least 12 % of the piece (`MIN_SHARE`), the largest first, as the mean hex of each — so "brown" is
*this* walnut. Both converters run it on every model, `pnpm models:colors` fills the manifests
already written (`colors`, and `colorHex` = the first unless the entry had one by hand), and
`pnpm models:seed` carries them to `products.specs.colors` (`productColors` /
`productColorFamilies` read a product either way). Eight of two hundred products had a colour
before; nobody was going to type in the rest.

## Tests

`tests/unit/api/sniff.test.ts` (GLB sniffing and inspection), `tests/unit/api/glbOptimize.test.ts`
(the upload recipe on generated files: meshopt and WebP, each map at its own size, the outline
kept, the triangle cap, an optimized file and an unreadable one kept as they came),
`tests/unit/design/colors.test.ts`
(colour families), `tests/unit/design3d/footprintFromModel.test.ts` (a real Kenney GLB). The
browser half (`glbOptimizeBrowser.ts`, the canvas) has no unit test — it was checked by
uploading through the admin form and the own-furniture dialog. Nothing
tests the converters, `stock-models`, `equipment-models`, `kitchen-models`, `seed-models`,
`modelColor`, `objGroups` or `textureClassify`; check a run's printed report and the manifest
diff (the equipment and kitchen scripts check each file's frame, size, triangles, bytes and
material names themselves, and their photos are worth a look side by side).

## Known gaps

- Models uploaded before uploads were optimized are stored as they came (locally products #500
  and #503, 5.7 and 8.4 MB); uploading the file again in the product form replaces it with an
  optimized copy. Nothing re-optimizes stored files in bulk.
- The optimizer keeps texture resolution for colour maps, so an upload's textures still take
  about 34 MB of GPU memory against 17 MB for a converted model. KTX2 (Basis) would keep 2048
  pixels at a fraction of that, but needs a transcoder in the studio and an encoder on the
  server, and the upload route refuses Basis today.
- The mouldings are swept from five profiles; a real cornice range has dozens, and nothing
  reads a profile out of a supplier's drawing. Curtains, still, have no model anywhere.
- The partner drop is 17 models in three styles — **MODERN has no partner furniture at all**
  (its folder holds a `.max` kitchen and nothing else) — and no partner sells a wardrobe,
  kitchen, bathroom fixture, rug, lamp, plant, desk or bookshelf. Those slots are filled by
  CC0 stock (see "Stock models" above), which is placeholder furniture: Kenney's pieces are
  visibly low-poly, and Poly Haven's skew rustic. Curtains have no model anywhere and stay
  empty. `matchProducts` still falls back across styles when a style has nothing for a slot.
- Partner archives carry one placeholder material per part (`wire_027177027`), so a daybed
  with an oak frame and a plaid mattress is textured as all oak. Per-part maps would need a
  render to tell the parts apart; the current single material per model is the honest
  compromise, chosen by eye per entry in `SOURCES`.
- Which way a chair *faces* is not derivable from geometry — set `yawDegrees` on the source
  entry by eye when one comes out backwards. The Cinquanta lamp is a 2.3 m two-arm fixture
  and reads as a pendant only in a large room.
- **The equipment models' credits are in the manifests only.** CC BY and CC BY-SA ask for the
  author, the title, the licence and a link wherever the model is used; nothing in the app
  shows `credit` yet (the CC BY fixtures are in the same position). Two of the twelve are
  CC BY-SA (`boiler-combi-24`, `socket-data`): the GLBs made from them stay CC BY-SA.
- The equipment is stock from strangers, not the partners' range: `panel-24` is Poly Haven's
  worn industrial box (grey metal, scuffed), `panel-12` a plain closed white box, the TV socket
  black. Some textures carry marks — an Electrolux logo on both air conditioners and the water
  heater, a "BRANDING" plate on the boiler, a small GLOBALO logo on the built-in hood. The
  sizes follow the geometry past the named dimension: the chimney hood is 60 cm tall (its
  chimney is short), the fan a 1.2 cm louvred plate, the sockets 0.6 cm plates (the fixture
  sockets are 1.8 cm), and the floor drain is its 3 mm grate with no body under it.
- The kitchen runs are one source in three finishes, with round knobs where the maker's
  swatches show bar handles (the CC BY runs with bar handles that were found carry their
  wall units in the same mesh, or are toy-like), and the plinth wears the fronts' finish. The back under the sink
  is open, and the pipes left there take the fronts' finish — it faces the wall. Stretched to
  a long run (1.43× to 3.72 m) the modules widen to about 85 cm and the knobs go slightly
  oval: the studio fits a kitchen to its measured slot per axis, always (`fitToItem`).
- **Windows with no product show an empty hole.** `scripts/fixture-models.ts` gives
  `window-nordic` the role `window`, but the generated `lib/design3d/fixtureManifest.ts` and
  `public/models/fixtures/manifest.json` carry no window role, so the default-window fallback
  finds nothing. Re-running `pnpm models:fixtures` (and committing the regenerated files) should
  fix it; not yet done.
