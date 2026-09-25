'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { CALCULATOR_STEPS, StepIndicator } from '@/components/calculator/StepIndicator';
import { CalculatorFlowGuard } from '@/components/flow/FlowGuard';
import { PlanWorkspace } from '@/components/plan/PlanWorkspace';
import { RoomsPanel } from '@/components/plan/RoomsPanel';
import { ElementInspector } from '@/components/plan/ElementInspector';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore } from '@/store/designStore';
import { useCalculatorPlan } from '@/hooks/useCalculatorPlan';
import { useT } from '@/lib/i18n/client';

/**
 * Step 2 of the calculator: the plan on the board. An uploaded plan is checked here —
 * walls, doors, windows, the rooms' types and sizes — and a blank sheet is drawn on, with
 * the same tools the studio has. "Start the calculation" leaves from here, once there are
 * rooms to calculate, and shuts this step and the one before it behind it.
 */
export default function CalculatorPlanPage() {
  const router = useRouter();
  const t = useT();
  const { homeState, rooms, setCalculated } = useCalculatorStore();
  const plan = useCalculatorPlan();
  const selection = useCalculatorPlanStore((s) => s.selectedElement);
  const focusRoomId = useCalculatorPlanStore((s) => s.focusRoomId);
  const electrical = useCalculatorPlanStore((s) => s.electrical);
  const actions = useCalculatorPlanStore();
  const [error, setError] = useState<string | null>(null);
  // A drop the board refused — a room over a room, a wall half inside another — says so for a
  // moment; refused in silence it looked like the drag had simply not worked.
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => {
    if (!refused) return;
    const handle = window.setTimeout(() => setRefused(null), 2600);
    return () => window.clearTimeout(handle);
  }, [refused]);
  useEffect(() => {
    if (error && rooms.length > 0) setError(null);
  }, [error, rooms.length]);

  if (!homeState || !plan) {
    return (
      <>
        <StepIndicator current={2} />
        <EmptyStep message={t.calculator.needHomeStateFirst} back={t.common.back} />
      </>
    );
  }

  const handleStart = () => {
    if (rooms.length === 0) {
      setError(t.calculator.needRoomsFirst);
      return;
    }
    // From here the flat and its condition are settled: everything after is quantified from
    // them, so this step and the one before it close behind us.
    setCalculated();
    router.push('/calculator/materials');
  };

  return (
    <>
      <CalculatorFlowGuard step={2} />
      <StepIndicator current={2} />
      <div className="container py-10 md:py-14">
        <StepHeader step={2} total={CALCULATOR_STEPS} title={t.calculator.planStepTitle} subtitle={t.calculator.planStepSubtitle} />

        <div id="rooms-list" className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative min-w-0">
            <PlanWorkspace
              store={useCalculatorPlanStore}
              tools={['select', 'pan', 'wall', 'room', 'door', 'window']}
              layerKeys={['walls', 'openings', 'dimensions']}
              height={560}
              onRefused={(reason) => setRefused(reason === 'overlap' ? t.design.roomOverlapRefused : t.design.openingRefused)}
            />
            {refused && (
              <p role="alert" className="absolute left-4 top-24 rounded-[10px] border border-danger/40 bg-white/95 px-3 py-2 text-xs text-danger">
                {refused}
              </p>
            )}
          </div>
          <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <ElementInspector
              roomPart={actions.selectedRoomPart}
              plan={plan}
              electrical={electrical}
              selection={selection && selection.kind !== 'room' ? selection : null}
              actions={{
                updateWall: actions.updateWall,
                resizeWall: actions.resizeWall,
                removeWall: actions.removeWall,
                updateOpening: actions.updateOpening,
                removeOpening: actions.removeOpening,
                addOpening: (roomId, kind, wallIndex) => {
                  const id = actions.addOpening(roomId, kind, wallIndex);
                  if (id) actions.selectElement({ kind: 'opening', id, roomId });
                },
                updateColumn: actions.updateColumn,
                removeColumn: actions.removeColumn,
                updateBeam: actions.updateBeam,
                removeBeam: actions.removeBeam,
                updateTechnical: actions.updateTechnicalPoint,
                removeTechnical: actions.removeTechnicalPoint,
                updateElectrical: actions.updateElectricalPoint,
                removeElectrical: actions.removeElectricalPoint,
                updateRoom: actions.updateRoom,
                selectRoomPart: actions.selectRoomPart,
                resizeRoom: actions.resizeRoom,
                removeRoom: actions.removeRoom,
              }}
            />
            <RoomsPanel
              plan={plan}
              selectedId={focusRoomId}
              onSelect={(id) => {
                actions.setFocusRoom(id);
                actions.selectElement(id ? { kind: 'room', id } : null);
              }}
              actions={{ updateRoom: actions.updateRoom,
                selectRoomPart: actions.selectRoomPart, resizeRoom: actions.resizeRoom, removeRoom: actions.removeRoom }}
              onAddRectangle={(rect, type) => {
                const id = actions.addRectangleRoom(rect, type);
                if (id) actions.setFocusRoom(id);
              }}
            />
          </div>
        </div>
      </div>

      <StepNav back={{ href: '/calculator', label: t.calculator.backButton }} next={{ label: t.calculator.startButton, onClick: handleStart }}>
        {error && (
          <p role="alert" aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </StepNav>
    </>
  );
}
