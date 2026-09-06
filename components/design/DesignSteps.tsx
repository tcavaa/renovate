'use client';

import { StepStrip } from '@/components/flow/StepStrip';
import { useT } from '@/lib/i18n/client';
import type { StudioStep } from '@/store/designStore';

const HREFS: Record<StudioStep, string> = {
  1: '/design',
  2: '/design/plan',
  3: '/design/style',
  4: '/design/studio',
  5: '/design/summary',
};

/** The five-step studio journey; done steps are links back. */
export function DesignSteps({ current }: { current: StudioStep }) {
  const t = useT();
  const labels = [t.design.step1, t.design.step2, t.design.step3, t.design.step4, t.design.step5];
  return <StepStrip current={current} steps={labels.map((label, i) => ({ num: i + 1, label, href: HREFS[(i + 1) as StudioStep] }))} />;
}
