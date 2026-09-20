'use client';

/**
 * The card of a selected socket, switch or light — the electrical layer's twin of the
 * furniture card. What it is (a real product with its photo, price and shop, or an estimate
 * while the catalogue has nothing of its kind), the kind as a dropdown, the few settings
 * that matter — height with the usual presets, the spot along the wall, the outlets, on or
 * off — and, in a drawer along the bottom, every product of that kind the catalogue offers.
 */

import { useState } from 'react';
import Image from 'next/image';
import { Check, ChevronLeft, ChevronRight, ChevronUp, Sparkles, Trash2 } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL } from '@/lib/utils';
import { roomEdges } from '@/lib/design/planGeometry';
import { ELECTRICAL_KINDS, ELECTRICAL_KIND_LIST, fixtureCandidates, isLight, LIGHT_CATEGORIES } from '@/lib/design/electrical';
import { ELECTRICAL_MATERIAL_GEL } from '@/lib/design/technicalRates';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { ElectricalKind, ElectricalPoint, LightCategory, PlanRoom, StyleId } from '@/lib/design/types';
import type { Dictionary } from '@/lib/i18n';
import { electricalLabel } from '@/components/plan/PlanToolbar';
import { ELECTRICAL_ICON } from '@/components/plan/icons';
import { IconAction, NumberField } from '@/components/plan/ElementInspector';

const LIGHT_CATEGORY_KEY: Record<LightCategory, keyof Dictionary['build']> = { primary: 'lcPrimary', secondary: 'lcSecondary', furniture: 'lcFurniture', bedside: 'lcBedside', indirect: 'lcIndirect', decorative: 'lcDecorative' };
/** The heights fitters actually work to, from a floor socket to a high wall light. */
const HEIGHT_PRESETS = [0.3, 0.45, 0.6, 0.9, 1.05, 1.1, 1.15, 1.45, 1.7, 1.8, 1.95, 2.1];
/** How many fit on one line of the card — more than this wrapped and pushed the rest down. */
const PRESETS_SHOWN = 5;

/**
 * The heights worth offering for this kind: its own default always, and the nearest of the
 * standard heights around it. A socket is not offered a wall-lamp height, and the row stays
 * one line.
 */
function heightPresets(defaultElevationM: number): number[] {
  const near = [...HEIGHT_PRESETS]
    .filter((h) => Math.abs(h - defaultElevationM) > 0.001)
    .sort((a, b) => Math.abs(a - defaultElevationM) - Math.abs(b - defaultElevationM))
    .slice(0, PRESETS_SHOWN - 1);
  return [...new Set([defaultElevationM, ...near])].sort((a, b) => a - b);
}

