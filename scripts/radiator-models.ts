/**
 * The central-heating radiators, written in code: one SECTION per style. The studio repeats
 * the section along the wall as many times as the room needs (the way a double socket is two
 * plates side by side) and the budget prices it per section.
 *
 *   pnpm models:radiators   → public/models/radiators/*.glb + manifest.json
 *                             + lib/design3d/radiatorManifest.ts (the same data, typed)
 *   pnpm models:photos --only=radiator-panel,radiator-aluminium,radiator-column,radiator-classic
 *                           → then the product photos: eight sections of each (scripts/model-photos.ts)
 *   pnpm models:seed        → one product per section model, priced per section
 *
 * No download and no Blender: every section is a handful of boxes, swept profiles and
 * surfaces of revolution put together below, with one glTF material per surface.
 *
 * Every file stands in the same frame, which is what the placing code relies on:
 *
 *   - ONE section, centred on x, whose x-extent is EXACTLY the pitch (`sectionWidthCm`), so
 *     copies placed at that pitch touch and their horizontal collectors join into pipes;
 *   - standing on y = 0, in metres, Y up;
 *   - its back on z = 0 and its front along +z, into the room (the gap to the wall is the
 *     studio's to add).
 *
 * The script measures what it wrote and fails when a file is out of that frame. Material
 * names are plain (`radiator-enamel`, `radiator-iron`…) and stay clear of the words the
 * studio lights up (`LIT_MATERIAL` in lib/design3d/buildStructure.ts).
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import type { StyleId } from '../lib/design/types';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'models', 'radiators');
const TS_OUT = path.join(ROOT, 'lib', 'design3d', 'radiatorManifest.ts');
/** What a material may not be called: the studio makes these glow when a light is on. */
const LIT_WORDS = /light|lamp|glow|bulb|emiss|led|tube|shade/i;
/** The frame's tolerance: half a millimetre. */
const FRAME_TOLERANCE_M = 0.0005;
const MAX_TRIANGLES = 1250;

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

interface Surface {
  /** The glTF material's name. */
  name: string;
  /** sRGB, as one reads it off a colour picker. */
  color: string;
  metallic: number;
  roughness: number;
}

interface Part {
  surface: Surface;
  shape: Shape;
}

interface RadiatorDesign {
  slug: string;
  title: string;
  /** Nominal size in cm: the pitch is a contract, height and depth are checked to the millimetre. */
  sectionWidthCm: number;
  heightCm: number;
  depthCm: number;
  /** Heat output of one section at ΔT 70 K, the figure the sizing rule divides by. */
  wattsPerSection: number;
  product: RadiatorManifestModel['product'];
  build: () => Part[];
}

export interface RadiatorManifestModel {
  slug: string;
  title: string;
  url: string;
  /** The pitch: the section's exact x-extent, so copies at this step touch. */
  sectionWidthCm: number;
  heightCm: number;
  depthCm: number;
  wattsPerSection: number;
  triangles: number;
  bytes: number;
  /** The product's photo — eight sections, rendered by `pnpm models:photos`. */
  imageUrl: string;
  author: string;
  license: string;
  /** The catalogue product one SECTION is sold as (`pnpm models:seed` writes it). */
  product: { kind: 'radiator'; categorySlug: 'radiators'; priceGel: number; unit: 'piece'; storeSlug: string; nameKa: string; nameEn: string; nameRu: string; styles: StyleId[] };
}

/** `radiator-panel` → `panel`: the photo and the product are named `radiator-<this>`. */
export function radiatorShortName(slug: string): string {
  return slug.replace(/^radiator-/, '');
}

const WHITE_MATTE: Surface = { name: 'radiator-enamel', color: '#f3f3ef', metallic: 0, roughness: 0.62 };
const WHITE_SATIN: Surface = { name: 'radiator-enamel', color: '#f1f1ec', metallic: 0, roughness: 0.38 };
const CONVECTOR_GREY: Surface = { name: 'radiator-grille', color: '#55585c', metallic: 0.2, roughness: 0.7 };
const GRAPHITE_IRON: Surface = { name: 'radiator-iron', color: '#6e737b', metallic: 0.6, roughness: 0.5 };
const CREAM_ENAMEL: Surface = { name: 'radiator-enamel', color: '#ece0c4', metallic: 0, roughness: 0.45 };
const BRONZE: Surface = { name: 'radiator-bronze', color: '#b07a3a', metallic: 0.55, roughness: 0.38 };

