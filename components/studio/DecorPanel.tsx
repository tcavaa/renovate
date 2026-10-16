'use client';

/**
 * The card of a selected wall decor piece — slats, a stone panel, mouldings, niches, a light
 * line… built in code, not a model. What it is and where it stands, the designer's note, then
 * each of its parts (`DecorSlot`) with the materials the catalogue offers for it and, where the
 * material takes paint or a dye, a colour; its light line; and what its materials cost — each
 * measured from the piece as drawn (`piecePurchases`), at the price admin set per m², metre or piece.
 */

import Image from '@/components/ui/image';
import { Check, Lightbulb, Trash2 } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import { unitLabel } from '@/lib/i18n/labels';
import { cn, formatGEL } from '@/lib/utils';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { DecorFamily, DecorParams, DecorPiece, DecorSlot, PlanRoom } from '@/lib/design/types';
import { DECOR_FAMILIES, decorSlots } from '@/lib/design/decor/families';
import { decorMaterialsOf, defaultDecorMaterial } from '@/lib/design/decor/materials';
import { decorWall, paramsOf } from '@/lib/design/decor/layout';
import { piecePurchases } from '@/lib/design/decor/quantities';
import { PAINT_COLORS } from '@/lib/design/styles';
import { Chip } from '@/components/plan/ElementInspector';
import type { Dictionary } from '@/lib/i18n/ka';

/** The colours a paintable part offers: the studio's paints, then a few deeper accents. */
const TINTS = [...Object.values(PAINT_COLORS), '#93A086', '#5E6B57', '#3F4A5A', '#2B2B2C', '#7A4E31', '#B08D57'];

/** Where each family's light line may run. */
const LED_OPTIONS: Partial<Record<DecorFamily, Array<NonNullable<DecorParams['led']>>>> = {
  slats: ['none', 'bottom', 'top', 'halo'],
  slab: ['none', 'halo', 'bottom'],
  panel: ['none', 'bottom', 'top'],
  niche: ['none', 'inside'],
};

export function familyLabel(t: Dictionary, family: DecorFamily): string {
  const map: Record<DecorFamily, string> = { slats: t.decor.fSlats, moulding: t.decor.fMoulding, niche: t.decor.fNiche, slab: t.decor.fSlab, light: t.decor.fLight, panel: t.decor.fPanel, cladding: t.decor.fCladding, mural: t.decor.fMural, tile: t.decor.fTile };
  return map[family];
}

function slotLabel(t: Dictionary, slot: DecorSlot): string {
  const map: Record<DecorSlot, string> = { face: t.decor.sFace, backing: t.decor.sBacking, led: t.decor.sLed, profile: t.decor.sProfile, body: t.decor.sBody, shelf: t.decor.sShelf, surround: t.decor.sSurround, border: t.decor.sBorder, trim: t.decor.sTrim };
  return map[slot];
}

function ledLabel(t: Dictionary, led: NonNullable<DecorParams['led']>): string {
  return { none: t.decor.ledNone, bottom: t.decor.ledBottom, top: t.decor.ledTop, halo: t.decor.ledHalo, inside: t.decor.ledInside }[led];
}

