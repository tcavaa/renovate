'use client';

/**
 * What is already standing in the room, while the furniture shelf is open.
 *
 * Browsing the catalogue without this meant counting chairs in the 3D view to know whether
 * the room had one already. The list is the room's own when a room is in focus and the whole
 * flat grouped by room otherwise; each row is the piece's picture, its name, its shop's
 * price and a delete, and clicking one selects it in the view.
 */

import Image from 'next/image';
import { Trash2 } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import { archetypeLabel } from '@/lib/design/catalog';
import { cn, formatGEL } from '@/lib/utils';
import type { PlacedItem, PlanRoom } from '@/lib/design/types';

export function RoomItemsPanel({ items, rooms, focusRoomId, selectedItemId, onSelect, onRemove }: { items: PlacedItem[]; rooms: PlanRoom[]; focusRoomId: string | null; selectedItemId: string | null; onSelect: (id: string) => void; onRemove: (id: string) => void }) {
  const t = useT();
  const locale = useLocale();
  const shown = focusRoomId ? items.filter((i) => i.roomId === focusRoomId) : items;
  // One group per room, in the plan's order, so the flat reads top to bottom as it is drawn.
  const groups = (focusRoomId ? rooms.filter((r) => r.id === focusRoomId) : rooms)
    .map((room) => ({ room, items: shown.filter((i) => i.roomId === room.id) }))
    .filter((g) => g.items.length > 0);

  if (shown.length === 0) {
    return <p className="rounded-[12px] border border-dashed border-line p-4 text-center text-xs text-ink-muted">{t.build.nothingPlacedYet}</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map(({ room, items: roomItems }) => (
        <div key={room.id} className="space-y-1">
          {!focusRoomId && <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{room.name}</p>}
          {roomItems.map((item) => {
            const name = item.product ? localizedName(locale, item.product) : archetypeLabel(item.kind, locale);
            return (
              <div key={item.id} className={cn('flex items-center gap-2 rounded-[10px] border p-1.5 transition-colors', item.id === selectedItemId ? 'border-brand bg-brand/5' : 'border-line bg-white hover:border-ink')}>
                <button type="button" onClick={() => onSelect(item.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-[7px] bg-bg-base">
                    {item.product?.imageUrl ? (
                      <Image src={item.product.imageUrl} alt="" fill sizes="36px" className="object-cover" />
                    ) : (
                      <span className="block h-full w-full" style={{ backgroundColor: item.product?.colorHex ?? '#DDD8CF' }} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">{name}</span>
                    <span className="block truncate text-[10px] tabular-nums text-ink-muted">
                      {item.product ? formatGEL(item.product.totalPrice) : '—'}
                    </span>
                  </span>
                </button>
                <button type="button" onClick={() => onRemove(item.id)} disabled={item.locked} title={t.design.removeItem} aria-label={t.design.removeItem} className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
