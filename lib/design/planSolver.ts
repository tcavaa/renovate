/**
 * Turns roughly-placed rooms plus the dimensions printed on the drawing into exact wall lines.
 *
 * A vision model is very good at reading a drawing — which rooms exist, what they are called,
 * which walls carry which dimension, what connects to what — and poor at emitting precise
 * coordinates. Asking it for polygon vertices gives numbers that are a few percent out, which
 * is worse than being obviously wrong because nothing flags it.
 *
 * So the model supplies approximate boxes (each room one or more of them) and exact *labels*,
 * the drawing's own ink may pin a box edge onto the wall it really is (`planInk`), and this
 * reconciles them:
 *
 *   1. Every box edge becomes an estimate of a wall's *centreline* — a measured wall band's
 *      centre, or the box's inner face pushed out by half a default wall — and nearby
 *      estimates are snapped onto one shared grid line, so neighbours agree on the wall
 *      between them instead of each having their own a pixel or two apart.
 *   2. Those lines become the unknowns of a small least-squares problem. Each printed
 *      dimension is a strong constraint — a room's printed width is the distance between its
 *      two walls' *faces*, so the centrelines stand that plus half of each wall apart — and
 *      each line's observed position is a weak one.
 *   3. Solving gives the line positions that best satisfy every printed dimension at once.
 *
 * The result is a grid of wall centrelines in metres plus each line's wall thickness, from
 * which `planGrid` builds the walls themselves. Where dimensions conflict, least squares
 * spreads the error instead of letting the last one win.
 *
 * Pure: no THREE, no React, no I/O.
 */

/** An axis-aligned box in normalised image coordinates, 0..1, y down. */
export interface NormBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A wall band the drawing's ink shows along one side of a box: its centre and thickness, normalised. */
export interface InkEdge {
  centre: number;
  thickness: number;
}

/** A box as the vision model reports it, before anything is made exact. */
export interface RoughRoom {
  id: string;
  box: NormBox;
  /** Printed width (inner face to inner face) in metres, when the drawing states one. */
  widthM?: number | null;
  /** Printed depth in metres, when the drawing states one. */
  depthM?: number | null;
  /** The walls the image shows along the box's sides, where `planInk` found them. */
  ink?: Partial<Record<'x0' | 'x1' | 'y0' | 'y1', InkEdge | null>>;
}

export interface SolvedRoom {
  id: string;
  /** Exact box between wall centrelines, in metres, x east and y south, origin at the plan's top-left line. */
  box: { x0: number; y0: number; x1: number; y1: number };
  /** The grid lines the box's sides sit on (indices into `xLines` / `yLines`). */
  lines: { x0: number; x1: number; y0: number; y1: number };
}

export interface SolveResult {
  rooms: SolvedRoom[];
  /** Wall centrelines in metres, sorted, the first at 0. */
  xLines: number[];
  yLines: number[];
  /** Each line's wall thickness, metres. */
  xThickness: number[];
  yThickness: number[];
  /** Metres per normalised unit on each axis, before the constraints were applied. */
  initialScale: { x: number; y: number };
  /** A point of the image (normalised) in plan metres — piecewise between the solved lines. */
  toPlan: (point: { x: number; y: number }) => { x: number; z: number };
  /** The inverse: a plan point back onto the image, normalised. */
  toImage: (point: { x: number; z: number }) => { x: number; y: number };
  /** How far each printed dimension ended up from its target, in metres (inner face to inner face). */
  residuals: Array<{ roomId: string; axis: 'width' | 'depth'; target: number; solved: number }>;
  /** Set when the dimensions disagreed badly enough that the result should be reviewed. */
  lowConfidence: boolean;
}

/**
 * Centreline estimates closer together than this share of the plan are treated as one wall.
 *
 * Too small and a wall shared by three rooms becomes three walls a few centimetres apart, so
 * the rooms no longer tile. Too large and genuinely distinct walls — the two sides of a
 * corridor — get merged into one.
 */
const SNAP_TOLERANCE = 0.022;

/** A printed dimension more than this far from the measured box is treated as a misread. */
const MAX_DIMENSION_DRIFT = 0.45;

/** The wall assumed where the image does not show one, metres. */
export const DEFAULT_WALL_M = 0.12;

/** Wall thicknesses read off the image are kept within these, metres. */
const MIN_WALL_M = 0.06;
const MAX_WALL_M = 0.5;

type Side = 'x0' | 'x1' | 'y0' | 'y1';

