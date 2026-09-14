'use client';

/**
 * The rooms as cards beside the plan: name, type, height and (for rectangles) size in
 * place, the selected one highlighted, and a small form to add a room by its dimensions —
 * the door for people who would rather type "3.4 × 4.2" than draw it.
 */

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { roomTypeLabel } from '@/lib/i18n/labels';
import { cn, formatM2 } from '@/lib/utils';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import type { RoomType } from '@/lib/calculator/types';
import { findFreeSpot } from '@/lib/calculator/layout';
import type { FloorPlan, PlanRoom } from '@/lib/design/types';
import { ROOM_TINT_STRONG } from './palette';
import { Field, RoomFields, type InspectorActions } from './ElementInspector';

export function RoomsPanel({ plan, selectedId, onSelect, actions, onAddRectangle, locked, className }: { plan: FloorPlan; selectedId: string | null; onSelect: (id: string | null) => void; actions: Pick<InspectorActions, 'updateRoom' | 'resizeRoom' | 'removeRoom'>; onAddRectangle: (rect: { x: number; z: number; width: number; depth: number }, type: RoomType, name?: string) => void; locked?: boolean; className?: string }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<RoomType>('bedroom');
  const [width, setWidth] = useState('3.5');
  const [depth, setDepth] = useState('4');

  const add = () => {
    const w = Number(width.replace(',', '.'));
    const d = Number(depth.replace(',', '.'));
    if (!Number.isFinite(w) || !Number.isFinite(d) || w < 0.8 || d < 0.8) return;
    // A free spot beside what is there, a wall's thickness away so the walls merge.
    const gap = plan.wallThicknessM;
    const rects = plan.rooms.map((r) => {
      const xs = r.polygon.map((p) => p.x);
      const zs = r.polygon.map((p) => p.z);
      return { id: r.id, x: Math.min(...xs) - gap, z: Math.min(...zs) - gap, width: Math.max(...xs) - Math.min(...xs) + gap * 2, length: Math.max(...zs) - Math.min(...zs) + gap * 2 } as unknown as Parameters<typeof findFreeSpot>[0][number];
    });
    const spot = findFreeSpot(rects, w + gap * 2, d + gap * 2, 16);
    onAddRectangle({ x: Math.round((spot.x + gap) * 100) / 100, z: Math.round((spot.z + gap) * 100) / 100, width: w, depth: d }, type);
    setAdding(false);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-ink">{t.build.roomsTitle}</p>
        <p className="text-xs text-ink-muted">{plan.rooms.length}</p>
      </div>
      {plan.rooms.length === 0 && <p className="rounded-[12px] border border-dashed border-line p-4 text-center text-xs text-ink-muted">{t.build.noRoomsYet}</p>}
      <ul className="space-y-2">
        {plan.rooms.map((room) => (
          <RoomCard key={room.id} room={room} plan={plan} active={room.id === selectedId} onSelect={() => onSelect(room.id)} actions={actions} locked={locked} />
        ))}
      </ul>
      {adding ? (
        <div className="space-y-2 rounded-[14px] border border-ink bg-white p-3">
          <Field label={t.rooms.type}>
            <select value={type} onChange={(e) => setType(e.target.value as RoomType)} className="h-9 w-full rounded-[8px] border border-line bg-white px-2 text-sm">
              {(Object.keys(ROOM_TYPES) as RoomType[]).map((k) => (
                <option key={k} value={k}>
                  {roomTypeLabel(t, k)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t.rooms.width}>
              <input type="number" inputMode="decimal" step={0.01} min={0.8} value={width} onChange={(e) => setWidth(e.target.value)} className="h-9 w-full rounded-[8px] border border-line bg-white px-2 text-sm tabular-nums" />
            </Field>
            <Field label={t.rooms.length}>
              <input type="number" inputMode="decimal" step={0.01} min={0.8} value={depth} onChange={(e) => setDepth(e.target.value)} className="h-9 w-full rounded-[8px] border border-line bg-white px-2 text-sm tabular-nums" />
            </Field>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={add} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-ink text-xs font-semibold text-white hover:bg-brand">
              <Plus className="h-4 w-4" />
              {t.rooms.add}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-[10px] border border-line px-3 text-xs text-ink-soft hover:border-ink">
              {t.common.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} disabled={locked} className="flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-line text-xs font-semibold text-ink-soft hover:border-ink hover:text-ink disabled:opacity-50">
          <Plus className="h-4 w-4" />
          {t.build.addRoomBySize}
        </button>
      )}
    </div>
  );
}

function RoomCard({ room, plan, active, onSelect, actions, locked }: { room: PlanRoom; plan: FloorPlan; active: boolean; onSelect: () => void; actions: Pick<InspectorActions, 'updateRoom' | 'resizeRoom' | 'removeRoom'>; locked?: boolean }) {
  const t = useT();
  return (
    <li id={`plan-room-${room.id}`} className={cn('rounded-[14px] border bg-white transition-colors', active ? 'border-ink' : 'border-line hover:border-ink/40')}>
      <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className="h-8 w-8 shrink-0 rounded-[8px]" style={{ backgroundColor: ROOM_TINT_STRONG[room.type] }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{room.name}</span>
          <span className="block truncate text-[11px] text-ink-muted">
            {roomTypeLabel(t, room.type)} · {formatM2(room.areaM2)}
          </span>
        </span>
        {!locked && (
          <span
            role="button"
            tabIndex={0}
            aria-label={t.design.deleteRoom}
            onClick={(e) => {
              e.stopPropagation();
              actions.removeRoom(room.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                actions.removeRoom(room.id);
              }
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-ink-faint hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </span>
        )}
      </button>
      {active && (
        <div className="space-y-2 border-t border-line p-3">
          <RoomFields room={room} plan={plan} actions={actions} locked={locked} compact />
        </div>
      )}
    </li>
  );
}