const DESIGNS: RadiatorDesign[] = [
  {
    slug: 'radiator-panel',
    title: 'Steel panel radiator, 10 cm module',
    sectionWidthCm: 10,
    heightCm: 60,
    depthCm: 10,
    wattsPerSection: 170,
    product: {
      kind: 'radiator',
      categorySlug: 'radiators',
      priceGel: 38,
      unit: 'piece',
      storeSlug: 'san-plus',
      nameKa: 'რადიატორი „Panel“ — ფოლადის პანელი, თეთრი (1 სექცია)',
      nameEn: 'Radiator "Panel" — steel panel, white (per section)',
      nameRu: 'Радиатор «Panel» — стальная панель, белый (за секцию)',
      styles: ['modern'],
    },
    build: buildPanel,
  },
  {
    slug: 'radiator-aluminium',
    title: 'Die-cast aluminium sectional radiator, one section',
    sectionWidthCm: 8,
    heightCm: 58,
    depthCm: 9.5,
    wattsPerSection: 180,
    product: {
      kind: 'radiator',
      categorySlug: 'radiators',
      priceGel: 32,
      unit: 'piece',
      storeSlug: 'san-plus',
      nameKa: 'რადიატორი „Alu“ — ალუმინის სექციური, თეთრი (1 სექცია)',
      nameEn: 'Radiator "Alu" — aluminium sectional, white (per section)',
      nameRu: 'Радиатор «Alu» — алюминиевый секционный, белый (за секцию)',
      styles: ['scandinavian', 'modern'],
    },
    build: buildAluminium,
  },
  {
    slug: 'radiator-column',
    title: 'Cast-iron three-column radiator, one section',
    sectionWidthCm: 6,
    heightCm: 76,
    depthCm: 14,
    wattsPerSection: 120,
    product: {
      kind: 'radiator',
      categorySlug: 'radiators',
      priceGel: 85,
      unit: 'piece',
      storeSlug: 'san-plus',
      nameKa: 'რადიატორი „Column“ — თუჯის, გრაფიტისფერი (1 სექცია)',
      nameEn: 'Radiator "Column" — cast iron, graphite (per section)',
      nameRu: 'Радиатор «Column» — чугунный, графит (за секцию)',
      styles: ['industrial'],
    },
    build: buildColumn,
  },
  {
    slug: 'radiator-classic',
    title: 'Ornate cast-iron four-column radiator, one section',
    sectionWidthCm: 7.6,
    heightCm: 66,
    depthCm: 16,
    wattsPerSection: 110,
    product: {
      kind: 'radiator',
      categorySlug: 'radiators',
      priceGel: 120,
      unit: 'piece',
      storeSlug: 'san-plus',
      nameKa: 'რადიატორი „Classic“ — თუჯის, კრემისფერი (1 სექცია)',
      nameEn: 'Radiator "Classic" — cast iron, cream (per section)',
      nameRu: 'Радиатор «Classic» — чугунный, кремовый (за секцию)',
      styles: ['vintage'],
    },
    build: buildClassic,
  },
];

// ---------------------------------------------------------------------------
// The four sections. Everything below is in centimetres; the writer turns it into metres.
// ---------------------------------------------------------------------------

/**
 * Modern: a module of a flat steel panel radiator (a "type 22": two pressed plates with the
 * convector between them). The front plate carries the pressed flutes at a third of the
 * module, stopping short of the top and bottom where the headers run; the grille's slats
 * sit a quarter of the module apart, one astride each joint.
 *
 * A row has to read as ONE panel, and two things drew a line down every joint until they
 * were designed out. Copies that only just touch leave a hairline wherever the renderer
 * rounds their shared edge two ways, so the face, the top, the bottom and the grille run a
 * twentieth of a millimetre past the pitch and the same white lies behind every such crack.
 * And a module has to be closed at its ends (the row's two ends show them: plate, side
 * cover, plate), but an end face is a steep polygon right under the panel's face, and under
 * multisampling a software rasteriser — the one the product photos are made with — lets it
 * bleed through along the edge they share, which dashed every joint grey. So the ends are
 * shaded as rounded edges are (`ends`): their outermost millimetres face the way the
 * neighbouring face does, and what bleeds through at a joint is the colour already there.
 */
function buildPanel(): Part[] {
  const W = 10;
  const H = 60;
  const D = 10;
  const half = W / 2;
  const lap = half + 0.005;
  const hidden = half - 0.3; // how far the dark of the slot runs: its ends lie under the slats astride the joints
  const plate = 1.6;
  const grooveDepth = 0.45;
  const centres = [-W / 3, 0, W / 3];
  const across = (x: number) => {
    let g = 0;
    for (const c of centres) {
      const d = Math.abs(x - c);
      g = Math.max(g, d <= 0.22 ? 1 : d >= 0.58 ? 0 : (0.58 - d) / 0.36);
    }
    return g;
  };
  const along = (y: number) => (y <= 4.5 || y >= H - 4.5 ? 0 : y < 5.7 ? (y - 4.5) / 1.2 : y > H - 5.7 ? (H - 4.5 - y) / 1.2 : 1);
  const xs = [-lap, ...centres.flatMap((c) => [c - 0.8, c - 0.58, c - 0.22, c + 0.22, c + 0.58, c + 0.8]), lap];
  const ys = [0, 4.2, 4.5, 5.7, 6, H - 6, H - 5.7, H - 4.5, H - 4.2, H];
  const slatTop = H - 0.45;
  const parts: Part[] = [];
  const white = (shape: Shape) => parts.push({ surface: WHITE_MATTE, shape });

  // The front plate — its face is the pressed sheet — and the plate against the wall.
  white(heightGrid(xs, ys, (x, y) => D - grooveDepth * across(x) * along(y)));
  white(box([-lap, 0, D - plate], [lap, H, D], ['+z', '-z', '+x', '-x']));
  white(box([-lap, 0, 0], [lap, H, plate], ['+z', '+x', '-x']));
  // The two faces that look at each other across the convector are seen down the grille
  // and nowhere else; they stop exactly at the ends, where a lap would stick out of a row's side.
  white(box([-half, 0, D - plate], [half, H, D], ['+z', '+x', '-x', '+y', '-y']));
  white(box([-half, 0, 0], [half, H, plate], ['-z', '+x', '-x', '+y', '-y']));
  white(ends([-half, 0, D - plate], [half, H, D], 0.3, ['+z', '+y', '-y']));
  white(ends([-half, 0, 0], [half, H, plate], 0.3, ['-z', '+y', '-y']));
  // Between them the convector: from above it is the dark of the grille's slot, and its two
  // ends are the radiator's white side cover, up to the top of the slats.
  parts.push({ surface: CONVECTOR_GREY, shape: box([-hidden, 2.5, plate], [hidden, H - 2.4, D - plate], ['+x', '-x', '+z', '-z']) });
  white(ends([-half, 0, plate], [half, slatTop, D - plate], 0.3, ['+y', '-y']));
  // The grille: three whole slats and half a one at either joint, where the neighbour's half completes it.
  for (let k = 0; k <= 4; k++) {
    const cx = -half + k * (W / 4);
    const x0 = k === 0 ? -lap : cx - 0.6;
    const x1 = k === 4 ? lap : cx + 0.6;
    white(box([x0, H - 1, plate], [x1, slatTop, D - plate], ['+z', '-z', ...(k === 0 ? (['-x'] as Face[]) : []), ...(k === 4 ? (['+x'] as Face[]) : [])]));
  }
  return parts;
}

