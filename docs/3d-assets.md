# 3D assets: models, textures and the catalogue seed

Where every model and texture the studio uses comes from, the scripts that produce them, the
conventions a file must meet to be placed, and how `pnpm models:seed` turns the manifests into
products. Read this before touching `scripts/` (the model/texture pipelines), anything under
`public/models/` or `public/textures/`, the GLB upload route, or `lib/design3d/modelLoader.ts`.

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
| `pnpm models:photos` | `scripts/model-photos.ts` | a product photo per fixture and radiator, rendered from the model in Playwright's Chromium |
| `pnpm models:colors [--force]` | `scripts/model-colors.ts` (+ `scripts/lib/modelColor.ts`) | each furniture model's colours read off its triangles into the manifests |
| `pnpm textures:stock` | `scripts/stock-textures.ts` | ~35 floor/wall finish textures (partner drop, Poly Haven, ambientCG) written straight to the database as surface products, thumbnails in `public/uploads/products/` |
| `pnpm models:seed` | `scripts/seed-models.ts` | the catalogue made to match the manifests (below) |
| `pnpm deploy:bundle-seed` | esbuild | `models:seed` as one plain-node file beside the standalone server (the cPanel deploy runs it) |

Generated files (`lib/design3d/fixtureManifest.ts`, `radiatorManifest.ts`, the manifests) are
never edited by hand — change the script's source list and re-run it.

## What `pnpm models:seed` does

Reads the four manifests — `public/models/manifest.json` (partner), `stock/`, `fixtures/`,
`radiators/` — and:

- writes one product per manifest entry (prices, stores and names from the manifest win over
  admin edits of those rows), plus the fixtures, radiators and the skirting/cornice range
  (`scripts/lib/trimProducts.ts`), creating any missing categories;
- deletes every other manifest-managed product with a `model3dKind` — including ones with a
  `model3dKind` and no `model3dUrl`. A product whose `model3dUrl` is not under `/models/` (an
  admin or partner upload) and a person's own product (`ownerUserId`) are left alone;
- deactivates (does not delete) active furniture, sanitary and lighting products that have no
  model, and surface products that have no texture — so only products with a 3D model or a
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
upload fine and then render as nothing. Meshopt is fine.

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

`tests/unit/api/sniff.test.ts` (GLB sniffing and inspection), `tests/unit/design/colors.test.ts`
(colour families), `tests/unit/design3d/footprintFromModel.test.ts` (a real Kenney GLB). Nothing
tests the converters, `stock-models`, `seed-models`, `modelColor`, `objGroups` or
`textureClassify`; check a run's printed report and the manifest diff.

## Known gaps

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
- **Windows with no product show an empty hole.** `scripts/fixture-models.ts` gives
  `window-nordic` the role `window`, but the generated `lib/design3d/fixtureManifest.ts` and
  `public/models/fixtures/manifest.json` carry no window role, so the default-window fallback
  finds nothing. Re-running `pnpm models:fixtures` (and committing the regenerated files) should
  fix it; not yet done.
