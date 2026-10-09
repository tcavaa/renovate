'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAutosave } from '@/hooks/useAutosave';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore } from '@/store/designStore';
import { saveCalculatorProject } from '@/lib/calculator/saveProject';
import { autosaveSignature, BOARD_SAVED, CALCULATOR_SAVED, pickFields } from '@/lib/flow/autosaveSignature';

/**
 * Keeps a project's calculation in its row as the person works — the home state, the rooms,
 * the drawing board (its fittings too), every pick and edit, and where the journey is — so it
 * reopens exactly as it was left. "Save" on the summary confirms it. What is watched is what
 * the save sends (`lib/flow/autosaveSignature`).
 */
export function CalculatorAutosave({ projectId }: { projectId: number }) {
  const calc = useCalculatorStore(useShallow((s) => pickFields(s, CALCULATOR_SAVED)));
  const board = useCalculatorPlanStore(useShallow((s) => pickFields(s, BOARD_SAVED)));
  const storeProjectId = useCalculatorStore((s) => s.projectId);
  const setSaveState = useCalculatorStore((s) => s.setSaveState);
  const loadSerial = useCalculatorStore((s) => s.loadSerial);
  const boardLoads = useCalculatorPlanStore((s) => s.loadSerial);

  const signature = useMemo(() => autosaveSignature({ ...calc, board }), [calc, board]);

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
