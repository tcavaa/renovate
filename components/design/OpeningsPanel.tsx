'use client';

import { useState } from 'react';
import { DoorOpen, RectangleHorizontal, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { roomEdges } from '@/lib/design/planGeometry';
import type { Opening, OpeningKind, PlanRoom } from '@/lib/design/types';
import { cn } from '@/lib/utils';

/**
 * Every door and window, editable: which wall, how wide, where along the wall, door or
 * window. Opens on the whole flat — every room listed under its name, each with its own
 * add buttons — and narrows to one room when one is picked. Dragging in the 3D view (or on
 * the 2D plan) does the same as the position slider here.
 *
 * Two layouts: `list`, one card under another for the studio's narrow floating panel, and
 * `grid`, small cards four to a row for the full-width plan review step.
 */
export function OpeningsPanel({
  rooms,
  roomId,
  selectedId,
  onRoom,
  onSelect,
  onAdd,
  onMove,
  onUpdate,
  onWall,
  onRemove,
  showRoomSelect = true,
  layout = 'list',
}: {
  rooms: PlanRoom[];
  /** The room being edited, or null for the whole flat. */
  roomId: string | null;
  selectedId: string | null;
  onRoom: (roomId: string | null) => void;
  onSelect: (openingId: string | null) => void;
  onAdd: (roomId: string, kind: OpeningKind) => boolean;
  onMove: (roomId: string, openingId: string, t: number) => void;
  onUpdate: (roomId: string, openingId: string, patch: Partial<Pick<Opening, 'widthM' | 'kind'>>) => void;
  onWall: (roomId: string, openingId: string, wallIndex: number) => void;
  onRemove: (roomId: string, openingId: string) => void;
  /** The plan review page picks the room on its canvas and hides the select. */
  showRoomSelect?: boolean;
  layout?: 'list' | 'grid';
}) {
  const t = useT();
  const [refused, setRefused] = useState<string | null>(null);
  const shown = roomId ? rooms.filter((r) => r.id === roomId) : rooms;
  const wholeFlat = !roomId;
  const grid = layout === 'grid';

  const add = (room: PlanRoom, kind: OpeningKind) => {
    const ok = onAdd(room.id, kind);
    setRefused(ok ? null : room.id);
    if (!ok) window.setTimeout(() => setRefused((r) => (r === room.id ? null : r)), 2200);
  };

  return (
    <div className={cn('flex flex-col gap-3', !grid && 'h-full')}>
      {showRoomSelect && (
        <label className="block">
          <span className="eyebrow">{t.design.chooseRoom}</span>
          <select value={roomId ?? ''} onChange={(e) => onRoom(e.target.value || null)} className="mt-1 h-9 w-full border border-line bg-white px-2 text-sm text-ink focus:border-ink focus:outline-none">
            <option value="">{t.design.wholeFlat}</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!grid && <p className="text-[11px] text-ink-muted">{t.design.openingsHint}</p>}

      <div className={cn('space-y-4', !grid && 'min-h-0 flex-1 overflow-y-auto pr-1')}>
        {shown.map((room) => (
          <section key={room.id}>
            {wholeFlat && (
              <button type="button" onClick={() => onRoom(room.id)} className="mb-2 flex w-full items-baseline justify-between border-b border-line pb-1 text-left">
                <span className="font-serif text-sm font-semibold text-ink">{room.name}</span>
                <span className="text-[11px] tabular-nums text-ink-muted">{room.openings.length}</span>
              </button>
            )}
            <div className={cn(grid ? 'flex flex-wrap items-center justify-between gap-2' : 'grid grid-cols-2 gap-2')}>
              {grid && <p className="min-w-0 flex-1 text-[11px] text-ink-muted">{t.design.openingsHint}</p>}
              <div className={cn(grid ? 'flex shrink-0 gap-2' : 'contents')}>
                <button type="button" onClick={() => add(room, 'door')} className={cn('inline-flex h-8 items-center justify-center gap-1.5 border border-ink bg-ink text-xs font-medium text-white transition-colors hover:border-brand hover:bg-brand', grid && 'px-3')}>
                  <DoorOpen className="h-3.5 w-3.5" />
                  {t.design.addDoor}
                </button>
                <button type="button" onClick={() => add(room, 'window')} className={cn('inline-flex h-8 items-center justify-center gap-1.5 border border-line bg-white text-xs font-medium text-ink transition-colors hover:border-ink', grid && 'px-3')}>
                  <RectangleHorizontal className="h-3.5 w-3.5" />
                  {t.design.addWindow}
                </button>
              </div>
            </div>
            {refused === room.id && (
              <p role="alert" className="mt-2 border border-danger/40 bg-danger/5 px-2 py-1.5 text-[11px] text-danger">
                {t.design.openingRefused}
              </p>
            )}
            <RoomOpenings room={room} selectedId={selectedId} grid={grid} onSelect={onSelect} onMove={onMove} onUpdate={onUpdate} onWall={onWall} onRemove={onRemove} />
          </section>
        ))}
      </div>
    </div>
  );
}

function RoomOpenings({
  room,
  selectedId,
  grid,
  onSelect,
  onMove,
  onUpdate,
  onWall,
  onRemove,
}: {
  room: PlanRoom;
  selectedId: string | null;
  grid: boolean;
  onSelect: (openingId: string | null) => void;
  onMove: (roomId: string, openingId: string, t: number) => void;
  onUpdate: (roomId: string, openingId: string, patch: Partial<Pick<Opening, 'widthM' | 'kind'>>) => void;
  onWall: (roomId: string, openingId: string, wallIndex: number) => void;
  onRemove: (roomId: string, openingId: string) => void;
}) {
  const t = useT();
  const edges = roomEdges(room.polygon);
  const kindLabel = (kind: OpeningKind) => (kind === 'door' ? t.design.door : kind === 'window' ? t.design.window : t.design.archway);

  if (room.openings.length === 0) return <p className="py-4 text-center text-sm text-ink-muted">{t.design.noOpenings}</p>;

  return (
    <ul className={cn(grid ? 'mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4' : 'mt-2 space-y-2')}>
      {room.openings.map((o) => {
        const active = o.id === selectedId;
        const edge = edges.find((e) => e.index === o.wallIndex);
        const maxWidth = Math.max(0.5, (edge?.length ?? 10) - 0.3);
        return (
          <li key={o.id} id={`opening-${o.id}`} className={cn('border bg-white p-2.5 transition-colors', active ? 'border-ink ring-1 ring-ink' : 'border-line')} onClick={() => onSelect(o.id)}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
                {o.kind === 'window' ? <RectangleHorizontal className="h-4 w-4 shrink-0 text-ink-muted" /> : <DoorOpen className="h-4 w-4 shrink-0 text-ink-muted" />}
                <span className="truncate">{kindLabel(o.kind)}</span>
                {o.exterior && <span className="shrink-0 border border-line px-1 text-[9px] uppercase tracking-wide text-ink-muted">ext</span>}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(room.id, o.id);
                }}
                aria-label={t.design.removeItem}
                className="grid h-7 w-7 shrink-0 place-items-center text-ink-faint hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <label className="block">
                <span className="text-ink-muted">{t.design.wallN.replace('{n}', '')}</span>
                <select value={o.wallIndex} onChange={(e) => onWall(room.id, o.id, Number(e.target.value))} onClick={(e) => e.stopPropagation()} className="mt-0.5 h-8 w-full border border-line bg-white px-1.5 text-xs text-ink focus:border-ink focus:outline-none">
                  {edges.map((e, i) => (
                    <option key={e.index} value={e.index}>
                      {fill(t.design.wallN, { n: i + 1 })} · {e.length.toFixed(1)} {t.units.m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-ink-muted">{t.design.openingWidth}</span>
                <input type="number" min={0.5} max={maxWidth} step={0.05} value={o.widthM} onChange={(e) => onUpdate(room.id, o.id, { widthM: Number(e.target.value) || o.widthM })} onClick={(e) => e.stopPropagation()} className="mt-0.5 h-8 w-full border border-line bg-white px-1.5 text-xs tabular-nums text-ink focus:border-ink focus:outline-none" />
              </label>
            </div>

            <label className="mt-2 block text-[11px]">
              <span className="flex items-center justify-between text-ink-muted">
                <span>{t.design.openingPosition}</span>
                <span className="tabular-nums">{edge ? `${(o.t * edge.length).toFixed(2)} ${t.units.m}` : ''}</span>
              </span>
              <input type="range" min={0} max={1} step={0.005} value={o.t} onChange={(e) => onMove(room.id, o.id, Number(e.target.value))} onClick={(e) => e.stopPropagation()} className="mt-1 w-full accent-ink" />
            </label>

            {o.kind !== 'archway' && (
              <div className="mt-2 flex gap-1">
                {(['door', 'window'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (k !== o.kind) onUpdate(room.id, o.id, { kind: k });
                    }}
                    className={cn('flex-1 border py-1 text-[11px] transition-colors', o.kind === k ? 'border-ink bg-ink text-white' : 'border-line text-ink-soft hover:border-ink')}
                  >
                    {kindLabel(k)}
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
