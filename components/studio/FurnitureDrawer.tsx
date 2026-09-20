'use client';

/**
 * What is already standing in the room, as a drawer rather than a panel.
 *
 * It began as a full-height card beside the furniture shelf, which is a lot of canvas to
 * give up for a list you glance at. Now it is one line — what it is, how many pieces, what
 * they come to — and it slides open when you want the list, over the canvas and not beside
 * it.
 */

import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown, Sofa } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn, formatGEL } from '@/lib/utils';
import type { PlacedItem, PlanRoom } from '@/lib/design/types';
import { RoomItemsPanel } from './RoomItemsPanel';

export function FurnitureDrawer({ items, rooms, focusRoomId, selectedItemId, roomLabel, onSelect, onRemove, className }: { items: PlacedItem[]; rooms: PlanRoom[]; focusRoomId: string | null; selectedItemId: string | null; roomLabel: string; onSelect: (id: string) => void; onRemove: (id: string) => void; className?: string }) {
  const t = useT();
  const shown = focusRoomId ? items.filter((i) => i.roomId === focusRoomId) : items;
  const total = shown.reduce((sum, i) => sum + (i.product?.totalPrice ?? 0), 0);

  return (
    <Accordion.Root type="single" collapsible className={cn('glass overflow-hidden rounded-[16px] animate-fade-in', className)}>
      <Accordion.Item value="items">
        <Accordion.Header>
          <Accordion.Trigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left">
            <Sofa className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold leading-tight text-ink">{t.build.placedHere}</span>
              <span className="block truncate text-[11px] text-ink-muted">
                {roomLabel} · {shown.length} {t.design.itemsInRoom}
              </span>
            </span>
            <span className="shrink-0 font-serif text-sm font-semibold tabular-nums text-ink">{formatGEL(total)}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="max-h-[52vh] overflow-y-auto border-t border-line/70 px-3 py-3">
            <RoomItemsPanel items={items} rooms={rooms} focusRoomId={focusRoomId} selectedItemId={selectedItemId} onSelect={onSelect} onRemove={onRemove} />
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
