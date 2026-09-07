'use client';

import { useRef, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { roomTypeLabel } from '@/lib/i18n/labels';
import { formatM2 } from '@/lib/utils';
import { LAYOUT_GRID_M, layoutBounds, overlappingRoomIds, snap } from '@/lib/calculator/layout';
import type { Room } from '@/lib/calculator/types';
import { cn } from '@/lib/utils';

export interface DrawnRect {
  x: number;
  z: number;
  width: number;
  length: number;
}

/**
 * The flat as rectangles on a grid, in metres. Rooms move by dragging (snapped to the grid);
 * in draw mode a drag on empty space becomes a new room. Plain SVG with a metre-sized
 * viewBox, so the same code renders at any width and the maths stays in metres.
 */
export function RoomLayoutEditor({
  rooms,
  selectedId,
  onSelect,
  onMove,
  onDraw,
  className,
}: {
  rooms: Room[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  /** When given, dragging on empty space draws a room. */
  onDraw?: (rect: DrawnRect) => void;
  className?: string;
}) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dz: number; x: number; z: number } | null>(null);
  const [draft, setDraft] = useState<{ x0: number; z0: number; x1: number; z1: number } | null>(null);

  const placed = rooms.filter((r) => typeof r.x === 'number' && typeof r.z === 'number');
  const bounds = layoutBounds(rooms);
  const overlaps = overlappingRoomIds(rooms);

  /** Pointer position in plan metres. */
  const toWorld = (e: React.PointerEvent): { x: number; z: number } => {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, z: 0 };
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const w = p.matrixTransform(ctm.inverse());
    return { x: w.x, z: w.y };
  };

  const startRoomDrag = (e: React.PointerEvent, room: Room) => {
    e.stopPropagation();
    const w = toWorld(e);
    onSelect(room.id);
    setDrag({ id: room.id, dx: w.x - (room.x as number), dz: w.z - (room.z as number), x: room.x as number, z: room.z as number });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const startDraw = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as Element).hasAttribute('data-canvas')) return;
    onSelect(null);
    if (!onDraw) return;
    const w = toWorld(e);
    setDraft({ x0: snap(w.x), z0: snap(w.z), x1: snap(w.x), z1: snap(w.z) });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (drag) {
      const w = toWorld(e);
      setDrag({ ...drag, x: Math.max(0, snap(w.x - drag.dx)), z: Math.max(0, snap(w.z - drag.dz)) });
    } else if (draft) {
      const w = toWorld(e);
      setDraft({ ...draft, x1: Math.max(0, snap(w.x)), z1: Math.max(0, snap(w.z)) });
    }
  };

  const finish = () => {
    if (drag) {
      onMove(drag.id, drag.x, drag.z);
      setDrag(null);
    } else if (draft && onDraw) {
      const x = Math.min(draft.x0, draft.x1);
      const z = Math.min(draft.z0, draft.z1);
      const width = Math.abs(draft.x1 - draft.x0);
      const length = Math.abs(draft.z1 - draft.z0);
      setDraft(null);
      if (width >= 1 && length >= 1) onDraw({ x, z, width, length });
    }
  };

  const draftRect = draft
    ? { x: Math.min(draft.x0, draft.x1), z: Math.min(draft.z0, draft.z1), width: Math.abs(draft.x1 - draft.x0), length: Math.abs(draft.z1 - draft.z0) }
    : null;

  return (
    <div className={cn('relative border border-line bg-white', className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${bounds.width} ${bounds.depth}`}
        className={cn('block h-auto w-full touch-none select-none', onDraw ? 'cursor-crosshair' : 'cursor-default')}
        style={{ aspectRatio: `${bounds.width} / ${bounds.depth}` }}
        onPointerDown={startDraw}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        data-canvas
      >
        <defs>
          <pattern id="grid-minor" width={LAYOUT_GRID_M} height={LAYOUT_GRID_M} patternUnits="userSpaceOnUse">
            <path d={`M ${LAYOUT_GRID_M} 0 L 0 0 0 ${LAYOUT_GRID_M}`} fill="none" stroke="#E3DCD2" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          </pattern>
          <pattern id="grid-major" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="url(#grid-minor)" />
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#D6CCBE" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
          </pattern>
        </defs>
        <rect width={bounds.width} height={bounds.depth} fill="url(#grid-major)" data-canvas />

        {placed.map((room) => {
          const dragging = drag?.id === room.id;
          const x = dragging ? drag.x : (room.x as number);
          const z = dragging ? drag.z : (room.z as number);
          const active = room.id === selectedId;
          const bad = overlaps.has(room.id);
          const fontSize = Math.max(0.22, Math.min(0.4, room.width / 10));
          return (
            <g key={room.id} className="cursor-move" onPointerDown={(e) => startRoomDrag(e, room)}>
              <rect
                x={x}
                y={z}
                width={room.width}
                height={room.length}
                fill={bad ? 'rgba(239,68,68,0.10)' : active ? 'rgba(22,21,19,0.08)' : room.isWetRoom ? 'rgba(110,150,190,0.12)' : 'rgba(233,226,216,0.6)'}
                stroke={bad ? '#EF4444' : active ? '#161513' : '#3A3733'}
                strokeWidth={active ? 2.5 : 1.5}
                vectorEffect="non-scaling-stroke"
              />
              <text x={x + room.width / 2} y={z + room.length / 2 - fontSize * 0.2} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill="#161513" style={{ pointerEvents: 'none' }}>
                {room.nameKa}
              </text>
              <text x={x + room.width / 2} y={z + room.length / 2 + fontSize * 1.1} textAnchor="middle" fontSize={fontSize * 0.75} fill="#6F6A63" style={{ pointerEvents: 'none' }}>
                {formatM2(room.floorM2)} · {roomTypeLabel(t, room.type)}
              </text>
            </g>
          );
        })}

        {draftRect && draftRect.width > 0 && draftRect.length > 0 && (
          <rect x={draftRect.x} y={draftRect.z} width={draftRect.width} height={draftRect.length} fill="rgba(232,93,38,0.12)" stroke="#E85D26" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
        )}
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 text-[11px] text-ink-muted">
        <span className="bg-white/90 px-2 py-1">{onDraw ? t.calculator.drawHint : t.calculator.layoutHint}</span>
      </div>
      {draftRect && draftRect.width >= 1 && draftRect.length >= 1 && (
        <div className="pointer-events-none absolute right-3 top-3 bg-ink px-2 py-1 text-[11px] tabular-nums text-white">
          {draftRect.width.toFixed(2)} × {draftRect.length.toFixed(2)} {t.units.m} · {formatM2(draftRect.width * draftRect.length)}
        </div>
      )}
      {overlaps.size > 0 && <div className="pointer-events-none absolute right-3 bottom-3 border border-danger/40 bg-white/95 px-2 py-1 text-[11px] text-danger">{t.calculator.overlapWarning}</div>}
    </div>
  );
}
