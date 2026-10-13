/**
 * `lib/api/counterStore.ts` in memory, with the same semantics as its SQL (one row per key: the
 * window's count capped, the previous window's carried over, a failure count anchored at its
 * first failure, a lock), for the tests of the rate limiter, the lockout and the routes they
 * front. `vi.mock('@/lib/api/counterStore', () => memoryCounterStore())`.
 */
interface CounterRow {
  windowStart: number;
  count: number;
  prevCount: number;
  lockedUntil: number | null;
}

export function memoryCounterStore() {
  const rows = new Map<string, CounterRow>();
  return {
    rows,
    async bumpWindow(key: string, windowStart: Date, previousWindowStart: Date, cap: number) {
      const ws = windowStart.getTime();
      const row = rows.get(key);
      if (!row) {
        rows.set(key, { windowStart: ws, count: 1, prevCount: 0, lockedUntil: null });
        return { count: 1, prevCount: 0 };
      }
      const prevCount = row.windowStart === ws ? row.prevCount : row.windowStart === previousWindowStart.getTime() ? row.count : 0;
      const count = row.windowStart === ws ? Math.min(row.count + 1, cap) : 1;
      Object.assign(row, { windowStart: ws, count, prevCount });
      return { count, prevCount };
    },
    async bumpFailures(key: string, now: Date, windowMs: number) {
      const t = now.getTime();
      const row = rows.get(key);
      if (!row) {
        rows.set(key, { windowStart: t, count: 1, prevCount: 0, lockedUntil: null });
        return 1;
      }
      const inWindow = row.windowStart > t - windowMs;
      row.count = inWindow ? row.count + 1 : 1;
      row.windowStart = inWindow ? row.windowStart : t;
      return row.count;
    },
    async lockKey(key: string, now: Date, until: Date) {
      const row = rows.get(key);
      if (row) Object.assign(row, { lockedUntil: until.getTime(), count: 0, windowStart: now.getTime() });
    },
    async lockedUntil(key: string) {
      const until = rows.get(key)?.lockedUntil;
      return until == null ? null : new Date(until);
    },
    async clearKey(key: string) {
      rows.delete(key);
    },
    async sweepCounters(olderThan: Date) {
      let n = 0;
      for (const [key, row] of rows) {
        if (row.windowStart < olderThan.getTime() && (row.lockedUntil == null || row.lockedUntil < olderThan.getTime())) {
          rows.delete(key);
          n++;
        }
      }
      return n;
    },
  };
}
