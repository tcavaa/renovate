/* eslint-disable no-console */
/**
 * Checks the dimension reader and the plan solver.
 *
 *   pnpm test:solver
 *
 * The fixture is the real 1-bedroom plan in `public/uploads/plans` — the one whose printed
 * dimensions read 18' 3", 6' 2", 5' 8", 8' 4", 9' 3", 12' 3", 17' 9", 6' 8" and 15' 10". The
 * room boxes below are deliberately *sloppy*, roughly what a vision model returns when asked
 * where each room sits: a few percent out, edges that do not quite line up. The solver's job
 * is to turn that into walls whose lengths match the drawing exactly.
 *
 * No API key needed — this exercises the half of the pipeline that has to be right before the
 * model call is worth making.
 */

import { detectUnitSystem, formatLength, parseLength } from '../lib/design/measure';
import { solvePlan, type RoughRoom } from '../lib/design/planSolver';

let failures = 0;

function check(label: string, actual: number, expected: number, tolerance: number) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) failures++;
  console.log(
    `  ${ok ? '✓' : '✗'} ${label.padEnd(34)} ${actual.toFixed(3)}  (expected ${expected.toFixed(3)} ±${tolerance})`
  );
}

// ---------------------------------------------------------------------------
console.log('\n▸ dimension labels');

const labels: Array<[string, number]> = [
  [`18' 3"`, 5.5626],
  [`6' 2"`, 1.8796],
  [`5' 8"`, 1.7272],
  [`8' 4"`, 2.54],
  [`9' 3"`, 2.8194],
  [`12' 3"`, 3.7338],
  [`17' 9"`, 5.4102],
  [`6' 8"`, 2.032],
  [`15' 10"`, 4.826],
  [`18'-3"`, 5.5626],
  [`18ft 3in`, 5.5626],
  [`3.5 m`, 3.5],
  [`3,5 м`, 3.5],
  [`350 cm`, 3.5],
  [`3500mm`, 3.5],
];

for (const [text, metres] of labels) {
  const parsed = parseLength(text);
  if (!parsed) {
    failures++;
    console.log(`  ✗ ${text.padEnd(34)} did not parse`);
    continue;
  }
  check(text, parsed.metres, metres, 0.002);
}

