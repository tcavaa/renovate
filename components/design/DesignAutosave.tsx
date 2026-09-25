'use client';

import { useMemo } from 'react';
import { useAutosave } from '@/hooks/useAutosave';
import { useDesignStore } from '@/store/designStore';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useWorkspace } from '@/store/workspace';
import { saveDesign } from '@/lib/design/saveDesign';
import { useT } from '@/lib/i18n/client';

/**
 * Keeps a signed-in user's design on the server as they work: every change to the plan,
 * the furniture, the finishes, the style or the mode lands in their project row a couple of
 * seconds later as a draft. Pressing "save" on the summary is what turns the draft into a
 * saved project; a draft can be deleted from the profile.
 */
export function DesignAutosave() {
  const t = useT();
  const plan = useDesignStore((s) => s.plan);
  const items = useDesignStore((s) => s.items);
  const finishes = useDesignStore((s) => s.finishes);
  const styleId = useDesignStore((s) => s.styleId);
  const mode = useDesignStore((s) => s.mode);
  const budgetGel = useDesignStore((s) => s.budgetGel);
  const homeState = useDesignStore((s) => s.homeState);
  const floorPlanUrl = useDesignStore((s) => s.floorPlanUrl);
  const calculatorPicks = useDesignStore((s) => s.calculatorPicks);
  const electrical = useDesignStore((s) => s.electrical);
  const versions = useDesignStore((s) => s.versions);
  const styleProfile = useDesignStore((s) => s.styleProfile);
  const projectId = useDesignStore((s) => s.projectId);
  const setSaveState = useDesignStore((s) => s.setSaveState);
  const calculatorRooms = useCalculatorStore((s) => s.rooms);
  const loadSerial = useDesignStore((s) => s.loadSerial);
  // How far the journey got is saved with it, so a draft reopens where it was left.
  const step = useDesignStore((s) => s.step);
  const generated = useDesignStore((s) => s.generated);
  const workspace = useWorkspace((w) => w.kind);

  const signature = useMemo(
    () => JSON.stringify({ plan, items, finishes, electrical, versions: versions.map((v) => v.id), styleProfile, styleId, mode, budgetGel, homeState, floorPlanUrl, calculatorPicks, projectId, calc: calculatorPicks ? calculatorRooms : null, step, generated }),
    [plan, items, finishes, electrical, versions, styleProfile, styleId, mode, budgetGel, homeState, floorPlanUrl, calculatorPicks, projectId, calculatorRooms, step, generated]
  );

  useAutosave({
    enabled: !!plan && plan.rooms.length > 0,
    signature,
    save: () => saveDesign({ draft: true, nameKa: `${t.design.title} — ${new Date().toLocaleDateString('ka-GE')}` }),
    onState: setSaveState,
    // A design just opened from the profile, or the other workspace just switched to, is not written back until it is changed.
    baselineKey: `${workspace}:${loadSerial}`,
  });
  return null;
}
