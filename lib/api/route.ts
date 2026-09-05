import { NextResponse } from 'next/server';
import { auth } from '@/auth';

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
  STORE_HAS_PRODUCTS: 'STORE_HAS_PRODUCTS',
  CANNOT_CHANGE_OWN_ROLE: 'CANNOT_CHANGE_OWN_ROLE',
  CANNOT_DELETE_SELF: 'CANNOT_DELETE_SELF',
  RATE_KEY_EXISTS: 'RATE_KEY_EXISTS',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
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

/** A positive integer route parameter, or a ready 400. */
export function parseId(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { id: null, response: fail(API_ERRORS.INVALID_ID, 400) };
  }
  return { id, response: null };
}

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
): RouteHandler<R> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      console.error(label, e);
      return fail(message, 500);
    }
  };
}
