/**
 * A studio: one open room divided by a straight line into two parts — most often a kitchen
 * and a living room — each priced, furnished and finished as its own type.
 *
 * The line is stored on the room (`RoomSplit`) as the axis it crosses and a fraction `t` of
 * the room's extent along that axis, so it travels with the room when the room is moved or
 * resized, and survives the wall graph re-deriving the room (`roomsFromWalls` keeps it).
 * Everything else is worked out from the outline whenever it is asked for: the two parts'
 * polygons, their areas, how much of the room's walls each has (the line itself is not a
 * wall), and where the line runs on the plan. Pure; tested in `tests/unit/design/studio.test.ts`.
 */

import type { RoomPart, RoomSplit, RoomType } from '@/lib/calculator/types';
import { polygonAreaM2, polygonBounds, polygonCentroid } from './planGeometry';
import { clipPolygon } from './zones';
import type { PlanRoom, Vec2 } from './types';

import { DEFAULT_FIRST_SHARE, DEFAULT_STUDIO_PARTS } from '@/lib/calculator/constants';

export { DEFAULT_FIRST_SHARE, DEFAULT_STUDIO_PARTS };

/** Neither part may be smaller than this, however far the line is dragged. */
export const MIN_PART_AREA_M2 = 1.5;

/** The types a part may be: any room but another studio. */
export function isPartType(type: RoomType): boolean {
  return type !== 'studio';
}

export interface StudioPart {
  index: 0 | 1;
  type: RoomType;
  polygon: Vec2[];
  areaM2: number;
  /** Metres of the room's own walls on this part's side of the line. */
  wallLengthM: number;
}

type Outline = Pick<PlanRoom, 'type' | 'polygon'> & { split?: RoomSplit };

/** Is this room a studio whose parts should be used instead of the room itself? */
export function isStudio(room: { type: RoomType }): boolean {
  return room.type === 'studio';
}

/**
 * The split in force: the room's own, or — a studio that has never been divided, one read
 * from an old save — the default, across the longer side, the kitchen taking a third.
 */
export function effectiveSplit(room: Outline): RoomSplit {
  if (room.split) return room.split;
  return defaultSplit(room);
}

export function defaultSplit(room: Pick<PlanRoom, 'polygon'>): RoomSplit {
  const b = polygonBounds(room.polygon);
  // Divide the longer side: a 7 × 4 room becomes 2.5 × 4 and 4.5 × 4, not 7 × 1.4 and 7 × 2.6.
  const axis: RoomSplit['axis'] = b.width >= b.depth ? 'x' : 'z';
  return { axis, t: tForShare(room, axis, DEFAULT_FIRST_SHARE), parts: [...DEFAULT_STUDIO_PARTS] };
}

/** Where the line runs: its coordinate on its axis. */
export function lineCoordinate(room: Pick<PlanRoom, 'polygon'>, split: Pick<RoomSplit, 'axis' | 't'>): number {
  const b = polygonBounds(room.polygon);
  return split.axis === 'x' ? b.minX + split.t * b.width : b.minZ + split.t * b.depth;
}

/** The fraction `t` that puts the line at this coordinate. */
export function tAtCoordinate(room: Pick<PlanRoom, 'polygon'>, axis: RoomSplit['axis'], coordinate: number): number {
  const b = polygonBounds(room.polygon);
  const extent = axis === 'x' ? b.width : b.depth;
  if (extent <= 0) return 0.5;
  return ((axis === 'x' ? coordinate - b.minX : coordinate - b.minZ) / extent);
}

/** The part of the outline on one side of the line (0 = the lower side). */
function sideOf(polygon: Vec2[], axis: RoomSplit['axis'], at: number, side: 0 | 1): Vec2[] {
  const b = polygonBounds(polygon);
  const pad = 1;
  const lo = { x: b.minX - pad, z: b.minZ - pad };
  const hi = { x: b.maxX + pad, z: b.maxZ + pad };
  const rect =
    axis === 'x'
      ? side === 0
        ? [lo, { x: at, z: lo.z }, { x: at, z: hi.z }, { x: lo.x, z: hi.z }]
        : [{ x: at, z: lo.z }, { x: hi.x, z: lo.z }, hi, { x: at, z: hi.z }]
      : side === 0
        ? [lo, { x: hi.x, z: lo.z }, { x: hi.x, z: at }, { x: lo.x, z: at }]
        : [{ x: lo.x, z: at }, { x: hi.x, z: at }, hi, { x: lo.x, z: hi.z }];
  return clipPolygon(polygon, rect);
}

/** Metres of the outline's edges on one side of the line. */
function wallLengthOnSide(polygon: Vec2[], axis: RoomSplit['axis'], at: number, side: 0 | 1): number {
  const coord = (p: Vec2) => (axis === 'x' ? p.x : p.z);
  const keep = (v: number) => (side === 0 ? v <= at : v >= at);
  let total = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-9) continue;
    const ca = coord(a);
    const cb = coord(b);
    if (Math.abs(cb - ca) < 1e-9) {
      // Parallel to the line: all on one side, or lying on the line itself (half each).
      if (Math.abs(ca - at) < 1e-9) total += length / 2;
      else if (keep(ca)) total += length;
      continue;
    }
    // The fraction of the edge on this side.
    const u = (at - ca) / (cb - ca);
    const clamped = Math.max(0, Math.min(1, u));
    const lowerFirst = ca < cb;
    const lowerShare = lowerFirst ? clamped : 1 - clamped;
    total += length * (side === 0 ? lowerShare : 1 - lowerShare);
  }
  return total;
}

