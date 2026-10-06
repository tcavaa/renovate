'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAutosave } from '@/hooks/useAutosave';
import { useDesignStore } from '@/store/designStore';
import { saveDesign } from '@/lib/design/saveDesign';
import { autosaveSignature, DESIGN_SAVED, pickFields } from '@/lib/flow/autosaveSignature';

/**
 * Keeps a project's 3D design in its row as the person works: every change to the plan, the
 * furniture, the finishes, the style, the mode, the budget's ticks and quantities, the kept
 * versions and where the journey is lands there a couple of seconds later. Pressing "save" on
 * the summary marks the project saved. What is watched is what the save sends
 * (`lib/flow/autosaveSignature`).
 */
export function DesignAutosave({ projectId }: { projectId: number }) {
  const fields = useDesignStore(useShallow((s) => pickFields(s, DESIGN_SAVED)));
  const storeProjectId = useDesignStore((s) => s.projectId);
  const setSaveState = useDesignStore((s) => s.setSaveState);
  const loadSerial = useDesignStore((s) => s.loadSerial);

  const signature = useMemo(() => autosaveSignature(fields), [fields]);

  useAutosave({
    // Nothing to write before the project has a plan (a blank sheet counts).
    enabled: storeProjectId === projectId && !!fields.plan,
    signature,
    save: () => saveDesign({ draft: true, projectId }),
    onState: setSaveState,
    projectId,
    half: 'design',
    // A design just loaded from the server is not written back until it is changed.
    baselineKey: `${projectId}:${loadSerial}`,
  });
  return null;
}
