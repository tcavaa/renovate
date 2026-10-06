'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CALCULATOR_STEPS, StepIndicator } from '@/components/calculator/StepIndicator';
import { CalculatorFlowGuard } from '@/components/flow/FlowGuard';
import { PlanWorkspace } from '@/components/plan/PlanWorkspace';
import { RoomsPanel } from '@/components/plan/RoomsPanel';
import { ElementInspector, InspectorClose } from '@/components/plan/ElementInspector';
import { Tray } from '@/components/studio/BuildBar';
import { ElectricTray, TechnicalTray } from '@/components/studio/Trays';
import { StepHeader } from '@/components/flow/StepHeader';
import { HingeDialog } from '@/components/flow/HingeDialog';
import { StepNav } from '@/components/flow/StepNav';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { FLOW_BOARD_BLEED, FlowAlert, FlowBar, FlowPanel, FlowPanelOverlay, FlowWorkspace } from '@/components/flow/FlowWorkspace';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore, useDesignActions } from '@/store/designStore';
import { useCalculatorPlan } from '@/hooks/useCalculatorPlan';
import { useT } from '@/lib/i18n/client';
import { calculatorStepHref } from '@/lib/calculator/steps';
import { saveCalculatorProject } from '@/lib/calculator/saveProject';
import { HOME_STATES } from '@/lib/calculator/constants';
import { buildsPartitions } from '@/lib/design/partitions';
import { useProjectId } from '@/components/projects/ProjectGate';
import { useCalculatorBoardProducts } from '@/hooks/useCalculatorBoardProducts';
import { isOpeningTool, type EditorTool } from '@/components/plan/PlanEditor';
import type { ElectricalKind, TechnicalKind } from '@/lib/design/types';

/**
 * Step 2 of the calculator: the plan on the board. An uploaded plan is checked here —
 * walls, doors, windows, the rooms' types and sizes — and a blank sheet is drawn on, with
 * the same tools the studio has. The technical part is here too, because the estimate counts
 * what the board holds, as the design's does: the rail's technical and electrical tools open
 * the studio's own trays along the bottom (`TechnicalTray`, `ElectricTray` — the same kinds,
 * each with how many are placed, the same products, the same automatic placement). A tray
 * opens with its last kind in hand, and the kind stays in hand after every point set down;
 * the tile again, or Escape, puts it down (the tray stays), and Escape once more puts the
 * tray away. "Start the calculation" leaves from here, once there are rooms to calculate —
 * asking first, when nothing technical is on the board, whether to place it by the standards
 * (`placeByStandards` — the design's own rules), then warning that the plan is settled from
 * here and taking the platform's fee for the calculation (`HingeDialog`: a test card for now) —
 * and shuts this step and the one before it.
 *
 * From `lg` up the step is the whole window (`FlowWorkspace`): the sheet edge to edge, the
 * tools floating down its left, the rooms in a panel down its right, and whatever is picked on
 * the board in a card of its own laid over that panel, with its ✕.
 */