export function solvePlan(rooms: RoughRoom[]): SolveResult {
  if (rooms.length === 0) {
    const identity = { x: 1, y: 1 };
    return {
      rooms: [],
      xLines: [],
      yLines: [],
      xThickness: [],
      yThickness: [],
      initialScale: identity,
      toPlan: (p) => ({ x: p.x, z: p.y }),
      toImage: (p) => ({ x: p.x, y: p.z }),
      residuals: [],
      lowConfidence: true,
    };
  }

  // --- 0. a rough scale from the boxes as given, to size the default wall in image units --
  const rough = roughScale(rooms);
  const defaultT = { x: DEFAULT_WALL_M / rough.x, y: DEFAULT_WALL_M / rough.y };

  // --- 1. every box side as a centreline estimate, snapped onto shared grid lines ----------
  const estimate = (room: RoughRoom, side: Side): { c: number; t: number; measured: boolean } => {
    const ink = room.ink?.[side];
    if (ink) return { c: ink.centre, t: ink.thickness, measured: true };
    const horizontal = side === 'x0' || side === 'x1';
    const t = horizontal ? defaultT.x : defaultT.y;
    const outward = side === 'x0' || side === 'y0' ? -1 : 1;
    return { c: room.box[side] + (outward * t) / 2, t, measured: false };
  };
  const estimates = rooms.map((room) => ({
    x0: estimate(room, 'x0'),
    x1: estimate(room, 'x1'),
    y0: estimate(room, 'y0'),
    y1: estimate(room, 'y1'),
  }));

  const xLines = clusterLines(estimates.flatMap((e) => [e.x0, e.x1]));
  const yLines = clusterLines(estimates.flatMap((e) => [e.y0, e.y1]));

  const indexed = rooms.map((room, i) => ({
    room,
    x0: nearestLine(estimates[i].x0.c, xLines),
    x1: nearestLine(estimates[i].x1.c, xLines),
    y0: nearestLine(estimates[i].y0.c, yLines),
    y1: nearestLine(estimates[i].y1.c, yLines),
  }));

  // A room whose two edges snapped to the same line has collapsed; nudge it back apart so the
  // solve has something to work with.
  for (const entry of indexed) {
    if (entry.x1 <= entry.x0) entry.x1 = Math.min(xLines.length - 1, entry.x0 + 1);
    if (entry.y1 <= entry.y0) entry.y1 = Math.min(yLines.length - 1, entry.y0 + 1);
  }

  // --- 2. a scale per axis, so the weak priors are in metres ---------------------------------
  //
  // Two scales, not one: boxes are normalised against the image's width for x and its height
  // for y, and drawings are rarely square. Sharing a scale stretches one axis by the aspect
  // ratio, which then makes every dimension on that axis look like a misread.
  const scale = estimateScale(indexed, xLines, yLines);

  const thicknessM = (lines: Line[], s: number) =>
    lines.map((line) => (line.measured ? clamp(line.t * s, MIN_WALL_M, MAX_WALL_M) : DEFAULT_WALL_M));
  const xThickness = thicknessM(xLines, scale.x);
  const yThickness = thicknessM(yLines, scale.y);

  // --- 3. solve each axis independently --------------------------------------------------------
  // A printed dimension runs face to face; the centrelines stand half of each wall further out.
  const xTargets = indexed
    .filter((e) => e.room.widthM != null && e.x1 > e.x0)
    .map((e) => ({ lo: e.x0, hi: e.x1, length: (e.room.widthM as number) + (xThickness[e.x0] + xThickness[e.x1]) / 2 }));
  const yTargets = indexed
    .filter((e) => e.room.depthM != null && e.y1 > e.y0)
    .map((e) => ({ lo: e.y0, hi: e.y1, length: (e.room.depthM as number) + (yThickness[e.y0] + yThickness[e.y1]) / 2 }));

  const measuredX = xLines.map((line) => line.c * scale.x);
  const measuredY = yLines.map((line) => line.c * scale.y);
  const solvedX = solveAxis(measuredX, xTargets);
  const solvedY = solveAxis(measuredY, yTargets);

  // --- 4. rebuild, with the plan's top-left line at the origin ---------------------------------
  const originX = Math.min(...solvedX);
  const originY = Math.min(...solvedY);
  const finalX = solvedX.map((v) => v - originX);
  const finalY = solvedY.map((v) => v - originY);

  const solvedRooms: SolvedRoom[] = indexed.map((entry) => ({
    id: entry.room.id,
    box: { x0: finalX[entry.x0], y0: finalY[entry.y0], x1: finalX[entry.x1], y1: finalY[entry.y1] },
    lines: { x0: entry.x0, x1: entry.x1, y0: entry.y0, y1: entry.y1 },
  }));

  // --- 5. report how well the printed dimensions were honoured -----------------------------
  const residuals: SolveResult['residuals'] = [];
  for (const entry of indexed) {
    if (entry.room.widthM != null) {
      residuals.push({
        roomId: entry.room.id,
        axis: 'width',
        target: entry.room.widthM,
        solved: finalX[entry.x1] - finalX[entry.x0] - (xThickness[entry.x0] + xThickness[entry.x1]) / 2,
      });
    }
    if (entry.room.depthM != null) {
      residuals.push({
        roomId: entry.room.id,
        axis: 'depth',
        target: entry.room.depthM,
        solved: finalY[entry.y1] - finalY[entry.y0] - (yThickness[entry.y0] + yThickness[entry.y1]) / 2,
      });
    }
  }

  const worst = residuals.reduce(
    (max, r) => Math.max(max, Math.abs(r.solved - r.target) / Math.max(r.target, 0.1)),
    0
  );

  const xMap = piecewise(xLines.map((l) => l.c), finalX, scale.x);
  const yMap = piecewise(yLines.map((l) => l.c), finalY, scale.y);

  return {
    rooms: solvedRooms,
    xLines: finalX,
    yLines: finalY,
    xThickness,
    yThickness,
    initialScale: scale,
    toPlan: (p) => ({ x: xMap.forward(p.x), z: yMap.forward(p.y) }),
    toImage: (p) => ({ x: xMap.inverse(p.x), y: yMap.inverse(p.z) }),
    residuals,
    lowConfidence: worst > 0.08,
  };
}

