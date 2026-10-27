/**
 * What the design rules (`lib/design/rules.ts`, docs/design-studio/design-rules.md) say about a
 * flat as it stands: a radiator with furniture in front of it or reaching up to its window's
 * sill, a boiler on an inside wall, a door narrower than its room wants. Warnings, not
 * refusals — the person decides. Also the strips the layout engine keeps clear in front of
 * every radiator (`radiatorKeepouts`).
 *
 * Pure geometry over the plan and the placed items; no React, no store.
 */

import { getArchetype } from './catalog';
import { pointOnEdge, wallEdges, type PlanEdge } from './planGeometry';
import { DEFAULT_SECTION_WIDTH_M, outsideEdges, radiatorPoints, radiatorSections, radiatorWallSpot, windowOver } from './radiators';
import { RADIATOR_FLOOR_GAP_M, RADIATOR_KEEP_CLEAR_M, RADIATOR_SILL_GAP_M, minDoorWidthM } from './rules';
import type { FloorPlan, PlacedItem, TechnicalPoint, Vec2 } from './types';

export type RuleCode = 'radiator_blocked' | 'radiator_under_sill' | 'boiler_not_exterior' | 'door_too_narrow';

export interface RuleViolation {
  code: RuleCode;
  roomId: string;
  itemId?: string;
  pointId?: string;
  openingId?: string;
  /** The measure the rule is about, in metres (a door's width, the gap under a sill). */
  valueM?: number;
  /** What the rule asks for, in metres. */
  limitM?: number;
}

/** A radiator's depth when its product does not say. */
const RADIATOR_DEPTH_M = 0.1;
/** A radiator's height when it has no product: a middling one. */
const RADIATOR_HEIGHT_M = 0.6;

interface Strip {
  roomId: string;
  point: TechnicalPoint;
  /** The strip's four corners on the floor: along the radiator, from the wall out past its front. */
  corners: Vec2[];
  top: number;
}

/** The floor in front of each radiator that is to stay clear: its length plus 5 cm each end, its depth plus 30 cm. */
function radiatorStrips(plan: FloorPlan): Strip[] {
  const out: Strip[] = [];
  for (const point of radiatorPoints(plan)) {
    const spot = radiatorWallSpot(plan, point);
    if (!spot) continue;
    const length = radiatorSections(plan, point) * (point.radiator?.sectionWidthM ?? DEFAULT_SECTION_WIDTH_M) + 0.1;
    const depth = (point.radiator?.depthM ?? RADIATOR_DEPTH_M) + RADIATOR_KEEP_CLEAR_M;
    const { edge } = spot;
    const from = Math.max(0, spot.s - length / 2);
    const to = Math.min(edge.length, spot.s + length / 2);
    const a = pointOnEdge(edge, from / edge.length);
    const b = pointOnEdge(edge, to / edge.length);
    const out1 = (p: Vec2) => ({ x: p.x + edge.inward.x * depth, z: p.z + edge.inward.z * depth });
    out.push({
      roomId: spot.room.id,
      point,
      corners: [a, b, out1(b), out1(a)],
      top: (point.elevationM ?? RADIATOR_FLOOR_GAP_M) + (point.radiator?.heightM ?? RADIATOR_HEIGHT_M),
    });
  }
  return out;
}

