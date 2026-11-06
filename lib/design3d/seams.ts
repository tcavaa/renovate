/**
 * Hides the seams of a floor or wall texture that does not tile (the rulebook, G-25: "the joins show
 * as stripes — make them invisible in every material"). Found in the image itself when it arrives,
 * so no product needs fixing by hand: a pattern that does not meet itself — its left edge unlike its
 * right (or its top unlike its bottom), so every repeat shows a break — is repeated mirrored on that
 * axis, which always meets. (A thin line all round the edge is reported as `border` but left alone: a
 * tile's grout looks just like one.)
 *
 * `seamFaults` is pure (pixels in, verdict out); `fitSeams` reads a loaded texture's image on a
 * small canvas and applies the fix. Browser only for the latter; a no-op elsewhere.
 */

import * as THREE from 'three';

export interface SeamFaults {
  /** The left and right edges do not meet: repeat mirrored across. */
  mirrorS: boolean;
  /** The top and bottom do not meet: repeat mirrored up. */
  mirrorT: boolean;
  /** Pixels to cut off each side: a border line round the image. */
  border: number;
}

/** Mean difference (0–255) above which two edges are taken not to meet. */
const EDGE_MISMATCH = 22;
/** How much brighter or darker than the pixels inside it an edge line must be to count as a border. */
const BORDER_STEP = 28;

/**
 * What is wrong with an image's edges, from its RGBA pixels at `size` × `size` (a downscaled copy).
 * Compares the outermost column with the opposite one, and the outermost ring with the ring inside it.
 */
export function seamFaults(rgba: Uint8ClampedArray | number[], size: number): SeamFaults {
  const lum = (x: number, y: number) => {
    const i = (y * size + x) * 4;
    return 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  };
  const column = (x: number) => Array.from({ length: size }, (_, y) => lum(x, y));
  const row = (y: number) => Array.from({ length: size }, (_, x) => lum(x, y));
  const diff = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  // A border: all four outer lines step away from the lines just inside them, the same way.
  const steps = [mean(column(0)) - mean(column(2)), mean(column(size - 1)) - mean(column(size - 3)), mean(row(0)) - mean(row(2)), mean(row(size - 1)) - mean(row(size - 3))];
  const bordered = steps.every((s) => s > BORDER_STEP) || steps.every((s) => s < -BORDER_STEP);
  const inset = bordered ? 2 : 0;
  // The jump across the join (last line to first) against the jumps between neighbouring lines
  // inside the image: only a join that jumps more than the image does anywhere is a break — a
  // checkerboard whose squares end at the image's edge jumps there as it does at every square, and
  // tiles as it is (mirrored, its squares would double).
  const breaks = (line: (i: number) => number[]) => {
    const jumps = Array.from({ length: size - 1 - 2 * inset }, (_, i) => diff(line(inset + i), line(inset + i + 1)));
    const join = diff(line(size - 1 - inset), line(inset));
    return join > EDGE_MISMATCH && join > 1.25 * Math.max(0, ...jumps) + 4;
  };
  const mirrorS = breaks(column);
  const mirrorT = breaks(row);
  return { mirrorS, mirrorT, border: bordered ? 1 : 0 };
}

/** The size the image is read at to judge its edges. */
const PROBE = 64;

/** Fixes a loaded colour texture's seams in place (see the module's note). Silent when it cannot read the image. */
export function fitSeams(texture: THREE.Texture): void {
  if (typeof document === 'undefined') return;
  const image = texture.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!image || !image.width || !image.height) return;
  try {
    const probe = document.createElement('canvas');
    probe.width = probe.height = PROBE;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, PROBE, PROBE);
    const faults = seamFaults(ctx.getImageData(0, 0, PROBE, PROBE).data, PROBE);
    if (faults.mirrorS) texture.wrapS = THREE.MirroredRepeatWrapping;
    if (faults.mirrorT) texture.wrapT = THREE.MirroredRepeatWrapping;
    if (faults.mirrorS || faults.mirrorT) texture.needsUpdate = true;
  } catch {
    // A cross-origin image without CORS cannot be read: left as it is.
  }
}
