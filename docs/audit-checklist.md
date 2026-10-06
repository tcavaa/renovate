# Audit checklist (open items)

The working list from `codebase-audit-combined.md` (the combined first + second audit, at
`a58cca8e`), re-checked against the code on 6 Oct 2026. Items already fixed are not listed here
— they are in the **Done log** at the bottom with their commits. Tick an item (`[x]`) and move it
to the Done log in the same commit that fixes it. IDs are the audit's (C = critical, P = first
audit, S/SEC/PAY = security, N/NX = Next.js, M = memory, R = refactor, numbers = roadmap rows).

Related: [roadmap.md](roadmap.md) (product work and known gaps) · [testing.md](testing.md).

## Top 10 by urgency

1. [x] **Editor data loss** (state §11, 1.8): calculator board sockets not in the autosave
   signature (`CalculatorAutosave.tsx` vs `saveProject.ts`) + a "signature ⊇ payload" test; a
   project over the localStorage quota silently loses its local copy (`lib/flow/storage.ts`);
   two tabs share one dirty flag (no `storage` listener); a 401 during autosave shows as a
   generic error.
2. [x] **Undo integrity, the cheap part** (P4, P5, 1.8): one commit per slider gesture
   (`SwapPanel`, `FixturePanel`, `ElementInspector` → `placeItem`); pin version 01 (the 13th
   version evicts it and `ensureExistingVersion` wipes history); `restoreVersion` snapshots
   `styleId`; `locked` enforced in store actions (drag, mirror, delete ignore it today);
   `resizeRoom`'s polygon-only path mutating shared rooms.
