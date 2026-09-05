'use client';

/**
 * 2D plan renderer.
 *
 * Used on the review step (where the user checks and corrects what the parser found) and as
 * the room switcher inside the studio. Draws to a canvas rather than SVG because a parsed
 * plan can have a lot of vertices and this redraws on every hover.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n/client';
import { polygonBounds, polygonCentroid, roomEdges, pointOnEdge } from '@/lib/design/planGeometry';
import type { FloorPlan, PlanRoom } from '@/lib/design/types';

interface PlanCanvasProps {
  plan: FloorPlan;
  selectedRoomId?: string | null;
  hoveredRoomId?: string | null;
  onSelectRoom?: (roomId: string | null) => void;
  onHoverRoom?: (roomId: string | null) => void;
  /** Show room name + area labels. */
  labels?: boolean;
  className?: string;
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
  label: '#1A1A1A',
  labelMuted: '#6B7280',
  warn: '#F59E0B',
};

export function PlanCanvas({
  plan,
  selectedRoomId = null,
  hoveredRoomId = null,
  onSelectRoom,
  onHoverRoom,
  labels = true,
  className,
  height = 420,
}: PlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const unitM2 = useT().units.m2;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = height;
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

      // Doors and windows drawn as coloured breaks in the wall line.
      const edges = roomEdges(room.polygon);
      for (const opening of room.openings) {
        const edge = edges.find((e) => e.index === opening.wallIndex);
        if (!edge) continue;
        const halfT = opening.widthM / 2 / edge.length;
        const a = toScreen(pointOnEdge(edge, Math.max(0, opening.t - halfT)));
        const b = toScreen(pointOnEdge(edge, Math.min(1, opening.t + halfT)));

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = opening.kind === 'window' ? COLORS.window : COLORS.door;
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'butt';
        ctx.stroke();
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
  }, [plan, selectedRoomId, hoveredRoomId, labels, height, unitM2]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const roomAt = (clientX: number, clientY: number): PlanRoom | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = transformRef.current;
    const world = {
      x: (clientX - rect.left - offsetX) / scale,
      z: (clientY - rect.top - offsetY) / scale,
    };
    // Reverse order so a room drawn on top wins the hit.
    for (let i = plan.rooms.length - 1; i >= 0; i--) {
      if (contains(plan.rooms[i], world)) return plan.rooms[i];
    }
    return null;
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ height }}
      className={className}
      onMouseMove={(e) => onHoverRoom?.(roomAt(e.clientX, e.clientY)?.id ?? null)}
      onMouseLeave={() => onHoverRoom?.(null)}
      onClick={(e) => onSelectRoom?.(roomAt(e.clientX, e.clientY)?.id ?? null)}
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