/**
 * Scandinavian: one section of a die-cast aluminium radiator. The front fin is a touch
 * narrower than the pitch — the dark line between sections is what these radiators look
 * like — gently convex, and bends back over the top collector as a hood with two slots in
 * it. Behind it: the oval water channel between the two collectors, a web to the front fin,
 * a fin out to either side, and a narrower fin against the wall.
 */
function buildAluminium(): Part[] {
  const W = 8;
  const H = 58;
  const D = 9.5;
  const surface = WHITE_SATIN;
  const parts: Part[] = [];
  const add = (shape: Shape) => parts.push({ surface, shape });

  // --- collectors and the water channel -------------------------------------
  const pipeZ = 4.6;
  const lowY = 3.6;
  const highY = 53.6;
  for (const y of [lowY, highY]) add(cylinder(2, -W / 2, W / 2, 12).turn('z', -90).move(0, y, pipeZ));
  add(cylinder(1, lowY, highY, 12, 'none').scale(1.25, 1, 1.7).move(0, 0, pipeZ));

  // --- the front fin: a convex plate swept up the front and back over the top ---
  const U = 3.7; // half the fin's width: 6 mm between neighbours
  const rail = 3.0; // the slots lie between two rails this far from the middle
  const halfThick = 0.22;
  const bulge = 0.35;
  const face = (u: number) => halfThick + bulge * (1 - (u / U) ** 2);
  const R = 5;
  const bendY = H - R - halfThick - bulge;
  const midZ = D - bulge - halfThick;
  const runEndZ = 2.6;
  const onArc = (deg: number): PathPoint => {
    const a = (deg * Math.PI) / 180;
    return { p: [0, bendY + R * Math.sin(a), midZ - R + R * Math.cos(a)], t: [0, Math.cos(a), -Math.sin(a)] };
  };
  const arc = (from: number, to: number, steps: number) => Array.from({ length: steps + 1 }, (_, k) => onArc(from + ((to - from) * k) / steps));
  const foot: PathPoint = { p: [0, 0, midZ], t: [0, 1, 0] };
  const runStart: PathPoint = { p: [0, bendY + R, midZ - R], t: [0, 0, -1] };
  const runEnd: PathPoint = { p: [0, bendY + R, runEndZ], t: [0, 0, -1] };
  const SIDE: V3 = [-1, 0, 0]; // with the path going up, the section's w axis is then +z: the room

  const finSection = (u0: number, u1: number, steps: number): SectionPoint[] => {
    const points: SectionPoint[] = [
      { u: u0, w: -halfThick, hard: true },
      { u: u1, w: -halfThick, hard: true },
    ];
    for (let k = 0; k <= steps; k++) {
      const u = u1 + ((u0 - u1) * k) / steps;
      points.push({ u, w: face(u), hard: k === 0 || k === steps });
    }
    return points;
  };
  // Two rails the whole way, and between them the plate, the two bars between the slots and the hood.
  for (const [u0, u1] of [[-U, -rail], [rail, U]] as const) {
    add(sweep(finSection(u0, u1, 1), [foot, ...arc(0, 90, 9).slice(0, -1), runStart, runEnd], SIDE));
  }
  const middle = finSection(-rail, rail, 6);
  add(sweep(middle, [foot, ...arc(0, 18, 2)], SIDE));
  add(sweep(middle, arc(30, 46, 2), SIDE));
  add(sweep(middle, [...arc(58, 90, 3).slice(0, -1), runStart, runEnd], SIDE));

  // --- what stands behind it -------------------------------------------------
  add(box([-0.2, 6, pipeZ + 1.2], [0.2, 52, midZ - halfThick + 0.05])); // the web to the front fin
  add(box([-0.2, 6, 0.3], [0.2, 52, pipeZ - 1.2])); // and to the back one
  add(box([-2.7, 5.5, 0], [2.7, 52.5, 0.35])); // the fin against the wall
  for (const side of [-1, 1]) add(box([side === 1 ? 1 : -3.5, 6.5, pipeZ - 0.15], [side === 1 ? 3.5 : -1, 51, pipeZ + 0.15])); // a fin out to either side
  return parts;
}

/**
 * Industrial: one section of a cast-iron column radiator — three slender columns front to
 * back. Each column is one casting turned on the lathe: a domed head, a straight shoulder,
 * a flare down to the tube, and the same upside down at the foot. The shoulders of the three
 * run into each other (a bar through them fills the waists), so the head reads as one piece
 * with a scalloped top and pointed arches where the flares part; the collector's boss runs
 * across the whole pitch through the middle column, top and bottom.
 */
