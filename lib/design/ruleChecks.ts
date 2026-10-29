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
import { pointInPolygon, pointOnEdge, roomEdges, wallEdges, type PlanEdge } from './planGeometry';
import { DEFAULT_SECTION_WIDTH_M, outsideEdges, radiatorPoints, radiatorSections, radiatorWallSpot, windowOver } from './radiators';
import {
  BASIN_TOP_M,
  BASIN_TOP_TOLERANCE_M,
  BED_SIDE_FREE_M,
  FACING_COUNTERS_M,
  RADIATOR_FLOOR_GAP_M,
  RADIATOR_KEEP_CLEAR_M,
  RADIATOR_SILL_GAP_M,
  SHOWER_MIN_M,
  SOFA_TV_M,
  SPLASH_ZONE_M,
  WC_SIDE_M,
  WET_ROOM_TYPES,
  entranceSightBands,
  BOILER_WET_CLEAR_M,
  footprintQuad,
  minDoorWidthM,
  quadsOverlap,
  rayToPolygon,
  roomSightBands,
  type Quad,
} from './rules';
import type { ElectricalPoint, FloorPlan, PlacedItem, TechnicalPoint, Vec2 } from './types';

export type RuleCode =
  | 'radiator_blocked'
  | 'radiator_under_sill'
  | 'boiler_not_exterior'
  | 'boiler_by_bath'
  | 'door_too_narrow'
  | 'door_swing_clash'
  | 'door_swing_blocked'
  | 'wc_faces_door'
  | 'kitchen_faces_entrance'
  | 'bed_side_tight'
  | 'sofa_tv_distance'
  | 'counters_too_close'
  | 'shower_too_small'
  | 'wc_side_tight'
  | 'basin_height'
  | 'socket_in_splash';

/** The ones about the building rather than the furniture: the technical step lists these. */
export const TECHNICAL_RULES: RuleCode[] = ['radiator_blocked', 'radiator_under_sill', 'boiler_not_exterior', 'boiler_by_bath', 'door_too_narrow', 'door_swing_clash'];

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

/**
 * Every rule the flat breaks, room by room — the building's (radiators, the boiler, doors) and the
 * furniture's (the brief's layout rules and sizes); `electrical` adds the sockets'.
 */
export function ruleViolations(plan: FloorPlan, items: PlacedItem[], electrical: ElectricalPoint[] = []): RuleViolation[] {
  const out: RuleViolation[] = [];

  // Nothing standing in front of a radiator (a curtain may hang there; a rug lies under).
  for (const strip of radiatorStrips(plan)) {
    const blocker = items.find((item) => {
      if (item.roomId !== strip.roomId || item.slot === 'curtain') return false;
      if (getArchetype(item.kind)?.ghost) return false;
      if (item.elevationM >= strip.top) return false;
      return quadsOverlap(footprintQuad(item), strip.corners);
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

  // The boiler: off an outside wall its flue has to be checked (a shaft or a coaxial flue) — the
  // hall's cupboard, the owner's first place for it, is rarely on one; and never by a shower or a bath.
  for (const point of plan.technical?.points ?? []) {
    if (point.kind !== 'boiler') continue;
    const room = plan.rooms.find((r) => r.id === point.roomId);
    if (!room) continue;
    const wet = items.some(
      (i) => i.roomId === room.id && (i.slot === 'shower' || i.slot === 'bathtub') && pointInPolygon(point.position, footprintQuad({ ...i, size: { ...i.size, width: i.size.width + 2 * BOILER_WET_CLEAR_M, depth: i.size.depth + 2 * BOILER_WET_CLEAR_M } }))
    );
    if (wet) out.push({ code: 'boiler_by_bath', roomId: room.id, pointId: point.id });
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
      return edge ? [{ room, door, at: pointOnEdge(edge, door.t), edge }] : [];
    });
  });
  const seen = new Set<string>();
  for (const { room, door, at, edge } of doors) {
    if (seen.has(door.id)) continue;
    const twin = doors.find((d) => d.room.id !== room.id && !seen.has(d.door.id) && Math.hypot(d.at.x - at.x, d.at.z - at.z) < 0.6);
    seen.add(door.id);
    if (twin) seen.add(twin.door.id);
    // A half not twinned yet: the room behind it is the one just through the wall.
    const probe = { x: at.x - edge.inward.x * 0.3, z: at.z - edge.inward.z * 0.3 };
    const behind = twin?.room ?? plan.rooms.find((r) => r.id !== room.id && pointInPolygon(probe, r.polygon));
    const limit = Math.min(minDoorWidthM(room.type), behind ? minDoorWidthM(behind.type) : Infinity);
    if (door.widthM < limit - 0.005) out.push({ code: 'door_too_narrow', roomId: room.id, openingId: door.id, valueM: door.widthM, limitM: limit });
  }

  out.push(...doorSwings(plan, items), ...layoutRules(plan, items), ...splashZones(items, electrical));
  return out;
}

/** Pieces that stand on the floor and are in the way (not a rug, a curtain or a lamp hung up). */
function solid(item: PlacedItem): boolean {
  return item.elevationM < 0.05 && !getArchetype(item.kind)?.ghost && item.slot !== 'curtain' && item.slot !== 'rug';
}

