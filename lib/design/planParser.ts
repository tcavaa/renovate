/**
 * Floor-plan parser — raster image in, room polygons out.
 *
 * Deliberately deterministic: no AI, no API key, no per-request cost, same answer every time.
 *
 *   grayscale → Otsu threshold → wall mask
 *   → distance transform of the open space
 *   → threshold it to get room "cores" (a doorway is a narrow neck, so it breaks first)
 *   → label the cores, then grow them back over the open space (nearest-core wins)
 *   → drop whatever touches the image border (that's outside the flat)
 *   → Moore-neighbour contour trace → Douglas-Peucker simplify → snap to axis-aligned
 *
 * The distance-transform step is the important one. The obvious approach — dilate the walls
 * until the door gaps close — cannot work: a door gap is ~0.9 m and a wall stroke is ~0.1 m,
 * so any kernel wide enough to bridge a doorway also swallows small rooms. Separating on
 * *width* instead sidesteps that entirely, because rooms are always wider than their doors.
 *
 * It reads clean architectural plans (dark lines on light paper) well and hand-drawn or
 * photographed ones poorly — which is exactly why `/design/plan` makes the user confirm the
 * result before anything is built from it. `lowConfidence` marks the rooms to look at first.
 *
 * Pure and isomorphic: takes raw RGBA, returns plain data. The browser wrapper that turns a
 * File into RGBA lives in `planImage.ts`.
 */

import type { ParsedRegion, ParseResult } from './types';

export interface RasterImage {
  data: Uint8ClampedArray; // RGBA
  width: number;
  height: number;
}

export interface ParseOptions {
  /** Ignore rooms smaller than this share of the image. */
  minAreaRatio: number;
  /**
   * Ignore rooms larger than this share of the image. Generous on purpose: a studio flat is
   * legitimately most of the drawing, and the page itself is excluded by the border test
   * rather than by size.
   */
  maxAreaRatio: number;
  /** A core must be at least this share of the image to seed a room. */
  minCoreRatio: number;
  /** Douglas-Peucker tolerance as a share of the region's bbox diagonal. */
  simplifyRatio: number;
  /**
   * Override the core threshold, in px of clearance from the nearest wall.
   * Left null the parser sweeps for the value that separates the most rooms.
   */
  coreThresholdPx: number | null;
  /**
   * Straighten a drawing photographed slightly askew. The whole pipeline assumes rectilinear
   * walls, so even 2° of rotation turns clean rectangles into staircases.
   */
  deskew: boolean;
  /**
   * Use a local threshold instead of a global one. Auto-detected from how uneven the paper
   * is; set explicitly to force it either way.
   */
  adaptiveThreshold: boolean | 'auto';
  /**
   * Drop ink blobs smaller than this share of the image before looking for rooms — room
   * labels, dimension figures and furniture symbols would otherwise read as walls.
   */
  despeckleRatio: number;
}

