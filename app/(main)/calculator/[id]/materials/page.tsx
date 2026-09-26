'use client';

import { useMemo } from 'react';
import { CALCULATOR_STEPS, StepIndicator } from '@/components/calculator/StepIndicator';
import { MaterialsTable, Figure } from '@/components/calculator/MaterialsTable';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useRateBook } from '@/hooks/useRateBook';
import { useCalculatorStore } from '@/store/calculatorStore';
import { calculateMaterials, calculateWorkerCosts, aggregateRoomTotals } from '@/lib/calculator/materials';
import { CEILING_PHASE, FLOOR_PHASE, HOME_STATES } from '@/lib/calculator/constants';
import { WorkChoicesPicker } from '@/components/calculator/WorkChoicesPicker';
import { useT } from '@/lib/i18n/client';
import { formatM2L, homeStateLabel } from '@/lib/i18n/labels';
import { calculatorStepHref } from '@/lib/calculator/steps';
import { useProjectId } from '@/components/projects/ProjectGate';

export default function MaterialsPage() {
  const t = useT();
  const projectId = useProjectId();
  const { rooms, homeState, choices, setChoices } = useCalculatorStore();
  const { book } = useRateBook();
  const ready = !!homeState && rooms.length > 0;

  const { materials, workerCosts, totals } = useMemo(() => {
    if (!ready) return { materials: [], workerCosts: [], totals: null };
    return {
      materials: calculateMaterials(rooms, homeState, book, { choices }),
      workerCosts: calculateWorkerCosts(rooms, homeState, book, { choices }),
      totals: aggregateRoomTotals(rooms),
    };
  }, [rooms, homeState, ready, book, choices]);
  const phases = homeState ? HOME_STATES[homeState].includedPhases : [];

  if (!ready) {
    return (
      <>
        <StepIndicator current={3} />
        <EmptyStep
          message={homeState ? t.calculator.needRoomsFirst : t.calculator.needHomeStateFirst}
          back={t.common.back}
          href={calculatorStepHref(projectId, homeState ? 2 : 1)}
        />
      </>
    );
  }

  return (
    <>
      <StepIndicator current={3} />
      <div className="container py-10 md:py-14">
        <StepHeader
          step={3}
          total={CALCULATOR_STEPS}
          title={t.calculator.step2}
          subtitle={t.calculator.materialsSubtitle.replace('{m2}', totals ? formatM2L(t, totals.totalFloorM2) : '')}
          meta={homeState && <span>{homeStateLabel(t, homeState)}</span>}
        />

        {totals && (
          <div className="mt-8 grid border-t border-l border-line sm:grid-cols-2 lg:grid-cols-4">
            <Figure label={t.calculator.summaryFloor} value={formatM2L(t, totals.totalFloorM2)} />
            <Figure label={t.calculator.summaryWalls} value={formatM2L(t, totals.totalWallM2)} />
            <Figure label={t.calculator.summaryWetRooms} value={formatM2L(t, totals.totalWetRoomM2)} />
            <Figure label={t.calculator.summaryRooms} value={String(rooms.length)} />
          </div>
        )}

        {(phases.includes(FLOOR_PHASE) || phases.includes(CEILING_PHASE)) && (
          <section className="mt-10 border-t border-line pt-6">
            <h2 className="eyebrow mb-4">{t.calculator.choicesTitle}</h2>
            <WorkChoicesPicker value={choices} onChange={setChoices} floor={phases.includes(FLOOR_PHASE)} ceiling={phases.includes(CEILING_PHASE)} />
          </section>
        )}

        <div className="mt-12">
          <MaterialsTable materials={materials} workerCosts={workerCosts} />
        </div>
      </div>

      <StepNav back={{ href: calculatorStepHref(projectId, 2), label: t.calculator.backButton }} next={{ href: calculatorStepHref(projectId, 4), label: t.calculator.nextButton }} />
    </>
  );
}
