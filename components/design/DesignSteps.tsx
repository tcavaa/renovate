'use client';

import { StepStrip } from '@/components/flow/StepStrip';
import { useT } from '@/lib/i18n/client';
import type { StudioStep } from '@/store/designStore';

/**
 * Where each step lives. Steps 5 and 6 are the same studio page: the sixth opens it with the
 * finishes tool in hand.
 */
export const DESIGN_STEP_HREFS: Record<StudioStep, string> = {
  1: '/design',
  2: '/design/plan',
  3: '/design/technical',
  4: '/design/style',
  5: '/design/studio',
  6: '/design/studio?tool=finishes',
  7: '/design/summary',
  8: '/design/workers',
};

/** The eight-step journey; done steps are links back. */
export function DesignSteps({ current }: { current: StudioStep }) {
  const t = useT();
  const labels = [t.design.step1, t.design.step2, t.design.step3, t.design.step4, t.design.step5, t.design.step6, t.design.step7, t.design.step8];
  return <StepStrip current={current} steps={labels.map((label, i) => ({ num: i + 1, label, href: DESIGN_STEP_HREFS[(i + 1) as StudioStep] }))} />;
}
