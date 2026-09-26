# Marketplace: checkout, orders, brigades and revenue

How the platform earns (a fee per m² and a commission on every partner order), how a project
is ordered (checkout → one order per store), how a brigade is booked for the labour, how
partners answer orders in their portal, and what admin sees of the money. Read this before
touching `lib/finance/`, `lib/teams/`, the checkout or booking dialogues, the order editor, or
the admin's orders, revenue and settings pages.

Related: [budget.md](budget.md) (the lines orders are made from) ·
[partners-and-admin.md](partners-and-admin.md) (partner accounts, the portal, admin lists) ·
[auth-and-roles.md](auth-and-roles.md) (who may edit an order) ·
[project-flow.md](project-flow.md) (saving before ordering; one project, two halves) ·
[data-model.md](data-model.md) (`checkouts`, `orders`, `order_items`, `platform_settings`,
`teams`).

## Key files

| File | Responsibility |
|---|---|
| `lib/finance/money.ts` | the arithmetic, no DB: fees, commissions (`effectiveCommissionPct`), `mergeLines`, grouping by store (`buildStoreOrders`, `costLinesByStore`), delivery (`deliveryFeeFor`), `lineTotal`, report periods |
| `lib/finance/orders.ts` | writing and reading orders: `createCheckoutForProject`, `createTeamBooking` (+ `projectLabour`), `projectOrderState`, `applyOrderEdit`, `partnerOwnsOrder`, `ordersForProject` |
| `lib/finance/notify.ts` | the mails to partners and customers (never fatal) |
| `lib/finance/report.ts` | `revenueReport`, `ordersForExport` (admin revenue page and CSV) |
| `lib/finance/settings.ts` | the `platform_settings` row, or the defaults |
| `lib/finance/view.ts` | `orderData` — an order as client components see it |
| `lib/teams/queries.ts` | `listTeams` (who covers which trades, who is free), `openJobsOf` |
| `lib/projects/checkoutParts.ts` | the checkout dialogue's one-line summary per half |
| `lib/validations/checkout.schema.ts` | `checkoutSchema`, `bookingSchema`, `orderEditSchema`, `platformSettingsSchema` |
| `components/checkout/CheckoutDialog.tsx`, `BookingDialog.tsx`, `CustomerFields.tsx` | ordering a project; booking a brigade |
| `components/orders/OrderEditor.tsx`, `OrderStatusBadge.tsx`, `ProjectOrders.tsx` | the partner's / staff's order editor; the customer's view on the project page |
| `components/projects/OrderProjectButton.tsx` | ordering a saved project from its page |
| `app/api/checkout/route.ts` | GET what was ordered before; POST a checkout |
| `app/api/bookings/route.ts` | GET bookings of a project; POST a brigade booking |
| `app/api/orders/`, `app/api/orders/[id]/` | order list and edits (partners, staff) |
| `app/api/settings/route.ts`, `app/api/admin/settings/route.ts` | public fees; admin GET/PUT of the settings |
| `app/api/admin/revenue/export/route.ts` | revenue CSV |
| `app/(main)/design/[id]/workers/page.tsx` | step 8: trades and brigades |
| `app/partner/orders/`, `app/admin/orders/`, `app/admin/revenue/`, `app/admin/settings/` | the portal's and admin's order, revenue and settings pages |
| `hooks/usePlatformFees.ts` | the fees the summaries show |

## Checkout flow

1. A summary page (`design/[id]/summary`, `calculator/[id]/summary`) or the project page's
   `OrderProjectButton` builds the `CheckoutPart`s (`lib/projects/checkoutParts.ts`):
   `designCheckoutPart` over `priceScene` → `orderedLines`, `calculatorCheckoutPart` over
   `orderedPickLines`.
2. `CheckoutDialog` reads `GET /api/checkout?projectId=` (`projectOrderState`) to show what is
   already paid or partly ordered, saves the project through the caller's save helper, then
   posts `POST /api/checkout { projectId, customer }` (signed-in owner only).
3. The route rate-limits, validates, checks the owner and calls `createCheckoutForProject`: the
   calculator's lines and the design's (`sceneLinesOf` → `costLinesByStore`) are merged with
   what was ordered before (`mergeLines`), grouped per store, and a fee row is added per unpaid
   half.
4. One transaction writes the `checkouts`, `orders` and `order_items` and sets the project to
   `submitted`; then `notifyPartnerNewOrder` per store and `notifyCustomerCheckout`. Nothing new
   to order → 409 `PROJECT_ALREADY_ORDERED`.

