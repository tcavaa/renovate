/**
 * Fitting the rooms to the areas printed in them.
 *
 * A developer's plan often prints nothing but each room's area — "10.8 m²" in the living room,
 * "3.0 m²" in the bathroom — and that number is what the buyer holds the flat to. The solver
 * (`planSolver`) puts every wall where the drawing has it, to within a pixel or two; a pixel of
 * a small plan is a couple of centimetres, and a couple of centimetres along four metres of wall
 * is the difference between 10.8 and 10.7. So once the walls stand, the grid lines are nudged —
 * as little as possible — until every room measures what is printed in it.
 *
 * A room's area changes with a line by the length of the room's boundary on that line, which
 * the grid's boundary runs give directly; the wall thicknesses only bend that a little, so the
 * caller measures the rooms again after each step and repeats (`buildPlanFromReading`). Each
 * step is a small least-squares problem: move the lines as little as their stiffness allows —
 * a line no wall stands on (a room separator) moves freely, a wall the ink showed hardly at all
 * — keep every pair of lines a printed size holds apart at its distance, and meet the areas.
 *
 * Pure: no THREE, no React, no I/O.
 */

import type { BoundaryRun } from './planGrid';
import { solveLinearSystem } from './planSolver';

export interface AreaTarget {
  /** Index of the room in the reading (a boundary run's `a` / `b`). */
  room: number;
  /** The area printed in the room, m². */
  target: number;
  /** What the room measures now, m² — its floor, wall face to wall face. */
  current: number;
}

export interface AreaStepInput {
  /** How many lines each axis has. */
  nx: number;
  ny: number;
  runs: BoundaryRun[];
  targets: AreaTarget[];
  /** How hard each line holds its place: 1 for a wall the image showed, less for the rest. */
  stiffness: { x: number[]; y: number[] };
  /** Pairs of lines a printed size holds apart (`SolveResult.ties`). */
  ties: Array<{ axis: 'x' | 'y'; lo: number; hi: number }>;
}

/** How much the areas outweigh a line's wish to stay, and how much a printed size does. */
const AREA_WEIGHT = 1e4;
const TIE_WEIGHT = 1e4;

/** A printed area further than this from the room as drawn is a misread or another room's: it is not fitted. */
export const MAX_AREA_DRIFT = 0.25;

/**
 * One step towards the printed areas: how far to move each line (metres), or null when there
 * is nothing to fit or the system cannot be solved.
 */
export function areaStep(input: AreaStepInput): { dx: number[]; dy: number[] } | null {
  const { nx, ny, runs, targets, stiffness, ties } = input;
  const n = nx + ny;
  if (n === 0 || targets.length === 0) return null;

  // d(area of room) / d(line): the room's boundary on the line, + where the line is its far side.
  const rows = targets.map(({ room }) => {
    const row = new Array<number>(n).fill(0);
    for (const run of runs) {
      const index = run.orientation === 'v' ? run.line : nx + run.line;
      const length = run.to - run.from;
      if (run.a === room) row[index] += length;
      if (run.b === room) row[index] -= length;
    }
    return row;
  });

  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) A[i][i] += Math.max(1e-4, i < nx ? stiffness.x[i] ?? 1 : stiffness.y[i - nx] ?? 1);
  for (const tie of ties) {
    const lo = tie.axis === 'x' ? tie.lo : nx + tie.lo;
    const hi = tie.axis === 'x' ? tie.hi : nx + tie.hi;
    if (lo === hi || lo < 0 || hi >= n) continue;
    A[hi][hi] += TIE_WEIGHT;
    A[lo][lo] += TIE_WEIGHT;
    A[hi][lo] -= TIE_WEIGHT;
    A[lo][hi] -= TIE_WEIGHT;
  }
  rows.forEach((row, r) => {
    const error = targets[r].target - targets[r].current;
    for (let i = 0; i < n; i++) {
      if (row[i] === 0) continue;
      b[i] += AREA_WEIGHT * row[i] * error;
      for (let j = 0; j < n; j++) if (row[j] !== 0) A[i][j] += AREA_WEIGHT * row[i] * row[j];
    }
  });

  const solved = solveLinearSystem(A, b);
  if (!solved || solved.some((v) => !Number.isFinite(v))) return null;
  return { dx: solved.slice(0, nx), dy: solved.slice(nx) };
}

/** Two neighbouring lines may come no closer than this share of what they stood apart before the fit. */
const MIN_GAP_SHARE = 0.6;

/**
 * The neighbouring lines a step would bring too close — a room squeezed thin, or two lines
 * crossing, which the grid cannot be — as pairs to hold at their distance (`AreaStepInput.ties`)
 * while the step is worked out again. `base` is where the lines stood before any fitting.
 */
export function squeezedPairs(lines: number[], delta: number[], base: number[], axis: 'x' | 'y'): AreaStepInput['ties'] {
  const out: AreaStepInput['ties'] = [];
  for (let i = 1; i < lines.length; i++) {
    const before = lines[i] - lines[i - 1];
    const after = before + (delta[i] ?? 0) - (delta[i - 1] ?? 0);
    if (after < before - 1e-9 && after < (base[i] - base[i - 1]) * MIN_GAP_SHARE - 1e-9) out.push({ axis, lo: i - 1, hi: i });
  }
  return out;
}