export function FixturePanel({ point, room, catalog, styleId, onKind, onSwap, onUpdate, onSlide, onRemove }: { point: ElectricalPoint; room: PlanRoom | null; catalog: CatalogProduct[]; styleId: StyleId; onKind: (kind: ElectricalKind) => void; onSwap: (product: CatalogProduct | null) => void; onUpdate: (patch: Partial<Omit<ElectricalPoint, 'id'>>) => void; onSlide: (t: number) => void; onRemove: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);


  const info = ELECTRICAL_KINDS[point.kind];
  const light = isLight(point.kind);
  const Icon = ELECTRICAL_ICON[point.kind];
  const product = point.product ?? null;
  const alternatives = fixtureCandidates(point.kind, catalog, styleId);
  const edge = room && point.wallIndex != null ? roomEdges(room.polygon).find((e) => e.index === point.wallIndex) : null;
  const alongM = edge ? (point.t ?? 0.5) * edge.length : null;
  const estimate = ELECTRICAL_MATERIAL_GEL[point.kind];
  const presets = heightPresets(info.defaultElevationM);
  const slide = (tt: number) => onSlide(Math.max(0.02, Math.min(0.98, tt)));
  const select = 'h-8 w-full rounded-[8px] border border-line bg-white px-2 text-[13px] text-ink focus:border-ink focus:outline-none';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* The body scrolls on its own; the drawer along the bottom never hides the last field. */}
      {/*
        Opening the drawer collapses the card rather than hiding it outright: the max
        height animates to nothing, the drawer's `flex-1` follows it up, and the list
        arrives at the top of the panel instead of appearing there.
      */}
      <div
        aria-hidden={open}
        className={cn(
          'min-h-0 shrink space-y-2 pr-1 transition-[max-height,opacity,padding] duration-300 ease-out',
          open ? 'max-h-0 overflow-hidden pb-0 opacity-0' : 'max-h-[70vh] overflow-y-auto pb-2 opacity-100'
        )}
      >
        {/* What it is: the photo, the name, the price, and the shop on one line under them. */}
        <div className="overflow-hidden rounded-[10px] border border-line bg-bg-surface">
          <div className="flex items-center gap-2 p-2">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-bg-base text-ink-soft">
              {product?.imageUrl ? <Image src={product.imageUrl} alt={localizedName(locale, product)} fill sizes="44px" className="object-cover" /> : <Icon className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-ink">{product ? localizedName(locale, product) : t.build.fixtureEstimateTitle}</p>
              <p className="truncate text-[10px] text-ink-muted">
                {electricalLabel(t, point.kind)}
                {product?.store ? ` · ${localizedName(locale, product.store)}` : ''}
              </p>
            </div>
            {product ? (
              <p className="shrink-0 text-right">
                <span className="block font-serif text-sm font-bold tabular-nums text-brand-dark">{formatGEL(product.totalPrice)}</span>
                {product.qty !== 1 && <span className="block text-[10px] tabular-nums text-ink-muted">{product.qty} × {formatGEL(product.pricePerUnit)}</span>}
              </p>
            ) : (
              <p className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-ink-muted">
                <Sparkles className="h-3 w-3" />
                {formatGEL(estimate)}
              </p>
            )}
          </div>
        </div>

        {/* The kind, as a dropdown. */}
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.kind}</span>
          <select value={point.kind} onChange={(e) => onKind(e.target.value as ElectricalKind)} className={select} aria-label={t.build.kind}>
            {ELECTRICAL_KIND_LIST.map((kind) => (
              <option key={kind} value={kind}>
                {electricalLabel(t, kind)}
              </option>
            ))}
          </select>
        </label>

        {/* Height, with the usual ones a click away. */}
        {info.placement !== 'ceiling' && (
          <div className="space-y-1.5">
            <NumberField label={`${t.build.elevation} (${t.units.m})`} value={point.elevationM} min={0} max={room?.heightM ?? 3} step={0.05} onCommit={(v) => onUpdate({ elevationM: v })} />
            <div className="flex flex-wrap gap-1">
              {presets.map((h) => (
                <button key={h} type="button" onClick={() => onUpdate({ elevationM: h })} aria-pressed={Math.abs(point.elevationM - h) < 0.011} className={cn('h-7 rounded-[7px] px-2 text-[11px] font-medium tabular-nums transition-colors', Math.abs(point.elevationM - h) < 0.011 ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft hover:border-ink')}>
                  {Math.round(h * 100)} {t.units.cm}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Left and right along the wall. */}
        {edge && alongM != null && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {t.build.alongWall} · {fill(t.build.wallN, { n: edge.index + 1 })}
            </span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => slide((alongM - 0.05) / edge.length)} aria-label={t.build.nudgeLeft} title={t.build.nudgeLeft} className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-line text-ink-soft hover:border-ink">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input type="range" min={0.02} max={0.98} step={0.005} value={point.t ?? 0.5} onChange={(e) => slide(Number(e.target.value))} aria-label={t.build.alongWall} className="min-w-0 flex-1 accent-ink" />
              <button type="button" onClick={() => slide((alongM + 0.05) / edge.length)} aria-label={t.build.nudgeRight} title={t.build.nudgeRight} className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-line text-ink-soft hover:border-ink">
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink">
                {alongM.toFixed(2)} {t.units.m}
              </span>
            </div>
          </label>
        )}

        {/* Outlets for sockets; category, length and the switch for lights. */}
        <div className="flex flex-wrap items-end gap-2">
          {!light && point.kind !== 'switch' && point.kind !== 'tv' && point.kind !== 'internet' && (
            <div>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.outlets}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" onClick={() => onUpdate({ count: n })} aria-pressed={(point.count ?? 1) === n} className={cn('h-8 w-8 rounded-[8px] text-xs font-medium', (point.count ?? 1) === n ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft hover:border-ink')}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          {light && (
            <label className="block min-w-[150px] flex-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.lightCategory}</span>
              <select value={point.category ?? info.category ?? 'primary'} onChange={(e) => onUpdate({ category: e.target.value as LightCategory })} className={select} aria-label={t.build.lightCategory}>
                {LIGHT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t.build[LIGHT_CATEGORY_KEY[c]]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {light && (
            <button type="button" role="switch" aria-checked={point.on !== false} onClick={() => onUpdate({ on: point.on === false })} className="flex h-8 items-center gap-2 rounded-[8px] border border-line px-2.5 text-[11px] font-semibold text-ink transition-colors hover:border-ink">
              <span className={cn('relative h-5 w-9 rounded-full transition-colors', point.on !== false ? 'bg-[#F5B400]' : 'bg-line')}>
                <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', point.on !== false ? 'left-[18px]' : 'left-0.5')} />
              </span>
              {point.on !== false ? t.build.lightOn : t.build.lightOff}
            </button>
          )}
        </div>
        {(point.kind === 'light_strip' || point.kind === 'light_furniture') && <NumberField label={`${t.build.stripLength} (${t.units.m})`} value={point.lengthM ?? 1.5} min={0.2} max={20} step={0.1} onCommit={(v) => onUpdate({ lengthM: v })} />}

        <div className="flex items-center gap-1.5">
          <IconAction label={t.build.deleteElement} danger onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </IconAction>
        </div>
      </div>

      {/* The products of this kind, in a drawer along the bottom — like the furniture card. */}
      <section data-open={open} className={cn('-mx-1 flex min-h-[5.5rem] flex-1 flex-col border-line', open ? 'border-t-0' : 'border-t')}>
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
          <span className="text-[13px] font-semibold text-ink">{t.design.swapTitle}</span>
          <span className="flex items-center gap-1 text-[11px] text-ink-muted">
            {alternatives.length > 0 && <span className="tabular-nums">{alternatives.length}</span>}
            {open ? t.design.swapClose : t.design.swapOpen}
            <ChevronUp className={cn('h-3.5 w-3.5 transition-transform duration-300', open && 'rotate-180')} />
          </span>
        </button>
        {alternatives.length === 0 ? (
          <p className="px-3 pb-2 text-xs text-ink-muted">{t.build.fixtureNoProducts}</p>
        ) : (
          <ul className={cn('min-h-0 flex-1 space-y-1.5 overscroll-contain px-3 pb-3', 'overflow-y-auto')}>
            {alternatives.map((candidate) => {
              const active = candidate.id === product?.productId;
              return (
                <li key={candidate.id}>
                  <button type="button" onClick={() => onSwap(candidate)} className={cn('flex w-full items-center gap-3 rounded-[10px] border p-2 text-left transition-colors', active ? 'border-ink bg-sand-light' : 'border-line bg-bg-surface hover:border-ink/40')}>
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[8px] bg-bg-base">
                      {candidate.imageUrl ? <Image src={candidate.imageUrl} alt={localizedName(locale, candidate)} fill sizes="44px" className="object-cover" /> : <span className="block h-full w-full" style={{ backgroundColor: candidate.colorHex ?? '#DDD8CF' }} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">{localizedName(locale, candidate)}</span>
                      <span className="block truncate text-[11px] text-ink-muted">{(candidate.store ? localizedName(locale, candidate.store) : null) ?? candidate.brand ?? ''}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-semibold tabular-nums text-ink">{formatGEL(candidate.pricePerUnit)}</span>
                      {active && <Check className="ml-auto mt-0.5 h-3.5 w-3.5 text-ink" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
