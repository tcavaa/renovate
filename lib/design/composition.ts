/**
 * How a room laid out as one space is judged (Nini, 23 Nov 2026, decisions 2, 3.3 and 3.4): whether a
 * person can walk from the door to each of its zones (`zonesReached`), whether its TV has a real wall
 * behind it (`screenOnWall`), and how a living room with a dining table is laid out as two functions
 * apart (`livingScore`). Pure; the studio's own composition is `lib/design/studioLayout`, the living
 * room's dining zone `diningZones` in `autoLayout`. Tested in tests/unit/design/studioLayout.test.ts.
 */

import { LIES_FLAT } from './kinds';
import { footprintOf, pieceWall, type Footprint } from './manipulate';
import { isOpenEdge, isPassage, pointInPolygon, pointOnEdge, polygonBounds, roomEdges, type PlanEdge } from './planGeometry';
import { SOFA_TV_M, isFrontDoor } from './rules';
import { blockedDoorSwings } from './ruleChecks';
import type { PlacedItem, PlanRoom, Vec2 } from './types';

/** The way a person walks through, metres: a floor cell is free with this much clear either side of its middle. */
const WAY_HALF_M = 0.3;
/** How close to a piece a person must come to use it. */
const REACH_M = 0.7;

/** A piece's box on the floor. */
export const box = (item: Pick<PlacedItem, 'position' | 'size' | 'rotation'>): Footprint => footprintOf(item.position, item.size, item.rotation);
/** How far a point is from a box (0 inside it). */
export const toBox = (p: Vec2, b: Footprint) => Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minZ - p.z, 0, p.z - b.maxZ));
/** The floor between two boxes (0 where they touch or overlap). */
export const boxGap = (a: Footprint, b: Footprint) => Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ));

/**
 * The zones of a room a person cannot walk to from its door: a floor of 10 cm cells, a cell free
 * where a way `WAY_HALF_M` either side of it is clear of every piece standing on the floor (a rug,
 * a door mat and the dining chairs, which are pulled out, are no obstacle) and of the walls; walked
 * from the front door where the room has one, else from every doorway; a zone reached where a free
 * cell lies within `REACH_M` of its piece. `zones`: the slots that are zones — each counted once.
 */
export function zonesReached(room: Pick<PlanRoom, 'polygon' | 'openings' | 'type' | 'open'>, items: readonly PlacedItem[], zones: readonly string[]): { reached: string[]; unreached: string[] } {
  const bounds = polygonBounds(room.polygon);
  const step = 0.1;
  const nx = Math.max(1, Math.ceil(bounds.width / step));
  const nz = Math.max(1, Math.ceil(bounds.depth / step));
  const at = (i: number, k: number): Vec2 => ({ x: bounds.minX + (i + 0.5) * step, z: bounds.minZ + (k + 0.5) * step });
  const solid = items.filter((i) => i.elevationM < 0.05 && !LIES_FLAT.has(i.slot) && i.slot !== 'dining_chair').map(box);
  const edges = roomEdges(room.polygon);
  const free = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const p = at(i, k);
      if (!pointInPolygon(p, room.polygon)) continue;
      if (solid.some((b) => toBox(p, b) < WAY_HALF_M)) continue;
      // Off the walls by the way's half less the 5 cm a shoulder passes a wall by; an open line is no wall.
      const nearWall = edges.some((e) => {
        if (isOpenEdge(room, e.index)) return false;
        const along = (p.x - e.a.x) * e.dir.x + (p.z - e.a.z) * e.dir.z;
        if (along < 0 || along > e.length) return false;
        return (p.x - e.a.x) * e.inward.x + (p.z - e.a.z) * e.inward.z < WAY_HALF_M - 0.05;
      });
      if (!nearWall) free[i * nz + k] = 1;
    }
  }
  const front = room.openings.filter((o) => isFrontDoor(room, o));
  const doors = front.length > 0 ? front : room.openings.filter((o) => isPassage(o) && !o.reachesIn);
  const queue: number[] = [];
  const seen = new Uint8Array(nx * nz);
  for (const door of doors) {
    const edge = edges.find((e) => e.index === door.wallIndex);
    if (!edge) continue;
    // The cells just inside the doorway: its width, up to 60 cm in.
    for (let s = -door.widthM / 2; s <= door.widthM / 2; s += step) {
      for (let d = 0.05; d <= 0.6; d += step) {
        const middle = pointOnEdge(edge, door.t);
        const p = { x: middle.x + edge.dir.x * s + edge.inward.x * d, z: middle.z + edge.dir.z * s + edge.inward.z * d };
        const i = Math.floor((p.x - bounds.minX) / step);
        const k = Math.floor((p.z - bounds.minZ) / step);
        if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
        const c = i * nz + k;
        if (free[c] && !seen[c]) {
          seen[c] = 1;
          queue.push(c);
        }
      }
    }
  }
  // A room drawn with no doorway cannot be walked into: nothing is judged unreachable in it.
  if (queue.length === 0) return { reached: zones.filter((slot) => items.some((i) => i.slot === slot)), unreached: [] };
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const i = Math.floor(c / nz);
    const k = c % nz;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di;
      const nk = k + dk;
      if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue;
      const n = ni * nz + nk;
      if (free[n] && !seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  const reached: string[] = [];
  const unreached: string[] = [];
  for (const slot of zones) {
    const piece = items.find((i) => i.slot === slot);
    if (!piece) continue;
    const b = box(piece);
    let ok = false;
    const i0 = Math.max(0, Math.floor((b.minX - REACH_M - bounds.minX) / step));
    const i1 = Math.min(nx - 1, Math.ceil((b.maxX + REACH_M - bounds.minX) / step));
    const k0 = Math.max(0, Math.floor((b.minZ - REACH_M - bounds.minZ) / step));
    const k1 = Math.min(nz - 1, Math.ceil((b.maxZ + REACH_M - bounds.minZ) / step));
    for (let i = i0; i <= i1 && !ok; i++) for (let k = k0; k <= k1 && !ok; k++) ok = !!seen[i * nz + k] && toBox(at(i, k), b) <= REACH_M;
    (ok ? reached : unreached).push(slot);
  }
  return { reached, unreached };
}

