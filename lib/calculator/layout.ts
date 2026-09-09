import type { Room } from './types';

/** Grid the layout editor snaps to, metres. */
export const LAYOUT_GRID_M = 0.25;

export const snap = (v: number, grid = LAYOUT_GRID_M) => Math.round(v / grid) * grid;

interface Rect {
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
