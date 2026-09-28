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

Most were found by reading the code while the docs were verified and have not been reproduced
at runtime yet; none has been fixed.

- Windows with no product render as an empty hole (the fixtures manifest lost its window role;
  re-run `pnpm models:fixtures`) — [3d-assets.md](3d-assets.md#known-gaps).
- Brigade orders are missing from the revenue report and the CSV —
  [marketplace.md](marketplace.md#known-gaps).
- Studio: Shift does not speed up keyboard panning; the walk-through's hint never shows; the
  hover card's phone line never renders — [design-studio/studio.md](design-studio/studio.md#known-gaps).
- Floor zones can no longer be created from the UI — [design-studio/finishes.md](design-studio/finishes.md#known-gaps).
- The layout engine can stand a piece through the end of a partial wall (the style's TV unit in
  test project #219); the studio outlines it red when selected —
  [design-studio/layout-and-matching.md](design-studio/layout-and-matching.md#known-gaps).
- The calculator's summary lines have no product link (`slug: ''`) — [budget.md](budget.md#known-gaps).

## Next features

- **Payments**: the marketplace records money but does not move it — no payment integration,
  no payouts, no invoices ([marketplace.md](marketplace.md)).
- **Realistic renders**: `project_renders` rows wait in `queued`; a worker that calls an image
  model with the screenshot and scene, writes `renderUrl` and flips the status is not built
  ([design-studio/studio.md](design-studio/studio.md#known-gaps)).
- **Uploads on Vercel**: request bodies are capped at 4.5 MB, so plan images, photos and the
  rare GLB still over it after the browser's optimization need a direct-to-bucket upload (a
  presigned PUT, then the byte sniff, the GLB optimization and the record); the planned
  storage driver writing to the cPanel box over WebDAV is not built either
  ([operations.md](operations.md)).
- **Models uploaded before optimization** stay as they came (locally #500 and #503); nothing
  re-optimizes stored files in bulk — re-upload them in the product form
  ([3d-assets.md](3d-assets.md#known-gaps)).
- **The Claude plan reader has not met a real plan with a real key**; expect prompt and
  label-parsing tuning at first contact ([design-studio/plan-reading.md](design-studio/plan-reading.md#known-gaps)).
- **Partners manage more themselves**: reviews and portfolios are seeded, not partner-managed; a
  brigade's rating and completed jobs are not computed from orders; new products of an approved
  store go live with no moderation step ([partners-and-admin.md](partners-and-admin.md)).
- **Finishes from partners**: the product form takes a texture's colour map only (no normal or
  roughness map); production needs `pnpm textures:colors` once for the finishes it already has
  ([design-studio/finishes.md](design-studio/finishes.md#known-gaps)).
- **Catalogue coverage**: more partner furniture (MODERN has none), curtains (no model anywhere),
  an air-conditioner model, a real radiator range, more moulding profiles
  ([3d-assets.md](3d-assets.md#known-gaps), [design-studio/technical-and-fittings.md](design-studio/technical-and-fittings.md#known-gaps)).
- **Editing**: draw walls and move rooms in 3D; walk-through collision is deliberately off
  ([design-studio/plan-board.md](design-studio/plan-board.md#known-gaps)).
- **Room separators**: a line on the 3D floor where one runs, corner furniture kept off an open
  edge, the app's separator only from partial walls square to the plan; a studio (one room in
  two parts) still takes one floor and one set of walls in the calculator's catalogue
  ([design-studio/plan-board.md](design-studio/plan-board.md#known-gaps)).
- **Pricing accuracy**: wall heights of their own, net wall areas in the calculator, a
  heat-loss calculation for radiators ([budget.md](budget.md#known-gaps),
  [calculator.md](calculator.md#known-gaps)); the style's skirting boards and cornices as
  products like its floors and walls ([design-studio/finishes.md](design-studio/finishes.md#known-gaps)).
- **Projects**: live updates between two tabs on one project
  ([project-flow.md §19](project-flow.md#19-known-gaps)).
- **Calculator finishes**: a floor in two products has a share, not a place (the board and 3D
  show its larger product), and the summary and the orders do not name a pick's walls or share
  ([calculator.md](calculator.md#known-gaps)).
- **Orders**: nobody on the staff is told when a store order arrives for review (the queue, the
  dashboard and the sidebar's count are the signal); the customer cannot cancel or message from
  the project page; one supplier for every construction material
  ([marketplace.md](marketplace.md#known-gaps)).
- **Accounts**: no password-reset link sent from the account page, no audit trail of account
  changes in the database, brigades cannot register or change their crew
  ([auth-and-roles.md](auth-and-roles.md#known-gaps), [partners-and-admin.md](partners-and-admin.md#known-gaps)).
- No SMS notifications; admin has no bulk product import; files uploaded in a form that is
  never saved stay in storage ([catalog.md](catalog.md#known-gaps)).
- **Categories**: no drag-and-drop on the tree page (a category moves through its form); a
  product sits in one category; a new 3D kind needs its subcategory and icon made by hand
  ([categories.md](categories.md#known-gaps)).
- **Brigade portal**: admin previewing it (`?team=`) sees the generic sidebar, without the
  brigade's "Projects" link; a brigade sees its project as the customer has it now, not as it
  was when booked ([partners-and-admin.md](partners-and-admin.md#known-gaps)).

## Known gaps by area

Each topic document ends with its own "Known gaps" section:
[calculator.md](calculator.md#known-gaps) ·
[project-flow.md §19](project-flow.md#19-known-gaps) ·
[budget.md](budget.md#known-gaps) ·
[marketplace.md](marketplace.md#known-gaps) ·
[partners-and-admin.md](partners-and-admin.md#known-gaps) ·
[catalog.md](catalog.md#known-gaps) ·
[categories.md](categories.md#known-gaps) ·
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
