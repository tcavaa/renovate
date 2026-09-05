'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { MaterialsTable } from '@/components/calculator/MaterialsTable';
import { useRateBook } from '@/hooks/useRateBook';
import { useCalculatorStore } from '@/store/calculatorStore';
import {
  calculateMaterials,
  calculateWorkerCosts,
  aggregateRoomTotals,
} from '@/lib/calculator/materials';
import { useT } from '@/lib/i18n/client';
import { formatM2L } from '@/lib/i18n/labels';

export default function MaterialsPage() {
  const ka = useT();
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
        <div className="container py-16">
          <Card className="mx-auto max-w-lg">
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <AlertCircle className="h-10 w-10 text-warning" />
              <p className="text-ink-muted">
                {homeState
                  ? ka.calculator.needRoomsFirst
                  : ka.calculator.needHomeStateFirst}
              </p>
              <Button asChild>
                <Link href="/calculator">{ka.common.back}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <StepIndicator current={2} />
      <div className="container py-10 space-y-8">
        <div>
          <h1 className="font-serif text-3xl font-bold">{ka.calculator.step2}</h1>
          <p className="mt-2 text-ink-muted">
            {ka.calculator.materialsSubtitle.replace(
              '{m2}',
              totals ? formatM2L(ka, totals.totalFloorM2) : ''
            )}
          </p>
        </div>

        {totals && (
          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryStat label={ka.calculator.summaryFloor} value={formatM2L(ka, totals.totalFloorM2)} />
            <SummaryStat label={ka.calculator.summaryWalls} value={formatM2L(ka, totals.totalWallM2)} />
            <SummaryStat label={ka.calculator.summaryWetRooms} value={formatM2L(ka, totals.totalWetRoomM2)} />
            <SummaryStat label={ka.calculator.summaryRooms} value={String(rooms.length)} />
          </div>
        )}

        <MaterialsTable materials={materials} workerCosts={workerCosts} />

        <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/calculator">
              <ArrowLeft className="h-4 w-4" />
              {ka.calculator.backButton}
            </Link>
          </Button>
          <Button size="xl" asChild>
            <Link href="/calculator/catalog">
              {ka.calculator.nextButton}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="mt-1 font-serif text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