export default function CalculatorPlanPage() {
  const router = useRouter();
  const t = useT();
  const projectId = useProjectId();
  const { homeState, rooms, setCalculated } = useCalculatorStore();
  const plan = useCalculatorPlan();
  const selection = useCalculatorPlanStore((s) => s.selectedElement);
  const focusRoomId = useCalculatorPlanStore((s) => s.focusRoomId);
  const electrical = useCalculatorPlanStore((s) => s.electrical);
  const styleId = useCalculatorPlanStore((s) => s.styleId);
  // Stable: the whole state here re-rendered the page on every store change.
  const actions = useDesignActions(useCalculatorPlanStore);
  const selectedRoomPart = useCalculatorPlanStore((s) => s.selectedRoomPart);
  // Every door, window, radiator and fitting on the board a product, as in a design.
  const catalog = useCalculatorBoardProducts();
  const [error, setError] = useState<string | null>(null);
  /** "Start the calculation" pressed with nothing technical on the board: asked first. */
  const [askTechnical, setAskTechnical] = useState(false);
  /** The warning and the fee before the calculation starts (`HingeDialog`). */
  const [hinge, setHinge] = useState(false);
  // The tool on the rail, and — while the technical or the electrical tray is open — whether
  // its kind is in hand: the sheet places with it, or only selects.
  const [tool, setTool] = useState<EditorTool>('select');
  const [armed, setArmed] = useState(false);
  const [technicalKind, setTechnicalKind] = useState<TechnicalKind>('water_supply');
  const [electricalKind, setElectricalKind] = useState<ElectricalKind>('socket');
  const tray = tool === 'technical' || tool === 'electrical' ? tool : null;
  const points = useMemo(() => plan?.technical?.points ?? [], [plan]);
  const technicalCounts = useMemo(() => {
    const counts: Partial<Record<TechnicalKind, number>> = {};
    for (const point of points) counts[point.kind] = (counts[point.kind] ?? 0) + 1;
    return counts;
  }, [points]);
  const electricalCounts = useMemo(() => {
    const counts: Partial<Record<ElectricalKind, number>> = {};
    for (const point of electrical) counts[point.kind] = (counts[point.kind] ?? 0) + 1;
    return counts;
  }, [electrical]);
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
        <EmptyStep message={t.calculator.needHomeStateFirst} back={t.common.back} href={calculatorStepHref(projectId, 1)} />
      </>
    );
  }

  // A black frame builds its partition walls, and asks which of them already stand.
  const wallBuilding = buildsPartitions(HOME_STATES[homeState].includedPhases);

  const technicalSetUp = points.length > 0 || electrical.length > 0;

  /** A tool from the rail: a tray opens with no kind in hand — nothing is placed until one is picked. */
  const pickTool = (next: EditorTool) => {
    setTool(next);
    setArmed(false);
  };
  /**
   * Escape, with nothing of the board's own to end first — one thing at a time: what was
   * selected (the board has just let go of it), then the kind in hand, then the tray or the tool.
   */
  const putDown = () => {
    if (selection) return;
    if (tray && armed) setArmed(false);
    else if (isOpeningTool(tool)) pickTool('openings');
    else if (tool !== 'select') pickTool('select');
  };
  // The studio's trays, along the bottom of the sheet (above it below `lg`).
  const trayDock =
    tray === 'technical' ? (
      <Tray>
        <TechnicalTray kind={technicalKind} onKind={setTechnicalKind} armed={armed} onArm={setArmed} counts={technicalCounts} onAuto={() => actions.suggestTechnical()} onRadiators={() => actions.suggestRadiators(catalog)} />
      </Tray>
    ) : tray === 'electrical' ? (
      <Tray>
        <ElectricTray kind={electricalKind} onKind={setElectricalKind} armed={armed} onArm={setArmed} onSuggest={() => actions.suggestElectrical(catalog)} onClear={actions.clearElectrical} counts={electricalCounts} hint={t.build.hintElectrical} />
      </Tray>
    ) : null;
  // Whatever is picked on the board but a room (the rooms panel has those): a card of its own, over the rooms panel.
  const inspected = selection && selection.kind !== 'room' ? selection : null;

  /** The plan is ready: the warning that it is settled from here, then the fee. */
  const start = () => setHinge(true);
  /** Paid: from here the flat and its condition are settled — everything after is quantified from them, so this step and the one before it close behind us. */
  const calculate = () => {
    setHinge(false);
    setCalculated();
    router.push(calculatorStepHref(projectId, 3));
  };
  const handleStart = () => {
    if (rooms.length === 0) {
      setError(t.calculator.needRoomsFirst);
      return;
    }
    if (!technicalSetUp) {
      setAskTechnical(true);
      return;
    }
    start();
  };

  return (
    <>
      <CalculatorFlowGuard step={2} />
      <StepIndicator current={2} />
      <FlowWorkspace>
        <FlowBar
          step={2}
          total={CALCULATOR_STEPS}
          title={t.calculator.planStepTitle}
          subtitle={t.calculator.planStepSubtitle}
          back={{ href: calculatorStepHref(projectId, 1), label: t.calculator.backButton }}
          next={{ label: t.calculator.startButton, onClick: handleStart }}
          notice={error}
        />

        {/* Below `lg` the step reads as every other step does: its head, then the board. */}
        <div className="container py-10 md:py-14 lg:hidden">
          <StepHeader step={2} total={CALCULATOR_STEPS} title={t.calculator.planStepTitle} subtitle={t.calculator.planStepSubtitle} />
        </div>

        <div id="rooms-list" className="container pb-10 lg:contents">
          <PlanWorkspace
            store={useCalculatorPlanStore}
            tools={['select', 'wall', 'room', 'divider', 'door', 'window', 'archway', 'railing', 'technical', 'electrical']}
            tool={tool}
            onTool={pickTool}
            boardTool={tray && !armed ? 'select' : tool}
            technicalKind={technicalKind}
            onTechnicalKind={setTechnicalKind}
            electricalKind={electricalKind}
            onElectricalKind={setElectricalKind}
            catalog={catalog}
            onEscape={putDown}
            // An open tray says what its tiles do; the board's own line is for the other tools.
            hint={!tray}
            dock={trayDock}
            layerKeys={['walls', 'openings', 'technical', 'electrical', 'dimensions']}
            // White paper: what the rooms will be finished in is the catalogue step's.
            layers={{ zones: false }}
            bleed={FLOW_BOARD_BLEED}
            wallBuilding={wallBuilding}
            onRefused={(reason) => setRefused(reason === 'overlap' ? t.design.roomOverlapRefused : reason === 'railing' ? t.design.railingRefused : reason === 'onRailing' ? t.design.onRailingRefused : t.design.openingRefused)}
          />
          {inspected && (
            <FlowPanelOverlay>
              <InspectorClose.Provider value={() => actions.selectElement(null)}>
                <ElementInspector
                  roomPart={selectedRoomPart}
                  plan={plan}
                  electrical={electrical}
                  wallBuilding={wallBuilding}
                  selection={inspected}
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
                    setRoomWhole: actions.setRoomWhole,
                    resizeRoom: actions.resizeRoom,
                    removeRoom: actions.removeRoom,
                    setRadiatorProduct: actions.setRadiatorProduct,
                    setEquipmentProduct: actions.setEquipmentProduct,
                  }}
                  catalog={catalog}
                  styleId={styleId}
                />
              </InspectorClose.Provider>
            </FlowPanelOverlay>
          )}
          <FlowPanel className="mt-6 lg:mt-0">
            <RoomsPanel
              plan={plan}
              selectedId={focusRoomId}
              onSelect={(id) => {
                actions.setFocusRoom(id);
                actions.selectElement(id ? { kind: 'room', id } : null);
              }}
              actions={{ updateRoom: actions.updateRoom,
                selectRoomPart: actions.selectRoomPart,
                setRoomWhole: actions.setRoomWhole, resizeRoom: actions.resizeRoom, removeRoom: actions.removeRoom }}
              onAddRectangle={(rect, type) => {
                const id = actions.addRectangleRoom(rect, type);
                if (id) actions.setFocusRoom(id);
              }}
            />
          </FlowPanel>
        </div>

        {refused && <FlowAlert>{refused}</FlowAlert>}
      </FlowWorkspace>

      <Dialog open={askTechnical} onOpenChange={setAskTechnical}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.calculator.technicalAskTitle}</DialogTitle>
            <DialogDescription>{t.calculator.technicalAskBody}</DialogDescription>
          </DialogHeader>
          {/* Stacked: both labels are long in Georgian, and side by side they pushed the dialogue wider than its frame. */}
          <div className="mt-2 flex flex-col-reverse gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 whitespace-normal py-2 leading-snug"
              onClick={() => {
                setAskTechnical(false);
                start();
              }}
            >
              {t.calculator.technicalAskSkip}
            </Button>
            <Button
              type="button"
              variant="ink"
              className="h-auto min-h-10 whitespace-normal py-2 leading-snug"
              onClick={() => {
                actions.placeByStandards(catalog);
                setAskTechnical(false);
                start();
              }}
            >
              {t.calculator.autoPlaceStandards}
            </Button>
          </div>
          <p className="text-xs text-ink-muted">{t.calculator.technicalAskSkipHint}</p>
        </DialogContent>
      </Dialog>

      {hinge && (
        <HingeDialog
          open
          onOpenChange={setHinge}
          kind="calculator"
          projectId={projectId}
          save={() => saveCalculatorProject({ draft: true })}
          onPaid={calculate}
        />
      )}

      <StepNav className="lg:hidden" back={{ href: calculatorStepHref(projectId, 1), label: t.calculator.backButton }} next={{ label: t.calculator.startButton, onClick: handleStart }}>
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
