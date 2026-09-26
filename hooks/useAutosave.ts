'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { isDirty, markClean, markDirty, type ProjectHalf } from '@/lib/flow/projectSync';
import { problemOf, useSaveProblems } from '@/lib/flow/saveQueue';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** When the person last pressed a key, clicked or dropped something anywhere on the page. */
let lastInteraction = 0;
if (typeof window !== 'undefined') {
  for (const type of ['pointerdown', 'keydown', 'drop'] as const) {
    window.addEventListener(type, () => {
      lastInteraction = Date.now();
    }, { capture: true, passive: true });
  }
}

/**
 * Saves a project's work into its row as it is done.
 *
 * `signature` is a string that changes whenever there is something new to save; a burst of
 * edits settles for `delayMs` before one write goes out, and a signature that has been written
 * is never written twice. The writes of a half go out one after another in the save helpers
 * (`lib/flow/saveQueue`), so an older one never lands after a newer.
 *
 * Nothing is lost in between. The moment there is something to write, this half of the project
 * is marked dirty in the browser (`lib/flow/projectSync`), so a reload, a closed tab or a save
 * the server refused opens the project on this browser's copy — and writes it — instead of on
 * the server's older one; a write that lands while nothing newer is waiting marks it clean.
 * Leaving the project, hiding the tab or closing it sends whatever is waiting at once. A save
 * that does not go through is reported to the project's banner (`useSaveProblems`).
 *
 * `baselineKey` says when the work on screen was just *loaded* rather than made. Opening a
 * project to look at it must not rewrite it — the plan is re-derived and the estimate repriced
 * on the way in, which would otherwise count as an edit — so the first settled signature after a
 * load is taken as what is already saved, *provided* nobody has touched the page since and the
 * half holds no unsaved work: an edit in the first seconds, a calculation carried into 3D, work
 * left unsaved last time are all written.
 */
export function useAutosave({
  enabled,
  signature,
  save,
  onState,
  delayMs = 2500,
  baselineKey,
  projectId,
  half,
}: {
  enabled: boolean;
  signature: string;
  baselineKey?: string;
  save: () => Promise<unknown>;
  onState?: (state: SaveState) => void;
  delayMs?: number;
  projectId: number;
  half: ProjectHalf;
}) {
  const { status } = useSession();
  const lastSaved = useRef<string | null>(null);
  const latest = useRef(signature);
  /** A signature that is waiting for its timer. */
  const waiting = useRef<string | null>(null);
  /** Writes sent and not yet answered. */
  const inFlight = useRef(0);
  const saveRef = useRef(save);
  const onStateRef = useRef(onState);
  const baselineSeen = useRef<string | undefined>(baselineKey);
  const loadedAt = useRef(0);
  const pendingBaseline = useRef(true);
  // Effects run in the order they are declared: these two settle the baseline before the save
  // effect below sees the same render's signature.
  useEffect(() => {
    loadedAt.current = Date.now();
  }, []);
  useEffect(() => {
    if (baselineKey === baselineSeen.current) return;
    baselineSeen.current = baselineKey;
    pendingBaseline.current = true;
    loadedAt.current = Date.now();
  }, [baselineKey]);
  useEffect(() => {
    saveRef.current = save;
    onStateRef.current = onState;
    latest.current = signature;
  });

  /** A change the person made, or unsaved work: never taken as the baseline. */
  const mustWrite = useCallback(() => lastInteraction > loadedAt.current || isDirty(half, projectId), [half, projectId]);
  /** The project was deleted: there is nothing left to save into (the banner says so). */
  const gone = useCallback(() => useSaveProblems.getState().problems[`${half}:${projectId}`] === 'gone', [half, projectId]);

  const run = useCallback((sig: string) => {
    onStateRef.current?.('saving');
    inFlight.current += 1;
    return Promise.resolve()
      .then(() => saveRef.current())
      .then(() => {
        lastSaved.current = sig;
        onStateRef.current?.('saved');
        useSaveProblems.getState().report(half, projectId, null);
        // Clean only when nothing newer is waiting; a newer change keeps it dirty until written.
        if (latest.current === sig) markClean(half, projectId);
      })
      .catch((error: unknown) => {
        onStateRef.current?.('error');
        useSaveProblems.getState().report(half, projectId, problemOf(error));
      })
      .finally(() => {
        inFlight.current -= 1;
      });
  }, [half, projectId]);

  useEffect(() => {
    if (!enabled || gone()) return;
    if (signature === lastSaved.current) {
      // Back to what the server has (a step visited and left, a change undone): nothing is
      // waiting, and nothing is unsaved unless a write is still on its way.
      waiting.current = null;
      if (inFlight.current === 0 && !pendingBaseline.current) markClean(half, projectId);
      return;
    }
    // Unsaved from the moment it is made — also while the session cannot be read (it expired,
    // the network dropped): only the write needs one.
    if (!pendingBaseline.current || mustWrite()) markDirty(half, projectId);
    if (status !== 'authenticated') return;
    waiting.current = signature;
    const handle = window.setTimeout(() => {
      if (waiting.current === signature) waiting.current = null;
      if (signature === lastSaved.current) return;
      if (pendingBaseline.current) {
        pendingBaseline.current = false;
        if (!mustWrite()) {
          lastSaved.current = signature;
          return;
        }
      }
      void run(signature);
    }, delayMs);
    return () => window.clearTimeout(handle);
  }, [enabled, status, signature, delayMs, half, projectId, run, mustWrite, gone]);

  // Leaving the project, hiding the tab, closing it: what is waiting goes now — the state as it
  // is, which is what the save sends (a signature waited for may have been undone since).
  useEffect(() => {
    const flush = () => {
      const sig = latest.current;
      if (waiting.current == null || sig === lastSaved.current || gone()) return;
      if (pendingBaseline.current && !mustWrite()) return;
      waiting.current = null;
      pendingBaseline.current = false;
      void run(sig);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [run, mustWrite, gone]);
}
