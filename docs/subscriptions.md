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
(`bankFeePct`, shown as a line of its own). The rules are pure, in `lib/plans/plans.ts`:
`PLAN_FEATURES`, `requiredPlan`, `hasFeature`, `featuresOf`, `PROJECT_ALLOWANCE`,
`FREE_RENDERS_PER_MONTH`.

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
  of its subscription. None left: 402 `PLAN_PROJECT_LIMIT`.
- **Renders** — `POST /api/design/renders` takes one of the month's free renders
  (`takeFreeRender`, a `render` row with no payment) or, past them, claims a paid `render`
  credit (`claimPaidCredit`, then `recordPaidRender`); none: 402 `PAYMENT_REQUIRED`. Both are
  given back if the render is not queued after all.

## Where it is enforced

| Server (`requirePlanFeature`, 402 `PLAN_REQUIRED` + `X-Plan-Required: <plan>`) | Browser only |
|---|---|
| `POST /api/projects/create` (allowance) · `POST /api/design/upload-plan` and `/api/design/parse-plan` (`planUpload`) · `POST /api/design/models` (`ownItems`, and a credit for a GLB or a photo alike) · `POST /api/design/renders` (`renders`, free or paid) · `POST /api/payments/flitt` for `own_item` / `render` (Professional) | every studio edit (the scene is saved whole by `POST /api/design/projects`, which cannot tell a swapped sofa from a generated one) · the walk-through · the CV parser, which reads a plan in the browser when the Claude reader is refused |

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

- `tests/unit/plans/plans.test.ts` — features and plans, allowances, months (short months, no
  drift), the plan in force, renewals' end, new / renew / upgrade (credit, never below 0) /
  lower refused, a granted plan's credit.
- `tests/unit/payments/service.test.ts` — a subscription's approval buys its plan once, a failed
  purchase rolls the approval back, a reversal takes it back; a render's credit is not an own
  item's.
- `tests/integration/payment-routes.test.ts` — the start: a plan at admin's price, an upgrade
  less its credit and a covered one with no card, a lower plan refused, own items and renders
  Professional's and priced.
- `tests/integration/save-routes.test.ts` — no project once the allowance is used.
- Walked through on 20 Oct 2026 (headless Chrome at `renovate.localhost`, test-user #35): two
  projects on Free and the third refused (dialogue and 402), the server's refusals of an upload
  and an own item, the studio's locks on Free, Premium bought through Flitt's sandbox (3-D
  Secure), the swap that then went through, the walk-through offering only Professional with the
  credit taken off.

## Known gaps

- **Studio edits are enforced in the browser only.** The design save route takes the scene
  whole; a Free account that edits its scene by hand (or through the API) is not refused. Diffing
  the saved scene against the previous one per feature would close it.
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
