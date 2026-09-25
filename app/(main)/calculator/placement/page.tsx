'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Eraser } from 'lucide-react';
import { CALCULATOR_STEPS, StepIndicator } from '@/components/calculator/StepIndicator';
import { AskFurnitureDialog } from '@/components/calculator/AskFurnitureDialog';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { FLOW_BOARD_BLEED, FlowBar, FlowPanel, FlowWorkspace } from '@/components/flow/FlowWorkspace';
import { PlanWorkspace } from '@/components/plan/PlanWorkspace';
import { finishSwatchColor } from '@/components/plan/draw';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore } from '@/store/designStore';
import { useCalculatorPlan } from '@/hooks/useCalculatorPlan';
import { catalogProductFromPick, finishAreasByProduct } from '@/lib/calculator/placement';
import { isCartKey } from '@/lib/calculator/quantities';
import { isBaseFinish } from '@/lib/design/zones';
import { wallAreaM2 } from '@/lib/design/surfaces';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, unitLabel } from '@/lib/i18n/labels';
import { cn, formatGEL, formatM2, formatNumber } from '@/lib/utils';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PaintTarget } from '@/lib/design/paint';
import type { SelectedProduct } from '@/lib/calculator/types';

type Surface = 'floor' | 'wall';

/**
 * Step 4: where each material goes. The floor and wall materials in the cart are laid on
 * the rooms of the calculator's own board — a whole floor or all of a room's walls from the
 * table beside the plan, a square metre or a metre-wide strip at a time with the brush on it
 * — and the area laid is what each one is bought at. The board shows every room in the
 * colour of what it wears, so the plan says what is where; the legend says how much.
 *
 * From `lg` up the step is the whole window (`FlowWorkspace`): the plan edge to edge, the
 * brush along its bottom, the rooms and the legend in a panel down its right.
 */
