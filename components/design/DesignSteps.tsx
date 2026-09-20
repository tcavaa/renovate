'use client';

import { StepStrip } from '@/components/flow/StepStrip';
import { useT } from '@/lib/i18n/client';
import { useDesignStore, type StudioStep } from '@/store/designStore';
import { DESIGN_STEP_HREFS, designStepOrder } from '@/lib/design/steps';

export { DESIGN_STEP_HREFS };

/**
 * The eight-step journey; done steps are links back. The order is the project's own — a
 * finished home records its technical setup early, a renovation plans it after the design
 * (`lib/design/steps`) — so a page says which step it *is* and the strip works out where
 * that falls.
 */
export function DesignSteps({ current }: { current: StudioStep }) {
  const t = useT();
  const homeState = useDesignStore((s) => s.homeState);
  const mode = useDesignStore((s) => s.mode);
  const labels: Record<StudioStep, string> = {
    1: t.design.step1,
    2: t.design.step2,
    3: t.design.step3,
    4: t.design.step4,
    5: t.design.step5,
    6: t.design.step6,
    7: t.design.step7,
    8: t.design.step8,
  };
  const order = designStepOrder(homeState, mode);
  return <StepStrip current={order.indexOf(current) + 1} steps={order.map((step, i) => ({ num: i + 1, label: labels[step], href: DESIGN_STEP_HREFS[step] }))} />;
}
