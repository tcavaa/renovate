'use client';

import { DoorOpen, RectangleHorizontal, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { OpeningKind } from '@/lib/design/types';

/** What a palette tile carries on the `dataTransfer`; the kind rides in a second type so `dragover` can preview it. */
export const OPENING_DRAG_TYPE = 'application/x-renovate-opening';
export const openingDragKindType = (kind: OpeningKind) => `${OPENING_DRAG_TYPE}-${kind}`;

/**
 * One door and one window to pick up and drop onto any wall of the 2D plan. Sits beside the
 * plan on the review step; `PlanCanvas` accepts the drop and adds the opening on the wall
 * nearest to where it was let go.
 */
export function OpeningPalette({ className }: { className?: string }) {
  const t = useT();
  const tiles: Array<{ kind: OpeningKind; icon: LucideIcon; label: string }> = [
    { kind: 'door', icon: DoorOpen, label: t.design.door },
    { kind: 'window', icon: RectangleHorizontal, label: t.design.window },
  ];
  return (
    <div className={cn('flex flex-col gap-2 p-3', className)}>
      <p className="eyebrow">{t.design.openingsTitle}</p>
      {tiles.map(({ kind, icon: Icon, label }) => (
        <div
          key={kind}
          draggable
          role="button"
          aria-label={label}
          onDragStart={(e) => {
            e.dataTransfer.setData(OPENING_DRAG_TYPE, kind);
            e.dataTransfer.setData(openingDragKindType(kind), '1');
            e.dataTransfer.effectAllowed = 'copy';
          }}
          className="flex cursor-grab select-none flex-col items-center gap-1.5 border border-line bg-white px-2 py-3 text-center transition-colors hover:border-ink active:cursor-grabbing"
        >
          <Icon className="h-6 w-6 text-ink" />
          <span className="text-xs font-medium text-ink">{label}</span>
        </div>
      ))}
      <p className="text-[11px] leading-snug text-ink-muted">{t.design.paletteHint}</p>
    </div>
  );
}
