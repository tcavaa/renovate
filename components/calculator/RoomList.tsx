'use client';

import { Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { formatM2L, roomTypeLabel } from '@/lib/i18n/labels';
import type { Room } from '@/lib/calculator/types';

/** The rooms entered so far as a hairline ledger: index, name, type, dimensions, area. */
export function RoomList({ rooms, onRemove }: { rooms: Room[]; onRemove: (id: string) => void }) {
  const t = useT();
  const totalM2 = rooms.reduce((s, r) => s + r.floorM2, 0);

  return (
    <div className="border border-line bg-bg-surface">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
        <p className="eyebrow">
          {t.rooms.total} <span className="text-ink">{rooms.length}</span>
        </p>
        <p className="text-sm text-ink-muted">
          {t.rooms.totalM2} <span className="ml-1 font-serif text-lg font-semibold text-ink">{formatM2L(t, totalM2)}</span>
        </p>
      </div>

      {rooms.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-ink-muted">{t.rooms.empty}</p>
      ) : (
        <ul>
          {rooms.map((room, i) => (
            <li key={room.id} className="group grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
              <span className="text-xs tabular-nums text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <p className="truncate font-serif text-base font-semibold text-ink">{room.nameKa}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {roomTypeLabel(t, room.type)}
                  {room.isWetRoom && <span className="ml-1.5 border border-line px-1 py-px text-[10px] uppercase tracking-wide">{t.rooms.wet}</span>}
                  <span className="mx-1.5 text-ink-faint">·</span>
                  <span className="tabular-nums">
                    {room.width} × {room.length} × {room.height} {t.units.m}
                  </span>
                </p>
              </div>
              <span className="font-serif text-base font-semibold tabular-nums text-ink">{formatM2L(t, room.floorM2)}</span>
              <button
                type="button"
                onClick={() => onRemove(room.id)}
                aria-label={t.rooms.remove}
                className="grid h-8 w-8 place-items-center text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
