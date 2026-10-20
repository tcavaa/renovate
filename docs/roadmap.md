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
at runtime yet; the last one was seen on the sample plan.

- Windows with no product render as an empty hole (the fixtures manifest lost its window role;
  re-run `pnpm models:fixtures`) — [3d-assets.md](3d-assets.md#known-gaps).
- Brigade orders are missing from the revenue report and the CSV —
  [marketplace.md](marketplace.md#known-gaps).
- Studio: Shift does not speed up keyboard panning; the walk-through's hint never shows; the
  hover card's phone line never renders — [design-studio/studio.md](design-studio/studio.md#known-gaps).
- Floor zones can no longer be created from the UI — [design-studio/finishes.md](design-studio/finishes.md#known-gaps).
- The calculator's summary lines have no product link (`slug: ''`) — [budget.md](budget.md#known-gaps).
- Inferred doors can leave a flat with no front door (windows are placed first; the sample
  plan has none) — [design-studio/plan-reading.md](design-studio/plan-reading.md#known-gaps).

## Before real customers

- **Plans**: Pro on Vercel and Supabase; the 3D library takes about 0.55 GB of Supabase's free
  1 GB of storage — [operations.md](operations.md#before-real-customers).
- **Performance left from the 14 Oct audit**: reading a plan takes ~7 s of four requests in a row;
  Sentry's server tracing does not load (no server timings anywhere on Hobby); Next prefetches
  every dynamic page twice per link (route tree, then the page) — [operations.md](operations.md#known-gaps).

- **Subscriptions, what is left**: no reminder before a plan ends, subscriptions not in the revenue
  report, a photo own item paid for before photos become models, the old per-m² fee columns to
  drop — [subscriptions.md](subscriptions.md#known-gaps).

## Next features

- **AI generation, what is left** — phase 1 and the wall decor are built
  ([design-studio/decor.md](design-studio/decor.md#the-ai-designer)); next: the rules module and
  metrics, layout intent per piece (phase 2), an evaluation set, a retry with violations —
  [design-studio/ai-layout-plan.md](design-studio/ai-layout-plan.md).
- **The catalogue's library rows**: some sizes are wrong (a dresser listed 138 × 166 cm), taps and
  mixer panels are filed as basins, 96 models' facing was left unconfirmed by the audit
  ([3d-assets.md](3d-assets.md#known-gaps)); coffee machines, an oven and range cookers are filed as
  kitchen runs, and only TVs of the electronics are placed
  ([design-studio/layout-and-matching.md](design-studio/layout-and-matching.md#known-gaps)).
- **Decor, what is left**: moving, resizing and adding a decor piece by hand in the studio (and
  decor without a key); a labour line for fitting it; coves in L-shaped rooms; sockets and
  radiators on a decorated wall ([design-studio/decor.md](design-studio/decor.md#known-gaps)).

- **3D performance, what is left**: every paint click rebuilds every room's shell; switching
  2D ↔ 3D rebuilds the view; the 1.75 pixel ratio still costs on weak GPUs; textures are not
  GPU-compressed — about 400 MB of GPU memory for a
  furnished flat; KTX2 ETC1S at full quality was compared (about the same download, a quarter of
  the memory, a little softer up close) and left for when phones run short of memory
  ([design-studio/3d-engine.md](design-studio/3d-engine.md#performance)).
- **Sentry, what is left**: name it in the privacy policy as a processor; set the signed-in
  user on server events ([operations.md](operations.md#known-gaps)).
- **Uploads, what is left**: no resumable uploads (a large model restarts after a dropped
  connection); a picture uploaded in a form that is then abandoned stays in the bucket
  ([uploads.md](uploads.md#known-gaps)).

- **Payments (Flitt, sandbox)**: going live — a merchant of our own, the company's name, code
  and address on the site (placeholders now), Flitt's review, `FLITT_TEST_MODE=false`, Apple
  Pay's domain file; the sandbox's `project_payments` rows deleted at launch; refunds from the
  admin (Flitt's reversal call); own-item payments in the revenue report; no scheduled sweep
  of unsettled payments; the save routes still accept the hinge without a payment; no payouts or
  invoices for partners ([payments.md](payments.md#known-gaps),
  [marketplace.md](marketplace.md#known-gaps)).
- **e2e**: nothing walks the calculator's payment, an own item's, the checkout (its rows, the
  contact, the thank-you) or the profile's details; the studio spec covers the design's, through
  Flitt's sandbox — not run since it moved to Flitt ([testing.md](testing.md#known-gaps)).
- **Realistic renders**: `project_renders` rows wait in `queued`; a worker that calls an image
  model with the screenshot and scene, writes `renderUrl` and flips the status is not built
  ([design-studio/studio.md](design-studio/studio.md#known-gaps)).
- **Models uploaded before optimization** stay as they came (locally #500 and #503); nothing
  re-optimizes stored files in bulk — re-upload them in the product form
  ([3d-assets.md](3d-assets.md#known-gaps)).
- **The Claude plan reader**: one wall thickness per grid line, outlined (not solid) walls get
  no gap snapping, the upload card does not show the reader's doubts or notes yet
  ([design-studio/plan-reading.md](design-studio/plan-reading.md#known-gaps)).
- **Partners manage more themselves**: reviews and portfolios are seeded, not partner-managed; a
  brigade's rating and completed jobs are not computed from orders; new products of an approved
  store go live with no moderation step ([partners-and-admin.md](partners-and-admin.md)).
- **Finishes from partners**: the product form takes a texture's colour map only (no normal or
  roughness map); production needs `pnpm textures:colors` once for the finishes it already has
  ([design-studio/finishes.md](design-studio/finishes.md#known-gaps)).
- **Catalogue coverage**: more partner furniture (MODERN has none), curtains (no model anywhere),
  a real radiator range and the partners' own equipment (the twelve equipment models are CC
  stock, some with a maker's logo), more moulding profiles
  ([3d-assets.md](3d-assets.md#known-gaps), [design-studio/technical-and-fittings.md](design-studio/technical-and-fittings.md#known-gaps)).
- **Model credits in the app**: the CC BY / CC BY-SA models (the equipment, the fixtures) need
  their author, title, licence and link shown where they are used; they are in the manifests
  only ([3d-assets.md](3d-assets.md#known-gaps)).
- **Editing**: draw walls and move rooms in 3D; walk-through collision is deliberately off
  ([design-studio/plan-board.md](design-studio/plan-board.md#known-gaps)).
- **Room separators**: a line on the 3D floor where one runs, corner furniture kept off an open
  edge, the app's separator only from partial walls square to the plan; a studio (one room in
  two parts) still takes one floor and one set of walls in the calculator's catalogue
  ([design-studio/plan-board.md](design-studio/plan-board.md#known-gaps)).
- **Balcony railings**: only the Claude reader finds them on an upload (the CV path never does); one railing design
  ([design-studio/technical-and-fittings.md](design-studio/technical-and-fittings.md#known-gaps)).
- **Pricing accuracy**: wall heights of their own, a heat-loss calculation for radiators
  ([budget.md](budget.md#known-gaps)); the style's skirting boards and cornices as products like
  its floors and walls ([design-studio/finishes.md](design-studio/finishes.md#known-gaps)).
- **Projects**: live updates between two tabs on one project
  ([project-flow.md §18](project-flow.md#18-known-gaps)).
- **Calculator finishes**: a floor in two products has a share, not a place (both are bought;
  the board and 3D show the larger), and the summary and the orders do not name a pick's walls
  or share ([calculator.md](calculator.md#known-gaps)).
- **Calculator ↔ design**: a door, window, radiator or fitting chosen in the studio has no mark
  of it, so carrying the calculation into a laid-out design again puts the calculation's whole-flat
  pick over it (floors and walls are protected) ([calculator.md](calculator.md#known-gaps)).
- **Orders**: nobody on the staff is told when a store order arrives for review (the queue, the
  dashboard and the sidebar's count are the signal); the customer cannot cancel or message from
  the project page; one supplier for every construction material
  ([marketplace.md](marketplace.md#known-gaps)).
- **Accounts**: no password-reset link sent from the account page, no audit trail of account
  changes in the database, brigades cannot register or change their crew
  ([auth-and-roles.md](auth-and-roles.md#known-gaps), [partners-and-admin.md](partners-and-admin.md#known-gaps)).
- **Russian**: hidden from the site for now (`OFFERED_LOCALES`, [architecture.md](architecture.md#i18n));
  its dictionary and the catalogue's Russian names are kept, ready to be offered again.
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
[project-flow.md §18](project-flow.md#18-known-gaps) ·
[budget.md](budget.md#known-gaps) ·
[marketplace.md](marketplace.md#known-gaps) ·
[subscriptions.md](subscriptions.md#known-gaps) ·
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
[technical-and-fittings](design-studio/technical-and-fittings.md#known-gaps),
[decor](design-studio/decor.md#known-gaps).
