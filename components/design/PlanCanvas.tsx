'use client';

/**
 * 2D plan renderer.
 *
 * Used on the review step (where the user checks and corrects what the parser found) and as
 * the room switcher inside the studio. Draws to a canvas rather than SVG because a parsed
 * plan can have a lot of vertices and this redraws on every hover.
 *
 * Doors and windows are handles. Press one and drag: along its wall, onto another wall of
 * the same room or of another room (`onMoveOpeningToWall`), or onto the bin the page shows
 * (`trashRef` + `onRemoveOpening`). A door or window dragged in from the palette
 * (`OpeningPalette`, HTML5 drag and drop) lands on the wall nearest to where it is let go
 * (`onDropOpening`). While the pointer is down the canvas draws the opening where it would
 * land itself, so the drag stays smooth however slow the store is; the plan commits on
 * release.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { polygonBounds, polygonCentroid, roomEdges, pointOnEdge, type PlanEdge } from '@/lib/design/planGeometry';
import { OPENING_DEFAULTS, distanceToSegment, nearestWall, projectToEdge, type WallTarget } from '@/lib/design/openings';
import { OPENING_DRAG_TYPE, openingDragKindType } from '@/components/design/OpeningPalette';
import type { FloorPlan, Opening, OpeningKind, PlanRoom, Vec2 } from '@/lib/design/types';

interface PlanCanvasProps {
  plan: FloorPlan;
  selectedRoomId?: string | null;
  hoveredRoomId?: string | null;
  onSelectRoom?: (roomId: string | null) => void;
  onHoverRoom?: (roomId: string | null) => void;
  /** The door or window drawn as selected. */
  selectedOpeningId?: string | null;
  onSelectOpening?: (roomId: string, openingId: string) => void;
  /** Enables dragging doors and windows along their wall; called on release with the new `t`. */
  onMoveOpening?: (roomId: string, openingId: string, t: number) => void;
  /** Lets a dragged opening land on any wall of any room. Returns the id it has afterwards, or null when refused. */
  onMoveOpeningToWall?: (roomId: string, openingId: string, target: WallTarget) => string | null;
  /** Dropping an opening on the bin (`trashRef`) removes it. */
  onRemoveOpening?: (roomId: string, openingId: string) => void;
  /** A door or window dragged in from the palette. Returns the new id, or null when refused. */
  onDropOpening?: (kind: OpeningKind, target: WallTarget) => string | null;
  /** A drop or a move the plan would not accept (a window on a shared wall). */
  onRefused?: () => void;
  /** Told when a drag of an opening starts and ends, so the page can show the bin. */
  onDragState?: (dragging: boolean) => void;
  /** The bin element; a release inside its box removes the dragged opening. */
  trashRef?: React.RefObject<HTMLElement | null>;
  /** Show room name + area labels. */
  labels?: boolean;
  className?: string;
  /** Fixed CSS height in px; omit to fill the container (size it with `className`). */
  height?: number;
}

const COLORS = {
  wall: '#2C3E50',
  fill: '#FFFFFF',
  fillSelected: '#FDF1EC',
  fillHovered: '#F7F4EF',
  stroke: '#C9C3B8',
  door: '#E85D26',
  window: '#5B8FB9',
  selected: '#161513',
  label: '#1A1A1A',
  labelMuted: '#6B7280',
  warn: '#F59E0B',
};

/** How close (CSS px) the pointer has to be to an opening's line to grab it. */
const OPENING_HIT_PX = 9;
/** How close (CSS px) a wall has to be for a drag outside every room to land on it. */
const WALL_REACH_PX = 28;

interface OpeningDrag {
  room: PlanRoom;
  opening: Opening;
  edge: PlanEdge;
  /** Where it would land right now. */
  target: { room: PlanRoom; edge: PlanEdge; t: number };
  moved: boolean;
  overTrash: boolean;
}

/** What the canvas draws for an opening in flight — the drag's target, or the palette's ghost. */
interface Ghost {
  roomId: string;
  wallIndex: number;
  t: number;
  widthM: number;
  kind: OpeningKind;
  /** The existing opening being dragged (not drawn at its old spot). */
  openingId: string | null;
  faded: boolean;
  dashed: boolean;
}

