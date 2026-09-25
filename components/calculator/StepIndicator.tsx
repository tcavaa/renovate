'use client';

import { useEffect } from 'react';
import { StepStrip } from '@/components/flow/StepStrip';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useT } from '@/lib/i18n/client';
import type { CalculatorStepNumber } from '@/lib/calculator/types';

export type CalculatorStep = CalculatorStepNumber;

export const CALCULATOR_STEP_HREFS: Record<CalculatorStep, string> = {
  1: '/calculator',
  2: '/calculator/plan',
  3: '/calculator/materials',
  4: '/calculator/catalog',
  5: '/calculator/placement',
  6: '/calculator/furniture',
  7: '/calculator/summary',
};

export const CALCULATOR_STEPS = 7;

/**
 * The calculator's strip, which also remembers how far the journey got so coming back picks
 * up where it was left. Two things it is careful about:
 *
 *  - It only records a step the flow has really reached. Every page has a "finish the
 *    previous step first" state that renders the strip too, and recording there would send
 *    the resume straight back to a page that shows nothing.
 *  - It only ever records **forward**. The mark is how far the journey got, not which page
 *    happens to be open: walking back to change a product must not throw the rest away, and
 *    step 1 — which the guard bounces off the moment it loads — must not rewrite a 5 to a 1
 *    on its way out. The design flow records on its "next" buttons for the same reason.
 *
 * Steps 1 and 2 are shut once the estimate has been worked out — changing the home state or
 * redrawing the rooms would pull the ground out from under every quantity and every pick
 * made since.
 */
export function StepIndicator({ current }: { current: CalculatorStep }) {
  const t = useT();
  const ready = useCalculatorStore((s) => s.rooms.length > 0 && s.homeState != null);
  const stored = useCalculatorStore((s) => s.step);
  const calculated = useCalculatorStore((s) => s.calculated);
  const setStep = useCalculatorStore((s) => s.setStep);

  useEffect(() => {
    if (ready && current > stored) setStep(current);
  }, [ready, stored, current, setStep]);

  const labels = [t.calculator.step1, t.calculator.stepPlan, t.calculator.step2, t.calculator.step3, t.calculator.stepPlacement, t.calculator.step4, t.calculator.step5];
  return (
    <StepStrip
      current={current}
      reached={ready ? stored : 0}
      steps={labels.map((label, i) => ({ num: i + 1, label, href: CALCULATOR_STEP_HREFS[(i + 1) as CalculatorStep] }))}
      lockedBefore={calculated ? 3 : 0}
      lockedTitle={t.flow.lockedStepCalculator}
      kind="calculator"
    />
  );
}
