'use client';

import { useMemo } from 'react';
import { useAutosave } from '@/hooks/useAutosave';
import { useDesignStore } from '@/store/designStore';
import { saveDesign } from '@/lib/design/saveDesign';

/**
 * Keeps a project's 3D design in its row as the person works: every change to the plan, the
 * furniture, the finishes, the style, the mode, the budget's ticks and quantities, the kept
 * versions and where the journey is lands there a couple of seconds later. Pressing "save" on
 * the summary marks the project saved.
 */
export function DesignAutosave({ projectId }: { projectId: number }) {
  const plan = useDesignStore((s) => s.plan);
  const items = useDesignStore((s) => s.items);
  const finishes = useDesignStore((s) => s.finishes);
  const styleId = useDesignStore((s) => s.styleId);
  const mode = useDesignStore((s) => s.mode);
  const modeChosen = useDesignStore((s) => s.modeChosen);
  const emptyStart = useDesignStore((s) => s.emptyStart);
  const budgetGel = useDesignStore((s) => s.budgetGel);
  const homeState = useDesignStore((s) => s.homeState);
  const floorPlanUrl = useDesignStore((s) => s.floorPlanUrl);
  const electrical = useDesignStore((s) => s.electrical);
  const versions = useDesignStore((s) => s.versions);
  const styleProfile = useDesignStore((s) => s.styleProfile);
  const excluded = useDesignStore((s) => s.excluded);
  const quantities = useDesignStore((s) => s.quantities);
  const storeProjectId = useDesignStore((s) => s.projectId);
  const setSaveState = useDesignStore((s) => s.setSaveState);
  const loadSerial = useDesignStore((s) => s.loadSerial);
  // How far the journey got, and the page open, are saved with it.
  const step = useDesignStore((s) => s.step);
  const at = useDesignStore((s) => s.at);
  const generated = useDesignStore((s) => s.generated);
  const planFromCalculator = useDesignStore((s) => s.planFromCalculator);

  const signature = useMemo(
    () =>
      JSON.stringify({
        plan,
        items,
        finishes,
        electrical,
        versions: versions.map((v) => [v.id, v.name]),
        styleProfile,
        styleId,
        mode,
        modeChosen,
        emptyStart,
        budgetGel,
        homeState,
        floorPlanUrl,
        excluded,
        quantities,
        step,
        at,
        generated,
        planFromCalculator,
      }),
    [plan, items, finishes, electrical, versions, styleProfile, styleId, mode, modeChosen, emptyStart, budgetGel, homeState, floorPlanUrl, excluded, quantities, step, at, generated, planFromCalculator]
  );

  useAutosave({
    // Nothing to write before the project has a plan (a blank sheet counts).
    enabled: storeProjectId === projectId && !!plan,
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
