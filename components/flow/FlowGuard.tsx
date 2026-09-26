'use client';

/**
 * Where a step sends you when you should not be on it.
 *
 * Two rules, both about not losing work:
 *
 *  - **Resume.** The first step of a design that is under way hands on to where it was
 *    left rather than showing a blank sheet over the top of it (a project is opened at its
 *    entry, `/design/<id>`, which does the same for every step — `lib/flow/resume`).
 *  - **Lock.** Once the flat has been laid out in 3D, the steps that fed the layout are
 *    closed: the plan, the technical setup and the style all went into it, and going back to
 *    change one would mean generating again over a flat somebody has furnished by hand.
 *
 * Renders nothing; it only redirects.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore, type StudioStep } from '@/store/designStore';
import { designStepHref, designStepPosition, designStepOrder } from '@/lib/design/steps';
import { calculatorStepHref } from '@/lib/calculator/steps';
import type { CalculatorStep } from '@/components/calculator/StepIndicator';
import { useProjectId } from '@/components/projects/ProjectGate';

/** On a design step: resume from step 1, and keep the pre-generation steps shut. */
export function DesignFlowGuard({ step }: { step: StudioStep }) {
  const router = useRouter();
  const projectId = useProjectId();
  const plan = useDesignStore((s) => s.plan);
  const stored = useDesignStore((s) => s.step);
  const generated = useDesignStore((s) => s.generated);
  const homeState = useDesignStore((s) => s.homeState);
  const mode = useDesignStore((s) => s.mode);
  const planFromCalculator = useDesignStore((s) => s.planFromCalculator);
  const modeChosen = useDesignStore((s) => s.modeChosen);

  useEffect(() => {
    const drawn = (plan?.rooms.length ?? 0) > 0;
    // Everything before the studio is closed once the flat has been laid out — while it has
    // rooms: one emptied of every room is drawn again.
    if (generated && drawn && designStepPosition(step, homeState, mode) < designStepOrder(homeState, mode).indexOf(5) + 1) {
      router.replace(designStepHref(projectId, 5));
      return;
    }
    // A flat drawn in the calculator: its upload and its 2D board were the calculator's.
    if (planFromCalculator && (step === 1 || step === 2)) {
      const order = designStepOrder(homeState, mode);
      // Back to where the journey got to, or else the first step after the plan.
      router.replace(designStepHref(projectId, order.indexOf(stored) >= 2 ? stored : order[2]));
      return;
    }
    // Nothing after step 1 opens before step 1 has been answered.
    if (step > 1 && !generated && !modeChosen) {
      router.replace(designStepHref(projectId, 1));
      return;
    }
    // The first step of a journey already under way hands back to where it was left — but
    // never past the studio when the flat has not been laid out yet, whatever page happened
    // to be open last.
    const resume: StudioStep = !generated && stored >= 5 ? 4 : stored;
    if (step === 1 && drawn && resume > 1) router.replace(designStepHref(projectId, resume));
  }, [step, plan, stored, generated, planFromCalculator, modeChosen, homeState, mode, router, projectId]);

  return null;
}

/**
 * On the calculator's first two steps: keep both shut once the estimate exists. Step 1 (the
 * way in and the home state) and step 2 (the plan) are open to each other until "start the
 * calculation" is pressed; from then on either hands on to wherever the journey got to, and a
 * step 1 opened while the journey is further on hands on too.
 */
export function CalculatorFlowGuard({ step }: { step: CalculatorStep }) {
  const router = useRouter();
  const projectId = useProjectId();
  const rooms = useCalculatorStore((s) => s.rooms.length);
  const stored = useCalculatorStore((s) => s.step);
  const homeState = useCalculatorStore((s) => s.homeState);
  const calculated = useCalculatorStore((s) => s.calculated);

  useEffect(() => {
    if (step > 2 || rooms === 0 || !homeState) return;
    const onward = Math.max(stored, 3) as CalculatorStep;
    if (calculated) router.replace(calculatorStepHref(projectId, onward));
    else if (step === 1 && stored >= 3) router.replace(calculatorStepHref(projectId, onward));
  }, [step, rooms, stored, homeState, calculated, router, projectId]);

  return null;
}
