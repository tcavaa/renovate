/**
 * The floor a model really stands on, when that is not its whole bounding box.
 *
 * Collision used to know a piece only as the rectangle around it, and for most furniture
 * that is the truth. For a corner sofa it is a lie worth a square metre: the box includes
 * the empty corner the sofa is wrapped around — exactly where the coffee table goes — and the
 * studio refused to put anything there. So a model's footprint is read off its geometry once,
 * when the file arrives (`lib/design3d/footprintFromModel`): a top-down grid of which cells
 * the model actually covers, merged into a few rectangles, in fractions of the bounding box
 * (x from the model's left to its right, z from its back to its front).
 *
 * This module is the registry and nothing else — no THREE, no DOM — so the geometry rules in
 * `manipulate` stay pure and testable: a test registers a mask by hand. A model that has not
 * loaded (or never will: the 2D board on its own, the server) has no mask and is its whole
 * box, which is the conservative answer it always was. A mask only ever *frees* floor, so no
 * layout that was valid before one arrived becomes invalid after.
 */

/** A covered part of the bounding box, in fractions of it: 0 → 1 across the width and the depth. */
export interface MaskRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Cells along each side of the occupancy grid. Twelve is ~20 cm on a big sofa. */
export const MASK_GRID = 12;
/** A model that leaves less of its box empty than this is its box: chamfers and legs, not a shape. */
const MIN_EMPTY_FRACTION = 0.12;
/** More rectangles than this is a shape not worth testing against on every pointer move. */
const MAX_RECTS = 8;

const masks = new Map<string, MaskRect[]>();

export function registerFootprintMask(modelUrl: string, rects: MaskRect[] | null): void {
  if (rects && rects.length > 0) masks.set(modelUrl, rects);
  else masks.delete(modelUrl);
}

export function footprintMaskFor(modelUrl: string | null | undefined): MaskRect[] | null {
  return modelUrl ? masks.get(modelUrl) ?? null : null;
}

/** For tests. */
export function clearFootprintMasks(): void {
  masks.clear();
}

/**
 * An occupancy grid (`cells[row][column]`, rows along z) as the fewest rectangles a simple
 * sweep finds: runs of covered cells per row, merged with the identical run in the row
 * before. `null` when the grid is as good as full, or too ragged to be worth it.
 */
export function maskFromGrid(cells: boolean[][]): MaskRect[] | null {
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  if (rows === 0 || columns === 0) return null;
  const covered = cells.reduce((n, row) => n + row.filter(Boolean).length, 0);
  if (covered === 0 || 1 - covered / (rows * columns) < MIN_EMPTY_FRACTION) return null;

  interface Open {
    from: number;
    to: number;
    top: number;
  }
  const rects: MaskRect[] = [];
  let open: Open[] = [];
  const close = (run: Open, bottom: number) => rects.push({ x0: run.from / columns, x1: run.to / columns, z0: run.top / rows, z1: bottom / rows });

  for (let r = 0; r <= rows; r++) {
    const runs: Array<{ from: number; to: number }> = [];
    if (r < rows) {
      for (let c = 0; c < columns; c++) {
        if (!cells[r][c]) continue;
        const from = c;
        while (c + 1 < columns && cells[r][c + 1]) c++;
        runs.push({ from, to: c + 1 });
      }
    }
    const next: Open[] = [];
    for (const run of runs) {
      const same = open.find((o) => o.from === run.from && o.to === run.to);
      next.push(same ?? { ...run, top: r });
    }
    for (const run of open) if (!next.includes(run)) close(run, r);
    open = next;
  }
  return rects.length > 0 && rects.length <= MAX_RECTS ? rects : null;
}
