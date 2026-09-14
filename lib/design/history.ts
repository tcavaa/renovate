/**
 * Undo and redo as plain data: a stack of past snapshots and a stack of undone ones.
 *
 * The store pushes a snapshot of what matters (plan, furniture, finishes, electrical)
 * before each change; Ctrl+Z pops it back and parks the present on the redo stack, and any
 * new change clears the redo stack — the usual contract. Kept out of the store so it can be
 * tested on its own and never persisted (a page reload starts a fresh history).
 */

export interface History<T> {
  past: T[];
  future: T[];
}

export const HISTORY_LIMIT = 80;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** Records the present before it changes. */
export function pushHistory<T>(history: History<T>, snapshot: T, limit = HISTORY_LIMIT): History<T> {
  const past = [...history.past, snapshot];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, future: [] };
}

/** Steps back: the snapshot to restore, and the history after restoring it. */
export function undoHistory<T>(history: History<T>, present: T): { snapshot: T; history: History<T> } | null {
  if (history.past.length === 0) return null;
  const snapshot = history.past[history.past.length - 1];
  return { snapshot, history: { past: history.past.slice(0, -1), future: [present, ...history.future] } };
}

/** Steps forward again. */
export function redoHistory<T>(history: History<T>, present: T): { snapshot: T; history: History<T> } | null {
  if (history.future.length === 0) return null;
  const [snapshot, ...future] = history.future;
  return { snapshot, history: { past: [...history.past, present], future } };
}
