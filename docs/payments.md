# Payments: Flitt card payments, the bank commission, transactions

How the platform takes money by card: through **Flitt** (Tpay LLC, a Georgian payment service
provider) with its **embedded** checkout — the card form inside our own dialogue, no redirect.
What is paid by card today: each half's **fee before its hinge** (the calculation, the 3D
design) and **adding a piece of one's own furniture** as a 3D model. Partner goods and
brigades are still paid to the partners ([marketplace.md](marketplace.md)). Read this before
touching `lib/payments/`, the payment routes, `CardPayment` / `FlittCheckout`, the hinge or
own-item dialogues' payment step, `/admin/payments`, the payment settings, the legal pages, or
the CSP in `next.config.mjs`.

Related: [marketplace.md](marketplace.md) (the fees, what a paid half unlocks, revenue) ·
[catalog.md](catalog.md#a-persons-own-furniture) (own furniture) ·
[data-model.md](data-model.md) (`payments`, `payment_events`, `project_payments`,
`platform_settings`) · [operations.md](operations.md) (environment, CSP, the callback's firewall) ·
[partners-and-admin.md](partners-and-admin.md) (admin lists, settings).

Source of the protocol: Flitt's documentation (docs.flitt.com; bundled in Flitt's
`flitt-integration-skill`, `source_md/docs/`) — `getting-started/embedded.md`,
`api/embedded-custom.md`, `api/create-order.md`, `api/order-parameters.md`,
`api/building-signature.md`, `api/callbacks.md`, `api/order-status.md`, `api/testing.md`.

## Key files

| File | Responsibility |
|---|---|
| `lib/payments/flitt.ts` | the protocol, pure (`node:crypto`): `signatureString` / `flittSignature` / `verifyFlittSignature`, `flittResponseOf` (the API wraps in `response`, a callback posts bare), `flittOutcome` (is this answer about *this* payment — order, merchant, amount, currency), `flittFacts` (the card, the money in GEL, the bank's references), `storedPayload`, `cardLast4`; the test merchant's constants |
| `lib/payments/flittApi.ts` | the two calls: `createCheckoutToken` (`POST /api/checkout/token`) and `fetchOrderStatus` (`POST /api/status/order_id`, signature checked); `flittConfig()` from the environment; `FlittError` |
| `lib/payments/service.ts` | the `payments` rows: `startCardPayment`, `settleCardPayment` (once-only approval, facts, `fulfil`), `refreshCardPayment`, `settleRecentPayments`, `recordFlittEvent`; the own item's credit (`ownItemCredit`, `claimOwnItemCredit`, `releaseOwnItemCredit`, `spendOwnItemCredit`); `CardPaymentView` |
| `lib/finance/payments.ts` | a half's quote (`paymentQuote`), `recordHalfPayment` (the `project_payments` row an approved half writes), `halfPayment`, `paymentsOf`, `projectFees` |
| `lib/finance/money.ts` | `withBankFee(amount, pct)` → `{ amount, bankFeePct, bankFee, total }`, `toTetri` |
| `app/api/payments/flitt/route.ts` | `POST` — start a payment: `{ purpose: 'calculator' \| 'design', projectId }` or `{ purpose: 'own_item' }` → the token, the charge, the quote; or `{ paid }` / `{ free }` / `{ credit }` when there is nothing to pay |
| `app/api/payments/flitt/[orderId]/route.ts` | `GET` — the payment as Flitt has it now (asked when unsettled); the payer or admin |
| `app/api/payments/flitt/callback/route.ts` | `POST` — Flitt's server-to-server result; no session, the signature is the proof |
| `app/api/payments/own-item/route.ts` | `GET` — what adding an own item costs this person now, and whether they hold a paid credit |
| `app/api/payments/route.ts` | `GET ?projectId=` — what each half paid and what it would cost (the summaries) |
| `components/payments/FlittCheckout.tsx` | Flitt's `checkout.js` + CSS from pay.flitt.com, mounted with the token; `success` / `error` / `ready` |
| `components/payments/CardPayment.tsx` | the card step: starts the payment, the bill (price · bank commission · total) beside Flitt's form, verifies with the server, retries; `keepOpenOutside` |
| `components/flow/HingeDialog.tsx`, `components/studio/OwnModelDialog.tsx` | the two dialogues that pay |
| `app/admin/payments/page.tsx`, `[id]/page.tsx`, `components/admin/PaymentStatusBadge.tsx` | the admin's transactions and one transaction with every Flitt answer |
| `components/admin/SettingsForm.tsx` | the own item's price and the bank commission, with a worked example |
| `app/(main)/terms`, `privacy`, `refund`, `lib/legal.ts`, `components/layout/Footer.tsx`, `PaymentMarks.tsx`, `public/payments/` | what a card-taking site must show (below) |
| `lib/validations/payment.schema.ts` | `startPaymentSchema`, `orderIdSchema` |

## The flow

```
dialogue (hinge: after the warning and the save · own item: "pay and add")
  → POST /api/payments/flitt { purpose, projectId? }
      settleRecentPayments  — an unsettled payment of the same thing is asked about first
      paid / free / credit  → no form: the dialogue goes on
      startCardPayment      — payments row (status created), amount + bank fee = total,
                              POST pay.flitt.com/api/checkout/token (signed) → token
  → CardPayment: bill on the left, FlittCheckout(token) on the right
      the person pays (3-D Secure in Flitt's window over the page)
      checkout.js "success" — only a hint
  → GET /api/payments/flitt/<orderId>  (up to 8 × 1.5 s)
      refreshCardPayment → POST pay.flitt.com/api/status/order_id (signed both ways)
      settleCardPayment  → payment_events row; approved once; fulfil:
                           a half → project_payments row (method flitt, reference order id)
                           an own item → a credit the upload spends
  → approved: the hinge (calculated / generate) · the upload (POST /api/design/models)

Flitt → POST /api/payments/flitt/callback (signed) → settleCardPayment — whichever comes first
```

**The server is the only judge of "paid".** The browser's `success` makes the dialogue ask the
server; the server asks Flitt (`/api/status/order_id`, signature verified) or has had the
signed callback; `flittOutcome` then requires the same order id, our merchant, and — for an
approval — the exact amount in tetri and the currency, or nothing is unlocked (logged as an
error). The approval is an `UPDATE … WHERE status <> 'approved'`, so a callback and a status
check racing each other approve and fulfil once; later answers about an approved payment
still update its facts (a partial refund's `reversal_amount`), and a `reversed` is recorded.

**Nothing is charged twice by a lost confirmation.** Every start first asks Flitt about the
person's unsettled payments of the same purpose (and project) from the last two hours
(`settleRecentPayments`): one paid in a tab closed before the form answered — with no
callback to tell us, as on a developer's machine — is found approved and the dialogue says
"already paid" instead of opening a new form. A half paid twice anyway (two tabs, two cards)
keeps the first `project_payments` row; the second payment is logged for a refund.

**The callback** (`server_callback_url`, `NEXT_PUBLIC_APP_URL/api/payments/flitt/callback`)
is sent only when the app's URL is reachable — never for localhost, `*.localhost`, `*.test`.
Flitt posts JSON (or a form, if the merchant's portal says so), expects a 200, retries after
2 s, 1 min, 5 min, 10 min, 1 h and 1 day otherwise, follows no redirect, and comes from
54.154.216.60 and 3.75.125.89. A verified callback is answered 200 even when it does not
match its payment (asking again would not change it — it is logged); a bad signature is 400
and changes nothing (kept in `payment_events` with `signatureValid` false when it names one of
our orders).

## The protocol (what is signed)

`signature` = SHA-1, lower-case hex, of the payment key followed by every parameter that has a
value, in the alphabetical order of their names, joined by `|`; an empty parameter adds
nothing (not even its `|`), a zero is a value, `signature` and `response_signature_string`
(the test mode's hint, with the key masked) are never part of it. UTF-8 throughout — the order
description is Georgian. Requests are `{ "request": { … } }`, answers `{ "response": { … } }`;
`response_status` is whether the request was processed, `order_status` is the payment
(`created`, `processing`, `approved`, `declined`, `expired`, `reversed`). Amounts are integer
tetri. **Flitt's documented sample hashes do not match its own sample strings**; the strings are
pinned in the tests, and the hash was proved on the sandbox (a wrong one is error 1014, and the
status answers verify).

The token request carries `merchant_id`, our `order_id` (`remonti-<calc|des|own>-<time>-<hex>`
— the test merchant is shared by everyone who tries it, so never a bare row id), `order_desc`
(Georgian/English/Russian by the person's language), `amount`, `currency` GEL, `lang`,
`lifetime` 3600 s, `server_callback_url` when reachable, `sender_email`. The embedded form is
then opened with `params: { token }` only — the amount, currency and language are the order's.

## The bank commission

`platform_settings.bankFeePct` (admin, default **2.2 %** — Flitt's published rate for Georgian
cards; international cards are 2.5 %) is added **on top** and shown as a line of its own:
`withBankFee(221.96, 2.2)` = 221.96 + 4.88 = **226.84 ₾** charged. The `payments` row keeps the
price (`amount`), the rate, the commission and the `total`; the half's `project_payments.amount`
is the platform's fee alone (what the revenue report counts). Flitt's own `show_fee` is not
used — the commission is ours to show.

## Own items

`platform_settings.ownItemPrice` (admin, default **10 ₾**; 0 makes it free) for adding a GLB
model. The dialogue reads `GET /api/payments/own-item` when it opens: the price line under the
form, and "pay and add · 10,22 ₾" instead of "add". Paying first renders the tile's photo off
the turntable, then the card step; the approval is a **credit**, and the upload
(`POST /api/design/models`) claims one before storing anything (`claimOwnItemCredit`: an update
that matches only an unclaimed row, so two uploads cannot share one), gives it back if the
upload fails (`releaseOwnItemCredit`), and records the product on it once made. A credit left
over (a failed upload, a closed tab) is spent by the next upload without paying again — the
dialogue says so. No credit → 402 `PAYMENT_REQUIRED`. **A photo is free** while nothing turns
it into a model (it cannot be placed).

## The dialogue (`CardPayment`)

- **Two columns**: the dialogue's heading, the bill, the test-mode note, the secure-payment note
  and "back" on the left; Flitt's form on the right (stacked on a phone). The dialogue widens to
  56 rem for it and needs no scrolling on a laptop; Flitt's own amount block is hidden
  (`show_amount: false`) — the bill says it, the pay button still carries it.
- **Not modal while the form is up.** Flitt's SDK puts 3-D Secure — the bank's page, in an
  iframe — in a window of its own on `<body>`, outside the dialogue. A Radix modal sets
  `pointer-events: none` on the body (the bank's "Continue" could not be pressed) and pulls the
  focus back from the bank's code field. So the two dialogues pass `modal={false}`, draw their
  backdrop themselves (`DialogContent backdrop` — inside the dialogue's own portal, under the
  content; a separate portal landed on top of it and blurred the dialogue) and keep open on an
  outside click (`keepOpenOutside`). Switching `modal` remounts Radix's content: harmless for the
  hinge (its state is above the content); the own-item dialogue renders the tile's photo before
  the card step and brings the turntable back after it.
- One payment per attempt (React's development double-mount would make two orders), a new one
  on "try again"; a form not ready in 20 s says so; on `localhost` a note says where to open
  the app instead (below).
- The form's "I accept the terms" links to `/terms` (`offerta_url`); `methods: ['card']`, Google
  Pay always, Apple Pay on https only.

## Local development and testing

- **Flitt refuses to serve its form to a page on `localhost` or `127.0.0.1`**: its CDN answers the
  gateway iframe (`/latest/checkout-v2/index.html?origin=…`) with a 403, and the form spins for
  ever. Any other name works — **open the app at `http://renovate.localhost:3000`** (browsers
  resolve every `*.localhost` to the machine; no hosts file). The live site is unaffected. Sign in
  again on that host (cookies are per host).
- **Apple Pay on http**: Flitt's SDK always loads Apple's SDK, which throws "Trying to start an
  Apple Pay session from an insecure document" off https. Off https `FlittCheckout` puts an inert
  `text/plain` script with Apple's URL in the page first; Flitt skips a wallet script the page
  already has and finds no Apple Pay. Nothing changes on https.
- **Sandbox**: without `FLITT_MERCHANT_ID` / `FLITT_SECRET_KEY` the platform uses Flitt's public
  test merchant (1549901, key `test`). Nothing is charged; the form shows "test mode" and fills
  in a test card. Cards (`api/testing.md`): **4444 5555 6666 1111** (approve, 3-D Secure — the
  bank emulator's "Continue"), 4444 5555 1111 6666 (approve, no 3DS), 4444 1111 6666 5555
  (decline, 3DS), 4444 1111 5555 6666 (decline, no 3DS); any expiry and CVV.
- No callback reaches a developer's machine: the status check settles every payment there.
- Headless Chrome works (Playwright `channel: 'chrome'`); cross-origin iframes need
  `--disable-features=IsolateOrigins,site-per-process` for their requests to show.

## Configuration

`FLITT_MERCHANT_ID`, `FLITT_SECRET_KEY` (both or neither — `lib/env.ts` refuses half a pair),
`FLITT_TEST_MODE` (`true` until Flitt has switched the merchant live; the test merchant is never
live). The rows record `testMode`. Content Security Policy (`next.config.mjs`): pay.flitt.com for
scripts, styles, fonts and requests; Google Pay's and Apple Pay's hosts; **`frame-src https:` and
`form-action https:`** — 3-D Secure is any bank's page, posted from our document into an iframe;
`Permissions-Policy: payment=(self "https://pay.flitt.com" "https://pay.google.com")`.

## Admin

- **`/admin/settings` → "card payments"**: the own item's price and the bank commission, with the
  75 m² design worked out on a card ("{fee} + {bank} = {total}").
- **`/admin/payments` (Transactions, its own section — admin only)**: every payment — order
  (id and Flitt's order id), the user (#id, name, e-mail), what for (calculation / design fee with
  the project, own item with the item or "paid, not uploaded yet"), the card (masked, type,
  method), charged (fee + commission), **actual amount**, **reversal amount**, status (+ test),
  **Flitt's order time** and ours. Filters in the URL (search by order id, e-mail, card, RRN,
  Flitt payment id, project id; status; purpose; test/live; dates); the line above sums the
  approved ones of the filter: charged, of which bank commission, returned.
- **`/admin/payments/[id]`**: every column, and **every answer Flitt gave** — each callback and
  status check whole (`payment_events.payload`: all of Flitt's parameters as received, less the
  signing hint, `additional_info` decoded), with its signature verdict and time.

## What a card-taking site must show

Flitt's docs list no website requirements (its FAQ: a site is not even mandatory; "an active TBC
bank account is required"); what Georgian acquirers and the card schemes review — and what is
on the site now — is: terms of service with the paid
services, prices in GEL, payment and delivery of the service; a privacy policy covering card
data; a refund policy; the legal entity's name, identification code and legal address with a
phone and an e-mail; the card schemes' marks and a secure-payment note. On the site:
`/terms` (10 sections), `/privacy` (7, "payment data" among them), **`/refund`** (6), the footer's
"secure card payments — Flitt" with Visa, Mastercard, Apple Pay and Google Pay (Flitt's own
artwork, `public/payments/`, viewBoxes trimmed), the refund link, and the company line in the
footer and on `/contact`. **The company's name, code and address are placeholders** —
`footer.company_name`, `company_id`, `legal_address` in `lib/i18n/{ka,en,ru}.ts` (`lib/legal.ts`
fills them into the pages); the phone and e-mail in `footer` too.

## Going live

1. A merchant at portal.flitt.com (needs a TBC business account); its site URL; its merchant id and
   payment key (Technical settings) into `FLITT_MERCHANT_ID` / `FLITT_SECRET_KEY` on the server.
2. The company details in the three dictionaries; the legal texts reviewed by a lawyer.
3. Flitt reviews the site and switches the merchant live → `FLITT_TEST_MODE=false`.
4. `NEXT_PUBLIC_APP_URL` the public https URL (the callback); the two Flitt IPs allowed if a firewall
   sits in front.
5. Apple Pay on the web (`api/applepay-web.md`): register every domain the button shows on, ask
   Flitt support for `apple-developer-merchantid-domain-association.txt`, serve it at
   `/.well-known/apple-developer-merchantid-domain-association`, and have Flitt activate the domain
   (not done yet — until then Apple Pay simply does not appear).

## Tests

- `tests/unit/payments/flitt.test.ts` — the documented signing strings (request and callback),
  verification (tampered, other key, none), reading answers, the facts in GEL, the outcome
  against its payment (order, merchant, amount, currency, unknown status, a decline). In the
  coverage gate.
- `tests/unit/finance/money.test.ts` — `withBankFee`, `toTetri`.
- `tests/integration/payment-routes.test.ts` — the callback (signed / forged / form / wrapped /
  garbage), the start (401, 400, owner, quote, paid, nothing to pay, own item price / credit /
  free, Flitt down → 502), the status (payer, others, bad ids).
- `tests/unit/legal/legalSections.test.ts` — every section in three languages, the company filled in.
- Walked through on the sandbox (headless Chrome at `renovate.localhost`): a design fee and two own
  items paid through 3-D Secure, the half recorded, the design generated, the item uploaded on its
  credit, the admin pages. `settleCardPayment`'s database glue and the upload's credit are
  exercised that way, not by unit tests.

## Known gaps

- **Refunds are made in Flitt's portal**, not from the admin: there is no reversal call
  (`api/create-reversal.md`) yet; a reversal shows up through the callback or the next status.
- The **save routes still accept `calculated` / `generated` without a payment** (the browser's
  word) — the hinge's payment is enforced by the dialogue only ([marketplace.md](marketplace.md)).
- Own-item payments are not in the **revenue report** (only the halves' fees are); the
  transactions page has them.
- **Payments that never finish** stay `created` (no expiry sweep); they are harmless and filterable.
- The **company details are placeholders** until the business fills them in.
- A photo own item is free; when photos turn into models, decide its price.
- Apple Pay's domain association file is not served yet (Going live, step 5).
- Partner goods are still paid to partners directly — no split payments (`api/split.md`) yet.
