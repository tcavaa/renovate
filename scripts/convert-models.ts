/* eslint-disable no-console */
/**
 * Turns the partner 3D asset drop into the Design Studio's furniture catalogue.
 *
 *   pnpm models:convert [source-dir]              → public/models/*.glb + manifest.json
 *   pnpm models:convert --only=woody-bed,node-sofa  → redo a few, merge into the manifest
 *   pnpm models:seed                     → products in the database, one per model
 *
 * Every product the studio can place comes out of here. There is no procedural furniture
 * any more: a room is furnished only with things a partner actually sells, drawn from their
 * own geometry and, where the archive carries them, their own texture maps.
 *
 * What the source files are, and the four things about them that shaped this script:
 *
 *   1. **They are scenes, not products.** An OBJ routinely holds the whole range — two
 *      MECCANICA chairs, four CAYDEN tables, nine Ferm Living pendants — plus swatch cubes and
 *      shadow planes. `lib/objGroups` measures every group and keeps one product's worth.
 *   2. **The .mtl files are useless.** They hold 3ds Max wireframe placeholder colours and
 *      reference no maps, but the maps *are* in the archive, loose. `lib/textureClassify`
 *      works out which is the albedo, the normal and the roughness from their pixels.
 *   3. **No normals** (`vn=0`), so `buildScene` computes them on load.
 *   4. **`join` cannot merge across materials**, and `quantize` rewrites POSITION — so the
 *      placeholder materials are stripped before joining, and the model is normalised before
 *      it is quantized. Each of those cost a rebuild to discover.
 *
 * Dimensions are taken from the geometry, not typed in: the `targetSizeCm` on each entry is
 * only a hint used to choose the orientation and the source units (mm, cm, m or inches vary
 * between archives). What ends up in the database is what was measured.
 */

import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import obj2gltf from 'obj2gltf';
import jpeg from 'jpeg-js';
import { Document, NodeIO, type Texture } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, getBounds, join, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

import { chooseGroups, readGroups, writeFilteredObj, type GroupSelection } from './lib/objGroups';
import { classifyMaps, pickMaps } from './lib/textureClassify';

const run = promisify(execFile);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = path.join(ROOT, 'public', 'models');
const PHOTO_DIR = path.join(ROOT, 'public', 'uploads', 'furniture');
const DEFAULT_SOURCE = path.join(os.homedir(), 'Downloads', '3D OBJECTS WITH STYLES_DRAFT_03.03.2026');

/** Triangles per object. A furnished flat holds thirty of these at once. */
const TARGET_TRIANGLES = 14_000;
/** Longest edge of an embedded texture. 1K is plenty for a sofa seen from across a room. */
const TEXTURE_PX = 1024;
/** With three 1K textures embedded, a model lands around 0.6–1.2 MB. */
const MAX_BYTES = 2_400 * 1024;
/**
 * How far the converted shape may drift from the hint before it is treated as the wrong
 * object. Looser than before because the hint is now approximate by design; what it still
 * catches is a lamp cord read as the lamp, or a table plus its shadow plane.
 */
const MAX_ASPECT_ERROR = 0.6;

type StyleId = 'modern' | 'scandinavian' | 'industrial' | 'vintage';

interface ModelSource {
  /** Archive path relative to the asset drop. The first path segment is the style. */
  archive: string;
  /** Output slug; the GLB, the product and the photo are all named after it. */
  name: string;
  /** Procedural archetype the layout engine places this as. */
  kind: string;
  /** The product's name as the partner sells it. */
  displayName: string;
  /** Georgian catalogue name. */
  nameKa: string;
  /** Preview render under `_PREVIEWS/`, used as the product photo. */
  preview: string;
  /** A better photo already extracted under public/uploads/furniture, if there is one. */
  photo?: string;
  /** Which OBJ groups make up one product. Omit for the automatic "largest and what touches it". */
  groups?: GroupSelection;
  /** Substring that picks the right .obj when an archive holds several. */
  objMatch?: string;
  /**
   * Approximate width × depth × height in cm. A hint, not the truth: used to pick the
   * orientation and the source units. The stored dimensions come from the geometry.
   */
  targetSizeCm: [number, number, number];
  /**
   * Scale the model so its largest axis matches `targetSizeCm` instead of reading the file's
   * units. For archives authored in no recognisable unit — the classic bed is 6134 units long,
   * which is not millimetres, centimetres, inches or metres of anything.
   */
  sizeFromTarget?: true;
  priceGel: number;
  storeSlug: string;
  /** Pin a texture role to a filename when the classifier gets it wrong; 'none' leaves it empty. */
  maps?: { albedo?: string; normal?: string; roughness?: string };
  /** Base colour when the archive has no albedo map. */
  colorHex?: string;
  targetTriangles?: number;
  /** Size ceiling for this model alone, when it is worth more bytes than the default cap. */
  maxBytes?: number;
  /** Extra rotation about Y, in degrees — which way a chair faces is not measurable. */
  yawDegrees?: number;
  /** Extra material tuning. */
  roughness?: number;
  metalness?: number;
}

