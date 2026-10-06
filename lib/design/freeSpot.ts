/** A rectangle on the plan, metres: its corner nearest the origin and its size. */
export interface PlanRect {
  x: number;
  z: number;
  width: number;
  length: number;
}

function overlaps(a: PlanRect, b: PlanRect, tolerance = 0.01): boolean {
  return a.x < b.x + b.width - tolerance && a.x + a.width > b.x + tolerance && a.z < b.z + b.length - tolerance && a.z + a.length > b.z + tolerance;
}

/**
 * Where a new room of the given size goes on the board ("add a room" in `RoomsPanel`): scanned
 * row by row on a half-metre grid from the origin, the first spot that touches nothing already
 * placed — rooms fill in from the top-left and pack against each other, as a flat does. The
 * only part of the old rectangle editor (`lib/calculator/layout.ts`) still in use.
 */
export function findFreeSpot(placed: PlanRect[], width: number, length: number, maxWidth = 14): { x: number; z: number } {
  if (placed.length === 0) return { x: 0, z: 0 };
  const step = 0.5;
  const maxZ = Math.max(...placed.map((r) => r.z + r.length)) + length + step;
  for (let z = 0; z <= maxZ; z += step) {
    for (let x = 0; x + width <= Math.max(maxWidth, width); x += step) {
      if (!placed.some((r) => overlaps({ x, z, width, length }, r))) return { x, z };
    }
  }
  return { x: 0, z: maxZ };
}
