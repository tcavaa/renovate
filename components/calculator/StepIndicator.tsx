'use client';

import { StepStrip } from '@/components/flow/StepStrip';
import { useT } from '@/lib/i18n/client';

export type CalculatorStep = 1 | 2 | 3 | 4 | 5;

export const CALCULATOR_STEP_HREFS: Record<CalculatorStep, string> = {
  1: '/calculator',
  2: '/calculator/materials',
  3: '/calculator/catalog',
  4: '/calculator/furniture',
  5: '/calculator/summary',
};

export function StepIndicator({ current }: { current: CalculatorStep }) {
  const t = useT();
  const labels = [t.calculator.step1, t.calculator.step2, t.calculator.step3, t.calculator.step4, t.calculator.step5];
  return (
    <StepStrip
      current={current}
      steps={labels.map((label, i) => ({ num: i + 1, label, href: CALCULATOR_STEP_HREFS[(i + 1) as CalculatorStep] }))}
    />
  );
}