/**
 * Everything in the drop that is furniture with an OBJ export. Floor and wall archives are
 * material sets (handled by `extract-assets.sh`), and `.max`-only archives cannot be read.
 *
 * The Fillmore armchair is deliberately absent: its OBJ export is a collapsed slab with a
 * cushion on top, not a chair.
 */
const SOURCES: ModelSource[] = [
  // --- INDUSTRIAL ---------------------------------------------------------
  {
    archive: 'INDUSTRIAL/bed/bed-woody-cgmood.zip',
    name: 'woody-bed',
    kind: 'bed_double',
    displayName: 'Woody',
    nameKa: 'საწოლი „Woody" 180×200',
    preview: 'INDUSTRIAL/bed/bed woody 1 ~bed-woody-cgmood.jpg',
    photo: 'ind-bed-woody.jpg',
    targetSizeCm: [180, 236, 99],
    priceGel: 3150,
    storeSlug: 'loft-42',
    colorHex: '#C8B79A',
  },
  {
    archive: 'INDUSTRIAL/chair/4358978.62de71a52ae8c.rar',
    name: 'meccanica-chair',
    kind: 'dining_chair',
    displayName: 'MECCANICA chair with armrests',
    nameKa: 'სკამი „MECCANICA" ტყავის',
    preview: 'INDUSTRIAL/chair/MECCANICA CHAIR WITH ARMRESTS ~4358978.62de71a5.jpg',
    groups: { include: /Brown/ },
    targetSizeCm: [61, 60, 80],
    priceGel: 690,
    storeSlug: 'loft-42',
  },
  {
    archive: 'INDUSTRIAL/light/4645454.636e6aab16513.rar',
    name: 'cinquanta-lamp',
    kind: 'pendant',
    displayName: 'VV Cinquanta suspension lamp',
    nameKa: 'ჭაღი „VV Cinquanta" ორმკლავიანი',
    preview: 'INDUSTRIAL/light/VV Cinquanta Suspension Lamp ~4645454.636e6aab.jpg',
    targetSizeCm: [200, 15, 160],
    priceGel: 1890,
    storeSlug: 'lumina',
    colorHex: '#2B2D31',
    metalness: 0.7,
    roughness: 0.35,
  },
  {
    archive: 'INDUSTRIAL/sofa/3906217.61dd818b554e0.rar',
    name: 'node-sofa',
    kind: 'sofa_3seat',
    displayName: 'LaCividina NODE',
    nameKa: 'მოდულური დივანი „NODE"',
    preview: 'INDUSTRIAL/sofa/LaCividina NODE 01 ~3906217.61dd818b.jpg',
    photo: 'ind-node-sofa.jpg',
    targetSizeCm: [360, 182, 72],
    priceGel: 4800,
    storeSlug: 'loft-42',
    // The archive carries a weave normal map and two grey maps but no colour; the partner's
    // render is a clay pass. Anthracite is what La Cividina sells most of these in.
    colorHex: '#4A4A48',
  },
  {
    archive: 'INDUSTRIAL/sofa/8178937.6900e49d8609f.zip',
    name: 'swivel-accent-chair',
    kind: 'armchair',
    displayName: 'Zara Home swivel accent chair',
    nameKa: 'სავარძელი „Swivel" მბრუნავი',
    preview: 'INDUSTRIAL/sofa/SWIVEL ACCENT CHAIR By ZARA HOME ~8178937.6900e49d.jpg',
    // _002–_006 are colour-swatch cubes sitting inside the chair's bounding box.
    groups: { exclude: /_00[2-6]$/ },
    targetSizeCm: [73, 90, 64],
    priceGel: 1450,
    storeSlug: 'loft-42',
    // -001 is the cream bouclé, which the classifier reads as a grey roughness map.
    maps: { albedo: 'SWIVEL ACCENT CHAIR By ZARA HOME-001.jpg', normal: 'SWIVEL ACCENT CHAIR By ZARA HOME-003.jpg', roughness: 'none' },
  },
  {
    archive: 'INDUSTRIAL/sofa/8760785.69fdba0010cdc.zip',
    name: 'industrial-divan',
    kind: 'sofa_corner',
    displayName: 'Divan Industrial',
    nameKa: 'კუთხის დივანი „Industrial"',
    preview: 'INDUSTRIAL/sofa/divan Industrial ~8760785.69fdba00.jpg',
    targetSizeCm: [270, 170, 80],
    priceGel: 4250,
    storeSlug: 'loft-42',
    // -001 is grey fabric; the render is a clay pass so there is no colour to check against.
    maps: { albedo: 'divan Industrial-001.jpg', normal: 'divan Industrial-004.jpg', roughness: 'none' },
  },
  {
    archive: 'INDUSTRIAL/table/barcelona-table-by-mies-van-der-rohe-cgmood.rar',
    name: 'barcelona-table',
    kind: 'coffee_table',
    displayName: 'Barcelona table',
    nameKa: 'ჟურნალის მაგიდა „Barcelona"',
    preview: 'INDUSTRIAL/table/BarcelonaTable CGmood ~barcelona-table-.jpg',
    photo: 'ind-barcelona-table.jpg',
    // Box007 is the base, Box008 the top; Cylinder037 is a vase left on it, Mesh008 a shadow.
    groups: { include: /^Box00[78]$/ },
    targetSizeCm: [102, 102, 44],
    priceGel: 2350,
    storeSlug: 'loft-42',
    maps: { albedo: 'TableTopD.jpg' },
  },

  // --- SCANDINAVIAN -------------------------------------------------------
  {
    archive: 'SCANDINAVIAN/chair/2589065.5db1ef299fa33.rar',
    name: 'vadehavet-daybed',
    kind: 'bed_single',
    displayName: 'JYSK VADEHAVET daybed',
    nameKa: 'დღის საწოლი „VADEHAVET"',
    preview: 'SCANDINAVIAN/chair/JYSK VADEHAVET ~2589065.5db1ef29.jpg',
    targetSizeCm: [95, 200, 60],
    priceGel: 1650,
    storeSlug: 'nordic-home',
    // Four placeholder materials (oak frame, plaid mattress, cushions, metal); with one
    // material the oak frame is the least wrong thing to show everywhere.
    maps: { albedo: 'oak_natural_dif.jpg', normal: 'none', roughness: 'none' },
  },
  {
    archive: 'SCANDINAVIAN/chair/8573013.69a71e432c5e8.zip',
    name: 'ash-wood-chair',
    kind: 'dining_chair',
    displayName: 'Zara Home ash wood chair',
    nameKa: 'სკამი „Ash" იფნის',
    preview: 'SCANDINAVIAN/chair/Zara Home The ash wood chair max2019 ~8573013.69a71e43.jpg',
    targetSizeCm: [43, 46, 72],
    priceGel: 480,
    storeSlug: 'nordic-home',
    // bamboo_1_b is a bump map for the seat cord; as roughness it whites the whole chair out.
    maps: { albedo: 'Wood_Veneer_2_d.jpg', normal: 'Wood_Veneer_2_n.jpg', roughness: 'none' },
  },
  {
    archive: 'SCANDINAVIAN/light/2736460.5e60a822be935.rar',
    name: 'ferm-socket-pendant',
    kind: 'pendant',
    displayName: 'Ferm Living Socket pendant',
    nameKa: 'ჭაღი „Socket" სპილენძის',
    preview: 'SCANDINAVIAN/light/0 ~2736460.5e60a822.jpg',
    photo: 'sca-pendant.jpg',
    // Nine pendants in a row; _08 is the shortest drop, which suits a 2.8 m ceiling.
    groups: { include: /_08$/ },
    targetSizeCm: [15, 15, 109],
    priceGel: 420,
    storeSlug: 'lumina',
    colorHex: '#B08D57',
    metalness: 0.85,
    roughness: 0.3,
  },
  {
    archive: 'SCANDINAVIAN/sofa/633192.57da02641c86b.rar',
    name: 'cloud-sofa',
    kind: 'sofa_3seat',
    displayName: 'RH Cloud modular sofa',
    nameKa: 'დივანი „Cloud" მოდულური',
    preview: 'SCANDINAVIAN/sofa/TheCloud ~633192.57da02641.jpg',
    targetSizeCm: [290, 83, 55],
    priceGel: 5200,
    storeSlug: 'nordic-home',
    maps: { albedo: 'fabric1.jpg', normal: 'normal.jpg' },
  },
  {
    archive: 'SCANDINAVIAN/table/4696375.6387c6103a038.zip',
    name: 'cayden-dining-table',
    kind: 'dining_table',
    displayName: 'CAYDEN campaign extension dining table',
    nameKa: 'სასადილო მაგიდა „CAYDEN"',
    preview: 'SCANDINAVIAN/table/CAYDEN CAMPAIGN RECTANGULAR EXTENSION DINING TAB 1 ~4696375.6387c610.jpg',
    photo: 'sca-dining-table.jpg',
    // Four tables and three shadow planes; _002 is one complete table.
    groups: { include: /_002$/ },
    targetSizeCm: [279, 107, 76],
    priceGel: 2650,
    storeSlug: 'nordic-home',
  },

  // --- VINTAGE ------------------------------------------------------------
  {
    archive: 'VINTAGE/bed/Queen_Size_Bed_With_Paprika_Sheets_White6c4fea1a-2d1f-4957-8d29-e7cddb1a37d2.zip',
    name: 'queen-bed',
    kind: 'bed_double',
    displayName: 'Queen size bed, paprika sheets',
    nameKa: 'საწოლი „Queen" 160×200',
    preview: 'VINTAGE/bed/Queen Size Bed With Paprika Sheets White V1 ~Queen_Size_Bed_W.jpg',
    targetSizeCm: [166, 212, 100],
    priceGel: 2450,
    storeSlug: 'antikvari',
    colorHex: '#E9E2D6',
  },
  {
    archive: 'VINTAGE/bed/fgqbdk2mha-Bed.zip',
    name: 'vintage-bed',
    kind: 'bed_single',
    displayName: 'Classic bed',
    nameKa: 'საწოლი „კლასიკა" 120×200',
    preview: 'VINTAGE/bed/BED ~fgqbdk2mha-Bed.jpg',
    photo: 'vin-bed.png',
    // Authored in no recognisable unit (6134 along the length); the mattress inside measures
    // 195 × 121 once the frame is scaled to a real bed, so this is a 120-wide bed.
    sizeFromTarget: true,
    targetSizeCm: [133, 212, 73],
    priceGel: 2150,
    storeSlug: 'antikvari',
    colorHex: '#6E4526',
  },
  {
    archive: 'VINTAGE/chair/3188253.5fe4b9858ed60.rar',
    name: 'rattan-peacock-chair',
    kind: 'armchair',
    displayName: 'Rattan peacock chair',
    nameKa: 'სავარძელი „Peacock" როტანგის',
    preview: 'VINTAGE/chair/Rattan Chair 1 ~3188253.5fe4b985.jpg',
    photo: 'vin-rattan-chair.jpg',
    // One chair in 193 groups: three layers of back weave, the cushion, the base rings, fifty
    // spindle strips and every binding bead. Nothing in the archive is not the chair, and the
    // automatic rule would drop the base rings because they sit 25 units below the back.
    groups: { include: /^Rattan_Chair/ },
    // Arbitrary units (104 tall): scaled to what a peacock chair is.
    sizeFromTarget: true,
    targetSizeCm: [98, 98, 145],
    priceGel: 1980,
    storeSlug: 'antikvari',
    // The weave is ~60k closed cane segments; the simplifier's floor is ~260k triangles no
    // matter the error, and even meshopt's Prune flag only shaves it to 240k. So it keeps
    // its triangles and leans on compression, with a ceiling of its own.
    targetTriangles: 300_000,
    maxBytes: 3_200 * 1024,
    maps: { albedo: 'Rattan Chair-bambo_diff.jpg', normal: 'Rattan Chair-fabric_normal.jpg' },
  },
  {
    archive: 'VINTAGE/sofa/2441549.5cda96202f392.rar',
    name: 'ektorp-sofa',
    kind: 'sofa_3seat',
    displayName: 'EKTORP sofa',
    nameKa: 'დივანი „EKTORP"',
    preview: 'VINTAGE/sofa/EKTORP ~2441549.5cda9620.jpg',
    // The sofa plus its three throw pillows; the rest is swatch cubes and a base plane.
    groups: { include: /^(EKTORP|Plane1(07|08|22))$/ },
    targetSizeCm: [180, 92, 88],
    priceGel: 2790,
    storeSlug: 'antikvari',
    // The fabric is grey, which is also what a roughness map looks like — keep it as colour only.
    maps: { albedo: 'Gray Fabrik.jpg', roughness: 'none' },
  },
  {
    archive: 'VINTAGE/table/4508094.63272a3523a64.zip',
    name: 'cupola-side-table',
    kind: 'nightstand',
    displayName: 'CUPOLA carved round side table',
    nameKa: 'გვერდითი მაგიდა „CUPOLA"',
    preview: 'VINTAGE/table/CUPOLA CARVED ROUND SIDE TABLE 1 ~4508094.63272a35.jpg',
    groups: { include: /_001$/ },
    targetSizeCm: [56, 56, 55],
    priceGel: 780,
    storeSlug: 'antikvari',
    // -002 is the travertine the render shows; -001 is the marble variant; -2013 is the render.
    maps: { albedo: 'CUPOLA CARVED ROUND SIDE TABLE-002.jpg', roughness: 'CUPOLA CARVED ROUND SIDE TABLE-003.jpg' },
  },
];

