'use client';

/**
 * Floor and wall finishes. Opens on the whole flat: one picker that applies to every room,
 * then each room listed under its name with what it currently has — a click narrows the
 * panel to that room, where its own picker applies to that room only. Each option is a real
 * catalogue product with its texture as the swatch and its price per square metre; the
 * room's own area does the arithmetic.
 */

import Image from 'next/image';
import { Check, ChevronRight } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import { cn, formatGEL } from '@/lib/utils';
import { pricePerM2, surfaceOptions, type Surface } from '@/lib/design/surfaces';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PlanRoom, StyleId, SurfaceFinish } from '@/lib/design/types';

interface FinishPanelProps {
  /** The room being edited, or null for the whole flat. */
  roomId: string | null;
  /** The surface the user clicked in the 3D view, shown first. */
  surface?: Surface | null;
  rooms: PlanRoom[];
  catalog: CatalogProduct[];
  styleId: StyleId;
  finishes: SurfaceFinish[];
  onRoom: (roomId: string | null) => void;
  onPick: (surface: Surface, product: CatalogProduct | null) => void;
}

const SURFACES: Surface[] = ['floor', 'wall'];

export function FinishPanel({ roomId, surface, rooms, catalog, styleId, finishes, onRoom, onPick }: FinishPanelProps) {
  const t = useT();
  const locale = useLocale();
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const targets = room ? [room] : rooms;
  const ordered: Surface[] = surface ? [surface, ...SURFACES.filter((s) => s !== surface)] : SURFACES;
  const originOf = (s: Surface) =>
    room ? finishes.find((f) => f.roomId === room.id && f.surface === s)?.origin ?? null : null;
  const surfaceLabel = (s: Surface) => (s === 'floor' ? t.design.finishFloor : t.design.finishWall);

  // The product every target room currently has on a surface, or null when they differ or
  // when it is the style default.
  const currentFor = (surface: Surface): number | null | 'mixed' => {
    const ids = targets.map(
      (r) => finishes.find((f) => f.roomId === r.id && f.surface === surface)?.product?.productId ?? null
    );
    return ids.every((id) => id === ids[0]) ? ids[0] : 'mixed';
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <label className="block">
        <span className="eyebrow">{t.design.chooseRoom}</span>
        <select value={roomId ?? ''} onChange={(e) => onRoom(e.target.value || null)} className="mt-1 h-9 w-full border border-line bg-white px-2 text-sm text-ink focus:border-ink focus:outline-none">
          <option value="">{t.design.finishForAllRooms}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-ink-muted">
        {room ? room.name : t.design.finishForAllRooms} · {t.design.finishHint}
      </p>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {ordered.map((s) => {
          const options = surfaceOptions(catalog, s, room, styleId);
          const current = currentFor(s);
          const clicked = surface === s;
          return (
            <section key={s} className={cn(clicked && '-mx-1 rounded-md px-1 ring-1 ring-brand/30')}>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span className={cn(clicked && 'text-brand')}>{surfaceLabel(s)}</span>
                {originOf(s) === 'calculator' && (
                  <span className="bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                    {t.design.finishOriginCalculator}
                  </span>
                )}
              </h4>
              <ul className="grid grid-cols-3 gap-2">
                <li>
                  <Swatch
                    label={t.design.finishDefault}
                    active={current === null}
                    onClick={() => onPick(s, null)}
                  />
                </li>
                {options.map((product) => (
                  <li key={product.id}>
                    <Swatch
                      label={localizedName(locale, product)}
                      price={`${formatGEL(pricePerM2(product))}/${t.design.finishPerM2}`}
                      textureUrl={product.textureUrl}
                      active={current === product.id}
                      onClick={() => onPick(s, product)}
                    />
                  </li>
                ))}
              </ul>
              {options.length === 0 && (
                <p className="text-xs text-ink-muted">{t.design.noAlternatives}</p>
              )}
            </section>
          );
        })}

        {/* The whole flat: every room by name with what it has now, one click to edit it alone. */}
        {!room && (
          <section>
            <h4 className="mb-2 text-sm font-semibold">{t.design.step2}</h4>
            <ul className="divide-y divide-line/70 border border-line bg-white">
              {rooms.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onRoom(r.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-bg-base">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {SURFACES.map((s) => {
                          const finish = finishes.find((f) => f.roomId === r.id && f.surface === s);
                          const name = finish?.product ? localizedName(locale, finish.product) : t.design.finishDefault;
                          return `${surfaceLabel(s)}: ${name}`;
                        }).join(' · ')}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {SURFACES.map((s) => {
                        const finish = finishes.find((f) => f.roomId === r.id && f.surface === s);
                        return (
                          <span key={s} className="relative block h-7 w-7 overflow-hidden border border-line bg-bg-base" style={{ backgroundColor: finish?.colorHex }}>
                            {finish?.textureUrl && <Image src={finish.textureUrl} alt="" fill sizes="28px" className="object-cover" />}
                          </span>
                        );
                      })}
                      <ChevronRight className="h-4 w-4 text-ink-faint" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Swatch({
  label,
  price,
  textureUrl,
  active,
  onClick,
}: {
  label: string;
  price?: string;
  textureUrl?: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={cn(
        'flex w-full flex-col items-stretch overflow-hidden rounded-md border text-left transition-colors',
        active ? 'border-brand ring-1 ring-brand/30' : 'border-line hover:border-brand/40'
      )}
    >
      <span className="relative block aspect-square w-full bg-bg-base">
        {textureUrl ? (
          <Image src={textureUrl} alt={label} fill sizes="96px" className="object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[10px] text-ink-muted">
            —
          </span>
        )}
        {active && (
          <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-brand text-white">
            <Check className="h-3 w-3" />
          </span>
        )}
      </span>
      <span className="block truncate px-1.5 pt-1 text-[11px] font-medium leading-tight text-ink">
        {label}
      </span>
      <span className="block px-1.5 pb-1 text-[10px] text-ink-muted">{price ?? ' '}</span>
    </button>
  );
}
