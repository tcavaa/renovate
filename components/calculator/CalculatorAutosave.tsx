'use client';

import { useMemo } from 'react';
import { useAutosave } from '@/hooks/useAutosave';
import { useCalculatorStore } from '@/store/calculatorStore';
import { saveCalculatorProject } from '@/lib/calculator/saveProject';
import { useT } from '@/lib/i18n/client';

/**
 * Keeps a signed-in user's calculation on the server as they work — rooms, home state and
 * every pick — as a draft in their project row. "Save" on the summary confirms it.
 */
export function CalculatorAutosave() {
  const t = useT();
  const rooms = useCalculatorStore((s) => s.rooms);
  const homeState = useCalculatorStore((s) => s.homeState);
  const selectedProducts = useCalculatorStore((s) => s.selectedProducts);
  const selectedFurniture = useCalculatorStore((s) => s.selectedFurniture);
  const projectId = useCalculatorStore((s) => s.projectId);
  // A line ticked off the summary, or a quantity changed on it, is work like any other.
  const excluded = useCalculatorStore((s) => s.excluded);
  const quantities = useCalculatorStore((s) => s.quantities);
  const setSaveState = useCalculatorStore((s) => s.setSaveState);

  const signature = useMemo(
    () => JSON.stringify({ rooms, homeState, selectedProducts, selectedFurniture, projectId, excluded, quantities }),
    [rooms, homeState, selectedProducts, selectedFurniture, projectId, excluded, quantities]
  );

  useAutosave({
    enabled: !!homeState && rooms.length > 0,
    signature,
    save: () => saveCalculatorProject({ draft: true, nameKa: t.calculator.projectName }),
    onState: setSaveState,
  });
  return null;
}
