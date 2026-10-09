'use client';

/**
 * Side panel for the selected object: what it is, what it costs, who sells it, and every
 * alternative in the catalogue that could take its place.
 */

import { useState } from 'react';
import Image from '@/components/ui/image';
import { Check, ChevronUp, Copy, FlipHorizontal2, Lock, LockOpen, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { ItemCard } from '@/components/design/ItemCard';
import { ProductPageLink } from '@/components/design/ProductPageLink';
import { IconAction } from '@/components/plan/ElementInspector';
import { candidatesFor, type CatalogProduct } from '@/lib/design/matcher';
import { kitchenFacadeM2, kitchenMaterialCandidates } from '@/lib/design/kitchen';
import { fill } from '@/lib/admin/list';
import { formatGEL, formatM2, cn } from '@/lib/utils';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import type { PlacedItem, StyleId } from '@/lib/design/types';

interface SwapPanelProps {
  item: PlacedItem | null;
  catalog: CatalogProduct[];
  styleId: StyleId;
  onSwap: (product: CatalogProduct) => void;
  onRotate: (steps: number) => void;
  /** Turns the piece to an exact angle, in radians — any angle, not only the 45° steps. */
  onRotateTo?: (radians: number) => void;
  onRemove: () => void;
  /** Set when the last rotation was refused because the item no longer fits. */
  rotateBlocked?: boolean;
  /** Flip the piece across its facing axis. */
  onMirror?: () => void;
  /** A copy beside it. */
  onDuplicate?: () => void;
  onLock?: (locked: boolean) => void;
  /** A made-to-measure kitchen: the kitchen maker's material it is made in, priced per m² of façade. */
  onKitchenMaterial?: (product: CatalogProduct) => void;
}

/** The angle as a slider and a number, 0–359°; both write the same rotation. */
function AngleRow({ degrees, onChange, label }: { degrees: number; onChange: (deg: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    setDraft(null);
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onChange(((Math.round(n) % 360) + 360) % 360);
  };
  return (
    <label className="flex items-center gap-2 text-[11px] text-ink-muted">
      <span className="w-10 shrink-0 font-semibold uppercase tracking-wide">{label}</span>
      <input type="range" min={0} max={359} step={1} value={degrees} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="min-w-0 flex-1 accent-ink" />
      <span className="flex shrink-0 items-center gap-0.5">
        <input
          type="number"
          min={0}
          max={359}
          step={1}
          inputMode="numeric"
          value={draft ?? String(degrees)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          }}
          aria-label={label}
          className="h-7 w-14 rounded-[6px] border border-line bg-white px-1.5 text-right text-xs tabular-nums text-ink focus:border-ink focus:outline-none"
        />
        °
      </span>
    </label>
  );
}

export function SwapPanel({
  item,
  catalog,
  styleId,
  onSwap,
  onRotate,
  onRotateTo,
  onRemove,
  rotateBlocked,
  onMirror,
  onDuplicate,
  onLock,
  onKitchenMaterial,
}: SwapPanelProps) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);


  if (!item) {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-dashed border-line bg-bg-surface p-8 text-center">
        <p className="max-w-[200px] text-sm text-ink-muted">{t.design.noSelection}</p>
      </div>
    );
  }

  const alternatives = candidatesFor(item.kind, catalog, styleId);
  const currentId = item.product?.productId;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* The body scrolls on its own; the drawer along the bottom never hides the last button. */}
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
        <ItemCard item={item} variant="panel" />

        {/*
          One row of icons for everything that can be done to the piece: turn it, mirror it,
          copy it, lock it, delete it. The words beside them were what made this panel scroll.
        */}
        <div className="flex items-center gap-1.5">
          <IconAction label={t.design.rotateLeft} onClick={() => onRotate(-1)}>
            <RotateCcw className="h-4 w-4" />
          </IconAction>
          <IconAction label={t.design.rotateRight} onClick={() => onRotate(1)}>
            <RotateCw className="h-4 w-4" />
          </IconAction>
          <span className="w-8 shrink-0 text-center text-[10px] tabular-nums text-ink-muted">{Math.round(((item.rotation * 180) / Math.PI + 360) % 360)}°</span>
          {onMirror && (
            <IconAction label={`${t.build.mirror} · M`} active={!!item.mirrored} onClick={onMirror}>
              <FlipHorizontal2 className="h-4 w-4" />
            </IconAction>
          )}
          {onDuplicate && (
            <IconAction label={`${t.build.duplicate} · Ctrl+D`} onClick={onDuplicate}>
              <Copy className="h-4 w-4" />
            </IconAction>
          )}
          {onLock && (
            <IconAction label={item.locked ? t.build.unlockItem : t.build.lockItem} active={!!item.locked} onClick={() => onLock(!item.locked)}>
              {item.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            </IconAction>
          )}
          {/* The product's own page — the real photos — in a new tab, so the studio stays as it is. */}
          {item.product?.slug && <ProductPageLink slug={item.product.slug} />}
          <span className="ml-auto" />
          <IconAction label={t.design.removeItem} danger onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </IconAction>
        </div>
        {/* Any angle: a slider for the hand and a number for the eye, degrees clockwise from facing +Z. */}
        {onRotateTo && !item.locked && (
          <AngleRow degrees={Math.round(((item.rotation * 180) / Math.PI + 360) % 360)} onChange={(deg) => onRotateTo((deg * Math.PI) / 180)} label={t.design.angle} />
        )}
        {item.locked && <p className="text-[11px] text-ink-muted">{t.build.itemLockedHint}</p>}
        {onKitchenMaterial && <KitchenMaterials item={item} catalog={catalog} styleId={styleId} onPick={onKitchenMaterial} />}
        {rotateBlocked && (
          <p role="alert" className="text-[11px] text-danger">
            {t.design.rotateBlocked}
          </p>
        )}
      </div>

      {/*
        The alternatives live in a drawer along the panel's bottom edge. Closed, it shows its
        title and the first product; scrolling down over it (or tapping the title) slides it up
        over the item card so the whole list gets the panel's height and scrolls inside.
        Scrolling back up from the top of the list closes it again.
      */}
      <section
        aria-expanded={open}
        className={cn('-mx-1 flex min-h-[5.5rem] flex-1 flex-col border-line', open ? 'border-t-0' : 'border-t')}
      >
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
          <span className="text-sm font-semibold text-ink">{t.design.swapTitle}</span>
          <span className="flex items-center gap-1 text-[11px] text-ink-muted">
            {alternatives.length > 0 && <span className="tabular-nums">{alternatives.length}</span>}
            {open ? t.design.swapClose : t.design.swapOpen}
            <ChevronUp className={cn('h-3.5 w-3.5 transition-transform duration-300', open && 'rotate-180')} />
          </span>
        </button>

        {alternatives.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.design.noAlternatives}</p>
        ) : (
          <ul className={cn('min-h-0 flex-1 space-y-1.5 overscroll-contain px-3 pb-3', 'overflow-y-auto')}>
            {alternatives.map((product) => {
              const active = product.id === currentId;
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => onSwap(product)}
                    className={cn(
                      'flex w-full items-center gap-3 border p-2 text-left transition-colors',
                      active ? 'border-ink bg-sand-light' : 'border-line bg-bg-surface hover:border-ink/40'
                    )}
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden bg-bg-base">
                      {product.imageUrl ? (
                        <Image src={product.imageUrl} alt={localizedName(locale, product)} fill sizes="44px" className="object-cover" />
                      ) : (
                        <span className="block h-full w-full" style={{ backgroundColor: product.colorHex ?? '#DDD8CF' }} />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">{localizedName(locale, product)}</span>
                      <span className="block truncate text-[11px] text-ink-muted">{(product.store ? localizedName(locale, product.store) : null) ?? product.brand ?? ''}</span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-semibold tabular-nums text-ink">{formatGEL(product.pricePerUnit)}</span>
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

/**
 * The material a made-to-measure kitchen is made in: the kitchen maker's products, each priced
 * per m² of façade (`lib/design/kitchen`), and what this piece comes to in each. One with a 3D
 * model of this piece's kind says so: chosen, the kitchen is drawn as that model. With none in
 * the catalogue the piece is the market's estimate, and says so.
 */
function KitchenMaterials({ item, catalog, styleId, onPick }: { item: PlacedItem; catalog: CatalogProduct[]; styleId: StyleId; onPick: (product: CatalogProduct) => void }) {
  const t = useT();
  const locale = useLocale();
  const materials = kitchenMaterialCandidates(catalog, styleId);
  const facadeM2 = kitchenFacadeM2(item);
  return (
    <section className="space-y-1.5 rounded-[10px] border border-line bg-bg-base/60 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.kitchenMaterial}</p>
      <p className="text-[11px] leading-snug text-ink-muted">{materials.length > 0 ? fill(t.build.kitchenMaterialHint, { m2: formatM2(facadeM2) }) : t.build.kitchenMaterialNone}</p>
      {materials.length > 0 && (
        <div className="flex flex-col gap-1">
          {materials.map((product) => {
            const active = item.kitchenMaterial?.productId === product.id;
            const drawn = !!product.model3dUrl && (!product.model3dKind || product.model3dKind === item.slot);
            return (
              <button key={product.id} type="button" onClick={() => !active && onPick(product)} aria-pressed={active} className={cn('flex items-center gap-2 rounded-[8px] border bg-white p-1.5 text-left text-[11px] transition-colors', active ? 'border-brand ring-1 ring-brand/30' : 'border-line hover:border-ink')}>
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[6px] bg-bg-base">
                  {product.imageUrl ? (
                    <Image src={product.imageUrl} alt="" fill sizes="36px" className="object-cover" />
                  ) : (
                    <span className="block h-full w-full" style={{ backgroundColor: product.colorHex ?? '#DDD8CF' }} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{localizedName(locale, product)}</span>
                  <span className="flex items-center gap-1.5 truncate tabular-nums text-ink-muted">
                    {formatGEL(product.pricePerUnit)} / {t.units.m2}
                    {drawn && (
                      <span title={t.build.kitchenMaterialModel} className="rounded-[4px] border border-ink/15 px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink">
                        3D
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-semibold tabular-nums text-ink">{formatGEL(Math.round(product.pricePerUnit * facadeM2 * 100) / 100)}</span>
                  {active && <Check className="ml-auto mt-0.5 h-3.5 w-3.5 text-ink" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
