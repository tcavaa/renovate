# Custom wall decor and the AI designer

Wall treatments that are not a product with a model — slatted fields, stone slabs, picture-frame
mouldings, built-out niches, light lines and coves, upholstered or relief panels, brick or concrete
cladding, murals, tiled fields — built in code and fitted to the walls, and the AI designer that
places them (with the furniture and the finishes) after the style test. Read this before touching
`lib/design/decor/`, `lib/design3d/decor.ts`, `lib/design/aiDesign.ts`, `aiReview.ts`,
`aiProposal.ts`, the `/api/design/ai-generate` or `/api/design/ai-review` route, `DecorPanel`, or
the decor materials.

Related: [overview.md](overview.md) (step 4, `generate`) · [ai-layout-plan.md](ai-layout-plan.md)
(the plan this realises in part) · [layout-and-matching.md](layout-and-matching.md) (the engine the
proposal goes through) · [3d-engine.md](3d-engine.md) · [studio.md](studio.md) ·
[../budget.md](../budget.md) · [../catalog.md](../catalog.md) · [../data-model.md](../data-model.md).

## Key files

| File | Responsibility |
|---|---|
| `lib/design/decor/reference-library.json` | the reference library: per room type × style, the concepts, the families they use, the composition rule and the room constraint; the primitives' parameters and fit rules (what the prompt quotes) |
| `lib/design/decor/families.ts` | `DECOR_FAMILIES`: each family's slots, the material kinds each slot takes, its default knobs; `slotTakes`, `hasLed` |
| `lib/design/decor/materials.ts` | decor materials: `DECOR_MATERIAL_CATEGORY` (`decor-materials`), the kinds (`decor-<kind>` sub-categories), `isDecorMaterial`, `decorMaterialsOf`, `defaultDecorMaterial` (an LED defaults to the warmest), `decorSpecs`, `ledColor` |
| `lib/design/decor/layout.ts` | the fit, pure and in the wall's frame: `decorWall`, `freeSpans`, `fitSlats`, `fitMoulding`, `fitNiche`, `fitField`, `fitLight` |
| `lib/design/decor/quantities.ts` | what a piece uses per slot in m², metres and pieces (`decorUses`), bought in the material's unit with the waste (`quantityIn`, `DECOR_WASTE`), per piece (`piecePurchases`, `pieceCost`) and folded per product across the flat (`decorPurchases`); `decorProductIds` for the save route |
| `lib/design/decor/resolve.ts` | intents → pieces: `resolveDecor` / `resolveRoomDecor` (anchors, walls, stretches off doors and windows, heights, `sanitizeParams`, `resolveMaterials`), `wallBehind`, `decorMaterialFrom` |
| `lib/design3d/decor.ts` | `buildDecor` / `buildDecorPiece`: every family in 3D from the same fit; its own material cache (`decorMaterial`, `releaseDecorMaterials`); LED glow cards |
| `lib/design/aiProposal.ts` | the proposal's shape and how it becomes a flat: `proposalPicks`, `withProposalFinishes`, `proposalDecor`, `proposalNotes`, `MAX_AI_GENERATIONS`; `withoutArtOverDecor` (no print over built decor); `applyReviewFixes` (the check's fixes, pure) |
| `lib/design/aiReview.ts` | server only: the designer's check of the furnished flat — `reviewFindings` (what measuring each room finds wrong), `buildReviewBrief`, `REVIEW_SCHEMA`, `validateReview`, `reviewWithClaude` |
| `lib/design/aiDesign.ts` | server only: `buildBrief` (the flat, the candidates, the decor materials and references), `SYSTEM_PROMPT`, `DESIGN_SCHEMA`, `designWithClaude`, `validateProposal`, `DESIGN_MODEL` |
| `lib/design/aiDesignClient.ts` | the browser's side: `aiDesignerEnabled`, `requestAiDesign`, `requestAiReview` (each null on any failure) |
| `app/api/design/ai-generate/route.ts` | `GET` → `{ enabled }`; `POST` → `{ proposal }`, or 503/429 with `fallback: 'engine'` |
| `app/api/design/ai-review/route.ts` | `POST` the laid-out flat → `{ review }`, or 503 (the flat stays as laid out) |
| `components/studio/DecorPanel.tsx` | the card of a selected piece |
| `lib/db/migrations/0005_decor_materials.sql` | the category tree, the starter materials and the workshop store |
| `tests/unit/design/decor.test.ts` | the fit, the quantities, the budget lines, the resolver, the proposal and its validation |
| `tests/unit/design/placementSettle.test.ts` | the check's findings, its validation and its fixes applied; no print over slats |

