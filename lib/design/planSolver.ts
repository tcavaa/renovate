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
 *      dimension is a strong constraint and each line's observed position a weak one. A size
 *      written inside a room is the distance between its two walls' *faces*, so the
 *      centrelines stand that plus half of each wall apart. A dimension line drawn outside the
 *      plan is measured the way an architect chains them, and the way the board draws its own
 *      (`outerDimensionChains`): from the outer face of an outside wall to the middle of an
 *      inside one, so a chain adds up to the overall size.
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
  /** A balcony or terrace: the wall between it and the flat is an outside wall. */
  outdoor?: boolean;
}

/**
 * A dimension line printed on the drawing (not a size written in a room), normalised. Its ends
 * land on wall lines: an end on an outside wall measures to that wall's outer face, any other
 * to the wall's middle.
 */
export interface PrintedDimension {
  /** `x` measures left to right (its ends are x positions), `y` top to bottom. */
  axis: 'x' | 'y';
  from: number;
  to: number;
  /** Where the dimension line itself is drawn, on the other axis — which end of a wall it measures to. */
  at: number;
  metres: number;
}

export interface SolveOptions {
  dimensions?: PrintedDimension[];
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
  /** The same for each dimension line used, by its index in `options.dimensions`. */
  dimensionResiduals: Array<{ index: number; target: number; solved: number }>;
  /** Set when the dimensions disagreed badly enough that the result should be reviewed. */
  lowConfidence: boolean;
  /**
   * Whether anything printed gave the plan its size. False for a drawing with no sizes at all:
   * the plan is at an assumed scale, and the person is asked for one wall's length.
   */
  scaleKnown: boolean;
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

/** A dimension line's end further than this from every wall line is not trusted, normalised. */
const DIMENSION_SNAP = 0.04;

/** An inside wall where the image does not show one (or nothing printed gives it a size), metres. */
export const DEFAULT_WALL_M = 0.12;
/** An outside wall where the image does not show one (or nothing printed gives it a size), metres. */
export const DEFAULT_EXTERIOR_WALL_M = 0.3;

/** Wall thicknesses read off the image are kept within these, metres. */
const MIN_WALL_M = 0.06;
const MAX_WALL_M = 0.6;

/** The sizes a measured wall is rounded to: a few pixels of ink are not a thickness anyone builds. */
export const STANDARD_WALLS_M = [0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6] as const;

/** A measured thickness as the standard size nearest it. */
export function standardWallThickness(metres: number): number {
  const m = clamp(metres, MIN_WALL_M, MAX_WALL_M);
  return STANDARD_WALLS_M.reduce((best, s) => (Math.abs(s - m) < Math.abs(best - m) ? s : best), STANDARD_WALLS_M[0]);
}

type Side = 'x0' | 'x1' | 'y0' | 'y1';

export function solvePlan(rooms: RoughRoom[], options: SolveOptions = {}): SolveResult {
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
      dimensionResiduals: [],
      lowConfidence: true,
      scaleKnown: false,
    };
  }
  const dimensions = (options.dimensions ?? []).filter((d) => Number.isFinite(d.metres) && d.metres > 0 && Math.abs(d.to - d.from) > 1e-3);

  // --- 0. a rough scale from the boxes as given, to size the default wall in image units --
  const rough = roughScale(rooms, dimensions);
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

  // --- 1b. which side of each line the rooms are on: outside walls, and what a chain measures --
  const sides = lineSides(indexed, xLines.length, yLines.length);
  const indoor = lineSides(indexed.filter((e) => !e.room.outdoor), xLines.length, yLines.length);
  const xExterior = xLines.map((_, i) => isExterior(indoor.x[i], yLines));
  const yExterior = yLines.map((_, i) => isExterior(indoor.y[i], xLines));
  // A wall the image does not show is an outside one's thickness on the outside, keeping the
  // room's face where the box put it.
  const widenUnmeasured = (lines: Line[], exterior: boolean[], lineSides: LineSides[], defaultT: number) => {
    lines.forEach((line, i) => {
      if (line.measured || !exterior[i]) return;
      const t = (defaultT * DEFAULT_EXTERIOR_WALL_M) / DEFAULT_WALL_M;
      const outward = coveredLength(lineSides[i].neg) >= coveredLength(lineSides[i].pos) ? 1 : -1;
      line.c += (outward * (t - line.t)) / 2;
      line.t = t;
    });
  };
  widenUnmeasured(xLines, xExterior, sides.x, defaultT.x);
  widenUnmeasured(yLines, yExterior, sides.y, defaultT.y);

  // Each dimension line's ends on the wall lines, and which face (or the middle) each measures to.
  const chains = dimensions.flatMap((d, index) => {
    const lines = d.axis === 'x' ? xLines : yLines;
    const across = d.axis === 'x' ? yLines : xLines;
    const lo = nearestLine(Math.min(d.from, d.to), lines);
    const hi = nearestLine(Math.max(d.from, d.to), lines);
    if (lo === hi || Math.abs(lines[lo].c - Math.min(d.from, d.to)) > DIMENSION_SNAP || Math.abs(lines[hi].c - Math.max(d.from, d.to)) > DIMENSION_SNAP) return [];
    const lineSide = d.axis === 'x' ? sides.x : sides.y;
    return [{ index, axis: d.axis, lo, hi, metres: d.metres, faceLo: faceAt(lineSide[lo], across, d.at), faceHi: faceAt(lineSide[hi], across, d.at) }];
  });

  // --- 2. a scale per axis, so the weak priors are in metres ---------------------------------
  //
  // Two scales, not one: boxes are normalised against the image's width for x and its height
  // for y, and drawings are rarely square. Sharing a scale stretches one axis by the aspect
  // ratio, which then makes every dimension on that axis look like a misread.
  const { scale, known: scaleKnown } = estimateScale(indexed, xLines, yLines, chains);

  // Measured walls at a standard size when the plan has a size; with nothing printed the ink's
  // widths are in no unit, so every wall is the default for its kind.
  const thicknessM = (lines: Line[], s: number, exterior: boolean[]) =>
    lines.map((line, i) =>
      scaleKnown && line.measured ? standardWallThickness(line.t * s) : exterior[i] ? DEFAULT_EXTERIOR_WALL_M : DEFAULT_WALL_M
    );
  const xThickness = thicknessM(xLines, scale.x, xExterior);
  const yThickness = thicknessM(yLines, scale.y, yExterior);

  // --- 3. solve each axis independently --------------------------------------------------------
  // A size in a room runs face to face; the centrelines stand half of each wall further out.
  // A dimension line runs between the faces (or middles) its ends measure to.
  const chainLength = (c: (typeof chains)[number], thickness: number[]) =>
    c.metres - (c.faceHi * thickness[c.hi]) / 2 + (c.faceLo * thickness[c.lo]) / 2;
  const xTargets = [
    ...indexed
      .filter((e) => e.room.widthM != null && e.x1 > e.x0)
      .map((e) => ({ lo: e.x0, hi: e.x1, length: (e.room.widthM as number) + (xThickness[e.x0] + xThickness[e.x1]) / 2 })),
    ...chains.filter((c) => c.axis === 'x').map((c) => ({ lo: c.lo, hi: c.hi, length: chainLength(c, xThickness) })),
  ];
  const yTargets = [
    ...indexed
      .filter((e) => e.room.depthM != null && e.y1 > e.y0)
      .map((e) => ({ lo: e.y0, hi: e.y1, length: (e.room.depthM as number) + (yThickness[e.y0] + yThickness[e.y1]) / 2 })),
    ...chains.filter((c) => c.axis === 'y').map((c) => ({ lo: c.lo, hi: c.hi, length: chainLength(c, yThickness) })),
  ];

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

  const dimensionResiduals = chains.map((c) => {
    const lines = c.axis === 'x' ? finalX : finalY;
    const thickness = c.axis === 'x' ? xThickness : yThickness;
    return {
      index: c.index,
      target: c.metres,
      solved: lines[c.hi] + (c.faceHi * thickness[c.hi]) / 2 - (lines[c.lo] + (c.faceLo * thickness[c.lo]) / 2),
    };
  });

  const worst = [...residuals, ...dimensionResiduals].reduce(
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
    dimensionResiduals,
    lowConfidence: worst > 0.08,
    scaleKnown,
  };
}

