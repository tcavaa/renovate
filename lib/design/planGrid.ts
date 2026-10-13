/**
 * From solved grid lines and rooms made of boxes to the walls of the flat.
 *
 * The solver (`planSolver`) leaves every box side on a wall centreline. Between consecutive
 * lines the plan is a grid of cells, and each room is the cells its boxes cover. That makes the
 * questions a list of overlapping rectangles cannot answer well simple to answer:
 *
 *   - **Overlaps**: two boxes claiming one cell — a hallway's box drawn over a corner of the
 *     bathroom — give the cell to the smaller room. A room the model gave as one box but that is
 *     really an L (a hallway wrapping round a bathroom) comes out as its L.
 *   - **Holes**: a cell nobody claims but that is shut in by rooms is not a room of its own — it
 *     is a sliver the boxes missed — and goes to the neighbour it shares most with. A sliver left
 *     as a face of the wall graph would become a room the drawing never had.
 *   - **Walls**: wherever two neighbouring cells belong to different rooms (or one to the
 *     outside) there is a boundary on the line between them, and every boundary is a wall of
 *     its line's thickness — or a room separator where the caller says the floor runs on.
 *
 * Walls are built from the grid directly rather than from room polygons (`wallsFromRooms`),
 * so a line that is part wall, part open — a living room open to the hallway between the
 * bathroom wall and the bedroom wall — keeps its wall pieces at their thickness and its open
 * stretch as a separator, with nothing to reconcile afterwards.
 *
 * Pure: no THREE, no React, no I/O.
 */

import type { Vec2, Wall } from './types';

/** A room as cells of the grid: each part a box of line indices, `[x0, x1)` × `[y0, y1)`. */
export interface GridRoom {
  parts: Array<{ x0: number; x1: number; y0: number; y1: number }>;
}

export interface Grid {
  xLines: number[];
  yLines: number[];
  /** The room index owning each cell (`cell(i, j) = owner[j * nx + i]`), −1 for outside. */
  owner: Int32Array;
  nx: number;
  ny: number;
}

/** A stretch of grid line with a different room (or the outside, −1) on each side. */
export interface BoundaryRun {
  /** 'v': a line of constant x (rooms left and right); 'h': constant y (rooms above and below). */
  orientation: 'v' | 'h';
  /** Index of the line in `xLines` ('v') or `yLines` ('h'). */
  line: number;
  /** Position of the line, metres. */
  at: number;
  /** Extent along the line, metres. */
  from: number;
  to: number;
  /** Room on the low side (left / above) and on the high side (right / below); −1 is outside. */
  a: number;
  b: number;
}

/** Cells narrower than this on either axis are not floor anyone can stand on. */
const MIN_CELL_M = 1e-3;

/**
 * Which room owns each cell. Claims are by part; where several rooms claim one cell the room
 * with the smaller total box area keeps it; unclaimed cells shut in by rooms are filled from
 * their neighbours; a room in several pieces keeps its largest and gives up the rest.
 */
export function assignCells(xLines: number[], yLines: number[], rooms: GridRoom[]): Grid {
  const nx = Math.max(0, xLines.length - 1);
  const ny = Math.max(0, yLines.length - 1);
  const owner = new Int32Array(nx * ny).fill(-1);
  const area = (i: number, j: number) => (xLines[i + 1] - xLines[i]) * (yLines[j + 1] - yLines[j]);

  const size = rooms.map((room) =>
    room.parts.reduce((sum, p) => sum + Math.max(0, xLines[p.x1] - xLines[p.x0]) * Math.max(0, yLines[p.y1] - yLines[p.y0]), 0)
  );
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let best = -1;
      rooms.forEach((room, r) => {
        const covers = room.parts.some((p) => i >= p.x0 && i < p.x1 && j >= p.y0 && j < p.y1);
        if (covers && (best < 0 || size[r] < size[best])) best = r;
      });
      owner[j * nx + i] = best;
    }
  }

  const grid: Grid = { xLines, yLines, owner, nx, ny };
  // Filling a hole can join a room's pieces, and dropping a piece can open a hole: settle both.
  for (let pass = 0; pass < 4; pass++) {
    const filled = fillHoles(grid, area);
    const dropped = keepLargestPieces(grid, rooms.length, area);
    if (!filled && !dropped) break;
  }
  return grid;
}

