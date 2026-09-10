import type { Room } from './types';

/** Grid drawn behind the layout editor, metres. Rooms no longer snap to it — see `MOVE_STEP_M`. */
export const LAYOUT_GRID_M = 0.25;
/**
 * Positions move to the centimetre. The editor used to hold rooms on the 25 cm grid, which
 * meant a room could never sit exactly against a neighbour 3.32 m wide; now a drag lands
 * wherever the pointer lets go, and `snapToNeighbours` does the aligning that matters.
 */
export const MOVE_STEP_M = 0.01;
/** How close (metres) an edge has to come to a neighbour's edge before it jumps onto it. */
export const NEIGHBOUR_SNAP_M = 0.3;

export const snap = (v: number, grid = LAYOUT_GRID_M) => Math.round(v / grid) * grid;

/** Rounds to the centimetre; avoids the floating-point tails a plain division leaves. */
export const snapCm = (v: number) => Math.round(v * 100) / 100;

export interface Rect {
  x: number;
  z: number;
  width: number;
  length: number;
}

const rectOf = (r: Room): Rect | null => (typeof r.x === 'number' && typeof r.z === 'number' ? { x: r.x, z: r.z, width: r.width, length: r.length } : null);

export function rectsOverlap(a: Rect, b: Rect, tolerance = 0.01): boolean {
  return a.x < b.x + b.width - tolerance && a.x + a.width > b.x + tolerance && a.z < b.z + b.length - tolerance && a.z + a.length > b.z + tolerance;
}

/** Ids of rooms that sit on top of another placed room. */
export function overlappingRoomIds(rooms: Room[]): Set<string> {
  const out = new Set<string>();
  const placed = rooms.map((r) => ({ id: r.id, rect: rectOf(r) })).filter((p): p is { id: string; rect: Rect } => !!p.rect);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (rectsOverlap(placed[i].rect, placed[j].rect)) {
        out.add(placed[i].id);
        out.add(placed[j].id);
      }
    }
  }
  return out;
}

/** A guide the editor draws while a snapped drag is in progress: a wall line shared with a neighbour. */
export interface SnapGuide {
  axis: 'x' | 'z';
  /** The x (for a vertical line) or z (horizontal) the edge snapped onto. */
  at: number;
  /** Extent of the line along the other axis, so it spans both rooms. */
  from: number;
  to: number;
}

export interface NeighbourSnap {
  x: number;
  z: number;
  guides: SnapGuide[];
}

/**
 * Pulls a dragged rectangle onto its neighbours.
 *
 * Two rooms in a flat share a wall, so what a person means when they push one room up to
 * another is "put them together": the moving room's left edge onto the other's right edge
 * (or vice versa), its top onto the other's bottom. Edges that line up — both rooms' left
 * walls flush, say — are pulled together as well, which is how a hallway ends up as wide
 * as the rooms beside it. Each axis snaps independently to the closest candidate within
 * `threshold`; the stationary rooms never move.
 */
export function snapToNeighbours(moving: Rect, others: Rect[], threshold = NEIGHBOUR_SNAP_M): NeighbourSnap {
  let bestX: { delta: number; at: number; other: Rect } | null = null;
  let bestZ: { delta: number; at: number; other: Rect } | null = null;
  const right = moving.x + moving.width;
  const bottom = moving.z + moving.length;

  for (const other of others) {
    const otherRight = other.x + other.width;
    const otherBottom = other.z + other.length;
    // Only rooms roughly alongside each other on the other axis count: a room three metres
    // below should not drag this one sideways. A little slack so diagonal approaches work.
    const besideX = moving.z < otherBottom + threshold && bottom > other.z - threshold;
    const besideZ = moving.x < otherRight + threshold && right > other.x - threshold;

    if (besideX) {
      // (edge of the moving room, edge it would land on) — x for the room's left corner.
      const candidates: Array<[number, number]> = [
        [right, other.x], // my right wall against their left wall
        [moving.x, otherRight], // my left wall against their right wall
        [moving.x, other.x], // left walls flush
        [right, otherRight], // right walls flush
      ];
      for (const [edge, target] of candidates) {
        const delta = target - edge;
        if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, at: target, other };
        }
      }
    }
    if (besideZ) {
      const candidates: Array<[number, number]> = [
        [bottom, other.z],
        [moving.z, otherBottom],
        [moving.z, other.z],
        [bottom, otherBottom],
      ];
      for (const [edge, target] of candidates) {
        const delta = target - edge;
        if (Math.abs(delta) <= threshold && (!bestZ || Math.abs(delta) < Math.abs(bestZ.delta))) {
          bestZ = { delta, at: target, other };
        }
      }
    }
  }

  const x = snapCm(moving.x + (bestX?.delta ?? 0));
  const z = snapCm(moving.z + (bestZ?.delta ?? 0));
  const guides: SnapGuide[] = [];
  if (bestX) {
    guides.push({ axis: 'x', at: snapCm(bestX.at), from: Math.min(z, bestX.other.z), to: Math.max(z + moving.length, bestX.other.z + bestX.other.length) });
  }
  if (bestZ) {
    guides.push({ axis: 'z', at: snapCm(bestZ.at), from: Math.min(x, bestZ.other.x), to: Math.max(x + moving.width, bestZ.other.x + bestZ.other.width) });
  }
  return { x, z, guides };
}

/**
 * Where a new room of the given size goes: scanned row by row on a half-metre grid from the
 * origin, the first spot that touches nothing already placed. Rooms therefore fill in from the
 * top-left and pack against each other, which is what a flat looks like.
 */
export function findFreeSpot(rooms: Room[], width: number, length: number, maxWidth = 14): { x: number; z: number } {
  const placed = rooms.map(rectOf).filter((r): r is Rect => !!r);
  if (placed.length === 0) return { x: 0, z: 0 };
  const step = 0.5;
  const maxZ = Math.max(...placed.map((r) => r.z + r.length)) + length + step;
  for (let z = 0; z <= maxZ; z += step) {
    for (let x = 0; x + width <= Math.max(maxWidth, width); x += step) {
      const candidate = { x, z, width, length };
      if (!placed.some((r) => rectsOverlap(candidate, r))) return { x, z };
    }
  }
  return { x: 0, z: maxZ };
}

/** Bounding box of the placed rooms, with a margin, never smaller than the minimum canvas. */
export function layoutBounds(rooms: Room[], minWidth = 12, minDepth = 8, margin = 1): { width: number; depth: number } {
  const placed = rooms.map(rectOf).filter((r): r is Rect => !!r);
  const width = placed.length ? Math.max(...placed.map((r) => r.x + r.width)) + margin : 0;
  const depth = placed.length ? Math.max(...placed.map((r) => r.z + r.length)) + margin : 0;
  return { width: Math.max(minWidth, Math.ceil(width)), depth: Math.max(minDepth, Math.ceil(depth)) };
}
