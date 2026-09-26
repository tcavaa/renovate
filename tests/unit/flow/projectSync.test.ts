import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the browser knows about each project's caches (`lib/flow/projectSync`), and the storage
 * under them (`lib/flow/storage`): unsaved work is never evicted and always wins; a clean
 * cache wins only while it is at the row's revision; a full localStorage makes room from the
 * clean caches opened longest ago, never the one being written, never unsaved work.
 */

const memory = new Map<string, string>();
/** Bytes allowed before a write throws, like a browser's quota; Infinity by default. */
let quota = Infinity;
const used = () => [...memory.values()].reduce((sum, v) => sum + v.length, 0);

let sync: typeof import('@/lib/flow/projectSync');
let storage: typeof import('@/lib/flow/storage');

beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const before = memory.get(key)?.length ?? 0;
      if (used() - before + value.length > quota) throw new DOMException('full', 'QuotaExceededError');
      memory.set(key, value);
    },
    removeItem: (key: string) => void memory.delete(key),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  });
  sync = await import('@/lib/flow/projectSync');
  storage = await import('@/lib/flow/storage');
});

beforeEach(() => {
  memory.clear();
  quota = Infinity;
});

describe('sync lines', () => {
  it('uses a cache that holds unsaved work, whatever the server has', () => {
    sync.markDirty('design', 1);
    expect(sync.cacheIsCurrent('design', 1, 3, 9)).toBe(true);
    expect(sync.cacheIsCurrent('design', 1, null, 9)).toBe(true);
  });

  it('uses a clean cache only while its own copy is at the row’s revision', () => {
    sync.markClean('calculator', 2);
    expect(sync.cacheIsCurrent('calculator', 2, 5, 5)).toBe(true);
    expect(sync.cacheIsCurrent('calculator', 2, 5, 6)).toBe(false);
    // A copy that names no revision (moved over from before projects) is never current.
    expect(sync.cacheIsCurrent('calculator', 2, null, 0)).toBe(false);
    expect(sync.cacheIsCurrent('calculator', 3, -1, 0)).toBe(false);
  });

  it('keeps one line per half, so the halves of a project never overwrite each other’s', () => {
    sync.markDirty('calculator', 4);
    sync.markClean('design', 4);
    expect(sync.isDirty('calculator', 4)).toBe(true);
    expect(sync.isDirty('design', 4)).toBe(false);
  });

  it('counts every write of a line as a use, so a project being worked on is never among the oldest', () => {
    memory.set('renovate-sync:design:5', JSON.stringify({ dirty: false, usedAt: 1 }));
    sync.markDirty('design', 5);
    expect(sync.syncInfo('design', 5)!.usedAt).toBeGreaterThan(1);
  });
});

describe('pruning', () => {
  const cache = (id: number, usedAt: number, dirty = false) => {
    memory.set(`renovate-calculator:${id}`, '{"state":{},"version":3}');
    memory.set(`renovate-sync:calculator:${id}`, JSON.stringify({ dirty, rev: 1, usedAt }));
  };

  it('keeps the four clean caches opened last, the open project, and every one holding unsaved work', () => {
    for (let id = 1; id <= 8; id++) cache(id, id * 1000);
    cache(9, 1, true);
    sync.pruneCaches(1);
    expect(sync.cachedProjectIds().sort((a, b) => a - b)).toEqual([1, 5, 6, 7, 8, 9]);
  });

  it('drops the caches of projects that are gone, unsaved work or not', () => {
    cache(1, 1000);
    cache(2, 2000, true);
    cache(3, 3000, true);
    sync.pruneCaches(null, [1, 3]);
    expect(sync.cachedProjectIds().sort()).toEqual([1, 3]);
  });

  it('never drops a project newer than the list — one made after the list was rendered (a hub restored by Back)', () => {
    cache(1, 1000);
    cache(9, 2000, true);
    cache(10, 3000);
    sync.pruneCaches(null, [1, 5]);
    expect(sync.cachedProjectIds().sort((a, b) => a - b)).toEqual([1, 9, 10]);
  });

  it('forgets a project whole', () => {
    cache(6, 1000);
    memory.set('renovate-design:6', '{}');
    memory.set('renovate-calculator-plan:6', '{}');
    memory.set('renovate-sync:design:6', '{}');
    sync.forgetProject(6);
    expect([...memory.keys()].filter((k) => k.endsWith(':6'))).toEqual([]);
  });
});

describe('a full localStorage', () => {
  it('makes room from the clean caches opened longest ago, and never throws', () => {
    memory.set('renovate-design:1', 'x'.repeat(400));
    memory.set('renovate-sync:design:1', JSON.stringify({ dirty: false, usedAt: 1 }));
    memory.set('renovate-design:2', 'y'.repeat(400));
    memory.set('renovate-sync:design:2', JSON.stringify({ dirty: true, usedAt: 0 }));
    memory.set('renovate-design:3', 'z'.repeat(400));
    memory.set('renovate-sync:design:3', JSON.stringify({ dirty: false, usedAt: 5 }));
    quota = used() + 100;
    storage.safeLocalStorage.setItem('renovate-design:4', 'w'.repeat(300));
    // Project 1 (clean, oldest) made the room; 2 holds unsaved work, 3 was not needed.
    expect(memory.has('renovate-design:1')).toBe(false);
    expect(memory.has('renovate-design:2')).toBe(true);
    expect(memory.has('renovate-design:3')).toBe(true);
    expect(memory.get('renovate-design:4')).toHaveLength(300);
  });

  it('gives up quietly when there is nothing clean left to forget', () => {
    memory.set('renovate-design:2', 'y'.repeat(400));
    memory.set('renovate-sync:design:2', JSON.stringify({ dirty: true, usedAt: 0 }));
    quota = used();
    expect(() => storage.safeLocalStorage.setItem('renovate-design:5', 'v'.repeat(50))).not.toThrow();
    expect(memory.has('renovate-design:5')).toBe(false);
    expect(memory.has('renovate-design:2')).toBe(true);
  });

  it('never forgets the project it is writing to make room for it', () => {
    memory.set('renovate-design:7', 'a'.repeat(400));
    memory.set('renovate-sync:design:7', JSON.stringify({ dirty: false, usedAt: 0 }));
    quota = used();
    storage.safeLocalStorage.setItem('renovate-calculator:7', 'b'.repeat(50));
    expect(memory.has('renovate-design:7')).toBe(true);
  });
});
