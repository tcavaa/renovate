/* eslint-disable no-console */
/**
 * Smoke test for the floor-plan parser.
 *
 *   pnpm test:parser
 *
 * Draws synthetic plans in memory (no image files needed) and checks that the parser
 * recovers the right rooms from them. Not a unit-test framework — it prints what it found
 * and exits non-zero on a regression, which is what you want when tuning CV thresholds.
 */

import { parseFloorPlan } from '../lib/design/planParser';
import {
  buildPlanFromRegions,
  metresPerPixelFromArea,
  totalFloorAreaM2,
} from '../lib/design/planGeometry';

type Gap = [number, number];

class PlanCanvas {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
    this.data.fill(255);
  }

  dot(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = 0;
    this.data[i + 1] = 0;
    this.data[i + 2] = 0;
    this.data[i + 3] = 255;
  }

  /** Draws an axis-aligned wall, leaving `gaps` open for doorways. */
  wall(x1: number, y1: number, x2: number, y2: number, thickness = 8, gaps: Gap[] = []) {
    const horizontal = y1 === y2;
    const from = horizontal ? Math.min(x1, x2) : Math.min(y1, y2);
    const to = horizontal ? Math.max(x1, x2) : Math.max(y1, y2);
    for (let p = from; p <= to; p++) {
      if (gaps.some(([a, b]) => p >= a && p <= b)) continue;
      for (let t = 0; t < thickness; t++) {
        if (horizontal) this.dot(p, y1 + t);
        else this.dot(x1 + t, p);
      }
    }
  }

  shell(x: number, y: number, w: number, h: number, thickness = 8, gaps: Gap[] = []) {
    this.wall(x, y, x + w, y, thickness);
    this.wall(x, y + h, x + w, y + h, thickness);
    this.wall(x, y, x, y + h, thickness, gaps);
    this.wall(x + w, y, x + w, y + h, thickness);
  }

  /** Blobs standing in for room labels, dimension figures and furniture symbols. */
  clutter(seed: number, count = 90) {
    let state = seed * 9301 + 49297;
    const rand = () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(rand() * this.width);
      const cy = Math.floor(rand() * this.height);
      const w = 3 + Math.floor(rand() * 6);
      const h = 3 + Math.floor(rand() * 8);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.dot(cx + x, cy + y);
    }
  }

  /** A diagonal brightness ramp, the way a photographed page is lit. */
  lighting(strength = 110) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = (y * this.width + x) * 4;
        const shade = ((x / this.width + y / this.height) / 2) * strength;
        for (let c = 0; c < 3; c++) {
          this.data[i + c] = Math.max(0, Math.min(255, this.data[i + c] - shade));
        }
      }
    }
  }

  /** Rotates the whole drawing, as a photograph taken slightly off square would be. */
  rotate(degrees: number): PlanCanvas {
    const out = new PlanCanvas(this.width, this.height);
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cx = this.width / 2;
    const cy = this.height / 2;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const sx = Math.round(cx + dx * cos + dy * sin);
        const sy = Math.round(cy - dx * sin + dy * cos);
        if (sx < 0 || sy < 0 || sx >= this.width || sy >= this.height) continue;
        const from = (sy * this.width + sx) * 4;
        const to = (y * this.width + x) * 4;
        for (let c = 0; c < 4; c++) out.data[to + c] = this.data[from + c];
      }
    }
    return out;
  }
}

interface Expectation {
  name: string;
  canvas: PlanCanvas;
  totalM2: number;
  minRooms: number;
  maxRooms: number;
  /** At least one room must have this many vertices — i.e. a non-rectangular room survived. */
  expectLShape?: boolean;
  /** At least one room must be this small — i.e. tiny rooms are not being swallowed. */
  expectSmallRoomUnderM2?: number;
}

function fiveRoomFlat(): PlanCanvas {
  const c = new PlanCanvas(800, 600);
  c.shell(40, 40, 700, 500);
  c.wall(380, 40, 380, 540, 8, [[300, 380]]);
  c.wall(40, 300, 380, 300, 8, [[150, 230]]);
  c.wall(380, 240, 740, 240, 8, [[520, 600]]);
  c.wall(560, 240, 560, 540, 8, [[420, 490]]);
  return c;
}

