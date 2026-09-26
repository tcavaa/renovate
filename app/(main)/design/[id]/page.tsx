'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useDesignStore } from '@/store/designStore';
import { useCalculatorStore } from '@/store/calculatorStore';
import { calculatorEntryHref } from '@/lib/calculator/steps';
import { useProjectId } from '@/components/projects/ProjectGate';
import { designResumeStep } from '@/lib/flow/resume';
import { handOffToDesign } from '@/lib/flow/openProject';
import { designStepHref } from '@/lib/design/steps';
import { useT } from '@/lib/i18n/client';

/**
 * `/design/<id>`: the way into a project's 3D design — from the hub, "my projects", a bookmark,
 * or the calculator's "see it in 3D" (`?from=calculator`).
 *
 * A project whose calculation has not been in 3D yet is carried in first: its rooms, its
 * drawing, its home state and its picks (`handOffToDesign`), landing on the style step with the
 * plan steps shut. Coming from the calculator's summary to a design that exists, the design is
 * kept and the calculator's picks are put into it in the studio. Otherwise the project opens on
 * the page that was open when it was left, or the nearest one that can still be shown.
 */
export default function DesignProjectEntry() {
  const t = useT();
  const router = useRouter();
  const projectId = useProjectId();
  const from = useSearchParams().get('from');
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const design = useDesignStore.getState();
    const calc = useCalculatorStore.getState();
    const noDesignYet = !design.plan;
    if (from === 'calculator' || noDesignYet) {
      const landing = handOffToDesign(projectId);
      if (landing === 'studio' || landing === 'style') {
        router.replace(designStepHref(projectId, landing === 'studio' ? 5 : 4));
        return;
      }
      // A calculation still on its first steps has nothing to carry into 3D yet: back to it.
      if (landing === null && noDesignYet && calc.projectId === projectId) {
        router.replace(calculatorEntryHref(projectId));
        return;
      }
    }
    const s = useDesignStore.getState();
    const step = designResumeStep({ at: s.at, step: s.step, generated: s.generated, planFromCalculator: s.planFromCalculator, modeChosen: s.modeChosen, homeState: s.homeState, mode: s.mode, roomCount: s.plan?.rooms.length ?? 0 });
    router.replace(designStepHref(projectId, step));
  }, [from, projectId, router]);

  return (
    <div className="container flex min-h-[50vh] items-center justify-center py-24 text-sm text-ink-muted" role="status" aria-live="polite">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {t.hub.opening}
    </div>
  );
}