## Booking flow (design step 8)

1. `design/[id]/workers/page.tsx`: `tradesNeeded(cost)` → `GET /api/teams?covers=…`
   (`listTeams`), and `GET /api/bookings?projectId=` for bookings already sent.
2. `BookingDialog` saves the design (a draft is enough) and posts
   `POST /api/bookings { teamId, projectId, customer }`.
3. `createTeamBooking`: the project's labour (`projectLabour`) plus the brigade's
   site-management line when it has a markup, one order in a transaction, then the partner mail.
4. The brigade answers in `/partner/orders/[id]` (`OrderEditor.answer`) → `PUT /api/orders/[id]`
   → `applyOrderEdit`, which mails the customer.

## How the platform earns (`lib/finance/`)

The platform owns nothing and sells nothing — it connects the customer with the stores and
workers who do, and takes a cut at every step. Two revenue lines, both recorded, neither
collected (there is no payment integration; the fee is shown on the summaries and stored):

1. **A fee per m²** for the project itself — `calculatorFeePerM2` (default 2 ₾) for a
   calculation, `designFeePerM2` (default 12 ₾) for a 3D design. Shown as its own line on both
   summaries ("სულ საფასურის ჩათვლით"), written to `checkouts.platformFee` at checkout.
2. **A commission on every partner order** — `storeCommissionPct` / `workerCommissionPct`
   (default 5 %), overridden per store / worker by their own `commissionRate`. Frozen into
   `orders.commissionPct` when the order is placed so a later rate change does not rewrite history.

```
summary → "შეკვეთის გაფორმება" → CheckoutDialog (name, phone, e-mail; the project's owner only)
  → saves the project if it is not saved yet (each summary in its own shape)
  → POST /api/checkout { projectId, customer }
      lib/finance/money.ts     group what is bought by store (calculator: the picks, by a
                               products.storeId lookup; design: the *budget's* product lines —
                               priceScene, see below — by the line's store snapshot, the lookup
                               filling in), one order per store, delivery per store, commission
                               at that store's rate, fee = m² × rate
      lib/finance/orders.ts    one transaction: checkout + orders + items; project → 'submitted'
      lib/finance/notify.ts    mail to every store (MAIL_DRIVER=log in dev → logs/app-*.log)
                               and to the customer; never fatal
design step 8 → "ბრიგადის არჩევა" → BookingDialog → POST /api/bookings { teamId, projectId }
  → a team order for *this* project (saved on the spot if need be); its lines are the project's
    labour as it was left on the budget (`projectLabour`) plus the brigade's own site-management
    line when it charges a markup (`markupPct > 0`); the brigade accepts or turns it down in its
    own account
```

**The brigade step** (`app/(main)/design/[id]/workers/page.tsx`). The trades the budget calls for,
then the brigades: the ones **free to start first** (`listTeams` counts a brigade's open
orders — `new` / `confirmed` / `in_progress` — against its `capacityJobs`; a busy one is shown,
greyed, with its button off), among those the ones that cover the whole job, and the one this
project already went to at the very top. "Choose" opens the `BookingDialog` with `project`
set, so there is nothing to pick out of a list on the last step of that very project: it says
how many labour lines are being sent and what they come to, saves the design if it has to, and
posts the booking. `GET /api/bookings?projectId=` is what the page reads back, so a customer who
returns sees "order #87 sent · confirmed" and the brigade's message rather than a button that
would send the job twice; a brigade that turned it down can be chosen again, or another one.
**`projectLabour` is the one way to the work a project asks for** (worker and team bookings
alike): a project with a design is read off the design's budget — the calculator's phases, but
also a point for every socket actually placed, the radiators hung, the skirting fitted, only
the works ticked on the technical step — a calculation on its own off the calculator's sheet;
either way less what was ticked off and at the quantities that were set. It used to be the
calculator's estimate worked out afresh, whatever had been edited.

