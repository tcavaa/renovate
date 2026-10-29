'use client';

import Link from 'next/link';
import { ArrowLeft, Eye } from 'lucide-react';
import { DesignSteps } from '@/components/design/DesignSteps';
import { ProjectViewer } from '@/components/projects/ProjectViewer';
import { useProjectId } from '@/components/projects/ProjectGate';
import { useT } from '@/lib/i18n/client';
import { designStepHref } from '@/lib/design/steps';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { formatM2 } from '@/lib/utils';
import type { DesignScene, ElectricalPoint, FloorPlan, SurfaceFinish } from '@/lib/design/types';

/**
 * The studio once the design has gone on to the brigade (`designStore.handedOver`): the flat to
 * look at, not to change — the plan with every point and the furnished flat in 3D, where the
 * radiators, sockets, switches and air conditioners ended up — as the brigade sees it
 * (`ProjectViewer`). Changes are made back on the budget step, which lets go of it.
 */
export function HandedOverStudio({ plan, scene, finishes, electrical }: { plan: FloorPlan; scene: Pick<DesignScene, 'styleId' | 'mode' | 'budgetGel' | 'items' | 'finishes' | 'electrical' | 'decor' | 'styleProfile'>; finishes: SurfaceFinish[]; electrical: ElectricalPoint[] }) {
  const t = useT();
  const projectId = useProjectId();
  return (
    <>
      <DesignSteps current={5} />
      <div className="container py-8 md:py-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-bg-surface px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-olive-soft text-olive">
              <Eye className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">{t.design.handedOverTitle}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{t.design.handedOverText}</p>
            </div>
          </div>
          <Link href={designStepHref(projectId, 7)} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-ink hover:border-ink">
            <ArrowLeft className="h-4 w-4" />
            {t.design.backToBudget}
          </Link>
        </div>
        <ProjectViewer plan={plan} scene={scene as DesignScene} finishes={finishes} electrical={electrical} title={t.design.step5} subtitle={formatM2(totalFloorAreaM2(plan))} floorPlanUrl={plan.imageUrl ?? null} />
      </div>
    </>
  );
}
