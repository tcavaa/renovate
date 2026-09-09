'use client';

import { useMemo } from 'react';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { MaterialsTable, Figure } from '@/components/calculator/MaterialsTable';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useRateBook } from '@/hooks/useRateBook';
import { useCalculatorStore } from '@/store/calculatorStore';
import { calculateMaterials, calculateWorkerCosts, aggregateRoomTotals } from '@/lib/calculator/materials';
import { useT } from '@/lib/i18n/client';
import { formatM2L, homeStateLabel } from '@/lib/i18n/labels';

export default function MaterialsPage() {
  const t = useT();
  const { rooms, homeState } = useCalculatorStore();
  const { book } = useRateBook();
  const ready = !!homeState && rooms.length > 0;

  const { materials, workerCosts, totals } = useMemo(() => {
    if (!ready) return { materials: [], workerCosts: [], totals: null };
    return {
      materials: calculateMaterials(rooms, homeState, book),
      workerCosts: calculateWorkerCosts(rooms, homeState, book),
      totals: aggregateRoomTotals(rooms),
    };
  }, [rooms, homeState, ready, book]);

  if (!ready) {
    return (
      <>
        <StepIndicator current={2} />
        <EmptyStep message={homeState ? t.calculator.needRoomsFirst : t.calculator.needHomeStateFirst} back={t.common.back} />
      </>
    );
  }

  return (
    <>
      <StepIndicator current={2} />
      <div className="container py-10 md:py-14">
        <StepHeader
          step={2}
          total={5}
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

        <div className="mt-12">
          <MaterialsTable materials={materials} workerCosts={workerCosts} />
        </div>
      </div>

      <StepNav back={{ href: '/calculator', label: t.calculator.backButton }} next={{ href: '/calculator/catalog', label: t.calculator.nextButton }} />
    </>
  );
}
