'use client';

/**
 * The card of a selected door or window — the twin of the furniture and fitting cards. What
 * it is (a real product with its photo, price and shop, or an estimate while the catalogue
 * has nothing of its kind), the kind as a dropdown, the few measures that matter — width,
 * height, the sill of a window, the hinge, swing and open angle of a door — and, in a
 * drawer along the bottom, every door or window the catalogue offers in its place.
 */

import { useState } from 'react';
import Image from 'next/image';
import { AppWindow, Check, ChevronUp, DoorOpen, Lock, LockOpen, Sparkles, Trash2 } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL } from '@/lib/utils';
import { roomEdges } from '@/lib/design/planGeometry';
import { openingCandidates } from '@/lib/design/openings';
import { openingEstimate } from '@/lib/design/pricing';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { Opening, OpeningKind, PlanRoom, StyleId } from '@/lib/design/types';
import { Chip, Field, IconAction, MaterialField, NumberField, OriginRow, RangeField } from '@/components/plan/ElementInspector';

export type OpeningPatch = Partial<Pick<Opening, 'widthM' | 'heightM' | 'sillM' | 'kind' | 'material' | 'hinge' | 'swing' | 'openAngleDeg' | 'locked'>>;

/**
 * `locked` is the studio's structure lock: it keeps the hole where and how big it is (kind,
 * size, sill, deletion); what fills it — the product, the hinge, the swing, the angle, the
 * material — is decoration and stays editable.
 */
export function OpeningPanel({ opening, room, catalog, styleId, locked, onUpdate, onSwap, onRemove }: { opening: Opening; room: PlanRoom; catalog: CatalogProduct[]; styleId: StyleId; locked?: boolean; onUpdate: (patch: OpeningPatch) => void; onSwap: (product: CatalogProduct | null) => void; onRemove: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);


  const product = opening.product ?? null;
  const edge = roomEdges(room.polygon).find((e) => e.index === opening.wallIndex);
  const maxWidth = edge ? Math.max(0.5, edge.length - 0.3) : 6;
  const alternatives = openingCandidates(opening, catalog, styleId);
  const estimate = openingEstimate(opening);
  const kindLabel = opening.kind === 'window' ? t.design.window : opening.kind === 'archway' ? t.build.archway : opening.exterior ? t.build.lineEntranceDoor : t.design.door;
  const Icon = opening.kind === 'window' ? AppWindow : DoorOpen;
  const select = 'h-8 w-full rounded-[8px] border border-line bg-white px-2 text-[13px] text-ink focus:border-ink focus:outline-none disabled:opacity-50';

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
              <p className="truncate text-[13px] font-semibold leading-tight text-ink">{product ? localizedName(locale, product) : opening.kind === 'archway' ? t.build.archway : t.build.fixtureEstimateTitle}</p>
              <p className="truncate text-[10px] text-ink-muted">{kindLabel}{product?.store ? ` · ${localizedName(locale, product.store)}` : ''}</p>
            </div>
            {product ? (
              <p className="shrink-0 font-serif text-sm font-bold tabular-nums text-brand-dark">{formatGEL(product.pricePerUnit)}</p>
            ) : estimate ? (
              <p className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-ink-muted">
                <Sparkles className="h-3 w-3" />
                {formatGEL(estimate.total)}
              </p>
            ) : null}
          </div>
        </div>

        {/* The kind, as a dropdown. */}
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.kind}</span>
          <select value={opening.kind} disabled={locked} onChange={(e) => e.target.value !== opening.kind && onUpdate({ kind: e.target.value as OpeningKind })} className={select} aria-label={t.build.kind}>
            <option value="door">{t.design.door}</option>
            <option value="window">{t.design.window}</option>
            <option value="archway">{t.build.archway}</option>
          </select>
        </label>

        {/* The measures. */}
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={`${t.build.width} (${t.units.m})`} value={opening.widthM} min={0.4} max={maxWidth} step={0.05} onCommit={(v) => onUpdate({ widthM: v })} disabled={locked} />
          <NumberField label={`${t.build.height} (${t.units.m})`} value={opening.heightM} min={0.3} max={room.heightM} step={0.05} onCommit={(v) => onUpdate({ heightM: v })} disabled={locked} />
        </div>
        {opening.kind === 'window' && <NumberField label={`${t.build.sillHeight} (${t.units.m})`} value={opening.sillM} min={0} max={room.heightM - 0.3} step={0.05} onCommit={(v) => onUpdate({ sillM: v })} disabled={locked} />}

        {/* A door: which jamb, which way, how far open in 3D. */}
        {opening.kind === 'door' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t.build.hinge}>
                <div className="flex gap-1">
                  {(['left', 'right'] as const).map((h) => (
                    <Chip key={h} active={(opening.hinge ?? 'left') === h} onClick={() => onUpdate({ hinge: h })}>
                      {h === 'left' ? t.build.hingeLeft : t.build.hingeRight}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label={t.build.swing}>
                <div className="flex gap-1">
                  {(['in', 'out'] as const).map((sw) => (
                    <Chip key={sw} active={(opening.swing ?? 'in') === sw} onClick={() => onUpdate({ swing: sw })}>
                      {sw === 'in' ? t.build.swingIn : t.build.swingOut}
                    </Chip>
                  ))}
                </div>
              </Field>
            </div>
            <RangeField label={t.build.openAngle} value={opening.openAngleDeg ?? 75} min={0} max={110} step={5} unit="°" onChange={(v) => onUpdate({ openAngleDeg: v })} />
          </>
        )}

        {/* What it is made of only matters to the estimate; a product brings its own look. */}
        {!product && opening.kind !== 'archway' && (
          <MaterialField value={opening.material ?? (opening.kind === 'window' ? 'pvc' : 'wood')} options={opening.kind === 'window' ? ['pvc', 'aluminium', 'wood', 'metal'] : ['wood', 'metal', 'glass', 'aluminium', 'pvc']} onChange={(m) => onUpdate({ material: m })} />
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <OriginRow origin={opening.origin ?? 'existing'} />
          {opening.exterior && <span className="text-[11px] text-ink-muted">· {t.build.exteriorOpening}</span>}
          {edge && <span className="text-[11px] text-ink-muted">· {fill(t.build.wallN, { n: edge.index + 1 })}</span>}
        </div>

        {/* Lock and delete as icons: the words said what the icons already do. */}
        <div className="flex items-center gap-1.5">
          <IconAction label={opening.locked ? t.build.unlockItem : t.build.lockItem} active={!!opening.locked} onClick={() => onUpdate({ locked: !opening.locked })}>
            {opening.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          </IconAction>
          <IconAction label={t.build.deleteElement} danger disabled={locked} onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </IconAction>
        </div>
      </div>

      {/* The doors or windows the catalogue offers, in a drawer along the bottom — like the furniture card. */}
      {opening.kind !== 'archway' && (
        <section data-open={open} className={cn('-mx-1 flex min-h-[5.5rem] flex-1 flex-col border-line', open ? 'border-t-0' : 'border-t')}>
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
            <span className="text-[13px] font-semibold text-ink">{t.design.swapTitle}</span>
            <span className="flex items-center gap-1 text-[10px] text-ink-muted">
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
      )}
    </div>
  );
}