export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  minAreaRatio: 0.004,
  maxAreaRatio: 0.92,
  minCoreRatio: 0.0012,
  simplifyRatio: 0.02,
  coreThresholdPx: null,
  deskew: true,
  adaptiveThreshold: 'auto',
  despeckleRatio: 0.00012,
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseFloorPlan(
  image: RasterImage,
  options: Partial<ParseOptions> = {}
): ParseResult {
  const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
  const { width, height } = image;
  const total = width * height;

  let gray = toGrayscale(image);

  // A drawing photographed a couple of degrees off square would otherwise come back as a
  // flight of stairs, so it is squared up before anything measures it.
  const skew = opts.deskew ? estimateSkew(gray, width, height) : 0;
  if (skew !== 0) gray = rotateGrayscale(gray, width, height, -skew);

  // Walls are the dark ink. Plans are overwhelmingly white paper, so if "dark" came out as
  // the majority the image is inverted (a dark-mode or blueprint plan) — flip it.
  const useAdaptive =
    opts.adaptiveThreshold === 'auto'
      ? hasUnevenLighting(gray, width, height)
      : opts.adaptiveThreshold;

  let wall = useAdaptive
    ? adaptiveThreshold(gray, width, height)
    : threshold8(gray, otsuThreshold(gray));

  let wallCount = countSet(wall);
  if (wallCount > total * 0.5) {
    wall = invert(wall);
    wallCount = total - wallCount;
  }

  // Text and symbols are ink too. They are small and isolated, walls are neither.
  const despeckled = despeckle(wall, width, height, Math.max(12, total * opts.despeckleRatio));
  wall = despeckled.mask;
  wallCount = despeckled.remaining;

  const wallRatio = wallCount / total;
  const fail = (warning: string): ParseResult => ({
    regions: [],
    imageWidth: width,
    imageHeight: height,
    wallRatio,
    warning,
  });

  if (wallRatio < 0.004) return fail('no-walls-detected');
  if (wallRatio > 0.62) return fail('image-too-noisy');

  const strokePx = estimateStrokeWidth(wall, width, height);
  const distance = distanceTransform(wall, width, height);

  const segmentation = segmentRooms(wall, distance, width, height, strokePx, opts);
  if (segmentation.rooms.length === 0) return fail('no-rooms-detected');

  const minArea = total * opts.minAreaRatio;
  const maxArea = total * opts.maxAreaRatio;

  // Anything touching the image border is the world outside the flat. On a drawing cropped
  // hard to the outer wall that test throws away real rooms, so if it leaves nothing we run
  // again without it.
  let candidates = segmentation.rooms.filter((r) => !r.touchesBorder);
  if (candidates.length === 0) {
    candidates = segmentation.rooms.filter((r) => r.area <= total * 0.94);
  }

  const regions: ParsedRegion[] = [];

  for (const room of candidates) {
    if (room.area < minArea || room.area > maxArea) continue;

    const mask = maskForLabel(segmentation.labels, room.label, total);
    const outline = traceContour(mask, width, height);
    if (outline.length < 4) continue;

    const diag = Math.hypot(room.bbox.w, room.bbox.h);
    const simplified = simplifyPath(outline, diag * opts.simplifyRatio);
    const traced = rectilinearize(simplified, Math.max(2, strokePx * 1.5));
    const rect = smoothRectilinear(traced, Math.max(4, strokePx * 2.5));

    const bboxArea = room.bbox.w * room.bbox.h;
    const rectangularity = bboxArea > 0 ? room.area / bboxArea : 0;

    // A traced outline that ended up with a silly number of corners, or that lost/gained a
    // lot of area against the pixel count, is worse than the honest bounding box.
    const polyArea = Math.abs(polygonArea(rect));
    const areaError = Math.abs(polyArea - room.area) / room.area;
    const usable = rect.length >= 4 && rect.length <= 12 && areaError < 0.22;


    regions.push({
      polygonPx: usable ? rect : bboxPolygon(room.bbox),
      areaPx: room.area,
      bboxPx: room.bbox,
      rectangularity,
    });
  }

  // Biggest first — the layout code and the UI both want the main living space up top.
  regions.sort((a, b) => b.areaPx - a.areaPx);

  return {
    regions,
    imageWidth: width,
    imageHeight: height,
    wallRatio,
    warning: regions.length === 0 ? 'no-rooms-detected' : undefined,
  };
}

// ---------------------------------------------------------------------------
// Pixel stages
// ---------------------------------------------------------------------------

function toGrayscale(img: RasterImage): Uint8Array {
  const { data, width, height } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    if (data[p + 3] < 128) {
      out[i] = 255; // treat transparent as paper
      continue;
    }
    out[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
  }
  return out;
}

/**
 * Estimates how far the drawing is rotated off square, in radians.
 *
 * Architectural plans are overwhelmingly made of horizontal and vertical lines, so the
 * gradient directions of their edges cluster hard around two perpendicular angles. Taking the
 * orientation histogram modulo 90° collapses those two into one peak, and the offset of that
 * peak from zero is the skew.
 *
 * Returns 0 when the drawing is already square, or when no clear dominant direction exists —
 * a hand-drawn plan with no straight edges is better left alone than rotated on a guess.
 */