const NEIGHBOURS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Unclaimed cells not reachable from the edge of the grid go to the neighbour they share most with. */
function fillHoles(grid: Grid, area: (i: number, j: number) => number): boolean {
  const { nx, ny, owner, xLines, yLines } = grid;
  const outside = new Uint8Array(nx * ny);
  const queue: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if ((i === 0 || j === 0 || i === nx - 1 || j === ny - 1) && owner[j * nx + i] < 0) {
        outside[j * nx + i] = 1;
        queue.push(j * nx + i);
      }
    }
  }
  while (queue.length) {
    const c = queue.pop()!;
    const i = c % nx;
    const j = (c - i) / nx;
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const n = nj * nx + ni;
      if (owner[n] < 0 && !outside[n]) {
        outside[n] = 1;
        queue.push(n);
      }
    }
  }

  let changed = false;
  let progress = true;
  while (progress) {
    progress = false;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i;
        if (owner[c] >= 0 || outside[c]) continue;
        if (area(i, j) <= 0) continue;
        // The neighbour sharing the longest side with this cell.
        const shared = new Map<number, number>();
        for (const [di, dj] of NEIGHBOURS) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
          const o = owner[nj * nx + ni];
          if (o < 0) continue;
          const length = di !== 0 ? yLines[j + 1] - yLines[j] : xLines[i + 1] - xLines[i];
          shared.set(o, (shared.get(o) ?? 0) + length);
        }
        if (shared.size === 0) continue;
        owner[c] = [...shared.entries()].sort((p, q) => q[1] - p[1])[0][0];
        progress = true;
        changed = true;
      }
    }
  }
  // Zero-area cells (two lines that solved onto each other) take a neighbour's owner silently,
  // so they never show up as a boundary.
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (owner[c] >= 0 || outside[c] || area(i, j) > 0) continue;
      for (const [di, dj] of NEIGHBOURS) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        if (owner[nj * nx + ni] >= 0) {
          owner[c] = owner[nj * nx + ni];
          break;
        }
      }
    }
  }
  return changed;
}

/** A room in several pieces keeps its largest; the others are given up (to be filled or left outside). */
function keepLargestPieces(grid: Grid, roomCount: number, area: (i: number, j: number) => number): boolean {
  const { nx, ny, owner } = grid;
  let changed = false;
  for (let r = 0; r < roomCount; r++) {
    const seen = new Uint8Array(nx * ny);
    const pieces: Array<{ cells: number[]; area: number }> = [];
    for (let c = 0; c < nx * ny; c++) {
      if (owner[c] !== r || seen[c]) continue;
      const cells: number[] = [];
      let total = 0;
      const stack = [c];
      seen[c] = 1;
      while (stack.length) {
        const cur = stack.pop()!;
        cells.push(cur);
        const i = cur % nx;
        const j = (cur - i) / nx;
        total += area(i, j);
        for (const [di, dj] of NEIGHBOURS) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
          const n = nj * nx + ni;
          if (owner[n] === r && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      pieces.push({ cells, area: total });
    }
    if (pieces.length < 2) continue;
    pieces.sort((p, q) => q.area - p.area);
    for (const piece of pieces.slice(1)) {
      for (const c of piece.cells) owner[c] = -1;
      changed = true;
    }
  }
  return changed;
}

/** The cells of one room. */
export function roomCells(grid: Grid, room: number): Array<{ i: number; j: number }> {
  const out: Array<{ i: number; j: number }> = [];
  for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) if (grid.owner[j * grid.nx + i] === room) out.push({ i, j });
  return out;
}

/** The centre of a room's largest cell, metres — a point surely on its floor, whatever its shape. */
export function roomAnchor(grid: Grid, room: number): Vec2 | null {
  let best: { i: number; j: number; area: number } | null = null;
  for (const { i, j } of roomCells(grid, room)) {
    const area = (grid.xLines[i + 1] - grid.xLines[i]) * (grid.yLines[j + 1] - grid.yLines[j]);
    if (!best || area > best.area) best = { i, j, area };
  }
  if (!best) return null;
  return {
    x: (grid.xLines[best.i] + grid.xLines[best.i + 1]) / 2,
    z: (grid.yLines[best.j] + grid.yLines[best.j + 1]) / 2,
  };
}

/** The owner of the cell at a plan point, −1 outside the rooms or the grid. */
export function ownerAt(grid: Grid, point: Vec2): number {
  const i = locate(grid.xLines, point.x);
  const j = locate(grid.yLines, point.z);
  if (i < 0 || j < 0) return -1;
  return grid.owner[j * grid.nx + i];
}

function locate(lines: number[], v: number): number {
  for (let i = 0; i + 1 < lines.length; i++) if (v >= lines[i] && v <= lines[i + 1]) return i;
  return -1;
}

/**
 * Every stretch of grid line with different owners on its two sides, consecutive cells with
 * the same pair joined into one run.
 */
export function boundaryRuns(grid: Grid): BoundaryRun[] {
  const { nx, ny, owner, xLines, yLines } = grid;
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? -1 : owner[j * nx + i]);
  const runs: BoundaryRun[] = [];

  for (let i = 0; i <= nx; i++) {
    let open: BoundaryRun | null = null;
    for (let j = 0; j <= ny; j++) {
      const a = j < ny ? at(i - 1, j) : -2;
      const b = j < ny ? at(i, j) : -2;
      const differs = j < ny && a !== b && yLines[j + 1] - yLines[j] > MIN_CELL_M;
      if (open && (!differs || open.a !== a || open.b !== b)) {
        runs.push(open);
        open = null;
      }
      if (differs && !open) open = { orientation: 'v', line: i, at: xLines[i], from: yLines[j], to: yLines[j + 1], a, b };
      else if (differs && open) open.to = yLines[j + 1];
    }
  }
  for (let j = 0; j <= ny; j++) {
    let open: BoundaryRun | null = null;
    for (let i = 0; i <= nx; i++) {
      const a = i < nx ? at(i, j - 1) : -2;
      const b = i < nx ? at(i, j) : -2;
      const differs = i < nx && a !== b && xLines[i + 1] - xLines[i] > MIN_CELL_M;
      if (open && (!differs || open.a !== a || open.b !== b)) {
        runs.push(open);
        open = null;
      }
      if (differs && !open) open = { orientation: 'h', line: j, at: yLines[j], from: xLines[i], to: xLines[i + 1], a, b };
      else if (differs && open) open.to = xLines[i + 1];
    }
  }
  return runs;
}

