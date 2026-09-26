'use client';

import { StepStrip } from '@/components/flow/StepStrip';
import { useT } from '@/lib/i18n/client';
import { useDesignStore, type StudioStep } from '@/store/designStore';
import { designStepHref, designStepOrder } from '@/lib/design/steps';
import { useProjectId } from '@/components/projects/ProjectGate';

/**
 * The eight-step journey; done steps are links back. The order is the project's own — a
 * finished home records its technical setup early, a renovation plans it after the design
 * (`lib/design/steps`) — so a page says which step it *is* and the strip works out where
 * that falls.
 */
export function DesignSteps({ current }: { current: StudioStep }) {
  const t = useT();
  const projectId = useProjectId();
  const homeState = useDesignStore((s) => s.homeState);
  const mode = useDesignStore((s) => s.mode);
  // Laid out and still with rooms: one emptied of every room is drawn again (`FlowGuard`).
  const generated = useDesignStore((s) => s.generated && (s.plan?.rooms.length ?? 0) > 0);
  const stored = useDesignStore((s) => s.step);
  const planFromCalculator = useDesignStore((s) => s.planFromCalculator);
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
  // Once the flat has been laid out, everything that fed the layout is shut: the plan, the
  // technical setup and the style all went into it, and changing one of them under a flat
  // somebody has since furnished by hand would mean generating over their work.
  // A flat drawn in the calculator has its plan steps (1 and 2) done there: they are shut too.
  const lockedBefore = Math.max(generated ? order.indexOf(5) + 1 : 0, planFromCalculator ? order.indexOf(2) + 2 : 0);
  // Once the flat is laid out every step after the studio exists and is open; before that, as
  // far as the journey got.
  const reached = generated ? order.length : order.indexOf(stored) + 1;
  return <StepStrip current={order.indexOf(current) + 1} reached={reached} steps={order.map((step, i) => ({ num: i + 1, label: labels[step], href: designStepHref(projectId, step) }))} lockedBefore={lockedBefore} lockedTitle={generated ? undefined : t.flow.lockedStepPlan} />;
}