export function estimateSkew(gray: Uint8Array, width: number, height: number): number {
  const BINS = 180; // half-degree resolution over 90°
  const histogram = new Float64Array(BINS);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 400));
  let strongEdges = 0;

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = y * width + x;
      // Sobel, at whatever stride we are sampling.
      const gx =
        gray[i - width + step] + 2 * gray[i + step] + gray[i + width + step] -
        gray[i - width - step] - 2 * gray[i - step] - gray[i + width - step];
      const gy =
        gray[i + width - step] + 2 * gray[i + width] + gray[i + width + step] -
        gray[i - width - step] - 2 * gray[i - width] - gray[i - width + step];

      const magnitude = Math.abs(gx) + Math.abs(gy);
      if (magnitude < 180) continue;

      strongEdges++;
      // Edge direction is perpendicular to the gradient; mod 90° folds the two wall
      // directions onto each other.
      let angle = (Math.atan2(gy, gx) * 180) / Math.PI + 90;
      angle = ((angle % 90) + 90) % 90;
      histogram[Math.min(BINS - 1, Math.floor(angle * 2))] += magnitude;
    }
  }

  if (strongEdges < 200) return 0;

  // Smooth so a peak straddling two bins still wins.
  let bestBin = 0;
  let bestScore = 0;
  let totalScore = 0;
  for (let b = 0; b < BINS; b++) {
    const score =
      histogram[(b - 1 + BINS) % BINS] + histogram[b] * 2 + histogram[(b + 1) % BINS];
    totalScore += histogram[b];
    if (score > bestScore) {
      bestScore = score;
      bestBin = b;
    }
  }

  // No dominant direction — leave it alone.
  if (totalScore === 0 || bestScore / totalScore < 0.08) return 0;

  let degrees = bestBin / 2;
  if (degrees > 45) degrees -= 90; // rotate the short way

  // Below half a degree there is nothing to gain; beyond ~20° this is not skew, it is a plan
  // drawn on the diagonal, and rotating it would make things worse.
  if (Math.abs(degrees) < 0.5 || Math.abs(degrees) > 20) return 0;
  return (degrees * Math.PI) / 180;
}

/** Rotates a grayscale buffer about its centre, filling what falls outside with paper. */
export function rotateGrayscale(
  gray: Uint8Array,
  width: number,
  height: number,
  angle: number
): Uint8Array {
  const out = new Uint8Array(gray.length).fill(255);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      // Sample backwards from the destination, which avoids leaving holes.
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      out[y * width + x] = gray[sy * width + sx];
    }
  }
  return out;
}

/**
 * Is the paper lit unevenly?
 *
 * A scan or an export has a flat background; a photograph has a gradient across it, and a
 * single global threshold on one of those either loses the walls in the shadow or floods the
 * bright side. Comparing the brightest and darkest neighbourhoods tells the two apart.
 */
export function hasUnevenLighting(
  gray: Uint8Array,
  width: number,
  height: number
): boolean {
  const GRID = 8;
  const means: number[] = [];

  for (let by = 0; by < GRID; by++) {
    for (let bx = 0; bx < GRID; bx++) {
      const x0 = Math.floor((bx * width) / GRID);
      const x1 = Math.floor(((bx + 1) * width) / GRID);
      const y0 = Math.floor((by * height) / GRID);
      const y1 = Math.floor(((by + 1) * height) / GRID);

      let sum = 0;
      let count = 0;
      // The paper is the bright majority; sampling the upper range ignores the ink.
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const value = gray[y * width + x];
          if (value > 90) {
            sum += value;
            count++;
          }
        }
      }
      if (count > 20) means.push(sum / count);
    }
  }

  if (means.length < GRID) return false;
  means.sort((a, b) => a - b);
  // Trimmed range, so one dark corner does not decide it.
  const low = means[Math.floor(means.length * 0.1)];
  const high = means[Math.floor(means.length * 0.9)];
  return high - low > 34;
}