A project can be ordered in two sittings — the calculation first, the 3D design later, or
both at once — and stays one row throughout: `ownProject` writes into an ordered project
too, because the orders are snapshots and desync nothing. Each half's fee is charged once
(one `checkouts` row per half, so the revenue report keeps calculator and design fees
apart), `mergeLines` unites the two halves: the studio's lines win over the calculator's
copies of the same product (the studio inherited those picks), repeated items stay repeated
(six chairs are six chairs), and units an earlier checkout already sent to a store come off
the top product by product (`projectOrderState.orderedQty`). When nothing new
would be charged or sent the route answers `PROJECT_ALREADY_ORDERED`. The checkout dialog
shows one quick line per half — fee, products, a half already paid marked as such — with the
full list a click away, and `GET /api/checkout?projectId=` tells it what was ordered before.
Items nobody sells (product without a store) are left out and reported as `unassigned`.

**A design is ordered from its budget, not from its scene.** `sceneLinesOf` prices the saved
project once — `priceScene(plan, scene, { homeState: project.homeState })` — and
`costLinesByStore` turns the product lines still ticked (`orderedLines`, see [budget.md](budget.md)) into
order lines: the furniture and the finishes, and the doors, windows, sockets, switches, lamps
and radiators, which had been budget lines without anybody being sent an order for one.
The store lookup covers every product id on those lines (it used to be gathered from items and
finishes). `sceneLinesByStore(plan, scene, storeOf, { homeState })` is the same thing in one
call (only the tests use it; the checkout goes `sceneLinesOf` → `costLinesByStore`). **The home state is not optional in spirit**: in a renovation it decides the phases, and
the phases decide which openings and points are new work, so an order priced without the
project's own would send a green frame its doors. The quantity and the price on an order line
are the budget line's; the unit is the product's own (a radiator's sections go out as so many
`piece`s of a product named "(1 სექცია)", a skirting by `linear_m`); the total is
`lineTotal(qty, unitPrice)`, because that is how `applyOrderEdit` will work it out at the first
edit, and an order whose subtotal moved a tetri when its status changed would be worse than
one that differs a tetri from a sheet. A folded line names every room it covers, clipped to
the 255 characters `order_items.room_name` holds — forty rooms of sockets would otherwise
fail the whole transaction. `mergeLines` needed no change: it already dedupes and nets off
per product, which is what a folded line is. What it does mean is that a line partly ordered
before is now the ordinary case (twelve sockets ordered, a thirteenth added), so the dialogue
shows what is left to send (`CheckoutPart.lines[].unitPrice`), priced as the server prices it,
instead of the whole line again.

**The three callers price the way the server will.** The design's budget page hands the
dialogue the `cost` already on screen. The project page's `OrderProjectButton` prices the row
as saved, with the row's home state. The calculator's summary is the odd one: its own save
writes the *calculator's* home state into the shared row and turns the stored scene into a
renovation (`mode: 'full'`), and the order is priced from that row — so that page prices the
design half as `mode: 'full'` against the calculator's home state, not the studio's.

**Everything an order line is made of is repriced on save.** `POST /api/design/projects`
looked up catalogue prices for `scene.items` and `scene.finishes` only, which was the whole
order at the time. The snapshots on openings (`plan.rooms[].openings[].product`, one apiece),
on fittings (`scene.electrical[].product`, `fixtureQuantity` of them) and on radiators
(`plan.technical.points[].product`, `radiatorSections` of them) are repriced the same way
now, and one the catalogue does not know refuses the save like an unknown sofa does — a price
edited in devtools would otherwise have gone to a store as an order.

**Partner portal (`/partner`)** — a `store` / `worker` / `team` account sees its own orders and
nothing else: dashboard (unread, open, this month's sales, the platform's cut, their share),
the order list with status filter, and the order editor (`components/orders/OrderEditor.tsx`):
quantities and prices per line, lines struck out and restored (kept visible for the customer),
added lines, a message to the customer, the status. Every save recomputes `subtotal` and
`commissionAmount` from the items (`applyOrderEdit`); a status or message change mails the
customer. A partner cannot edit a `done` or `cancelled` order except to move it back to
`confirmed` or `in_progress`. Opening an order sets `viewedAt` and clears the badge. Stores also
add and edit their own products ([partners-and-admin.md](partners-and-admin.md)), workers
edit their card. Admin can open the portal as any partner
with `?store=ID` / `?worker=ID` / `?team=ID`. `pnpm db:seed:partners` creates the store and
worker logins, `pnpm db:seed:teams` the brigades' (`TEAM_PASSWORD`, or generated and printed
once). **A new order has its answer at the top of the page**: "accept" and "turn down" are the
status select's `confirmed` and `cancelled` in one press (`OrderEditor.answer`), because a
brigade a customer has just chosen should not have to find a dropdown to say yes, and the
customer's brigade step is waiting on exactly that.

