/**
 * The browser's side of the AI designer: whether it is there, and asking it for a flat. Every
 * failure answers null — the store then lays the flat out with the engine, as it always has.
 */

import type { AiProposal } from './aiProposal';
import type { AiReview } from './aiReview';
import type { DecorPiece, FloorPlan, PlacedItem, StyleId, StyleProfile } from './types';

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

/** Longest the studio waits for the designer's check of the flat before opening it as laid out. */
export const AI_REVIEW_WAIT_MS = 150_000;

/** The designer's check of the flat just furnished (`lib/design/aiReview`); null on any failure — the flat stays as laid out. */
export async function requestAiReview(input: { projectId: number; plan: FloorPlan; items: PlacedItem[]; decor: DecorPiece[]; styleId: StyleId; locale: 'ka' | 'en' | 'ru' }): Promise<AiReview | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REVIEW_WAIT_MS);
  try {
    const items = input.items
      .filter((i) => i.product)
      .map((i) => ({ id: i.id, roomId: i.roomId, kind: i.kind, productId: i.product!.productId, position: i.position, rotation: i.rotation, elevationM: i.elevationM, size: i.size }));
    const res = await fetch('/api/design/ai-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: input.projectId, plan: input.plan, items, decor: input.decor, styleId: input.styleId, locale: input.locale }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { review?: AiReview } };
    return body.data?.review ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