/** Whether a TV stands or hangs with a real wall behind it: hung on a wall, or on a unit whose back is on one — not a room separator's line, not free on the floor. */
export function screenOnWall(room: PlanRoom, items: readonly PlacedItem[]): boolean {
  const tv = items.find((i) => i.slot === 'tv');
  if (!tv) return false;
  const onWall = (piece: PlacedItem) => {
    const wall = pieceWall(piece, room, 0.12);
    return !!wall && !isOpenEdge(room, wall.edge.index);
  };
  if (tv.elevationM > 0.3 && onWall(tv)) return true;
  const unit = items.find((i) => i.slot === 'tv_unit');
  return !!unit && onWall(unit);
}

/** How far off square a sofa may look at its screen, and the screen back at the sofa, and still face it: 30°. */
export const SOFA_FACES_SCREEN_COS = Math.cos(Math.PI / 6);
/** What a layout's score loses where the sofa and its screen do not face each other (`sofaFacesScreen`). */
export const SCREEN_OFF_AXIS_PENALTY = 40;

/**
 * Whether a sofa and its screen (the TV unit, or a TV hung with no unit) face each other: the screen
 * within 30° of the way the sofa looks and the screen looking back at the sofa within 30° — Nini's
 * "the sofa on one wall, the TV across". A screen at the right distance on a side wall is not: the
 * distance alone (`SOFA_TV_M`) rewarded a TV turned away along the sofa's side.
 */
export function sofaFacesScreen(sofa: Pick<PlacedItem, 'position' | 'rotation'>, screen: Pick<PlacedItem, 'position' | 'rotation'>): boolean {
  const v = { x: screen.position.x - sofa.position.x, z: screen.position.z - sofa.position.z };
  const len = Math.hypot(v.x, v.z);
  if (len < 1e-6) return false;
  const ahead = (Math.sin(sofa.rotation) * v.x + Math.cos(sofa.rotation) * v.z) / len;
  const back = -(Math.sin(screen.rotation) * v.x + Math.cos(screen.rotation) * v.z) / len;
  return ahead >= SOFA_FACES_SCREEN_COS && back >= SOFA_FACES_SCREEN_COS;
}

/** No clustering (Nini, decision 3.3): the dining group stands at least this share of the room's length from the sitting group… */
export const DINING_APART_SHARE = 0.4;
/** …or this far, whichever is less (a long room need not put them further apart). */
export const DINING_APART_M = 3;
/** And never nearer the sofa than this: a way between them and a chair pulled out. */
export const DINING_SOFA_GAP_M = 1.2;

/**
 * Whether a room's dining table (or island) stands in its sitting group — the measurable rule for
 * Nini's "don't cluster" (decision 3.3), read by the layout's scoring and the whole-flat check: the
 * table's box within `DINING_SOFA_GAP_M` of the sofa's, or its middle nearer the sitting group's
 * (the sofa and its coffee table) than `DINING_APART_SHARE` of the room's long side and
 * `DINING_APART_M`. `lengthM`: the long side of the room the two share, where `room` is a studio's
 * half (the whole studio's). Null where the room has no table or no sofa.
 */
