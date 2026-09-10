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
 */
export function useAutosave({
  enabled,
  signature,
  save,
  onState,
  delayMs = 2500,
}: {
  enabled: boolean;
  signature: string;
  save: () => Promise<unknown>;
  onState?: (state: SaveState) => void;
  delayMs?: number;
}) {
  const { status } = useSession();
  const lastSaved = useRef<string | null>(null);
  const inflight = useRef<Promise<unknown> | null>(null);
  const saveRef = useRef(save);
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