## The data (`DecorPiece` in `lib/design/types.ts`)

`scene.decor: DecorPiece[]` — each piece is one family on one wall of one room (`wallIndex`, the
room edge), over a stretch of it (`span`, metres along the edge from its first corner, as a
finish's span) and a band of height (`height`); a cove runs round the room's ceiling and has
`wallIndex: null`. `params` are the family's knobs (`DecorParams`, every one optional over
`DECOR_FAMILIES[family].params`). `materials` is a record by slot (`DecorSlot`) of
`DecorMaterial`: the catalogue product as a snapshot, a colour where the material takes one
(`specs.tintable`), and the specs it draws with copied from the catalogue (`textureScaleM`,
`tintable`, `cct`, `profileMm`, `roughness` — a `SceneProduct` carries no specs). `reference` is
the library entry and concept it realises, `note` the designer's sentence, `origin` `ai` or
`studio` (edited since). `scene.generation` records how the flat was generated (`engine` or `ai`,
the model, the time, the per-room notes, how many AI runs the design has had). Both are saved with
the scene, versioned, undone and persisted like the rest (`decor` is in `DesignSnapshot`,
`partialize`, `scene()`, `DESIGN_SAVED`).

A piece is fitted again wherever it is drawn: a wall that got shorter clips its stretch
(`decorWall`), a stretch too small to build (under 10 cm) draws nothing and buys nothing, and a
piece whose room went is dropped (`reconcile`).

## The families (`families.ts`, `layout.ts`)

The reference library's rules, as code:

- **slats** — a real section (20–45 mm, gap 10–25, depth 10–30) repeated a whole number of times,
  the remainder centred; a board behind (`backing`, felt or MDF) or none (a see-through screen); a
  light line under, over or both (`led`). Slots: face (wood / board), backing (board), led.
- **moulding** — picture frames on every clear stretch between doors and windows, a whole number
  of bays per stretch sized to divide it evenly (`bayWidthMm`), lower and upper rows about a chair
  rail (`dadoMm`), a frame under a window and over a door or window where there is room; never a
  stretched profile. Slot: profile (moulding, tintable).
- **niche** — a plasterboard build-out the whole stretch and height of the piece, `count` arched
  or square niches spaced evenly in it (a pair either side of a decorative mantel with its firebox
  when `mantel` and the wall is 3.2 m or more), shelves inside, a light inside. Built out because a
  wall's construction is unknown. Slots: body (gypsum, tintable), shelf (wood), surround (stone),
  led.
- **slab / panel / cladding / mural / tile** — a field (`fitField`): its thickness, a stand-off
  for a floating slab (with a halo light behind), seams at the material's real size balanced
  across the field (slabs, flat panels, large cladding), upholstered channels or flutes as rounded
  modules, a tile field's border band, an edge trim. Slots by family (face, trim, border, led).
- **light** — a cove (a lowered ceiling panel inset 0.4 m from every wall, the light round its
  top; rectangular rooms only) or a line set into the wall. Slots: led, body (the cove's
  plasterboard).

## What it costs (`quantities.ts`)

Each slot is measured in m², metres and pieces from the fit (slats: the field's area, the slats'
metres and their count; mouldings: every metre of frame and rail; a niche: the build-out's front
less its openings plus each niche's sides, head and back, the shelves, the mantel's stone; a
field: its face, its trim, its border; LED: the lit length) and bought in the **material's own
unit** as admin set it — m² and metres with the cutting waste (×1.1 and ×1.05, up to a tenth),
pieces whole. Admin can sell oak slats by the m² or by the metre and the budget follows. Each piece
rounds on its own (it is cut on its own); `decorPurchases` folds the flat into one purchase per
material product, which `priceScene` turns into budget lines: key `decor-<productId>`, tick
`tickFor.decor(productId)`, section `finishes` (an LED line `lighting`), bucket `finishes`, the
product snapshot with its store — so the workshop is a store card on the summary sheet, its lines
ticked and their quantities edited like any other, and the checkout orders them
([../budget.md](../budget.md)). The save route reprices every decor material from the catalogue
and takes its unit from there (a material no longer sold in m², metres or pieces leaves its slot);
the quantities are never the client's — `priceScene` measures them on the server.

