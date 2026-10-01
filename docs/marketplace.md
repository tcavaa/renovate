# Marketplace: checkout, orders, brigades and revenue

How the platform earns (a fee per m², paid before each half's hinge, and a commission on every
partner order), how a project is ordered (checkout → one order per store, the construction
materials to their supplier, all to the customer's address), how the orders agent confirms
every store order before the store sees it, how a brigade is booked for the labour, how
partners move their orders along in their portal, and what admin sees of the money. Read this
before touching `lib/finance/`, `lib/account/`, `lib/teams/`, the payment step (with
[payments.md](payments.md)), the checkout or
booking dialogues, the order pages and components, or the admin's orders, revenue and settings
pages.

Related: [budget.md](budget.md) (the lines orders are made from) ·
[partners-and-admin.md](partners-and-admin.md) (partner accounts, the portal, admin lists) ·
[auth-and-roles.md](auth-and-roles.md) (who may edit an order) ·
[project-flow.md](project-flow.md) (saving before ordering; one project, two halves; the
hinges) · [auth-and-roles.md](auth-and-roles.md#a-persons-own-details-profileviewaccount) (the
profile's phone and address) · [data-model.md](data-model.md) (`checkouts`, `orders`,
`order_items`, `project_payments`, `platform_settings`, `teams`).

## Key files

| File | Responsibility |
|---|---|
| `lib/finance/money.ts` | the arithmetic, no DB: fees (`platformFee`, `feeAreaM2` — the area a half's fee is charged on), commissions (`effectiveCommissionPct`), `mergeLines`, grouping by store (`buildStoreOrders`, `costLinesByStore`), delivery (`deliveryFeeFor`), `lineTotal`, report periods |
| `lib/finance/payments.ts` | the fee paid before a half's hinge: `paymentQuote` (the saved row's area × the day's rate), `recordHalfPayment` (the half's row, from its approved Flitt payment — [payments.md](payments.md)), `halfPayment`, `paymentsOf`, `PaymentView`; `projectFees` — every fee a project paid, at its hinges or (before) at checkout, which both project pages show beside their orders (`components/orders/FeeSummary.tsx`) |
| `lib/account/contact.ts`, `lib/account/server.ts` | an order's contact, pure: `resolveContact` (the account's name and e-mail; the phone and the address typed or the profile's; what to keep on the account), `addressOf`, `formatAddress`; server: `loadAccountContact`, `updateAccountContact` |
| `lib/finance/orders.ts` | writing and reading orders: `createCheckoutForProject`, `createTeamBooking` (+ `projectLabour`), `projectMaterials` / `checkoutPreview` (the materials and the reserve the dialogue shows), `projectOrderState`, `applyOrderEdit`, `confirmOrder`, `addOrderComment`, `orderEventsFor`, `recordOrderEvent`, `partnerOwnsOrder`, `partnerCondition`, `ordersForProject`, `orderCustomer` |
| `lib/finance/orderFlow.ts` | the rules, pure: `orderStage`, `awaitsConfirmation`, `partnerNextStatuses` / `partnerMayMove`, `summariseEdit` (an edit event's facts), `lineDiff` (what the customer sees changed) |
| `lib/finance/notify.ts` | the mails to partners and customers (never fatal) |
| `lib/finance/report.ts` | `revenueReport` (the fees from `project_payments` and from the checkouts that carried one before), `ordersForExport` (admin revenue page and CSV) |
| `lib/finance/settings.ts` | the `platform_settings` row, or the defaults |
| `lib/finance/view.ts` | `orderData` — an order as client components see it (stage, originals, sent/confirmed, the delivery address on one line); `orderEventData` |
| `lib/partner/analytics.ts` | a partner's dashboard figures: sales by month, best-selling products, catalogue health, orders by stage |
| `lib/teams/queries.ts` | `listTeams` (who covers which trades, who is free), `openJobsOf` |
| `lib/projects/checkoutParts.ts` | the checkout dialogue's lines per half, each marked furniture or not |
| `lib/validations/checkout.schema.ts`, `profile.schema.ts` | `checkoutSchema`, `contactSchema`, `bookingSchema`, `orderEditSchema`, `platformSettingsSchema`; `profileSchema`, `paymentSchema` |
| `components/checkout/CheckoutDialog.tsx`, `BookingDialog.tsx`, `ContactFields.tsx`, `FeePaidNote.tsx` | ordering a project (three rows and the total, then a thank-you and the orders); booking a brigade; the contact and address block both share; the fee as paid on a summary |
| `components/flow/HingeDialog.tsx` | the warning and the fee before "გამოთვლის დაწყება" and "დიზაინის გენერაცია", paid by card through Flitt (`components/payments/CardPayment.tsx`, [payments.md](payments.md)) |
| `components/orders/OrderEditor.tsx` | the platform's order page: keep/strike lines, quantities, prices, delivery, add lines, status, message, staff note, "confirm and send" |
| `components/orders/PartnerOrderView.tsx` | a partner's order: read-only lines, the next steps as buttons, the message to the customer |
| `components/orders/OrderTimeline.tsx` | an order's history and the comments between the platform and the partner |
| `components/orders/OrderReviewCard.tsx`, `ProjectOrdersReview.tsx` | the admin project page's orders: confirm each store's order right there |
| `components/orders/ProjectOrders.tsx` (`OrderCards`), `OrderStatusBadge.tsx` (`OrderStageBadge`), `useOrderActions.ts` | the customer's view on the project page and on the hubs' orders list (every change shown against what was ordered); the stage badge; saving and confirming from the client |
| `components/projects/OrderProjectButton.tsx` | ordering a saved project from its page |
| `app/api/checkout/route.ts` | GET what was ordered before, the materials and the reserve; POST a checkout |
| `app/api/payments/route.ts` | GET a project's payments and what each half would cost; paying is `POST /api/payments/flitt` ([payments.md](payments.md)) |
| `app/api/profile/route.ts` | GET / PATCH the person's own contact ([auth-and-roles.md](auth-and-roles.md#a-persons-own-details-profileviewaccount)) |
| `app/api/bookings/route.ts` | GET bookings of a project; POST a brigade booking |
| `app/api/orders/[id]/`, `…/confirm/`, `…/comments/` | read and change an order (staff and its partner, by the rules above), confirm a store's order (staff with `orders`), comment on it |
| `app/api/settings/route.ts`, `app/api/admin/settings/route.ts` | public fees; admin GET/PUT of the settings |
| `app/api/admin/revenue/export/route.ts` | revenue CSV |
| `app/(main)/design/[id]/workers/page.tsx` | step 8: trades and brigades |
| `app/partner/orders/`, `app/admin/orders/`, `app/admin/revenue/`, `app/admin/settings/` | the portal's and admin's order, revenue and settings pages |
| `hooks/usePlatformFees.ts`, `useProjectPayments.ts`, `useAccountContact.ts` | the fees the payment dialogue previews; what a project has paid (the summaries' fee line); the person's contact for the dialogues |

## Checkout flow

1. A summary page (`design/[id]/summary`, `calculator/[id]/summary`) or the project page's
   `OrderProjectButton` builds the `CheckoutPart`s (`lib/projects/checkoutParts.ts`):
   `designCheckoutPart` over `priceScene` → `orderedLines`, `calculatorCheckoutPart` over
   `orderedCalculationLines` (the calculation priced as a design, [budget.md](budget.md)); every
   line is marked `furniture` when the budget counts it as furniture (its `bucket`: a placed
   piece, a lamp standing in a room, a calculator's furniture pick).
2. `CheckoutDialog` reads `GET /api/checkout?projectId=` — what was ordered before
   (`projectOrderState`), the construction materials the supplier would be sent and the
   summary's reserve (`checkoutPreview`) — and shows **three rows and the total**:
   **სამშენებლო მასალები** (the supplier's construction materials and every store product that
   is not furniture: finishes, doors, windows, fittings, radiators), **სარეზერვო ფონდი** (the
   sheet's `contingencyTotal` — 15 % of the renovation's materials and labour, the summary's own
   figure; counted on the first order of a project only, and on nobody's order) and **ავეჯი**.
   The full list opens under them, grouped the same way. **No fee**: each half paid its own
   before its hinge ([below](#how-the-platform-earns-libfinance)).
3. **The contact is the account's** (`ContactFields`, `useAccountContact` ← `GET /api/profile`):
   the name and the e-mail are never asked; the phone and the delivery address (city, street
   and number, postal code) are the profile's — a line each, with "შეცვლა" for an order that goes
   elsewhere — or asked when the profile has none, with "keep it as my default" ticked (a
   changed one offers it unticked). The dialogue saves the project through the caller's save
   helper, then posts `POST /api/checkout { projectId, customer }` with only the fields it asked
   for (`contactBody`) — the project's signed-in owner only.
4. The route rate-limits, validates, checks the owner, builds the contact (`resolveContact`: the
   account's name and e-mail whatever the body says, the phone and the address typed or the
   profile's — `PHONE_REQUIRED` / `ADDRESS_REQUIRED` when there is neither) and calls
   `createCheckoutForProject`: the calculator's lines (`calculatorLinesOf` →
   `calculationLinesByStore`) and the design's (`sceneLinesOf` → `costLinesByStore`) — both the
   product lines of a `priceScene` — are merged with what was ordered before (`mergeLines`) and
   grouped per store.
5. One transaction writes one `checkouts` row (filed under the half the project is furthest
   along in, `platformFee` 0, the delivery address), the `orders` (every store's with no
   `sentAt` — it waits for the platform — each with the customer's contact and address) and
   `order_items` (each with its `originalQty` / `originalUnitPrice`), a `created` event per
   order, and sets the project to `submitted`; then `notifyCustomerCheckout` ("our manager will
   confirm each store's order with you"). The stores are not told yet — each is when its order
   is confirmed, with the address. Nothing new to order → 409 `PROJECT_ALREADY_ORDERED`. Once
   the order went through, the phone and address typed are kept on the account when asked
   (`updateAccountContact`).
6. The dialogue thanks the person — a check, the checkout's number, how many stores it went to
   — and after four seconds (a bar fills, `animate-countdown`) opens their orders
   (`/profile?view=orders`) from the top of the page; "ჩემი შეკვეთები" goes at once.
7. The construction materials of the sheet go too, to the store that supplies them — see
   [Construction materials](#construction-materials-the-materials-supplier).

## Booking flow (design step 8)

1. `design/[id]/workers/page.tsx`: `tradesNeeded(cost)` → `GET /api/teams?covers=…`
   (`listTeams`), and `GET /api/bookings?projectId=` for bookings already sent.
2. `BookingDialog` saves the design (a draft is enough) and posts
   `POST /api/bookings { teamId, projectId, customer }` — the contact as the checkout's: a
   signed-in person's name and e-mail are the account's, the phone and the address (where the
   work is) the profile's unless the dialogue asks for them; a guest (a brigade booked from its
   public page) types a name and a phone (`resolveContact`, no address required).
3. `createTeamBooking`: the project's labour (`projectLabour`) plus the brigade's
   site-management line when it has a markup, one order in a transaction, then the partner mail.
4. The booking is the brigade's at once (`sentAt` set on creation — no platform review: the
   customer chose it). The brigade answers in `/partner/orders/[id]` (`PartnerOrderView`: accept
   or turn down, later start and finish) → `PUT /api/orders/[id]` → `applyOrderEdit`, which
   mails the customer; it sees the customer's contact and can comment for the platform.
5. From the booking the brigade opens the project itself, to look at only
   (`/partner/projects/[id]`: the plan, the 3D model, the budget, the rooms, the customer) —
   for as long as the booking stands; turning it down closes the project to it again
   ([partners-and-admin.md](partners-and-admin.md)).

## How the platform earns (`lib/finance/`)

The platform owns nothing and sells nothing — it connects the customer with the stores and
workers who do, and takes a cut at every step. Two revenue lines, both recorded:

1. **A fee per m²** for the project itself — `calculatorFeePerM2` (default 2 ₾) for a
   calculation, `designFeePerM2` (default 12 ₾) for a 3D design — **paid before the half's
   hinge**. "გამოთვლის დაწყება" (the calculator's plan step) and "დიზაინის გენერაცია" (the
   style step) open `HingeDialog`: first the warning that the plan is settled from here (the
   steps before shut — [project-flow.md §12](project-flow.md#12-locks-and-why-there-is-no-start-over))
   with what to check, then the fee — the half is saved (`saveCalculatorProject` /
   `saveDesign`, a draft) and **paid by card through Flitt** (`CardPayment`,
   [payments.md](payments.md)): `POST /api/payments/flitt { purpose, projectId }` quotes the saved
   row (`paymentQuote`: `feeAreaM2` — the calculation's rooms' floors, the design's plan — × the
   day's rate), adds the bank's commission (`platform_settings.bankFeePct`, shown as a line of its
   own) and opens Flitt's embedded form; once Flitt's signed status (or callback) says
   `approved`, `recordHalfPayment` writes one `project_payments` row per half (unique on project
   and half; `method` `flitt`, `reference` the Flitt order id, `amount` the fee alone). "Paid", a
   moment, and the hinge itself (`setCalculated` / `generate`). A half already paid goes straight
   on. The summaries show the fee as paid, a line of its own under the total (`FeePaidNote`), and
   the checkout charges none; checkouts placed before carry theirs in `checkouts.platformFee`, and
   the revenue report counts both (rows from the stand-in card form before Flitt have `method`
   `test`).
2. **A commission on every partner order** — `storeCommissionPct` / `workerCommissionPct`
   (default 5 %), overridden per store / worker by their own `commissionRate`. Frozen into
   `orders.commissionPct` when the order is placed so a later rate change does not rewrite history.

```
calculator step 2 "გამოთვლის დაწყება" · design step 4 "დიზაინის გენერაცია" → HingeDialog
  → the warning → save the half → POST /api/payments/flitt (paid? else the quote + bank fee
    and a Flitt token) → Flitt's form → the signed status → project_payments → the hinge
    (calculated / generate) — docs/payments.md
summary → "შეკვეთის გაფორმება" → CheckoutDialog (materials · reserve · furniture · total; the
          phone and the address the profile lacks; the project's owner only)
  → saves the project if it is not saved yet (each summary in its own shape)
  → POST /api/checkout { projectId, customer }
      lib/account/contact.ts   the account's name and e-mail, the phone and address typed or the profile's
      lib/finance/money.ts     group what is bought by store (both halves: the *budget's*
                               product lines — priceScene, see below — by the line's store
                               snapshot, a products.storeId lookup filling in), one order per
                               store, delivery per store, commission at that store's rate
                               + the construction materials to their supplier (projectMaterials)
      lib/finance/orders.ts    one transaction: checkout + orders (unsent, with the address) + items;
                               project → 'submitted'; the contact kept on the account if asked
      lib/finance/notify.ts    mail to the customer (MAIL_DRIVER=log in dev → logs/app-*.log);
                               never fatal
  → thank-you → /profile?view=orders
  → orders agent: /admin/orders?review=pending or the project page → keep/strike lines,
    delivery → POST /api/orders/[id]/confirm → the store is mailed and sees it in /partner
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
too, because the orders are snapshots and desync nothing. The fees are not the checkout's
(each half paid its own before its hinge, once); `mergeLines` unites the two halves: the studio's lines win over the calculator's
copies of the same product (the studio inherited those picks), repeated items stay repeated
(six chairs are six chairs), and units an earlier checkout already sent to a store come off
the top product by product (`projectOrderState.orderedQty`). When nothing new
would be sent the route answers `PROJECT_ALREADY_ORDERED`. The checkout dialog shows its three
rows over both halves — a row whose lines all went with an earlier order says so, and the
reserve is counted on the first order only — with the full list a click away, and
`GET /api/checkout?projectId=` tells it what was ordered before.
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

## Order review: the platform confirms every store order

**A store's order goes through the platform first.** The checkout writes it with no `sentAt`
(stage `review`, "being checked by our manager"). The orders agent (`agent_orders`) or admin
opens it — from the queue (`/admin/orders?review=pending`, the dashboard's list, the sidebar's
count) or on the project's page, where every order of the project is a card
(`ProjectOrdersReview` → `OrderReviewCard`) — rings the customer, and:

- keeps or strikes each line (the tick is "stays in the order"; a struck line stays on the
  order, `removed`), corrects quantities and prices, adds a line, sets the delivery price
  (`deliveryFee`, staff only);
- presses **"confirm and send"** — which saves whatever is still unsaved and calls
  `POST /api/orders/[id]/confirm` → `confirmOrder`: status `confirmed`, `sentAt` /
  `confirmedAt` / `confirmedBy` set in one update that only an unsent order matches (two agents
  pressing at once confirm it once — the second gets `ORDER_ALREADY_SENT`), a `confirmed`
  event, then `notifyPartnerNewOrder` to the store **with the lines still ticked** and
  `notifyCustomerOrderUpdate`. An order with every line struck cannot be confirmed
  (`ORDER_EMPTY`) — cancel it instead;
- or cancels it (the store never sees it). While an order is unsent, `PUT` accepts only the
  statuses `new` and `cancelled` from staff: it is sent on through "confirm", never by picking
  "confirmed" in a list.

**A booking** (brigade or worker) is sent at once and waits for the partner's answer (stage
`awaiting_partner`). After that, for every order, the platform can still change anything —
lines, delivery, status (a closed order reopened), the message — and keeps a `staffNote` the
partner and the customer never see (the API strips it for both).

**What a partner may do** (`partnerNextStatuses`, enforced by `PUT /api/orders/[id]`): only
with an order it has been sent (`partnerOwnsOrder` requires `sentAt`; `partnerCondition` does
the same for every portal list and figure). A booking still `new`: accept (`confirmed`) or turn
down (`cancelled`). `confirmed`: a store → `in_progress` or `done` (it cannot back out — it says
why in a comment and the platform acts); a brigade or worker → `in_progress` or `cancelled`.
`in_progress` → `done`. A `done` or `cancelled` order is closed to the partner
(`ORDER_CLOSED`). Lines, prices and the delivery are locked for partners
(`ORDER_LINES_LOCKED`); they write to the customer (`partnerMessage`) and comment.

**History and comments** (`order_events`, `OrderTimeline` beside the order on both the admin's
and the partner's page): `created`, `confirmed`, every `status` change (from → to), every
`edited` (how many lines struck, restored, re-counted, re-priced, added, the delivery from → to
— `summariseEdit`), every `message` to the customer, and `comment`s — written by the
platform's people and the partner for each other (`POST /api/orders/[id]/comments`, a partner
only on its own sent order). The customer sees none of it. A comment from the platform on a
sent order flags it unread in the partner's portal again.

**What the customer sees** (`ProjectOrders` on their project page): each order's stage in
plain words ("our manager is checking it — then it goes to the store", "confirmed and with the
partner", …), the partner's phone once the order is theirs, what the partner wrote back, and
every change against what was ordered (`lineDiff` over `originalQty` / `originalUnitPrice`): a
struck line "removed", "3 → 2", "price was …", an added line, the delivery "was …". The list
of lines opens by itself when something changed.

## Construction materials: the materials supplier

The rate book's `material` lines — blocks, plaster mix, putty, pipes, cable, plasterboard (the
sheet's "სამშენებლო მასალები" section) — used to be on the estimate and on nobody's order.
They are ordered now, from one store: `platform_settings.materialsStoreId` (admin picks it in
`/admin/settings`; migration 0015 created the store **"სამშენებლო მასალები"** and pointed the
setting at it). At checkout `projectMaterials` reads the project's material lines from the
same sheet `projectLabour` reads (the design's budget when the design was generated, else the
calculator's sheet) — ticked-off lines left out, at the quantities the customer set — as order
lines with `categorySlug = material:<rate key>` and no product; `materialLinesByStore` sends them
to the supplier, less what an earlier checkout of the project already sent (by slug, like
products by id, `projectOrderState.orderedMaterials`), and `joinLines` puts them on that
store's order (their own order when the supplier sells no products). With no supplier set,
they are reported as unassigned. The checkout dialogue counts them in its building-materials row with the store products that
are not furniture, read from `GET /api/checkout` (`checkoutPreview`, from the saved project). The supplier's login sees and fulfils them in its portal like any
store, after the platform's confirmation.

**Which store it is.** Admin chooses it in `/admin/settings`, or on the store's own form: "ამ
მაღაზიიდან შეიკვეთება სამშენებლო მასალები" (`suppliesMaterials` on `POST` / `PUT /api/stores`,
admin only — a catalogue agent's is ignored, like the commission) makes that store the supplier
(`setMaterialsSupplier`); one store supplies all of them, so ticking it moves them from the
store that had them, which the form names, and unticking it on the supplier leaves nobody. A
new store can be made the supplier as it is created. The stores list marks the supplier.

## Partner portal, admin and customer

**Partner portal (`/partner`)** — a `store` / `worker` / `team` account sees its own orders
(the sent ones) and nothing else: a dashboard (unread, open, this month's sales and share, sales
by month, orders by stage, average order; a store also its best-selling products and its
catalogue's gaps; a brigade or worker its accepted bookings), the order list (search, status,
unread) and the order page (`PartnerOrderView` + `OrderTimeline`). Opening an order sets
`viewedAt` and clears the badge. Stores also manage their own products and a brigade its
company profile and the projects it is booked for, read-only
([partners-and-admin.md](partners-and-admin.md)). Admin can open the portal as
any partner with `?store=ID` / `?worker=ID` / `?team=ID`. `pnpm db:seed:partners` creates the
store and worker logins, `pnpm db:seed:teams` the brigades' (`TEAM_PASSWORD`, or generated and
printed once), and admin's new-account page any of them.

**Admin** — `/admin/orders` (every order; the "waiting for confirmation" tab first, filters in
the URL like the other lists — status, partner type incl. brigades, store, brigade, worker,
unread, dates; each row links to its project's orders), `/admin/orders/[id]` (`OrderEditor` +
`OrderTimeline`), the project page's orders (confirm each store's order there),
`/admin/revenue` (period → fees split calculator/design, commissions split stores/workers —
brigade orders are not in the report yet, see Known gaps — volume, daily bars as static SVG, by
store, by worker, top products, statuses, CSV export at `/api/admin/revenue/export`),
`/admin/settings` (the four numbers, with a worked example before you save, and the
building-materials supplier). Store and worker forms carry e-mail and commission (the
commission for admin only — and on a store's, for admin, the building-materials switch). An
order's page, the platform's and the partner's alike, shows the delivery address under the
customer (`OrderData.deliveryAddress`), and the partner's mail carries it. The dashboard shows
each role its own part: the orders agent the queue and the orders' progress, admin also this
month's revenue.

The customer sees the orders on the project page as above — and all of them together, grouped
by project, under "შეკვეთები" in either hub's sidebar (`HubOrders`, the same `OrderCards`) — and
can order a saved project from the project page (`OrderProjectButton`, the same dialog built from
the row as saved).

`tests/unit/finance/money.test.ts` covers the arithmetic — fee, commission, grouping,
delivery, struck-out lines, report periods — and that a door, a fitting and a radiator each
reach their store as the budget counts them, fold into what was ordered before and go nowhere
when ticked off; `tests/unit/design/ticks.test.ts` pins that basket, dialogue and order agree
line for line; `tests/integration/save-routes.test.ts` that a forged door, socket or radiator
price never reaches the row. `lib/finance/money.ts` is in the coverage
gate. Everything that touches the database (`orders.ts`, `report.ts`, `settings.ts`) is
exercised by the routes, not by unit tests.

## Tests

- `tests/unit/account/contact.test.ts` — an order's contact: the account's name and e-mail
  whatever the body says, a phone or an address typed for this order over the profile's, what
  the profile lacks is asked (`PHONE_REQUIRED`, `ADDRESS_REQUIRED`, a guest's `NAME_REQUIRED`),
  and only what was typed and asked to be kept goes onto the account; addresses read, written
  and compared.
- `tests/unit/finance/money.test.ts` — fees (and the area a half's fee is charged on,
  `feeAreaM2`) and commissions, struck-out lines, grouping by store
  and delivery; a door, a fitting and a radiator reach their store as the budget counts them,
  fold into what was ordered before and go nowhere when ticked off; kitchens and "already has"
  excluded; the 255-character room clip; `mergeLines`; report periods. (`labourLines` is tested
  but unused in production — bookings use the private `projectLabour`, which has no test.)
- `tests/unit/design/ticks.test.ts` — basket, dialogue and order agree line for line.
- `tests/unit/projects/checkoutParts.test.ts` — both checkout parts respect ticks and quantities,
  and put the furniture under furniture and every other product under the building materials.
- `tests/unit/finance/orderFlow.test.ts` — stages, what a partner may do with its order, the
  facts of an edit event, what the customer sees changed.
- `tests/unit/finance/materials.test.ts` — the construction materials go to their supplier,
  less what was sent before; unassigned without one; joined onto the supplier's order.
- `tests/integration/order-routes.test.ts` — `/api/orders/[id]`, `…/confirm`, `…/comments` with
  the session and the order mocked: a store order is not the store's until confirmed; partners
  never touch lines, prices or delivery and move only along their steps; confirm is staff-only
  and once; the staff note never leaves the platform.
- `tests/integration/save-routes.test.ts` — a forged door, socket or radiator price never reaches
  the row.
- `lib/finance/money.ts`, `lib/finance/orderFlow.ts` and `lib/account/contact.ts` are in the
  coverage gate; `orders.ts`, `payments.ts`, `report.ts`, `settings.ts` touch the database and
  are exercised through the routes, not unit tests (the payment, the checkout and the thank-you
  were walked through headless on a test project; there is no e2e spec for them).

## Known gaps

- A brigade's availability is its open orders against `capacityJobs`, nothing more: no
  calendar, no dates, and an order it never answers keeps it "busy" until somebody closes it.
- The two halves of a project agree on a product only by its id. The studio inherits the
  calculator's furniture, finishes, doors, windows, radiators and fittings (`applyFinishPicks`,
  `applyBoardPicks`), so those are one order line — until one is swapped in the studio: a door
  or a sofa changed there after the calculation was carried over is sent alongside the
  calculator's. The tick on either summary is the way out.
- The checkout dialogue totals the goods and the reserve; the delivery each store will add is
  on the budget (`cost.baskets`) and on the order, not in the dialogue (it says so).
- **The fee is paid through Flitt, in its sandbox for now** ([payments.md](payments.md)): the
  save routes still do not refuse the hinge without a payment (`calculated` / `generated` are
  the browser's word) — the dialogue enforces it, the server does not yet. A half that passed
  its hinge before the fee moved there has no payment and is not asked for one, and a
  design-first project opened in the calculator opens already calculated, so its calculation is
  never charged on its own (the design's fee covers it).
- The marketplace records partner money but does not move it: no payout to partners, no
  invoices, no split payments — only the platform's own fees are taken by card (Flitt). Stores add and edit their own products and workers their own card, but reviews and portfolio are still seeded, not partner-managed, and an approved store's new products go live at once with no moderation step.
- One address per account (the default) and one per order: there is no address book, and a
  guest's booking carries none.
- **Brigade orders are missing from the money pages**: the revenue report counts store and worker
  orders only (`lib/finance/report.ts`), so brigade commissions are missing from revenue, and the
  CSV's partner column is blank for teams. (The order list, the order page and the customer's
  project page name brigades.)
- Nobody is told when a store order arrives for review — the orders agent works from the queue,
  the dashboard and the sidebar's count; there is no mail or push to staff.
- The customer cannot cancel an order or write to the platform from the project page; they
  answer the manager's call. The construction materials' prices are the rate book's estimates
  (`estimated` lines): the agent corrects them with the supplier before confirming.
- One supplier for every construction material (`materialsStoreId`); per-material suppliers
  would need a store per rate-book key.
- The reserve in the checkout dialogue is the summary's figure (materials *and* labour), though
  the checkout orders no labour — as the user asked; it is counted on the first order of a
  project and on nobody's order.
