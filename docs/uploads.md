# Uploads: files straight to storage

How a file gets from someone's computer into the app: floor plans, product and finish pictures,
partner and own-furniture 3D models, studio photos. The bytes never pass through a function —
the browser sends them to storage itself — and nothing is published before the server has
checked it. Read this before touching `lib/uploads/`, `lib/storage/`, `app/api/uploads/**`, a
route that takes a file, or a component that sends one.

Related: [operations.md](operations.md) (Supabase, Vercel's limits, the daily cron) ·
[3d-assets.md](3d-assets.md#uploads-are-optimized) (the GLB recipe) · [catalog.md](catalog.md)
(product pictures and models, own furniture) · [design-studio/plan-reading.md](design-studio/plan-reading.md)
(plans) · [design-studio/studio.md](design-studio/studio.md) (photos) ·
[auth-and-roles.md](auth-and-roles.md) (who may upload).

## Why

On Vercel a function takes a request body of at most 4.5 MB, on every plan. A phone photo of a
plan, a scan, a partner's model or a retina screenshot is often more. So the browser asks the
server for a one-time place in storage, sends the file there directly, and tells the route the
file is for which upload it was; the route reads the bytes back from storage, checks them,
optimizes them as it always has, and publishes the result. The size limits are the app's own
again ([kinds](#kinds-and-limits)), not the host's.

## Key files

| File | Responsibility |
|---|---|
| `lib/uploads/kinds.ts` | the upload kinds, their size limits and accepted types (isomorphic) |
| `app/api/uploads/route.ts` | `POST /api/uploads` — asks for a place: the guard for the kind, the rate limits, a granted upload |
| `lib/uploads/claim.ts` | `grantUpload` (row + signed target), `claimUpload` (once, by its maker, in time, real size), `sweepUploads` |
| `lib/uploads/direct.ts` | the browser: `sendToStorage(kind, file, { onProgress })` → upload id; `claimWith(route, body)` |
| `lib/uploads/browserImage.ts` | the browser's own pass: photos to WebP within 1600 px, plans only when huge, screenshots to WebP/JPEG |
| `lib/storage/index.ts` | the driver interface: a public area and a private staging area |
| `lib/storage/supabase.ts` | production: buckets `uploads` (public) and `uploads-staging` (private), signed upload URLs |
| `lib/storage/local.ts`, `app/api/uploads/staging/route.ts` | development: `public/uploads` and `.uploads-staging/`, with a `PUT` route standing in for the signed URL |
| `lib/db/schema.ts` → `uploads` | one row per granted upload: kind, maker, staging key, limit, expiry, status |
| `app/api/upload/route.ts`, `upload/model/route.ts`, `design/upload-plan/route.ts`, `design/renders/route.ts`, `design/models/route.ts` | the routes that claim an upload and publish it |
| `lib/uploads/sniff.ts`, `glb.ts`, `imageOptimize.ts`, `textureOptimize.ts`, `glbOptimizeServer.ts` | what the bytes are, and the recipes that store them |
| `app/api/cron/cleanup/route.ts` | the daily sweep of stale uploads and staged files |

## The flow

1. **The browser prepares the file** (`browserImage.ts`, the GLB recipe in the model dialogs) and
   checks it against its kind's limit.
2. **It asks for a place** — `POST /api/uploads { kind, size, type }`. The route applies the guard
   the finishing route has always had for that kind ([below](#kinds-and-limits)) and the rate
   limits, refuses a declared size over the kind's limit, makes a row in `uploads` (pending, its
   maker, the limit, an expiry 30 minutes on) and asks storage for a one-time place under a key
   **the server makes**: `<kind>/<day>/<upload id>` in the private staging bucket. The answer is
   `{ id, url, method: 'PUT', headers, maxBytes, expiresAt }`.
3. **It sends the bytes there itself** (`XMLHttpRequest`, for progress) — to Supabase in
   production, never through a function.
4. **It hands the route the upload's id** — `POST /api/upload { upload, folder }`, `POST
   /api/upload/model { upload }`, `POST /api/design/upload-plan { upload }`, `POST
   /api/design/renders { upload, projectId, roomName, camera }`, `POST /api/design/models
   { upload, photo?, name, kind, …cm }`.
5. **The route claims it** (`claimUpload`): one statement marks the row used only if it is
   pending, of this route's kind, not expired, and the caller's (a visitor's plan is the one
   upload made without an account); a second claim of the same id fails, a racing one too. It
   reads the staged object's **real size** before its bytes and refuses one over the limit, reads
   the bytes, and deletes the staged copy whatever happens next.
6. **The route checks what the bytes are** (`sniffImage`, `sniffModel`, `inspectGlb` — never the
   name, the declared type or a URL the browser sent), optimizes them as before (WebP pictures,
   the GLB recipe) and **publishes** to the public area under a new random name; the row that
   points at the file is written last.

Nothing in staging is ever served; nothing reaches the public bucket unchecked.

## Kinds and limits

| Kind | Limit | Who may send it | Claimed by |
|---|---|---|---|
| `image` | 8 MB | admin, catalogue agents, linked partners (`requireUploader`) | `POST /api/upload` (folder: products, textures, workers, categories, stores, misc) |
| `model` | 40 MB | admin, catalogue agents, stores (`requireCatalogEditor`) | `POST /api/upload/model` |
| `plan` | 20 MB | anyone — the plan step is open to visitors — 10 an hour per address (`RATE_RULES.uploadPlan`) | `POST /api/design/upload-plan` |
| `render` | 8 MB | a signed-in person, 60 an hour (`RATE_RULES.render`) | `POST /api/design/renders` (their own project) |
| `own_model` | 40 MB (8 MB if it is a photo) | a signed-in person | `POST /api/design/models` |
| `own_photo` | 8 MB | a signed-in person | `POST /api/design/models` (`photo`) |

Every grant also counts against `RATE_RULES.uploads` (120 an hour per address). All limits sit
under the 50 MB a file may have in Supabase Storage on the free plan, which is also each bucket's
own limit (`file_size_limit`) — a file over it is refused by storage itself. The buckets also take
only the content types listed for them; the type is never trusted, only a first filter.

## What the browser does first

- **Photos** (a product, a store's logo, a person's own piece, a model's snapshot): within 1600 px
  and WebP at 0.9 when that is smaller (`optimizePhotoForUpload`). A GIF and a small WebP go as
  they are; Safari, which writes no WebP, sends the original and the server converts it.
- **Finish textures** go as they are: the server's texture pass decides size and quality once, so
  no texture is encoded lossily twice.
- **Plans** are kept exactly as they came (`optimizePlanForUpload`) unless their longest side is
  over 4096 px or they are over 20 MB: then they are scaled down, aspect kept, at the best smoothing
  the browser has — a PNG to PNG (lossless: thin lines and small figures stay sharp), a photo or
  scan to JPEG at 0.92. A PDF has already been rendered to a PNG in the browser
  (`lib/design/planPdf.ts`, 2200 px). Nothing is squeezed to fit a request limit.
- **Studio screenshots** (a PNG of the canvas, several MB at retina size) go as WebP or JPEG at
  0.9 (`compressScreenshot`).
- **GLBs** go through the browser half of the GLB recipe (WebP textures, meshopt geometry —
  [3d-assets.md](3d-assets.md#uploads-are-optimized)); the server's pass still runs.

## Storage drivers

`lib/storage` has two areas and two drivers (`STORAGE_DRIVER`):

- **`supabase`** (production): `put`/`get`/`delete`/`list` on the public bucket `uploads`, served
  from Supabase's CDN at `<SUPABASE_URL>/storage/v1/object/public/uploads/<key>` with a year's
  `Cache-Control` (names are unique); `createUploadTarget` asks for a signed upload URL in
  `uploads-staging` (valid two hours by Supabase's rule — the row's 30 minutes is what counts;
  one object, no overwriting), `stagedSize` reads the object's metadata, `getStaged` and
  `deleteStaged` the rest. The client carries `SUPABASE_SECRET_KEY` and lives only on the server.
  The browser's `PUT` needs no key: the token in the URL is the authorisation.
- **`local`** (development, e2e): `public/uploads` served by Next at `/uploads/<key>`, staging in
  `.uploads-staging/` (git-ignored); the "signed URL" is `PUT /api/uploads/staging?key=…`, which
  takes the bytes only for a pending, unexpired upload with that key, counts them as they arrive
  against the kind's limit, and only once. It answers 404 with the Supabase driver. Refused on
  Vercel (a read-only disk).

The CSP's `connect-src` includes Supabase's origin (`next.config.mjs`, from `SUPABASE_URL` at
build time): the browser `PUT`s there and the studio fetches models from there.

## Cleaning up

A staged file nobody claimed, a used or expired row, and a plan nobody refers to are swept every
day by `/api/cron/cleanup` (rows and staged files a day old, plans a day old and unreferenced).
A file a deleted row let go of is removed with the row (`removeUnusedUploads`,
[catalog.md](catalog.md#deleting-leaves-no-files-behind)).

## Tests

- `tests/unit/uploads/claim.test.ts` — the grant's key and limits, and the claim's rules: once, by
  its maker, for its route, in time, the real size, nothing left staged.
- `tests/integration/upload-routes.test.ts` — who may ask for which kind, the plan's rate limit, a
  finishing route's answers (an expired claim, a script called a PNG, a URL instead of an id), and
  the gzipped bodies of `lib/api/body.ts`.
- By hand: sign in locally, upload a plan in the studio, a picture and a model in
  the product form, a photo of one's own piece and a studio photo; then the same on the Vercel
  deployment.

## Known gaps

- **Supabase signs an upload URL for two hours**, not less; the app's own expiry (30 minutes)
  decides whether a file is claimed, and a late upload stays in staging until the daily sweep.
- **The size of a staged file is checked after it arrived**: a client can put up to 50 MB (the
  bucket's limit) into staging before a claim refuses it; the grant limits how often.
- **Uploads made in a form that is then abandoned** stay in the public bucket (only plans are
  swept by reference), as they did on disk.
- **No resumable uploads**: a large model on a poor line restarts from nothing if the connection
  drops (Supabase's TUS endpoint would resume it).