for (const junk of ['Bedroom', '', 'n/a', '12 x 14']) {
  const parsed = parseLength(junk);
  const ok = parsed === null;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} rejects ${JSON.stringify(junk).padEnd(25)} ${ok ? '' : `got ${parsed?.metres}`}`);
}

const system = detectUnitSystem(labels.slice(0, 9).map(([t]) => t));
console.log(`  ${system === 'imperial' ? '✓' : '✗'} detects imperial drawing        ${system}`);
if (system !== 'imperial') failures++;
console.log(`  · 5.5626 m formats back as      ${formatLength(5.5626, 'imperial')}`);

// ---------------------------------------------------------------------------
console.log('\n▸ solver — sloppy boxes + printed dimensions');

const ft = (feet: number, inches: number) => feet * 0.3048 + inches * 0.0254;

// Approximate boxes as a vision model reports them: normalised 0..1, y down, edges that are
// close to but not exactly aligned with their neighbours.
const rough: RoughRoom[] = [
  {
    id: 'balcony',
    box: { x0: 0.052, y0: 0.338, x1: 0.214, y1: 0.909 },
    widthM: ft(6, 8),
    depthM: ft(15, 10),
  },
  {
    id: 'living',
    box: { x0: 0.218, y0: 0.114, x1: 0.653, y1: 0.912 },
    widthM: ft(18, 3),
    depthM: null,
  },
  {
    id: 'bathroom',
    box: { x0: 0.664, y0: 0.118, x1: 0.802, y1: 0.446 },
    widthM: ft(6, 2),
    depthM: null,
  },
  {
    id: 'hallway',
    box: { x0: 0.803, y0: 0.312, x1: 0.949, y1: 0.576 },
    widthM: ft(5, 8),
    depthM: ft(8, 4),
  },
  {
    id: 'bedroom',
    box: { x0: 0.658, y0: 0.578, x1: 0.951, y1: 0.907 },
    widthM: ft(12, 3),
    depthM: ft(9, 3),
  },
];

const result = solvePlan(rough);

console.log(`  scale ${result.initialScale.x.toFixed(2)} × ${result.initialScale.y.toFixed(2)} m per normalised unit · lowConfidence=${result.lowConfidence}`);
for (const room of result.rooms) {
  const w = room.box.x1 - room.box.x0;
  const d = room.box.y1 - room.box.y0;
  console.log(
    `    ${room.id.padEnd(9)} ${w.toFixed(2)} × ${d.toFixed(2)} m   at (${room.box.x0.toFixed(2)}, ${room.box.y0.toFixed(2)})`
  );
}

// Tolerance is 8 cm, not 1 cm, and that is a property of the drawing rather than the solver.
// This plan's own labels are mutually inconsistent: the bathroom (1.88 m) and hallway (1.73 m)
// sit side by side above a bedroom labelled 3.73 m, but 1.88 + 1.73 = 3.61 — a 13 cm gap,
// because the labels are measured to different wall faces. Least squares spreads that
// disagreement across the three constraints instead of letting the last one win, so each ends
// up a few centimetres out. No arrangement of walls satisfies all three at once.
console.log('\n  printed dimensions honoured:');
for (const r of result.residuals) {
  check(`${r.roomId} ${r.axis}`, r.solved, r.target, 0.08);
}

const worst = result.residuals.reduce(
  (max, r) => Math.max(max, Math.abs(r.solved - r.target)),
  0
);
console.log(`  · largest disagreement ${(worst * 100).toFixed(1)} cm — flagged as lowConfidence=${result.lowConfidence}`);

// The rooms must still tile. On this plan the bedroom runs the full width of the right-hand
// block while the hallway only occupies its outer part, so they share the *outer* wall, not
// the inner one.
console.log('\n  geometry stays consistent:');
const byId = new Map(result.rooms.map((r) => [r.id, r.box]));
const living = byId.get('living')!;
const bedroom = byId.get('bedroom')!;
const hallway = byId.get('hallway')!;
const bathroom = byId.get('bathroom')!;

const gap = bedroom.x0 - living.x1;
const ok1 = gap >= -0.05;
if (!ok1) failures++;
console.log(`  ${ok1 ? '✓' : '✗'} bedroom does not overlap living    gap ${gap.toFixed(3)} m`);

const outer = Math.abs(bedroom.x1 - hallway.x1);
const ok2 = outer < 0.05;
if (!ok2) failures++;
console.log(`  ${ok2 ? '✓' : '✗'} bedroom and hallway share the outer wall  offset ${outer.toFixed(3)} m`);

const stacked = Math.abs(bathroom.x0 - bedroom.x0);
const ok4 = stacked < 0.05;
if (!ok4) failures++;
console.log(`  ${ok4 ? '✓' : '✗'} bathroom sits directly above bedroom      offset ${stacked.toFixed(3)} m`);

const seam = Math.abs(bathroom.x1 - hallway.x0);
const ok5 = seam < 0.05;
if (!ok5) failures++;
console.log(`  ${ok5 ? '✓' : '✗'} bathroom and hallway share a wall         offset ${seam.toFixed(3)} m`);

const totalM2 = result.rooms.reduce((sum, r) => sum + (r.box.x1 - r.box.x0) * (r.box.y1 - r.box.y0), 0);
console.log(`\n  total floor area ${totalM2.toFixed(1)} m² (plan is a ~90 m² one-bedroom incl. balcony)`);
const ok3 = totalM2 > 60 && totalM2 < 130;
if (!ok3) failures++;
console.log(`  ${ok3 ? '✓' : '✗'} total area is plausible`);

console.log(failures === 0 ? '\nall solver cases passed\n' : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