/**
 * Local (Bradley-Roth) thresholding.
 *
 * A pixel is ink if it is meaningfully darker than the average of the neighbourhood around
 * it, which makes the decision independent of how brightly that part of the page is lit. The
 * integral image keeps it O(n) whatever the window size.
 */
export function adaptiveThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  windowFraction = 0.08,
  tolerancePct = 12
): Uint8Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const radius = Math.max(4, Math.round(Math.min(width, height) * windowFraction) >> 1);
  const out = new Uint8Array(gray.length);
  const factor = (100 - tolerancePct) / 100;

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);

      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integral[y0 * (width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];

      out[y * width + x] = gray[y * width + x] * area < sum * factor ? 1 : 0;
    }
  }
  return out;
}

/**
 * Removes ink blobs too small to be part of a wall.
 *
 * Real plans are covered in things that are not walls: room names, dimension figures, north
 * arrows, furniture symbols. All of them are small and disconnected; walls are large and
 * connected. Dropping everything under `minArea` clears the drawing without touching the
 * structure.
 */
export function despeckle(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number
): { mask: Uint8Array; remaining: number } {
  const { labels, components } = labelComponents(mask, width, height);
  const keep = new Set(components.filter((c) => c.area >= minArea).map((c) => c.label));

  const out = new Uint8Array(mask.length);
  let remaining = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && keep.has(labels[i])) {
      out[i] = 1;
      remaining++;
    }
  }
  return { mask: out, remaining };
}

/** Otsu's method — picks the threshold that best separates ink from paper. */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVariance = -1;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

function threshold8(gray: Uint8Array, t: number): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] <= t ? 1 : 0;
  return out;
}

function invert(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

function countSet(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}

/**
 * Median horizontal run length of wall pixels ≈ the drawn wall thickness.
 * Long runs are skipped: they are wall *lines* seen lengthwise, not cross-sections.
 */
export function estimateStrokeWidth(
  wall: Uint8Array,
  width: number,
  height: number
): number {
  const runs: number[] = [];
  const maxRun = Math.max(4, Math.round(width * 0.05));
  const step = Math.max(1, Math.floor(height / 240));

  for (let y = 0; y < height; y += step) {
    let run = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (wall[row + x]) {
        run++;
      } else if (run > 0) {
        if (run <= maxRun) runs.push(run);
        run = 0;
      }
    }
    if (run > 0 && run <= maxRun) runs.push(run);
  }

  if (runs.length === 0) return 3;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)] || 3;
}

/**
 * Chamfer distance transform: for every open pixel, the distance in px to the nearest wall.
 *
 * Two sequential passes with 3-4 weights approximate Euclidean distance to within ~2%, which
 * is far tighter than anything downstream needs, and runs in O(n) with no queue.
 */
export function distanceTransform(
  wall: Uint8Array,
  width: number,
  height: number
): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(wall.length);
  for (let i = 0; i < wall.length; i++) d[i] = wall[i] ? 0 : INF;

  const D1 = 3;
  const D2 = 4;

  // forward pass: up-left neighbourhood
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (d[i] === 0) continue;
      let best = d[i];
      if (y > 0) {
        if (x > 0) best = Math.min(best, d[i - width - 1] + D2);
        best = Math.min(best, d[i - width] + D1);
        if (x < width - 1) best = Math.min(best, d[i - width + 1] + D2);
      }
      if (x > 0) best = Math.min(best, d[i - 1] + D1);
      d[i] = best;
    }
  }

  // backward pass: down-right neighbourhood
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (d[i] === 0) continue;
      let best = d[i];
      if (y < height - 1) {
        if (x < width - 1) best = Math.min(best, d[i + width + 1] + D2);
        best = Math.min(best, d[i + width] + D1);
        if (x > 0) best = Math.min(best, d[i + width - 1] + D2);
      }
      if (x < width - 1) best = Math.min(best, d[i + 1] + D1);
      d[i] = best;
    }
  }

  for (let i = 0; i < d.length; i++) d[i] = d[i] === INF ? 0 : d[i] / D1;
  return d;
}