## Materials (the catalogue)

Decor materials are ordinary products in the sub-categories of `decor-materials` (not `decor`,
which holds artwork, plants and mirrors): `decor-wood`, `-board`, `-led`, `-moulding`, `-gypsum`,
`-stone`, `-fabric`, `-relief`, `-brick`, `-concrete`, `-tile`, `-wallpaper`, `-trim`. The kind is
the category, so admin adds a new one by filing a product there with a unit (m², linear metre or
piece) and a price; its `specs` may carry `textureScaleM`, `tintable`, `cct` (an LED's kelvin),
`profileMm` (a moulding's face). The design catalogue loads them (`DECOR_MATERIAL_SLUGS` in
`KNOWN_SLUGS`); they are not furniture, not in the calculator and not on the shelf.

Migration 0005 made the tree, a store ("დეკორის სახელოსნო" / Decor Workshop) and 36 starter
materials at placeholder prices for admin to set: five slat veneers (textures baked in code to
`public/textures/decor/wood-*`), two boards, three LED lines (2700/3000/4000 K), three mouldings,
plasterboard, four stones (white, grey and verde marble, travertine — copied from the library into
`public/textures/decor/`, since `public/library` is not deployed), two concrete panels, two
upholstered fabrics, two reliefs, two brick slips, four tiles, three wallpapers and three trims;
photos in `public/uploads/products/decor-*.webp`.

## In 3D (`lib/design3d/decor.ts`)

`buildDecor(plan, scene.decor, roomFilter)` is a group of its own in the viewer, memoised on the
decor, the plan and the rooms in view and disposed like the shells. Every piece is built in its
wall's frame (x along the edge, y up, z into the room) and put on the edge; meshes carry metre UVs
(gotcha 11) and `ownsGeometry`; each is tagged `pickKind: 'decor'`, `decorId`. A piece on a wall
carries `wallCut` with `kind: 'decor'` and goes with its wall in the cutaway and with the walls
down (`wallPartVisible`); the viewer collects wall parts from the shells and the decor group.

- **Its own materials.** `StyleMaterials.releaseUnused` disposes every surface the shells do not
  wear, which would take the decor's with it; and a tinted fabric or lacquer multiplies its colour
  over its texture, which a finish deliberately does not. So decor materials are cached here by
  texture, colour, scale and roughness, their textures counted in `loadProgress`, and
  `releaseDecorMaterials` frees them when the viewer unmounts.
- **Light without lights.** An LED line is an emissive strip and a glow card — an additive plane
  with a gradient on the surface it washes (under slats, round a stood-off slab, inside a niche, on
  the walls above a cove). No `RectAreaLight`, no point light: every light is paid on every lit
  pixel (gotcha 22).
- **A cove from above.** The lowered panel is its underside and edges only (backface-culled from
  the doll's-house camera like the ceiling), so the room stays open from above.
- `group.add(...[])` logs an error in three: add a list only when it has something.

## The studio (`DecorPanel`)

A click on a piece (furniture mode) selects it (`ElementSelection` `{ kind: 'decor' }`) and opens
its card on the right: what it is (the concept, the family, its wall, its size), the designer's
note, its light line (the family's options — under, over, behind, inside — the warmest LED added
when turned on), each slot's materials from the catalogue as swatches (none for an optional
slot), a colour row for a tintable material (the studio's paints and a few accents, or the
material's own), and the materials it buys with their cost. Edits are undoable store actions
(`setDecorMaterial`, `setDecorColor`, `setDecorParams`, `removeDecor`) and mark the piece
`origin: 'studio'`.

## The AI designer

Generation after the style test asks Claude for the whole flat when the server has
`ANTHROPIC_API_KEY` (docs/design-studio/ai-layout-plan.md's principles: intent, not coordinates;
real products from short lists; the engine checks):

1. **The style page** asks `GET /api/design/ai-generate` whether the designer is there. On
   "generate", with it there and the design under `MAX_AI_GENERATIONS` (5) AI runs, it posts the
   plan, the style and its test answers, the budget and the locale, and the overlay holds on the
   designer's steps (`GenerationOverlay` `ai` / `ready`) until the answer or `AI_WAIT_MS` (240 s).
2. **The route** (signed in, the project the caller's, `RATE_RULES.aiGenerate`, the cap read from
   the saved scene, `maxDuration` 300) builds the brief from the plan and the cached design
   catalogue (`buildBrief`): per room its walls by index (side of the plan, length, doors, windows
   with sills and heads, clear stretches), the engine's pieces for the room program with 12
   products per kind, 10 floor and 10 wall finishes for the room, every decor material, and the
   reference library's entries for the style and the room types.
   **Every generation is offered a fresh draw** (a seed per run, logged): the products are drawn
   at random from every product of the kind that fits the room (`fitsRoom`, `candidatesFor`) —
   the style's own and the well-priced more likely (`generationWeight`, weighted sampling without
   replacement), any of them possible — and so are the finishes; the decor materials and each
   reference's concepts come in a random order; and the run gets a **direction**, a palette and
   mood within the style drawn from `DIRECTIONS` (six per style). What the flat's saved design
   already uses is drawn far less often (`PREVIOUS_WEIGHT`) and named in the brief, so generating
   again gives a new design. The prompt tells the designer the lists are random and unordered.
   Measured on two flats in one style: 10 of 28 products shared, no finish shared; one flat
   generated twice: 1 of 30 products, no finish and no decor family shared. Small pools (curtains,
   desks, TV units — 8 to 16 products) are where two flats still meet. One Claude call (`DESIGN_MODEL`, adaptive thinking, effort medium,
   server-side refusal fallback, the system prompt cached, structured output against
   `DESIGN_SCHEMA`) answers per room: furniture picks, floor, wall, up to three decor intents, a
   note — in the person's language. `validateProposal` keeps only what was offered.
3. **The store** (`generate(catalog, proposal)`) lays the flat out with the engine as always, with
   the picks taken where they fit their slot (`MatchOptions.picks`), the designer's floors and walls
   over the style's draw (`withProposalFinishes`, a finish somebody chose stays), and the decor
   intents resolved against where the engine put the bed, the sofa or the TV unit
   (`proposalDecor`). A print or a mirror that would hang over built decor that covers its wall
   (slats, a slab, panels, cladding, a mural, tiles, niches — not mouldings or light lines) is left
   out (`withoutArtOverDecor`): the decor is the picture there. The other way round, such decor keeps
   off what hangs on a wall for use at its height — the mirror over a bathroom's or toilet's basin,
   the kitchen's wall cabinets (`fixturesOnWall` in `resolve.ts`; a backsplash runs under the
   cabinets): a niche goes beside the mirror, or not at all. **A niche wall is built out about
   30 cm, so it keeps off everything standing against its wall** (`floorPiecesOnWall`): one used to
   run the whole bathroom wall behind the bath and the washing machine. Thinner decor stays, and what
   stands in front of it is moved off it by its depth (`clearOfDecor`, `decorDepth`). **Tiles in a
   kitchen are its backsplash** (anchor `kitchen`): behind the run, from the worktop to the bottom
   of the wall cabinets (or 1.5 m), whatever wall was named — and so is a slab asked for behind the
   run, on the run's wall or as a band no higher than 1.8 m (`isBacksplash`; a slab floor to
   ceiling on another wall stays a feature wall). **A backsplash is as long as the run**, whatever
   width was asked: a 1.2 m strip of marble behind a 2.5 m worktop looked unfinished. Every piece records what it was centred
   on (`DecorPiece.anchor`) and follows that piece to its wall when a swap or the check moves it
   (`reanchorDecor`) — the tiles stayed on the old wall when the run was swapped onto another. When
   the piece stands at a door or a window (a desk under a window), the decor takes the nearest clear
   stretch of that wall beside it, and goes when there is none 30 cm wide: slats followed a desk onto
   the window over it. Under
   a cove's floating panel (16 cm down, 40 cm in from the walls) the hanging lamps and ceiling
   points are hung from the panel (`underCeilingDecor`), not through it.
   `scene.generation` records the run.