/**
 * The floor a door's leaf sweeps, in the room it opens into: a square as wide as the door, from
 * the wall out. Two doors whose squares overlap hit each other; a piece standing in one stops it.
 */
function doorSwings(plan: FloorPlan, items: PlacedItem[]): RuleViolation[] {
  const out: RuleViolation[] = [];
  for (const room of plan.rooms) {
    const edges = roomEdges(room.polygon);
    const swings = room.openings.flatMap((door) => {
      // The half that swings `out` is the other room's leaf (`leafOnOtherSide`).
      if (door.kind !== 'door' || door.swing === 'out') return [];
      const edge = edges.find((e) => e.index === door.wallIndex);
      if (!edge) return [];
      const c = pointOnEdge(edge, door.t);
      const half = door.widthM / 2;
      const at = (s: number, d: number): Vec2 => ({ x: c.x + edge.dir.x * s + edge.inward.x * d, z: c.z + edge.dir.z * s + edge.inward.z * d });
      return [{ door, quad: [at(-half, 0.02), at(half, 0.02), at(half, door.widthM), at(-half, door.widthM)] as Quad }];
    });
    for (let i = 0; i < swings.length; i++) {
      for (let j = i + 1; j < swings.length; j++) {
        if (quadsOverlap(swings[i].quad, swings[j].quad)) out.push({ code: 'door_swing_clash', roomId: room.id, openingId: swings[i].door.id });
      }
      const blocker = items.find((item) => item.roomId === room.id && solid(item) && quadsOverlap(footprintQuad(item), swings[i].quad));
      if (blocker) out.push({ code: 'door_swing_blocked', roomId: room.id, openingId: swings[i].door.id, itemId: blocker.id });
    }
  }
  return out;
}

/** The brief's layout rules and sizes, piece by piece. */
function layoutRules(plan: FloorPlan, items: PlacedItem[]): RuleViolation[] {
  const out: RuleViolation[] = [];
  const entrance = entranceSightBands(plan.rooms);
  for (const room of plan.rooms) {
    const here = items.filter((i) => i.roomId === room.id);
    const doors = roomSightBands(room).map((b) => b.quad);
    const others = (item: PlacedItem) => here.filter((o) => o !== item && solid(o)).map(footprintQuad);
    // Free metres from a point along a direction: to the walls, or to the nearest piece in the way.
    const free = (from: Vec2, dir: Vec2, obstacles: Quad[]) => Math.min(rayToPolygon(from, dir, room.polygon) ?? Infinity, ...obstacles.map((q) => rayToPolygon(from, dir, q) ?? Infinity));

    for (const item of here) {
      const quad = footprintQuad(item);
      const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
      const right = { x: forward.z, z: -forward.x };
      const left = { x: -right.x, z: -right.z };

      if (item.slot === 'toilet') {
        // Opening the door, one sees the basin, the shower or the bath — not the WC.
        if (doors.some((band) => quadsOverlap(quad, band))) out.push({ code: 'wc_faces_door', roomId: room.id, itemId: item.id });
        // 40 cm from its centre to whatever is either side.
        const side = Math.min(free(item.position, right, others(item)), free(item.position, left, others(item)));
        if (side < WC_SIDE_M - 0.01) out.push({ code: 'wc_side_tight', roomId: room.id, itemId: item.id, valueM: round2(side), limitM: WC_SIDE_M });
      }

      if (item.slot === 'kitchen_run' && entrance.some((band) => band.roomId === room.id && quadsOverlap(quad, band.quad))) {
        out.push({ code: 'kitchen_faces_entrance', roomId: room.id, itemId: item.id });
      }

      // A double bed: 60–70 cm free each side, measured beside its foot half (its head has the nightstands).
      if (item.slot === 'bed' && item.size.width >= 1.2) {
        const foot = { x: item.position.x + forward.x * (item.size.depth / 4), z: item.position.z + forward.z * (item.size.depth / 4) };
        const blockers = here.filter((o) => o !== item && solid(o) && o.slot !== 'nightstand').map(footprintQuad);
        for (const dir of [right, left]) {
          const start = { x: foot.x + dir.x * (item.size.width / 2), z: foot.z + dir.z * (item.size.width / 2) };
          const gap = free(start, dir, blockers);
          if (gap < BED_SIDE_FREE_M - 0.01) {
            out.push({ code: 'bed_side_tight', roomId: room.id, itemId: item.id, valueM: round2(gap), limitM: BED_SIDE_FREE_M });
            break;
          }
        }
      }

      if (item.slot === 'sofa') {
        const tv = here.find((o) => o.slot === 'tv_unit');
        if (tv) {
          const tvForward = { x: Math.sin(tv.rotation), z: Math.cos(tv.rotation) };
          const screen = { x: tv.position.x - tvForward.x * (tv.size.depth / 2), z: tv.position.z - tvForward.z * (tv.size.depth / 2) };
          const distance = Math.hypot(screen.x - item.position.x, screen.z - item.position.z) - 0.05;
          if (distance < SOFA_TV_M.min - 0.05 || distance > SOFA_TV_M.max + 0.05) out.push({ code: 'sofa_tv_distance', roomId: room.id, itemId: item.id, valueM: round2(distance) });
        }
      }

      if (item.slot === 'kitchen_island') {
        for (const run of here.filter((o) => o.slot === 'kitchen_run')) {
          const gap = quadGap(quad, footprintQuad(run));
          if (gap < FACING_COUNTERS_M - 0.02) out.push({ code: 'counters_too_close', roomId: room.id, itemId: item.id, valueM: round2(gap), limitM: FACING_COUNTERS_M });
        }
      }

      // A shower is the floor it takes — its tray and glass (`areaM`) — not the column standing in it:
      // the check measured a 49 cm shower column and warned of a shower the engine itself laid out.
      const showerArea = item.areaM ?? item.size;
      if (item.slot === 'shower' && Math.min(showerArea.width, showerArea.depth) < SHOWER_MIN_M - 0.005) {
        out.push({ code: 'shower_too_small', roomId: room.id, itemId: item.id, valueM: round2(Math.min(showerArea.width, showerArea.depth)), limitM: SHOWER_MIN_M });
      }

      if (item.slot === 'sink' && WET_ROOM_TYPES.includes(room.type)) {
        const top = item.elevationM + item.size.height;
        if (Math.abs(top - BASIN_TOP_M) > BASIN_TOP_TOLERANCE_M) out.push({ code: 'basin_height', roomId: room.id, itemId: item.id, valueM: round2(top), limitM: BASIN_TOP_M });
      }
    }
  }
  return out;
}

