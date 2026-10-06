# Authentication, roles and access

Who can sign in how, the seven roles and what each may open and do, how admin manages
accounts, and where access is enforced (the proxy, admin pages, API guards). Read this before
adding a route, an admin page, a partner feature, or anything that checks `session.user`.

Related: [partners-and-admin.md](partners-and-admin.md) (the admin panel and partner portal) ·
[marketplace.md](marketplace.md) (who may do what with an order) ·
[architecture.md](architecture.md#api-conventions) (route conventions) ·
[operations.md](operations.md) (mail, rate limiting, environment) ·
[data-model.md](data-model.md) (`users`, `auth_tokens`).

## Key files

| File | Responsibility |
|---|---|
| `auth.ts` | NextAuth v5 (beta) setup, exported as `authOptions` and handed to `NextAuth()`: Credentials provider (bcrypt, lockout, deactivated accounts, `lastLoginAt`), Google and Facebook providers added only when their keys are set, the `signIn` callback that creates a row for a social account (and refuses a deactivated one), and the `jwt` callback that puts the account's claims on the token — at sign-in and on every later read |
| `lib/auth/accountClaims.ts` | server only: `sessionTokenAfterSignIn` (a social sign-in's token gets its row's id, role and partner link), `refreshSessionToken` / `currentAccount` / `accountById` (every later read re-reads the account, cached per process for `CLAIMS_TTL_MS`), `forgetAccount` (admin's changes skip the cache) |
| `auth.config.ts` | the edge-safe half: JWT/session callbacks (role and partner link on the token), `authorized` — the route gate the proxy runs |
| `proxy.ts` | Next 16 proxy (formerly middleware): runs the NextAuth gate, redirects old step URLs and the switched-off workers directory |
| `lib/auth/roles.ts` | `UserRole`, `STAFF_ROLES`, `PARTNER_ROLES`, `AdminSection`, `canAdmin(role, section)`, `canDeleteIn(role, section)` (deleting is admin's), `canOpenAdmin`, `canOpenPartnerPortal`, `homePathFor` (where each role works) |
| `lib/auth/accounts.ts` | pure account rules: `linksForRole` (a partner role needs its store / worker / brigade; other links are cleared), `selfChangeError` (admin cannot demote, deactivate or delete themselves) |
| `lib/auth/password.ts` | `generatePassword` — readable, no look-alike characters, crypto random |
| `lib/admin/guard.ts` | `requireAdminPage(section)` — every admin page and section layout calls it before reading anything |
| `lib/admin/accounts.ts` | `partnerLinkExists` — the store / worker / brigade an account is linked to exists |
| `lib/api/route.ts` | API guards: `requireSession`, `requireAdmin`, `requireStaff(section)`, `requirePartner`, `requireCatalogEditor`, `requireUploader` (plus `handle`, `ok`, `fail`, `parseId`, `API_ERRORS`) |
| `lib/api/publicPartners.ts` | what the public may know about a store or a worker (`publicStore`, `publicWorker`, `isListedPartner`) |
| `lib/partner/context.ts` | `loadPartnerContext`: which store / worker / team the portal is showing (admin may pass `?store=` / `?worker=` / `?team=`) |
| `lib/auth/lockout.ts` | per-account login lockout (in memory) |
| `lib/auth/tokens.ts` | single-use hashed tokens for e-mail verification and password reset (`auth_tokens`) |
| `lib/auth/safeCallbackUrl.ts` | keeps `callbackUrl` on this site |
| `lib/auth/social.ts` | which social providers exist, for both server and client; the error codes the login page reads (`SOCIAL_NO_EMAIL`, `ACCOUNT_DISABLED`) |
| `lib/api/rateLimit.ts` | per-IP sliding-window limits (`RATE_RULES`) for public writes and saves |
| `app/api/auth/*` | `register`, `register-partner`, `forgot`, `reset`, `verify`, `[...nextauth]` |
| `app/api/users/route.ts`, `app/api/users/[id]/route.ts` | admin: create an account; read, change (role and link, active, name, e-mail, password) and delete one |
| `app/api/profile/route.ts`, `lib/account/`, `components/profile/ProfileForm.tsx` | a person's own details: their name, phone and default delivery address (`/profile?view=account`) |
| `app/admin/users/*`, `components/admin/AccountForm.tsx` | the accounts list, the new-account page and the account page |
| `app/(auth)/*`, `components/auth/*` | login, register (+ store / worker), forgot and reset password pages |

## Sign-in

- **Credentials** (email + bcrypt password hash) and, when configured, **Google** and
  **Facebook** (`auth.ts`). Sessions are JWT with no adapter; the account's id (`users.id`, as a
  string), role and partner link (`storeId` / `workerId` / `teamId`) travel on the token, so the
  proxy can gate `/admin` and `/partner` without a database round trip, and every route reads
  `Number(session.user.id)`.
- **How the token gets them.** For the password form, `authorize` returns our `users` row and
  `authConfig`'s `jwt` callback copies it. A social sign-in is different: with no adapter,
  `@auth/core` hands the callbacks the provider's profile with an id of its own making
  (`crypto.randomUUID()`) and no role. So the `signIn` callback finds the account by e-mail —
  creating it (role `user`, e-mail verified) on the first visit, refusing a Facebook login
  that withholds the address — and `auth.ts`'s `jwt` callback then looks the row up by that
  e-mail (`sessionTokenAfterSignIn`) and puts its claims, and `sub`, on the token in place of
  the provider's; with no row there is no token (the sign-in fails) rather than a session for
  nobody. **Joining an existing account needs the provider to vouch for the address**
  (`maySocialJoin` in `lib/auth/social.ts`): Google's `email_verified` must be true; Facebook,
  which does not say, joins only an account with no password (one a social sign-in made). A
  password account — an admin's included — is otherwise refused with
  `/login?error=social_link_refused` ("sign in with your password"): anyone able to put the
  address on a Facebook profile used to be signed in as its owner. A Google account Google has
  not verified is created unverified.
- **Every later read of the session re-reads the account** (`refreshSessionToken`, called by
  the `jwt` callback whenever there is no sign-in in progress — `auth()` in a page or a route,
  the client's `/api/auth/session`). The role, the partner link, the name and the e-mail are the
  row's as it is now; an account that was deleted or deactivated gets no token, which signs it
  out. Reads are cached per process for `CLAIMS_TTL_MS` (30 s), and the admin routes that change
  an account call `forgetAccount`, so on the process that made the change it is immediate and
  elsewhere it takes at most half a minute. The role used to be read once, at sign-in, and
  trusted for the token's thirty days, renewed on every visit — a demoted agent or a deleted
  account kept its old rights for as long as it kept coming back. The lookup lives in
  `auth.ts`, never in `auth.config.ts`: the edge proxy still reads the claims the cookie last
  carried (the cookie is rewritten with the fresh ones whenever a route handler reads the
  session), which is why pages and routes check again.
- **A new password ends every older session.** `users.sessionVersion` is raised by a reset
  (`/api/auth/reset`) and by admin setting a password; the token carries the version it was
  signed in under (`sv`, put on it at sign-in by `authConfig`'s `jwt` callback or
  `sessionTokenAfterSignIn`), and `refreshSessionToken` gives no session to a token whose `sv`
  is not the account's (a token from before the column counts as 0). A reset used to leave the
  old sessions — the one an attacker made with the old password — signed in for their thirty
  days. An admin who sets their own password signs themselves out too.
- **Deactivated accounts** (`users.isActive = false`, admin's switch): the password form checks
  the password first and only then refuses with `code = ACCOUNT_DISABLED` (a stranger learns
  nothing about which accounts exist), which the login page turns into "this account has been
  deactivated"; a social sign-in comes back to `/login?error=account_disabled`; an open session
  ends at its next server-side read. The row, its projects and its orders stay.
- **Last sign-in**: every successful sign-in stamps `users.lastLoginAt` (never fatal). The
  accounts list shows and sorts by it.
- **Where people land**: the login page sends someone who did not ask for a page to their own
  part of the site (`homePathFor`: staff → `/admin`, partners → `/partner`, customers → `/`),
  and so does the proxy for someone at a door that is not theirs — a brigade that types
  `/admin` lands in its portal, an orders agent who types `/partner` in the admin. The user menu
  links staff to the admin and every partner (a brigade too) to the portal, first.
- **Lockout**: five wrong passwords within fifteen minutes lock the account for fifteen minutes
  (`lib/auth/lockout.ts`, in memory like the rate limiter — per process).
- **Verification and reset** use single-use, SHA-256-hashed tokens in `auth_tokens`
  (`lib/auth/tokens.ts`); issuing a new one retires the older unused ones. Verification is
  encouraged, not required: an unverified account still works. Google and Facebook accounts
  are created verified; admin may create an account verified. With `MAIL_DRIVER=log` the links
  are written to the app log ([operations.md](operations.md)).
- `callbackUrl` is attacker-controlled; `safeCallbackUrl` keeps it on this site, checking the
  path again after the URL parser normalised it (`/.//evil.example` comes out as
  `//evil.example`, a protocol-relative link off the site) — `tests/unit/api/helpers.test.ts`
  and `e2e/public.spec.ts` pin it.

## The roles (`lib/auth/roles.ts`)

`users.role` is one of `user`, `admin`, `agent_orders`, `agent_catalog`, `store`, `worker`,
`team`. A partner account is linked to its row by `users.storeId` / `workerId` / `teamId`;
`linksForRole` keeps exactly the link its role needs and refuses a partner role without one.

| Role | Works in | May | May not |
|---|---|---|---|
| `user` | the site | their own projects (calculator, design studio), profile — and their own details (name, phone, default delivery address) — own furniture, render photos; pay a half's fee; order a saved project; book a brigade | open `/admin` or `/partner`; change their own e-mail (it is the sign-in) |
| `admin` | `/admin`, every section | everything: accounts (create, role and link, deactivate, password, delete), orders, projects, the catalogue, stores, workers, brigades, the rate book, revenue and its CSV, the card transactions, platform settings (fees, commissions, the own item's price, the bank commission, the building-materials supplier); the partner portal as any partner (`?store=` / `?worker=` / `?team=`); delete any project or photo | demote, deactivate or delete themselves |
| `agent_orders` | `/admin`: dashboard, orders, projects | work every order: keep or strike lines, change quantities, prices and the delivery, add lines, **confirm a store's order and send it to the store**, set any status (reopen a closed order), write to the customer, keep a staff note, comment for the partner; see every project and its orders | products, categories, stores, workers, brigades, rates, revenue, settings, accounts; the partner portal; deleting projects |
| `agent_catalog` | `/admin`: dashboard, products, categories, stores | products (any store's: add, edit, show/hide, in bulk, 3D models), the category tree (add, edit, move, reorder, hide) and the studio's rooms (add, edit, reorder, hide), stores (add, edit, switch off, approve or reject) | **delete** a product, a category, a studio room or a store (admin's — `canDeleteIn`; the buttons are not shown and the routes answer 403); orders of any kind, projects, revenue, a store's commission rate, workers, brigades, rates, settings, accounts |
| `store` | `/partner` | its own orders once the platform has sent them (move along: in progress → done, message the customer, comment), its own products (add, edit, delete, show/hide, in bulk; `storeId` forced, never featured), its sales figures; image and GLB uploads | change an order's lines, prices or delivery; cancel or reopen an order; see the staff note or other partners |
| `worker` | `/partner` | its own bookings (accept or turn down, start, finish, message, comment), its own card (`workerSelfSchema`); image uploads | as a store, and no products |
| `team` | `/partner` | its brigade's bookings (sent to it the moment a customer chooses it: accept or turn down, start, finish, message, comment — customer contact included); **the projects it is booked for, to look at only** (`/partner/projects`, `/partner/projects/[id]`: customer, 2D plan, 3D model and walk-through, budget, rooms, plan PDF — `teamMaySeeProject`); its company profile (`teamSelfSchema`: names, descriptions, foreman, contact, logo, city, experience, capacity), its crew and load; image uploads | change anything in a project; see a project it is not booked for, or one whose booking it turned down; its crew, markup, commission, rating or verification (admin's) |

Where accounts come from: `/register` (a `user`), `/register/store` and `/register/worker`
(pending partners — [partners-and-admin.md](partners-and-admin.md)), `pnpm db:seed:partners`
(store and worker logins), `pnpm db:seed:teams` (brigade logins), and **admin's new-account
page** (`/admin/users/new`, `POST /api/users`): any role, with its store / worker / brigade, a
password admin sets (or generates) and hands over — shown once, with a copy button — and an
optional "e-mail verified". The agents' accounts are made there.

## Managing accounts (`/admin/users`, admin only)

The list counts the platform team, partners, customers and deactivated accounts (each a
link to the filtered list), filters by role, group, status, verification and projects, and
shows each account's role, status, last sign-in and projects. The account page
(`AccountForm`) changes name and e-mail, the role — chosen from cards that say what each role
does — with its partner link (a picker of stores, workers or brigades appears for a partner
role), sets a new password (generate, show, copy), switches the account off or on, and deletes
it. `PUT /api/users/[id]` refuses a partner role without its link (`PARTNER_LINK_REQUIRED`), a
link to a row that does not exist (404), an e-mail that is taken (`EMAIL_EXISTS`), and admin
demoting, deactivating or deleting themselves; every change calls `forgetAccount`, so it is on
the account's next request.

## A person's own details (`/profile?view=account`)

Every signed-in person edits their own name, phone and default delivery address — city, street
and number, postal code — on the profile (`ProfileForm`, the last list in its sidebar; the
account at the head of the sidebar links there). `GET /api/profile` answers the account's
contact (`loadAccountContact`) and `PATCH /api/profile` (`requireSession`,
`RATE_RULES.saveProject`, `profileSchema`) changes it: a name of 2–255 characters, a phone with
at least five digits or empty (which clears it), an address with both a city and a street or
`null`. A changed name calls `forgetAccount`, so the session's name follows on the next read.
The e-mail is shown, not edited: it is the sign-in, and admin changes it on the account page.
The checkout and the booking read the same contact and ask only for what it lacks; what was
typed there is kept on the account when the person ticks "keep it as my default"
([marketplace.md](marketplace.md#checkout-flow)). Admin's account page does not show or edit
the phone and the address.

## Where access is enforced

1. **The proxy** (`proxy.ts` → `authorized` in `auth.config.ts`): `/admin` needs a role for
   which `canOpenAdmin` is true, `/partner` needs `canOpenPartnerPortal` (admin or a partner),
   `/profile` and the project steps (`/calculator/<id>/…`, `/design/<id>/…`) need any session;
   someone at the wrong door is sent to `homePathFor(role)`. The proxy lets in anybody with *a
   part* of the admin, not only `admin` — asking for the role `admin` there once turned both
   kinds of agent away at the door. The proxy does **not** guard `/api` — every route guards
   itself — and it reads the claims the cookie carries, not the database.
2. **Admin pages** call `requireAdminPage(section)` (`lib/admin/guard.ts`) — every page itself,
   and its section's layout as well — so an agent who types the URL of a section that is not
   theirs is sent back to the dashboard. (A check that lives only in a layout is not enough:
   Next can render a page without re-running the layouts above it.) The dashboard shows each
   role only its own buttons, figures and to-dos ([partners-and-admin.md](partners-and-admin.md)).
3. **API routes** call one of the guards in `lib/api/route.ts`:
   - `requireSession` — any signed-in user (project routes then check ownership themselves);
   - `requireAdmin` — accounts (`/api/users`), workers (and worker approval), rates, settings,
     the revenue export;
   - `requireStaff(section)` — staff with that section: categories, stores (and store approval),
     teams, **confirming an order** (`orders`). Deleting a category or a store then also needs
     `canDeleteIn(role, section)` — admin only: an agent adds, edits and switches off, and is
     answered 403 for a delete;
   - `requirePartner` — admin, `agent_orders` or a linked partner: changing an order and
     commenting on it; a partner's order is checked with `partnerOwnsOrder`
     (`lib/finance/orders.ts`), which also requires the order to have been sent to it, and a
     partner's change with `partnerNextStatuses` ([marketplace.md](marketplace.md#order-review-the-platform-confirms-every-store-order));
   - `requireCatalogEditor` — admin, `agent_catalog` or a linked store: the product routes
     (one product, and `POST /api/products/bulk`) and `POST /api/upload/model`; per product,
     `canEditProduct` (`lib/api/productAccess.ts`) then lets staff change any product and a
     store only its own, and `canDeleteProduct` lets admin delete any and a store its own —
     never the catalogue agent (a bulk delete from one is refused before anything is read);
   - `requireUploader` — admin, `agent_catalog` or any linked partner: `POST /api/upload`.
4. **The pages follow the routes.** A delete button is rendered only for whoever may delete:
   the admin's product list, product form, category form and store form read `canDeleteIn`
   for the signed-in role (the bulk bar offers show and hide only to the catalogue agent); a
   store's own list and form keep theirs. A brigade's project pages
   (`/partner/projects/[id]`) open only when `teamMaySeeProject` finds a sent, not-cancelled
   booking of that brigade for that project (`lib/partner/projects.ts`) — anybody else,
   another brigade or a store included, gets a 404 — and render nothing that writes.
5. **Money is admin's.** A store's commission rate is shown and saved only for admin: the
   store form hides the field from a catalogue agent and `POST`/`PUT /api/stores` ignore it
   from anybody else; revenue, the card transactions (`/admin/payments`), settings and the
   dashboard's money tiles are admin-only.
6. **What the public reads.** `GET /api/stores`, `/api/stores/[id]`, `/api/workers` and
   `/api/workers/[id]` answer staff (and a worker reading themself) with the whole row, and
   everybody else with the listed partners only — approved and active — and only their public
   fields (`lib/api/publicPartners.ts`): never the commission, the private e-mail or the
   approval state. A pending or switched-off partner is a 404 to the public.

## Tests

`tests/unit/api/accountClaims.test.ts` (a Google or Facebook sign-in ends with its account's id,
role and partner link; every later read re-reads the account — a role or link changed by admin
is on the next request, a deactivated or deleted account is signed out; the per-process cache
and `forgetAccount`; the password form: last sign-in stamped, a deactivated account told so
only after the right password — driven through `authOptions` with the database mocked and
NextAuth stubbed), `tests/unit/api/accounts.test.ts` (`linksForRole`, `selfChangeError`,
`canAdmin` per role, `canDeleteIn`, `homePathFor`, `generatePassword`),
`tests/unit/api/publicPartners.test.ts` (what the public may know about a partner),
`tests/unit/api/lockout.test.ts` (lockout), `tests/unit/api/helpers.test.ts` (the response
envelope, `parseId`, `requireAdmin`, `handle`, the rate limiter, `safeCallbackUrl`,
`repriceSnapshot`), `tests/unit/api/productAccess.test.ts` and
`tests/integration/product-routes.test.ts` (who reads, changes and deletes a product),
`tests/integration/catalog-delete-routes.test.ts` (a category, a store and products in bulk:
deleted by admin, refused to the catalogue agent, a store's own in bulk),
`tests/integration/order-routes.test.ts` (who may read, change, confirm and comment on an
order), `e2e/public.spec.ts` (auth pages, callback URL safety). `lib/auth/**` and
`lib/api/**` are in the coverage gate ([testing.md](testing.md)).

## Known gaps

- Social sign-in has been checked against `@auth/core` 0.41's source and the callbacks' tests,
  not against a live Google or Facebook app (no keys in development).
- The edge proxy reads the claims the cookie last carried: an account demoted or switched off
  still passes the proxy until a page or route re-reads it (the next request does, and turns it
  away or signs it out). The claims cache is per process — up to 30 s on another instance.
- No team self-registration (brigades come from `pnpm db:seed:teams` or admin's new-account
  page with a brigade that admin made first).
- Admin can set a new password but cannot send a password-reset link from the account page
  (the person can use "forgot password"); account changes are logged to the app log, not kept
  as an audit trail in the database.
- Lockout and rate limits are in memory, per process: a restart forgets them, and two
  processes behind one domain would each keep their own.