4. **The designer checks the flat it furnished** (`requestAiReview` → `POST /api/design/ai-review`,
   `lib/design/aiReview.ts`): the style page sends the laid-out pieces (ids, kinds, product ids,
   positions, sizes) and the decor; the route takes names and prices from the catalogue, not the
   browser. The brief describes each room as built — its walls with doors and windows, every piece
   with its product, real size and where it stands (back to which wall, how far along, hung how
   high, or free-standing) — and what **measuring the room found wrong** (`reviewFindings`): pieces
   in each other or through a wall, a piece standing off the wall it backs onto, one deeper than wide
   where that kind never is (a model turned sideways or the wrong product), a piece hung into what
   stands under it, a mirror not over the basin, a standing floor mirror in a bathroom, a nightstand
   away from the bed's head, a passage too tight (`tightSpotsByItem`). Each piece is offered five
   alternatives of its kind that fit the room, the style's own likelier and — when the piece is in
   trouble — the ones no bigger than it six times likelier. One call (same model and settings as the
   proposal, `REVIEW_SCHEMA`) answers per room a note and fixes: `replace` with one of that piece's
   alternatives, or `remove`. `validateReview` keeps an item of that room, a replacement it was
   offered — applied to every piece of its set (both nightstands) — a removal only of what the room
   can do without (never the bed, the sofa, the desk, the dining table, the toilet, the basin or the
   kitchen), at most six fixes a room. `designStore.applyReview` → `applyReviewFixes`: a replacement
   goes where the old piece stood, its back on the same wall (`fitSwapped`), a hung one at the height
   it should hang (`settledElevation`), only if it fits; the nightstands, coffee table or desk chair
   of a replaced bed, sofa or desk move to the new one (`settledPosition`), one with no room beside it
   goes. The room's note gets the check's sentence; `generation.reviewed` counts the fixes. The
   overlay has a step for it ("checking each room"), and the style step's flow guard holds while
   the generation runs (`DesignFlowGuard` `hold`): laying the flat out marks it generated, which used
   to send the page to the studio at once and leave the check to land on the studio later. No answer within `AI_REVIEW_WAIT_MS` (150 s) or
   any failure: the flat opens as laid out. Rate rule `aiReview` (8 an hour); the route logs
   `ai-review` with tokens, cost and the number of fixes. **Besides replacing and removing, the check
   moves**: `to_wall` (back against the wall behind a piece, or the nearest), `move_to_wall` (against
   wall N, as near its middle as it stands well — clear of windows if tall, `blocksWindow`, and of
   doorways, `inDoorway`), `remove_decor` and `decor_to_wall` (a decor piece fitted again on wall N).
   The brief lists every decor piece with its id, wall, size and depth, and the findings now include a
   tall piece in front of a window, a piece standing in decor, decor something stands in, and a
   kitchen backsplash away from the run; a piece's back against its own wall is no passage. After the
   fixes: the pieces placed off a replaced or moved bed, sofa or desk stand by it again, the chairs
   round a replaced table are seated round it (`reseatChairs` — a chair stood 1.3 m from a new bistro
   table), decor follows its piece, and the room is tidied (`settleToWalls`, `clearOfDecor`).

