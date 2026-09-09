# AI 2D→3D Renovation Feature — Feasibility & Step-by-Step Plan

> Companion to CODEBASE.md. Written 2026-07-29. No code written yet — this is the plan.

## The core insight: AI is only needed in 3 places, not everywhere

The biggest mistake would be asking an AI to "generate a 3D scene." Apps like Planner 5D
don't do that — and neither should we. The interactive 3D model (rotate, zoom, click,
replace tiles) must be **built procedurally with Three.js** from structured data. That
makes it deterministic, cheap (zero AI cost per view), and fully interactive.

AI is used only for:

1. **Floor plan parsing** — vision LLM reads the uploaded 2D plan → structured JSON
   (rooms, dimensions, walls, doors, windows). One call per upload.
2. **Design/product selection** — LLM picks products from OUR database matching the
   user's chosen style tags (modern, minimalist…) + budget + room types. One call per project.
3. **Furniture photos → 3D models** — image-to-3D API converts 3–4 photos of a product
   into a GLB model. Done ONCE per product in the admin panel, stored in DB — never at
   user request time.

Everything else — the 3D viewer, replacing tiles/furniture, price breakdown, store
hover-tooltips — is ordinary app code reusing the existing calculator engine and DB.

## Feasibility verdict per requirement

| Requirement | Feasible? | How |
|---|---|---|
| Upload 2D plan, AI understands it | ✅ Yes | Claude/Gemini vision → JSON room polygons. ~90% accurate on clean plans; needs a review/correct step in UI |
| Generate interactive 3D (rotate/zoom) | ✅ Yes | Three.js / react-three-fiber: extrude walls & floors from parsed polygons. No AI involved |
| Use OUR products (tiles, wallpaper) in 3D | ✅ Yes | Product photos become textures on floor/wall surfaces. Category → surface mapping already exists (`linkedCategorySlug`) |
| Furniture from 3–4 photos placed in 3D | ✅ Yes, with caveats | Tripo AI supports multi-image → 3D (GLB). Quality varies; admin approves each model. Fallback: simple box + product photo |
| Style-tag-driven selection (modern, minimalist…) | ✅ Yes | `products.tags` JSON column already exists — just needs consistent tagging + an LLM ranking call |
| Replace any product in the 3D view | ✅ Yes | Click mesh → picker filtered by category → swap texture/GLB, recompute. Pure app code |
| Full price breakdown | ✅ Already built | `buildProjectSummary()` does exactly this |
| Hover → which stores sell it | ✅ Data exists | `stores` table + `products.storeId`. Just UI |

**What's genuinely hard:** floor-plan parsing is never 100% (hand-drawn/low-res plans fail);
multi-photo 3D generation quality is inconsistent for complex furniture; and a full 3D
editor is a big UI project. Mitigations: mandatory "review parsed plan" step, admin
approval of generated 3D models, and shipping a simple 3D viewer before a full editor.

## Which AI to use

### A. Vision + reasoning (floor plan parsing, product matching)

| Provider | Free for local testing | Notes |
|---|---|---|
| **Google Gemini** (2.5 Pro/Flash) | ✅ Real free tier, no card: ~100 req/day (Pro), 250/day (Flash) | Best for free development — the daily quota is plenty for local testing |
| **Anthropic Claude** | $5 one-time trial (~14 days, no card); Startup program up to $25k | Excellent vision + structured output; likely best parse quality. Use trial to benchmark |
| OpenAI | No meaningful free credits | Skip for testing phase |

**Strategy:** build a thin provider-agnostic wrapper (one `parseFloorPlan(image)` and one
`suggestProducts(style, rooms, budget)` function). Develop free on Gemini's free tier,
benchmark Claude with the $5 trial, decide by output quality before launch. Per-plan parse
cost at production prices is only a few cents either way.

### B. Image-to-3D (furniture)

| Provider | Multi-photo input | Free credits | Cost/model |
|---|---|---|---|
| **Tripo AI** | ✅ Yes (explicitly) | 2,000 credits on signup | ~$0.10–0.30 |
| Meshy | Single image mainly | 200 credits/month | ~$0.10–0.30 |
| Rodin | Yes | ❌ $120/mo min for API | $0.50+ |

**Strategy:** Tripo first (multi-image support matches the 3–4 photos requirement, big
free signup grant). All output GLB — the web-standard format Three.js loads natively.
Cost is one-time per product (500 products ≈ $50–150 total), not per user.

### C. 3D rendering — no AI needed

**Three.js + react-three-fiber + drei** (all free/open-source, React-native fit for the
Next.js stack). GLTF/GLB loading, orbit controls (rotate/zoom), raycasting (click/hover
on furniture), PBR materials (tile/wallpaper textures) are all built in.

