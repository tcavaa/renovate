/**
 * What is already in front of a wall, for anything placed on it afterwards (the owner's notes of
 * 13 Nov 2026: "placing the technical points automatically in a furnished flat, read the furniture
 * and the decor first — no radiator behind a cupboard, no towel rail through a vanity").
 *
 * A wall is read as blocks: every piece of furniture standing within reach of it (its footprint
 * along the wall, from its bottom to its top), every piece of joinery, box or niche wall (decor
 * that takes floor), and — for what should not be fixed to a decorated wall at all, a radiator or
 * an air conditioner — the slats, panels and slabs flat on it too. The automatic placements take
 * the stretches clear of the doors and windows as before and take these out of them.
 *
 * Pure: no React, no three.js.
 */

import { decorFootprint } from './decor/joinery';
import type { PlanEdge } from './planGeometry';
import { showerArea } from './shower';
import type { DecorPiece, PlacedItem, PlanRoom } from './types';

export interface WallBlock {
  /** Along the wall, metres from its first corner. */
  from: number;
  to: number;
  /** Off the floor. */
  bottom: number;
  top: number;
  /** Flat on the wall (slats, a panel): in the way of a radiator, not of a socket set on its face. */
  flat?: boolean;
  /** Built there — joinery, a box, a niche wall — rather than furniture standing there. */
  built?: boolean;
}

/** What never blocks a wall: it lies on the floor, hangs from the ceiling or dresses a window. */
const NOT_IN_THE_WAY = new Set(['rug', 'door_mat', 'pendant', 'curtain', 'blind']);
/** How near a wall a piece stands to be in front of it. */
export const WALL_REACH_M = 0.45;

const along = (edge: PlanEdge, p: { x: number; z: number }) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z;
const off = (edge: PlanEdge, p: { x: number; z: number }) => (p.x - edge.a.x) * edge.inward.x + (p.z - edge.a.z) * edge.inward.z;

function corners(position: { x: number; z: number }, rotation: number, width: number, depth: number): Array<{ x: number; z: number }> {
  const f = { x: Math.sin(rotation), z: Math.cos(rotation) };
  const r = { x: f.z, z: -f.x };
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: position.x + (r.x * u * width) / 2 + (f.x * v * depth) / 2, z: position.z + (r.z * u * width) / 2 + (f.z * v * depth) / 2 }));
}

/** Everything in front of one wall of a room: the furniture within `reach` of it and the decor on it. */
export function wallBlocks(room: Pick<PlanRoom, 'id' | 'polygon' | 'heightM'>, edge: PlanEdge, items: readonly PlacedItem[], decor: readonly DecorPiece[] = [], reach = WALL_REACH_M): WallBlock[] {
  const blocks: WallBlock[] = [];
  const add = (points: Array<{ x: number; z: number }>, bottom: number, top: number, built = false) => {
    const offs = points.map((p) => off(edge, p));
    if (Math.min(...offs) > reach || Math.max(...offs) < -0.05) return;
    const s = points.map((p) => along(edge, p));
    const from = Math.max(0, Math.min(...s));
    const to = Math.min(edge.length, Math.max(...s));
    if (to - from > 0.01) blocks.push({ from, to, bottom, top, ...(built ? { built: true } : {}) });
  };
  for (const item of items) {
    if (item.roomId !== room.id || NOT_IN_THE_WAY.has(item.slot)) continue;
    // A shower is the floor it takes and the glass round it, not the column at its back.
    const area = showerArea(item);
    if (area) add(corners(area.centre, area.rotation, area.width, area.depth), 0, Math.max(2, item.elevationM + item.size.height));
    else add(corners(item.position, item.rotation, item.size.width, item.size.depth), item.elevationM, item.elevationM + item.size.height);
  }
  for (const piece of decor) {
    if (piece.roomId !== room.id || piece.wallIndex == null) continue;
    const bottom = Math.min(piece.height.from, piece.height.to);
    const top = Math.min(room.heightM, Math.max(piece.height.from, piece.height.to));
    const solid = decorFootprint(piece, room);
    if (solid) add(solid, bottom, top, true);
    else if (piece.wallIndex === edge.index && piece.family !== 'light') blocks.push({ from: Math.min(piece.span.from, piece.span.to), to: Math.max(piece.span.from, piece.span.to), bottom, top, flat: true });
  }
  return blocks;
}

/**
 * Stretches of a wall with the blocks that reach into a band of height taken out of them, `margin`
 * kept round each. `flat` decor counts when `flatToo` (a radiator, an air conditioner, a panel).
 */
export function clearOf(spans: ReadonlyArray<readonly [number, number]>, blocks: readonly WallBlock[], band: { bottom: number; top: number }, flatToo = true, margin = 0.05): Array<[number, number]> {
  let out: Array<[number, number]> = spans.map(([a, b]) => [a, b]);
  for (const block of blocks) {
    if ((block.flat && !flatToo) || block.top <= band.bottom + 0.01 || block.bottom >= band.top - 0.01) continue;
    const lo = Math.round((block.from - margin) * 1000) / 1000;
    const hi = Math.round((block.to + margin) * 1000) / 1000;
    out = out.flatMap(([a, b]): Array<[number, number]> => {
      if (hi <= a || lo >= b) return [[a, b]];
      const parts: Array<[number, number]> = [];
      if (lo > a) parts.push([a, lo]);
      if (hi < b) parts.push([hi, b]);
      return parts;
    });
  }
  return out.filter(([a, b]) => b - a > 0.01);
}

/** Where along a wall something `width` wide goes, as near `at` as the clear stretches allow; null when none holds it. */
export function nearestClear(spans: ReadonlyArray<readonly [number, number]>, at: number, width: number): number | null {
  let best: number | null = null;
  for (const [a, b] of spans) {
    if (b - a < width - 1e-6) continue;
    const s = Math.min(b - width / 2, Math.max(a + width / 2, at));
    if (best == null || Math.abs(s - at) < Math.abs(best - at)) best = s;
  }
  return best;
}
