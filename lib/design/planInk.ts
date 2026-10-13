/**
 * What the uploaded drawing's own ink says about its walls.
 *
 * The vision model reads a plan; it does not measure one. Its boxes are a few percent out, and
 * a few percent of a flat is a door in the wrong place. The drawing itself is exact: a wall is
 * a band of dark pixels, a doorway is a gap in that band, an open-plan boundary is no band at
 * all. This module answers three narrow questions about a greyscale raster of the plan, each
 * near a place the model already pointed at — never a search of the whole image, which is what
 * defeats the CV parser on an estate agent's drawing full of furniture:
 *
 *   - `wallBandNear`: is there a wall along this side of a box, and where exactly are its centre
 *     and thickness?
 *   - `inkAlong`: how much of a stretch of grid line has ink on it — a wall, or open floor?
 *   - `gapsAlong`: where along a wall the solid band stops — the doorways and the windows.
 *
 * Coordinates in and out are normalised to the image (0..1, y down), the same frame as the
 * model's boxes. Pure: the raster comes in as bytes, nothing here touches sharp or the DOM.
 */

export interface InkImage {
  width: number;
  height: number;
  /** 1 where the pixel is ink, row-major. */
  dark: Uint8Array;
}

/**
 * A greyscale raster as ink: dark against the paper by Otsu's threshold, held below mid-grey so
 * a pale furniture fill or a hatched floor does not count as wall.
 */
export function inkFromGray(gray: Uint8Array, width: number, height: number): InkImage {
  // Otsu's threshold is the last grey of the dark class: on a pure black-and-white drawing it is 0.
  const threshold = Math.min(otsu(gray), 150);
  const dark = new Uint8Array(width * height);
  for (let i = 0; i < dark.length; i++) dark[i] = gray[i] <= threshold ? 1 : 0;
  return { width, height, dark };
}

