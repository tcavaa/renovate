'use client';

/**
 * Floor and wall finishes for the focused room — or for every room when the whole flat is
 * selected. Each option is a real catalogue product with its texture as the swatch and its
 * price per square metre; the room's own area does the arithmetic.
 */

import Image from 'next/image';
import { Check } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn, formatGEL } from '@/lib/utils';
import { pricePerM2, surfaceOptions, type Surface } from '@/lib/design/surfaces';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PlanRoom, StyleId, SurfaceFinish } from '@/lib/design/types';

interface FinishPanelProps {
  roomId: string | null;
  /** The surface the user clicked in the 3D view, shown first. */
  surface?: Surface | null;
  rooms: PlanRoom[];
  catalog: CatalogProduct[];
  styleId: StyleId;
  finishes: SurfaceFinish[];
  onPick: (surface: Surface, product: CatalogProduct | null) => void;
}

const SURFACES: Surface[] = ['floor', 'wall'];

export function FinishPanel({ roomId, surface, rooms, catalog, styleId, finishes, onPick }: FinishPanelProps) {
  const t = useT();
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const targets = room ? [room] : rooms;
  const ordered: Surface[] = surface ? [surface, ...SURFACES.filter((s) => s !== surface)] : SURFACES;
  const originOf = (s: Surface) =>
    room ? finishes.find((f) => f.roomId === room.id && f.surface === s)?.origin ?? null : null;

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
      <div>
        <h3 className="font-serif text-base font-semibold">{t.design.finishesTitle}</h3>
        <p className="text-xs text-ink-muted">
          {room ? room.name : t.design.finishForAllRooms} · {t.design.finishHint}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {ordered.map((s) => {
          const options = surfaceOptions(catalog, s, room, styleId);
          const current = currentFor(s);
          const clicked = surface === s;
          return (
            <section key={s} className={cn(clicked && '-mx-1 rounded-md px-1 ring-1 ring-brand/30')}>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span className={cn(clicked && 'text-brand')}>
                  {s === 'floor' ? t.design.finishFloor : t.design.finishWall}
                </span>
                {originOf(s) === 'calculator' && (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
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
                      label={product.nameKa}
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
      <span className="block px-1.5 pb-1 text-[10px] text-ink-muted">{price ?? ' '}</span>
    </button>
  );
}
