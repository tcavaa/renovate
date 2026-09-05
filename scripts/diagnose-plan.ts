/* eslint-disable no-console */
/**
 * Runs a real floor-plan PNG through the parser and reports what each stage produced.
 *
 *   pnpm plan:diagnose public/uploads/plans/<file>.png
 *
 * `pnpm test:parser` covers synthetic plans, which are clean by construction. This is for the
 * messy ones — a plan with furniture symbols, dimension arrows and labels drawn on it — where
 * the interesting question is not "did it pass" but "which stage lost the walls".
 */

import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import {
  adaptiveThreshold,
  despeckle,
  distanceTransform,
  estimateSkew,
  estimateStrokeWidth,
  hasUnevenLighting,
  otsuThreshold,
  parseFloorPlan,
} from '../lib/design/planParser';
import { buildPlanFromRegions, metresPerPixelFromArea } from '../lib/design/planGeometry';

const file = process.argv[2];
if (!file) {
  console.error('usage: pnpm plan:diagnose <plan.png>');
  process.exit(1);
}

const png = PNG.sync.read(readFileSync(file));
const image = {
  data: new Uint8ClampedArray(png.data),
  width: png.width,
  height: png.height,
};

console.log(`\n${file}  ${png.width} × ${png.height}\n`);

// --- stage by stage -------------------------------------------------------
const gray = new Uint8Array(png.width * png.height);
for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
  gray[i] =
    png.data[p + 3] < 128
      ? 255
      : (png.data[p] * 299 + png.data[p + 1] * 587 + png.data[p + 2] * 114) / 1000;
}

const skew = estimateSkew(gray, png.width, png.height);
const uneven = hasUnevenLighting(gray, png.width, png.height);
const otsu = otsuThreshold(gray);

const mask = uneven
  ? adaptiveThreshold(gray, png.width, png.height)
  : Uint8Array.from(gray, (v) => (v <= otsu ? 1 : 0));

const inkBefore = mask.reduce((sum, v) => sum + v, 0);
const total = png.width * png.height;
const minBlob = Math.max(12, total * 0.00012);
const cleaned = despeckle(mask, png.width, png.height, minBlob);
const stroke = estimateStrokeWidth(cleaned.mask, png.width, png.height);

const distance = distanceTransform(cleaned.mask, png.width, png.height);
let maxClearance = 0;
for (const d of distance) if (d > maxClearance) maxClearance = d;

console.log('preprocessing');
console.log(`  skew            ${((skew * 180) / Math.PI).toFixed(2)}°`);
console.log(`  uneven lighting ${uneven}   (otsu threshold ${otsu})`);
console.log(`  ink             ${(inkBefore / total * 100).toFixed(2)}% → ${(cleaned.remaining / total * 100).toFixed(2)}% after despeckle`);
console.log(`  despeckle       dropped ${(inkBefore - cleaned.remaining).toLocaleString()} px in blobs under ${Math.round(minBlob)} px`);
console.log(`  wall stroke     ${stroke} px`);
console.log(`  max clearance   ${maxClearance.toFixed(0)} px  (widest open space)`);

// --- what the parser makes of it -----------------------------------------
const started = Date.now();
const parse = parseFloorPlan(image);
const elapsed = Date.now() - started;

console.log(`\nparse  (${elapsed} ms)`);
console.log(`  warning ${parse.warning ?? '—'}`);
console.log(`  regions ${parse.regions.length}`);
for (const region of parse.regions) {
  const share = ((region.areaPx / total) * 100).toFixed(1);
  console.log(
    `    ${String(region.areaPx).padStart(8)} px (${share.padStart(5)}%)  ` +
      `rect=${region.rectangularity.toFixed(2)}  verts=${String(region.polygonPx.length).padStart(2)}  ` +
      `bbox=${region.bboxPx.w}×${region.bboxPx.h}`
  );
}

if (parse.regions.length > 0) {
  const plan = buildPlanFromRegions(parse, {
    metresPerPixel: metresPerPixelFromArea(parse.regions, 100),
  });
  console.log('\nrooms as the app would see them (scaled to a nominal 100 m²)');
  for (const room of plan.rooms) {
    console.log(
      `    ${room.id}  ${room.type.padEnd(12)} ${room.areaM2.toFixed(1).padStart(6)} m²  ` +
        `verts=${room.polygon.length}  openings=${room.openings.length}` +
        (room.lowConfidence ? '  ⚠︎' : '')
    );
  }
}
console.log();