/** The first part's floor area, for a line at `t`. */
function firstArea(room: Pick<PlanRoom, 'polygon'>, axis: RoomSplit['axis'], t: number): number {
  return polygonAreaM2(sideOf(room.polygon, axis, lineCoordinate(room, { axis, t }), 0));
}

/** The `t` that gives the first part this share of the floor (bisection: area grows with t). */
export function tForShare(room: Pick<PlanRoom, 'polygon'>, axis: RoomSplit['axis'], share: number): number {
  return tForArea(room, axis, share * polygonAreaM2(room.polygon));
}

/** The `t` that gives the first part this many square metres, kept inside what is allowed. */
export function tForArea(room: Pick<PlanRoom, 'polygon'>, axis: RoomSplit['axis'], areaM2: number): number {
  const total = polygonAreaM2(room.polygon);
  const target = Math.max(0, Math.min(total, areaM2));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (firstArea(room, axis, mid) < target) lo = mid;
    else hi = mid;
  }
  return clampT(room, axis, (lo + hi) / 2);
}

/** A `t` moved so that neither part is smaller than `MIN_PART_AREA_M2` (or than a tenth of the room). */
export function clampT(room: Pick<PlanRoom, 'polygon'>, axis: RoomSplit['axis'], t: number): number {
  const total = polygonAreaM2(room.polygon);
  const min = Math.min(MIN_PART_AREA_M2, total * 0.1);
  let lo = 0;
  let hi = 1;
  // The smallest t that leaves the first part `min`, and the largest that leaves the second `min`.
  let a = 0;
  let b = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (firstArea(room, axis, mid) < min) lo = mid;
    else hi = mid;
  }
  a = hi;
  lo = 0;
  hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (total - firstArea(room, axis, mid) > min) lo = mid;
    else hi = mid;
  }
  b = lo;
  if (a > b) return 0.5;
  return Math.round(Math.max(a, Math.min(b, t)) * 10000) / 10000;
}

/** The two parts of a studio, measured. Null for any other room. */
export function studioParts(room: Outline): [StudioPart, StudioPart] | null {
  if (!isStudio(room) || room.polygon.length < 3) return null;
  const split = effectiveSplit(room);
  const at = lineCoordinate(room, split);
  const part = (index: 0 | 1): StudioPart => {
    const polygon = sideOf(room.polygon, split.axis, at, index);
    return {
      index,
      type: split.parts[index],
      polygon,
      areaM2: round2(polygonAreaM2(polygon)),
      wallLengthM: round2(wallLengthOnSide(room.polygon, split.axis, at, index)),
    };
  };
  return [part(0), part(1)];
}

/** The parts as the estimate prices them: floor, walls at the room's height, perimeter. */
export function roomPartsFor(room: Outline & { heightM: number }): RoomPart[] | undefined {
  const parts = studioParts(room);
  if (!parts) return undefined;
  return parts.map((p) => ({ type: p.type, floorM2: p.areaM2, wallM2: round2(p.wallLengthM * room.heightM), perimeterM: p.wallLengthM }));
}

/**
 * Where the line runs inside the room, as segments — one for a rectangle, possibly two
 * where it crosses an L's notch — for drawing it and for picking it up.
 */
export function dividerSegments(room: Outline): Array<[Vec2, Vec2]> {
  if (!isStudio(room)) return [];
  const split = effectiveSplit(room);
  const at = lineCoordinate(room, split);
  const crossings: number[] = [];
  const poly = room.polygon;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const [ca, cb, oa, ob] = split.axis === 'x' ? [a.x, b.x, a.z, b.z] : [a.z, b.z, a.x, b.x];
    if ((ca < at) === (cb < at) || Math.abs(cb - ca) < 1e-9) continue;
    const u = (at - ca) / (cb - ca);
    crossings.push(oa + (ob - oa) * u);
  }
  crossings.sort((p, q) => p - q);
  const out: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const [from, to] = [crossings[i], crossings[i + 1]];
    out.push(split.axis === 'x' ? [{ x: at, z: from }, { x: at, z: to }] : [{ x: from, z: at }, { x: to, z: at }]);
  }
  return out;
}

/** Which part a point on the plan lies in. */
export function partAt(room: Outline, point: Vec2): 0 | 1 {
  const split = effectiveSplit(room);
  const at = lineCoordinate(room, split);
  return (split.axis === 'x' ? point.x : point.z) < at ? 0 : 1;
}

/** Where a part's label goes: the middle of its own floor. */
export function partLabelPoint(part: StudioPart): Vec2 {
  return polygonCentroid(part.polygon);
}

/** A split with the first part at this many square metres. */
export function withFirstArea(room: Outline, areaM2: number): RoomSplit {
  const split = effectiveSplit(room);
  return { ...split, t: tForArea(room, split.axis, areaM2) };
}

/** The line turned the other way, the first part keeping its share of the floor. */
export function turned(room: Outline): RoomSplit {
  const split = effectiveSplit(room);
  const parts = studioParts(room);
  const total = polygonAreaM2(room.polygon);
  const share = parts && total > 0 ? parts[0].areaM2 / total : DEFAULT_FIRST_SHARE;
  const axis: RoomSplit['axis'] = split.axis === 'x' ? 'z' : 'x';
  return { ...split, axis, t: tForShare(room, axis, share) };
}

/** The two parts swapped across the line (the kitchen to the other end). */
export function swapped(room: Outline): RoomSplit {
  const split = effectiveSplit(room);
  return { ...split, parts: [split.parts[1], split.parts[0]] };
}

/** A part given another type. */
export function withPartType(room: Outline, index: 0 | 1, type: RoomType): RoomSplit {
  const split = effectiveSplit(room);
  const parts: [RoomType, RoomType] = [...split.parts];
  parts[index] = isPartType(type) ? type : parts[index];
  return { ...split, parts };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