/** The strips in front of the radiators as boxes per room, for the layout engine's obstacles. */
export function radiatorKeepouts(plan: FloorPlan): Record<string, Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>> {
  const out: Record<string, Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>> = {};
  for (const strip of radiatorStrips(plan)) {
    const xs = strip.corners.map((c) => c.x);
    const zs = strip.corners.map((c) => c.z);
    (out[strip.roomId] ??= []).push({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
  }
  return out;
}

/** Every rule the flat breaks, room by room. */
export function ruleViolations(plan: FloorPlan, items: PlacedItem[]): RuleViolation[] {
  const out: RuleViolation[] = [];

  // Nothing standing in front of a radiator (a curtain may hang there; a rug lies under).
  for (const strip of radiatorStrips(plan)) {
    const blocker = items.find((item) => {
      if (item.roomId !== strip.roomId || item.slot === 'curtain') return false;
      if (getArchetype(item.kind)?.ghost) return false;
      if (item.elevationM >= strip.top) return false;
      return overlaps(footprint(item), strip.corners);
    });
    if (blocker) out.push({ code: 'radiator_blocked', roomId: strip.roomId, pointId: strip.point.id, itemId: blocker.id });
  }

  // A radiator's top at least 10 cm under its window's sill.
  for (const point of radiatorPoints(plan)) {
    const window = windowOver(plan, point);
    const height = point.radiator?.heightM;
    if (!window || !height) continue;
    const gap = window.sillM - ((point.elevationM ?? RADIATOR_FLOOR_GAP_M) + height);
    if (gap < RADIATOR_SILL_GAP_M - 0.005) out.push({ code: 'radiator_under_sill', roomId: radiatorWallSpot(plan, point)?.room.id ?? point.roomId ?? '', pointId: point.id, valueM: round2(gap), limitM: RADIATOR_SILL_GAP_M });
  }

  // The boiler on an outside wall, where its flue can leave.
  for (const point of plan.technical?.points ?? []) {
    if (point.kind !== 'boiler') continue;
    const room = plan.rooms.find((r) => r.id === point.roomId);
    if (!room) continue;
    const wall = nearestWall(wallEdges(room), point.position);
    if (!wall || wall.distance > 0.5) continue;
    if (!outsideEdges(plan, room).some((e) => e.index === wall.edge.index)) out.push({ code: 'boiler_not_exterior', roomId: room.id, pointId: point.id });
  }

  // Doors 80 cm or wider; 70 cm into a bathroom or a toilet. An interior door is two halves, one
  // per room — the other half is the door of another room at the same spot: it is measured once,
  // against the more lenient of its two rooms.
  const doors = plan.rooms.flatMap((room) => {
    const edges = wallEdges(room);
    return room.openings.flatMap((door) => {
      const edge = door.kind === 'door' ? edges.find((e) => e.index === door.wallIndex) : undefined;
      return edge ? [{ room, door, at: pointOnEdge(edge, door.t) }] : [];
    });
  });
  const seen = new Set<string>();
  for (const { room, door, at } of doors) {
    if (seen.has(door.id)) continue;
    const twin = doors.find((d) => d.room.id !== room.id && !seen.has(d.door.id) && Math.hypot(d.at.x - at.x, d.at.z - at.z) < 0.6);
    seen.add(door.id);
    if (twin) seen.add(twin.door.id);
    const limit = Math.min(minDoorWidthM(room.type), twin ? minDoorWidthM(twin.room.type) : Infinity);
    if (door.widthM < limit - 0.005) out.push({ code: 'door_too_narrow', roomId: room.id, openingId: door.id, valueM: door.widthM, limitM: limit });
  }

  return out;
}

/** An item's footprint on the floor, turned with it. */
function footprint(item: PlacedItem): Vec2[] {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const right = { x: forward.z, z: -forward.x };
  const w = item.size.width / 2;
  const d = item.size.depth / 2;
  return [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
  ].map(([r, f]) => ({ x: item.position.x + right.x * r + forward.x * f, z: item.position.z + right.z * r + forward.z * f }));
}

/** Whether two convex quadrilaterals overlap by more than a hair (separating axes). */
function overlaps(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const axis = { x: -(q.z - p.z), z: q.x - p.x };
      const len = Math.hypot(axis.x, axis.z) || 1;
      const project = (pts: Vec2[]) => pts.map((v) => (v.x * axis.x + v.z * axis.z) / len);
      const pa = project(a);
      const pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) + 0.01 || Math.max(...pb) <= Math.min(...pa) + 0.01) return false;
    }
  }
  return true;
}

function nearestWall(edges: PlanEdge[], point: Vec2): { edge: PlanEdge; distance: number } | null {
  let best: { edge: PlanEdge; distance: number } | null = null;
  for (const edge of edges) {
    const s = Math.max(0, Math.min(edge.length, (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z));
    const distance = Math.hypot(point.x - (edge.a.x + edge.dir.x * s), point.z - (edge.a.z + edge.dir.z * s));
    if (!best || distance < best.distance) best = { edge, distance };
  }
  return best;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