// ---------------------------------------------------------------------------
// Grid lines
// ---------------------------------------------------------------------------

interface Line {
  /** Centreline position, normalised. */
  c: number;
  /** Wall thickness, normalised. */
  t: number;
  /** Whether any member was a wall band the image showed. */
  measured: boolean;
}

/**
 * Groups nearby centreline estimates into single shared lines. A band the image showed outranks
 * a guess from a box face: where one is in the group, the line sits on it.
 */
function clusterLines(values: Array<{ c: number; t: number; measured: boolean }>): Line[] {
  const sorted = [...values].sort((a, b) => a.c - b.c);
  const lines: Line[] = [];
  let group: typeof sorted = [];

  const flush = () => {
    if (group.length === 0) return;
    const measured = group.filter((g) => g.measured);
    const basis = measured.length > 0 ? measured : group;
    lines.push({ c: mean(basis.map((g) => g.c)), t: median(basis.map((g) => g.t)) ?? 0, measured: measured.length > 0 });
  };

  for (const value of sorted) {
    if (group.length === 0 || value.c - group[group.length - 1].c <= SNAP_TOLERANCE) {
      group.push(value);
    } else {
      flush();
      group = [value];
    }
  }
  flush();
  return lines;
}

function nearestLine(value: number, lines: Line[]): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const distance = Math.abs(lines[i].c - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** Metres per normalised unit from the raw boxes — only to size a default wall before the lines exist. */
function roughScale(rooms: RoughRoom[]): { x: number; y: number } {
  const xs = rooms.filter((r) => r.widthM != null && r.box.x1 - r.box.x0 > 1e-3).map((r) => (r.widthM as number) / (r.box.x1 - r.box.x0));
  const ys = rooms.filter((r) => r.depthM != null && r.box.y1 - r.box.y0 > 1e-3).map((r) => (r.depthM as number) / (r.box.y1 - r.box.y0));
  const x = median(xs) ?? median(ys) ?? 12;
  const y = median(ys) ?? x;
  return { x, y };
}

/**
 * Metres per normalised unit, from whichever rooms carry a printed dimension.
 *
 * The median rather than the mean: one misread label ("18" for "1.8") would drag an average
 * badly, and a plan only carries a handful of dimensions to begin with. A label runs face to
 * face, so it is compared with the span between the walls' faces.
 */
function estimateScale(
  indexed: Array<{ room: RoughRoom; x0: number; x1: number; y0: number; y1: number }>,
  xLines: Line[],
  yLines: Line[]
): { x: number; y: number } {
  const xSamples: number[] = [];
  const ySamples: number[] = [];

  const sample = (lines: Line[], lo: number, hi: number, metres: number, into: number[]) => {
    const span = lines[hi].c - lines[lo].c;
    const faces = span - (lines[lo].t + lines[hi].t) / 2;
    if (faces > 1e-4) into.push(metres / faces);
  };
  for (const entry of indexed) {
    if (entry.room.widthM != null) sample(xLines, entry.x0, entry.x1, entry.room.widthM, xSamples);
    if (entry.room.depthM != null) sample(yLines, entry.y0, entry.y1, entry.room.depthM, ySamples);
  }

  // A plan with no dimensions on one axis borrows the other's; with none at all, assume a flat
  // about 12 m across, which at least puts the furniture at a sane size.
  const x = median(xSamples) ?? median(ySamples) ?? 12;
  const y = median(ySamples) ?? x;
  return { x, y };
}

/**
 * Maps positions between the image (normalised) and the solved plan (metres): linear between
 * consecutive grid lines, so a door read between two walls lands between the same two walls
 * however much the solve moved them, and at the initial scale past the outermost lines.
 */
function piecewise(image: number[], plan: number[], scale: number): { forward: (v: number) => number; inverse: (v: number) => number } {
  const map = (from: number[], to: number[], outside: number) => (v: number): number => {
    const n = from.length;
    if (n === 0) return v * outside;
    if (n === 1 || v <= from[0]) return to[0] + (v - from[0]) * outside;
    if (v >= from[n - 1]) return to[n - 1] + (v - from[n - 1]) * outside;
    let i = 0;
    while (i < n - 2 && v > from[i + 1]) i++;
    const span = from[i + 1] - from[i];
    const f = span > 1e-9 ? (v - from[i]) / span : 0;
    return to[i] + f * (to[i + 1] - to[i]);
  };
  return { forward: map(image, plan, scale), inverse: map(plan, image, 1 / scale) };
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

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
