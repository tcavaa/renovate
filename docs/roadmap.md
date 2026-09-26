# Roadmap: next tasks and open gaps

The one list of work that is known and not done: bugs found and not yet fixed, features planned
or missing, and pointers to each area's detailed "Known gaps". Read it when planning work, when
asked "what's next", and before starting a feature (it may already be half-described here).

**Keeping it current.** When a task leaves something unfinished, or you find a bug or a gap you
are not fixing now, add one line here (with a link to the topic document that explains it) and
the detail to that document's "Known gaps". When you finish an item, delete its line here and
its paragraph there, and describe the new behaviour in the topic document. This file lists
what is *not* done; what *is* done lives in the topic documents; history lives in git.

## Bugs found and not yet fixed

Found by reading the code while the docs were verified; none has been fixed or reproduced at
runtime yet.

- Catalogue agents get 403 editing a store's product (`editable()` in
  `app/api/products/[id]/route.ts` exempts only `admin`) — [auth-and-roles.md](auth-and-roles.md#known-gaps).
- Social (Google/Facebook) sessions probably carry the provider's id and no role instead of the
  `users` row's — [auth-and-roles.md](auth-and-roles.md#known-gaps).
- The product page by slug and `GET /api/products/[id]` skip the public-product conditions
  (pending stores, inactive products, people's own furniture) — [catalog.md](catalog.md#known-gaps).
- Windows with no product render as an empty hole (the fixtures manifest lost its window role;
  re-run `pnpm models:fixtures`) — [3d-assets.md](3d-assets.md#known-gaps).
- The `Deploy` workflow cannot run (`ci.yml` is not callable) and the CI coverage gate is
  probably not applied — [operations.md](operations.md#known-gaps).
- Brigade orders are missing from the revenue report, the CSV and the customer's order list —
  [marketplace.md](marketplace.md#known-gaps).
- Three assertions in `tests/unit/design/ticks.test.ts` test retired keys and pass vacuously —
  [budget.md](budget.md#known-gaps).
- Studio: Shift does not speed up keyboard panning; the walk-through's hint never shows; the
  hover card's phone line never renders — [design-studio/studio.md](design-studio/studio.md#known-gaps).
- Floor zones can no longer be created from the UI — [design-studio/finishes.md](design-studio/finishes.md#known-gaps).
- The calculator's summary lines have no product link (`slug: ''`) — [budget.md](budget.md#known-gaps).

## Next features

- **Payments**: the marketplace records money but does not move it — no payment integration,
  no payouts, no invoices ([marketplace.md](marketplace.md)).
- **Realistic renders**: `project_renders` rows wait in `queued`; a worker that calls an image
  model with the screenshot and scene, writes `renderUrl` and flips the status is not built
  ([design-studio/studio.md](design-studio/studio.md#known-gaps)).
- **Uploads on Vercel**: request bodies are capped at 4.5 MB, so large GLBs, plan images and
  photos need a direct-to-bucket upload (a presigned PUT, then the byte sniff and the record);
  the planned storage driver writing to the cPanel box over WebDAV is not built either
  ([operations.md](operations.md)).
- **The Claude plan reader has not met a real plan with a real key**; expect prompt and
  label-parsing tuning at first contact ([design-studio/plan-reading.md](design-studio/plan-reading.md#known-gaps)).
- **Partners manage more themselves**: reviews and portfolios are seeded, not partner-managed; a
  brigade's rating and completed jobs are not computed from orders; new products of an approved
  store go live with no moderation step ([partners-and-admin.md](partners-and-admin.md)).
- **Catalogue coverage**: more partner furniture (MODERN has none), curtains (no model anywhere),
  an air-conditioner model, a real radiator range, more moulding profiles
  ([3d-assets.md](3d-assets.md#known-gaps), [design-studio/technical-and-fittings.md](design-studio/technical-and-fittings.md#known-gaps)).
- **Editing**: draw walls and move rooms in 3D; walk-through collision is deliberately off
  ([design-studio/plan-board.md](design-studio/plan-board.md#known-gaps)).
- **Pricing accuracy**: wall heights of their own, overlaid finishes, net wall areas in the
  calculator, a heat-loss calculation for radiators ([budget.md](budget.md#known-gaps),
  [calculator.md](calculator.md#known-gaps)).
- **Projects**: live updates between two tabs on one project
  ([project-flow.md §19](project-flow.md#19-known-gaps)).
- No SMS notifications; admin has no bulk product import.

## Known gaps by area

Each topic document ends with its own "Known gaps" section:
[calculator.md](calculator.md#known-gaps) ·
[project-flow.md §19](project-flow.md#19-known-gaps) ·
[budget.md](budget.md#known-gaps) ·
[marketplace.md](marketplace.md#known-gaps) ·
[partners-and-admin.md](partners-and-admin.md#known-gaps) ·
[catalog.md](catalog.md#known-gaps) ·
[3d-assets.md](3d-assets.md#known-gaps) ·
[auth-and-roles.md](auth-and-roles.md#known-gaps) ·
[operations.md](operations.md#known-gaps) ·
[testing.md](testing.md#known-gaps) ·
design studio: [overview](design-studio/overview.md#known-gaps),
[plan-board](design-studio/plan-board.md#known-gaps),
[plan-reading](design-studio/plan-reading.md#known-gaps),
[layout-and-matching](design-studio/layout-and-matching.md#known-gaps),
[studio](design-studio/studio.md#known-gaps),
[3d-engine](design-studio/3d-engine.md#known-gaps),
[finishes](design-studio/finishes.md#known-gaps),
[technical-and-fittings](design-studio/technical-and-fittings.md#known-gaps).
