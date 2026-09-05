/**
 * Turns roughly-placed rooms plus the dimensions printed on the drawing into an exact plan.
 *
 * A vision model is very good at reading a drawing — which rooms exist, what they are called,
 * which walls carry which dimension, what connects to what — and poor at emitting precise
 * coordinates. Asking it for polygon vertices gives numbers that are a few percent out, which
 * is worse than being obviously wrong because nothing flags it.
 *
 * So the model supplies approximate boxes and exact *labels*, and this reconciles them:
 *
 *   1. Every room edge is snapped onto a shared grid line, so neighbours agree on the wall
 *      between them instead of each having their own within a pixel or two.
 *   2. Those grid lines become the unknowns of a small least-squares problem. Each printed
 *      dimension is a hard-ish constraint ("these two lines are 5.56 m apart"); each line's
 *      measured position is a weak one ("and stay roughly where you were seen").
 *   3. Solving gives the line positions that best satisfy every printed dimension at once.
 *
 * The result is a plan whose walls are exactly as long as the drawing says, and whose rooms
 * tile without gaps — which is what "inch perfect" actually requires. Where dimensions
 * conflict, least squares distributes the error instead of letting the last one win.
 *
 * Pure: no THREE, no React, no I/O.
 */

/** A room as the vision model reports it, before anything is made exact. */
export interface RoughRoom {
  id: string;
  /** Axis-aligned box in normalised image coordinates, 0..1, y down. */
  box: { x0: number; y0: number; x1: number; y1: number };
  /** Printed width in metres, when the drawing states one. */
  widthM?: number | null;
  /** Printed depth in metres, when the drawing states one. */
  depthM?: number | null;
}

export interface SolvedRoom {
  id: string;
  /** Exact box in metres, x east and y south, origin at the plan's top-left corner. */
  box: { x0: number; y0: number; x1: number; y1: number };
}

export interface SolveResult {
  rooms: SolvedRoom[];
  /** Metres per normalised unit on each axis, before the constraints were applied. */
  initialScale: { x: number; y: number };
  /** How far each printed dimension ended up from its target, in metres. */
  residuals: Array<{ roomId: string; axis: 'width' | 'depth'; target: number; solved: number }>;
  /** Set when the dimensions disagreed badly enough that the result should be reviewed. */
  lowConfidence: boolean;
}

/**
 * Edges closer together than this share of the plan are treated as the same wall.
 *
 * Too small and a wall shared by three rooms becomes three walls a few centimetres apart, so
 * the rooms no longer tile. Too large and genuinely distinct walls — the two sides of a
 * corridor — get merged into one.
 */
const SNAP_TOLERANCE = 0.022;

/** A printed dimension more than this far from the measured box is treated as a misread. */
const MAX_DIMENSION_DRIFT = 0.45;

export function solvePlan(rooms: RoughRoom[]): SolveResult {
  if (rooms.length === 0) {
    return { rooms: [], initialScale: { x: 1, y: 1 }, residuals: [], lowConfidence: true };
  }

  // --- 1. snap edges onto shared grid lines --------------------------------
  const xLines = clusterLines(rooms.flatMap((r) => [r.box.x0, r.box.x1]));
  const yLines = clusterLines(rooms.flatMap((r) => [r.box.y0, r.box.y1]));

  const indexed = rooms.map((room) => ({
    room,
    x0: nearestLine(room.box.x0, xLines),
    x1: nearestLine(room.box.x1, xLines),
    y0: nearestLine(room.box.y0, yLines),
    y1: nearestLine(room.box.y1, yLines),
  }));

  // A room whose two edges snapped to the same line has collapsed; nudge it back apart so the
  // solve has something to work with.
  for (const entry of indexed) {
    if (entry.x1 <= entry.x0) entry.x1 = Math.min(xLines.length - 1, entry.x0 + 1);
    if (entry.y1 <= entry.y0) entry.y1 = Math.min(yLines.length - 1, entry.y0 + 1);
  }

  // --- 2. an initial scale per axis, so the weak priors are in metres ------
  //
  // Two scales, not one: boxes are normalised against the image's width for x and its height
  // for y, and drawings are rarely square. Sharing a scale stretches one axis by the aspect
  // ratio, which then makes every dimension on that axis look like a misread.
  const scale = estimateScale(indexed, xLines, yLines);

  // --- 3. solve each axis independently ------------------------------------
  const xTargets = indexed
    .filter((e) => e.room.widthM != null && e.x1 > e.x0)
    .map((e) => ({ lo: e.x0, hi: e.x1, length: e.room.widthM as number }));
  const yTargets = indexed
    .filter((e) => e.room.depthM != null && e.y1 > e.y0)
    .map((e) => ({ lo: e.y0, hi: e.y1, length: e.room.depthM as number }));

  const solvedX = solveAxis(xLines.map((v) => v * scale.x), xTargets);
  const solvedY = solveAxis(yLines.map((v) => v * scale.y), yTargets);

  // --- 4. rebuild, with the plan's top-left corner at the origin -----------
  const originX = Math.min(...solvedX);
  const originY = Math.min(...solvedY);

  const solvedRooms: SolvedRoom[] = indexed.map((entry) => ({
    id: entry.room.id,
    box: {
      x0: solvedX[entry.x0] - originX,
      y0: solvedY[entry.y0] - originY,
      x1: solvedX[entry.x1] - originX,
      y1: solvedY[entry.y1] - originY,
    },
  }));

  // --- 5. report how well the printed dimensions were honoured -------------
  const residuals: SolveResult['residuals'] = [];
  for (const entry of indexed) {
    if (entry.room.widthM != null) {
      residuals.push({
        roomId: entry.room.id,
        axis: 'width',
        target: entry.room.widthM,
        solved: solvedX[entry.x1] - solvedX[entry.x0],
      });
    }
    if (entry.room.depthM != null) {
      residuals.push({
        roomId: entry.room.id,
        axis: 'depth',
        target: entry.room.depthM,
        solved: solvedY[entry.y1] - solvedY[entry.y0],
      });
    }
  }

  const worst = residuals.reduce(
    (max, r) => Math.max(max, Math.abs(r.solved - r.target) / Math.max(r.target, 0.1)),
    0
  );

  return { rooms: solvedRooms, initialScale: scale, residuals, lowConfidence: worst > 0.08 };
}

