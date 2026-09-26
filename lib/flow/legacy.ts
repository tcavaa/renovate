'use client';

/**
 * Work kept in this browser from before every project had its own stores.
 *
 * Until September 2026 the calculator and the studio kept one journey each in fixed keys —
 * the person's own (`renovate-calculator`, `renovate-calculator-plan`, `renovate-design`) and
 * a project opened from the profile (`renovate-project-…`) — and a journey could exist
 * without a project row: a guest's, or one never saved. What is worth keeping is kept:
 *
 *  - A journey that belongs to a project was autosaved into its row as it went, so the row is
 *    the copy to open — an old browser copy cannot be ordered against it (every row started at
 *    revision 0), and taking one as current could write an old copy over newer work. The one
 *    thing the row never had is the calculator's **drawing board**: that alone is moved into the
 *    project's board key, where opening the project keeps it (and writes it) when the row has no
 *    board of its own and it is a drawing of the same rooms (`loadCalculatorHalf`).
 *  - A journey with no project is offered on the hub, to be kept as a new project — moved whole,
 *    and marked unsaved so the project opens on it and writes it — or let go.
 *
 * Nothing old is removed before its copy is safely written.
 */

import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore, useDesignStore } from '@/store/designStore';
import { markDirty, type ProjectHalf } from '@/lib/flow/projectSync';
import { cleanProjectsOldestFirst, projectOfKey, removeStoredProject } from '@/lib/flow/storage';

interface Persisted {
  state?: Record<string, unknown>;
  version?: number;
}

const FRESH: Record<ProjectHalf, { main: string; board?: string }> = {
  calculator: { main: 'renovate-calculator', board: 'renovate-calculator-plan' },
  design: { main: 'renovate-design' },
};
const OPENED: Record<ProjectHalf, { main: string; board?: string }> = {
  calculator: { main: 'renovate-project-calculator', board: 'renovate-project-calculator-plan' },
  design: { main: 'renovate-project-design' },
};

function read(key: string): Persisted | null {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Persisted) : null;
  } catch {
    return null;
  }
}

function exists(key: string): boolean {
  try {
    return localStorage.getItem(key) != null;
  } catch {
    return true;
  }
}

function remove(...keys: Array<string | undefined>): void {
  for (const key of keys) {
    if (!key) continue;
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  }
}

/** Writes one key, making room from the clean caches opened longest ago when it does not fit. */
function writeWithRoom(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Full, most likely: make room below.
  }
  for (const id of cleanProjectsOldestFirst(projectOfKey(key))) {
    removeStoredProject(id);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      // Still no room: the next one.
    }
  }
  return false;
}

/** Writes every key or none. */
function writeAll(entries: Array<[string, string]>): boolean {
  const written: string[] = [];
  for (const [key, value] of entries) {
    if (!writeWithRoom(key, value)) {
      remove(...written);
      return false;
    }
    written.push(key);
  }
  return true;
}

const asProject = (p: Persisted, id: number, extra: Record<string, unknown> = {}): string => JSON.stringify({ ...p, state: { ...(p.state ?? {}), projectId: id, ...extra } });

/** Is there anything in it worth keeping? */
function hasWork(half: ProjectHalf, main: Persisted | null, board: Persisted | null): boolean {
  const s = main?.state ?? {};
  if (half === 'calculator') {
    const rooms = Array.isArray(s.rooms) ? s.rooms.length : 0;
    const picks = s.selectedProducts && typeof s.selectedProducts === 'object' ? Object.keys(s.selectedProducts).length : 0;
    return rooms > 0 || picks > 0 || hasDrawing(board);
  }
  const plan = s.plan as { rooms?: unknown[]; walls?: unknown[] } | null | undefined;
  const items = Array.isArray(s.items) ? s.items.length : 0;
  return (plan?.rooms?.length ?? 0) > 0 || (plan?.walls?.length ?? 0) > 0 || items > 0;
}

