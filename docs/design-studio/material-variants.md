# Material variants: one model, several looks

A 3D product can come in several looks on one GLB: a chesterfield in black, white or cognac
leather, a chair's seat in three fabrics. Admin (or the store, in the partner portal) defines the
variants in the product form; in the studio the selected piece's card shows them as swatches,
and picking one re-colours or re-textures the parts of the model it names, reprices the piece
and names it on the budget and the order.

Related: [studio.md](studio.md) (the item card) · [3d-engine.md](3d-engine.md) (how items are
built) · [../catalog.md](../catalog.md) (the product form) · [../budget.md](../budget.md) (item
lines) · [../subscriptions.md](../subscriptions.md) (the catalogue lock) ·
[../uploads.md](../uploads.md) (texture uploads, cleaning up).

## Key files

| File | Responsibility |
|---|---|
| `lib/design/variants.ts` | pure: `ProductVariant` / `VariantSlot` / `SceneVariant`, `productVariants(specs)` (reads and cleans `specs.variants`), `findVariant`, `variantUnitPrice`, `snapshotInVariant`, `withItemVariant` (the store's action), `namesWithVariant` (budget and order names), `variantFileUrls` (cleanup), `variantSignature` (3D rebuild key), `newVariantId` |
| `lib/validations/variant.schema.ts` | the form's `specs.variants` (`productVariantsSchema`, in `productSpecsSchema`) and the snapshot's `variant` (`sceneVariantSchema`, in `design.schema.ts`) |
| `lib/design3d/variantMaterials.ts` | `createVariantMaterials()`: puts a look on a model's meshes by material name, caches the copies; shared by the studio and the form's turntable |
| `lib/design3d/buildScene.ts` | `buildPlacedItem` applies `item.product.variant` once the GLB is in; `itemKey` includes `variantSignature`, so a change of look rebuilds the piece; `releaseVariantMaterials` |
| `components/design/SwapPanel.tsx` → `VariantSwatches` | the swatches on the item card; `ItemCard.tsx` shows the variant's name under the product's |
| `store/designStore.ts` → `setItemVariant` | one undoable step (`commit`) |
| `components/admin/VariantsEditor.tsx` | the form's editor; `ModelUploader.tsx` reports the model's materials (`onMaterials`), shows a look (`look`) and takes a photo of it (`controlRef.photo`) |
| `lib/api/productPrices.ts` → `repriceItemSnapshot` | the save route rebuilds a placed piece's variant from the catalogue |
| `lib/plans/sceneGuard.ts` | a variant chosen is a `catalog` change on the server, as a kitchen's material is |

## What a variant is (`products.specs.variants`)

`{ id, nameKa, nameEn?, nameRu?, colorHex, imageUrl?, pricePerUnit?, slots[] }`, at most 12 per
product. `id` is stable for good: saved designs name the variant by it. `colorHex` is the swatch;
`imageUrl` a photo of the product in that look (none: the product's); `pricePerUnit` its own price
(none: the product's). `slots` are the parts it changes — **materials of the GLB, by name**, so
"Leather" changes and "Wood" stays. A slot may set:

- `colorHex` — over the part's own texture by default (`keepTexture`): the texture is made grey in
  the browser (its light and shade kept at 85 %, its colour gone, `GRAIN_RELIEF`) and the colour
  laid over it, so a black leather becomes a white or a cognac one with the same grain — a plain
  multiply cannot lighten a dark texture. `keepTexture: false` drops the texture: a plain colour.
- `colorUrl` (+ `normalUrl`, `roughnessUrl`, `repeat`) — a texture of its own, laid on **the model's
  own UVs**; it works with a texture made for this model or a seamlessly repeating one. Uploaded to
  `textures/` like a finish's.
- `roughness` — 0 glossy to 1 matt.

A variant with no name, a bad swatch or no parts is not one (`productVariants` drops it; the form
refuses to save it). The rest of `specs` is kept as it was.

## In the product form

Under the turntable, once a model is loaded: the model's materials as the turntable read them —
name, colour (a textured part shows its texture's average colour), how many parts wear it — and
per variant a tick per material with its colour, "keep the texture", a gloss slider and, folded,
a texture of its own. "Show on the model" puts the variant on the turntable as it is edited;
"photo from the model" photographs the turntable in that look (the same snapshot as the product
photo) and uploads it as the variant's photo. A variant naming a material the model no longer has
(another GLB uploaded since) says so: it changes nothing in the studio.

Material names come straight from the GLB — often cryptic ("04 - VRay Material", "asdas") in the
library — which is why each is shown with its colour and the variant can be previewed.

## In the studio

The item card (`SwapPanel`) shows "ფერი და მასალა" when the selected piece's product has variants:
the product's own look first ("როგორც ფოტოზე", in the product's colour), then each variant, with
the price when a variant costs differently. A pick is `setItemVariant` — one step of the history,
behind the `catalog` lock like a kitchen's material (the page opens the upgrade dialogue; the
save route's `sceneGuard` refuses it too).

**The variant rides on the item's product snapshot** (`SceneProduct.variant`: id, names, swatch,
slots), with `pricePerUnit`, `totalPrice` and `imageUrl` already the variant's. Not on the item:
every swap, re-match or generation builds a fresh snapshot (`toSceneProduct`), so a variant can
never outlive the product it belongs to. Duplicating a piece copies its look; undo and versions
keep it.

**3D** (`createVariantMaterials`): after the GLB arrives, each mesh's materials named by a slot
are swapped for copies in the look; the file's own materials are never changed (every clone of a
model shares them). Copies are cached per original material and look, so forty chairs in one
fabric share one material; textures are cached by URL and read like glTF's (`flipY = false`).
A made-to-measure kitchen drawn as its material's model is that model as it is.

## Saving, the budget and orders

The save route (`designWrite` → `repriceItemSnapshot`) looks the variant up in the catalogue by
its id and writes the catalogue's — price, photo, names and files — never the client's; a variant
the product no longer has is dropped and the piece is priced as the product. A `variant` sent on
any other snapshot (a finish, a door, a kitchen's material) is dropped (`withoutVariant`).

A piece's budget line is named "product — variant" (`namesWithVariant`), at the variant's price;
the store's order line carries both names in all three languages, so the shop knows which look to
send.

## Files

`variantFileUrls` lists a product's variant photos and textures: they are deleted with the
product (`productFileUrls`), an edit that drops or replaces one removes it (`droppedVariantUrls`
in `PUT /api/products/[id]`), and `removeUnusedUploads` keeps a file another product's `specs`
still names.

## Tests

`tests/unit/design/variants.test.ts` (reading, pricing, names, files, the schema),
`tests/unit/design3d/variantMaterials.test.ts` (which parts change, the originals untouched,
shared copies, grain kept or dropped, multi-material meshes), `repriceItemSnapshot` in
`tests/unit/api/helpers.test.ts`, the lock in `tests/unit/plans/sceneGuard.test.ts`, the order's
names in `tests/unit/finance/money.test.ts`.

Checked on 27 Oct 2026 in the browser on a side dev server: the library chesterfield (#3304) given
a white and a cognac leather (the cognac at 3,900 ₾) through the form, both previewed and
photographed on the turntable, and in TEST project #348 the piece switched black → cognac → white
on its card, the 3D, the card's price and photo following, the saved row holding the catalogue's
variant.

## Known gaps

- The generation (engine and AI designer) never picks a variant: every generated piece is in the
  product's own look.
- The public catalogue and the product page do not show a product's variants.
- A variant's normal and roughness maps are stored as colour WebP (quality 80), like every
  texture upload.
- A variant cannot be ordered on its own SKU: the store's order names it, but there is no
  per-variant SKU or stock.
