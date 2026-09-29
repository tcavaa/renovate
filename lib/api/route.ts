import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { log } from '@/lib/log';
import { canAdmin, isPartnerRole, type AdminSection } from '@/lib/auth/roles';

/**
 * The small vocabulary every route handler shares.
 *
 * Every response is `{ data, error }`; every failure logs the route and returns a generic
 * message rather than the exception; every admin write checks the session the same way.
 * Before this file those three things were copy-pasted into every handler, with the usual
 * drift — some `[id]` routes validated the id and some did not.
 *
 * Error strings that the UI needs to translate are *codes* (`STORE_HAS_PRODUCTS`), never
 * prose. `apiErrorMessage()` in `lib/i18n/labels.ts` turns them into the user's language.
 */

export type ApiBody<T> = { data: T; error: null } | { data: null; error: string };

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiBody<T>> {
  return NextResponse.json({ data, error: null }, init);
}

export function fail(error: string, status: number, init?: ResponseInit): NextResponse<ApiBody<never>> {
  return NextResponse.json({ data: null, error }, { ...init, status });
}

/** Codes the client translates. Keep in sync with `apiErrors` in `lib/i18n/*.ts`. */
export const API_ERRORS = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_ID: 'INVALID_ID',
  NOT_FOUND: 'NOT_FOUND',
  CATEGORY_HAS_PRODUCTS: 'CATEGORY_HAS_PRODUCTS',
  /** A category with subcategories: they are moved or deleted first. */
  CATEGORY_HAS_CHILDREN: 'CATEGORY_HAS_CHILDREN',
  /** A category cannot sit under itself or anything under it. */
  CATEGORY_CYCLE: 'CATEGORY_CYCLE',
  /** The tree is three levels deep at most, the moved category's own subtree included. */
  CATEGORY_TOO_DEEP: 'CATEGORY_TOO_DEEP',
  /** The parent chosen for a category does not exist. */
  UNKNOWN_PARENT: 'UNKNOWN_PARENT',
  /** Another category or studio room already has this slug. */
  SLUG_EXISTS: 'SLUG_EXISTS',
  /** A new order for a list that has changed since the page was loaded: reload and try again. */
  STALE_ORDER: 'STALE_ORDER',
  STORE_HAS_PRODUCTS: 'STORE_HAS_PRODUCTS',
  CANNOT_CHANGE_OWN_ROLE: 'CANNOT_CHANGE_OWN_ROLE',
  CANNOT_DELETE_SELF: 'CANNOT_DELETE_SELF',
  RATE_KEY_EXISTS: 'RATE_KEY_EXISTS',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  FORBIDDEN: 'FORBIDDEN',
  PROJECT_ALREADY_ORDERED: 'PROJECT_ALREADY_ORDERED',
  PARTNER_NOT_LINKED: 'PARTNER_NOT_LINKED',
  ORDER_CLOSED: 'ORDER_CLOSED',
  MODEL_INVALID: 'MODEL_INVALID',
  MODEL_TOO_LARGE: 'MODEL_TOO_LARGE',
  MODEL_UNSUPPORTED_COMPRESSION: 'MODEL_UNSUPPORTED_COMPRESSION',
  STORE_NAME_EXISTS: 'STORE_NAME_EXISTS',
  PROJECT_HAS_ORDERS: 'PROJECT_HAS_ORDERS',
  OWN_MODEL_KIND: 'OWN_MODEL_KIND',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  /** A store / worker / team account needs the store, worker or brigade it speaks for. */
  PARTNER_LINK_REQUIRED: 'PARTNER_LINK_REQUIRED',
  CANNOT_DEACTIVATE_SELF: 'CANNOT_DEACTIVATE_SELF',
  /** The platform has already confirmed this order and sent it on. */
  ORDER_ALREADY_SENT: 'ORDER_ALREADY_SENT',
  /** A partner may move an order only along its own steps (`partnerNextStatuses`). */
  ORDER_STATUS_NOT_ALLOWED: 'ORDER_STATUS_NOT_ALLOWED',
  /** Lines, prices and delivery are the platform's to change, not the partner's. */
  ORDER_LINES_LOCKED: 'ORDER_LINES_LOCKED',
  /** Every line is struck out: there is nothing to send — cancel the order instead. */
  ORDER_EMPTY: 'ORDER_EMPTY',
  /** A guest's order needs a name; a signed-in person's comes from the account. */
  NAME_REQUIRED: 'NAME_REQUIRED',
  /** No phone given and none on the profile. */
  PHONE_REQUIRED: 'PHONE_REQUIRED',
  /** A store has to deliver somewhere: no address given and none on the profile. */
  ADDRESS_REQUIRED: 'ADDRESS_REQUIRED',
  /** A half with no floor area has no fee to pay: the rooms are drawn first. */
  NOTHING_TO_PAY: 'NOTHING_TO_PAY',
} as const;

