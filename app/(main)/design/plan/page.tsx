'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DoorOpen, Wand2 } from 'lucide-react';
import { DesignSteps } from '@/components/design/DesignSteps';
import { DesignFlowGuard } from '@/components/flow/FlowGuard';
import { PlanWorkspace } from '@/components/plan/PlanWorkspace';
import { ElementInspector } from '@/components/plan/ElementInspector';
import { RoomsPanel } from '@/components/plan/RoomsPanel';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { StageBrief } from '@/components/flow/StageBrief';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { FLOW_BOARD_BLEED, FlowAlert, FlowBar, FlowBarButton, FlowPanel, FlowWorkspace } from '@/components/flow/FlowWorkspace';
import { useDesignStore } from '@/store/designStore';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { deriveOpenings, totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { designStepPosition, nextStep, nextStepHref } from '@/lib/design/steps';
import { formatM2 } from '@/lib/utils';

/**
 * Step 2: the existing house. The drawing board with every build tool — walls as lines,
 * rooms as rectangles, doors, windows, columns, beams — the rooms as cards on the right,
 * and the selected element's parameters under them. Leaving keeps version 01, the existing
 * house, so it can always be returned to.
 *
 * From `lg` up the step is the whole window (`FlowWorkspace`): the sheet edge to edge, the
 * tools floating down its left, the cards in a panel down its right, the title and the way
 * on along its top.
 */
export default function ExistingHousePage() {
  const t = useT();
  const router = useRouter();
  const plan = useDesignStore((s) => s.plan);
  const selection = useDesignStore((s) => s.selectedElement);
  const focusRoomId = useDesignStore((s) => s.focusRoomId);
  const electrical = useDesignStore((s) => s.electrical);
  const homeState = useDesignStore((s) => s.homeState);
  const mode = useDesignStore((s) => s.mode);
  const emptyStart = useDesignStore((s) => s.emptyStart);
  const actions = useDesignStore();
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    if (!refused) return;
    const handle = window.setTimeout(() => setRefused(null), 2200);
    return () => window.clearTimeout(handle);
  }, [refused]);

  if (!plan) {
    return (
      <>
        <DesignSteps current={2} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.startOver} href="/design" />
      </>
    );
  }

  /** Doors and windows for rooms that have none — the parser sealed them, or the walls were just drawn. */
  const suggestOpenings = () => {
    const rooms = plan.rooms.map((r) => ({ ...r, openings: [...r.openings] }));
    const before = new Map(rooms.map((r) => [r.id, r.openings]));
    deriveOpenings(rooms, plan.wallThicknessM);
    const merged = rooms.map((r) => {
      const had = before.get(r.id) ?? [];
      return had.length > 0 ? { ...r, openings: had } : r;
    });
    // A door into a room that kept its own openings needs its twin there too.
    for (const room of merged) {
      for (const o of room.openings) {
        if (!o.connectsToRoomId) continue;
        const other = merged.find((r) => r.id === o.connectsToRoomId);
        if (!other || other.openings.some((x) => x.connectsToRoomId === room.id)) continue;
        const twin = rooms.find((r) => r.id === other.id)?.openings.find((x) => x.connectsToRoomId === room.id);
        if (twin) other.openings = [...other.openings, twin];
      }
    }
    actions.updatePlan({ ...plan, rooms: merged });
  };

  // Where step 2 leads depends on the home's condition: a finished flat records its
  // technical setup next, a renovation designs first and plans the pipes afterwards.
  const after = nextStep(2, homeState, mode) ?? 3;
  const continueNext = () => {
    // An empty start skips the technical step and the style test: the studio opens on
    // these rooms, empty, and the person furnishes them from the catalogue.
    if (emptyStart) {
      actions.startEmpty();
      router.push('/design/studio');
      return;
    }
    // The baseline version is the studio's to take, once it has something to keep: taken
    // here it would be an empty flat, and restoring it would throw the furniture away.
    actions.setStep(after);
    router.push(nextStepHref(2, homeState, mode));
  };

  const roomCount = fill(t.build.roomCount, { n: plan.rooms.length });
  const nextLabel = emptyStart ? t.design.continueToStudio : after === 3 ? t.build.continueToTechnical : t.build.continueToStyle;

  return (
    <>
      <DesignFlowGuard step={2} />
      <DesignSteps current={2} />
      <FlowWorkspace>
        <FlowBar
          step={designStepPosition(2, homeState, mode)}
          total={8}
          title={t.build.s2Title}
          subtitle={t.build.s2Subtitle}
          brief={2}
          back={{ href: '/design', label: t.calculator.backButton }}
          actions={<FlowBarButton icon={<Wand2 className="h-4 w-4" />} label={t.build.autoOpenings} title={t.build.autoOpeningsHint} onClick={suggestOpenings} />}
          next={{ label: nextLabel, onClick: continueNext, disabled: plan.rooms.length === 0 }}
        />

        {/* Below `lg` the step reads as every other step does: its head, then the board. */}
        <div className="container py-8 md:py-12 lg:hidden">
          <StepHeader
            step={designStepPosition(2, homeState, mode)}
            total={8}
            title={t.build.s2Title}
            subtitle={t.build.s2Subtitle}
            meta={
              <>
                <span>{roomCount}</span>
                <span className="text-ink-faint">·</span>
                <span>{formatM2(totalFloorAreaM2(plan))}</span>
              </>
            }
            actions={
              <button type="button" onClick={suggestOpenings} title={t.build.autoOpeningsHint} className="flex h-10 items-center gap-2 rounded-[12px] border border-line bg-white px-4 text-sm font-medium text-ink-soft hover:border-ink hover:text-ink">
                <Wand2 className="h-4 w-4" />
                {t.build.autoOpenings}
              </button>
            }
          />
          <StageBrief step={2} className="mt-6" />
        </div>

        <div className="container pb-10 lg:contents">
          <PlanWorkspace
            tools={['select', 'pan', 'wall', 'room', 'door', 'window', 'column', 'beam']}
            layerKeys={['walls', 'openings', 'structure', 'dimensions', 'origins']}
            bleed={FLOW_BOARD_BLEED}
            onRefused={(reason) => setRefused(reason === 'overlap' ? t.design.roomOverlapRefused : t.design.openingRefused)}
          />
          <FlowPanel className="mt-6 lg:mt-0">
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
                  else setRefused(t.design.openingRefused);
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
            <p className="flex items-start gap-2 text-[11px] leading-snug text-ink-muted">
              <DoorOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t.design.planOpeningsHint}
            </p>
          </FlowPanel>
        </div>

        {refused && <FlowAlert>{refused}</FlowAlert>}
      </FlowWorkspace>

      <StepNav className="lg:hidden" back={{ href: '/design', label: t.calculator.backButton }} next={{ label: nextLabel, onClick: continueNext, disabled: plan.rooms.length === 0 }} />
    </>
  );
}