Optional later: a "photoreal render" button using an image-gen model (e.g. Gemini image
generation / Flux) that takes a screenshot of the 3D scene + style prompt → beauty shot.
Nice marketing feature, not needed for MVP.

## Data model additions (when we build)

```
products:  + model3dUrl varchar        (GLB path, furniture only)
           + model3dStatus enum('none','pending','ready','failed')
           + textureUrl varchar        (tileable texture for surface products)
           + widthCm/depthCm/heightCm  (real dimensions for placement/scale)
projects:  + floorPlanUrl varchar      (uploaded 2D plan image)
           + parsedPlan json           (rooms as polygons, walls, doors, windows)
           + scene json                (surface→product and furniture placements)
           + styleTags json            (user's chosen styles)
new table: renders (optional, for photoreal render history)
```

Style-tag taxonomy to standardize in `products.tags`: modern, minimalist, classic,
scandinavian, industrial, loft, rustic, luxury + color families. Admin ProductForm gets
a tag multi-select; seed data gets tags backfilled.

## Step-by-step plan

### Phase 0 — Foundations (no AI yet) ~1 week
1. Schema additions above; drizzle push.
2. Define style-tag taxonomy; add tag editing to admin ProductForm; backfill seed products.
3. Add real dimensions (cm) to furniture products in admin.
4. Get API keys: Gemini (free), Claude ($5 trial), Tripo (2,000 free credits). Put in `.env.local`.

### Phase 1 — Floor plan upload + AI parsing ~1–2 weeks
5. Extend `/api/upload` (or new endpoint) to accept user floor-plan uploads (currently admin-only).
6. New `/api/ai/parse-plan`: sends image to vision LLM with a strict JSON schema prompt →
   `{ rooms: [{type, polygon[], widthM, lengthM}], doors[], windows[], scale }`.
7. Review screen: parsed rooms drawn as 2D overlay; user fixes room types/dimensions
   (this feeds the EXISTING `computeRoomAreas` + calculator engine — replaces manual room entry!).
8. Cache parse results by image hash; rate-limit per user.

### Phase 2 — Procedural 3D viewer ~2 weeks
9. Add three + @react-three/fiber + @react-three/drei.
10. Scene builder: extrude walls from polygons (default height by room type), floors,
    door/window openings; OrbitControls for rotate/zoom; room labels.
11. Default neutral materials; GEL total bar always visible.

### Phase 3 — Products on surfaces ~1–2 weeks
12. Texture pipeline: tileable texture per surface product (start: product photo as texture; better: admin uploads a proper tile/texture image).
13. Surface→category mapping (floor→flooring/tile, wall→paint/wallpaper, wet rooms→tile) reusing `linkedCategorySlug` logic.
14. `/api/ai/suggest-design`: LLM gets style tags + rooms + budget + candidate products (filtered by tags in SQL first) → returns product choice per surface per room.
15. Click surface → picker (existing catalog UI filtered by category) → live texture swap + price update via `buildProjectSummary`.

### Phase 4 — Furniture in 3D ~2–3 weeks
16. Admin: "Generate 3D" button on product → Tripo multi-image API (3–4 photos) → webhook/poll → store GLB → admin previews and approves (`model3dStatus`).
17. Placement: LLM suggests layout (`{productId, x, y, rotation}` per room, given room polygon + furniture dimensions) with collision/scale clamping in app code; user can drag, rotate, replace, delete. Products without GLB → dimension-accurate box + photo billboard.
18. Hover tooltip: name, price, store (name/logo/address/phone/link) from `stores` join.

### Phase 5 — Summary & ship ~1 week
19. Extend summary page: 3D snapshot + per-room, per-category breakdown, store list, materials + labor (already computed) + furniture.
20. Save scene json to project; shareable read-only link.
21. Cost controls: cache AI responses, queue 3D generation, per-user daily AI limits, kill-switch env flags.

### Later / optional
- Photoreal render button (image-gen from scene screenshot).
- AR view (WebXR / model-viewer) — GLBs make this nearly free to add.
- Multi-store price comparison per product (roadmap item already).

## Cost picture

- **Development/testing: ~0 GEL** — Gemini free tier (no card) + Claude $5 trial + Tripo 2,000 signup credits.
- **Production per user project:** one plan parse + one design suggestion ≈ $0.02–0.10.
- **One-time:** GLB generation ≈ $0.10–0.30 per furniture product (only products you choose to convert).
- Biggest real cost is engineering time; the AI bills are minor at this scale.

## Suggested build order rationale

Phase 1 alone is already shippable value (photo of plan → auto-filled calculator = huge
UX win over manual room entry). Each later phase layers on top without rework. The 3D
viewer works with zero AI if parsing fails (user draws/corrects rooms manually), so the
app never hard-depends on an AI provider.