// ---------------------------------------------------------------------------
// Room segmentation
// ---------------------------------------------------------------------------

interface RoomLabel {
  label: number;
  area: number;
  bbox: { x: number; y: number; w: number; h: number };
  seed: { x: number; y: number };
  touchesBorder: boolean;
}

interface Segmentation {
  labels: Int32Array;
  rooms: RoomLabel[];
  coreThresholdPx: number;
}

/**
 * Splits the open space into rooms by clearance rather than by connectivity.
 *
 * Every open pixel knows how far it is from the nearest wall. Keep only the pixels with more
 * than `t` clearance and the plan falls apart at its narrow points — doorways — leaving one
 * blob per room.
 *
 * A single `t` cannot work, though: a generous living room needs a high threshold before its
 * doorways break, while a 3 m² toilet has already vanished by then. So the threshold is swept
 * from wide to narrow and each room is claimed at whatever clearance it happens to appear at:
 *
 *   - a core with no claimed pixels inside it is a room nobody has seen yet → claim it
 *   - a core containing exactly one claim is that same room growing → extend the claim
 *   - a core containing two or more claims is two rooms that have just merged through a
 *     doorway → leave it alone, so neither basin swallows the other
 *
 * That is a watershed flooded from the distance transform's maxima, and it finds a broom
 * cupboard and an open-plan living room in the same pass.
 */
function segmentRooms(
  wall: Uint8Array,
  distance: Float32Array,
  width: number,
  height: number,
  strokePx: number,
  opts: ParseOptions
): Segmentation {
  const total = width * height;
  const minCoreArea = Math.max(24, total * opts.minCoreRatio);

  let maxDistance = 0;
  for (let i = 0; i < distance.length; i++) {
    if (distance[i] > maxDistance) maxDistance = distance[i];
  }

  const thresholds =
    opts.coreThresholdPx != null
      ? [opts.coreThresholdPx]
      : buildThresholdSweep(maxDistance, strokePx);

  const seeds = new Int32Array(total); // 0 = unclaimed
  let nextLabel = 1;
  let lastThreshold = thresholds[thresholds.length - 1] ?? 0;

  const core = new Uint8Array(total);
  const claimsPerComponent = new Map<number, Set<number>>();
  const decision = new Map<number, number>();

  for (const t of thresholds) {
    for (let i = 0; i < total; i++) core[i] = distance[i] >= t ? 1 : 0;

    const { labels, components } = labelComponents(core, width, height);

    // Which existing claims does each core component contain?
    claimsPerComponent.clear();
    for (let i = 0; i < total; i++) {
      const comp = labels[i];
      if (comp === 0) continue;
      const seed = seeds[i];
      if (seed === 0) continue;
      let set = claimsPerComponent.get(comp);
      if (!set) {
        set = new Set();
        claimsPerComponent.set(comp, set);
      }
      set.add(seed);
    }

    // Decide each component's fate first, then write the whole image in one pass.
    // Doing the write per component instead would be O(pixels × components), which at low
    // thresholds — where the plan fragments into hundreds of specks — is quadratic enough to
    // hang the browser on a 1000×700 plan.
    decision.clear();
    let anyWrite = false;

    for (const component of components) {
      const claims = claimsPerComponent.get(component.label);

      if (!claims || claims.size === 0) {
        if (component.area < minCoreArea) continue;
        decision.set(component.label, nextLabel++);
        anyWrite = true;
      } else if (claims.size === 1) {
        decision.set(component.label, claims.values().next().value as number);
        anyWrite = true;
      }
      // claims.size >= 2 → two rooms have merged through a doorway; leave the basins alone.
    }

    if (anyWrite) {
      for (let i = 0; i < total; i++) {
        const comp = labels[i];
        if (comp === 0) continue;
        const seed = decision.get(comp);
        if (seed !== undefined) seeds[i] = seed;
      }
    }

    lastThreshold = t;
  }

  if (nextLabel === 1) {
    return { labels: new Int32Array(total), rooms: [], coreThresholdPx: 0 };
  }

  const grown = growSeeds(wall, seeds, width, height);
  return { labels: grown.labels, rooms: grown.rooms, coreThresholdPx: lastThreshold };
}

