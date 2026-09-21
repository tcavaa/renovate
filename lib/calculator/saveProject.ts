'use client';

/**
 * Writes the calculator's current state to the server — shared by the summary's button and
 * the autosave so both send the same payload into the same project row.
 */

import { useCalculatorStore } from '@/store/calculatorStore';

export async function saveCalculatorProject(options: { draft: boolean; nameKa: string }): Promise<number> {
  const s = useCalculatorStore.getState();
  if (!s.homeState || s.rooms.length === 0) throw new Error('not-ready');

  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      homeState: s.homeState,
      rooms: s.rooms,
      nameKa: options.nameKa,
      selectedProducts: s.selectedProducts,
      selectedFurniture: s.selectedFurniture,
      // What was ticked off the summary and the quantities changed on it. The estimate is
      // worked out again on the server; these are laid over it there as they are here.
      edits: { excluded: s.excluded, quantities: s.quantities },
      // A project opened from the profile, or one this session already saved, is written
      // into rather than duplicated.
      projectId: s.projectId ?? undefined,
      draft: options.draft,
    }),
  });
  const json = (await res.json()) as { data: { id: number } | null; error: string | null };
  if (!res.ok || json.error || !json.data) throw new Error(json.error ?? 'save-failed');
  useCalculatorStore.getState().setProjectId(json.data.id);
  return json.data.id;
}
