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

const MIN_SIDE_M = 1;

/** Which handle is held: corners scale proportionally, sides change one dimension. */
type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';
const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se'];
const SIDES: Handle[] = ['n', 's', 'w', 'e'];

type Gesture =
  | { kind: 'move'; id: string; dx: number; dz: number; rect: DrawnRect }
  | { kind: 'resize'; id: string; handle: Handle; start: DrawnRect; rect: DrawnRect; ratio: number }
  | { kind: 'draw'; x0: number; z0: number; x1: number; z1: number };

/**
 * The flat as rectangles on a grid, in metres. Rooms move by dragging their middle; the
 * selected room grows handles — corners scale it proportionally, sides change its width or
 * its length. In draw mode a drag on empty space becomes a new room. Plain SVG with a
 * metre-sized viewBox, so the same code renders at any width and the maths stays in metres.
 */
export function RoomLayoutEditor({
  rooms,
  selectedId,
  onSelect,
  onMove,
  onResize,
  onDraw,
  className,
}: {
  rooms: Room[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  onResize?: (id: string, rect: DrawnRect) => void;
  /** When given, dragging on empty space draws a room. */
  onDraw?: (rect: DrawnRect) => void;
  className?: string;
}) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);

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

  const rectOf = (room: Room): DrawnRect => ({ x: room.x as number, z: room.z as number, width: room.width, length: room.length });

  const capture = (e: React.PointerEvent) => (e.currentTarget as Element).setPointerCapture?.(e.pointerId);

  const startMove = (e: React.PointerEvent, room: Room) => {
    e.stopPropagation();
    const w = toWorld(e);
    onSelect(room.id);
    const rect = rectOf(room);
    setGesture({ kind: 'move', id: room.id, dx: w.x - rect.x, dz: w.z - rect.z, rect });
    capture(e);
  };

  const startResize = (e: React.PointerEvent, room: Room, handle: Handle) => {
    e.stopPropagation();
    const rect = rectOf(room);
    setGesture({ kind: 'resize', id: room.id, handle, start: rect, rect, ratio: rect.length / rect.width });
    capture(e);
  };

  const startDraw = (e: React.PointerEvent) => {
    if (!(e.target as Element).hasAttribute('data-canvas')) return;
    onSelect(null);
    if (!onDraw) return;
    const w = toWorld(e);
    setGesture({ kind: 'draw', x0: snap(w.x), z0: snap(w.z), x1: snap(w.x), z1: snap(w.z) });
    capture(e);
  };

  const resized = (g: Extract<Gesture, { kind: 'resize' }>, w: { x: number; z: number }): DrawnRect => {
    const { start, handle } = g;
    const right = start.x + start.width;
    const bottom = start.z + start.length;
    let { x, z, width, length } = start;
    if (CORNERS.includes(handle)) {
      // Proportional: the corner follows the pointer along the diagonal, the opposite corner stays.
      const anchorX = handle.includes('w') ? right : start.x;
      const anchorZ = handle.includes('n') ? bottom : start.z;
      const dx = Math.abs(w.x - anchorX);
      const dz = Math.abs(w.z - anchorZ);
      width = Math.max(MIN_SIDE_M, snap(Math.max(dx, dz / g.ratio)));
      length = Math.max(MIN_SIDE_M, snap(width * g.ratio));
      x = handle.includes('w') ? anchorX - width : anchorX;
      z = handle.includes('n') ? anchorZ - length : anchorZ;
    } else if (handle === 'e') {
      width = Math.max(MIN_SIDE_M, snap(w.x - start.x));
    } else if (handle === 'w') {
      width = Math.max(MIN_SIDE_M, snap(right - w.x));
      x = right - width;
    } else if (handle === 's') {
      length = Math.max(MIN_SIDE_M, snap(w.z - start.z));
    } else if (handle === 'n') {
      length = Math.max(MIN_SIDE_M, snap(bottom - w.z));
      z = bottom - length;
    }
    return { x: Math.max(0, x), z: Math.max(0, z), width, length };
  };

  const move = (e: React.PointerEvent) => {
    if (!gesture) return;
    const w = toWorld(e);
    if (gesture.kind === 'move') {
      setGesture({ ...gesture, rect: { ...gesture.rect, x: Math.max(0, snap(w.x - gesture.dx)), z: Math.max(0, snap(w.z - gesture.dz)) } });
    } else if (gesture.kind === 'resize') {
      setGesture({ ...gesture, rect: resized(gesture, w) });
    } else {
      setGesture({ ...gesture, x1: Math.max(0, snap(w.x)), z1: Math.max(0, snap(w.z)) });
    }
  };

  const finish = () => {
    if (!gesture) return;
    setGesture(null);
    if (gesture.kind === 'move') {
      onMove(gesture.id, gesture.rect.x, gesture.rect.z);
    } else if (gesture.kind === 'resize') {
      if (onResize && (gesture.rect.width !== gesture.start.width || gesture.rect.length !== gesture.start.length || gesture.rect.x !== gesture.start.x || gesture.rect.z !== gesture.start.z)) onResize(gesture.id, gesture.rect);
    } else if (onDraw) {
      const x = Math.min(gesture.x0, gesture.x1);
      const z = Math.min(gesture.z0, gesture.z1);
      const width = Math.abs(gesture.x1 - gesture.x0);
      const length = Math.abs(gesture.z1 - gesture.z0);
      if (width >= MIN_SIDE_M && length >= MIN_SIDE_M) onDraw({ x, z, width, length });
    }
  };

  const draftRect =
    gesture?.kind === 'draw'
      ? { x: Math.min(gesture.x0, gesture.x1), z: Math.min(gesture.z0, gesture.z1), width: Math.abs(gesture.x1 - gesture.x0), length: Math.abs(gesture.z1 - gesture.z0) }
      : null;
  const liveRect = gesture && gesture.kind !== 'draw' ? gesture.rect : null;
  const handleSize = Math.max(0.18, Math.min(0.3, bounds.width / 60));

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
          const live = liveRect && gesture && 'id' in gesture && gesture.id === room.id ? liveRect : rectOf(room);
          const active = room.id === selectedId;
          const bad = overlaps.has(room.id);
          const fontSize = Math.max(0.22, Math.min(0.4, live.width / 10));
          const area = live.width * live.length;
          return (
            <g key={room.id}>
              <g className="cursor-move" onPointerDown={(e) => startMove(e, room)}>
                <rect
                  x={live.x}
                  y={live.z}
                  width={live.width}
                  height={live.length}
                  fill={bad ? 'rgba(239,68,68,0.10)' : active ? 'rgba(22,21,19,0.08)' : room.isWetRoom ? 'rgba(110,150,190,0.12)' : 'rgba(233,226,216,0.6)'}
                  stroke={bad ? '#EF4444' : active ? '#161513' : '#3A3733'}
                  strokeWidth={active ? 2.5 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <text x={live.x + live.width / 2} y={live.z + live.length / 2 - fontSize * 0.2} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill="#161513" style={{ pointerEvents: 'none' }}>
                  {room.nameKa}
                </text>
                <text x={live.x + live.width / 2} y={live.z + live.length / 2 + fontSize * 1.1} textAnchor="middle" fontSize={fontSize * 0.75} fill="#6F6A63" style={{ pointerEvents: 'none' }}>
                  {formatM2(area)} · {roomTypeLabel(t, room.type)}
                </text>
              </g>
              {active && onResize && (
                <g>
                  {[...CORNERS, ...SIDES].map((h) => {
                    const cx = h.includes('w') ? live.x : h.includes('e') ? live.x + live.width : live.x + live.width / 2;
                    const cz = h.includes('n') ? live.z : h.includes('s') ? live.z + live.length : live.z + live.length / 2;
                    const cursor = h === 'n' || h === 's' ? 'ns-resize' : h === 'e' || h === 'w' ? 'ew-resize' : h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize';
                    const corner = CORNERS.includes(h);
                    return (
                      <rect
                        key={h}
                        x={cx - handleSize / 2}
                        y={cz - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        fill={corner ? '#161513' : '#FFFFFF'}
                        stroke="#161513"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor }}
                        onPointerDown={(e) => startResize(e, room, h)}
                      />
                    );
                  })}
                </g>
              )}
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
      {(draftRect && draftRect.width >= MIN_SIDE_M && draftRect.length >= MIN_SIDE_M) || gesture?.kind === 'resize' ? (
        <div className="pointer-events-none absolute right-3 top-3 bg-ink px-2 py-1 text-[11px] tabular-nums text-white">
          {(draftRect ?? liveRect)!.width.toFixed(2)} × {(draftRect ?? liveRect)!.length.toFixed(2)} {t.units.m} · {formatM2((draftRect ?? liveRect)!.width * (draftRect ?? liveRect)!.length)}
        </div>
      ) : null}
      {overlaps.size > 0 && <div className="pointer-events-none absolute bottom-3 right-3 border border-danger/40 bg-white/95 px-2 py-1 text-[11px] text-danger">{t.calculator.overlapWarning}</div>}
    </div>
  );
}