Every failure — no key, the cap, a timeout, an error, a refusal, an answer that does not validate
— is a 503/429 with `fallback: 'engine'`, and the flat is generated by the engine alone, without
decor, as before the designer existed.

**The structured output's limit.** A schema may hold at most 16 nullable (union-typed) fields;
`DESIGN_SCHEMA` has none: "the default" is a sentinel (0, -1, "", "auto"), read back by
`validateProposal`. An enum cannot sit beside a nullable type either.

**Measured** (16 Oct 2026, projects #311 and #300, five rooms): 57–76 s, about 20k input and
5.5–7.3k output tokens, $0.21–0.23 on Claude Opus 5.5 (the system prompt's ~4k tokens cached for
the next run). The route logs every run's tokens, cost and seed (`ai-generate`).

## Known gaps

- A piece cannot be moved, resized or added by hand in the studio (only its materials, colours and
  light, or removed); with no key there is no decor at all.
- No labour line for fitting decor: the materials are bought, the installation is not priced.
- A cove needs a rectangular room; niches and fields do not check a socket or a radiator on their
  wall (the rules module of [ai-layout-plan.md](ai-layout-plan.md) is not written).
- The model's furniture choices are product picks for the engine's slots (the plan's phase 1); it
  does not yet decide the room program or the walls the furniture stands against.
- No evaluation set yet: the model and the prompt are not compared against the engine on fixed plans.
- The check reads the flat as measurements, not as a picture: a model that faces the wrong way while
  its size looks right (a washing machine turned to the wall) is invisible to it — the library's
  facing was audited once instead ([../3d-assets.md](../3d-assets.md#facing)). It cannot move a piece
  to another wall, only replace or remove it.
- The decor 3D is checked in the studio by eye; the walk-through shows it best.
