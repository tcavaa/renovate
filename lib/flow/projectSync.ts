'use client';

/**
 * What the browser knows about each project's caches (`store/projectScope`), one line per half
 * of a project in localStorage (`renovate-sync:<half>:<id>`) so that tabs never write over each
 * other's lines:
 *
 *  - **dirty** — the cache holds work the server has not got yet: a change the autosave has
 *    seen and not written, or a write that failed. A dirty cache is always what the project
 *    opens on, and it is never evicted, so nothing typed is lost to a reload, a closed tab, a
 *    network outage or a save the server refused.
 *  - **usedAt** — when it was last opened or written, for evicting the clean caches nobody has
 *    opened for a while (they are only a copy of the server's).
 *
 * The half's revision on the server (`projects.calculator_rev` / `design_rev`) is *not* here:
 * it lives in the cached store itself (`baseRev`), beside the content it describes, so every tab
 * and every reload names the revision its own copy was made from — a line shared by every tab
 * would let a stale tab borrow another tab's newer revision and overwrite its save unchallenged.
 * A clean cache at the row's revision is opened as it is (it keeps its undo history); an older
 * one — the half was saved from another tab or computer since — gives way to the server's copy.
 *
 * A project has two halves with a cache each: `calculator` (the calculator and its drawing
 * board) and `design` (the studio).
 */

import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore, useDesignStore } from '@/store/designStore';
import { cleanProjectsOldestFirst, safeLocalStorage, storedProjectIds, SYNC_PREFIX } from '@/lib/flow/storage';

export type ProjectHalf = 'calculator' | 'design';

export interface SyncInfo {
  dirty: boolean;
  usedAt: number;
}

/** Clean caches kept besides the open project's; the rest are read from the server when opened. */
const KEEP_CLEAN = 4;

const lineKey = (half: ProjectHalf, id: number) => `${SYNC_PREFIX}:${half}:${id}`;

export function syncInfo(half: ProjectHalf, id: number): SyncInfo | null {
  try {
    const raw = safeLocalStorage.getItem(lineKey(half, id)) as string | null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncInfo>;
    return { dirty: parsed.dirty === true, usedAt: typeof parsed.usedAt === 'number' ? parsed.usedAt : 0 };
  } catch {
    return null;
  }
}

function update(half: ProjectHalf, id: number, patch: Partial<SyncInfo>): void {
  // Every write is a use: a project being opened, edited or saved is never among the oldest.
  const next: SyncInfo = { dirty: false, ...syncInfo(half, id), ...patch, usedAt: Date.now() };
  safeLocalStorage.setItem(lineKey(half, id), JSON.stringify(next));
}

export function isDirty(half: ProjectHalf, id: number): boolean {
  return syncInfo(half, id)?.dirty ?? false;
}

/** The cache holds work the server does not have yet. */
export function markDirty(half: ProjectHalf, id: number): void {
  if (isDirty(half, id)) return;
  update(half, id, { dirty: true });
}

/** The server holds everything the cache does — a load from the server, or a save nothing newer followed. */
export function markClean(half: ProjectHalf, id: number): void {
  update(half, id, { dirty: false });
}

export function touch(half: ProjectHalf, id: number): void {
  update(half, id, {});
}

/**
 * Should the project open on its cache rather than on the server's copy? Yes when the cache
 * holds unsaved work, or when the copy is at the row's revision (`cachedRev`, the cached store's
 * own `baseRev`); never when there is none.
 */
export function cacheIsCurrent(half: ProjectHalf, id: number, cachedRev: number | null, serverRev: number): boolean {
  if (syncInfo(half, id)?.dirty) return true;
  return cachedRev != null && cachedRev >= serverRev;
}

function storesOf(half: ProjectHalf) {
  return half === 'calculator' ? [useCalculatorStore, useCalculatorPlanStore] : [useDesignStore];
}

/** Forgets one half of a project in this browser: its caches, their stores in memory, and its line. */
export function forgetHalf(half: ProjectHalf, id: number): void {
  for (const store of storesOf(half)) store.drop(id);
  safeLocalStorage.removeItem(lineKey(half, id));
}

/** Forgets a project in this browser: its three caches, their stores in memory, and what is known about them. */
export function forgetProject(id: number): void {
  forgetHalf('calculator', id);
  forgetHalf('design', id);
}

/** Every project this browser holds anything of. */
export function cachedProjectIds(): number[] {
  return storedProjectIds();
}

/** Everything the projects left in this browser — on a change of account. */
export function forgetAllProjects(): void {
  for (const id of cachedProjectIds()) forgetProject(id);
}

/**
 * Keeps the caches from filling the browser: the clean caches of projects other than
 * `openId` are dropped beyond the few opened most recently. A dirty one is never dropped —
 * it holds work the server has not got. `knownIds` — *every* project the person has, when the
 * caller has the whole list — drops the caches of projects that no longer exist, dirty or
 * not: a deleted project has nowhere to be saved to.
 */
export function pruneCaches(openId: number | null, knownIds?: readonly number[]): void {
  if (knownIds) {
    const known = new Set(knownIds);
    // Ids are handed out in order, so one above every listed id was made after the list was —
    // a hub restored by the Back button from the router's cache, another tab — and is not gone.
    const newest = knownIds.reduce((m, id) => Math.max(m, id), 0);
    for (const id of cachedProjectIds()) if (id !== openId && id < newest && !known.has(id)) forgetProject(id);
  }
  const clean = cleanProjectsOldestFirst(openId);
  for (const id of clean.slice(0, Math.max(0, clean.length - KEEP_CLEAN))) forgetProject(id);
}
