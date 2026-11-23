'use client';

/**
 * The calculation's furniture picks in the studio: which stand in the 3D design and where, and
 * which do not (Nini's decision 13, `lib/design/pickFit`). A pick moved to another room says so; a
 * pick left out says why — it fitted nowhere, or it was taken out since — and can be placed by hand
 * ("place": the product on the pointer, as from the shelf). Every pick stays in the calculation's
 * list and summary, whatever stands here.
 */

import * as Accordion from '@radix-ui/react-accordion';
import Image from '@/components/ui/image';
import { ChevronDown, ClipboardList } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PickStatus } from '@/lib/design/pickFit';
import type { PlanRoom } from '@/lib/design/types';
import { cn } from '@/lib/utils';

/** A pick as the panel lists it: its status, or one for the whole flat that no slot could take. */
export type PickRow = PickStatus | { index: number; roomId: null; productId: number; state: 'unplaced'; itemId: null; placedIn: null; reason: 'no_fit' };

export function PicksPanel({ rows, rooms, products, onSelect, onPlace, className }: { rows: PickRow[]; rooms: PlanRoom[]; products: CatalogProduct[]; onSelect: (itemId: string) => void; onPlace: (row: PickRow, product: CatalogProduct) => void; className?: string }) {
  const t = useT();
  const locale = useLocale();
  if (rows.length === 0) return null;
  const byId = new Map(products.map((p) => [p.id, p]));
  const roomName = (id: string | null) => (id ? (rooms.find((r) => r.id === id)?.name ?? id) : t.design.wholeFlat);
  const placed = rows.filter((r) => r.state !== 'unplaced').length;
  const open = rows.some((r) => r.state === 'unplaced') ? 'picks' : undefined;

  return (
    <Accordion.Root type="single" collapsible defaultValue={open} className={cn('glass overflow-hidden rounded-2xl animate-fade-in', className)}>
      <Accordion.Item value="picks">
        <Accordion.Header>
          <Accordion.Trigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left">
            <ClipboardList className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold leading-tight tracking-tight text-ink">{t.design.picksTitle}</span>
              <span className={cn('block truncate text-[11px]', placed < rows.length ? 'font-semibold text-danger' : 'text-ink-muted')}>
                {t.design.picksSummary.replace('{placed}', String(placed)).replace('{total}', String(rows.length))}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <ul className="max-h-[40vh] space-y-1 overflow-y-auto border-t border-line/70 px-3 py-3">
            {rows.map((row) => {
              const product = byId.get(row.productId);
              const name = product ? localizedName(locale, product) : `#${row.productId}`;
              const placeable = !!product?.model3dUrl;
              const status =
                row.state === 'placed'
                  ? t.design.pickPlaced.replace('{room}', roomName(row.roomId))
                  : row.state === 'moved'
                    ? t.design.pickMoved.replace('{room}', roomName(row.placedIn)).replace('{from}', roomName(row.roomId))
                    : t.design.pickUnplaced;
              const why = row.state !== 'unplaced' ? null : !placeable ? t.design.pickNoModel : row.reason === 'no_fit' ? t.design.pickNoFit : t.design.pickRemoved;
              const body = (
                <>
                  <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-mist-light">
                    {product?.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="36px" className="object-cover" /> : <span className="block h-full w-full" style={{ backgroundColor: product?.colorHex ?? '#E7E7EA' }} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-ink">{name}</span>
                    <span className={cn('block text-[10px] leading-snug', row.state === 'placed' ? 'text-success' : row.state === 'moved' ? 'text-ink' : 'font-semibold text-danger')}>
                      {status}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={`${row.roomId ?? 'flat'}-${row.index}-${row.productId}`} className={cn('rounded-xl border p-1.5', row.state === 'unplaced' ? 'border-danger/40 bg-danger/5' : 'border-line bg-bg-surface')}>
                  {row.itemId ? (
                    <button type="button" onClick={() => onSelect(row.itemId!)} className="flex w-full min-w-0 items-center gap-2 text-left">
                      {body}
                    </button>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      {body}
                      {placeable && product && (
                        <button type="button" onClick={() => onPlace(row, product)} className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold text-white hover:bg-ink/85">
                          {t.design.pickPlace}
                        </button>
                      )}
                    </div>
                  )}
                  {why && <p className="mt-1 px-0.5 text-[10px] leading-snug text-ink-muted">{why}</p>}
                </li>
              );
            })}
          </ul>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