/** A run's two ends in the plan. */
export function runEnds(run: Pick<BoundaryRun, 'orientation' | 'at' | 'from' | 'to'>): { a: Vec2; b: Vec2 } {
  return run.orientation === 'v'
    ? { a: { x: run.at, z: run.from }, b: { x: run.at, z: run.to } }
    : { a: { x: run.from, z: run.at }, b: { x: run.to, z: run.at } };
}

/**
 * The walls along the boundaries: each run a wall of its line's thickness, except the stretches
 * `openStretches` names (metres along the line), which are room separators. Pieces shorter than
 * a couple of centimetres are left out; the wall graph would only prune them.
 */
export function wallsFromRuns(
  runs: BoundaryRun[],
  thickness: (run: BoundaryRun) => number,
  openStretches: (run: BoundaryRun) => Array<[number, number]>
): Wall[] {
  const walls: Wall[] = [];
  let index = 0;
  const push = (run: BoundaryRun, from: number, to: number, separator: boolean) => {
    if (to - from < 0.02) return;
    const { a, b } = runEnds({ ...run, from, to });
    walls.push({
      id: `w${++index}`,
      a: round(a),
      b: round(b),
      thicknessM: separator ? 0 : round3(thickness(run)),
      origin: 'existing',
      ...(separator ? { separator: true } : {}),
    });
  };

  for (const run of runs) {
    const open = run.a >= 0 && run.b >= 0 ? mergeStretches(openStretches(run), run.from, run.to) : [];
    let cursor = run.from;
    for (const [from, to] of open) {
      push(run, cursor, from, false);
      push(run, from, to, true);
      cursor = to;
    }
    push(run, cursor, run.to, false);
  }
  return walls;
}

/** Stretches clipped to `[lo, hi]`, sorted and merged where they touch. */
function mergeStretches(stretches: Array<[number, number]>, lo: number, hi: number): Array<[number, number]> {
  const clipped = stretches
    .map(([a, b]): [number, number] => [Math.max(lo, Math.min(a, b)), Math.min(hi, Math.max(a, b))])
    .filter(([a, b]) => b - a > 0.02)
    .sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of clipped) {
    const last = out[out.length - 1];
    // A wall stub shorter than a hand between two open stretches, or against the run's end, is
    // not a wall the drawing shows; the open stretch takes it.
    if (last && a <= last[1] + 0.1) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  for (const span of out) {
    if (span[0] - lo < 0.1) span[0] = lo;
    if (hi - span[1] < 0.1) span[1] = hi;
  }
  return out;
}

function round(p: Vec2): Vec2 {
  return { x: round3(p.x), z: round3(p.z) };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