export default function PlacementStepPage() {
  const t = useT();
  const locale = useLocale();
  const { rooms, homeState, selectedProducts, syncFinishAreas } = useCalculatorStore();
  const plan = useCalculatorPlan();
  const finishes = useCalculatorPlanStore((s) => s.finishes);
  const focusRoomId = useCalculatorPlanStore((s) => s.focusRoomId);
  const setFinish = useCalculatorPlanStore((s) => s.setFinish);
  const paintSurface = useCalculatorPlanStore((s) => s.paintSurface);
  const setFocusRoom = useCalculatorPlanStore((s) => s.setFocusRoom);

  const [surface, setSurface] = useState<Surface>('floor');
  /** What the brush lays: a product, `null` for the eraser, `undefined` for no brush (the select tool). */
  const [brush, setBrush] = useState<CatalogProduct | null | undefined>(undefined);
  const [askFurniture, setAskFurniture] = useState(false);

  /** The cart's floor and wall materials, as the products the board lays. */
  const picks = useMemo(
    () =>
      Object.entries(selectedProducts)
        .filter(([key, p]) => isCartKey(key) && !!p.surface)
        .map(([key, pick]) => ({ key, pick, product: catalogProductFromPick(pick), surface: pick.surface as Surface })),
    [selectedProducts]
  );
  const forSurface = (s: Surface) => picks.filter((p) => p.surface === s);

  // What is laid becomes what is bought: the areas on the board, into the cart's quantities.
  const areas = useMemo(() => finishAreasByProduct(finishes), [finishes]);
  useEffect(() => {
    syncFinishAreas(areas);
  }, [areas, syncFinishAreas]);

  // Escape puts the brush down.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setBrush(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (rooms.length === 0 || !homeState) {
    return (
      <>
        <StepIndicator current={5} />
        <EmptyStep message={t.calculator.needRoomsFirst} back={t.common.back} />
      </>
    );
  }

  const baseOf = (roomId: string, s: Surface): number | null => finishes.find((f) => f.roomId === roomId && f.surface === s && isBaseFinish(f))?.product?.productId ?? null;
  const partsOf = (roomId: string, s: Surface): number => finishes.filter((f) => f.roomId === roomId && f.surface === s && !isBaseFinish(f) && f.product).length;
  const onPaint = (target: PaintTarget) => {
    if (brush === undefined) return;
    paintSurface(target, brush);
  };
  const swatchOf = (pick: SelectedProduct): string => finishSwatchColor({ colorHex: pick.colorHex ?? '#FFFFFF', product: { productId: pick.productId, colorHex: pick.colorHex ?? null } as never });

  const cartTotal = picks.reduce((s, p) => s + p.pick.totalPrice, 0);
  // The brush — which surface, which material, or the eraser: along the bottom of the
  // full-screen board, above the board below `lg`.
  const brushBar = (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-line bg-bg-surface p-3 lg:max-w-[46rem] lg:border-line/70 lg:bg-white/[0.97] lg:shadow-float lg:backdrop-blur-xl">
      <div className="flex gap-1" role="tablist" aria-label={t.calculator.placementBrush}>
        {(['floor', 'wall'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={surface === s} onClick={() => { setSurface(s); setBrush(undefined); }} className={cn('h-8 rounded-[8px] px-3 text-xs font-semibold', surface === s ? 'bg-ink text-white' : 'border border-line text-ink-soft hover:border-ink')}>
            {s === 'floor' ? t.calculator.summaryFloor : t.calculator.summaryWalls}
          </button>
        ))}
      </div>
      <span className="text-xs text-ink-muted">{t.calculator.placementBrush}:</span>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t.calculator.placementBrush}>
        {forSurface(surface).map(({ key, pick, product }) => {
          const active = brush != null && brush.id === product.id;
          return (
            <button key={key} type="button" role="radio" aria-checked={active} onClick={() => setBrush(active ? undefined : product)} title={localizedName(locale, pick)} className={cn('flex h-8 items-center gap-1.5 rounded-[8px] border pl-1 pr-2 text-xs font-medium', active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink')}>
              <span className="relative block h-6 w-6 overflow-hidden rounded-[5px]" style={{ backgroundColor: swatchOf(pick) }}>
                {(pick.textureUrl ?? pick.imageUrl) && <Image src={pick.textureUrl ?? pick.imageUrl!} alt="" fill sizes="24px" className="object-cover" />}
              </span>
              <span className="max-w-[140px] truncate">{localizedName(locale, pick)}</span>
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={brush === null} onClick={() => setBrush(brush === null ? undefined : null)} className={cn('flex h-8 items-center gap-1.5 rounded-[8px] border px-2 text-xs font-medium', brush === null ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-danger hover:text-danger')}>
          <Eraser className="h-3.5 w-3.5" />
          {t.calculator.placementEraser}
        </button>
      </div>
      <p className="w-full text-[11px] leading-snug text-ink-muted">{t.calculator.placementBrushHint}</p>
    </div>
  );

  return (
    <>
      <StepIndicator current={5} />
      <FlowWorkspace>
        <FlowBar
          step={5}
          total={CALCULATOR_STEPS}
          title={t.calculator.placementTitle}
          subtitle={t.calculator.placementSubtitle}
          back={{ href: '/calculator/catalog', label: t.calculator.backButton }}
          actions={
            <p className="flex h-11 items-center gap-1.5 rounded-[12px] bg-white/90 px-3 text-sm text-ink-muted shadow-glass backdrop-blur-xl">
              {t.calculator.cartTitle} {picks.length} · <span className="font-serif text-base font-semibold tabular-nums text-ink">{formatGEL(cartTotal)}</span>
            </p>
          }
          next={{ label: t.calculator.nextButton, onClick: () => setAskFurniture(true) }}
        />

        {/* Below `lg` the step reads as every other step does: its head, then the board. */}
        <div className="container py-10 md:py-14 lg:hidden">
          <StepHeader step={5} total={CALCULATOR_STEPS} title={t.calculator.placementTitle} subtitle={t.calculator.placementSubtitle} />
        </div>

        {picks.length === 0 || !plan ? (
          <div className="container pb-10 lg:absolute lg:inset-0 lg:flex lg:max-w-none lg:items-center lg:justify-center lg:p-0">
            <div className="border border-dashed border-line p-10 text-center text-sm text-ink-muted lg:max-w-md lg:rounded-[16px] lg:bg-white/90 lg:shadow-glass">{t.calculator.placementNothing}</div>
          </div>
        ) : (
          <div className="container pb-10 lg:contents">
            <PlanWorkspace
              store={useCalculatorPlanStore}
              tools={['select', 'pan', 'paint']}
              tool={brush === undefined ? 'select' : 'paint'}
              onTool={(tool) => {
                if (tool !== 'paint') setBrush(undefined);
              }}
              paintScope={surface === 'floor' ? 'cell' : 'strip'}
              onPaint={onPaint}
              roomsOnly
              hideToolbar
              layers={{ furniture: false, electrical: false, technical: false, dimensions: true }}
              bleed={FLOW_BOARD_BLEED}
              dock={brushBar}
            />

            <FlowPanel className="mt-6 lg:mt-0">
              {/* Whole rooms: a material for the floor and one for the walls of each. */}
              <div className="rounded-[14px] border border-line bg-bg-surface">
                <div className="border-b border-line px-4 py-3">
                  <p className="eyebrow">{t.calculator.placementRooms}</p>
                </div>
                <ul>
                  {plan.rooms.map((room) => (
                    <li key={room.id} className={cn('space-y-2 border-b border-line px-4 py-3 last:border-b-0', focusRoomId === room.id && 'bg-sand-light')}>
                      <button type="button" onClick={() => setFocusRoom(focusRoomId === room.id ? null : room.id)} className="flex w-full items-baseline justify-between text-left">
                        <span className="font-medium text-ink">{room.name}</span>
                        <span className="text-xs tabular-nums text-ink-muted">{formatM2(room.areaM2)}</span>
                      </button>
                      {(['floor', 'wall'] as const).map((s) => {
                        const options = forSurface(s);
                        if (options.length === 0) return null;
                        const value = baseOf(room.id, s);
                        const parts = partsOf(room.id, s);
                        return (
                          <label key={s} className="flex items-center gap-2 text-xs">
                            <span className="w-14 shrink-0 text-ink-muted">{s === 'floor' ? t.calculator.summaryFloor : t.calculator.summaryWalls}</span>
                            <select
                              value={value ?? ''}
                              onChange={(e) => {
                                const chosen = options.find((o) => String(o.product.id) === e.target.value);
                                setFinish([room.id], s, chosen ? chosen.product : null);
                              }}
                              aria-label={`${room.name} — ${s === 'floor' ? t.calculator.summaryFloor : t.calculator.summaryWalls}`}
                              className="h-8 min-w-0 flex-1 rounded-[8px] border border-line bg-white px-2 text-xs text-ink focus:border-ink focus:outline-none"
                            >
                              <option value="">{t.calculator.placementNone}</option>
                              {options.map((o) => (
                                <option key={o.key} value={o.product.id}>
                                  {localizedName(locale, o.pick)}
                                </option>
                              ))}
                            </select>
                            <span className="w-16 shrink-0 text-right tabular-nums text-ink-faint">{s === 'floor' ? formatM2(room.areaM2) : formatM2(wallAreaM2(room))}</span>
                            {parts > 0 && <span className="shrink-0 rounded-[4px] bg-sand px-1 py-px text-[10px] uppercase tracking-wide text-ink-muted">{t.calculator.placementPart}</span>}
                          </label>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              </div>

              {/* The legend: every material in the cart, the area it covers, what that comes to. */}
              <div className="rounded-[14px] border border-line bg-bg-surface">
                <div className="border-b border-line px-4 py-3">
                  <p className="eyebrow">{t.calculator.placementLegend}</p>
                </div>
                <ul>
                  {picks.map(({ key, pick }) => {
                    const area = areas.get(pick.productId) ?? 0;
                    return (
                      <li key={key} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0">
                        <span className="relative block h-8 w-8 shrink-0 overflow-hidden rounded-[6px] border border-line" style={{ backgroundColor: swatchOf(pick) }}>
                          {(pick.textureUrl ?? pick.imageUrl) && <Image src={pick.textureUrl ?? pick.imageUrl!} alt="" fill sizes="32px" className="object-cover" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ink">{localizedName(locale, pick)}</p>
                          <p className="text-xs tabular-nums text-ink-muted">
                            {area > 0 ? `${t.calculator.placementArea} ${formatM2(area)} · ${formatNumber(pick.qty, pick.unit === 'm2' ? 1 : 0)} ${unitLabel(t, pick.unit)} × ${formatGEL(pick.pricePerUnit)}` : t.calculator.placementNotPlaced}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">{area > 0 ? formatGEL(pick.totalPrice) : '—'}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </FlowPanel>
          </div>
        )}
      </FlowWorkspace>

      <StepNav className="lg:hidden" back={{ href: '/calculator/catalog', label: t.calculator.backButton }} next={{ label: t.calculator.nextButton, onClick: () => setAskFurniture(true) }}>
        <p className="text-sm text-ink-muted sm:text-right">
          {t.calculator.cartTitle} {picks.length} · <span className="font-serif text-base font-semibold text-ink">{formatGEL(cartTotal)}</span>
        </p>
      </StepNav>

      <AskFurnitureDialog open={askFurniture} onOpenChange={setAskFurniture} />
    </>
  );
}
