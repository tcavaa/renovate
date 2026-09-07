'use client';

import { useState } from 'react';
import { DoorOpen, RectangleHorizontal, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { roomEdges } from '@/lib/design/planGeometry';
import type { Opening, OpeningKind, PlanRoom } from '@/lib/design/types';
import { cn } from '@/lib/utils';

/**
 * Every door and window of one room, editable: which wall, how wide, where along the wall,
 * door or window. Dragging in the 3D view does the same as the position slider here.
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
}: {
  rooms: PlanRoom[];
  roomId: string;
  selectedId: string | null;
  onRoom: (roomId: string) => void;
  onSelect: (openingId: string | null) => void;
  onAdd: (kind: OpeningKind) => boolean;
  onMove: (openingId: string, t: number) => void;
  onUpdate: (openingId: string, patch: Partial<Pick<Opening, 'widthM' | 'kind'>>) => void;
  onWall: (openingId: string, wallIndex: number) => void;
  onRemove: (openingId: string) => void;
}) {
  const t = useT();
  const [refused, setRefused] = useState(false);
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const edges = roomEdges(room.polygon);
  const kindLabel = (kind: OpeningKind) => (kind === 'door' ? t.design.door : kind === 'window' ? t.design.window : t.design.archway);

  const add = (kind: OpeningKind) => {
    const ok = onAdd(kind);
    setRefused(!ok);
    if (!ok) window.setTimeout(() => setRefused(false), 2200);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <label className="block">
        <span className="eyebrow">{t.design.chooseRoom}</span>
        <select value={roomId} onChange={(e) => onRoom(e.target.value)} className="mt-1 h-9 w-full border border-line bg-white px-2 text-sm text-ink focus:border-ink focus:outline-none">
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => add('door')} className="inline-flex h-9 items-center justify-center gap-1.5 border border-ink bg-ink text-xs font-medium text-white transition-colors hover:bg-brand hover:border-brand">
          <DoorOpen className="h-3.5 w-3.5" />
          {t.design.addDoor}
        </button>
        <button type="button" onClick={() => add('window')} className="inline-flex h-9 items-center justify-center gap-1.5 border border-line bg-white text-xs font-medium text-ink transition-colors hover:border-ink">
          <RectangleHorizontal className="h-3.5 w-3.5" />
          {t.design.addWindow}
        </button>
      </div>
      {refused && (
        <p role="alert" className="border border-danger/40 bg-danger/5 px-2 py-1.5 text-[11px] text-danger">
          {t.design.openingRefused}
        </p>
      )}

      <p className="text-[11px] text-ink-muted">{t.design.openingsHint}</p>

      {room.openings.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t.design.noOpenings}</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {room.openings.map((o) => {
            const active = o.id === selectedId;
            const edge = edges.find((e) => e.index === o.wallIndex);
            const maxWidth = Math.max(0.5, (edge?.length ?? 10) - 0.3);
            return (
              <li key={o.id} className={cn('border bg-white p-2.5 transition-colors', active ? 'border-ink' : 'border-line')} onClick={() => onSelect(o.id)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    {o.kind === 'window' ? <RectangleHorizontal className="h-4 w-4 text-ink-muted" /> : <DoorOpen className="h-4 w-4 text-ink-muted" />}
                    {kindLabel(o.kind)}
                    {o.exterior && <span className="border border-line px-1 text-[9px] uppercase tracking-wide text-ink-muted">ext</span>}
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(o.id); }} aria-label={t.design.removeItem} className="grid h-7 w-7 place-items-center text-ink-faint hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <label className="block">
                    <span className="text-ink-muted">{t.design.wallN.replace('{n}', '')}</span>
                    <select value={o.wallIndex} onChange={(e) => onWall(o.id, Number(e.target.value))} onClick={(e) => e.stopPropagation()} className="mt-0.5 h-8 w-full border border-line bg-white px-1.5 text-xs text-ink focus:border-ink focus:outline-none">
                      {edges.map((e, i) => (
                        <option key={e.index} value={e.index}>
                          {fill(t.design.wallN, { n: i + 1 })} · {e.length.toFixed(1)} {t.units.m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-ink-muted">{t.design.openingWidth}</span>
                    <input type="number" min={0.5} max={maxWidth} step={0.05} value={o.widthM} onChange={(e) => onUpdate(o.id, { widthM: Number(e.target.value) || o.widthM })} onClick={(e) => e.stopPropagation()} className="mt-0.5 h-8 w-full border border-line bg-white px-1.5 text-xs tabular-nums text-ink focus:border-ink focus:outline-none" />
                  </label>
                </div>

                <label className="mt-2 block text-[11px]">
                  <span className="flex items-center justify-between text-ink-muted">
                    <span>{t.design.openingPosition}</span>
                    <span className="tabular-nums">{edge ? `${(o.t * edge.length).toFixed(2)} ${t.units.m}` : ''}</span>
                  </span>
                  <input type="range" min={0} max={1} step={0.005} value={o.t} onChange={(e) => onMove(o.id, Number(e.target.value))} onClick={(e) => e.stopPropagation()} className="mt-1 w-full accent-ink" />
                </label>

                {o.kind !== 'archway' && (
                  <div className="mt-2 flex gap-1">
                    {(['door', 'window'] as const).map((k) => (
                      <button key={k} type="button" onClick={(e) => { e.stopPropagation(); if (k !== o.kind) onUpdate(o.id, { kind: k }); }} className={cn('flex-1 border py-1 text-[11px] transition-colors', o.kind === k ? 'border-ink bg-ink text-white' : 'border-line text-ink-soft hover:border-ink')}>
                        {kindLabel(k)}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
