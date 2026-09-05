import { describe, expect, it } from 'vitest';
import { clearFailures, isLockedOut, recordFailure } from '@/lib/auth/lockout';

describe('login lockout', () => {
  const now = 1_700_000_000_000;

  it('locks an account on the fifth failure within the window', () => {
    const email = `a-${Math.random()}@x.ge`;
    for (let i = 0; i < 4; i++) {
      expect(recordFailure(email, now + i * 1000)).toBe(false);
      expect(isLockedOut(email, now + i * 1000)).toBe(false);
    }
    expect(recordFailure(email, now + 5000)).toBe(true);
    expect(isLockedOut(email, now + 6000)).toBe(true);
  });

  it('is case- and whitespace-insensitive about the address', () => {
    const email = `b-${Math.random()}@x.ge`;
    for (let i = 0; i < 5; i++) recordFailure(`  ${email.toUpperCase()} `, now);
    expect(isLockedOut(email, now)).toBe(true);
  });

  it('expires the lock after fifteen minutes', () => {
    const email = `c-${Math.random()}@x.ge`;
    for (let i = 0; i < 5; i++) recordFailure(email, now);
    expect(isLockedOut(email, now + 14 * 60_000)).toBe(true);
    expect(isLockedOut(email, now + 16 * 60_000)).toBe(false);
  });

  it('forgets failures older than the window', () => {
    const email = `d-${Math.random()}@x.ge`;
    for (let i = 0; i < 4; i++) recordFailure(email, now);
    // A fifth failure well after the window opens a fresh count rather than locking.
    expect(recordFailure(email, now + 20 * 60_000)).toBe(false);
  });

  it('clears on a successful login', () => {
    const email = `e-${Math.random()}@x.ge`;
    for (let i = 0; i < 5; i++) recordFailure(email, now);
    clearFailures(email);
    expect(isLockedOut(email, now)).toBe(false);
  });
});
