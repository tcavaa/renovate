# Subscriptions: Free, Premium, Professional

What a person may do is decided by their **plan**. Free, Premium and Professional replaced the
per-m² fee each half used to pay before its hinge: "გამოთვლის დაწყება" and "დიზაინის გენერაცია"
only warn now (`HingeDialog`), and nothing is charged there. Read this before touching
`lib/plans/`, `store/planStore.ts`, `hooks/usePlan.ts`, `components/plans/`, `/pricing`, the
profile's plan, the plan prices in `/admin/settings`, a route that checks a plan, or a studio
control that changes furniture or finishes.

Related: [payments.md](payments.md) (Flitt, credits, the card dialogue) ·
[marketplace.md](marketplace.md) (what the platform earns) · [data-model.md](data-model.md)
(`subscriptions`, `plan_usage`, `payments.plan` / `billing_period`, `platform_settings`) ·
[design-studio/studio.md](design-studio/studio.md) (the studio's locks) ·
[design-studio/plan-reading.md](design-studio/plan-reading.md) (uploading a plan).

## The plans

**What each plan includes is admin's** (`/admin/settings` → plans, `PlanMatrix`): the plans
across with their month and year prices, and down the side a tick per plan for every feature,
the projects each may make (blank: no limit) and the renders a month a plan with renders
includes. It is stored as one JSON value, `platform_settings.plan_config` (`PlanConfig`, read
through `normalizePlanConfig` — anything missing or odd is the default), and everything reads it:
the pricing page and its lines (`planLines` — "everything in X, plus" only when a plan has
everything the one below has), the upgrade dialogue (`plansWith`: the plans that have the
feature), the studio's locks, and every route. A change applies at once, to plans already bought
too. The defaults, as built:

| | Free | Premium | Professional |
|---|---|---|---|
| Projects (a calculation and a design together are one) | **2 at a time** | **5 new a month** | **10 new a month** |
| See the flat in 3D, the budget and ordering, drawing a plan, the sample flat | ✓ | ✓ | ✓ |
| `planUpload`: reading an uploaded PDF or picture into a plan | | ✓ | ✓ |
| `catalog`: adding, swapping and removing furniture, laying floors and walls, wall decor, the products of doors and windows, emptying the flat | | ✓ | ✓ |
| `moveFurniture`: moving, turning, mirroring furniture (3D and the board) | | ✓ | ✓ |
| `walk`: the walk-through | | | ✓ |
| `renders`: a realistic render of a studio photo — 3 free a month, then `renderPrice` (7 ₾) each | | | ✓ |
| `ownItems`: a piece of one's own from a GLB or a photo — `ownItemPrice` (10 ₾) each | | | ✓ |

Prices are admin's (`platform_settings`, `/admin/settings` → plan prices): Premium **15 ₾ a
month or 120 ₾ a year**, Professional **39 ₾ or 320 ₾**, before the bank's commission
(`bankFeePct`, shown as a line of its own). The rules are pure, in `lib/plans/plans.ts`, each
taking the configuration: `PLAN_FEATURES`, `DEFAULT_PLAN_CONFIG`, `normalizePlanConfig`,
`hasFeature`, `plansWith`, `requiredPlan` (null when admin gave a feature to no paid plan),
`featuresOf`, `projectAllowance`, `projectsLeft`, `freeRendersOf`, `freeRendersLeft`. On the
server `featureAccess(account)` resolves the plan and the configuration once (`has`, `needs`).

Not gated: the calculator's own steps (materials, furniture picks, the summary), the technical
step and the studio's electric and technical trays (sockets, lights, radiators, equipment), the
style test and generating (the AI designer's own cap of 5 a design stays), versions, undo, and
the brigade's read-only project view.

**Staff** (admin, `agent_orders`, `agent_catalog`) work as Professional with no project
allowance (`isStaff`) — they open anything for a customer. Partners are customers like anyone.

## Buying a plan (prepaid, no auto-renew)

A plan is bought by card for a month or a year (`POST /api/payments/flitt { purpose:
'subscription', plan, period }`, [payments.md](payments.md)). The approval writes a
`subscriptions` row (`activateSubscription`, inside the approval's transaction). Nothing renews
by itself: when the row ends the account is Free again, and its projects stay.

`planPurchase(rows, plan, period, prices, now)` decides what a purchase is:

- **new** — no plan in force: from now, for the period, at the price.
- **renew** — the same plan: from the end of what is paid for already (`planPaidUntil`, a run
  of renewals), at the price.
- **upgrade** — a higher plan: from now; the unused part of every lower subscription still to
  run (`unusedCredit`: its price × the share of its time left, a renewal not started counting
  whole) comes off the price, never below 0; those rows are cut short at the upgrade. A credit
  that covers the whole price buys the plan with no card (`activateFreeUpgrade`, `{ free: true }`).
- a **lower** plan while a higher one runs is refused (`PLAN_LOWER`, 409) — it would only start
  when the higher one ends.

A month of a subscription is counted from its start (`subscriptionMonth`, `addMonths` keeps the
day, or the month's last day): bought on the 20th, the allowance renews on every 20th, twelve
times for a year. A reversed payment deletes its subscription (`revokeSubscription`); a plan an
upgrade cut short stays cut.

**Admin's hand** (`/admin/users/[id]` → plan, `POST /api/users/[id]/plan`, admin only): grant
Premium or Professional for 1–36 months at no charge (`grantedBy`, amount 0 — it runs beside
whatever was bought; the higher holds), or end every subscription now (`plan: 'free'` — after a
refund made in Flitt's portal, or a grant taken back).

## Allowances (`plan_usage`)

Counted apart from the rows they count, so deleting a project or a render does not hand the
allowance back:

- **Projects** — `POST /api/projects/create` makes the project inside `withProjectSlot`: one
  transaction, an advisory lock per person (two tabs cannot both take the last one), the count,
  the insert and a `plan_usage` row (`kind` `project`). Free counts the projects the person has
  now (deleting one makes room); a paid plan counts the `project` rows made in the current month
  of its subscription (Free, which has none, counts the calendar month for anything monthly). None
  left: 402 `PLAN_PROJECT_LIMIT`.
- **Renders** — `POST /api/design/renders` takes one of the month's free renders
  (`takeFreeRender`, a `render` row with no payment) or, past them, claims a paid `render`
  credit (`claimPaidCredit`, then `recordPaidRender`); none: 402 `PAYMENT_REQUIRED`. Both are
  given back if the render is not queued after all.

## Where it is enforced

| Server (`requirePlanFeature` / `featureAccess`, 402 `PLAN_REQUIRED` + `X-Plan-Required: <plan>`) | Browser only |
|---|---|
| `POST /api/projects/create` (allowance) · `POST /api/design/upload-plan` and `/api/design/parse-plan` (`planUpload`) · `POST /api/design/models` (`ownItems`, and a credit for a GLB or a photo alike) · `POST /api/design/renders` (`renders`, free or paid) · `POST /api/payments/flitt` for `own_item` / `render` · **`POST /api/design/projects`: every studio edit** (`catalog`, `moveFurniture` — below; `X-Plan-Feature` names which) | the walk-through (nothing is saved by walking) · the CV parser, which reads a plan in the browser when the Claude reader is refused |

### The studio's locks on the server (`lib/plans/sceneGuard.ts`)

The design save compares the scene it is sent with the one stored (`refusedSceneChange`), on a
plan without the catalogue or moving furniture, and names what is not allowed: `catalog` — a
piece added, swapped or removed, a finish laid, painted or taken off, decor added, removed or
re-materialled, a door's or window's product swapped, a kitchen material the person chose — or
`moveFurniture` — a piece moved, turned, mirrored or resized. Refused, nothing is written. What
happens on every plan by itself passes: anything **before the flat is laid out**
(`progress.generated === false` — the generation, the empty start, the drawing); **the
designer's check** once, right after the generation (`generation.reviewed` set the first time);
**the calculator's picks** (a piece, floor or wall whose product the project's calculation picked
— `calculatorPickIds`, the calculator being open to every plan); **a room whose outline changed**
(a wall moved refits its furniture, finishes and decor — that room is not compared); a door or
window given its first product, or a new one because its kind or size changed; a kitchen
material the studio assigned itself. Laying a laid-out flat out again, or turning it back into
an unlaid one, is refused (no plan's studio does either). Not compared: sockets, lights,
technical points, equipment, the budget's ticks and quantities, style, mode, versions kept.

In the browser a refused save is the project banner's "plan" problem (`SaveProblemBanner`,
`problemOf` → `plan`): "this change is not in your plan" — back to the saved design, see the
plans, or try again once upgraded. Restoring a kept version is gated as a catalogue change
(`VersionsPanel`).

## The browser

- `GET /api/plan` → `PlanState` (`planState`): the plan, staff, every feature, the subscription
  in force and until when (`paidUntil`), renewals bought ahead, projects used / left / when they
  renew, the month's free renders, the prices, and **an offer for every plan and period** (what
  `planPurchase` would do now). A visitor gets `null`.
- `store/planStore.ts` holds one copy per page and account, and the upgrade request;
  `hooks/usePlan.ts`: `usePlan()` (the state, `refresh`) and `usePlanGate()` — `can(feature)`,
  `gate(feature)` (false, and the upgrade dialogue opens), `needs(feature)` (the plan for a
  badge). Until the plan has loaded everything is allowed rather than flashing locks at a paying
  person.
- `components/plans/UpgradeHost.tsx`, mounted once in `app/(main)/layout.tsx`: the dialogue a
  locked feature, the used-up projects or a chosen plan opens — what the feature is, the plans
  that have it (`PlanCards`, compact, month or year), buying there and then
  (`SubscribeDialog` → `CardPayment`), "compare all plans" → `/pricing`.
- `PlanBadge` — a lock and the plan's name (or the lock alone) on what the plan has not got.
- `/pricing` (`app/(main)/pricing/page.tsx`, public; `PricingView`, `PlanCards`, `PeriodSwitch`):
  the three plans, the period, what each adds (`planLines`), what is paid apart, how billing
  works. A visitor's button signs them up; a signed-in person sees their plan marked and buys,
  renews or upgrades. Linked from the header ("ფასები").
- `/profile?view=plan` (`PlanDetails`): the plan and until when, the month's projects and
  renders, a renewal bought ahead, what it includes, the history.
- The hubs (`HubTiles`): the projects left under "new project"; none left opens the upgrade
  dialogue instead of the name (and so does a `PLAN_PROJECT_LIMIT` from another tab).
- Plan upload (`PlanUploadCard`, both start pages): the tile and the drop zone wear Premium's
  lock; a click or a dropped file opens the dialogue. The sample flat stays open.
- The studio (`app/(main)/design/[id]/studio/page.tsx`): every add, swap, remove, finish, paint,
  decor and opening-product change goes through `gate('catalog')`, every turn and mirror through
  `gate('moveFurniture')`; the 3D view holds furniture where it stands (`Viewer3D lockItems` — a
  drag orbits, and the page shows "moving furniture is Premium's" once per drag) and the board
  drags none (`PlanWorkspace furniture={canMove}`); the walk-through (the switch and the 3 key),
  the photo and "add my own" open the dialogue on a lower plan. Locks show on the view switch,
  the photo and empty buttons (`StudioTopBar planLocks`), the shelf's catalogue and own-item
  buttons (`FurnitureTray locks`), the finishes shelf (`FinishesTray locked`) and the item card
  (`SwapPanel swapLock` / `moveLock` — the "შეცვალე პროდუქტი" header opens the dialogue; the angle
  slider is hidden). The tray's hint says what the plan does not allow.
- The photo dialogue (`PhotoDialog`) says how many free renders are left this month, or that
  this one costs `renderPrice` — "pay and request" is Flitt's form, then the request.

## Tests

- `tests/unit/plans/sceneGuard.test.ts` — the server's studio locks: what is refused (a swap, an
  addition, a removal, a floor, decor, a door's product, a move, a turn, a mirror, a new
  generation, un-laying) and what passes (nothing guarded changed, before the layout, the
  designer's check, the calculator's picks, a reshaped room, a first product, the studio's own
  kitchen material).
- `tests/unit/plans/plans.test.ts` — admin's configuration (features, projects with no limit,
  free renders needing the feature, a stored value made whole), features and plans, allowances, months (short months, no
  drift), the plan in force, renewals' end, new / renew / upgrade (credit, never below 0) /
  lower refused, a granted plan's credit.
- `tests/unit/payments/service.test.ts` — a subscription's approval buys its plan once, a failed
  purchase rolls the approval back, a reversal takes it back; a render's credit is not an own
  item's.
- `tests/integration/payment-routes.test.ts` — the start: a plan at admin's price, an upgrade
  less its credit and a covered one with no card, a lower plan refused, own items and renders
  Professional's and priced.
- `tests/integration/save-routes.test.ts` — no project once the allowance is used; a locked studio
  change refused on Free with nothing written.
- Walked through on 20 Oct 2026 (later): the admin matrix ticked and saved (Premium given the
  walk-through, seen in a Premium account's plan and on the pricing page, then taken back), and
  on the real route as a Free account a flat laid out, then a swap, a move and a second layout
  refused.
- Walked through on 20 Oct 2026 (headless Chrome at `renovate.localhost`, test-user #35): two
  projects on Free and the third refused (dialogue and 402), the server's refusals of an upload
  and an own item, the studio's locks on Free, Premium bought through Flitt's sandbox (3-D
  Secure), the swap that then went through, the walk-through offering only Professional with the
  credit taken off.

## Known gaps

- **The server's studio check trusts what passes by itself**: a save that sets
  `generation.reviewed` for the first time, or moves a wall, has the pieces of that save (or that
  room) let through — a hand-made request could use either once. The generation itself (before
  the flat is laid out) is the browser's engine and cannot be re-run on the server.
- **The CV plan reader runs in the browser**: with the Claude reader and the upload refused, a
  determined Free account could still read a picture locally. The UI never lets it.
- **No auto-renew** — a person renews by hand; there is no reminder mail before a plan ends yet.
- **Photos do not become models yet**, but an own item from a photo now costs the same 10 ₾ as a
  GLB (the user's call): it waits under "my items" until a model is made for it (by hand, for now).
- **Renders are queued, not produced** ([studio.md](design-studio/studio.md#known-gaps)) — a paid
  one waits like a free one.
- **Subscriptions are not in the revenue report** (`lib/finance/report.ts` counts the halves'
  old fees and the commissions); the transactions page has them.
- The calculator's and design's per-m² fee columns (`platform_settings.calculator_fee_per_m2`,
  `design_fee_per_m2`) and `project_payments` stay for the fees paid before; the settings form no
  longer shows the rates. Drop the columns in a later migration.
