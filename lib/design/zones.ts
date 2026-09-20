/**
 * Finishes on part of a surface.
 *
 * A finish normally covers a room's whole floor or every wall. This module handles the
 * rest: one wall on its own, and a *zone* — a patch of the floor drawn as a rectangle on
 * the plan (tiles on the wet half of a bathroom, a parquet inlay under the table) — clipped
 * to the room so it never leaks under a wall. Every zone is priced by its own area and
 * shown in 2D and 3D alike.
 *
 * Pure geometry.
 */

import { pointOnEdge, polygonAreaM2, polygonBounds, roomEdges, toCounterClockwise } from './planGeometry';
import type { FinishZone, PlanRoom, SceneProduct, SurfaceFinish, Vec2 } from './types';

export interface ZoneRect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

/**
 * Sutherland–Hodgman: the subject polygon cut down to the convex clip polygon. The room may
 * be concave (an L); the clip is always a rectangle here.
 */
export function clipPolygon(subject: Vec2[], clip: Vec2[]): Vec2[] {
  let output = toCounterClockwise(subject);
  const clipper = toCounterClockwise(clip);
  for (let i = 0; i < clipper.length && output.length > 0; i++) {
    const a = clipper[i];
    const b = clipper[(i + 1) % clipper.length];
    const input = output;
    output = [];
    const inside = (p: Vec2) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) >= -1e-9;
    const meet = (p: Vec2, q: Vec2): Vec2 => {
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const denominator = dx * ez - dz * ex;
      if (Math.abs(denominator) < 1e-12) return p;
      const t = ((a.x - p.x) * ez - (a.z - p.z) * ex) / denominator;
      return { x: p.x + dx * t, z: p.z + dz * t };
    };
    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const previous = input[(j - 1 + input.length) % input.length];
      const currentIn = inside(current);
      const previousIn = inside(previous);
      if (currentIn) {
        if (!previousIn) output.push(meet(previous, current));
        output.push(current);
      } else if (previousIn) {
        output.push(meet(previous, current));
      }
    }
  }
  return dedupe(output.map(round3));
}

function dedupe(polygon: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of polygon) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.z - p.z) < 1e-6) continue;
    out.push(p);
  }
  if (out.length > 1 && Math.abs(out[0].x - out[out.length - 1].x) < 1e-6 && Math.abs(out[0].z - out[out.length - 1].z) < 1e-6) out.pop();
  return out;
}