/** No socket within 60 cm of a shower or a bath — the splash zone. */
function splashZones(items: PlacedItem[], electrical: ElectricalPoint[]): RuleViolation[] {
  const out: RuleViolation[] = [];
  const wet = items.filter((i) => i.slot === 'shower' || i.slot === 'bathtub');
  for (const point of electrical) {
    if (!point.kind.startsWith('socket')) continue;
    const near = wet.find((i) => i.roomId === point.roomId && distanceToQuad(point.position, footprintQuad(i)) < SPLASH_ZONE_M);
    if (near) out.push({ code: 'socket_in_splash', roomId: point.roomId, pointId: point.id, itemId: near.id });
  }
  return out;
}

function toSegment(p: Vec2, s: Vec2, e: Vec2): number {
  const dx = e.x - s.x;
  const dz = e.z - s.z;
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.z - s.z) * dz) / len));
  return Math.hypot(p.x - (s.x + dx * t), p.z - (s.z + dz * t));
}

/** How far a point is from a convex outline: 0 inside it. */
function distanceToQuad(p: Vec2, quad: Vec2[]): number {
  const sides = quad.map((a, i) => {
    const b = quad[(i + 1) % quad.length];
    return (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  });
  if (sides.every((s) => s >= 0) || sides.every((s) => s <= 0)) return 0;
  return Math.min(...quad.map((a, i) => toSegment(p, a, quad[(i + 1) % quad.length])));
}

/** The gap between two convex outlines that do not overlap: the nearest corner of one to a side of the other. */
function quadGap(a: Vec2[], b: Vec2[]): number {
  if (quadsOverlap(a, b)) return 0;
  let best = Infinity;
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    for (const p of from) for (let i = 0; i < to.length; i++) best = Math.min(best, toSegment(p, to[i], to[(i + 1) % to.length]));
  }
  return best;
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

/**
 * A warning about a piece in plain English, for the AI's check of the flat (`aiReview`'s
 * PROBLEMS); null for one that is not about a piece the check can move or swap. The person reads
 * the warnings in their own language (`components/design/ruleText.ts`).
 */
export function ruleProblem(v: RuleViolation): string | null {
  const cm = (m: number | undefined) => Math.round((m ?? 0) * 100);
  switch (v.code) {
    case 'radiator_blocked':
      return 'stands in front of a radiator (keep 30 cm clear in front of it)';
    case 'door_swing_blocked':
      return "is in a door's swing";
    case 'wc_faces_door':
      return 'is what the door opens onto (the rules: on opening the door one sees the basin, the shower or the bath, not the WC)';
    case 'kitchen_faces_entrance':
      return "is in sight straight from the flat's front door (the rules: not facing the entrance)";
    case 'bed_side_tight':
      return `leaves only ${cm(v.valueM)} cm beside it (the rules: 60–70 cm each side of a double bed)`;
    case 'sofa_tv_distance':
      return `is ${(v.valueM ?? 0).toFixed(1)} m from the TV (the rules: 2.5–3.5 m)`;
    case 'counters_too_close':
      return `is ${cm(v.valueM)} cm from the kitchen run (the rules: 120 cm between facing counters)`;
    case 'shower_too_small':
      return `is ${cm(v.valueM)} cm across (the rules: at least 80 × 80, better 90 × 90)`;
    case 'wc_side_tight':
      return `has ${cm(v.valueM)} cm from its centre to the side (the rules: 40 cm)`;
    case 'basin_height':
      return `has its top at ${cm(v.valueM)} cm (the rules: 85 cm)`;
    default:
      return null;
  }
}

