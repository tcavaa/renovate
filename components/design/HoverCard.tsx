'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { ItemCard } from '@/components/design/ItemCard';
import type { PlacedItem } from '@/lib/design/types';

export interface HoverCardHandle {
  show: (item: PlacedItem, screen: { x: number; y: number }) => void;
  hide: () => void;
}

/**
 * The product card that follows the pointer over a piece of furniture.
 *
 * Owns its own state behind an imperative handle so that the pointer-move firehose from the
 * viewer re-renders this one small component and not the whole studio page — the room list,
 * the swap panel and the viewer props all stayed still while the card moved.
 */
export const HoverCard = forwardRef<HoverCardHandle>(function HoverCard(_props, ref) {
  const [hovered, setHovered] = useState<{ item: PlacedItem; screen: { x: number; y: number } } | null>(
    null
  );

  useImperativeHandle(
    ref,
    () => ({
      show: (item, screen) => setHovered({ item, screen }),
      hide: () => setHovered(null),
    }),
    []
  );

  if (!hovered) return null;
  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: Math.min(hovered.screen.x + 16, window.innerWidth - 300),
        top: Math.min(hovered.screen.y + 16, window.innerHeight - 260),
      }}
    >
      <ItemCard item={hovered.item} />
    </div>
  );
});
