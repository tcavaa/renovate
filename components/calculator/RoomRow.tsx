'use client';

import { RoomGlyph } from '@/components/calculator/PlanGlyphs';
import { ScrollRow } from '@/components/ui/scroll-row';
import { useT } from '@/lib/i18n/client';
import { roomTypeLabel } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';
import type { Room } from '@/lib/calculator/types';
import type { FloorPlan, Vec2 } from '@/lib/design/types';

/**
 * Every room where it lies: on the calculator's board when it has the rooms, else where the
 * calculator placed each one (its rectangle at `x`/`z`). A room placed nowhere is left out.
 */
export function flatOutlines(board: FloorPlan | null | undefined, rooms: Room[]): Array<{ id: string; polygon: Vec2[] }> {
  if (board?.rooms.length) return board.rooms.map((r) => ({ id: r.id, polygon: r.polygon }));
  return rooms.flatMap((r) =>
    r.x != null && r.z != null
      ? [
          {
            id: r.id,
            polygon: [
              { x: r.x, z: r.z },
              { x: r.x + r.width, z: r.z },
              { x: r.x + r.width, z: r.z + r.length },
              { x: r.x, z: r.z + r.length },
            ],
          },
        ]
      : []
  );
}

/**
 * The calculator's rooms side by side under a step's head — the catalogue's and the
 * furniture's: each with the flat drawn small and itself picked out on it (`RoomGlyph`), its
 * name, and one line of what the step has of it. Sideways on a narrow screen (`ScrollRow`).
 */
export function RoomRow({ title, rooms, board, activeRoomId, onSelect, status }: { title: string; rooms: Room[]; board: FloorPlan | null | undefined; activeRoomId: string | null; onSelect: (roomId: string) => void; /** The line under a room's name, and whether it reads as done. */ status: (room: Room) => { text: string; done: boolean } }) {
  const t = useT();
  const flat = flatOutlines(board, rooms);
  return (
    <div className="mt-6">
      <p className="eyebrow mb-2">{title}</p>
      <ScrollRow contentClassName="gap-2" ariaLabel={title}>
        {rooms.map((r) => {
          const on = activeRoomId === r.id;
          const line = status(r);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              aria-pressed={on}
              className={cn('flex shrink-0 items-center gap-3 border py-2 pl-2 pr-4 text-left transition-colors', on ? 'border-ink bg-bg-surface' : 'border-line bg-bg-surface/60 hover:border-ink/40')}
            >
              <RoomGlyph outlines={flat} roomId={r.id} active={on} />
              <span>
                <span className={cn('block whitespace-nowrap text-sm', on ? 'font-medium text-ink' : 'text-ink-soft')}>{r.nameKa || roomTypeLabel(t, r.type)}</span>
                <span className={cn('block whitespace-nowrap text-xs tabular-nums', line.done ? 'text-success' : 'text-ink-faint')}>{line.text}</span>
              </span>
            </button>
          );
        })}
      </ScrollRow>
    </div>
  );
}
