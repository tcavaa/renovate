'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Saves a signed-in user's work as they go.
 *
 * `signature` is a string that changes whenever there is something new to save; a burst of
 * edits settles for `delayMs` before one write goes out, a write already in flight is
 * waited for rather than raced, and a signature that has been written is never written
 * twice. Guests are never saved: there is nobody to own the row, and "log in to save" is
 * the deliberate path for them.
 *
 * `baselineKey` says when the work on screen was just *loaded* rather than made — a project
 * opened from the profile, a switch between the person's own work and an opened project.
 * The first settled signature after it changes is taken as what is already saved and not
 * written: opening a project to look at it must not rewrite it (the plan is re-derived and
 * the estimate repriced on the way in, which would otherwise count as an edit). The first
 * real change after that is saved as usual.
 */
export function useAutosave({
  enabled,
  signature,
  save,
  onState,
  delayMs = 2500,
  baselineKey,
}: {
  enabled: boolean;
  signature: string;
  baselineKey?: string;
  save: () => Promise<unknown>;
  onState?: (state: SaveState) => void;
  delayMs?: number;
}) {
  const { status } = useSession();
  const lastSaved = useRef<string | null>(null);
  const inflight = useRef<Promise<unknown> | null>(null);
  const saveRef = useRef(save);
  const baselineSeen = useRef<string | undefined>(baselineKey);
  // In an opened project a page load is a load too: what comes up is what the server has.
  const pendingBaseline = useRef(baselineKey?.startsWith('project:') ?? false);
  if (baselineKey !== baselineSeen.current) {
    baselineSeen.current = baselineKey;
    pendingBaseline.current = true;
  }
  const onStateRef = useRef(onState);
  useEffect(() => {
    saveRef.current = save;
    onStateRef.current = onState;
  });

  useEffect(() => {
    if (!enabled || status !== 'authenticated') return;
    if (signature === lastSaved.current) return;
    const handle = window.setTimeout(async () => {
      if (inflight.current) await inflight.current.catch(() => undefined);
      // The world may have moved on while we waited; the effect for the newer signature
      // has its own timer, so let that one do the writing.
      if (signature === lastSaved.current) return;
      if (pendingBaseline.current) {
        pendingBaseline.current = false;
        lastSaved.current = signature;
        return;
      }
      onStateRef.current?.('saving');
      const run = saveRef.current()
        .then(() => {
          lastSaved.current = signature;
          onStateRef.current?.('saved');
        })
        .catch(() => onStateRef.current?.('error'))
        .finally(() => {
          if (inflight.current === run) inflight.current = null;
        });
      inflight.current = run;
    }, delayMs);
    return () => window.clearTimeout(handle);
  }, [enabled, status, signature, delayMs]);
}