export function DecorPanel({
  piece,
  room,
  catalog,
  onMaterial,
  onColor,
  onParams,
  onRemove,
}: {
  piece: DecorPiece;
  room: PlanRoom;
  catalog: CatalogProduct[];
  onMaterial: (slot: DecorSlot, product: CatalogProduct | null) => void;
  onColor: (slot: DecorSlot, colorHex: string | null) => void;
  onParams: (patch: DecorParams) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const params = paramsOf(piece);
  const wall = decorWall(piece, room);
  const purchases = piecePurchases(piece, room);
  const total = purchases.reduce((sum, line) => sum + line.total, 0);
  const ledOptions = LED_OPTIONS[piece.family];
  const slots = decorSlots(piece.family).filter((slot) => slot !== 'led' || piece.family === 'light' || (params.led && params.led !== 'none'));

  const setLed = (led: NonNullable<DecorParams['led']>) => {
    // Turning the light on needs a light line to buy: the catalogue's first, unless one is chosen.
    if (led !== 'none' && !piece.materials.led?.product) {
      const first = defaultDecorMaterial(catalog, ['led']);
      if (first) onMaterial('led', first);
    }
    onParams({ led });
  };

  return (
    <div className="space-y-3 pb-2">
      <div className="rounded-[10px] border border-line bg-bg-surface p-3">
        <p className="text-[13px] font-semibold leading-tight text-ink">{piece.reference?.concept || familyLabel(t, piece.family)}</p>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          {familyLabel(t, piece.family)} · {piece.wallIndex == null ? t.decor.aroundRoom : t.decor.wall.replace('{n}', String(piece.wallIndex + 1))}
          {wall ? ` · ${wall.width.toFixed(2)} × ${wall.height.toFixed(2)} ${t.units.m}` : ''}
        </p>
        {piece.note && (
          <p className="mt-2 border-l-2 border-brand/40 pl-2 text-[12px] italic leading-snug text-ink-soft">
            <span className="not-italic font-semibold text-ink-muted">{t.decor.note}: </span>
            {piece.note}
          </p>
        )}
      </div>

      {ledOptions && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            <Lightbulb className="h-3 w-3" />
            {t.decor.light}
          </p>
          <div className="flex flex-wrap gap-1">
            {ledOptions.map((led) => (
              <Chip key={led} small active={(params.led ?? 'none') === led} onClick={() => setLed(led)}>
                {ledLabel(t, led)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {slots.map((slot) => {
        const spec = DECOR_FAMILIES[piece.family].slots[slot]!;
        const current = piece.materials[slot];
        const options = decorMaterialsOf(catalog, spec.kinds);
        const tintable = !!current?.specs?.tintable;
        return (
          <div key={slot}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{slotLabel(t, slot)}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {spec.optional && slot !== 'led' && (
                <button
                  type="button"
                  onClick={() => onMaterial(slot, null)}
                  aria-pressed={!current?.product}
                  className={cn('grid aspect-square place-items-center rounded-[8px] border text-[10px] text-ink-muted', !current?.product ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink')}
                >
                  {t.decor.none}
                </button>
              )}
              {options.map((product) => {
                const chosen = current?.product?.productId === product.id;
                return (
                  <button
                    key={product.id}
                    type="button"
                    title={`${localizedName(locale, product)} · ${formatGEL(product.pricePerUnit)} / ${unitLabel(t, product.unit)}`}
                    onClick={() => onMaterial(slot, product)}
                    aria-pressed={chosen}
                    className={cn('relative aspect-square overflow-hidden rounded-[8px] border bg-bg-base', chosen ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink')}
                  >
                    {product.imageUrl ? (
                      <Image src={product.imageUrl} alt={localizedName(locale, product)} fill sizes="56px" className="object-cover" />
                    ) : (
                      <span className="absolute inset-0" style={{ background: product.colorHex ?? '#ddd' }} />
                    )}
                    {chosen && (
                      <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-ink text-white">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {current?.product && (
              <p className="mt-1 truncate text-[11px] text-ink-soft">
                {localizedName(locale, current.product)} · <span className="tabular-nums">{formatGEL(current.product.pricePerUnit)} / {unitLabel(t, current.product.unit)}</span>
              </p>
            )}
            {tintable && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[10px] text-ink-muted">{t.decor.colour}</span>
                <button
                  type="button"
                  title={t.decor.colourOwn}
                  onClick={() => onColor(slot, null)}
                  className={cn('h-5 w-5 rounded-full border bg-[linear-gradient(135deg,#fff_45%,#d33_47%,#d33_53%,#fff_55%)]', !current?.colorHex ? 'border-ink ring-1 ring-ink' : 'border-line')}
                />
                {TINTS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    title={hex}
                    onClick={() => onColor(slot, hex)}
                    className={cn('h-5 w-5 rounded-full border', current?.colorHex?.toLowerCase() === hex.toLowerCase() ? 'border-ink ring-1 ring-ink' : 'border-line')}
                    style={{ background: hex }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-[10px] border border-line bg-white p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t.decor.materials}</p>
        <ul className="space-y-0.5">
          {purchases.map((line) => (
            <li key={line.slot} className="flex justify-between gap-2 text-[12px]">
              <span className="truncate text-ink-soft">{localizedName(locale, line.product)}</span>
              <span className="shrink-0 tabular-nums text-ink">
                {line.qty} {unitLabel(t, line.unit)} · {formatGEL(line.total)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-line pt-2 text-[13px] font-semibold">
          <span>{t.decor.total}</span>
          <span className="font-serif tabular-nums text-brand-dark">{formatGEL(total)}</span>
        </p>
      </div>

      <button type="button" onClick={onRemove} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] border border-danger/30 text-[13px] font-medium text-danger hover:bg-danger/5">
        <Trash2 className="h-4 w-4" />
        {t.decor.remove}
      </button>
    </div>
  );
}