// ---------------------------------------------------------------------------

/** A model deliberately rejected — wrong shape, too heavy. A decision, not a failure. */
class Rejected extends Error {}

export interface ManifestModel {
  url: string;
  name: string;
  style: StyleId;
  kind: string;
  displayName: string;
  nameKa: string;
  /** Measured from the geometry, in cm. */
  widthCm: number;
  depthCm: number;
  heightCm: number;
  priceGel: number;
  storeSlug: string;
  imageUrl: string | null;
  colorHex: string | null;
  triangles: number;
  bytes: number;
  textures: string[];
  /** Stock models read as several styles; partner models carry the one their folder says. */
  styles?: StyleId[];
  source?: 'partner' | 'polyhaven' | 'kenney';
  license?: string;
  brand?: string;
}

interface Outcome {
  name: string;
  model?: ManifestModel;
  error?: string;
  rejected?: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);
  const source = args.find((a) => !a.startsWith('--')) ?? DEFAULT_SOURCE;
  if (!existsSync(source)) {
    console.error(`✗ asset drop not found: ${source}\n  pass its path as the first argument`);
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(PHOTO_DIR, { recursive: true });
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;

  const entries = only ? SOURCES.filter((e) => only.includes(e.name)) : SOURCES;
  if (only && entries.length !== only.length) {
    const known = new Set(SOURCES.map((e) => e.name));
    console.error(`✗ unknown model(s): ${only.filter((n) => !known.has(n)).join(', ')}`);
    process.exit(1);
  }

  const outcomes: Outcome[] = [];
  for (const entry of entries) {
    process.stdout.write(`→ ${entry.name.padEnd(24)}`);
    try {
      const model = await convertOne(source, entry);
      outcomes.push({ name: entry.name, model });
      console.log(
        `${String(model.triangles).padStart(6)} tris  ${(model.bytes / 1024).toFixed(0).padStart(5)} KB  ` +
          `${model.widthCm}×${model.depthCm}×${model.heightCm} cm  ` +
          `[${model.textures.join(', ') || 'colour only'}]`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcomes.push({ name: entry.name, error: message, rejected: error instanceof Rejected });
      console.log(`  ✗ ${message.split('\n')[0]}`);
    }
  }

  let models = outcomes.flatMap((o) => (o.model ? [o.model] : []));
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  if (only && existsSync(manifestPath)) {
    // A partial run replaces just its own entries; everything else in the manifest stands.
    // An entry that was attempted and rejected drops out — its GLB is gone, so must its row.
    const previous = (JSON.parse(await readFile(manifestPath, 'utf8')) as { models: ManifestModel[] }).models;
    const redone = new Set(entries.map((e) => e.name));
    const order = new Map(SOURCES.map((e, i) => [e.name, i]));
    models = [...previous.filter((m) => !redone.has(m.name)), ...models].sort(
      (a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999)
    );
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        note: 'Written by scripts/convert-models.ts. Every model is a real partner product: unit-sized, Y-up, width along X, with its own PBR maps where the archive carried them. Dimensions were measured from the geometry.',
        models,
      },
      null,
      2
    )}\n`
  );

  const total = models.reduce((sum, m) => sum + m.bytes, 0) / 1024 / 1024;
  console.log(`\n${models.length}/${only ? models.length : SOURCES.length} in manifest · ${total.toFixed(1)} MB · ${path.relative(ROOT, OUT_DIR)}`);
  const byStyle = models.reduce<Record<string, number>>((acc, m) => ((acc[m.style] = (acc[m.style] ?? 0) + 1), acc), {});
  console.log(`  per style: ${Object.entries(byStyle).map(([s, n]) => `${s} ${n}`).join(' · ')}`);

  const rejected = outcomes.filter((o) => o.rejected);
  if (rejected.length) {
    console.log(`\n${rejected.length} rejected:\n${rejected.map((o) => `  · ${o.name} — ${o.error}`).join('\n')}`);
  }
  const failed = outcomes.filter((o) => o.error && !o.rejected);
  if (failed.length) {
    console.log(`\n${failed.length} failed:\n${failed.map((o) => `  · ${o.name} — ${o.error}`).join('\n')}`);
    process.exitCode = 1;
  }
  console.log('\nSeed the catalogue with:  pnpm models:seed');
}

// ---------------------------------------------------------------------------
// One model
// ---------------------------------------------------------------------------

async function convertOne(sourceRoot: string, entry: ModelSource): Promise<ManifestModel> {
  const archive = path.join(sourceRoot, entry.archive);
  if (!existsSync(archive)) throw new Error(`archive missing: ${entry.archive}`);
  const style = entry.archive.split('/')[0].toLowerCase() as StyleId;

  const work = await mkdtemp(path.join(os.tmpdir(), 'rr-model-'));
  try {
    // --- geometry ---------------------------------------------------------
    const { objPath, images } = await extractArchive(work, archive, entry.objMatch);
    if (!objPath) throw new Error('no .obj inside the archive');

    const groups = await readGroups(objPath);
    const kept = chooseGroups(groups, entry.groups);
    if (kept.length === 0) throw new Error('group selection matched nothing');

    const filtered = path.join(work, 'product.obj');
    await writeFilteredObj(objPath, filtered, kept);

    const glb = (await obj2gltf(filtered, { binary: true })) as Buffer;
    const io = new NodeIO()
      .registerExtensions([KHRMeshQuantization, EXTMeshoptCompression])
      .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
    const doc = await io.readBinary(new Uint8Array(glb));

    const sourceTriangles = countTriangles(doc);
    dropUnusedAttributes(doc); // keeps TEXCOORD_0 — the maps need it
    stripMaterials(doc);

    await doc.transform(dedup(), join(), weld());

    const target = entry.targetTriangles ?? TARGET_TRIANGLES;
    for (const error of [0.004, 0.012, 0.03, 0.08]) {
      const current = countTriangles(doc);
      if (current <= target * 1.2) break;
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / current, error }));
    }
    await doc.transform(prune());

    // --- orientation, units, size -----------------------------------------
    const measured = normalise(doc, entry);
    const aspectError = shapeError(measured.size, entry.targetSizeCm);
    if (aspectError > MAX_ASPECT_ERROR) {
      throw new Rejected(
        `shape does not match (aspect error ${aspectError.toFixed(2)}) — check the group selection`
      );
    }
    const dims = realDimensionsCm(measured.size, entry.targetSizeCm, entry.sizeFromTarget ?? false);

    // --- materials --------------------------------------------------------
    const textures = await applyMaterial(doc, entry, images, work);

    // Quantise and compress. EXT_meshopt_compression is what makes a 240k-triangle weave
    // shippable at all; on ordinary models it takes 3–5× off. The viewer decodes it with
    // three's MeshoptDecoder.
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

    // --- write ------------------------------------------------------------
    const out = path.join(OUT_DIR, `${entry.name}.glb`);
    await io.write(out, doc);
    const { size } = await stat(out);
    if (size > (entry.maxBytes ?? MAX_BYTES)) {
      await rm(out, { force: true });
      throw new Rejected(`too heavy (${(size / 1024 / 1024).toFixed(1)} MB after decimation)`);
    }

    const imageUrl = await placePhoto(sourceRoot, entry);

    return {
      url: `/models/${entry.name}.glb`,
      name: entry.name,
      style,
      kind: entry.kind,
      displayName: entry.displayName,
      nameKa: entry.nameKa,
      widthCm: dims[0],
      depthCm: dims[1],
      heightCm: dims[2],
      priceGel: entry.priceGel,
      storeSlug: entry.storeSlug,
      imageUrl,
      colorHex: entry.colorHex ?? null,
      triangles: countTriangles(doc),
      bytes: size,
      textures,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Archive extraction
// ---------------------------------------------------------------------------

/**
 * Pulls the geometry and every candidate texture out of an archive, one member at a time.
 *
 * A whole-archive extract aborts when any single member fails to decode, and several of
 * these archives have one. Per-member extraction shrugs that off, and it also lets a TIFF —
 * which nothing downstream can read — be converted through `sips` on the way in.
 */
async function extractArchive(
  work: string,
  archive: string,
  objMatch?: string
): Promise<{ objPath: string | null; images: string[] }> {
  const { stdout } = await run('tar', ['-tf', archive], { maxBuffer: 1 << 28 });
  const members = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.includes('__MACOSX') && !path.basename(l).startsWith('.'));

  let objs = members.filter((m) => m.toLowerCase().endsWith('.obj'));
  if (objMatch) {
    const narrowed = objs.filter((m) => m.toLowerCase().includes(objMatch.toLowerCase()));
    if (narrowed.length) objs = narrowed;
  }
  const imageMembers = members.filter((m) => /\.(jpe?g|png|tiff?)$/i.test(m));

  const extract = async (member: string) => {
    try {
      await run('tar', ['-xf', archive, member], { cwd: work, maxBuffer: 1 << 28 });
      return path.join(work, member);
    } catch {
      return null;
    }
  };

  let objPath: string | null = null;
  let objSize = -1;
  for (const member of objs) {
    const file = await extract(member);
    if (!file) continue;
    const { size } = await stat(file);
    if (size > objSize) {
      objSize = size;
      objPath = file;
    }
  }

  const images: string[] = [];
  for (const member of imageMembers) {
    const file = await extract(member);
    if (!file) continue;
    if (/\.tiff?$/i.test(file)) {
      const converted = `${file}.jpg`;
      try {
        await run('sips', ['-s', 'format', 'jpeg', file, '--out', converted]);
        images.push(converted);
      } catch {
        // an unreadable TIFF is just a map we do not get
      }
    } else {
      images.push(file);
    }
  }

  return { objPath, images };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/**
 * Dresses the model in its own maps.
 *
 * One material for the whole product. The archives give no way to tell which map belongs to
 * which part — the .mtl references none of them — so the dominant material is applied to
 * everything: the fabric on a sofa, the veneer on a chair. That is a compromise, but it is the
 * partner's actual fabric, and it is a long way from a flat colour.
 *
 * Roughness lands in the green channel of a packed metallic-roughness texture, as glTF wants
 * it; a gloss map is inverted into roughness on the way.
 */
async function applyMaterial(
  doc: Document,
  entry: ModelSource,
  images: string[],
  work: string
): Promise<string[]> {
  const classified = await classifyMaps(images);
  const auto = pickMaps(classified);

  const find = (name?: string) =>
    name ? images.find((f) => path.basename(f).toLowerCase() === name.toLowerCase()) : undefined;
  const pick = (override: string | undefined, fallback: string | undefined, taken: (string | undefined)[]) => {
    if (override === 'none') return undefined;
    if (override) {
      const found = find(override);
      if (!found) throw new Error(`map "${override}" is not in the archive`);
      return found;
    }
    // One file, one job: the albedo must not double as its own roughness map.
    return taken.includes(fallback) ? undefined : fallback;
  };

  const albedo = pick(entry.maps?.albedo, auto.albedo, []);
  const normal = pick(entry.maps?.normal, auto.normal, [albedo]);
  const roughness = pick(entry.maps?.roughness, auto.roughness, [albedo, normal]);
  const roughnessIsGloss = !entry.maps?.roughness && auto.roughnessIsGloss;

  for (const m of classified) {
    if (m.role !== 'ignore' && process.env.MODELS_VERBOSE) {
      console.log(`\n      ${m.role.padEnd(9)} ${path.basename(m.file)}  (${m.reason})`);
    }
  }

  const material = doc.createMaterial('product');
  material.setMetallicFactor(entry.metalness ?? 0);
  material.setRoughnessFactor(entry.roughness ?? 0.85);
  material.setBaseColorFactor(hexToRgba(entry.colorHex ?? '#DDD8CF'));
  material.setDoubleSided(false);

  const used: string[] = [];

  if (albedo) {
    material.setBaseColorTexture(await embed(doc, albedo, work, 'albedo', 'jpeg'));
    // With a real albedo the base colour is a multiplier, so leave it white.
    material.setBaseColorFactor([1, 1, 1, 1]);
    used.push(`albedo:${path.basename(albedo)}`);
  }
  if (normal) {
    material.setNormalTexture(await embed(doc, normal, work, 'normal', 'jpeg'));
    material.setNormalScale(0.8);
    used.push(`normal:${path.basename(normal)}`);
  }
  if (roughness) {
    material.setMetallicRoughnessTexture(await embedRoughness(doc, roughness, work, roughnessIsGloss));
    material.setRoughnessFactor(1);
    used.push(`${roughnessIsGloss ? 'roughness(gloss)' : 'roughness'}:${path.basename(roughness)}`);
  }

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) prim.setMaterial(material);
  }
  return used;
}

/** Downscales a map to TEXTURE_PX and embeds it. */
async function embed(
  doc: Document,
  file: string,
  work: string,
  label: string,
  format: 'jpeg'
): Promise<Texture> {
  const small = path.join(work, `${label}.jpg`);
  await run('sips', ['-s', 'format', format, '-s', 'formatOptions', '80', '-Z', String(TEXTURE_PX), file, '--out', small]);
  const data = await readFile(small);
  return doc.createTexture(label).setImage(new Uint8Array(data)).setMimeType('image/jpeg');
}

/**
 * Packs a grey roughness (or gloss) map into glTF's metallic-roughness layout: roughness in
 * G, metallic (zero) in B.
 */
async function embedRoughness(
  doc: Document,
  file: string,
  work: string,
  invert: boolean
): Promise<Texture> {
  const small = path.join(work, 'rough-src.jpg');
  await run('sips', ['-s', 'format', 'jpeg', '-Z', String(TEXTURE_PX), file, '--out', small]);
  const decoded = jpeg.decode(await readFile(small), { useTArray: true });

  const out = Buffer.alloc(decoded.width * decoded.height * 4);
  for (let i = 0; i < decoded.width * decoded.height; i++) {
    const grey = decoded.data[i * 4];
    const rough = invert ? 255 - grey : grey;
    out[i * 4] = 255;
    out[i * 4 + 1] = rough;
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = 255;
  }
  const encoded = jpeg.encode({ data: out, width: decoded.width, height: decoded.height }, 85);
  return doc.createTexture('roughness').setImage(new Uint8Array(encoded.data)).setMimeType('image/jpeg');
}

function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  // glTF base colour is linear; the palette hex is sRGB.
  const linear = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return [linear[0], linear[1], linear[2], 1];
}

/** Every material the archive came with is a placeholder; drop them all. */
function stripMaterials(doc: Document): void {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) prim.setMaterial(null);
  }
  for (const material of doc.getRoot().listMaterials()) material.dispose();
  for (const texture of doc.getRoot().listTextures()) texture.dispose();
}

/** Keeps POSITION and TEXCOORD_0; vertex colours and extra UV sets are dead weight. */
function dropUnusedAttributes(doc: Document): void {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const name of prim.listSemantics()) {
        if (name === 'POSITION' || name === 'TEXCOORD_0') continue;
        prim.setAttribute(name, null);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Orientation and scale
// ---------------------------------------------------------------------------

type Bounds = { min: number[]; max: number[] };
type Candidate = { xRot: boolean; zRot: boolean; yRot: boolean; bounds: Bounds };

const sizeOf = (b: Bounds) => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const rotX = (b: Bounds): Bounds => ({ min: [b.min[0], b.min[2], -b.max[1]], max: [b.max[0], b.max[2], -b.min[1]] });
const rotY = (b: Bounds): Bounds => ({ min: [b.min[2], b.min[1], -b.max[0]], max: [b.max[2], b.max[1], -b.min[0]] });
const rotZ = (b: Bounds): Bounds => ({ min: [-b.max[1], b.min[0], b.min[2]], max: [-b.min[1], b.max[0], b.max[2]] });

/**
 * Puts the model in the app's frame — Y up, width along X — and scales it to a unit box.
 *
 * 3ds Max is Z-up, obj2gltf sometimes corrects for that and sometimes does not, and no
 * bounding box can tell a table lying down from a rug. So all eight right-angle orientations
 * are scored against the proportions of the product this is *meant* to be, and the closest
 * wins. Returns the model's extents in its own units, in that final frame, so the caller can
 * work out the real size.
 */
function normalise(doc: Document, entry: ModelSource): { size: number[] } {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) throw new Error('no scene');
  const raw = getBounds(scene) as Bounds;
  if (!Number.isFinite(raw.min[0])) throw new Error('empty geometry');

  const candidates: Candidate[] = [];
  for (const xRot of [false, true]) {
    const afterX = xRot ? rotX(raw) : raw;
    for (const zRot of [false, true]) {
      const afterZ = zRot ? rotZ(afterX) : afterX;
      for (const yRot of [false, true]) {
        candidates.push({ xRot, zRot, yRot, bounds: yRot ? rotY(afterZ) : afterZ });
      }
    }
  }

  const [w, d, h] = entry.targetSizeCm;
  const target = normaliseTriple([w, h, d]);
  let best = candidates[0];
  let bestError = Infinity;
  for (const c of candidates) {
    const shape = normaliseTriple(sizeOf(c.bounds));
    const error = shape.reduce((sum, v, i) => sum + Math.abs(v - target[i]), 0);
    if (error < bestError) {
      bestError = error;
      best = c;
    }
  }

  const bounds = best.bounds;
  const size = sizeOf(bounds);
  const scale = 1 / (Math.max(...size) || 1);

  // Nested so the rotations compose in the order the bounds were computed: X, then Z, then Y.
  const spin = doc.createNode('upright');
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    spin.addChild(child);
  }
  if (best.xRot) spin.setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);

  const tilt = doc.createNode('tilt');
  tilt.addChild(spin);
  if (best.zRot) tilt.setRotation([0, 0, Math.SQRT1_2, Math.SQRT1_2]);

  const face = doc.createNode('facing');
  face.addChild(tilt);
  const yaw = ((best.yRot ? 90 : 0) + (entry.yawDegrees ?? 0)) * (Math.PI / 180);
  if (yaw !== 0) face.setRotation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);

  const place = doc.createNode('normalised');
  place.addChild(face);
  place.setScale([scale, scale, scale]);
  place.setTranslation([
    (-(bounds.min[0] + bounds.max[0]) / 2) * scale,
    -bounds.min[1] * scale,
    (-(bounds.min[2] + bounds.max[2]) / 2) * scale,
  ]);
  scene.addChild(place);

  return { size };
}

function shapeError(size: number[], targetCm: [number, number, number]): number {
  const [w, d, h] = targetCm;
  const target = normaliseTriple([w, h, d]);
  const shape = normaliseTriple(size);
  return shape.reduce((sum, v, i) => sum + Math.abs(v - target[i]), 0);
}

/**
 * The product's real size, from the geometry.
 *
 * The archives disagree about units — most are millimetres, the Woody bed is centimetres, the
 * peacock chair is inches. Each candidate unit is tried and the one that lands the model's
 * largest extent nearest the hint wins; the hint only has to be in the right order of
 * magnitude.
 */
function realDimensionsCm(
  size: number[],
  targetCm: [number, number, number],
  sizeFromTarget: boolean
): [number, number, number] {
  const [x, y, z] = size; // width, height, depth in model units
  const largest = Math.max(x, y, z);
  const targetLargest = Math.max(...targetCm);

  if (sizeFromTarget) {
    const factor = targetLargest / largest;
    return [Math.round(x * factor), Math.round(z * factor), Math.round(y * factor)];
  }

  const unitsToCm: Array<[string, number]> = [
    ['mm', 0.1],
    ['cm', 1],
    ['in', 2.54],
    ['m', 100],
  ];
  let bestFactor = 1;
  let bestError = Infinity;
  for (const [, factor] of unitsToCm) {
    const error = Math.abs(Math.log(largest * factor) - Math.log(targetLargest));
    if (error < bestError) {
      bestError = error;
      bestFactor = factor;
    }
  }

  return [Math.round(x * bestFactor), Math.round(z * bestFactor), Math.round(y * bestFactor)];
}

function normaliseTriple(values: number[]): number[] {
  const largest = Math.max(...values) || 1;
  return values.map((v) => v / largest);
}

function countTriangles(doc: Document): number {
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      total += Math.floor((indices?.getCount() ?? position?.getCount() ?? 0) / 3);
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Product photo
// ---------------------------------------------------------------------------

/** Copies the product's photo into uploads: a real render if we have one, else the preview. */
async function placePhoto(sourceRoot: string, entry: ModelSource): Promise<string | null> {
  const existing = entry.photo ? path.join(PHOTO_DIR, entry.photo) : null;
  if (existing && existsSync(existing)) return `/uploads/furniture/${entry.photo}`;

  const preview = path.join(sourceRoot, '_PREVIEWS', entry.preview);
  if (!existsSync(preview)) return null;

  const dest = path.join(PHOTO_DIR, `${entry.name}.jpg`);
  await copyFile(preview, dest);
  try {
    await run('sips', ['-Z', '900', dest]);
  } catch {
    // keep the full-size copy
  }
  return `/uploads/furniture/${entry.name}.jpg`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
