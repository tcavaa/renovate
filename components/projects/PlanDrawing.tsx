'use client';

import { useEffect, useMemo, useRef } from 'react';
import { drawPlanSheet, sheetMargins } from '@/components/plan/sheet';
import { EDITOR } from '@/components/plan/palette';
import { planFromCalculatorRooms } from '@/lib/design/planGeometry';
import { ensureWalls } from '@/lib/design/walls';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { Room } from '@/lib/calculator/types';
import type { FloorPlan } from '@/lib/design/types';

/**
 * A project's plan as its picture — the hubs' and the profile's project cards, the project
 * page — drawn as the PDF export draws its sheet (`components/plan/sheet`): the walls, the
 * rooms, the doors and windows, each room's area inside it and the flat's sizes chained
 * outside the walls. No names, no furniture, no fittings: at card size they would crowd it.
 *
 * The plan's own when it has rooms, otherwise the calculator's rooms laid out as the plan
 * step places them; either is given walls (`ensureWalls`) so the outlines are drawn as walls.
 * It fills its parent, which sets the size. `bare` leaves the areas and the sizes off — a
 * thumbnail too small to read them. Nothing to draw renders nothing.
 */
export function PlanDrawing({ plan, rooms, bare = false, className }: { plan: FloorPlan | null; rooms: Room[]; bare?: boolean; className?: string }) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sheet = useMemo(() => {
    const source = plan && plan.rooms.length > 0 ? plan : rooms.length > 0 ? planFromCalculatorRooms(rooms) : null;
    if (!source) return null;
    try {
      return ensureWalls(source);
    } catch {
      return source;
    }
  }, [plan, rooms]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !sheet) return;
    const draw = () => {
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx || width < 1 || height < 1) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = EDITOR.roomFill;
      ctx.fillRect(0, 0, width, height);

      const walls = sheet.walls ?? [];
      const reach = Math.max(0, ...walls.map((w) => w.thicknessM / 2));
      const points = [...sheet.rooms.flatMap((r) => r.polygon), ...walls.flatMap((w) => [w.a, w.b])];
      if (points.length === 0) return;
      const minX = Math.min(...points.map((p) => p.x)) - reach;
      const maxX = Math.max(...points.map((p) => p.x)) + reach;
      const minZ = Math.min(...points.map((p) => p.z)) - reach;
      const maxZ = Math.max(...points.map((p) => p.z)) + reach;

      // The chains stand in a margin round the walls; a small card gets a tighter one.
      const gap = bare ? null : width >= 480 ? 22 : 16;
      const edge = bare ? 4 : 6;
      const margin = gap == null ? { top: 0, left: 0, bottom: 0, right: 0 } : sheetMargins(gap);
      const usableW = width - margin.left - margin.right - edge * 2;
      const usableH = height - margin.top - margin.bottom - edge * 2;
      const scale = Math.max(1, Math.min(usableW / Math.max(0.5, maxX - minX), usableH / Math.max(0.5, maxZ - minZ)));
      const transform = {
        scale,
        offsetX: edge + margin.left + (usableW - (maxX - minX) * scale) / 2 - minX * scale,
        offsetY: edge + margin.top + (usableH - (maxZ - minZ) * scale) / 2 - minZ * scale,
      };
      drawPlanSheet(ctx, transform, sheet, { unitM2: t.units.m2, unitM: t.units.m, labels: bare ? 'none' : 'area', dimensionsGap: gap });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [sheet, bare, t]);

  if (!sheet) return null;
  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
    </div>
  );
}