// ---------------------------------------------------------------------------
// Grid lines
// ---------------------------------------------------------------------------

/** Groups nearby edge positions into single shared lines. */
function clusterLines(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const lines: number[] = [];
  let group: number[] = [];

  for (const value of sorted) {
    if (group.length === 0 || value - group[group.length - 1] <= SNAP_TOLERANCE) {
      group.push(value);
    } else {
      lines.push(mean(group));
      group = [value];
    }
  }
  if (group.length) lines.push(mean(group));
  return lines;
}

function nearestLine(value: number, lines: number[]): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const distance = Math.abs(lines[i] - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * Metres per normalised unit, from whichever rooms carry a printed dimension.
 *
 * The median rather than the mean: one misread label ("18" for "1.8") would drag an average
 * badly, and a plan only carries a handful of dimensions to begin with.
 */
function estimateScale(
  indexed: Array<{ room: RoughRoom; x0: number; x1: number; y0: number; y1: number }>,
  xLines: number[],
  yLines: number[]
): { x: number; y: number } {
  const xSamples: number[] = [];
  const ySamples: number[] = [];

  for (const entry of indexed) {
    if (entry.room.widthM != null) {
      const span = xLines[entry.x1] - xLines[entry.x0];
      if (span > 1e-4) xSamples.push(entry.room.widthM / span);
    }
    if (entry.room.depthM != null) {
      const span = yLines[entry.y1] - yLines[entry.y0];
      if (span > 1e-4) ySamples.push(entry.room.depthM / span);
    }
  }

  // A plan with no dimensions on one axis borrows the other's; with none at all, assume a flat
  // about 12 m across, which at least puts the furniture at a sane size.
  const x = median(xSamples) ?? median(ySamples) ?? 12;
  const y = median(ySamples) ?? x;
  return { x, y };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// ---------------------------------------------------------------------------
// Least squares along one axis
// ---------------------------------------------------------------------------

interface AxisTarget {
  lo: number;
  hi: number;
  length: number;
}

/**
 * Finds the line positions that best satisfy every printed dimension.
 *
 * Minimises
 *
 *     Σ  w_dim · ((x[hi] − x[lo]) − length)²      over the printed dimensions
 *   + Σ  w_prior · (x[i] − measured[i])²          over every line
 *
 * The prior is what keeps the system solvable — dimensions alone fix distances but not
 * absolute position, and rarely touch every line — while being weak enough that a stated
 * dimension wins wherever the two disagree.
 *
 * The normal equations of this are a small symmetric positive-definite system (one unknown
 * per grid line, so typically under a dozen), which Gaussian elimination handles fine.
 */
function solveAxis(measured: number[], targets: AxisTarget[]): number[] {
  const n = measured.length;
  if (n === 0) return [];

  const usable = targets.filter(
    (t) =>
      t.lo !== t.hi &&
      t.lo >= 0 &&
      t.hi < n &&
      Number.isFinite(t.length) &&
      t.length > 0 &&
      // Reject a label that disagrees wildly with the drawing — that is a misread, not a
      // correction, and honouring it would drag the whole plan out of shape.
      Math.abs(t.length - Math.abs(measured[t.hi] - measured[t.lo])) <=
        MAX_DIMENSION_DRIFT * Math.max(t.length, 0.5)
  );

  if (usable.length === 0) return measured.slice();

  const PRIOR = 0.05;
  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i++) {
    A[i][i] += PRIOR;
    b[i] += PRIOR * measured[i];
  }

  for (const target of usable) {
    const { lo, hi, length } = target;
    // d/dx of ((x[hi] − x[lo]) − length)²
    A[hi][hi] += 1;
    A[lo][lo] += 1;
    A[hi][lo] -= 1;
    A[lo][hi] -= 1;
    b[hi] += length;
    b[lo] -= length;
  }

  const solved = solveLinearSystem(A, b);
  if (!solved) return measured.slice();

  // Grid lines must stay in order; a solve that inverts two of them would turn a room
  // inside out. Falling back is better than emitting a negative-width room.
  for (let i = 1; i < solved.length; i++) {
    if (solved[i] < solved[i - 1]) return measured.slice();
  }
  return solved;
}

/** Gaussian elimination with partial pivoting. */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null; // singular
    [m[col], m[pivot]] = [m[pivot], m[col]];

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
    }
  }

  return m.map((row, i) => row[n] / row[i]);
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