export function diningCluster(room: Pick<PlanRoom, 'id' | 'polygon'>, items: readonly PlacedItem[], lengthM?: number): { gap: number; apart: number; wanted: number; clustered: boolean } | null {
  const own = items.filter((i) => i.roomId === room.id);
  const dining = own.find((i) => i.slot === 'dining_table') ?? own.find((i) => i.slot === 'kitchen_island');
  const sofa = own.find((i) => i.slot === 'sofa');
  if (!dining || !sofa) return null;
  const sitting = [sofa, ...own.filter((i) => i.slot === 'coffee_table').slice(0, 1)];
  const centre = { x: sitting.reduce((s, p) => s + p.position.x, 0) / sitting.length, z: sitting.reduce((s, p) => s + p.position.z, 0) / sitting.length };
  const bounds = polygonBounds(room.polygon);
  const wanted = Math.min(DINING_APART_M, DINING_APART_SHARE * (lengthM ?? Math.max(bounds.width, bounds.depth)));
  const gap = boxGap(box(dining), box(sofa));
  const apart = Math.hypot(dining.position.x - centre.x, dining.position.z - centre.z);
  return { gap, apart, wanted, clustered: gap < DINING_SOFA_GAP_M - 1e-6 || apart < wanted - 1e-6 };
}

/** How far a point is from an edge (its segment). */
function toEdge(p: Vec2, edge: PlanEdge): number {
  const along = Math.max(0, Math.min(edge.length, (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z));
  return Math.hypot(p.x - (edge.a.x + edge.dir.x * along), p.z - (edge.a.z + edge.dir.z * along));
}

/**
 * A living room with a dining table laid out one way, scored as one space (decision 3.3: the dining
 * table toward the kitchen, the sofa and the TV in the other part, no clustering). Higher is better:
 * 100 for each of the sofa, the TV and the dining table, 30 for a coffee table (or the console behind
 * the sofa); 25 for the TV on a real wall, 10 at 2.5–3.5 m from the sofa (15 a metre off), 40 where the
 * sofa and the screen do not face each other (`sofaFacesScreen`); the dining
 * table out of the sitting group (`diningCluster`: 20 a metre nearer the sofa than 1.2 m, 30 for each
 * metre short of the distance wanted); toward the kitchen across its open line (`kitchenSide`, 3 a
 * metre); 25 for each zone a person cannot walk to (`zonesReached` — not in a studio's half, which is
 * walked into through the other half and judged whole), 15 for each door a piece stands in the swing
 * of (`blockedDoorSwings`); 3 for each other piece it keeps.
 */
export function livingScore(room: PlanRoom, items: readonly PlacedItem[], kitchenSide: readonly number[] = [], lengthM?: number): number {
  const own = items.filter((i) => i.roomId === room.id);
  const first = (...slots: string[]) => own.find((i) => slots.includes(i.slot));
  const sofa = first('sofa');
  const tv = first('tv');
  const dining = first('dining_table');
  let total = 100 * [sofa, tv, dining].filter(Boolean).length + (first('coffee_table', 'console') ? 30 : 0);
  if (tv && screenOnWall(room, own)) total += 25;
  const screen = first('tv_unit') ?? tv;
  if (sofa && screen) {
    const d = Math.hypot(sofa.position.x - screen.position.x, sofa.position.z - screen.position.z);
    total += d >= SOFA_TV_M.min && d <= SOFA_TV_M.max ? 10 : -15 * (d < SOFA_TV_M.min ? SOFA_TV_M.min - d : d - SOFA_TV_M.max);
    if (!sofaFacesScreen(sofa, screen)) total -= SCREEN_OFF_AXIS_PENALTY;
  }
  const cluster = diningCluster(room, own, lengthM);
  if (cluster) total -= 20 * Math.max(0, DINING_SOFA_GAP_M - cluster.gap) + 30 * Math.max(0, cluster.wanted - cluster.apart);
  const edges = roomEdges(room.polygon).filter((e) => kitchenSide.includes(e.index));
  if (dining && edges.length > 0) total -= 3 * Math.min(...edges.map((e) => toEdge(dining.position, e)));
  // A studio's half is walked into through the other half too: the studio is judged whole (`compositionScore`).
  if (room.studioPart == null) total -= 25 * zonesReached(room, own, ['sofa', 'dining_table']).unreached.length + 15 * blockedDoorSwings(room, own);
  total += 3 * own.filter((i) => !['sofa', 'tv', 'tv_unit', 'dining_table', 'dining_chair', 'coffee_table', 'console'].includes(i.slot)).length;
  return total;
}