// ---------------------------------------------------------------------------
// Which side of a line the rooms are on
// ---------------------------------------------------------------------------

/**
 * The rooms either side of one grid line, as spans of cells along it (indices into the other
 * axis's lines): `neg` the rooms on its left (above, for a horizontal line), `pos` on its right
 * (below).
 */
interface LineSides {
  neg: Array<[number, number]>;
  pos: Array<[number, number]>;
}

function lineSides(
  indexed: Array<{ x0: number; x1: number; y0: number; y1: number }>,
  xCount: number,
  yCount: number
): { x: LineSides[]; y: LineSides[] } {
  const x: LineSides[] = Array.from({ length: xCount }, () => ({ neg: [], pos: [] }));
  const y: LineSides[] = Array.from({ length: yCount }, () => ({ neg: [], pos: [] }));
  for (const e of indexed) {
    x[e.x1].neg.push([e.y0, e.y1]);
    x[e.x0].pos.push([e.y0, e.y1]);
    y[e.y1].neg.push([e.x0, e.x1]);
    y[e.y0].pos.push([e.x0, e.x1]);
  }
  return { x, y };
}

const covers = (spans: Array<[number, number]>, cell: number) => spans.some(([a, b]) => a <= cell && cell < b);

function coveredLength(spans: Array<[number, number]>): number {
  return spans.reduce((sum, [a, b]) => sum + (b - a), 0);
}