export function PlanCanvas({
  plan,
  selectedRoomId = null,
  hoveredRoomId = null,
  onSelectRoom,
  onHoverRoom,
  selectedOpeningId = null,
  onSelectOpening,
  onMoveOpening,
  onMoveOpeningToWall,
  onRemoveOpening,
  onDropOpening,
  onRefused,
  onDragState,
  trashRef,
  labels = true,
  className,
  height,
}: PlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const dragRef = useRef<OpeningDrag | null>(null);
  /** The opening in flight, mirrored into state only so the canvas redraws. */
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const unitM2 = useT().units.m2;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = height ?? canvas.clientHeight;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (plan.rooms.length === 0) return;

    // Fit the whole flat into the canvas with a margin.
    const all = plan.rooms.flatMap((r) => r.polygon);
    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const minZ = Math.min(...all.map((p) => p.z));
    const maxZ = Math.max(...all.map((p) => p.z));

    const margin = 28;
    const scale = Math.min(
      (cssWidth - margin * 2) / Math.max(0.5, maxX - minX),
      (cssHeight - margin * 2) / Math.max(0.5, maxZ - minZ)
    );
    const offsetX = margin + (cssWidth - margin * 2 - (maxX - minX) * scale) / 2 - minX * scale;
    const offsetY = margin + (cssHeight - margin * 2 - (maxZ - minZ) * scale) / 2 - minZ * scale;
    transformRef.current = { scale, offsetX, offsetY };

    const toScreen = (p: { x: number; z: number }) => ({
      x: p.x * scale + offsetX,
      y: p.z * scale + offsetY,
    });

    const strokeOpening = (edge: PlanEdge, t: number, widthM: number, kind: OpeningKind, active: boolean, alpha = 1, dashed = false) => {
      const halfT = widthM / 2 / edge.length;
      const a = toScreen(pointOnEdge(edge, Math.max(0, t - halfT)));
      const b = toScreen(pointOnEdge(edge, Math.min(1, t + halfT)));
      ctx.save();
      ctx.globalAlpha = alpha;
      if (dashed) ctx.setLineDash([6, 4]);
      if (active) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 9;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = kind === 'window' ? COLORS.window : COLORS.door;
      ctx.lineWidth = active ? 5 : 4.5;
      ctx.lineCap = 'butt';
      ctx.stroke();
      ctx.restore();
    };

    for (const room of plan.rooms) {
      const isSelected = room.id === selectedRoomId;
      const isHovered = room.id === hoveredRoomId;

      ctx.beginPath();
      room.polygon.forEach((p, i) => {
        const s = toScreen(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();

      ctx.fillStyle = isSelected
        ? COLORS.fillSelected
        : isHovered
          ? COLORS.fillHovered
          : COLORS.fill;
      ctx.fill();

      ctx.strokeStyle = isSelected ? COLORS.door : COLORS.wall;
      ctx.lineWidth = isSelected ? 3.5 : 2.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Doors and windows drawn as coloured breaks in the wall line; the one in flight is
      // drawn where it would land instead, the selected one gets a darker outline.
      const edges = roomEdges(room.polygon);
      for (const opening of room.openings) {
        if (ghost?.openingId === opening.id) continue;
        const edge = edges.find((e) => e.index === opening.wallIndex);
        if (!edge) continue;
        strokeOpening(edge, opening.t, opening.widthM, opening.kind, opening.id === selectedOpeningId);
      }

      if (labels) {
        const centre = toScreen(polygonCentroid(room.polygon));
        const bounds = polygonBounds(room.polygon);
        const fits = bounds.width * scale > 64;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (fits) {
          ctx.fillStyle = COLORS.label;
          ctx.font = '600 12px system-ui, sans-serif';
          ctx.fillText(truncate(room.name, 18), centre.x, centre.y - 7);
          ctx.fillStyle = COLORS.labelMuted;
          ctx.font = '11px system-ui, sans-serif';
          ctx.fillText(`${room.areaM2.toFixed(1)} ${unitM2}`, centre.x, centre.y + 8);
        }
        if (room.lowConfidence) {
          ctx.fillStyle = COLORS.warn;
          ctx.beginPath();
          ctx.arc(centre.x, centre.y + (fits ? 24 : 0), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (ghost) {
      const room = plan.rooms.find((r) => r.id === ghost.roomId);
      const edge = room ? roomEdges(room.polygon).find((e) => e.index === ghost.wallIndex) : null;
      if (edge) strokeOpening(edge, ghost.t, ghost.widthM, ghost.kind, true, ghost.faded ? 0.3 : 1, ghost.dashed);
    }
  }, [plan, selectedRoomId, hoveredRoomId, selectedOpeningId, ghost, labels, height, unitM2]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const toWorld = (clientX: number, clientY: number): Vec2 => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = transformRef.current;
    return {
      x: (clientX - rect.left - offsetX) / scale,
      z: (clientY - rect.top - offsetY) / scale,
    };
  };

  const roomAt = (world: Vec2): PlanRoom | null => {
    // Reverse order so a room drawn on top wins the hit.
    for (let i = plan.rooms.length - 1; i >= 0; i--) {
      if (contains(plan.rooms[i], world)) return plan.rooms[i];
    }
    return null;
  };

  /** The door or window under the pointer, if any: nearest to its segment within a few pixels. */
  const openingAt = (clientX: number, clientY: number): { room: PlanRoom; opening: Opening; edge: PlanEdge } | null => {
    if (!canvasRef.current) return null;
    const world = toWorld(clientX, clientY);
    const { scale } = transformRef.current;
    const reach = OPENING_HIT_PX / scale;
    let best: { room: PlanRoom; opening: Opening; edge: PlanEdge; d: number } | null = null;
    for (const room of plan.rooms) {
      const edges = roomEdges(room.polygon);
      for (const opening of room.openings) {
        const edge = edges.find((e) => e.index === opening.wallIndex);
        if (!edge) continue;
        const halfT = opening.widthM / 2 / edge.length;
        const a = pointOnEdge(edge, Math.max(0, opening.t - halfT));
        const b = pointOnEdge(edge, Math.min(1, opening.t + halfT));
        const d = distanceToSegment(world, a, b);
        if (d <= reach && (!best || d < best.d)) best = { room, opening, edge, d };
      }
    }
    return best;
  };

  /**
   * The wall a point wants: inside a room, the nearest of that room's walls (dragging
   * across a room picks its walls, however far); outside every room, the nearest wall
   * within reach of the pointer.
   */
  const wallFor = (world: Vec2, preferRoomId?: string | null): { room: PlanRoom; edge: PlanEdge } | null => {
    const inside = roomAt(world);
    if (inside) return nearestWall([inside], world, Infinity, preferRoomId);
    const { scale } = transformRef.current;
    return nearestWall(plan.rooms, world, WALL_REACH_PX / scale, preferRoomId);
  };

  const overTrash = (clientX: number, clientY: number): boolean => {
    const rect = trashRef?.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const canDrag = !!onMoveOpening || !!onMoveOpeningToWall;
  const interactive = canDrag || !!onSelectOpening;

  const endDrag = () => {
    dragRef.current = null;
    setGhost(null);
    setCursor(undefined);
    onDragState?.(false);
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ ...(height !== undefined ? { height } : {}), cursor, touchAction: 'none' }}
      className={className}
      onPointerDown={(e) => {
        if (!interactive) return;
        const hit = openingAt(e.clientX, e.clientY);
        if (!hit) return;
        e.preventDefault();
        onSelectOpening?.(hit.room.id, hit.opening.id);
        if (!canDrag) return;
        dragRef.current = { room: hit.room, opening: hit.opening, edge: hit.edge, target: { room: hit.room, edge: hit.edge, t: hit.opening.t }, moved: false, overTrash: false };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        setCursor('grabbing');
        onDragState?.(true);
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (drag) {
          const world = toWorld(e.clientX, e.clientY);
          // Any wall when the plan allows it; otherwise the opening stays on its own wall.
          const wall = onMoveOpeningToWall ? wallFor(world, drag.room.id) : null;
          const room = wall?.room ?? drag.room;
          const edge = wall?.edge ?? drag.edge;
          const t = projectToEdge(edge, world, drag.opening.widthM);
          drag.target = { room, edge, t };
          drag.moved = true;
          drag.overTrash = !!onRemoveOpening && overTrash(e.clientX, e.clientY);
          setGhost({ roomId: room.id, wallIndex: edge.index, t, widthM: drag.opening.widthM, kind: drag.opening.kind, openingId: drag.opening.id, faded: drag.overTrash, dashed: false });
          setCursor(drag.overTrash ? 'not-allowed' : 'grabbing');
          return;
        }
        if (interactive) setCursor(openingAt(e.clientX, e.clientY) ? 'grab' : undefined);
        onHoverRoom?.(roomAt(toWorld(e.clientX, e.clientY))?.id ?? null);
      }}
      onPointerUp={(e) => {
        const drag = dragRef.current;
        if (!drag) return;
        endDrag();
        if (!drag.moved) return;
        const { room, edge, t } = drag.target;
        if (drag.overTrash && onRemoveOpening && overTrash(e.clientX, e.clientY)) {
          onRemoveOpening(drag.room.id, drag.opening.id);
          return;
        }
        const sameWall = room.id === drag.room.id && edge.index === drag.opening.wallIndex;
        if (sameWall) {
          if (Math.abs(t - drag.opening.t) <= 1e-4) return;
          if (onMoveOpening) onMoveOpening(drag.room.id, drag.opening.id, t);
          else onMoveOpeningToWall?.(drag.room.id, drag.opening.id, { roomId: room.id, wallIndex: edge.index, t });
          return;
        }
        const id = onMoveOpeningToWall?.(drag.room.id, drag.opening.id, { roomId: room.id, wallIndex: edge.index, t }) ?? null;
        if (id === null) onRefused?.();
        else if (id !== drag.opening.id) onSelectOpening?.(room.id, id);
      }}
      onPointerCancel={endDrag}
      onMouseLeave={() => {
        onHoverRoom?.(null);
        if (!dragRef.current) setCursor(undefined);
      }}
      onClick={(e) => {
        // A press on an opening was handled on pointer down; a click elsewhere picks the room.
        if (interactive && openingAt(e.clientX, e.clientY)) return;
        onSelectRoom?.(roomAt(toWorld(e.clientX, e.clientY))?.id ?? null);
      }}
      // --- a door or window dragged in from the palette ---
      onDragOver={(e) => {
        if (!onDropOpening || !e.dataTransfer.types.includes(OPENING_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        // `getData` is off limits until the drop, so the kind travels as a type of its own.
        const kind: OpeningKind = e.dataTransfer.types.includes(openingDragKindType('window')) ? 'window' : 'door';
        const wall = wallFor(toWorld(e.clientX, e.clientY));
        if (!wall) {
          setGhost(null);
          return;
        }
        const widthM = Math.min(OPENING_DEFAULTS[kind].widthM, Math.max(0.5, wall.edge.length - 0.3));
        const t = projectToEdge(wall.edge, toWorld(e.clientX, e.clientY), widthM);
        setGhost({ roomId: wall.room.id, wallIndex: wall.edge.index, t, widthM, kind, openingId: null, faded: false, dashed: true });
      }}
      onDragLeave={() => {
        if (!dragRef.current) setGhost(null);
      }}
      onDrop={(e) => {
        if (!onDropOpening) return;
        const kind = e.dataTransfer.getData(OPENING_DRAG_TYPE) as OpeningKind | '';
        if (kind !== 'door' && kind !== 'window') return;
        e.preventDefault();
        setGhost(null);
        const world = toWorld(e.clientX, e.clientY);
        const wall = wallFor(world);
        if (!wall) return;
        const widthM = Math.min(OPENING_DEFAULTS[kind].widthM, Math.max(0.5, wall.edge.length - 0.3));
        const t = projectToEdge(wall.edge, world, widthM);
        const id = onDropOpening(kind, { roomId: wall.room.id, wallIndex: wall.edge.index, t });
        if (id === null) onRefused?.();
        else onSelectOpening?.(wall.room.id, id);
      }}
    />
  );
}

function contains(room: PlanRoom, point: { x: number; z: number }): boolean {
  let inside = false;
  const poly = room.polygon;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const hit =
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
