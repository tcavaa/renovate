import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rateLimits } from '@/lib/db/schema';

/**
 * The persistence behind the per-IP rate limits (`rateLimit.ts`) and the per-account login
 * lockout (`lib/auth/lockout.ts`): one row per key in `rate_limits`, shared by every server
 * instance. Each call is a single statement, so two requests at once cannot both slip through.
 * The decisions — windows, limits, locks — are made by the callers; this only counts.
 */

export interface WindowCount {
  /** Hits in the current window, this one included (never above the cap). */
  count: number;
  /** Hits in the window before it. */
  prevCount: number;
}

/**
 * One hit on `key` in the fixed window starting at `windowStart`. The row keeps the current
 * window's count and the previous one's, for the caller's sliding estimate: a row last touched
 * in the previous window carries its count over, an older one starts from nothing. The count
 * stops at `cap` (one over the limit), so a client hammering a refused endpoint is not punished
 * for longer than the window it overran.
 */
export async function bumpWindow(key: string, windowStart: Date, previousWindowStart: Date, cap: number): Promise<WindowCount> {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1, prevCount: 0 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        prevCount: sql`CASE WHEN ${rateLimits.windowStart} = ${windowStart} THEN ${rateLimits.prevCount} WHEN ${rateLimits.windowStart} = ${previousWindowStart} THEN ${rateLimits.count} ELSE 0 END`,
        count: sql`CASE WHEN ${rateLimits.windowStart} = ${windowStart} THEN LEAST(${rateLimits.count} + 1, ${cap}) ELSE 1 END`,
        windowStart,
      },
    })
    .returning({ count: rateLimits.count, prevCount: rateLimits.prevCount });
  return row;
}

/**
 * One failure on `key` within `windowMs` of the first failure counted: the count, after it. A
 * failure after the window starts a new count.
 */
export async function bumpFailures(key: string, now: Date, windowMs: number): Promise<number> {
  const since = new Date(now.getTime() - windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1, prevCount: 0 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStart} > ${since} THEN ${rateLimits.count} + 1 ELSE 1 END`,
        windowStart: sql`CASE WHEN ${rateLimits.windowStart} > ${since} THEN ${rateLimits.windowStart} ELSE ${now} END`,
      },
    })
    .returning({ count: rateLimits.count });
  return row.count;
}

/** Locks `key` until `until` and starts its count afresh. */
export async function lockKey(key: string, now: Date, until: Date): Promise<void> {
  await db.update(rateLimits).set({ lockedUntil: until, count: 0, windowStart: now }).where(eq(rateLimits.key, key));
}

/** When `key` is locked until, if it is. */
export async function lockedUntil(key: string): Promise<Date | null> {
  const [row] = await db.select({ lockedUntil: rateLimits.lockedUntil }).from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  return row?.lockedUntil ?? null;
}

export async function clearKey(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

/** The daily sweep (`/api/cron/cleanup`): rows whose window and lock are both long over. */
export async function sweepCounters(olderThan: Date): Promise<number> {
  const gone = await db
    .delete(rateLimits)
    .where(sql`${rateLimits.windowStart} < ${olderThan} AND (${rateLimits.lockedUntil} IS NULL OR ${rateLimits.lockedUntil} < ${olderThan})`)
    .returning({ key: rateLimits.key });
  return gone.length;
}
