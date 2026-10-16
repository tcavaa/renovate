import { NextResponse } from 'next/server';
import { log } from '@/lib/log';
import { bumpWindow } from './counterStore';

/**
 * Per-IP rate limits for the public write endpoints, shared by every server instance.
 *
 * On Vercel a request lands on whichever function instance is free, and an instance lives
 * minutes, so a count kept in memory (one per instance) counted almost
 * nothing. The counts live in Postgres instead (`rate_limits`, `counterStore.ts`): one upsert per
 * limited request. Each key keeps its fixed window's count and the previous window's, and the
 * limit is held against the sliding estimate `previous × (time left in the window) + current` —
 * no burst of twice the limit across a window's edge, without a row per hit.
 *
 * If the database cannot be asked, the request goes through (and the failure is logged): a
 * limiter that is down must not take the endpoints it guards down with it.
 */

export interface RateLimitRule {
  /** Namespace, so a burst on one endpoint does not lock the same IP out of another. */
  key: string;
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the current window ends. Only meaningful when `ok` is false. */
  retryAfterSec: number;
}

/**
 * The caller's IP as the reverse proxy reports it.
 *
 * `X-Forwarded-For` is a list each proxy *appends* to, so only its last entry was written by a
 * proxy we run (Vercel's edge); everything before it is
 * whatever the client sent. The first entry was read once, and a script sending a new made-up
 * address with each request was never limited. Next itself fills the header with the socket's
 * address when no proxy did. Without a proxy (local development) every caller shares the
 * socket's bucket — fine for a laptop.
 *
 * On Vercel the edge replaces whatever `X-Forwarded-For` the client sent with the address it
 * saw, so the one entry there is the client's (docs/operations.md#rate-limits-and-the-client-address).
 * Behind another proxy in front of Vercel (Cloudflare's orange cloud) every caller would share
 * that proxy's address: read its own header (`cf-connecting-ip`) here first if one is ever added.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((hop) => hop.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Whether a hit counted at `now` on a window holding `count` (this one included) after `prevCount` is within `limit`. */
export function slidingDecision(count: number, prevCount: number, limit: number, windowMs: number, now: number): RateLimitResult {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const elapsed = (now - windowStart) / windowMs;
  const estimate = prevCount * (1 - elapsed) + count;
  if (estimate > limit) return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
  return { ok: true, remaining: Math.max(0, Math.floor(limit - estimate)), retryAfterSec: 0 };
}

export async function rateLimit(req: Request, rule: RateLimitRule, now = Date.now()): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  try {
    const { count, prevCount } = await bumpWindow(`${rule.key}:${clientIp(req)}`, new Date(windowStart), new Date(windowStart - rule.windowMs), rule.limit + 1);
    return slidingDecision(count, prevCount, rule.limit, rule.windowMs, now);
  } catch (e) {
    log.warn('rate limit not checked: the counter store failed', { rule: rule.key, err: e });
    return { ok: true, remaining: rule.limit, retryAfterSec: 0 };
  }
}

/**
 * Convenience for route handlers: `null` when the request may proceed, otherwise a ready
 * 429 in the app's `{ data, error }` envelope with a `Retry-After` header.
 */
export async function rateLimited(req: Request, rule: RateLimitRule): Promise<NextResponse | null> {
  const result = await rateLimit(req, rule);
  if (result.ok) return null;
  return NextResponse.json(
    { data: null, error: 'Too many requests — please try again later' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } }
  );
}

/** The rules in one place, so the numbers can be compared and tuned together. */
export const RATE_RULES = {
  /** Account creation: enough for a household, not for a script. */
  register: { key: 'register', limit: 5, windowMs: 60 * 60_000 },
  /** Password attempts against the credentials provider. */
  login: { key: 'login', limit: 10, windowMs: 15 * 60_000 },
  /** Floor plans (visitors may send them): 20 MB each, so this also caps storage growth per IP. */
  uploadPlan: { key: 'upload-plan', limit: 10, windowMs: 60 * 60_000 },
  /** Any direct upload granted (`POST /api/uploads`): each one is a staged file of up to 40 MB. */
  uploads: { key: 'uploads', limit: 120, windowMs: 60 * 60_000 },
  /** Each call spends Claude tokens. */
  parsePlan: { key: 'parse-plan', limit: 10, windowMs: 60 * 60_000 },
  /** An AI generation of a whole flat: tens of cents of Claude tokens each. */
  aiGenerate: { key: 'ai-generate', limit: 8, windowMs: 60 * 60_000 },
  /** A press of "save" (or an order, which saves first). */
  saveProject: { key: 'save-project', limit: 20, windowMs: 60 * 60_000 },
  /** "New project": each one is a row. */
  createProject: { key: 'create-project', limit: 30, windowMs: 60 * 60_000 },
  /** Autosave from a signed-in session: a debounced write per edit burst, so far more than a hand can click "save". */
  autosave: { key: 'autosave', limit: 400, windowMs: 60 * 60_000 },
  /** Studio photos: each one stores a screenshot. */
  render: { key: 'render', limit: 60, windowMs: 60 * 60_000 },
  /** Checkouts and bookings write rows and send partners mail. */
  checkout: { key: 'checkout', limit: 10, windowMs: 60 * 60_000 },
  /** A card payment started: each one is an order at Flitt. A declined card is tried again, so more than checkouts. */
  payment: { key: 'payment', limit: 30, windowMs: 60 * 60_000 },
  /** The payment dialogue's checks while a payment settles: each one may ask Flitt. Eight per payment, a few payments. */
  paymentStatus: { key: 'payment-status', limit: 120, windowMs: 10 * 60_000 },
  /** Flitt's callbacks come from two addresses; a burst past this is answered 429 and Flitt retries later. */
  paymentCallback: { key: 'payment-callback', limit: 600, windowMs: 10 * 60_000 },
  /** Password-reset and verification mails: each one is an e-mail somebody has to receive. */
  authMail: { key: 'auth-mail', limit: 5, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;