function corridorFlat(): PlanCanvas {
  const c = new PlanCanvas(900, 640);
  c.shell(50, 50, 800, 540, 8, [[300, 390]]); // front door on the left wall
  c.wall(220, 260, 850, 260, 8, [[300, 385], [600, 685]]);
  c.wall(220, 390, 850, 390, 8, [[430, 515], [700, 785]]);
  c.wall(220, 50, 220, 260, 8);
  c.wall(220, 390, 220, 590, 8);
  c.wall(520, 50, 520, 260, 8);
  c.wall(620, 390, 620, 590, 8);
  c.wall(620, 480, 850, 480, 8);
  return c;
}

function lShapedStudio(): PlanCanvas {
  const c = new PlanCanvas(700, 560);
  c.shell(40, 40, 620, 480);
  c.wall(440, 320, 660, 320, 8, [[500, 585]]);
  c.wall(440, 320, 440, 520, 8);
  return c;
}

/** The 5-room flat again, but as a photograph: rotated, unevenly lit and covered in labels. */
function photographedFlat(): PlanCanvas {
  const c = fiveRoomFlat().rotate(3.2);
  c.clutter(7);
  c.lighting(120);
  return c;
}

const cases: Expectation[] = [
  {
    name: '5-room flat, doors on every partition',
    canvas: fiveRoomFlat(),
    totalM2: 85,
    minRooms: 5,
    maxRooms: 6,
  },
  {
    name: 'corridor flat with front door + 5 m² bathroom',
    canvas: corridorFlat(),
    totalM2: 92,
    minRooms: 5,
    maxRooms: 7,
    expectSmallRoomUnderM2: 7,
  },
  {
    name: 'L-shaped studio with a corner room',
    canvas: lShapedStudio(),
    totalM2: 60,
    minRooms: 2,
    maxRooms: 3,
    expectLShape: true,
  },
  {
    // Everything a photo of a printed plan throws at the parser at once.
    name: 'photographed plan — 3.2° skew, uneven lighting, text clutter',
    canvas: photographedFlat(),
    totalM2: 85,
    minRooms: 4,
    maxRooms: 7,
  },
];

let failures = 0;

for (const testCase of cases) {
  const { canvas } = testCase;
  const parse = parseFloorPlan({
    data: canvas.data,
    width: canvas.width,
    height: canvas.height,
  });

  const mpp = metresPerPixelFromArea(parse.regions, testCase.totalM2);
  const plan = buildPlanFromRegions(parse, { metresPerPixel: mpp });
  const total = totalFloorAreaM2(plan);

  console.log(`\n▸ ${testCase.name}`);
  console.log(
    `   rooms=${plan.rooms.length}  total=${total} m² (target ${testCase.totalM2})  warning=${parse.warning ?? '—'}`
  );
  for (const room of plan.rooms) {
    const doors = room.openings.filter((o) => o.kind !== 'window').length;
    const windows = room.openings.filter((o) => o.kind === 'window').length;
    console.log(
      `     ${room.id}  ${room.type.padEnd(12)} ${room.areaM2.toFixed(1).padStart(6)} m²  ` +
        `verts=${String(room.polygon.length).padStart(2)}  doors=${doors} windows=${windows}` +
        (room.lowConfidence ? '  ⚠︎' : '')
    );
  }

  const problems: string[] = [];
  if (plan.rooms.length < testCase.minRooms || plan.rooms.length > testCase.maxRooms) {
    problems.push(
      `expected ${testCase.minRooms}–${testCase.maxRooms} rooms, got ${plan.rooms.length}`
    );
  }
  if (Math.abs(total - testCase.totalM2) > 0.5) {
    problems.push(`total area drifted: ${total} vs ${testCase.totalM2}`);
  }
  if (testCase.expectLShape && !plan.rooms.some((r) => r.polygon.length >= 6)) {
    problems.push('no non-rectangular room survived — L-shape was flattened');
  }
  if (
    testCase.expectSmallRoomUnderM2 &&
    !plan.rooms.some((r) => r.areaM2 < testCase.expectSmallRoomUnderM2!)
  ) {
    problems.push(`no room under ${testCase.expectSmallRoomUnderM2} m² — small rooms swallowed`);
  }

  if (problems.length) {
    failures++;
    for (const p of problems) console.log(`   ✗ ${p}`);
  } else {
    console.log('   ✓ ok');
  }
}

console.log(failures === 0 ? '\nall parser cases passed\n' : `\n${failures} case(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
