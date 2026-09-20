/**
 * Where the water, the drains, the panel, the gas, the extractors and the air conditioners
 * go, by the rules a fitter would use.
 *
 * Marking a flat's technical points by hand is the step people skip — it is the least
 * rewarding part of the journey and the easiest to get wrong, and a flat with none of them
 * is priced as though it needed no plumbing at all. So this places the ones that follow from
 * the plan: a bathroom needs water, a drain and an extractor, a kitchen needs water, waste
 * and gas, the panel goes by the front door, a living room and a bedroom get an air
 * conditioner, and one boiler serves the flat.
 *
 * It places what the rules can decide and **nothing else**. A point that would be a guess —
 * a second boiler, gas in a flat with no kitchen run, a drain in a room the plan does not
 * call a bathroom — is simply not placed; the person puts it where they know it is. Every
 * point comes out `origin: 'user'`, because asking for them is asking to pay for them.
 *
 * Pure geometry over the plan and the furniture; no React, no store.
 */

import { pointOnEdge, roomEdges, type PlanEdge } from './planGeometry';
import { TECHNICAL_KINDS, technicalElevation } from './technical';
import type { FloorPlan, PlacedItem, PlanRoom, TechnicalKind, TechnicalPoint, Vec2 } from './types';

/** How far inside the room a wall-mounted point stands, so it reads as *on* that wall. */
const OFF_WALL_M = 0.08;
/** A room smaller than this is a cupboard, not a room to service. */
const MIN_ROOM_M2 = 1.2;

/** What a room of this type gets, in the order it is placed. */
const BY_ROOM: Partial<Record<PlanRoom['type'], TechnicalKind[]>> = {
  bathroom: ['water_supply', 'sewer', 'floor_drain', 'extractor'],
  toilet: ['water_supply', 'sewer', 'extractor'],
  kitchen: ['water_supply', 'sewer', 'gas', 'extractor'],
  living_room: ['ac_unit'],
  bedroom: ['ac_unit'],
  office: ['ac_unit'],
};

/** One per flat, in the first room of this list that the flat has. */
const ONE_PER_FLAT: Array<{ kind: TechnicalKind; rooms: Array<PlanRoom['type']> }> = [
  { kind: 'electrical_panel', rooms: ['hallway', 'living_room', 'kitchen'] },
  { kind: 'boiler', rooms: ['bathroom', 'kitchen', 'balcony'] },
];

export interface AutoTechnicalResult {
  points: TechnicalPoint[];
  /** What was placed, by kind, for the message afterwards. */
  counts: Partial<Record<TechnicalKind, number>>;
}

/**
 * The technical points the plan implies, leaving out every kind a room already has. Rooms
 * keep whatever is already marked: this fills the gaps, it does not tidy up after anyone.
 */
export function suggestTechnical(plan: FloorPlan, items: PlacedItem[], nextId: () => string): AutoTechnicalResult {
  const existing = plan.technical?.points ?? [];
  const points: TechnicalPoint[] = [];
  const counts: Partial<Record<TechnicalKind, number>> = {};
  const has = (kind: TechnicalKind, roomId?: string) =>
    [...existing, ...points].some((p) => p.kind === kind && (roomId === undefined || p.roomId === roomId));

  const place = (room: PlanRoom, kind: TechnicalKind) => {
    if (has(kind, room.id)) return;
    const position = spotFor(plan, room, kind, items);
    if (!position) return;
    points.push({ id: nextId(), kind, roomId: room.id, position, elevationM: technicalElevation(kind, room), origin: 'user' });
    counts[kind] = (counts[kind] ?? 0) + 1;
  };

  for (const room of plan.rooms) {
    if (room.areaM2 < MIN_ROOM_M2) continue;
    for (const kind of BY_ROOM[room.type] ?? []) place(room, kind);
  }

  for (const { kind, rooms } of ONE_PER_FLAT) {
    if (has(kind)) continue;
    // The first room of the preferred type that the flat actually has; none, and it is skipped.
    const room = rooms.map((type) => plan.rooms.find((r) => r.type === type && r.areaM2 >= MIN_ROOM_M2)).find(Boolean);
    if (room) place(room, kind);
  }

  return { points, counts };
}

/**
 * Where one point goes in one room: at the fixture it serves when the room has one, and
 * otherwise on the wall a fitter would choose — the longest one with no door in it, so the
 * pipe or the duct has a clear run.
 */
function spotFor(plan: FloorPlan, room: PlanRoom, kind: TechnicalKind, items: PlacedItem[]): Vec2 | null {
  const info = TECHNICAL_KINDS[kind];
  const edges = roomEdges(room.polygon);
  if (edges.length === 0) return null;

  // The fixture this kind serves, biggest first — a bath before a basin.
  const served = items
    .filter((i) => i.roomId === room.id && info.attracts.includes(i.kind))
    .sort((a, b) => b.size.width * b.size.depth - a.size.width * a.size.depth)[0];

  if (served) {
    // Waste and drains sit under the fixture; everything else comes to the wall behind it.
    if (info.placement !== 'wall') return round(served.position);
    const edge = nearestEdge(edges, served.position);
    return edge ? offInto(edge, projectOnto(edge, served.position)) : round(served.position);
  }

  if (info.placement === 'floor') return round(centroid(room.polygon));
  const edge = bestWall(room, edges, kind);
  return edge ? offInto(edge, 0.5) : null;
}

/**
 * The wall a fitter would run it to: no door in it, and as long as possible. An extractor
 * and an air conditioner prefer an outside wall, which is where the duct and the pipes go.
 */
function bestWall(room: PlanRoom, edges: PlanEdge[], kind: TechnicalKind): PlanEdge | null {
  const doored = new Set(room.openings.filter((o) => o.kind !== 'window').map((o) => o.wallIndex));
  const windowed = new Set(room.openings.filter((o) => o.kind === 'window').map((o) => o.wallIndex));
  const outside = kind === 'extractor' || kind === 'ac_unit';
  const score = (edge: PlanEdge) => edge.length + (doored.has(edge.index) ? -20 : 0) + (outside && windowed.has(edge.index) ? 6 : 0);
  return [...edges].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function nearestEdge(edges: PlanEdge[], point: Vec2): PlanEdge | null {
  let best: { edge: PlanEdge; distance: number } | null = null;
  for (const edge of edges) {
    const s = Math.max(0, Math.min(edge.length, (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z));
    const distance = Math.hypot(point.x - (edge.a.x + edge.dir.x * s), point.z - (edge.a.z + edge.dir.z * s));
    if (!best || distance < best.distance) best = { edge, distance };
  }
  return best?.edge ?? null;
}

/** Where along an edge a point falls, as 0..1. */
function projectOnto(edge: PlanEdge, point: Vec2): number {
  const s = (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z;
  return Math.max(0.05, Math.min(0.95, s / Math.max(edge.length, 1e-6)));
}

/** A spot on a wall, pushed just inside the room so it reads as standing on that wall. */
function offInto(edge: PlanEdge, t: number): Vec2 {
  const at = pointOnEdge(edge, t);
  return round({ x: at.x + edge.inward.x * OFF_WALL_M, z: at.z + edge.inward.z * OFF_WALL_M });
}

function centroid(polygon: Vec2[]): Vec2 {
  return { x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length, z: polygon.reduce((s, p) => s + p.z, 0) / polygon.length };
}

function round(p: Vec2): Vec2 {
  return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
}
