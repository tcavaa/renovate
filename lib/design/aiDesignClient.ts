/**
 * The browser's side of the AI designer: whether it is there, and asking it for a flat. Every
 * failure answers null — the store then lays the flat out with the engine, as it always has.
 */

import type { AiProposal } from './aiProposal';
import type { FloorPlan, StyleId, StyleProfile } from './types';

/** Longest the studio waits for the designer before laying the flat out itself. */
export const AI_WAIT_MS = 240_000;

export async function aiDesignerEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/design/ai-generate', { cache: 'no-store' });
    const body = (await res.json()) as { data?: { enabled?: boolean } };
    return !!body.data?.enabled;
  } catch {
    return false;
  }
}

export async function requestAiDesign(input: { projectId: number; plan: FloorPlan; styleId: StyleId; styleProfile: StyleProfile | null; budgetGel: number | null; locale: 'ka' | 'en' | 'ru' }): Promise<AiProposal | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_WAIT_MS);
  try {
    const res = await fetch('/api/design/ai-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { proposal?: AiProposal } };
    return body.data?.proposal ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