export type ApiErrorCode = (typeof API_ERRORS)[keyof typeof API_ERRORS];

/** The current session when it belongs to an admin, otherwise a ready 401. */
export async function requireAdmin() {
  const session = await auth();
  if (!session || session.user?.role !== 'admin') {
    return { session: null, response: fail(API_ERRORS.UNAUTHORIZED, 401) };
  }
  return { session, response: null };
}

/**
 * Admin, or an agent whose job covers this part of the admin (`lib/auth/roles`). Everything
 * the platform's own people do goes through here, so a route says which section it belongs
 * to rather than naming the roles that may reach it.
 */
export async function requireStaff(section: AdminSection) {
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, response: fail(API_ERRORS.UNAUTHORIZED, 401) };
  }
  if (!canAdmin(session.user.role, section)) {
    return { session: null, response: fail(API_ERRORS.FORBIDDEN, 403) };
  }
  return { session, response: null };
}

/** Any signed-in session, otherwise a ready 401. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, response: fail(API_ERRORS.UNAUTHORIZED, 401) };
  }
  return { session, response: null };
}

/**
 * A partner account (`store` / `worker`) with the store or worker it is bound to, or admin,
 * who may act on any order. A partner role with no link is a misconfigured account and gets
 * a 403 that names the problem rather than an empty portal.
 */
export async function requirePartner() {
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, response: fail(API_ERRORS.UNAUTHORIZED, 401) };
  }
  const { role, storeId, workerId, teamId } = session.user;
  // An orders agent works every order, so the portal's routes admit them too.
  if (role === 'admin' || role === 'agent_orders') return { session, response: null };
  if (!isPartnerRole(role)) {
    return { session: null, response: fail(API_ERRORS.FORBIDDEN, 403) };
  }
  const link = { store: storeId, worker: workerId, team: teamId }[role];
  if (!link) {
    return { session: null, response: fail(API_ERRORS.PARTNER_NOT_LINKED, 403) };
  }
  return { session, response: null };
}

/**
 * The people who may write products: staff whose job covers them (admin, catalogue agents) and
 * a store account linked to its store. A store may only touch its own products — the routes
 * decide per product with `canEditProduct` (`lib/api/productAccess`).
 */
export async function requireCatalogEditor() {
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, response: fail(API_ERRORS.UNAUTHORIZED, 401) };
  }
  if (canAdmin(session.user.role, 'products')) return { session, response: null };
  if (session.user.role === 'store' && session.user.storeId) return { session, response: null };
  if (session.user.role === 'store') return { session: null, response: fail(API_ERRORS.PARTNER_NOT_LINKED, 403) };
  return { session: null, response: fail(API_ERRORS.FORBIDDEN, 403) };
}

/** Admin or any linked partner: who may upload images and models. */
export async function requireUploader() {
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, response: fail(API_ERRORS.UNAUTHORIZED, 401) };
  }
  const { role, storeId, workerId, teamId } = session.user;
  if (canAdmin(role, 'products') || (role === 'store' && storeId) || (role === 'worker' && workerId) || (role === 'team' && teamId)) return { session, response: null };
  return { session: null, response: fail(API_ERRORS.FORBIDDEN, 403) };
}

/** A positive integer route parameter, or a ready 400. */
export function parseId(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { id: null, response: fail(API_ERRORS.INVALID_ID, 400) };
  }
  return { id, response: null };
}

/** What Next hands a route handler: params resolve asynchronously since Next 15. */
type IncomingContext = { params: Promise<Record<string, string>> | Record<string, string> };
type RouteContext = { params: Record<string, string> };
type RouteHandler<R extends Request> = (req: R, ctx: RouteContext) => Promise<Response>;

/**
 * Wraps a handler in the standard try/catch: the route label and the exception go to the
 * server log, the client gets a generic message and a 500. Handlers throw freely.
 */
export function handle<R extends Request = Request>(
  label: string,
  message: string,
  fn: RouteHandler<R>
): (req: R, ctx: IncomingContext) => Promise<Response> {
  return async (req, incoming) => {
    const started = Date.now();
    try {
      const ctx: RouteContext = { params: (await incoming.params) ?? {} };
      const response = await fn(req, ctx);
      log.info('request', { route: label, status: response.status, ms: Date.now() - started });
      return response;
    } catch (e) {
      log.error(`${label} failed`, { route: label, ms: Date.now() - started, err: e });
      return fail(message, 500);
    }
  };
}
