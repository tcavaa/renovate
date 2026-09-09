/**
 * Per-account login lockout.
 *
 * The per-IP limiter in `lib/api/rateLimit.ts` slows one machine down; this slows one
 * *account* down however many machines try it. Five wrong passwords lock the address for
 * fifteen minutes. In memory, like the rate limiter, and for the same reason — one process.
 */

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const WINDOW_MS = 15 * 60_000;

interface Record_ {
  failures: number[];
  lockedUntil: number;
}

const globalForLockout = globalThis as unknown as { __loginLockout?: Map<string, Record_> };
const store: Map<string, Record_> = globalForLockout.__loginLockout ?? new Map();
globalForLockout.__loginLockout = store;

const normalise = (email: string) => email.trim().toLowerCase();

export function isLockedOut(email: string, now = Date.now()): boolean {
  const record = store.get(normalise(email));
  return !!record && record.lockedUntil > now;
}

/** Records a wrong password; returns true when this failure triggered a lock. */
export function recordFailure(email: string, now = Date.now()): boolean {
  const key = normalise(email);
  const record = store.get(key) ?? { failures: [], lockedUntil: 0 };
  record.failures = record.failures.filter((t) => t > now - WINDOW_MS);
  record.failures.push(now);
  if (record.failures.length >= MAX_FAILURES) {
    record.lockedUntil = now + LOCK_MS;
    record.failures = [];
    store.set(key, record);
    return true;
  }
  store.set(key, record);
  return false;
}

export function clearFailures(email: string): void {
  store.delete(normalise(email));
}