/**
 * Clearance values to try, widest first.
 *
 * The upper bound is tied to the largest clearance in the drawing (so it scales with image
 * size) and the lower bound to the wall stroke — below that we would be separating on noise.
 */
function buildThresholdSweep(maxDistance: number, strokePx: number): number[] {
  const hi = Math.max(maxDistance * 0.9, strokePx * 3);
  const lo = Math.max(strokePx * 1.6, 3.5);
  if (hi <= lo) return [lo];

  const steps = 22;
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    out.push(hi - ((hi - lo) * i) / (steps - 1));
  }
  return out;
}

/**
 * 4-connected labelling of a binary mask.
 *
 * The label and queue buffers are reused across calls: the threshold sweep runs this ~20
 * times on a multi-megapixel mask, and reallocating each time is pure garbage pressure.
 */
let labelBuffer: Int32Array | null = null;
let queueBuffer: Int32Array | null = null;

function labelComponents(
  mask: Uint8Array,
  width: number,
  height: number
): { labels: Int32Array; components: RoomLabel[] } {
  if (!labelBuffer || labelBuffer.length < mask.length) {
    labelBuffer = new Int32Array(mask.length);
    queueBuffer = new Int32Array(mask.length);
  }
  const labels = labelBuffer;
  labels.fill(0, 0, mask.length);
  const queue = queueBuffer!;
  const components: RoomLabel[] = [];
  let next = 1;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== 0) continue;

    const label = next++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let touchesBorder = false;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = (idx / width) | 0;

      area++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;

      if (x > 0 && mask[idx - 1] && labels[idx - 1] === 0) {
        labels[idx - 1] = label;
        queue[tail++] = idx - 1;
      }
      if (x < width - 1 && mask[idx + 1] && labels[idx + 1] === 0) {
        labels[idx + 1] = label;
        queue[tail++] = idx + 1;
      }
      if (y > 0 && mask[idx - width] && labels[idx - width] === 0) {
        labels[idx - width] = label;
        queue[tail++] = idx - width;
      }
      if (y < height - 1 && mask[idx + width] && labels[idx + width] === 0) {
        labels[idx + width] = label;
        queue[tail++] = idx + width;
      }
    }

    components.push({
      label,
      area,
      bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      seed: { x: start % width, y: (start / width) | 0 },
      touchesBorder,
    });
  }

  return { labels, components };
}

/**
 * Multi-source BFS: every open pixel is claimed by whichever seed reaches it first, so
 * doorway pixels split between the two rooms they join and each room regains its full outline.
 */
function growSeeds(
  wall: Uint8Array,
  seeds: Int32Array,
  width: number,
  height: number
): { labels: Int32Array; rooms: RoomLabel[] } {
  const total = width * height;
  const labels = new Int32Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < total; i++) {
    if (seeds[i] !== 0 && !wall[i]) {
      labels[i] = seeds[i];
      queue[tail++] = i;
    }
  }

  while (head < tail) {
    const idx = queue[head++];
    const label = labels[idx];
    const x = idx % width;
    const y = (idx / width) | 0;

    if (x > 0) claim(idx - 1, label);
    if (x < width - 1) claim(idx + 1, label);
    if (y > 0) claim(idx - width, label);
    if (y < height - 1) claim(idx + width, label);
  }

  function claim(n: number, label: number) {
    if (labels[n] === 0 && !wall[n]) {
      labels[n] = label;
      queue[tail++] = n;
    }
  }

  // Re-measure: the grown regions are much bigger than the seeds they came from.
  const byLabel = new Map<number, RoomLabel>();
  for (let i = 0; i < total; i++) {
    const label = labels[i];
    if (label === 0) continue;
    const x = i % width;
    const y = (i / width) | 0;

    let room = byLabel.get(label);
    if (!room) {
      room = {
        label,
        area: 0,
        bbox: { x, y, w: 1, h: 1 },
        seed: { x, y },
        touchesBorder: false,
      };
      byLabel.set(label, room);
    }

    room.area++;
    const box = room.bbox;
    const maxX = Math.max(box.x + box.w - 1, x);
    const maxY = Math.max(box.y + box.h - 1, y);
    box.x = Math.min(box.x, x);
    box.y = Math.min(box.y, y);
    box.w = maxX - box.x + 1;
    box.h = maxY - box.y + 1;

    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) room.touchesBorder = true;
  }

  return { labels, rooms: [...byLabel.values()] };
}

