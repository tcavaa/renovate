'use client';

/**
 * What of the estimate is actually being bought here.
 *
 * The estimate is what the work costs; the order is what the person wants the platform to
 * fetch for them. They are not the same list — somebody already has the tiles, or would
 * rather buy the sofa themselves — so every product line carries a tick, and what is ticked
 * off stays in the estimate and leaves the order. The same bargain the design's budget makes.
 */

import Image from 'next/image';
import { Check } from 'lucide-react';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL, formatNumber, formatUnit } from '@/lib/utils';
import type { Room, SelectedProduct } from '@/lib/calculator/types';

export function OrderPicks({ rooms }: { rooms: Room[] }) {
  const t = useT();
  const locale = useLocale();
  const selectedProducts = useCalculatorStore((s) => s.selectedProducts);
  const selectedFurniture = useCalculatorStore((s) => s.selectedFurniture);
  const toggleExcluded = useCalculatorStore((s) => s.toggleExcluded);
  const includeAll = useCalculatorStore((s) => s.includeAll);

  const roomName = new Map(rooms.map((r) => [r.id, r.nameKa]));
  const materials = Object.entries(selectedProducts);
  const furniture = Object.entries(selectedFurniture).flatMap(([roomId, list]) => list.map((p) => [roomId, p] as const));
  if (materials.length === 0 && furniture.length === 0) return null;

  const all: Array<{ key: string; roomId?: string; pick: SelectedProduct; where: string | null }> = [
    ...materials.map(([key, pick]) => ({ key, pick, where: pick.roomId ? roomName.get(pick.roomId) ?? null : null })),
    ...furniture.map(([roomId, pick]) => ({ key: String(pick.productId), roomId, pick, where: roomName.get(roomId) ?? null })),
  ];
  const ordered = all.filter((l) => !l.pick.excluded);
  const out = all.filter((l) => l.pick.excluded);
  const orderTotal = ordered.reduce((s, l) => s + l.pick.totalPrice, 0);
  const outTotal = out.reduce((s, l) => s + l.pick.totalPrice, 0);

  const row = ({ key, roomId, pick, where }: (typeof all)[number]) => {
    const off = !!pick.excluded;
    return (
      <li key={`${roomId ?? 'm'}-${key}`} className={cn('flex items-center gap-3 border-t border-line/70 px-4 py-2.5', off && 'text-ink-faint')}>
        <button
          type="button"
          role="checkbox"
          aria-checked={!off}
          onClick={() => toggleExcluded(key, roomId)}
          aria-label={`${t.build.includeInOrder} — ${localizedName(locale, pick)}`}
          className={cn('grid h-4 w-4 shrink-0 place-items-center border transition-colors', off ? 'border-line bg-white' : 'border-ink bg-ink text-white')}
        >
          {!off && <Check className="h-3 w-3" />}
        </button>
        <span className="relative block h-9 w-9 shrink-0 overflow-hidden border border-line bg-white">
          {pick.imageUrl && <Image src={pick.imageUrl} alt="" fill sizes="36px" className={cn('object-cover', off && 'opacity-40')} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-medium', off ? 'line-through' : 'text-ink')}>{localizedName(locale, pick)}</span>
          <span className="block truncate text-xs text-ink-muted">
            {[where, `${formatNumber(pick.qty)} ${formatUnit(pick.unit)}`].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', off && 'line-through')}>{formatGEL(pick.totalPrice)}</span>
      </li>
    );
  };

  return (
    <section className="overflow-hidden border border-line bg-bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="eyebrow">{t.calculator.orderPicksTitle}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{out.length === 0 ? t.build.excludedNone : fill(t.build.excludedCount, { n: out.length })}</p>
        </div>
        <div className="text-right">
          <p className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(orderTotal)}</p>
          {out.length > 0 && (
            <button type="button" onClick={includeAll} className="no-print text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink">
              {t.build.includeAll}
            </button>
          )}
        </div>
      </header>
      <ul>{all.map(row)}</ul>
      {out.length > 0 && (
        <p className="flex items-baseline justify-between gap-3 border-t border-line px-4 py-3 text-sm">
          <span className="text-danger">{t.build.excludedTotal}</span>
          <span className="font-medium tabular-nums text-danger">−{formatGEL(outTotal)}</span>
        </p>
      )}
    </section>
  );
}