function round3(p: Vec2): Vec2 {
  return { x: Math.round(p.x * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 };
}

export const MIN_ZONE_AREA_M2 = 0.05;

/** The part of the room a drawn rectangle covers, or null when it misses the room. */
export function zoneFromRect(room: PlanRoom, rect: ZoneRect, id: string, name?: string): FinishZone | null {
  const clip: Vec2[] = [
    { x: rect.x, z: rect.z },
    { x: rect.x + rect.width, z: rect.z },
    { x: rect.x + rect.width, z: rect.z + rect.depth },
    { x: rect.x, z: rect.z + rect.depth },
  ];
  const polygon = clipPolygon(room.polygon, clip);
  if (polygon.length < 3 || polygonAreaM2(polygon) < MIN_ZONE_AREA_M2) return null;
  return { id, polygon, ...(name ? { name } : {}) };
}

export type ZoneHalf = 'left' | 'right' | 'top' | 'bottom';

/** Half the room, split across its middle. */
export function halfZone(room: PlanRoom, half: ZoneHalf, id: string): FinishZone | null {
  const b = polygonBounds(room.polygon);
  const rect: ZoneRect =
    half === 'left'
      ? { x: b.minX, z: b.minZ, width: b.width / 2, depth: b.depth }
      : half === 'right'
        ? { x: b.minX + b.width / 2, z: b.minZ, width: b.width / 2, depth: b.depth }
        : half === 'top'
          ? { x: b.minX, z: b.minZ, width: b.width, depth: b.depth / 2 }
          : { x: b.minX, z: b.minZ + b.depth / 2, width: b.width, depth: b.depth / 2 };
  return zoneFromRect(room, rect, id);
}

/** A strip along one wall, `depthM` into the room — the splash zone behind a kitchen run. */
export function wallStripZone(room: PlanRoom, wallIndex: number, depthM: number, id: string): FinishZone | null {
  const edge = roomEdges(room.polygon).find((e) => e.index === wallIndex);
  if (!edge) return null;
  const a = pointOnEdge(edge, 0);
  const b = pointOnEdge(edge, 1);
  const polygon: Vec2[] = [a, b, { x: b.x + edge.inward.x * depthM, z: b.z + edge.inward.z * depthM }, { x: a.x + edge.inward.x * depthM, z: a.z + edge.inward.z * depthM }];
  const clipped = clipPolygon(room.polygon, polygon);
  if (clipped.length < 3 || polygonAreaM2(clipped) < MIN_ZONE_AREA_M2) return null;
  return { id, polygon: clipped };
}

export function zoneAreaM2(zone: FinishZone): number {
  return Math.round(polygonAreaM2(zone.polygon) * 100) / 100;
}

/** Square metres of one wall of a room, less the doors and windows on it. */
export function wallEdgeAreaM2(room: PlanRoom, wallIndex: number): number {
  const edge = roomEdges(room.polygon).find((e) => e.index === wallIndex);
  if (!edge) return 0;
  const gross = edge.length * room.heightM;
  const openings = room.openings.filter((o) => o.wallIndex === wallIndex).reduce((s, o) => s + o.widthM * o.heightM, 0);
  return Math.max(0.1, Math.round((gross - openings) * 10) / 10);
}

/** True for a room's base finish (all of a surface), false for a single wall, a strip of one, a zone or painted tiles. */
export function isBaseFinish(finish: SurfaceFinish): boolean {
  return finish.wallIndex == null && !finish.zone && !finish.cells;
}

/**
 * The finish that applies to one wall of a room: the wall's own if it has one, else the
 * room's base finish for its walls.
 */
export function wallFinishFor(finishes: SurfaceFinish[], roomId: string, wallIndex: number): SurfaceFinish | undefined {
  // Neither a painted strip of the wall (`span`) nor a painted square metre of it (`cells`)
  // is the wall's finish; both lie on top of it. Forgetting the second painted the whole
  // wall the first time the 1 m² brush touched it.
  return (
    finishes.find((f) => f.roomId === roomId && f.surface === 'wall' && f.wallIndex === wallIndex && !f.span && !f.cells) ??
    finishes.find((f) => f.roomId === roomId && f.surface === 'wall' && isBaseFinish(f))
  );
}

export function floorZones(finishes: SurfaceFinish[], roomId: string): SurfaceFinish[] {
  return finishes.filter((f) => f.roomId === roomId && f.surface === 'floor' && !!f.zone);
}

export interface FinishCoverage {
  product: SceneProduct;
  /**
   * How much of it, over every room, wall, strip, zone and tile it is on: square metres —
   * or running metres, for a skirting board or a cornice (`unit`).
   */
  areaM2: number;
  unit: 'm2' | 'linear_m';
  total: number;
  rooms: string[];
}

/** Every finish product in the scene with what it covers — the "Bathroom tiles — 12.4 m²" list. */
export function finishCoverage(finishes: SurfaceFinish[]): FinishCoverage[] {
  const byProduct = new Map<number, FinishCoverage>();
  for (const finish of finishes) {
    if (!finish.product) continue;
    const unit = finish.surface === 'skirting' || finish.surface === 'cornice' ? 'linear_m' : 'm2';
    const entry = byProduct.get(finish.product.productId) ?? { product: finish.product, areaM2: 0, unit, total: 0, rooms: [] };
    entry.areaM2 = Math.round((entry.areaM2 + finish.product.qty) * 100) / 100;
    entry.total = Math.round((entry.total + finish.product.totalPrice) * 100) / 100;
    if (!entry.rooms.includes(finish.roomId)) entry.rooms.push(finish.roomId);
    byProduct.set(finish.product.productId, entry);
  }
  return [...byProduct.values()].sort((a, b) => b.areaM2 - a.areaM2);
}
