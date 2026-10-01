/**
 * How many of the files the 3D view asked for are still on their way — the furniture's and the
 * fittings' models (`modelLoader`), the finishes' textures (`StyleMaterials`). The studio's
 * loading screen (`SceneLoading` in `Viewer3D`) waits on it, so the flat is shown once it is
 * all there rather than piece by piece as each file lands.
 *
 * Only a file's first load counts: a model or texture already in the cache is there at once.
 * Pure bookkeeping, no three.js; one count for the page, as the caches are one per page.
 */

export interface LoadProgress {
  /** Files asked for and not yet in (or failed). */
  pending: number;
  /** Every file asked for since the page loaded; `started - pending` of them are done. */
  started: number;
}

let progress: LoadProgress = { pending: 0, started: 0 };
const listeners = new Set<() => void>();
let notifying = false;

/** A scene build asks for dozens of files in one go: the listeners hear once, after it. */
function changed(next: LoadProgress): void {
  progress = next;
  if (notifying) return;
  notifying = true;
  queueMicrotask(() => {
    notifying = false;
    for (const listener of listeners) listener();
  });
}

/** Counts a file from now until `promise` settles, whichever way. Returns the promise. */
export function trackLoad<T>(promise: Promise<T>): Promise<T> {
  const done = loadStarted();
  promise.then(done, done);
  return promise;
}

/** Counts a file whose loader calls back rather than promising; call the result once it is in or has failed. */
export function loadStarted(): () => void {
  changed({ pending: progress.pending + 1, started: progress.started + 1 });
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    changed({ ...progress, pending: Math.max(0, progress.pending - 1) });
  };
}

export function loadProgress(): LoadProgress {
  return progress;
}

/** For `useSyncExternalStore`: the listener hears after every batch of changes. */
export function subscribeLoadProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
