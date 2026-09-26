'use client';

import { useMemo } from 'react';
import { useAutosave } from '@/hooks/useAutosave';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore } from '@/store/designStore';
import { saveCalculatorProject } from '@/lib/calculator/saveProject';

/**
 * Keeps a project's calculation in its row as the person works — the home state, the rooms,
 * the drawing board, every pick and edit, and where the journey is — so it reopens exactly as
 * it was left. "Save" on the summary confirms it.
 */
export function CalculatorAutosave({ projectId }: { projectId: number }) {
  const rooms = useCalculatorStore((s) => s.rooms);
  const homeState = useCalculatorStore((s) => s.homeState);
  const selectedProducts = useCalculatorStore((s) => s.selectedProducts);
  const selectedFurniture = useCalculatorStore((s) => s.selectedFurniture);
  const storeProjectId = useCalculatorStore((s) => s.projectId);
  // A line ticked off the summary, or a quantity changed on it, is work like any other.
  const excluded = useCalculatorStore((s) => s.excluded);
  const quantities = useCalculatorStore((s) => s.quantities);
  const choices = useCalculatorStore((s) => s.choices);
  const setSaveState = useCalculatorStore((s) => s.setSaveState);
  const loadSerial = useCalculatorStore((s) => s.loadSerial);
  // How far the journey got, and the page open, are saved with it.
  const step = useCalculatorStore((s) => s.step);
  const calculated = useCalculatorStore((s) => s.calculated);
  const at = useCalculatorStore((s) => s.at);
  // The drawing board is part of the calculation.
  const boardPlan = useCalculatorPlanStore((s) => s.plan);
  const boardImage = useCalculatorPlanStore((s) => s.floorPlanUrl);
  const boardFinishes = useCalculatorPlanStore((s) => s.finishes);
  const boardLoads = useCalculatorPlanStore((s) => s.loadSerial);

  const signature = useMemo(
    () => JSON.stringify({ rooms, homeState, selectedProducts, selectedFurniture, excluded, quantities, choices, step, calculated, at, boardPlan, boardImage, boardFinishes }),
    [rooms, homeState, selectedProducts, selectedFurniture, excluded, quantities, choices, step, calculated, at, boardPlan, boardImage, boardFinishes]
  );

  useAutosave({
    enabled: storeProjectId === projectId,
    signature,
    save: () => saveCalculatorProject({ draft: true, projectId }),
    onState: setSaveState,
    projectId,
    half: 'calculator',
    // A calculation just loaded from the server is not written back until it is changed.
    baselineKey: `${projectId}:${loadSerial}:${boardLoads}`,
  });
  return null;
}