/** A board with walls or rooms drawn on it (not the rectangles typed rooms become). */
function hasDrawing(board: Persisted | null): boolean {
  const plan = board?.state?.plan as { rooms?: unknown[]; walls?: unknown[]; source?: string } | null | undefined;
  return !!plan && plan.source !== 'calculator' && ((plan.rooms?.length ?? 0) > 0 || (plan.walls?.length ?? 0) > 0);
}

const projectOf = (main: Persisted | null): number | null => {
  const id = main?.state?.projectId;
  return typeof id === 'number' && id > 0 ? id : null;
};

/**
 * Deals with every old journey that belongs to a project (see the top of the file) and forgets
 * the old per-tab workspace switch. Run once the account is known (`claimBrowser`). Journeys
 * with no project are left for `legacyUnsavedWork`.
 */
export function migrateLegacyCaches(): void {
  // The person's own journey first: its board is the drawing they made; an opened copy's was
  // read off the project.
  for (const keys of [FRESH.calculator, OPENED.calculator]) {
    const main = read(keys.main);
    const board = keys.board ? read(keys.board) : null;
    const id = projectOf(main);
    if (main && id == null && keys === FRESH.calculator && hasWork('calculator', main, board)) continue;
    if (id != null && hasDrawing(board) && board && !exists(useCalculatorPlanStore.storageKey(id))) {
      // Kept only if it can be written; tried again next time otherwise.
      if (!writeAll([[useCalculatorPlanStore.storageKey(id), asProject(board, id)]])) continue;
    }
    remove(keys.main, keys.board);
  }
  for (const keys of [FRESH.design, OPENED.design]) {
    const main = read(keys.main);
    if (main && projectOf(main) == null && keys === FRESH.design && hasWork('design', main, null)) continue;
    remove(keys.main);
  }
  try {
    sessionStorage.removeItem('renovate-workspace');
  } catch {
    // Nothing to remove.
  }
}

/** Old work in this browser that belongs to no project, by half. */
export function legacyUnsavedWork(): Record<ProjectHalf, boolean> {
  const check = (half: ProjectHalf) => {
    const main = read(FRESH[half].main);
    if (!main) return false;
    const board = FRESH[half].board ? read(FRESH[half].board!) : null;
    return projectOf(main) == null && hasWork(half, main, board);
  };
  return { calculator: check('calculator'), design: check('design') };
}

/**
 * Keeps old work as a new project: the row is made (`POST /api/projects/create`), the work is
 * moved into its keys — at the new row's first revision, marked unsaved — and the project opens
 * on it and saves it. The old keys go only once the copy is written. Returns the new project's id.
 */
export async function adoptLegacyWork(half: ProjectHalf, name: string): Promise<number> {
  const keys = FRESH[half];
  const main = read(keys.main);
  if (!main) throw new Error('nothing-to-keep');
  const board = keys.board ? read(keys.board) : null;
  const res = await fetch('/api/projects/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, journey: half }),
  });
  const json = (await res.json().catch(() => null)) as { data: { id: number } | null; error: string | null } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error ?? 'create-failed');
  const id = json.data.id;
  const fresh = { baseRev: 0, pendingSaveId: null };
  const entries: Array<[string, string]> =
    half === 'calculator'
      ? [
          [useCalculatorStore.storageKey(id), asProject(main, id, fresh)],
          [useCalculatorPlanStore.storageKey(id), board ? asProject(board, id) : JSON.stringify({ state: { projectId: id, plan: null }, version: 2 })],
        ]
      : [[useDesignStore.storageKey(id), asProject(main, id, fresh)]];
  if (!writeAll(entries)) throw new Error('keep-failed');
  // Never saved anywhere: the project opens on it and writes it.
  markDirty(half, id);
  remove(keys.main, keys.board);
  return id;
}

/** Lets old work go. */
export function discardLegacyWork(half: ProjectHalf): void {
  remove(FRESH[half].main, FRESH[half].board);
}

/** Every old key, on a change of account. */
export function forgetLegacyCaches(): void {
  for (const half of ['calculator', 'design'] as const) {
    remove(FRESH[half].main, FRESH[half].board, OPENED[half].main, OPENED[half].board);
  }
  try {
    sessionStorage.removeItem('renovate-workspace');
  } catch {
    // Nothing to remove.
  }
}
