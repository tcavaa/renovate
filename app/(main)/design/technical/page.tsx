'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronDown, Flame, Lightbulb } from 'lucide-react';
import { DesignSteps } from '@/components/design/DesignSteps';
import { PlanWorkspace } from '@/components/plan/PlanWorkspace';
import { ElementInspector } from '@/components/plan/ElementInspector';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { StageBrief } from '@/components/flow/StageBrief';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useDesignStore } from '@/store/designStore';
import { useLocale, useT } from '@/lib/i18n/client';
import { homeStateLabel, phaseLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';
import { defaultWorksForHomeState, technicalSuggestions, TECHNICAL_KIND_LIST, WORK_STAGES, worksForStage, type WorkStage } from '@/lib/design/technical';
import { archetypeLabel } from '@/lib/design/catalog';
import { technicalLabel } from '@/components/plan/PlanToolbar';
import { TECHNICAL_COLOR } from '@/components/plan/palette';
import { TECHNICAL_ICON } from '@/components/plan/icons';
import { isHeatedRoom, radiatorPoints, radiatorRoom, radiatorSections, roomHeatDemandW, sectionsForRoom } from '@/lib/design/radiators';
import { useDesignCatalog } from '@/hooks/useDesignCatalog';
import { formatM2 } from '@/lib/utils';
import type { EditorTool } from '@/components/plan/PlanEditor';
import type { TechnicalKind } from '@/lib/design/types';
import type { HomeState } from '@/lib/calculator/types';

/** The line under each stage's title in the works checklist: where it takes the house from and to. */
const STAGE_DESC = {
  old_renovation: 'stageOldDesc',
  black_frame: 'stageBlackDesc',
  white_frame: 'stageWhiteDesc',
  green_frame: 'stageGreenDesc',
} as const satisfies Record<HomeState, string>;

/**
 * Step 3: the technical setup. Points on the plan for what the building provides — water,
 * sewer, drains, the panel, gas, radiators, air conditioning, extractors — and the
 * checklist of works this renovation needs, grouped by the stage of the house they take it
 * through. The layout engine and the budget both read it.
 *
 * The kinds are a grid of tiles that is always on screen: a tile arms the point tool with
 * that kind, the tool stays armed until the tile is clicked again (or Esc), and a click on a
 * point already placed picks it up instead of stacking another.
 */
export default function TechnicalPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
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
  /** What the last "hang the radiators" did: how many were added, or 0 when every room had one. */
  const [radiatorsHung, setRadiatorsHung] = useState<number | null>(null);

  // Every radiator is a product where the catalogue has one, its sections counted from its room.
  const radiatorSignature = useMemo(() => (plan ? radiatorPoints(plan).map((p) => `${p.id}:${p.product?.productId ?? ''}:${p.product?.qty ?? ''}:${p.sections ?? ''}`).join('|') + `#${plan.rooms.map((r) => r.areaM2).join(',')}` : ''), [plan]);
  useEffect(() => {
    if (products.length > 0 && radiatorSignature) actions.ensureRadiatorProducts(products);
    // The signature says when the radiators or their rooms changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, radiatorSignature]);

  const works = useMemo(() => plan?.technical?.works ?? defaultWorksForHomeState(homeState ?? (mode === 'full' ? 'white_frame' : 'green_frame')), [plan?.technical?.works, homeState, mode]);
  const suggestions = useMemo(() => (plan ? technicalSuggestions(plan, items) : []), [plan, items]);

  if (!plan || plan.rooms.length === 0) {
    return (
      <>
        <DesignSteps current={3} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.startOver} href="/design" />
      </>
    );
  }

  const toggleWork = (key: string) => {
    const next = works.includes(key) ? works.filter((k) => k !== key) : [...works, key];
    actions.setWorks(next);
  };
  const setStage = (stage: WorkStage, on: boolean) => {
    const keys = worksForStage(stage).map((w) => w.key);
    const rest = works.filter((k) => !keys.includes(k));
    actions.setWorks(on ? [...rest, ...keys] : rest);
  };

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

  return (
    <>
      <DesignSteps current={3} />
      <div className="container py-8 md:py-12">
        <StepHeader step={3} total={8} title={t.build.technicalTitle} subtitle={t.build.technicalSubtitle} />
        <StageBrief step={3} className="mt-6" />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-3">
            {/* The kinds, always in view: a tile arms the point tool with that kind. */}
            <section className="rounded-[16px] border border-line bg-white p-3" aria-label={t.build.technicalPointsTitle}>
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
                      className={cn('relative flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-[14px] border text-[11px] font-semibold leading-tight transition-all', active ? 'border-ink bg-ink text-white shadow-card' : 'border-line bg-white text-ink-soft hover:border-ink hover:text-ink')}
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ backgroundColor: TECHNICAL_COLOR[k] }}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="max-w-full truncate px-1">{technicalLabel(t, k)}</span>
                      {n > 0 && <span className={cn('absolute right-1.5 top-1.5 min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] tabular-nums', active ? 'bg-white/20 text-white' : 'bg-sand text-ink')}>{n}</span>}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Heating: how many sections each room wants, and a radiator under every window at a click. */}
            <section className="rounded-[16px] border border-line bg-white p-3" aria-label={t.build.radiatorTable}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Flame className="h-4 w-4 text-brand" />
                    {t.build.radiatorTable}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{t.build.suggestRadiatorsHint}</p>
                </div>
                <button type="button" onClick={() => setRadiatorsHung(actions.suggestRadiators(products))} className="h-9 shrink-0 rounded-[10px] bg-ink px-3 text-xs font-semibold text-white hover:bg-brand">
                  {t.build.suggestRadiators}
                </button>
              </div>
              {radiatorsHung != null && <p className="mt-2 text-[11px] font-medium text-success">{radiatorsHung > 0 ? fill(t.build.radiatorsAdded, { n: radiatorsHung }) : t.build.radiatorsNone}</p>}
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {plan.rooms.filter(isHeatedRoom).map((room) => {
                  const here = radiatorPoints(plan).filter((p) => radiatorRoom(plan, p)?.id === room.id);
                  const hung = here.reduce((sum, p) => sum + radiatorSections(plan, p), 0);
                  const wanted = sectionsForRoom(plan, room, here[0]?.radiator?.wattsPerSection);
                  return (
                    <li key={room.id} className="flex items-baseline justify-between gap-2 rounded-[10px] bg-bg-base px-2.5 py-1.5 text-[11px]">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold text-ink">{room.name}</span> <span className="text-ink-muted">· {formatM2(room.areaM2)} · {roomHeatDemandW(plan, room)} {t.build.unitWatt}</span>
                      </span>
                      <span className={cn('shrink-0 tabular-nums', here.length === 0 ? 'text-ink-muted' : hung < wanted ? 'text-warning' : 'text-success')}>
                        {here.length > 0 ? `${here.length} × · ${hung}/${wanted}` : `0 · ${wanted}`} {t.build.radiatorSection}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <PlanWorkspace
              tools={['select', 'pan', 'technical']}
              tool={tool}
              onTool={setTool}
              technicalKind={kind}
              onTechnicalKind={setKind}
              layers={{ dimensions: false }}
              layerKeys={['walls', 'openings', 'structure', 'technical', 'dimensions']}
              locked
              height="calc(100vh - 380px)"
            />
            <p className="text-xs text-ink-muted">{t.build.electricalOnStudio}</p>
          </div>

          <div className="space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:self-start lg:pr-1">
            {selection?.kind === 'technical' && (
              <ElementInspector
                plan={plan}
                electrical={electrical}
                selection={selection}
                locked
                actions={{
                  updateWall: actions.updateWall,
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
                  removeRoom: actions.removeRoom,
                  setRadiatorProduct: actions.setRadiatorProduct,
                }}
                catalog={products}
                styleId={styleId}
              />
            )}

            <section className="rounded-[14px] border border-line bg-white p-3">
              <p className="text-sm font-semibold text-ink">{t.build.worksTitle}</p>
              <p className="mt-1 text-[11px] leading-snug text-ink-muted">{t.build.worksHint}</p>
              <div className="mt-3 space-y-2">
                {WORK_STAGES.map((stage) => {
                  const list = worksForStage(stage);
                  const on = list.filter((w) => works.includes(w.key)).length;
                  const desc = t.build[STAGE_DESC[stage.homeState]];
                  return (
                    <details key={stage.homeState} open={on > 0} className="group rounded-[12px] border border-line">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-ink">{homeStateLabel(t, stage.homeState)}</span>
                          <span className="block truncate text-[10px] text-ink-muted">{desc}</span>
                        </span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums', on > 0 ? 'bg-ink text-white' : 'bg-sand text-ink-muted')}>
                          {on} / {list.length}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-line px-2 pb-2 pt-1">
                        <div className="flex justify-end gap-2 px-1 py-1 text-[10px]">
                          <button type="button" onClick={() => setStage(stage, true)} className="font-medium text-ink-soft hover:text-ink">
                            {t.build.stageAll}
                          </button>
                          <span className="text-ink-faint">·</span>
                          <button type="button" onClick={() => setStage(stage, false)} className="font-medium text-ink-soft hover:text-ink">
                            {t.build.stageNone}
                          </button>
                        </div>
                        <ul className="space-y-0.5">
                          {list.map((w) => {
                            const checked = works.includes(w.key);
                            return (
                              <li key={w.key}>
                                <label className={cn('flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-xs transition-colors', checked ? 'bg-sand-light text-ink' : 'text-ink-soft hover:bg-sand-light/60')}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleWork(w.key)} className="accent-ink" />
                                  <span className="w-6 text-[10px] tabular-nums text-ink-faint">{String(w.phase).padStart(2, '0')}</span>
                                  {phaseLabel(t, w.phase)}
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>

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
          </div>
        </div>
      </div>

      <StepNav
        back={{ href: '/design/plan', label: t.calculator.backButton }}
        next={{
          label: t.build.continueToStyle,
          onClick: () => {
            if (!plan.technical?.works) actions.setWorks(works);
            actions.setStep(4);
            router.push('/design/style');
          },
        }}
      />
    </>
  );
}