3. [ ] **Abuse and cost limits** (P2 rest, S7, 1.1): run the cPanel client-address check
   ([operations.md](operations.md#rate-limits-and-the-client-address)); require a session (or a
   daily global cap) for `parse-plan` (Claude spend) and `upload-plan`; per-user limits and a
   concurrency cap (semaphore/worker) on GLB uploads (`app/api/design/models`, `upload/model`);
   reject oversized bodies before `formData()`; IPv6 bucketed by /64.
4. [ ] **Go-live paperwork and a real bug** (2.8): privacy policy names Sentry and Anthropic and
   says who sees projects (brigades, staff); **account deletion fails (500) when the user has a
   project** — fix it or stop promising it; real company name/code/address
   (`footer.*` in `lib/i18n`); confirm the PCI SAQ level with Flitt (likely A-EP: script
   integrity per 6.4.3 / 11.6.1).
5. [x] **Persistence out of the hot path** (R3, P6, perf #2/#4, 2.4): a debounced `StateStorage`
   (flush on `pagehide`); versions to their own endpoint + IndexedDB, lazy-loaded, out of every
   autosave body and the step RSC payload; projected columns in `GET /api/projects`; UI/session
   fields out of the persisted store. *Done: debounced storage, versions only on change,
   projected `GET /api/projects`. Left (moved below): versions still in the step's RSC payload
   (N1) and in the local cache — a versions endpoint + IndexedDB, lazily loaded.*
6. [x] **3D failure modes** (P10, 3.1): an error boundary around `<Viewer3D>` that keeps trays and
   2D usable; a WebGL probe with a translated fallback (not a 45 s spinner); evict failed
   textures (render black next time); reset the Draco loader after a failure; redraw on
   context restore; reset `sceneShownWhole` per project.
7. [x] **Re-render storms** (P8, R4, perf #1a/#1b/#3, 2.5): atomic selectors + `useShallow` on the
   studio, design plan/technical and calculator plan pages and `PlanWorkspace`; a stable
   `useDesignActions()`; `memo(Viewer3D)` with stable handlers; `shadowMap.autoUpdate = false`
   with `needsUpdate` on change.
8. [x] **Small security batch** (1.7, 5.2): `GET /api/checkout` answers 401 before the owner
   check (`null === null` matches owner-less projects — S20); CSV formula escaping in the revenue
   export (S12); Origin check or JSON content-type in `handle()` (S18); bounds on calculator
   `rooms` / `floorM2 ≥ 0` / `specs` / render `camera` (S16); asset URLs overwritten from the
   catalogue on save (S14); `cpanel.yml`'s manual trigger runs CI first.
9. [x] **Visible Next.js bugs** (N2, N3, NX-6, 2.10): time-zone hydration mismatches
   (`formatDateTime` with `Asia/Tbilisi` via `Intl`); `next/image` refusing partner image hosts
   (allow them or `unoptimized`); an invalid date param crashes `/admin/payments`.
10. [x] **Dead code and repo hygiene** (§6, R8, 1.10): `.gitignore` misses
    `public/uploads/products/own-*` (4 files committed — untrack them); remove `RoomForm`/`RoomList`,
    `useWorkers`, `usePlatformFees` + `GET /api/settings`, `GET /api/design/projects`, `types/*`,
    unused `skeleton`/`accordion`, the `layout.ts` legacy (keep `findFreeSpot`), the dead 3D
    symbols, `FLITT_TEST_SECRET` duplicate; unused deps `react-hook-form`, `@hookform/resolvers`,
    `@radix-ui/react-tabs`; an unused-locals lint rule; CLAUDE.md still lists React Hook Form.
    *Done in two rounds (also `nanoid`, `buildScene()`, `photo`/`highlight`, `cylinder`, 36 unused
    i18n keys; then the `'openings'` edit mode, the night glass tint and nine unused
    `MaterialRole`s, `onSelectOpening`, `POST /api/calculator/materials`, `GET /api/workers`,
    `peek`/`cachedIds`, the `serverActions` config). The `'guest'` owner branch is not dead:
    older versions wrote it and testers' browsers may hold it — it goes with `legacy.ts`.*

## Parked by decision (not to do now)

- [ ] **Server-owned hinge** (C1, R0, 2.1) — decided 6 Oct 2026: the empty start ("start from
  scratch") is free by design. Still open if wanted later: the save routes accept
  `calculated`/`generated` without a `project_payments` row (devtools bypass), a missing
  `progress` counts as done, the fee area is the client's `floorM2` (can be negative), no delta
  charge when the flat grows.
- [ ] **Flitt go-live** (C2, 1.4) — waits for the merchant id: refuse the public sandbox in
  production unless opted in; `test_mode` on `project_payments` (or delete the sandbox rows at
  launch — [payments.md](payments.md#known-gaps)); revenue excludes test payments; a scheduled
  reconciliation sweep; own-item payments in revenue.

## Everything else still open

### Editor and state
- [ ] Command funnel `apply(command)` + transactional patch-based history; ~20 actions bypass
  history (`setWorks`, `setExisting`, `lockItem`, `applyPendingPicks`, `setStyle`, `ensure*`…);
  write the "undo restores the pre-state" property test first (R1, 2.6)
- [ ] Split the design store by lifecycle: document / session / sync / versions / calculator board (R2)
- [ ] Validate DB JSON on read (`lib/projects/saved.ts`, `json<T>()` returns a string as `T` on
  parse failure); drop the read-time row shims (`fromSevenSteps`, `saved.ts`' row shims,
  `migrateFinishPicks`, `liftFlags`, `LEGACY_WORKS`, `RETIRED_RATE_KEYS`, the `loadCalculatorHalf`
  rescue) — no backfill needed, old rows may break (R7, 2.9). *The persist `merge` now validates.*
- [ ] Editor shortcuts change the document behind open dialogs (ST-3); Escape/✕ closes the
  non-modal payment dialogue during 3-D Secure, reopening makes a new Flitt order (NX-7)
- [ ] Item/room/wall caps only in the server schema — enforce in the client with a message (perf #17)
- [x] Remove `lib/flow/legacy.ts`, the persisted stores' old-version migrations and the `'guest'`
  owner branch (no compatibility with older app versions is kept — no real data yet)

### 3D
- [ ] Decompose `Viewer3D` (1,705 lines): scene groups + id→object registries, camera rig,
  frame scheduler, tool objects with pure gesture cores (wall-offset parity with 2D — 3D skips
  `snapWallOffset`), overlay layer excluded from photos (R5, 3.2, 3.3)
- [ ] Split the studio page (1,412 lines) and `PlanEditor` (1,685) (R4, 3.7)
- [ ] BVH + rAF-throttled hover; no handlers in `ProjectViewer` (perf #6, 4.2)
- [ ] Per-room shells + material-slot paint (perf #7, 4.3); instanced/batched furniture,
  selective shadows (perf #5, 4.4)
- [ ] GLB/texture LRU, KTX2, device-adaptive DPR and shadow size (M1, PF-6, 4.5)
- [ ] Memory leftovers M2–M7 (dead renderers, ghost boxes, wall-drag ghost, equipment group
  disposal, texture release timer); electrical preview rebuilt per pointermove (perf #11)
- [ ] Interaction: no highlight for selected non-items; fittings on a cut-away wall still
  pickable; a refused fitting move leaves the object displaced; Shift uses `event.key`;
  Space/arrows `preventDefault`ed globally; photos include editor overlays
- [ ] Touch: pointer-id tracking, pinch on the board, walk-mode touch controls (PF-5, 3.5)
- [ ] Shared 3D helpers; `ModelUploader` uses `modelPreview` (fixes the admin turntable leak) (R9)
- [ ] Benchmark scene at 50/150/500 items (4.1)

### Next.js and delivery
- [x] Versions out of the step RSC payload and the local cache: their own endpoint
  (`GET /api/projects/[id]/versions`), fetched by the studio, the version actions waiting for them
  (`versionsLoaded`); no IndexedDB — a version kept and not yet saved is lost on an offline reload
- [ ] Step HTML inlines the whole row; rate book from the server layout; server-side resume
  `redirect()` (N1, 2.11)
- [ ] Dictionary split by area (N4); nothing static, `ORDER BY RAND()` on the landing (N5);
  bundle leaks via `ProjectCardMenu` and `lineName → PlanToolbar` (N7); `cache()` `auth()` and
  seed `SessionProvider` (N9) (2.12)
- [ ] Error boundaries for admin / partner / (auth) (N8)
- [ ] Nonce CSP; Flitt's CSP widening only on payment pages (N10, NX-5, S10); static `/uploads`
  headers and the cPanel uploads `RemoveHandler`
- [ ] Lazy-load Sentry Replay, trim tracing on public routes (perf #15, NX-3, 4.6)
- [ ] nginx `client_max_body_size 16m` vs the 40 MB model limit (N12); rate-book defaults stick
  after a failed fetch (N11); English-only titles on terms/privacy/refund (NX-8); small items
  (favicon, robots/sitemap, `server-only` guards — also on `lib/payments/service.ts`) (N13)
- [ ] GLB processing in a worker/queue; a CDN for `/models` and `/textures` (perf #13/#14, 4.7)

### Security and accounts
- [ ] `MAIL_DRIVER=smtp` required in production (now only a startup warning) (S11)
- [ ] Account enumeration and targeted lockout: dummy bcrypt, progressive delay or captcha,
  lockout by e-mail + IP (S13, 5.4); anonymous bookings mail partners (S17)
- [ ] Commission fields reach customers (S15)
- [ ] Seeded `@remonti.ge` accounts — confirm the domain is ours (S8)
- [ ] `drizzle-orm` < 0.45.2 (identifier SQLi advisory, not reachable); deploy hygiene: tag
  validation in `deploy.yml`, one shared brigade password (S19)
- [ ] Storage quotas per user; EXIF stripping; CC BY credits (5.5)

### Tests and operations
- [ ] `lib/finance/orders.ts` (4%), `report.ts`, `notify.ts`, `settings.ts` tested and in the gate (P11)
- [ ] e2e in CI with MySQL and a stubbed Flitt; specs for the calculator payment, checkout, profile (5.1)
- [ ] Scene-building invariants and the demand-render contract tested (`buildScene` 35%,
  `buildStructure` 28%, `modelLoader` 16%)
- [ ] cPanel deploy health check and rollback; log rotation; the migrator honours `DATABASE_SSL` (5.3)

### Duplicates and types (do when touching the area)
- [x] Admin `dateRange()` helper (was 3 copies) — done with top 10 #9
- [ ] Payment enums, `BuildMaterial` and technical/electrical kinds from one `as const` array each
- [ ] Own-item "free or paid" rule in one function (3 routes)
- [ ] Label helpers out of `PlanToolbar`, generic fields out of `ElementInspector`; budget line
  keys built and parsed in `lib/design/ticks.ts`; fit-to-view ×3; one client envelope type
- [ ] `noUncheckedIndexedAccess` for `lib/design`, `lib/design3d`; typed i18n lookups

## Done log

| Done | Audit IDs | Commit |
|---|---|---|
| cPanel build only from pushes to this repo's `main`; token kept from install/build; actions SHA-pinned; CI read-only | S1/P3, 1.2 (all but "CI before the manual trigger") | `57ae5957` |
| Sentry: explicit `dataCollection` (`satisfies`-typed), log/event scrubbing, genAI capture off, Replay blocks Flitt's form, own `/monitoring` route (DSN-pinned, body only, capped, rate-limited), `enableLogs` removed, production `MAIL_DRIVER=log` warns | C4, SEC-2/NX-4, NX-1, GAP1-2, PAY-14 (Sentry side), 1.3 | `c0f5784e` |
| Opening twins paired by ids, else mutual nearest; displaced halves repaired on load | C3, 1.5, test #5 | `c6001781` |
| Rate limiter keys on the last `X-Forwarded-For` hop | S2 key (cPanel check still open — top 10 #3) | `34dc503b` |
| Open redirect; social sign-in needs a vouched e-mail; `users.session_version` ends sessions after a reset or admin password; `next` 16.3.8, nodemailer, nanoid, mysql2; `pnpm audit --prod --audit-level critical` in CI | S4, S5, S6, S9 (but drizzle), 2.7, 1.7 (part) | `9b034c52` |
| Nullable timestamps `NULL DEFAULT NULL` (migration 0026), reproduced and fixed on MariaDB 10.6; a test refuses bare timestamps | OPS-4, 1.9 | `fd9aaa6e` |
| Autosave watches exactly what the save sends (board sockets were missed) + a guard test; storage-full, signed-out and 401 on the banner; another tab's clean mark no longer clears this tab's unsaved work | top 10 #1 (state §11, 1.8, test #4 in part) | `7ea4d94d` |
| Undo: a slider drag is one step; version 01 never evicted; style in the snapshot and `setStyle` one step; locks in the store and the 3D drag; `lockItem` undoable; wall-less `resizeRoom` no longer mutates history | top 10 #2 (P4, P5 in part, 1.8) | `d1090928` |
| Persistence: debounced store writes (one per 400 ms burst, flushed on pagehide), versions sent only when changed, projected `GET /api/projects` | top 10 #5 (R3 in part, P6 in part, perf #2/#4 in part) | `b769566d` |
| 3D failures: WebGL probe + error boundary (`ViewerGuard`), redraw on context restore, failed textures retried, failed Draco decoder replaced, loading screen per flat | top 10 #6 (P10, 3.1) | `86ec03bb` |
| Re-render storms: stable `useDesignActions` + shallow picks on the editor pages and `PlanWorkspace`, `memo(Viewer3D)`, shadow map only on scene changes | top 10 #7 (P8, R4 in part, perf #1a/#1b/#3) | `30db0c1a` |
| Security batch: `GET /api/checkout` 401 first, cross-site writes refused in `handle()`, CSV formula escaping, bounded save payloads, catalogue asset URLs on reprice, manual cPanel publish runs CI | top 10 #8 (S12, S14, S16, S18, S20, 1.7 rest) | `cc2a767f` |
| Visible Next.js bugs: dates in Tbilisi time on both sides, partner pictures shown as they are, validated `dateRange()` in the admin lists | top 10 #9 (N2, N3, NX-6, 2.10) | `e99d1ecf` |
| Dead code: old room form/list, dead hooks and routes, `types/*`, rectangle editor (`findFreeSpot` kept), dead 3D symbols and exports, 36 i18n keys, 4 unused deps; unused-vars lint rule; own-item uploads ignored | top 10 #10 (§6, R8 in part, 1.10) | `caf52323` |
| Dead code, second round: the viewer's openings mode, night glass tint and 9 material roles, `onSelectOpening`, `POST /api/calculator/materials`, `GET /api/workers`, `peek`/`cachedIds`, `serverActions` | top 10 #10 rest | `7a49cd93` |
| Versions out of the step payload and the browser copy (`GET /api/projects/[id]/versions`, `versionsLoaded`, `versionsSerial`); old-version compatibility dropped: `legacy.ts`, the `'guest'` owner, both stores' migrations; the cached copy validated on load | #5 rest, R7 in part, legacy removal | `c251ba0f` |
| Payments: approval + half in one transaction, reversal revokes and is never re-approved, conditional writes, 30-day unsettled check, zero fee passes, callback size cap + rate limits, constant-time signatures, `service.ts` tested (89%) and gated | C7, C8, PAY-9/10/11, R10 (part), 1.6, 2.2/2.3 (payments part), test #1 | `ffc60f92` |
