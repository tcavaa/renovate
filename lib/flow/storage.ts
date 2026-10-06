/**
 * The browser storage the projects' caches live in (`store/projectScope`,
 * `lib/flow/projectSync`), and what happens when it is full.
 *
 * Every project keeps up to three caches (`renovate-calculator:<id>`,
 * `renovate-calculator-plan:<id>`, `renovate-design:<id>` — a design with its kept versions
 * runs to hundreds of kilobytes) and one line of bookkeeping per half
 * (`renovate-sync:<half>:<id>`). A full localStorage must never break the page: a store write
 * that does not fit first makes room by forgetting the caches that are only copies of the
 * server's — the ones opened longest ago first, never the project being written, never one
 * holding unsaved work — and when there is still no room, the store simply lives in memory:
 * the server copy, written by the autosave, stands.
 */

import type { StateStorage } from 'zustand/middleware';
import { useSaveProblems } from '@/lib/flow/saveQueue';

export const CACHE_PREFIXES = ['renovate-calculator', 'renovate-calculator-plan', 'renovate-design'] as const;
export const SYNC_PREFIX = 'renovate-sync';

const CACHE_KEY = /^(renovate-calculator|renovate-calculator-plan|renovate-design):(\d+)$/;
const SYNC_KEY = /^renovate-sync:(calculator|design):(\d+)$/;

/** The project a storage key belongs to, or null. */
export function projectOfKey(key: string): number | null {
  const match = CACHE_KEY.exec(key) ?? SYNC_KEY.exec(key);
  return match ? Number(match[2]) : null;
}

interface SyncLine {
  dirty?: boolean;
  usedAt?: number;
}

function keys(): string[] {
  try {
    const all: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) all.push(key);
    }
    return all;
  } catch {
    return [];
  }
}

/** Every project with a cache or a line of bookkeeping in this browser. */
export function storedProjectIds(): number[] {
  const ids = new Set<number>();
  for (const key of keys()) {
    const id = projectOfKey(key);
    if (id != null) ids.add(id);
  }
  return [...ids];
}

function syncLine(half: 'calculator' | 'design', id: number): SyncLine | null {
  try {
    const raw = localStorage.getItem(`${SYNC_PREFIX}:${half}:${id}`);
    return raw ? (JSON.parse(raw) as SyncLine) : null;
  } catch {
    return null;
  }
}

/** Removes a project's caches and bookkeeping from storage (not its stores in memory). */
export function removeStoredProject(id: number): void {
  for (const prefix of CACHE_PREFIXES) safeLocalStorage.removeItem(`${prefix}:${id}`);
  for (const half of ['calculator', 'design'] as const) safeLocalStorage.removeItem(`${SYNC_PREFIX}:${half}:${id}`);
}

/** The projects whose caches hold nothing unsaved, opened longest ago first. */
export function cleanProjectsOldestFirst(except: number | null): number[] {
  return storedProjectIds()
    .filter((id) => id !== except)
    .map((id) => ({ id, calc: syncLine('calculator', id), design: syncLine('design', id) }))
    .filter(({ calc, design }) => !calc?.dirty && !design?.dirty)
    .sort((a, b) => Math.max(a.calc?.usedAt ?? 0, a.design?.usedAt ?? 0) - Math.max(b.calc?.usedAt ?? 0, b.design?.usedAt ?? 0))
    .map(({ id }) => id);
}

/** The half a cache key holds (the calculator's board belongs to the calculation). */
function halfOfKey(key: string): 'calculator' | 'design' | null {
  const match = CACHE_KEY.exec(key);
  if (!match) return null;
  return match[1] === 'renovate-design' ? 'design' : 'calculator';
}

/**
 * Says whether a project's copy is kept in this browser: a cache write that found no room at all
 * puts `no-local-copy` on the project's banner — the work is then only in this tab until a save
 * goes through (it used to go without a word) — and one that fits takes it off again.
 */
function reportLocalCopy(key: string, kept: boolean): void {
  const half = halfOfKey(key);
  const id = projectOfKey(key);
  if (!half || id == null) return;
  const problems = useSaveProblems.getState();
  const current = problems.problems[`${half}:${id}`];
  if (!kept && !current) problems.report(half, id, 'no-local-copy');
  else if (kept && current === 'no-local-copy') problems.report(half, id, null);
}

/** localStorage that never throws: a write that does not fit makes room first, and otherwise is skipped. */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
      reportLocalCopy(name, true);
      return;
    } catch {
      // Full, most likely: make room below.
    }
    for (const id of cleanProjectsOldestFirst(projectOfKey(name))) {
      removeStoredProject(id);
      try {
        localStorage.setItem(name, value);
        reportLocalCopy(name, true);
        return;
      } catch {
        // Still no room: the next one.
      }
    }
    reportLocalCopy(name, false);
    // Nothing left to forget. The store lives in memory; the server's copy stands — and the
    // older copy this write was replacing goes, so the next opening is not taken in by it.
    try {
      localStorage.removeItem(name);
    } catch {
      // Nothing to remove.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Nothing to remove.
    }
  },
};
