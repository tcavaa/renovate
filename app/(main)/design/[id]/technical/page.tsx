'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Lightbulb } from 'lucide-react';
import { DesignSteps } from '@/components/design/DesignSteps';
import { TechnicalChecksCard, TechnicalChecksDialog, useTechnicalChecks } from '@/components/design/TechnicalChecks';
import { DesignFlowGuard } from '@/components/flow/FlowGuard';
import { PlanWorkspace } from '@/components/plan/PlanWorkspace';
import { ElementInspector } from '@/components/plan/ElementInspector';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { StageBrief } from '@/components/flow/StageBrief';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { FLOW_BOARD_BLEED, FlowBar, FlowPanel, FlowWorkspace } from '@/components/flow/FlowWorkspace';
import { useDesignStore } from '@/store/designStore';
import { useProjectId } from '@/components/projects/ProjectGate';
import { useLocale, useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';
import { effectivePhases, technicalCheckFrom, technicalSuggestions, TECHNICAL_KIND_LIST, type TechnicalCheck } from '@/lib/design/technical';
import { buildsPartitions } from '@/lib/design/partitions';
import { designStepHref, designStepPosition, nextStep, nextStepHref, previousStepHref } from '@/lib/design/steps';
import { archetypeLabel } from '@/lib/design/catalog';
import { technicalLabel } from '@/components/plan/PlanToolbar';
import { TECHNICAL_COLOR } from '@/components/plan/palette';
import { TECHNICAL_ICON } from '@/components/plan/icons';
import { radiatorPoints } from '@/lib/design/radiators';
import { equipmentSignature } from '@/lib/design/equipment';
import { useDesignCatalog } from '@/hooks/useDesignCatalog';
import type { EditorTool } from '@/components/plan/PlanEditor';
import type { TechnicalKind } from '@/lib/design/types';

/**
 * Step 3: the technical setup. Points on the plan for what the building provides — water,
 * sewer, drains, the panel, gas, radiators, air conditioning, extractors — and the answers
 * the budget is counted from: the automatic placement, the radiators room by room, the works
 * this renovation needs, how the floor and the ceiling are done and what the flat already
 * has. The layout engine and the budget both read it.
 *
 * The kinds are a grid of tiles that is always on screen: a tile arms the point tool with
 * that kind, the tool stays armed until the tile is clicked again (or Esc), and a click on a
 * point already placed picks it up instead of stacking another.
 *
 * The answers are checks in a modal over the plan (`TechnicalChecksDialog`): going on opens
 * it on the first one not looked at yet and walks through the rest in order, and only when
 * every one has been looked at does going on go on. The card down the right lists them and
 * opens any of them; `?check=<key>` opens the step on one (the studio's link to the works).
 *
 * From `lg` up the step is the whole window (`FlowWorkspace`): the plan edge to edge, the
 * kinds along its bottom, the selected point, the checks and the hints in a panel down its
 * right.
 */
export default function TechnicalPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = useProjectId();
  const plan = useDesignStore((s) => s.plan);
  const items = useDesignStore((s) => s.items);
  const electrical = useDesignStore((s) => s.electrical);
  const selection = useDesignStore((s) => s.selectedElement);
  const mode = useDesignStore((s) => s.mode);
  const homeState = useDesignStore((s) => s.homeState);
  const actions = useDesignStore();
  const styleId = useDesignStore((s) => s.styleId);
  const { products } = useDesignCatalog();
  const [tool, setTool] = useState<EditorTool>('select');
  const [kind, setKind] = useState<TechnicalKind>('water_supply');
  const { works, checks, unchecked } = useTechnicalChecks();
  /**
   * The checks modal: shut, or open on one check — opened by going on (its last button goes
   * on to the next step) or from the card (its last button comes back to the plan).
   */
  const [checksOpen, setChecksOpen] = useState<{ at: TechnicalCheck; goingOn: boolean } | null>(() => {
    const asked = technicalCheckFrom(searchParams.get('check'));
    return asked ? { at: asked, goingOn: false } : null;
  });

  // Every radiator is a product where the catalogue has one, its sections counted from its room.
  const radiatorSignature = useMemo(() => (plan ? radiatorPoints(plan).map((p) => `${p.id}:${p.product?.productId ?? ''}:${p.product?.qty ?? ''}:${p.sections ?? ''}`).join('|') + `#${plan.rooms.map((r) => r.areaM2).join(',')}` : ''), [plan]);
  useEffect(() => {
    if (products.length > 0 && radiatorSignature) actions.ensureRadiatorProducts(products);
    // The signature says when the radiators or their rooms changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, radiatorSignature]);

  // And the equipment — panel, boiler, air conditioners, hoods and fans, drains — the kind its room calls for.
  const equipmentKey = equipmentSignature(plan);
  useEffect(() => {
    if (products.length > 0 && equipmentKey) actions.ensureEquipmentProducts(products);
    // The signature says when a point or its room changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, equipmentKey]);

  const suggestions = useMemo(() => (plan ? technicalSuggestions(plan, items) : []), [plan, items]);

  // `?check=` has done its work once the modal is open on it: a reload must not open it again.
  useEffect(() => {
    if (searchParams.get('check')) router.replace(designStepHref(projectId, 3), { scroll: false });
    // On mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!plan || plan.rooms.length === 0) {
    return (
      <>
        <DesignSteps current={3} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.addPlan} href={designStepHref(projectId, 1)} />
      </>
    );
  }

  const points = plan.technical?.points ?? [];
  const countOf = (k: TechnicalKind) => points.filter((p) => p.kind === k).length;

  const pickKind = (k: TechnicalKind) => {
    if (tool === 'technical' && kind === k) {
      setTool('select');
      return;
    }
    setKind(k);
    setTool('technical');
  };

  const suggestionText = (s: (typeof suggestions)[number]) => {
    const room = plan.rooms.find((r) => r.id === s.roomId)?.name ?? '';
    const item = s.itemId ? archetypeLabel(items.find((i) => i.id === s.itemId)?.kind ?? '', locale) : '';
    const n = s.distanceM ?? 0;
    switch (s.code) {
      case 'far_from_sewer':
        return fill(t.build.sgFarFromSewer, { room, item, n });
      case 'far_from_water':
        return fill(t.build.sgFarFromWater, { room, item, n });
      case 'radiator_not_exterior':
        return fill(t.build.sgRadiatorNotExterior, { room });
      case 'no_extractor':
        return fill(t.build.sgNoExtractor, { room });
      case 'no_drain':
        return fill(t.build.sgNoDrain, { room });
    }
  };

  // The kinds, always in view: a tile arms the point tool with that kind. Along the bottom of
  // the full-screen board, above the board below `lg`.
  const kindsTray = (
    <section className="rounded-[16px] border border-line bg-white p-3 lg:w-[min(46rem,100%)] lg:border-line/70 lg:bg-white/[0.97] lg:shadow-float lg:backdrop-blur-xl" aria-label={t.build.technicalPointsTitle}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{t.build.technicalPointsTitle}</p>
        <p className="text-[11px] text-ink-muted">{tool === 'technical' ? fill(t.build.kindArmedHint, { kind: technicalLabel(t, kind) }) : t.build.technicalPointsHint}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label={t.build.toolTechnical}>
        {TECHNICAL_KIND_LIST.map((k) => {
          const Icon = TECHNICAL_ICON[k];
          const active = tool === 'technical' && kind === k;
          const n = countOf(k);
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pickKind(k)}
              title={technicalLabel(t, k)}
              className={cn('relative flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-[14px] border text-[11px] font-semibold leading-tight transition-all lg:h-[60px] lg:gap-1', active ? 'border-ink bg-ink text-white shadow-card' : 'border-line bg-white text-ink-soft hover:border-ink hover:text-ink')}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full text-white lg:h-7 lg:w-7" style={{ backgroundColor: TECHNICAL_COLOR[k] }}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="max-w-full truncate px-1">{technicalLabel(t, k)}</span>
              {n > 0 && <span className={cn('absolute right-1.5 top-1.5 min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] tabular-nums', active ? 'bg-white/20 text-white' : 'bg-sand text-ink')}>{n}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );

  const nextLabel = nextStep(3, homeState, mode) === 4 ? t.build.continueToStyle : t.build.budgetTitle;
  const proceed = () => {
    if (!plan.technical?.works) actions.setWorks(works);
    actions.setStep(nextStep(3, homeState, mode) ?? 4);
    router.push(nextStepHref(projectId, 3, homeState, mode));
  };
  // Going on asks first: every check not looked at yet, one by one, from the first of them.
  const goNext = () => {
    if (unchecked.length > 0) setChecksOpen({ at: unchecked[0], goingOn: true });
    else proceed();
  };

  return (
    <>
      <DesignFlowGuard step={3} />
      <DesignSteps current={3} />
      <FlowWorkspace>
        <FlowBar
          step={designStepPosition(3, homeState, mode)}
          total={8}
          title={t.build.technicalTitle}
          subtitle={t.build.technicalSubtitle}
          brief={3}
          back={{ href: previousStepHref(projectId, 3, homeState, mode), label: t.calculator.backButton }}
          next={{ label: nextLabel, onClick: goNext }}
        />

        {/* Below `lg` the step reads as every other step does: its head, then the board. */}
        <div className="container py-8 md:py-12 lg:hidden">
          <StepHeader step={designStepPosition(3, homeState, mode)} total={8} title={t.build.technicalTitle} subtitle={t.build.technicalSubtitle} />
          <StageBrief step={3} className="mt-6" />
        </div>

        <div className="container pb-10 lg:contents">
          <PlanWorkspace
            tools={['select', 'technical']}
            tool={tool}
            onTool={setTool}
            technicalKind={kind}
            onTechnicalKind={setKind}
            // White paper under the points: the finishes are the studio's, not this step's.
            layers={{ dimensions: false, zones: false }}
            layerKeys={['walls', 'openings', 'structure', 'technical', 'dimensions']}
            locked
            bleed={FLOW_BOARD_BLEED}
            wallBuilding={mode === 'full' && !!homeState && buildsPartitions(effectivePhases(homeState, plan.technical?.works ?? null))}
            dock={kindsTray}
          />

          <FlowPanel className="mt-6 lg:mt-0">
            {selection?.kind === 'technical' && (
              <ElementInspector
              roomPart={actions.selectedRoomPart}
                plan={plan}
                electrical={electrical}
                selection={selection}
                locked
                actions={{
                  updateWall: actions.updateWall,
                  resizeWall: actions.resizeWall,
                  removeWall: actions.removeWall,
                  updateOpening: actions.updateOpening,
                  removeOpening: actions.removeOpening,
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
                  removeRoom: actions.removeRoom,
                  setRadiatorProduct: actions.setRadiatorProduct,
                  setEquipmentProduct: actions.setEquipmentProduct,
                }}
                catalog={products}
                styleId={styleId}
              />
            )}

            {/*
              The answers the budget is counted from — the automatic placement, the radiators,
              the works, how it is done, what is already there: where each stands, any one a
              click away. Their questions are asked in the modal, not here.
            */}
            <TechnicalChecksCard onOpen={(check) => setChecksOpen({ at: check, goingOn: false })} />

            <section className="rounded-[14px] border border-line bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Lightbulb className="h-4 w-4 text-warning" />
                {t.build.suggestionsTitle}
              </p>
              {suggestions.length === 0 ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  {t.build.noSuggestions}
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-xs text-ink-soft">
                  {suggestions.map((s, i) => (
                    <li key={`${s.code}-${s.roomId}-${i}`} className="rounded-[8px] bg-warning/10 px-2 py-1.5">
                      {suggestionText(s)}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="text-xs text-ink-muted">{t.build.electricalOnStudio}</p>
          </FlowPanel>
        </div>
      </FlowWorkspace>

      <StepNav className="lg:hidden" back={{ href: previousStepHref(projectId, 3, homeState, mode), label: t.calculator.backButton }} next={{ label: nextLabel, onClick: goNext }} />

      {checksOpen && checks.length > 0 && (
        <TechnicalChecksDialog
          open
          onOpenChange={(open) => !open && setChecksOpen(null)}
          at={checksOpen.at}
          onAt={(at) => setChecksOpen((c) => (c ? { ...c, at } : c))}
          finish={
            checksOpen.goingOn
              ? {
                  label: nextLabel,
                  onFinish: () => {
                    setChecksOpen(null);
                    proceed();
                  },
                }
              : { label: t.build.checksFinish, onFinish: () => setChecksOpen(null) }
          }
        />
      )}
    </>
  );
}