**Admin** — `/admin/orders` (every order, filters in the URL like the other lists; admin and
`agent_orders` may edit any order, and the agent keeps a `staffNote`), `/admin/revenue` (period →
fees split calculator/design, commissions split stores/workers — brigade orders are not in the
report yet, see Known gaps — volume, daily bars as static SVG, by store, by worker, top products, statuses,
CSV export at `/api/admin/revenue/export`), `/admin/settings` (the four numbers, with a worked
example before you save). Store and worker forms carry e-mail and commission; the user form
assigns partner roles and links the account to its store / worker. The dashboard shows this
month's revenue and flags orders waiting on a partner and partners without e-mail or login.

The customer sees the orders on the project page (`components/orders/ProjectOrders.tsx`):
status, total, delivery, and whatever the partner wrote back — and can order a saved project
from there (`OrderProjectButton`, the same dialog built from the row as saved).

`tests/unit/finance/money.test.ts` covers the arithmetic — fee, commission, grouping,
delivery, struck-out lines, report periods — and that a door, a fitting and a radiator each
reach their store as the budget counts them, fold into what was ordered before and go nowhere
when ticked off; `tests/unit/design/ticks.test.ts` pins that basket, dialogue and order agree
line for line; `tests/integration/save-routes.test.ts` that a forged door, socket or radiator
price never reaches the row. `lib/finance/money.ts` is in the coverage
gate. Everything that touches the database (`orders.ts`, `report.ts`, `settings.ts`) is
exercised by the routes, not by unit tests.

## Tests

- `tests/unit/finance/money.test.ts` — fees and commissions, struck-out lines, grouping by store
  and delivery; a door, a fitting and a radiator reach their store as the budget counts them,
  fold into what was ordered before and go nowhere when ticked off; kitchens and "already has"
  excluded; the 255-character room clip; `mergeLines`; report periods. (`labourLines` is tested
  but unused in production — bookings use the private `projectLabour`, which has no test.)
- `tests/unit/design/ticks.test.ts` — basket, dialogue and order agree line for line.
- `tests/unit/projects/checkoutParts.test.ts` — both checkout parts respect ticks and quantities.
- `tests/integration/save-routes.test.ts` — a forged door, socket or radiator price never reaches
  the row.
- `lib/finance/money.ts` is in the coverage gate; `orders.ts`, `report.ts`, `settings.ts` touch
  the database and are exercised through the routes, not unit tests.

## Known gaps

- A brigade's availability is its open orders against `capacityJobs`, nothing more: no
  calendar, no dates, and an order it never answers keeps it "busy" until somebody closes it.
- The two halves of a project agree on a product only by its id. The studio inherits the
  calculator's furniture and finishes, so those are one order line; it does not inherit a door,
  a window or a socket picked in the calculator (`applyFinishPicks`: "a pick that is not a
  finish is simply not a finish") and gives every opening and point a product of its own. Now
  that the studio's doors and fittings are ordered, a project with both halves whose calculator
  picked door A while the studio hung door B is sent both — the same thing a sofa swapped in
  the studio has always done to the calculator's sofa. The tick on either summary is the way
  out until calculator picks of those kinds reach the openings and the points.
- The checkout dialogue totals the goods and the fee; the delivery each store will add is on
  the budget (`cost.baskets`) and on the order, not in the dialogue.
- The marketplace records money but does not move it: no payment integration, no payout to partners, no invoices. Stores add and edit their own products and workers their own card, but reviews and portfolio are still seeded, not partner-managed, and an approved store's new products go live at once with no moderation step.
- **Brigade orders are only half supported outside booking**: the revenue report counts store
  and worker orders only (`lib/finance/report.ts`), so brigade commissions are missing from
  revenue; the CSV's partner column is blank for teams; the admin order list has no team
  filter; the customer's project page shows a team order as a worker with no name
  (`ordersForProject` never joins `teams`); the update mail names the partner generically.
- The fee's area can differ between the dialogue and the charge: the server charges each half
  on `projects.totalM2` (the calculator rooms' area when the calculator owns the row), while the
  dialogue previews the design half on the plan's floor area.
- `CheckoutDialog.tsx` still carries a comment saying guests are welcome; `POST /api/checkout`
  answers 401 without a session.
- The partner portal's sidebar gives a team a Profile link, but `/partner/profile` renders
  nothing for a team.
