import { describe, expect, it, vi } from 'vitest';

// The lockout's counters, in memory (`lib/api/counterStore.ts` holds them in Postgres).
vi.mock('@/lib/api/counterStore', async () => (await import('../../helpers/counterStore')).memoryCounterStore());

import { clearFailures, isLockedOut, recordFailure } from '@/lib/auth/lockout';

describe('login lockout', () => {
  const now = 1_700_000_000_000;

  it('locks an account on the fifth failure within the window', async () => {
    const email = `a-${Math.random()}@x.ge`;
    for (let i = 0; i < 4; i++) {
      expect(await recordFailure(email, now + i * 1000)).toBe(false);
      expect(await isLockedOut(email, now + i * 1000)).toBe(false);
    }
    expect(await recordFailure(email, now + 5000)).toBe(true);
    expect(await isLockedOut(email, now + 6000)).toBe(true);
  });

  it('is case- and whitespace-insensitive about the address', async () => {
    const email = `b-${Math.random()}@x.ge`;
    for (let i = 0; i < 5; i++) await recordFailure(`  ${email.toUpperCase()} `, now);
    expect(await isLockedOut(email, now)).toBe(true);
  });

  it('expires the lock after fifteen minutes', async () => {
    const email = `c-${Math.random()}@x.ge`;
    for (let i = 0; i < 5; i++) await recordFailure(email, now);
    expect(await isLockedOut(email, now + 14 * 60_000)).toBe(true);
    expect(await isLockedOut(email, now + 16 * 60_000)).toBe(false);
  });

  it('forgets failures older than the window', async () => {
    const email = `d-${Math.random()}@x.ge`;
    for (let i = 0; i < 4; i++) await recordFailure(email, now);
    // A fifth failure well after the window opens a fresh count rather than locking.
    expect(await recordFailure(email, now + 20 * 60_000)).toBe(false);
  });

  it('clears on a successful login', async () => {
    const email = `e-${Math.random()}@x.ge`;
    for (let i = 0; i < 5; i++) await recordFailure(email, now);
    await clearFailures(email);
    expect(await isLockedOut(email, now)).toBe(false);
  });
});
