import { NextResponse } from 'next/server';

/**
 * Per-IP sliding-window rate limiter for the public write endpoints.
 *
 * In memory, on purpose: the app runs as a single PM2 process on one VPS, and the routes
 * this guards — registration, login, plan upload, the Claude call, project saves — are
 * low-volume. If the app ever runs as a cluster or on several hosts, swap the `hits` map
 * for Redis behind the same `rateLimit()` signature; nothing else needs to change.
 *
 * The map lives on `globalThis` so Fast Refresh in development does not reset it.
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
  /** Seconds until the oldest hit falls out of the window. Only meaningful when `ok` is false. */
  retryAfterSec: number;
}

type HitStore = Map<string, number[]>;

const globalForRate = globalThis as unknown as { __rateLimitHits?: HitStore; __rateLimitSweep?: number };
const hits: HitStore = globalForRate.__rateLimitHits ?? new Map();
globalForRate.__rateLimitHits = hits;

/** Keeps the map from growing without bound: drop every entry whose window has fully expired. */
function sweep(now: number, maxWindowMs: number): void {
  const last = globalForRate.__rateLimitSweep ?? 0;
  if (now - last < 60_000) return;
  globalForRate.__rateLimitSweep = now;
  for (const [key, stamps] of hits) {
    if (stamps.length === 0 || now - stamps[stamps.length - 1] > maxWindowMs) hits.delete(key);
  }
}

/**
 * The caller's IP as the reverse proxy reports it.
 *
 * Nginx sits in front of the app and sets `X-Forwarded-For`; the first entry is the client.
 * Without a proxy (local development) there is no reliable address, so every caller shares
 * one bucket — which is fine for a laptop and wrong for production, hence the proxy.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function rateLimit(req: Request, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  sweep(now, Math.max(rule.windowMs, 60 * 60_000));

  const bucket = `${rule.key}:${clientIp(req)}`;
  const since = now - rule.windowMs;
  const recent = (hits.get(bucket) ?? []).filter((t) => t > since);

  if (recent.length >= rule.limit) {
    hits.set(bucket, recent);
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + rule.windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSec };
  }

  recent.push(now);
  hits.set(bucket, recent);
  return { ok: true, remaining: rule.limit - recent.length, retryAfterSec: 0 };
}

/**
 * Convenience for route handlers: `null` when the request may proceed, otherwise a ready
 * 429 in the app's `{ data, error }` envelope with a `Retry-After` header.
 */
export function rateLimited(req: Request, rule: RateLimitRule): NextResponse | null {
  const result = rateLimit(req, rule);
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
  /** Guest floor-plan uploads: 12 MB each, so this also caps disk growth per IP. */
  uploadPlan: { key: 'upload-plan', limit: 10, windowMs: 60 * 60_000 },
  /** Each call spends Claude tokens. */
  parsePlan: { key: 'parse-plan', limit: 10, windowMs: 60 * 60_000 },
  /** Guest project saves insert rows. */
  saveProject: { key: 'save-project', limit: 20, windowMs: 60 * 60_000 },
  /** Password-reset and verification mails: each one is an e-mail somebody has to receive. */
  authMail: { key: 'auth-mail', limit: 5, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;