function buildColumn(): Part[] {
  const W = 6;
  const H = 76;
  const surface = GRAPHITE_IRON;
  const parts: Part[] = [];
  const add = (shape: Shape) => parts.push({ surface, shape });
  const columns = [2.5, 7, 11.5];
  const tube = 1.6;
  const head = 2.2; // half the head's width; its depth is stretched to touch z = 0 and the next head
  const domeH = 3.5;
  const shoulder = 7.5;
  const flareEnd = 11;

  const foot: LathePoint[] = [];
  for (let k = 0; k <= 4; k++) {
    const a = (Math.PI / 2) * (k / 4);
    foot.push({ r: k === 0 ? 0 : head * Math.sin(a), y: domeH * (1 - Math.cos(a)) });
  }
  foot.push({ r: head, y: shoulder }, { r: 1.93, y: 9.3 }, { r: tube, y: flareEnd });
  const profile: LathePoint[] = [...foot, ...foot.map((point) => ({ r: point.r, y: H - point.y })).reverse()];
  for (const z of columns) add(lathe(profile, 12).scale(1, 1, columns[0] / head).move(0, 0, z));

  const bossY = (domeH + shoulder) / 2;
  for (const y of [bossY, H - bossY]) {
    add(cylinder(1, columns[0], columns[2], 12, 'none').scale(1.75, 1, (shoulder - domeH) / 2).turn('x', 90).move(0, y, 0));
    add(cylinder(2.1, -W / 2, W / 2, 12).turn('z', -90).move(0, y, columns[1]));
  }
  return parts;
}

/**
 * Vintage: one section of an ornate cast-iron radiator in cream enamel — four slim oval
 * columns, each with a bead near either end, between bulbous hubs; bronze collars where the
 * collectors join (between hubs they show as rings, and the row's two ends wear them as hub
 * caps) and a bronze rosette on the front hub, top and bottom.
 */
