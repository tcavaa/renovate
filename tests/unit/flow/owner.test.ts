import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Whose work the browser holds (`lib/flow/owner`): another account's is forgotten, and signing out forgets nothing. */

const memory = new Map<string, string>();
const session = new Map<string, string>();
let owner: typeof import('@/lib/flow/owner');

const storageOf = (map: Map<string, string>) => ({
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => void map.set(key, value),
  removeItem: (key: string) => void map.delete(key),
  key: (i: number) => [...map.keys()][i] ?? null,
  get length() {
    return map.size;
  },
});

beforeAll(async () => {
  vi.stubGlobal('localStorage', storageOf(memory));
  vi.stubGlobal('sessionStorage', storageOf(session));
  owner = await import('@/lib/flow/owner');
});

beforeEach(() => {
  memory.clear();
  session.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', storageOf(memory));
  vi.stubGlobal('sessionStorage', storageOf(session));
});

describe('whose work the browser holds', () => {
  it('forgets another account’s projects when somebody else signs in', () => {
    memory.set('renovate-owner', 'user:1');
    memory.set('renovate-design:5', '{}');
    memory.set('renovate-sync:design:5', JSON.stringify({ dirty: true }));
    owner.claimBrowser(2);
    expect(memory.has('renovate-design:5')).toBe(false);
    expect(memory.get('renovate-owner')).toBe('user:2');
  });

  it('forgets nothing when nobody is signed in — not even for a moment', () => {
    memory.set('renovate-owner', 'user:4');
    memory.set('renovate-design:6', '{}');
    memory.set('renovate-sync:design:6', JSON.stringify({ dirty: true }));
    owner.releaseBrowser();
    expect(memory.has('renovate-design:6')).toBe(true);
    // …and the owner is still the account, so another one signing in forgets it.
    owner.claimBrowser(8);
    expect(memory.has('renovate-design:6')).toBe(false);
  });
});
