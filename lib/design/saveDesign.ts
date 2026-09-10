'use client';

/**
 * Writes the studio's current state to the server — the one place the design save is
 * assembled, so the summary's button, the autosave and a photo request all send the same
 * thing and all land in the same project row.
 *
 * Returns the project id and records it in both stores: the calculator's too, when the
 * design grew out of a calculation, so that a later calculator save updates the same row.
 */

import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';

export async function saveDesign(options: { draft: boolean; nameKa: string }): Promise<number> {
  const s = useDesignStore.getState();
  const calculator = useCalculatorStore.getState();
  if (!s.plan || s.plan.rooms.length === 0) throw new Error('no-plan');

  const res = await fetch('/api/design/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nameKa: options.nameKa,
      homeState: s.homeState ?? (s.mode === 'full' ? 'white_frame' : 'green_frame'),
      plan: s.plan,
      scene: s.scene(),
      floorPlanUrl: s.floorPlanUrl,
      // The calculation this design grew out of is written into the same row; when it was
      // never saved, its picks travel along so the row has both halves anyway.
      projectId: s.projectId ?? undefined,
      calculator:
        s.calculatorPicks && calculator.rooms.length > 0 && calculator.homeState
          ? { rooms: calculator.rooms, homeState: calculator.homeState, selectedProducts: calculator.selectedProducts, selectedFurniture: calculator.selectedFurniture }
          : undefined,
      draft: options.draft,
    }),
  });
  const json = (await res.json()) as { data: { id: number } | null; error: string | null };
  if (!res.ok || json.error || !json.data) throw new Error(json.error ?? 'save-failed');

  useDesignStore.getState().setProjectId(json.data.id);
  if (s.calculatorPicks) useCalculatorStore.getState().setProjectId(json.data.id);
  return json.data.id;
}