function buildClassic(): Part[] {
  const W = 7.6;
  const H = 66;
  const parts: Part[] = [];
  const enamel = (shape: Shape) => parts.push({ surface: CREAM_ENAMEL, shape });
  const bronze = (shape: Shape) => parts.push({ surface: BRONZE, shape });
  const bulb = { x: 2.9, y: 3.2, z: 2.2 };
  const frontZ = 15.6; // the rosette stands 4 mm proud of the front bulb: 16 cm in all
  const columns = [0, 1, 2, 3].map((k) => bulb.z + (k * (frontZ - 2 * bulb.z)) / 3);
  const middleZ = (columns[1] + columns[2]) / 2;

  // Radii of 1 are the shaft; the column is wider than it is deep, as cast sections are.
  const column: LathePoint[] = [
    { r: 1.04, y: 4 },
    { r: 1.04, y: 8.6 },
    { r: 1.42, y: 9.4 },
    { r: 1, y: 10.2 },
    { r: 1, y: H - 10.2 },
    { r: 1.42, y: H - 9.4 },
    { r: 1.04, y: H - 8.6 },
    { r: 1.04, y: H - 4 },
  ];
  // The two columns one sees — the front one and the one against the wall — are the rounder.
  columns.forEach((z, k) => enamel(lathe(column, k === 0 || k === 3 ? 8 : 6).scale(1.8, 1, 1.35).move(0, 0, z)));

  for (const top of [false, true]) {
    const y = top ? H - bulb.y : bulb.y;
    for (const z of columns) enamel(ellipsoid(bulb.x, bulb.y, bulb.z, 8, 4).move(0, y, z));
    enamel(cylinder(1, columns[0], columns[3], 8, 'none').scale(2, 1, 2).turn('x', 90).move(0, y, 0));
    enamel(cylinder(1.9, -W / 2 + 0.55, W / 2 - 0.55, 8, 'none').turn('z', -90).move(0, y, middleZ));
    for (const side of [-1, 1]) {
      const x0 = side === 1 ? W / 2 - 0.6 : -W / 2;
      bronze(cylinder(2.5, x0, x0 + 0.6, 10).turn('z', -90).move(0, y, middleZ));
    }
    // The rosette: a rim and a low boss, eight shallow petals round it; its foot is sunk into the bulb.
    const rosette: LathePoint[] = [
      { r: 1.4, y: -0.8 },
      { r: 1.4, y: 0.08, hard: true },
      { r: 0.9, y: 0.33 },
      { r: 0, y: 0.4 },
    ];
    bronze(lathe(rosette, 16, (theta) => 1 + 0.08 * Math.cos(8 * theta)).turn('x', 90).move(0, y, frontZ));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// A small mesh kit: indexed triangles with normals, built the right way round
// ---------------------------------------------------------------------------

type V3 = [number, number, number];
type Face = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
const unit2 = (a: [number, number]): [number, number] => {
  const length = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / length, a[1] / length];
};

class Shape {
  positions: number[] = [];
  normals: number[] = [];
  indices: number[] = [];

  vertex(p: V3, n: V3): number {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    return this.positions.length / 3 - 1;
  }

  /** A flat quad a → b → c → d, wound whichever way faces `facing`. */
  quad(a: V3, b: V3, c: V3, d: V3, facing: V3): this {
    let normal = unit(cross(sub(b, a), sub(d, a)));
    let corners = [a, b, c, d];
    if (dot(normal, facing) < 0) {
      corners = [a, d, c, b];
      normal = [-normal[0], -normal[1], -normal[2]];
    }
    const [i, j, k, l] = corners.map((corner) => this.vertex(corner, normal));
    this.indices.push(i, j, k, i, k, l);
    return this;
  }

  /** p' = M p + t, the normals by the inverse transpose, the winding flipped by a reflection. */
  private affine(m: number[], t: V3): Shape {
    const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    // The inverse transpose is the cofactor matrix over the determinant; normalising drops the scalar.
    const c = [
      m[4] * m[8] - m[5] * m[7], m[5] * m[6] - m[3] * m[8], m[3] * m[7] - m[4] * m[6],
      m[2] * m[7] - m[1] * m[8], m[0] * m[8] - m[2] * m[6], m[1] * m[6] - m[0] * m[7],
      m[1] * m[5] - m[2] * m[4], m[2] * m[3] - m[0] * m[5], m[0] * m[4] - m[1] * m[3],
    ];
    const sign = det < 0 ? -1 : 1;
    const out = new Shape();
    for (let i = 0; i < this.positions.length; i += 3) {
      const [x, y, z] = [this.positions[i], this.positions[i + 1], this.positions[i + 2]];
      const [nx, ny, nz] = [this.normals[i], this.normals[i + 1], this.normals[i + 2]];
      out.vertex(
        [m[0] * x + m[1] * y + m[2] * z + t[0], m[3] * x + m[4] * y + m[5] * z + t[1], m[6] * x + m[7] * y + m[8] * z + t[2]],
        unit([sign * (c[0] * nx + c[1] * ny + c[2] * nz), sign * (c[3] * nx + c[4] * ny + c[5] * nz), sign * (c[6] * nx + c[7] * ny + c[8] * nz)])
      );
    }
    for (let i = 0; i < this.indices.length; i += 3) {
      if (det < 0) out.indices.push(this.indices[i], this.indices[i + 2], this.indices[i + 1]);
      else out.indices.push(this.indices[i], this.indices[i + 1], this.indices[i + 2]);
    }
    return out;
  }

  move(x: number, y: number, z: number): Shape {
    return this.affine([1, 0, 0, 0, 1, 0, 0, 0, 1], [x, y, z]);
  }

  scale(x: number, y: number, z: number): Shape {
    return this.affine([x, 0, 0, 0, y, 0, 0, 0, z], [0, 0, 0]);
  }

  /** A right-handed turn about an axis: `turn('z', -90)` lays the y axis along +x, `turn('x', 90)` along +z. */
  turn(axis: 'x' | 'y' | 'z', degrees: number): Shape {
    const a = (degrees * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const m = axis === 'x' ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === 'y' ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1];
    return this.affine(m, [0, 0, 0]);
  }
}

/** An axis-aligned box; `skip` leaves out the faces nobody can see. */
function box(min: V3, max: V3, skip: Face[] = []): Shape {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const shape = new Shape();
  const faces: Array<[Face, V3, V3, V3, V3, V3]> = [
    ['+x', [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]],
    ['-x', [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]],
    ['+y', [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]],
    ['-y', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
    ['+z', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
    ['-z', [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]],
  ];
  for (const [face, a, b, c, d, facing] of faces) if (!skip.includes(face)) shape.quad(a, b, c, d, facing);
  return shape;
}

/**
 * The two x-ends of a box, each a patch of cells. The middle faces along x; along the edges
 * named in `soft` the outer half of the `rim` faces the way the face it meets there does,
 * and the inner half turns from that to x — so the end shades like a rounded edge, and a
 * copy's end hidden under its neighbour's face can bleed through it (see `buildPanel`)
 * without being seen.
 */
function ends(min: V3, max: V3, rim: number, soft: Face[]): Shape {
  const shape = new Shape();
  // Along one axis: the stations across the patch, and which way the soft ones lean (-1, 0, +1).
  const stations = (lo: number, hi: number, softLo: boolean, softHi: boolean) => [
    { at: lo, lean: softLo ? -1 : 0 },
    ...(softLo ? [{ at: lo + rim / 2, lean: -1 }] : []),
    { at: lo + rim, lean: 0 },
    { at: hi - rim, lean: 0 },
    ...(softHi ? [{ at: hi - rim / 2, lean: 1 }] : []),
    { at: hi, lean: softHi ? 1 : 0 },
  ];
  const ys = stations(min[1], max[1], soft.includes('-y'), soft.includes('+y'));
  const zs = stations(min[2], max[2], soft.includes('-z'), soft.includes('+z'));
  for (const side of [-1, 1]) {
    const x = side === 1 ? max[0] : min[0];
    const at = ys.map((y) => zs.map((z) => shape.vertex([x, y.at, z.at], y.lean || z.lean ? unit([0, y.lean, z.lean]) : [side, 0, 0])));
    for (let j = 0; j + 1 < ys.length; j++) {
      for (let k = 0; k + 1 < zs.length; k++) {
        // a → b → c → d runs anticlockwise seen from +x.
        const [a, b, c, d] = [at[j][k], at[j + 1][k], at[j + 1][k + 1], at[j][k + 1]];
        shape.indices.push(...(side === 1 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]));
      }
    }
  }
  return shape;
}

interface LathePoint {
  r: number;
  y: number;
  /** A crease: the two segments that meet here keep their own normals. */
  hard?: boolean;
}

/**
 * A surface of revolution about the y axis. The profile runs from the bottom to the top with
 * the outside on its right, so an upward side faces outwards, a run from the axis out faces
 * down and a run back to the axis faces up. `radial` scales the radius with the angle (the
 * petals of a rosette). Segment counts that divide by four put a vertex on each axis, which
 * is what keeps a shape's measured extent equal to its radius.
 */
function lathe(profile: LathePoint[], segments: number, radial?: (theta: number) => number): Shape {
  const shape = new Shape();
  const clean = profile.map((point) => ({ ...point, r: Math.abs(point.r) < 1e-9 ? 0 : point.r }));
  const runs: Array<{ a: LathePoint; b: LathePoint; n: [number, number] }> = [];
  for (let k = 0; k + 1 < clean.length; k++) {
    const [a, b] = [clean[k], clean[k + 1]];
    const length = Math.hypot(b.r - a.r, b.y - a.y);
    if (length > 1e-9) runs.push({ a, b, n: [(b.y - a.y) / length, -(b.r - a.r) / length] });
  }
  runs.forEach((run, k) => {
    const previous = runs[k - 1];
    const next = runs[k + 1];
    let na = run.a.hard || !previous ? run.n : unit2([run.n[0] + previous.n[0], run.n[1] + previous.n[1]]);
    let nb = run.b.hard || !next ? run.n : unit2([run.n[0] + next.n[0], run.n[1] + next.n[1]]);
    // On the axis a smooth surface can only face along it.
    if (run.a.r === 0 && !run.a.hard) na = [0, na[1] > 0 ? 1 : -1];
    if (run.b.r === 0 && !run.b.hard) nb = [0, nb[1] < 0 ? -1 : 1];
    const rowA: number[] = [];
    const rowB: number[] = [];
    for (let j = 0; j <= segments; j++) {
      const theta = (2 * Math.PI * (j % segments)) / segments;
      const [c, s] = [Math.cos(theta), Math.sin(theta)];
      const m = radial ? radial(theta) : 1;
      rowA.push(shape.vertex([run.a.r * m * c, run.a.y, run.a.r * m * s], unit([na[0] * c, na[1], na[0] * s])));
      rowB.push(shape.vertex([run.b.r * m * c, run.b.y, run.b.r * m * s], unit([nb[0] * c, nb[1], nb[0] * s])));
    }
    for (let j = 0; j < segments; j++) {
      if (run.b.r !== 0) shape.indices.push(rowA[j], rowB[j], rowB[j + 1]);
      if (run.a.r !== 0) shape.indices.push(rowA[j], rowB[j + 1], rowA[j + 1]);
    }
  });
  return shape;
}

/** A cylinder along y from `y0` to `y1`; turn it to lay it along x or z. */
function cylinder(radius: number, y0: number, y1: number, segments: number, caps: 'both' | 'none' = 'both'): Shape {
  const side: LathePoint[] = [
    { r: radius, y: y0, hard: true },
    { r: radius, y: y1, hard: true },
  ];
  return lathe(caps === 'both' ? [{ r: 0, y: y0 }, ...side, { r: 0, y: y1 }] : side, segments);
}

/** An ellipsoid about the origin: a sphere's lathe, stretched (the normals follow the stretch). */
function ellipsoid(rx: number, ry: number, rz: number, segments: number, rings: number): Shape {
  const profile: LathePoint[] = [];
  for (let k = 0; k <= rings; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / rings;
    profile.push({ r: k === 0 || k === rings ? 0 : Math.cos(a), y: Math.sin(a) });
  }
  return lathe(profile, segments).scale(rx, ry, rz);
}

interface SectionPoint {
  u: number;
  w: number;
  hard?: boolean;
}

interface PathPoint {
  p: V3;
  /** The direction of travel here, a unit vector at right angles to the sweep's `side`. */
  t: V3;
}

/**
 * A closed section carried along a path. The section lies in the plane across the path: its
 * u axis is `side` (constant, so the path has to stay in the plane at right angles to it)
 * and its w axis is `t × side`. Drawn anticlockwise in (u, w), its outside is outside. Both
 * ends are closed with a fan about the section's centre, so the section has to be convex
 * enough to be seen whole from there.
 */
function sweep(section: SectionPoint[], path: PathPoint[], side: V3): Shape {
  const shape = new Shape();
  const count = section.length;
  const frames = path.map(({ p, t }) => ({ p, t, n: unit(cross(t, side)) }));
  const at = (frame: (typeof frames)[number], u: number, w: number): V3 => [
    frame.p[0] + u * side[0] + w * frame.n[0],
    frame.p[1] + u * side[1] + w * frame.n[1],
    frame.p[2] + u * side[2] + w * frame.n[2],
  ];
  const facing = (frame: (typeof frames)[number], n: [number, number]): V3 => unit([n[0] * side[0] + n[1] * frame.n[0], n[0] * side[1] + n[1] * frame.n[1], n[0] * side[2] + n[1] * frame.n[2]]);
  const edgeNormal = (i: number): [number, number] => {
    const [a, b] = [section[i % count], section[(i + 1) % count]];
    return unit2([b.w - a.w, -(b.u - a.u)]);
  };
  for (let i = 0; i < count; i++) {
    const [a, b] = [section[i], section[(i + 1) % count]];
    const own = edgeNormal(i);
    const before = edgeNormal(i + count - 1);
    const after = edgeNormal(i + 1);
    const na = a.hard ? own : unit2([own[0] + before[0], own[1] + before[1]]);
    const nb = b.hard ? own : unit2([own[0] + after[0], own[1] + after[1]]);
    const rowA = frames.map((frame) => shape.vertex(at(frame, a.u, a.w), facing(frame, na)));
    const rowB = frames.map((frame) => shape.vertex(at(frame, b.u, b.w), facing(frame, nb)));
    for (let k = 0; k + 1 < frames.length; k++) shape.indices.push(rowA[k], rowB[k], rowB[k + 1], rowA[k], rowB[k + 1], rowA[k + 1]);
  }
  const centre = { u: section.reduce((sum, point) => sum + point.u, 0) / count, w: section.reduce((sum, point) => sum + point.w, 0) / count };
  for (const end of ['start', 'end'] as const) {
    const frame = end === 'start' ? frames[0] : frames[frames.length - 1];
    const normal: V3 = end === 'start' ? [-frame.t[0], -frame.t[1], -frame.t[2]] : frame.t;
    const hub = shape.vertex(at(frame, centre.u, centre.w), normal);
    const rim = section.map((point) => shape.vertex(at(frame, point.u, point.w), normal));
    for (let i = 0; i < count; i++) {
      if (end === 'end') shape.indices.push(hub, rim[i], rim[(i + 1) % count]);
      else shape.indices.push(hub, rim[(i + 1) % count], rim[i]);
    }
  }
  return shape;
}

/** A sheet facing +z whose depth is a function of x and y — the pressed face of a panel. The normals come from the slope, so a crease reads as a pressed edge rather than a fold. */
function heightGrid(xs: number[], ys: number[], z: (x: number, y: number) => number): Shape {
  const shape = new Shape();
  const e = 1e-3;
  const rows = ys.map((y) => xs.map((x) => shape.vertex([x, y, z(x, y)], unit([-(z(x + e, y) - z(x - e, y)) / (2 * e), -(z(x, y + e) - z(x, y - e)) / (2 * e), 1]))));
  for (let j = 0; j + 1 < ys.length; j++) {
    for (let i = 0; i + 1 < xs.length; i++) shape.indices.push(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j][i], rows[j + 1][i + 1], rows[j + 1][i]);
  }
  return shape;
}

// ---------------------------------------------------------------------------
// From parts to a file
// ---------------------------------------------------------------------------

/** One mesh per surface: the parts merged, identical vertices welded, slivers dropped, and every triangle checked to face the way its normals say. */
function mergeBySurface(slug: string, parts: Part[]): Array<{ surface: Surface; positions: Float32Array<ArrayBuffer>; normals: Float32Array<ArrayBuffer>; indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>; triangles: number }> {
  const surfaces = new Map<string, { surface: Surface; shapes: Shape[] }>();
  for (const part of parts) {
    const known = surfaces.get(part.surface.name);
    if (known && JSON.stringify(known.surface) !== JSON.stringify(part.surface)) throw new Error(`${slug}: two different surfaces are both called ${part.surface.name}`);
    if (known) known.shapes.push(part.shape);
    else surfaces.set(part.surface.name, { surface: part.surface, shapes: [part.shape] });
  }
  return [...surfaces.values()].map(({ surface, shapes }) => {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const seen = new Map<string, number>();
    for (const shape of shapes) {
      const remap: number[] = [];
      for (let v = 0; v < shape.positions.length / 3; v++) {
        const p = shape.positions.slice(v * 3, v * 3 + 3);
        const n = shape.normals.slice(v * 3, v * 3 + 3);
        if ([...p, ...n].some((value) => !Number.isFinite(value))) throw new Error(`${slug}: a vertex that is not a number`);
        const key = [...p.map((value) => Math.round(value * 1e4)), ...n.map((value) => Math.round(value * 1e3))].join(',');
        let index = seen.get(key);
        if (index === undefined) {
          index = positions.length / 3;
          seen.set(key, index);
          positions.push(p[0] / 100, p[1] / 100, p[2] / 100); // centimetres → metres
          normals.push(n[0], n[1], n[2]);
        }
        remap.push(index);
      }
      for (let i = 0; i < shape.indices.length; i += 3) {
        const [a, b, c] = [remap[shape.indices[i]], remap[shape.indices[i + 1]], remap[shape.indices[i + 2]]];
        const corner = (index: number): V3 => [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
        const faceNormal = cross(sub(corner(b), corner(a)), sub(corner(c), corner(a)));
        if (Math.hypot(...faceNormal) < 1e-12) continue; // a sliver at a pole
        const vertexNormal: V3 = [0, 1, 2].map((k) => normals[a * 3 + k] + normals[b * 3 + k] + normals[c * 3 + k]) as V3;
        if (dot(unit(faceNormal), unit(vertexNormal)) < 0) throw new Error(`${slug}: a triangle of ${surface.name} is wound against its normals`);
        indices.push(a, b, c);
      }
    }
    const count = positions.length / 3;
    return { surface, positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: count > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices), triangles: indices.length / 3 };
  });
}

function linearColor(hex: string): [number, number, number, number] {
  const channel = (at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5), 1];
}