function maskForLabel(labels: Int32Array, label: number, total: number): Uint8Array {
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) mask[i] = labels[i] === label ? 1 : 0;
  return mask;
}

// ---------------------------------------------------------------------------
// Contour → polygon
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number };

/**
 * Marching-squares crack following: walks the boundary *between* pixels rather than along
 * them, so the result is axis-aligned by construction — which is exactly the shape a room
 * outline wants to be.
 *
 * The walk keeps the filled region on its right at every step, so it closes on itself and
 * never wanders into the interior. Coordinates are grid corners, so a region spanning pixels
 * 0..9 traces out 0..10 and measures a true 10 px wide.
 */
function traceContour(mask: Uint8Array, width: number, height: number): Pt[] {
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height ? mask[y * width + x] : 0;

  // Topmost-then-leftmost filled pixel: its top-left corner is guaranteed to be on the
  // outer boundary, with only the pixel to its south-east filled.
  let startX = -1;
  let startY = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX < 0) return [];

  const path: Pt[] = [];
  let x = startX;
  let y = startY;
  let dx = 1;
  let dy = 0;
  const maxSteps = width * height * 4;

  for (let step = 0; step < maxSteps; step++) {
    path.push({ x, y });

    const nw = at(x - 1, y - 1);
    const ne = at(x, y - 1);
    const sw = at(x - 1, y);
    const se = at(x, y);

    // Keep the filled side on the right of the direction of travel.
    const canEast = se && !ne;
    const canWest = nw && !sw;
    const canNorth = ne && !nw;
    const canSouth = sw && !se;

    let nx = 0;
    let ny = 0;

    if (canEast && canWest) {
      // Saddle (only NW and SE filled). Carry on rather than doubling back.
      if (dx === -1) {
        nx = -1;
      } else {
        nx = 1;
      }
    } else if (canNorth && canSouth) {
      // The other saddle (only NE and SW filled).
      if (dy === 1) {
        ny = 1;
      } else {
        ny = -1;
      }
    } else if (canEast) {
      nx = 1;
    } else if (canWest) {
      nx = -1;
    } else if (canNorth) {
      ny = -1;
    } else if (canSouth) {
      ny = 1;
    } else {
      break; // isolated corner — nothing to follow
    }

    dx = nx;
    dy = ny;
    x += dx;
    y += dy;

    if (x === startX && y === startY) break;
  }

  return path;
}

/** Douglas-Peucker on a closed path. */
export function simplifyPath(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 4) return points.slice();

  const flags = new Array<boolean>(points.length).fill(false);
  flags[0] = true;
  flags[points.length - 1] = true;

  // Explicit stack — a traced contour can be tens of thousands of points deep.
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (hi <= lo + 1) continue;

    const a = points[lo];
    const b = points[hi];
    let bestIdx = -1;
    let bestDist = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = pointSegmentDistance(points[i], a, b);
      if (d > bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestDist > epsilon && bestIdx > 0) {
      flags[bestIdx] = true;
      stack.push([lo, bestIdx], [bestIdx, hi]);
    }
  }

  return points.filter((_, i) => flags[i]);
}

function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Force a polygon onto the axes.
 *
 * Rooms are drawn rectilinear, so a traced outline that wobbles by a few pixels is noise.
 * Vertex x-coordinates are clustered into shared vertical grid lines (same for y), then the
 * path is rewalked inserting a corner wherever both coordinates changed.
 */