function otsu(gray: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightB += histogram[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** One side of a box: a horizontal side (`y`, from `from` to `to` along x) or a vertical one. */
export interface BoxSide {
  /** 'h' for a top or bottom side (a line of constant y), 'v' for a left or right one. */
  orientation: 'h' | 'v';
  /** The side's position across the line, normalised (y for 'h', x for 'v'). */
  at: number;
  /** Its extent along the line, normalised. */
  from: number;
  to: number;
  /** How far either side of `at` to look, normalised; `BAND_SEARCH` when absent. */
  reach?: number;
}

/** A wall band in the ink: its centre across the line and its thickness, normalised. */
export interface WallBand {
  centre: number;
  thickness: number;
  /** Share of the side's length the band's darkest row covers, 0..1. */
  coverage: number;
}

/** How far either side of a box's side a wall band is looked for, as a share of the image. */
const BAND_SEARCH = 0.035;
/** A row of the band must be ink along at least this share of the side (a doorway leaves gaps). */
const BAND_ROW_COVERAGE = 0.42;

/**
 * The wall along one side of a box, if the image shows one near it.
 *
 * Rows (or columns) across the side's line within `BAND_SEARCH` are scored by how much of the
 * side's length they cover in ink; consecutive covered rows are one band. A wall is the band
 * with the most ink — thickness times coverage — which outranks the hairline of a kitchen
 * counter or a rug drawn parallel to it. The side's ends are trimmed so the walls it meets at
 * the corners do not count.
 */
export function wallBandNear(ink: InkImage, side: BoxSide): WallBand | null {
  const vertical = side.orientation === 'v';
  const across = vertical ? ink.width : ink.height;
  const along = vertical ? ink.height : ink.width;
  const window = Math.max(4, Math.round(Math.min(BAND_SEARCH, side.reach ?? BAND_SEARCH) * across));
  const centre = Math.round(side.at * across);
  const lo = Math.max(0, centre - window);
  const hi = Math.min(across - 1, centre + window);

  const span = (side.to - side.from) * along;
  const trim = Math.max(2, span * 0.1);
  const a = Math.max(0, Math.round(side.from * along + trim));
  const b = Math.min(along - 1, Math.round(side.to * along - trim));
  if (b - a < 4) return null;

  const rowCoverage = (r: number) => {
    let count = 0;
    for (let s = a; s <= b; s++) count += vertical ? ink.dark[s * ink.width + r] : ink.dark[r * ink.width + s];
    return count / (b - a + 1);
  };
  const coverage: number[] = [];
  for (let r = lo; r <= hi; r++) coverage.push(rowCoverage(r));

  let best: { r0: number; r1: number; score: number; peak: number } | null = null;
  let start = -1;
  for (let i = 0; i <= coverage.length; i++) {
    const covered = i < coverage.length && coverage[i] >= BAND_ROW_COVERAGE;
    if (covered && start < 0) start = i;
    if (!covered && start >= 0) {
      const rows = coverage.slice(start, i);
      const score = rows.reduce((s, v) => s + v, 0);
      const peak = Math.max(...rows);
      // The heavier band wins; between two of nearly the same weight, the one nearer the side.
      const nearness = (r0: number, r1: number) => Math.abs((lo + (r0 + r1) / 2) - centre);
      if (!best || score > best.score * 1.15 || (score > best.score * 0.85 && nearness(start, i - 1) < nearness(best.r0, best.r1))) {
        best = { r0: start, r1: i - 1, score, peak };
      }
      start = -1;
    }
  }
  if (!best) return null;
  // A band the window cut off runs on past it: follow it to its real faces (a wall, not a slab).
  let r0 = lo + best.r0;
  let r1 = lo + best.r1;
  const limit = window * 2;
  while (r0 > 0 && lo - r0 < limit && rowCoverage(r0 - 1) >= BAND_ROW_COVERAGE) r0--;
  while (r1 < across - 1 && r1 - hi < limit && rowCoverage(r1 + 1) >= BAND_ROW_COVERAGE) r1++;
  return {
    centre: (r0 + r1 + 1) / 2 / across,
    thickness: (r1 - r0 + 1) / across,
    coverage: best.peak,
  };
}

/** A stretch of a grid line, normalised: across position `at`, from `from` to `to` along it. */
export type LineStretch = BoxSide;

/**
 * Where along a stretch of line there is ink within `halfWidth` (normalised, across the line):
 * one flag per pixel along it, small breaks closed. The question a room boundary asks — wall
 * or open floor.
 */
export function inkAlong(ink: InkImage, stretch: LineStretch, halfWidth: number): boolean[] {
  const vertical = stretch.orientation === 'v';
  const across = vertical ? ink.width : ink.height;
  const along = vertical ? ink.height : ink.width;
  const c = Math.round(stretch.at * across);
  const w = Math.max(2, Math.round(halfWidth * across));
  const a = Math.max(0, Math.round(stretch.from * along));
  const b = Math.min(along - 1, Math.round(stretch.to * along));
  const out: boolean[] = [];
  for (let s = a; s <= b; s++) {
    let hit = false;
    for (let r = Math.max(0, c - w); r <= Math.min(across - 1, c + w) && !hit; r++) {
      if (vertical ? ink.dark[s * ink.width + r] : ink.dark[r * ink.width + s]) hit = true;
    }
    out.push(hit);
  }
  return closeBreaks(out, 2);
}

/** Share of a stretch with ink on it (`inkAlong`), 0..1. */
export function inkShare(ink: InkImage, stretch: LineStretch, halfWidth: number): number {
  const flags = inkAlong(ink, stretch, halfWidth);
  return flags.length === 0 ? 0 : flags.filter(Boolean).length / flags.length;
}

/**
 * The runs along a stretch with no ink — open floor across a room boundary — as fractions of
 * the stretch, 0..1, each at least `minShare` of it long.
 */
export function bareRuns(ink: InkImage, stretch: LineStretch, halfWidth: number, minShare: number): Array<{ from: number; to: number }> {
  const flags = inkAlong(ink, stretch, halfWidth);
  return runs(flags.map((f) => !f), minShare);
}

/** A gap in a solid wall band: a doorway (`empty`) or a window's thin lines (`glazed`). */
export interface WallGap {
  /** Fractions along the stretch, 0..1. */
  from: number;
  to: number;
  kind: 'empty' | 'glazed';
}

/**
 * Where along a wall the solid band stops — the doorways and windows the drawing shows — or
 * null when this drawing does not draw its walls solid (an outlined or hatched wall is thin
 * lines all along, and has no gaps to find).
 *
 * Across the band, each pixel along the wall is scored by the share of the band's thickness in
 * ink: a solid wall is nearly all ink, a window's two or three thin lines a fraction, a doorway
 * none. A wall solid along less than a third of its length is not a solid wall.
 */
export function gapsAlong(ink: InkImage, stretch: LineStretch, thickness: number, minShare: number): WallGap[] | null {
  const vertical = stretch.orientation === 'v';
  const across = vertical ? ink.width : ink.height;
  const along = vertical ? ink.height : ink.width;
  const c = stretch.at * across;
  const half = Math.max(1, (thickness * across) / 2);
  const r0 = Math.max(0, Math.round(c - half));
  const r1 = Math.min(across - 1, Math.round(c + half) - 1);
  if (r1 < r0) return null;
  const a = Math.max(0, Math.round(stretch.from * along));
  const b = Math.min(along - 1, Math.round(stretch.to * along));
  if (b - a < 4) return null;

  const fill: number[] = [];
  for (let s = a; s <= b; s++) {
    let count = 0;
    for (let r = r0; r <= r1; r++) count += vertical ? ink.dark[s * ink.width + r] : ink.dark[r * ink.width + s];
    fill.push(count / (r1 - r0 + 1));
  }
  const solid = fill.map((f) => f >= 0.6);
  if (solid.filter(Boolean).length < fill.length / 3) return null;

  return runs(closeBreaks(solid, 1).map((s) => !s), minShare).map((run) => {
    const i0 = Math.round(run.from * (fill.length - 1));
    const i1 = Math.round(run.to * (fill.length - 1));
    const inside = fill.slice(i0, i1 + 1);
    const average = inside.reduce((s, v) => s + v, 0) / Math.max(1, inside.length);
    // A doorway may carry the leaf's line across it; a window carries two or three all along.
    return { ...run, kind: average > 0.15 ? 'glazed' : 'empty' };
  });
}

/** Runs of `true` at least `minShare` of the array long, as fractions 0..1. */
function runs(flags: boolean[], minShare: number): Array<{ from: number; to: number }> {
  const n = flags.length;
  const out: Array<{ from: number; to: number }> = [];
  if (n < 2) return out;
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && flags[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if ((i - start) / n >= minShare) out.push({ from: start / (n - 1), to: (i - 1) / (n - 1) });
      start = -1;
    }
  }
  return out;
}

/** Fills runs of `false` no longer than `size` between two `true`s. */
function closeBreaks(flags: boolean[], size: number): boolean[] {
  const out = flags.slice();
  let i = 0;
  while (i < out.length) {
    if (out[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < out.length && !out[j]) j++;
    if (i > 0 && j < out.length && j - i <= size) for (let k = i; k < j; k++) out[k] = true;
    i = j;
  }
  return out;
}