async function writeOne(design: RadiatorDesign): Promise<RadiatorManifestModel> {
  const meshes = mergeBySurface(design.slug, design.build());
  const doc = new Document();
  doc.getRoot().getAsset().generator = 'RenovationRoom scripts/radiator-models.ts';
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh(design.slug);
  for (const part of meshes) {
    if (LIT_WORDS.test(part.surface.name)) throw new Error(`${design.slug}: the studio would light up a material called ${part.surface.name}`);
    const material = doc
      .createMaterial(part.surface.name)
      .setBaseColorFactor(linearColor(part.surface.color))
      .setMetallicFactor(part.surface.metallic)
      .setRoughnessFactor(part.surface.roughness);
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(part.positions).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(part.normals).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(part.indices).setBuffer(buffer))
        .setMaterial(material)
    );
  }
  const scene = doc.createScene(design.slug).addChild(doc.createNode(design.slug).setMesh(mesh));
  doc.getRoot().setDefaultScene(scene);

  // --- the frame, measured ----------------------------------------------------
  const { min, max } = getBounds(scene);
  const size = [0, 1, 2].map((k) => max[k] - min[k]);
  const off = (value: number) => Math.abs(value) > FRAME_TOLERANCE_M;
  const mm = (value: number) => `${(value * 1000).toFixed(2)} mm`;
  if (off(size[0] - design.sectionWidthCm / 100)) throw new Error(`the section is ${mm(size[0])} wide, the pitch is ${design.sectionWidthCm * 10} mm`);
  if (off(min[0] + max[0])) throw new Error(`the section is not centred on x (${mm(min[0])} … ${mm(max[0])})`);
  if (off(min[1])) throw new Error(`the section does not stand on y = 0 (its foot is at ${mm(min[1])})`);
  if (off(min[2])) throw new Error(`the section's back is not on z = 0 (it is at ${mm(min[2])})`);
  if (Math.abs(size[1] - design.heightCm / 100) > 0.001) throw new Error(`the section is ${mm(size[1])} tall, not ${design.heightCm * 10} mm`);
  if (Math.abs(size[2] - design.depthCm / 100) > 0.001) throw new Error(`the section is ${mm(size[2])} deep, not ${design.depthCm * 10} mm`);
  const triangles = meshes.reduce((sum, part) => sum + part.triangles, 0);
  if (triangles > MAX_TRIANGLES) throw new Error(`${triangles} triangles in one section — a radiator is a dozen of them`);

  const out = path.join(OUT_DIR, `${design.slug}.glb`);
  await new NodeIO().write(out, doc);
  const { size: bytes } = await stat(out);
  const round = (metres: number) => Math.round(metres * 1000) / 10; // cm, to the millimetre
  return {
    slug: design.slug,
    title: design.title,
    url: `/models/radiators/${design.slug}.glb`,
    sectionWidthCm: round(size[0]),
    heightCm: round(size[1]),
    depthCm: round(size[2]),
    wattsPerSection: design.wattsPerSection,
    triangles,
    bytes,
    imageUrl: `/uploads/furniture/radiator-${radiatorShortName(design.slug)}.png`,
    author: 'RenovationRoom',
    license: 'CC0',
    product: design.product,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const models: RadiatorManifestModel[] = [];
  const failed: string[] = [];
  for (const design of DESIGNS) {
    process.stdout.write(`• ${design.slug} `);
    try {
      const model = await writeOne(design);
      models.push(model);
      console.log(`✓ ${model.sectionWidthCm}×${model.heightCm}×${model.depthCm} cm · ${model.triangles} tris · ${(model.bytes / 1024).toFixed(1)} KB · ${model.wattsPerSection} W · ${model.product.priceGel} ₾ a section`);
    } catch (error) {
      failed.push(`${design.slug} — ${(error as Error).message}`);
      console.log(`✗ ${(error as Error).message}`);
    }
  }
  if (failed.length) {
    // A radiator out of its frame would be placed wrong by every room that has one: write nothing.
    console.log(`\n${failed.length} failed — manifest left as it was:\n${failed.map((f) => `  · ${f}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }

  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        note: 'Written by scripts/radiator-models.ts. Each model is ONE section: centred on x with an x-extent of exactly sectionWidthCm (copies at that pitch touch and their collectors join), standing on y = 0, its back on z = 0 and its front along +z, in metres. Prices and watts are per section; the photos show eight.',
        models,
      },
      null,
      2
    ) + '\n'
  );
  await writeFile(
    TS_OUT,
    `/**\n * Generated by scripts/radiator-models.ts — do not edit. The central-heating radiators in\n * public/models/radiators, one SECTION per model: centred on x with an x-extent of exactly\n * \`sectionWidthCm\` (copies placed at that pitch touch and their collectors join into pipes),\n * standing on y = 0, its back on z = 0 and its front along +z. A radiator is the section\n * repeated; \`wattsPerSection\` is what the sizing rule divides a room's heat demand by.\n */\n\nimport type { StyleId } from '@/lib/design/types';\n\nexport interface RadiatorModel {\n  slug: string;\n  url: string;\n  sectionWidthCm: number;\n  heightCm: number;\n  depthCm: number;\n  wattsPerSection: number;\n  styles: StyleId[];\n}\n\nexport const RADIATOR_MODELS: RadiatorModel[] = ${JSON.stringify(
      models.map(({ slug, url, sectionWidthCm, heightCm, depthCm, wattsPerSection, product }) => ({ slug, url, sectionWidthCm, heightCm, depthCm, wattsPerSection, styles: product.styles })),
      null,
      2
    )};\n`
  );
  console.log(`\n${models.length} radiator sections in manifest · ${path.relative(ROOT, OUT_DIR)}`);
}

// Only when run, not when the seed or the photo script reads this file's types.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