/**
 * An outside wall: a room of the flat on one side of it only, all along it (a balcony counts as
 * outside). A line carries one thickness, so a line that is a partition anywhere — the wall
 * between a bathroom and the hallway that runs on past the hallway to the outside — keeps a
 * partition's: an outside wall's 30 cm there would push both rooms' faces 9 cm off their sizes.
 */
function isExterior(sides: LineSides, across: Line[]): boolean {
  let outside = false;
  for (let k = 0; k + 1 < across.length; k++) {
    const neg = covers(sides.neg, k);
    const pos = covers(sides.pos, k);
    if (neg && pos) return false;
    if (neg || pos) outside = true;
  }
  return outside;
}

/**
 * What a dimension line's end on this line measures to: the wall's face on the outside (+1 its
 * positive side, −1 its negative) where the line is an outside wall at the end the dimension is
 * drawn by, else its middle (0). A chain drawn above the plan meets each wall at the wall's top
 * end, so that end decides — the middle of a partition reaching the outside wall, the outer face
 * of the outside wall at a corner.
 */
function faceAt(sides: LineSides, across: Line[], at: number): -1 | 0 | 1 {
  const cells: number[] = [];
  for (let k = 0; k + 1 < across.length; k++) if (covers(sides.neg, k) || covers(sides.pos, k)) cells.push(k);
  if (cells.length === 0) return 0;
  const first = cells[0];
  const last = cells[cells.length - 1];
  const cell =
    at <= across[first].c
      ? first
      : at >= across[last + 1].c
        ? last
        : cells.reduce((best, k) => (Math.abs((across[k].c + across[k + 1].c) / 2 - at) < Math.abs((across[best].c + across[best + 1].c) / 2 - at) ? k : best), first);
  const neg = covers(sides.neg, cell);
  const pos = covers(sides.pos, cell);
  if (neg && !pos) return 1;
  if (pos && !neg) return -1;
  return 0;
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
function roughScale(rooms: RoughRoom[], dimensions: PrintedDimension[]): { x: number; y: number } {
  const span = (d: PrintedDimension) => d.metres / Math.abs(d.to - d.from);
  const xs = [
    ...rooms.filter((r) => r.widthM != null && r.box.x1 - r.box.x0 > 1e-3).map((r) => (r.widthM as number) / (r.box.x1 - r.box.x0)),
    ...dimensions.filter((d) => d.axis === 'x').map(span),
  ];
  const ys = [
    ...rooms.filter((r) => r.depthM != null && r.box.y1 - r.box.y0 > 1e-3).map((r) => (r.depthM as number) / (r.box.y1 - r.box.y0)),
    ...dimensions.filter((d) => d.axis === 'y').map(span),
  ];
  const x = median(xs) ?? median(ys) ?? 12;
  const y = median(ys) ?? x;
  return { x, y };
}

/**
 * Metres per normalised unit, from whichever rooms carry a printed dimension.
 *
 * The median rather than the mean: one misread label ("18" for "1.8") would drag an average
 * badly, and a plan only carries a handful of dimensions to begin with. A label runs face to
 * face, so it is compared with the span between the walls' faces; a dimension line with the
 * span between the faces or middles its ends measure to.
 */
function estimateScale(
  indexed: Array<{ room: RoughRoom; x0: number; x1: number; y0: number; y1: number }>,
  xLines: Line[],
  yLines: Line[],
  chains: Array<{ axis: 'x' | 'y'; lo: number; hi: number; metres: number; faceLo: number; faceHi: number }>
): { scale: { x: number; y: number }; known: boolean } {
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
  for (const c of chains) {
    const lines = c.axis === 'x' ? xLines : yLines;
    const span = lines[c.hi].c + (c.faceHi * lines[c.hi].t) / 2 - (lines[c.lo].c + (c.faceLo * lines[c.lo].t) / 2);
    if (span > 1e-4) (c.axis === 'x' ? xSamples : ySamples).push(c.metres / span);
  }

  // A plan with no dimensions on one axis borrows the other's; with none at all, assume a flat
  // about 12 m across, which at least puts the furniture at a sane size until the person gives
  // one wall's length.
  const x = median(xSamples) ?? median(ySamples) ?? 12;
  const y = median(ySamples) ?? x;
  return { scale: { x, y }, known: xSamples.length + ySamples.length > 0 };
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
