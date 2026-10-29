/**
 * Giving a plan its size from one wall's length.
 *
 * A drawing with no sizes printed on it (and every plan the CV parser reads) arrives at an
 * assumed scale — project 376's bedrooms came out 3.4 m². The person is shown the plan with its
 * longest outside wall picked, types how long that wall is (or picks another first), and the
 * whole plan is scaled from it. The length is the one the board shows inside the room — what a
 * tape measure along that wall would say — so the wall reads back exactly what was typed.
 *
 * The walls' positions scale; their thicknesses do not (a 30 cm wall is 30 cm at any scale), so
 * the factor is worked out on the centreline: the inside length plus the half thicknesses of the
 * walls at its two ends.
 *
 * Pure: no React, no DOM.
 */

import { roomEdges } from './planGeometry';
import { rebuildRooms, withBounds } from './walls';
import type { FloorPlan, Opening, PlanRoom, Vec2 } from './types';

/** One edge of one room: the wall the person measures. */
export interface ScaleEdge {
  roomId: string;
  edgeIndex: number;
}

/** A wall the person can measure: shorter than this is not worth measuring (and is easy to misread). */
const MIN_EDGE_M = 0.5;

/** Lengths the person may type, metres. */
export const MIN_WALL_LENGTH_M = 0.5;
export const MAX_WALL_LENGTH_M = 60;

/** The inside length of a room's edge, as the board shows it. */
export function scaleEdgeLength(plan: FloorPlan, edge: ScaleEdge): number | null {
  const room = plan.rooms.find((r) => r.id === edge.roomId);
  const found = room ? roomEdges(room.polygon).find((e) => e.index === edge.edgeIndex) : undefined;
  return found ? found.length : null;
}

/**
 * The wall offered first: the longest inside edge on an outside wall (a wall only one room
 * stands against), not on a room separator — the wall most worth measuring and the easiest to
 * find in the flat. Any longest edge when the plan has no outside wall; null for no rooms.
 */
export function defaultScaleEdge(plan: FloorPlan): ScaleEdge | null {
  const users = new Map<string, number>();
  for (const room of plan.rooms) for (const id of room.wallIds ?? []) users.set(id, (users.get(id) ?? 0) + 1);
  const separators = new Set((plan.walls ?? []).filter((w) => w.separator).map((w) => w.id));
  let best: { edge: ScaleEdge; length: number; outside: boolean } | null = null;
  for (const room of plan.rooms) {
    if (room.type === 'balcony') continue;
    for (const e of roomEdges(room.polygon)) {
      if (room.open?.includes(e.index) || e.length < MIN_EDGE_M) continue;
      const wallId = room.wallIds?.[e.index];
      if (wallId && separators.has(wallId)) continue;
      const outside = wallId ? users.get(wallId) === 1 : false;
      const better = !best || (outside && !best.outside) || (outside === best.outside && e.length > best.length);
      if (better) best = { edge: { roomId: room.id, edgeIndex: e.index }, length: e.length, outside };
    }
  }
  return best?.edge ?? null;
}

/** Every point of the plan, and every opening's width, multiplied by `k` about the origin. */
export function scalePlan(plan: FloorPlan, k: number): FloorPlan {
  if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 1e-9) return plan;
  const s = (p: Vec2): Vec2 => ({ x: round4(p.x * k), z: round4(p.z * k) });
  const opening = (o: Opening): Opening => ({ ...o, widthM: round4(o.widthM * k) });
  const rooms: PlanRoom[] = plan.rooms.map((r) => ({ ...r, polygon: r.polygon.map(s), openings: r.openings.map(opening) }));
  const columns = plan.columns?.map((c) => ({ ...c, position: s(c.position) }));
  const beams = plan.beams?.map((b) => ({ ...b, a: s(b.a), b: s(b.b) }));
  const scaled: FloorPlan = { ...plan, rooms, ...(columns ? { columns } : {}), ...(beams ? { beams } : {}) };
  if (!plan.walls || plan.walls.length === 0) return withBounds(scaled);
  const walls = plan.walls.map((w) => ({ ...w, a: s(w.a), b: s(w.b) }));
  return rebuildRooms({ ...scaled, walls }, walls);
}

/**
 * The plan scaled so that the edge measures `metres` inside the room. The half thicknesses of the
 * walls at the edge's two ends do not scale, so they are added to both sides of the ratio.
 */
export function scalePlanToEdge(plan: FloorPlan, edge: ScaleEdge, metres: number): FloorPlan {
  const room = plan.rooms.find((r) => r.id === edge.roomId);
  if (!room || !(metres > 0)) return plan;
  const edges = roomEdges(room.polygon);
  const i = edges.findIndex((e) => e.index === edge.edgeIndex);
  if (i < 0) return plan;
  const thickness = (index: number) => {
    const id = room.wallIds?.[index];
    const wall = id ? plan.walls?.find((w) => w.id === id) : undefined;
    return wall ? wall.thicknessM : 0;
  };
  const prev = edges[(i - 1 + edges.length) % edges.length];
  const next = edges[(i + 1) % edges.length];
  const ends = (thickness(prev.index) + thickness(next.index)) / 2;
  const k = (metres + ends) / (edges[i].length + ends);
  return scalePlan(plan, k);
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
