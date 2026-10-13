import { log } from '@/lib/log';
import { bumpFailures, clearKey, lockKey, lockedUntil } from '@/lib/api/counterStore';

/**
 * Per-account login lockout.
 *
 * The per-IP limiter in `lib/api/rateLimit.ts` slows one machine down; this slows one
 * *account* down however many machines try it. Five wrong passwords within fifteen minutes of
 * the first lock the address for fifteen minutes. Kept in Postgres (`rate_limits`, key
 * `login-fail:<address>`) like the rate limits, so every server instance sees the same count;
 * a database that cannot be asked locks nobody out (the sign-in needs it anyway).
 */

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const WINDOW_MS = 15 * 60_000;

const keyFor = (email: string) => `login-fail:${email.trim().toLowerCase()}`;

export async function isLockedOut(email: string, now = Date.now()): Promise<boolean> {
  try {
    const until = await lockedUntil(keyFor(email));
    return !!until && until.getTime() > now;
  } catch (e) {
    log.warn('login lockout not checked', { err: e });
    return false;
  }
}

/** Records a wrong password; returns true when this failure triggered a lock. */
export async function recordFailure(email: string, now = Date.now()): Promise<boolean> {
  try {
    const failures = await bumpFailures(keyFor(email), new Date(now), WINDOW_MS);
    if (failures < MAX_FAILURES) return false;
    await lockKey(keyFor(email), new Date(now), new Date(now + LOCK_MS));
    return true;
  } catch (e) {
    log.warn('login failure not recorded', { err: e });
    return false;
  }
}

export async function clearFailures(email: string): Promise<void> {
  try {
    await clearKey(keyFor(email));
  } catch (e) {
    log.warn('login failures not cleared', { err: e });
  }
}
