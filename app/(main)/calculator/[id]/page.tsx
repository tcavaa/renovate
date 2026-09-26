'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore } from '@/store/designStore';
import { useProjectId } from '@/components/projects/ProjectGate';
import { calculatorResumeStep } from '@/lib/flow/resume';
import { calculatorStepHref } from '@/lib/calculator/steps';
import { useT } from '@/lib/i18n/client';

/**
 * `/calculator/<id>`: the way into a project's calculation — from the hub, "my projects", a
 * bookmark. It opens on the page that was open when the project was left, or the nearest one
 * that can still be shown (`lib/flow/resume`).
 */
export default function CalculatorProjectEntry() {
  const t = useT();
  const router = useRouter();
  const projectId = useProjectId();

  useEffect(() => {
    const calc = useCalculatorStore.getState();
    const board = useCalculatorPlanStore.getState();
    const step = calculatorResumeStep({ at: calc.at, step: calc.step, calculated: calc.calculated, homeState: calc.homeState, roomCount: calc.rooms.length, hasBoard: board.plan != null });
    router.replace(calculatorStepHref(projectId, step));
  }, [projectId, router]);

  return (
    <div className="container flex min-h-[50vh] items-center justify-center py-24 text-sm text-ink-muted" role="status" aria-live="polite">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {t.hub.opening}
    </div>
  );
}