export function rectilinearize(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 4) return points.slice();

  const xs = cluster(points.map((p) => p.x), tolerance);
  const ys = cluster(points.map((p) => p.y), tolerance);

  const snapped = points.map((p) => ({ x: snap(p.x, xs), y: snap(p.y, ys) }));

  const out: Pt[] = [];
  for (let i = 0; i < snapped.length; i++) {
    const a = snapped[i];
    const b = snapped[(i + 1) % snapped.length];
    pushUnique(out, a);
    if (a.x !== b.x && a.y !== b.y) {
      // Diagonal step — insert the corner that follows the longer run first.
      const corner =
        Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
          ? { x: b.x, y: a.y }
          : { x: a.x, y: b.y };
      pushUnique(out, corner);
    }
  }

  // The path is closed, so the last point may duplicate the first.
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first.x === last.x && first.y === last.y) out.pop();
  }

  return dropCollinear(out);
}

/**
 * Flattens the shallow jogs a watershed boundary leaves behind.
 *
 * Where two rooms meet at a doorway the split line runs down the middle of the wall, so each
 * room comes back with a few-pixel step in an otherwise straight run. Architecturally those
 * steps do not exist — the wall is straight — so any edge shorter than a wall thickness is
 * collapsed and its neighbours brought into line.
 */
export function smoothRectilinear(points: Pt[], minEdgePx: number): Pt[] {
  let poly = points.slice();

  for (let pass = 0; pass < 24 && poly.length > 4; pass++) {
    const n = poly.length;
    let shortest = -1;
    let shortestLen = minEdgePx;

    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (len > 0 && len < shortestLen) {
        shortestLen = len;
        shortest = i;
      }
    }
    if (shortest < 0) break;

    const iB = shortest;
    const iC = (shortest + 1) % n;
    const iA = (shortest - 1 + n) % n;
    const iD = (shortest + 2) % n;
    const B = poly[iB];
    const C = poly[iC];

    if (B.x === C.x) {
      // Vertical jog in a horizontal run — bring the whole run onto one line.
      const y = Math.round((B.y + C.y) / 2);
      poly[iA] = { ...poly[iA], y };
      poly[iB] = { ...B, y };
      poly[iC] = { ...C, y };
      poly[iD] = { ...poly[iD], y };
    } else {
      const x = Math.round((B.x + C.x) / 2);
      poly[iA] = { ...poly[iA], x };
      poly[iB] = { ...B, x };
      poly[iC] = { ...C, x };
      poly[iD] = { ...poly[iD], x };
    }

    poly = dropCollinear(dedupe(poly));
  }

  return poly;
}

function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first.x === last.x && first.y === last.y) out.pop();
  }
  return out;
}

function pushUnique(out: Pt[], p: Pt) {
  const last = out[out.length - 1];
  if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
}

function cluster(values: number[], tolerance: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const centres: number[] = [];
  let group: number[] = [];

  for (const v of sorted) {
    if (group.length === 0 || v - group[group.length - 1] <= tolerance) {
      group.push(v);
    } else {
      centres.push(median(group));
      group = [v];
    }
  }
  if (group.length) centres.push(median(group));
  return centres;
}

function median(list: number[]): number {
  return Math.round(list[Math.floor(list.length / 2)]);
}

function snap(value: number, centres: number[]): number {
  let best = value;
  let bestDist = Infinity;
  for (const c of centres) {
    const d = Math.abs(c - value);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function dropCollinear(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    const straight =
      (prev.x === cur.x && cur.x === next.x) || (prev.y === cur.y && cur.y === next.y);
    if (!straight) out.push(cur);
  }
  return out.length >= 4 ? out : points;
}

// ---------------------------------------------------------------------------
// Geometry helpers (px space)
// ---------------------------------------------------------------------------

export function polygonArea(points: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function bboxPolygon(b: { x: number; y: number; w: number; h: number }): Pt[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}
