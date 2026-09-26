# Authentication, roles and access

Who can sign in how, the seven roles and what each may open, and where access is enforced (the
proxy, admin pages, API guards). Read this before adding a route, an admin page, a partner
feature, or anything that checks `session.user`.

Related: [partners-and-admin.md](partners-and-admin.md) (the admin panel and partner portal) ·
[architecture.md](architecture.md#api-conventions) (route conventions) ·
[operations.md](operations.md) (mail, rate limiting, environment) ·
[data-model.md](data-model.md) (`users`, `auth_tokens`).

## Key files

| File | Responsibility |
|---|---|
| `auth.ts` | NextAuth v5 (beta) setup, exported as `authOptions` and handed to `NextAuth()`: Credentials provider (bcrypt, lockout), Google and Facebook providers added only when their keys are set, the `signIn` callback that creates a row for a social account, and the `jwt` callback that puts that row's claims on a social session |
| `lib/auth/accountClaims.ts` | server only: `accountClaimsByEmail`, `sessionTokenAfterSignIn` — a social sign-in's token gets its `users` row's id, role and partner link |
| `auth.config.ts` | the edge-safe half: JWT/session callbacks (role and partner link on the token), `authorized` — the route gate the proxy runs |
| `proxy.ts` | Next 16 proxy (formerly middleware): runs the NextAuth gate, redirects old step URLs and the switched-off workers directory |
| `lib/auth/roles.ts` | `UserRole`, `STAFF_ROLES`, `PARTNER_ROLES`, `AdminSection`, `canAdmin(role, section)`, `canOpenAdmin`, `canOpenPartnerPortal` |
| `lib/admin/guard.ts` | `requireAdminPage(section)` — every admin page calls it before reading anything |
| `lib/api/route.ts` | API guards: `requireSession`, `requireAdmin`, `requireStaff(section)`, `requirePartner`, `requireCatalogEditor`, `requireUploader` (plus `handle`, `ok`, `fail`, `parseId`, `API_ERRORS`) |
| `lib/partner/context.ts` | `loadPartnerContext`: which store / worker / team the portal is showing (admin may pass `?store=` / `?worker=` / `?team=`) |
| `lib/auth/lockout.ts` | per-account login lockout (in memory) |
| `lib/auth/tokens.ts` | single-use hashed tokens for e-mail verification and password reset (`auth_tokens`) |
| `lib/auth/safeCallbackUrl.ts` | keeps `callbackUrl` on this site |
| `lib/auth/social.ts` | which social providers exist, for both server and client |
| `lib/api/rateLimit.ts` | per-IP sliding-window limits (`RATE_RULES`) for public writes and saves |
| `app/api/auth/*` | `register`, `register-partner`, `forgot`, `reset`, `verify`, `[...nextauth]` |
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
  nobody. Only the sign-in itself queries the database — a later read of the session does
  not — and the lookup lives in `auth.ts`, never in `auth.config.ts`, which the edge proxy runs.
  A person who has a password account and signs in with Google on the same e-mail is the same
  account, admin role included.
- **Lockout**: five wrong passwords within fifteen minutes lock the account for fifteen minutes
  (`lib/auth/lockout.ts`, in memory like the rate limiter — per process, per instance on
  Vercel).
- **Verification and reset** use single-use, SHA-256-hashed tokens in `auth_tokens`
  (`lib/auth/tokens.ts`); issuing a new one retires the older unused ones. Verification is
  encouraged, not required: an unverified account still works. Google and Facebook accounts
  are created verified. With `MAIL_DRIVER=log` the links are written to the app log
  ([operations.md](operations.md)).
- `callbackUrl` is attacker-controlled; `safeCallbackUrl` keeps it on this site
  (`e2e/public.spec.ts` pins it).

## The roles (`lib/auth/roles.ts`)

`users.role` is one of `user`, `admin`, `agent_orders`, `agent_catalog`, `store`, `worker`,
`team`. A partner account is linked to its row by `users.storeId` / `workerId` / `teamId`.

| Role | May open | Notes |
|---|---|---|
| `user` | the site, their projects and profile, their own furniture, checkout and brigade bookings of their own projects | the customer |
| `admin` | every admin section (dashboard, orders, projects, products, categories, stores, workers, teams, rates, revenue, users, settings) and the partner portal as any partner (`?store=` / `?worker=` / `?team=`) | the only role that edits users and roles, workers, the rate book, platform settings and exports revenue |
| `agent_orders` | admin: dashboard, orders, projects | takes orders as they arrive: edits any order, reopens closed ones, writes `orders.staffNote`; never prices, rates, revenue, settings or accounts |
| `agent_catalog` | admin: dashboard, products, categories, stores (including store approval); uploads | keeps the catalogue; never orders or money |
| `store` | `/partner`: its own orders, its own products (`storeId` forced, `isFeatured` / `sortOrder` ignored); image and GLB uploads | |
| `worker` | `/partner`: its own orders and its own card (`workerSelfSchema`); image uploads | |
| `team` | `/partner`: its brigade's bookings (accept / turn down); image uploads | |

Where accounts come from: `/register` (a `user`), `/register/store` and `/register/worker`
(pending partners — [partners-and-admin.md](partners-and-admin.md)), `pnpm db:seed:partners`
(store and worker logins), `pnpm db:seed:teams` (brigade logins), and the admin user form
(roles; it links store and worker accounts, not teams).

## Where access is enforced

1. **The proxy** (`proxy.ts` → `authorized` in `auth.config.ts`): `/admin` needs a role for
   which `canOpenAdmin` is true, `/partner` needs `canOpenPartnerPortal` (admin or a partner),
   `/profile` and the project steps (`/calculator/<id>/…`, `/design/<id>/…`) need any session.
   The proxy lets in anybody with *a part* of the admin, not only `admin` — asking for the role
   `admin` there once turned both kinds of agent away at the door; each section's page says
   which part is theirs. The proxy does **not** guard `/api` — every route guards itself.
2. **Admin pages** call `requireAdminPage(section)` (`lib/admin/guard.ts`), so an agent who types
   the URL of a section that is not theirs is turned away.
3. **API routes** call one of the guards in `lib/api/route.ts`:
   - `requireSession` — any signed-in user (project routes then check ownership themselves);
   - `requireAdmin` — workers (and worker approval), users, rates, settings, the revenue export;
   - `requireStaff(section)` — staff with that section: categories, stores (and store approval),
     teams;
   - `requirePartner` — admin, `agent_orders` or a linked partner; order ownership is checked with
     `partnerOwnsOrder` (`lib/finance/orders.ts`);
   - `requireCatalogEditor` — admin, `agent_catalog` or a linked store: the product routes and
     `POST /api/upload/model`; per product, `canEditProduct` (`lib/api/productAccess.ts`) then
     lets staff change any product and a store only its own;
   - `requireUploader` — admin, `agent_catalog` or any linked partner: `POST /api/upload`.

## Tests

`tests/unit/api/accountClaims.test.ts` (a Google or Facebook sign-in ends with its account's id,
role and partner link — driven through `authOptions.callbacks` with the database mocked and
NextAuth stubbed; a password sign-in and a plain session read make no lookup),
`tests/unit/api/lockout.test.ts` (lockout), `tests/unit/api/helpers.test.ts` (the response
envelope, `parseId`, `requireAdmin`, `handle`, the rate limiter, `safeCallbackUrl`,
`repriceSnapshot`), `tests/unit/api/productAccess.test.ts` and
`tests/integration/product-routes.test.ts` (who reads and who changes a product),
`e2e/public.spec.ts` (auth pages, callback URL safety). `lib/auth/**` and `lib/api/**`
are in the coverage gate ([testing.md](testing.md)).

## Known gaps

- Social sign-in has been checked against `@auth/core` 0.41's source and the callbacks' tests,
  not against a live Google or Facebook app (no keys in development).
- No team self-registration; the admin user form has no team link, so an account switched to
  `team` there is left unlinked.
- Lockout and rate limits are in memory: per process on the VPS, per instance on Vercel.
