/**
 * The plan's technical equipment as catalogue products — electrical panels, a gas boiler, a
 * water heater, air conditioners, cooker hoods, a bathroom fan, a floor drain — and the TV and
 * data sockets, fetched from their sources, cleaned up, sized and framed for the studio.
 *
 *   pnpm models:equipment                 → public/models/equipment/*.glb + manifest.json
 *                                           + lib/design3d/equipmentManifest.ts (the same data, typed)
 *   pnpm models:equipment --only=ac-9000  → redo a few; merges into the manifest
 *   pnpm models:photos --only=<slugs>     → then the product photos (scripts/model-photos.ts)
 *   pnpm models:seed                      → one product per model
 *
 * Sources — only what may be served publicly on a commercial site, the credit in the manifest:
 *
 *   - Poly Haven (CC0);
 *   - poly.pizza (CC0 and CC-BY 3.0 uploads);
 *   - Sketchfab uploads under CC BY 4.0 (and CC BY-SA 4.0 where nothing else exists), fetched
 *     from the Objaverse mirror on Hugging Face (huggingface.co/datasets/allenai/objaverse),
 *     which needs no account. No NonCommercial, NoDerivatives or "Standard" licences.
 *
 * Every file is re-made here: the kept nodes joined per material and simplified to about
 * TARGET_TRIANGLES, turned so its front is +z and its top +y, scaled uniformly so the
 * dimension that names the product (`fit`) is exactly its catalogue size, the textures WebP at
 * 1024 px (data maps 512 px), meshopt-compressed. Material names are the slug and the source's
 * name, with any word the studio lights up (`LIT_MATERIAL` in lib/design3d/buildStructure.ts)
 * replaced; metalness is capped (the studio has no environment map, so a full metal renders
 * black). Each output stands in its frame, in metres:
 *
 *   - `wall`    standing on y = 0, centred on x, its back on z = 0 and its front along +z;
 *   - `fitting` centred on x and y, its back on z = 0, its front along +z (the sockets of
 *               /models/fixtures);
 *   - `floor`   centred on x and z, its top at y = 0 and everything else below.
 *
 * The script reads back what it wrote and fails an entry that is out of its frame, over the
 * triangle or byte cap, or has a material the studio would light up; a failed entry keeps its
 * previous file and manifest row, if it had them.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from '@gltf-transform/core';
import { dedup, flatten, join, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import {
  bakeNodeTransforms,
  boundsOf,
  compressTextures,
  countTriangles,
  creditOf,
  fetchSource,
  FRAME_TOLERANCE_M,
  hasLitWord,
  linearColor,
  listPrimitives,
  materialName,
  meshNodes,
  newIO,
  simplifyTowards,
  transformAll,
  transformPositions,
  turnFn,
  type Axis,
  type ModelCredit,
  type ModelSource,
} from './lib/gltfPipeline';
import type { StyleId } from '../lib/design/types';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'models', 'equipment');
const TS_OUT = path.join(ROOT, 'lib', 'design3d', 'equipmentManifest.ts');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'renovate-equipment');
const TARGET_TRIANGLES = 6_000;
const MAX_TRIANGLES = 12_000;
const MAX_BYTES = 1.5 * 1024 * 1024;
const COLOUR_TEXTURE_PX = 1024;
const DATA_TEXTURE_PX = 512;
const WEBP_QUALITY = 80;
/** A full metal with no environment to reflect renders black in the studio and the photos. */
const METALNESS_CAP = 0.5;
const ALL: StyleId[] = ['modern', 'scandinavian', 'industrial', 'vintage'];

export type EquipmentFrame = 'wall' | 'fitting' | 'floor';

interface EquipmentEntry {
  slug: string;
  /** What the model is, in English. */
  title: string;
  frame: EquipmentFrame;
  source: ModelSource;
  /** The catalogue size in cm; the model is scaled uniformly so that `fit` is exactly it, the rest follows the geometry. */
  sizeCm: { width: number; height: number; depth: number };
  fit: 'width' | 'height';
  /** Keep only the mesh nodes whose path (node names from the scene down, joined by '/') matches. */
  keep?: RegExp;
  /** Right-handed turns in degrees, applied in order, that bring the front to +z and the top to +y. */
  turn?: Array<[Axis, number]>;
  /** Squash whatever lies behind this z (source units, after turning) onto it: the part of a plate that goes into the wall. */
  clampBehindZ?: number;
  /** Per-material fixes, by the source's material name. */
  materials?: Record<string, { color?: string; metallic?: number; roughness?: number }>;
  /** Why this source (and, for CC BY-SA, why nothing else would do). */
  note?: string;
  product: EquipmentProduct;
}

interface EquipmentProduct {
  kind: string;
  categorySlug: string;
  priceGel: number;
  unit: 'piece';
  storeSlug: string;
  nameKa: string;
  nameEn: string;
  nameRu: string;
  styles: StyleId[];
  /** The order the equipment card offers a kind's products in (1 first). */
  rank?: number;
  /** An air conditioner: the floor area it cools. */
  coverM2?: number;
}

export interface EquipmentManifestModel {
  slug: string;
  /** The product kind (`model3dKind`). */
  kind: string;
  frame: EquipmentFrame;
  url: string;
  /** Measured from the file, to the millimetre. */
  widthCm: number;
  heightCm: number;
  depthCm: number;
  styles: StyleId[];
  title: string;
  triangles: number;
  bytes: number;
  /** The product photo, rendered by `pnpm models:photos`. */
  imageUrl: string;
  source: ModelSource['type'];
  sourceUrl: string;
  author: string;
  license: string;
  /** The attribution the licence asks for (CC-BY and CC-BY-SA models must show it). */
  credit: ModelCredit;
  product: EquipmentProduct;
}

const PP = 'https://static.poly.pizza';

const EQUIPMENT: EquipmentEntry[] = [
  // --- electrical panels ------------------------------------------------------------------
  {
    slug: 'panel-12',
    title: 'Electrical panel (consumer unit), surface-mounted, door closed',
    frame: 'wall',
    source: { type: 'sketchfab', uid: 'f9bd67c84bc84e959b57bd69511f7883', path: 'glbs/000-150/f9bd67c84bc84e959b57bd69511f7883.glb', title: 'Simple Fuse Box', author: 'lightjavacode', license: 'CC-BY 4.0' },
    sizeCm: { width: 26, height: 33, depth: 10 },
    fit: 'height',
    product: { kind: 'electrical_panel', categorySlug: 'electrical-panels', priceGel: 340, unit: 'piece', storeSlug: 'san-plus', nameKa: 'ელექტრო ფარი, 12 მოდული, ავტომატებით', nameEn: 'Electrical panel, 12 modules, with breakers', nameRu: 'Электрощит на 12 модулей, с автоматами', styles: ALL, rank: 1 },
  },
  {
    slug: 'panel-24',
    title: 'Electrical panel (distribution board), metal, open, three rows of breakers',
    frame: 'wall',
    // The file's door hangs open 30 cm into the room; the box alone shows its breakers.
    source: { type: 'polyhaven', id: 'power_box_01' },
    keep: /power_box_01_box$/,
    sizeCm: { width: 32, height: 45, depth: 11 },
    fit: 'height',
    product: { kind: 'electrical_panel', categorySlug: 'electrical-panels', priceGel: 520, unit: 'piece', storeSlug: 'san-plus', nameKa: 'ელექტრო ფარი, 24 მოდული, ავტომატებით და დიფ. ამომრთველით', nameEn: 'Electrical panel, 24 modules, with breakers and an RCD', nameRu: 'Электрощит на 24 модуля, с автоматами и УЗО', styles: ALL, rank: 2 },
  },

  // --- boiler and water heater ------------------------------------------------------------
  {
    slug: 'boiler-combi-24',
    title: 'Wall-hung gas combi boiler',
    frame: 'wall',
    source: { type: 'sketchfab', uid: '2ff78c598c654e36959ed8d3a2c39a43', path: 'glbs/000-103/2ff78c598c654e36959ed8d3a2c39a43.glb', title: 'Gaz water heater', author: '1-3D.com', license: 'CC-BY-SA 4.0' },
    note: 'CC BY-SA: no wall-hung gas boiler under CC0 or CC BY was found on Poly Haven, poly.pizza or the Sketchfab/Objaverse CC BY index; this gas water heater is the same white wall-hung box with a display and knobs.',
    sizeCm: { width: 40, height: 70, depth: 30 },
    fit: 'height',
    product: { kind: 'boiler', categorySlug: 'boilers', priceGel: 1850, unit: 'piece', storeSlug: 'san-plus', nameKa: 'გაზის ორკონტურიანი ქვაბი, 24 kW', nameEn: 'Gas combi boiler, 24 kW', nameRu: 'Газовый двухконтурный котёл, 24 кВт', styles: ALL, rank: 1 },
  },
  {
    slug: 'water-heater-80',
    title: 'Electric water heater (storage), 80 L, vertical',
    frame: 'wall',
    source: { type: 'sketchfab', uid: '2a1edaa43d61499a905f034640e2877a', path: 'glbs/000-143/2a1edaa43d61499a905f034640e2877a.glb', title: 'formax_80L', author: 'rk_m', license: 'CC-BY 4.0' },
    sizeCm: { width: 45, height: 80, depth: 45 },
    fit: 'height',
    product: { kind: 'boiler', categorySlug: 'boilers', priceGel: 540, unit: 'piece', storeSlug: 'san-plus', nameKa: 'ელექტრო წყლის გამაცხელებელი (ბოილერი), 80 ლ', nameEn: 'Electric water heater, 80 L', nameRu: 'Электрический водонагреватель, 80 л', styles: ALL, rank: 2 },
  },

  // --- air conditioners ---------------------------------------------------------------------
  {
    slug: 'ac-9000',
    title: 'Wall split air conditioner, indoor unit (9,000 BTU)',
    frame: 'wall',
    source: { type: 'sketchfab', uid: 'd3a156127b2c478dabc40e3a9597df82', path: 'glbs/000-073/d3a156127b2c478dabc40e3a9597df82.glb', title: 'airconditioner Electrolux Fusion', author: 'rk_m', license: 'CC-BY 4.0' },
    sizeCm: { width: 80, height: 29, depth: 20 },
    fit: 'width',
    product: { kind: 'ac_unit', categorySlug: 'air-conditioners', priceGel: 1190, unit: 'piece', storeSlug: 'san-plus', nameKa: 'კონდიციონერი, ინვერტორული, 9000 BTU (≈25 მ²)', nameEn: 'Inverter air conditioner, 9,000 BTU (≈25 m²)', nameRu: 'Инверторный кондиционер, 9000 BTU (≈25 м²)', styles: ALL, coverM2: 25 },
  },
  {
    slug: 'ac-12000',
    title: 'Wall split air conditioner, indoor unit (12,000 BTU)',
    frame: 'wall',
    source: { type: 'sketchfab', uid: 'da8f719b60e9406fb16c84a0bf404297', path: 'glbs/000-048/da8f719b60e9406fb16c84a0bf404297.glb', title: 'conditioner Electrolux Atrium DC', author: 'rk_m', license: 'CC-BY 4.0' },
    sizeCm: { width: 88, height: 30, depth: 21 },
    fit: 'width',
    product: { kind: 'ac_unit', categorySlug: 'air-conditioners', priceGel: 1490, unit: 'piece', storeSlug: 'san-plus', nameKa: 'კონდიციონერი, ინვერტორული, 12000 BTU (≈35 მ²)', nameEn: 'Inverter air conditioner, 12,000 BTU (≈35 m²)', nameRu: 'Инверторный кондиционер, 12000 BTU (≈35 м²)', styles: ALL, coverM2: 35 },
  },

  // --- cooker hoods ------------------------------------------------------------------------
  {
    slug: 'hood-chimney-60',
    title: 'Chimney cooker hood, 60 cm, stainless steel',
    frame: 'wall',
    source: { type: 'sketchfab', uid: 'e846cb48e88446808af55976ff76b1da', path: 'glbs/000-002/e846cb48e88446808af55976ff76b1da.glb', title: 'Range Hood (Kitchen Hood)', author: 'govindu94', license: 'CC-BY 4.0' },
    sizeCm: { width: 60, height: 75, depth: 50 },
    fit: 'width',
    materials: { Hood_metal: { color: '#c9ccce', metallic: 0.5, roughness: 0.32 } },
    product: { kind: 'cooker_hood', categorySlug: 'cooker-hoods', priceGel: 420, unit: 'piece', storeSlug: 'san-plus', nameKa: 'სამზარეულოს გამწოვი, ბუხრისებრი, 60 სმ', nameEn: 'Chimney cooker hood, 60 cm', nameRu: 'Каминная кухонная вытяжка, 60 см', styles: ALL, rank: 1 },
  },
  {
    slug: 'hood-flat-60',
    title: 'Built-in cooker hood, 60 cm, glass front',
    frame: 'wall',
    source: { type: 'sketchfab', uid: '0be84630c8e84508926c5922c541e1ce', path: 'glbs/000-142/0be84630c8e84508926c5922c541e1ce.glb', title: 'Kitchen Hood Model 3D fbx', author: 'GLOBALO', license: 'CC-BY 4.0' },
    sizeCm: { width: 60, height: 18, depth: 30 },
    fit: 'width',
    product: { kind: 'cooker_hood', categorySlug: 'cooker-hoods', priceGel: 260, unit: 'piece', storeSlug: 'san-plus', nameKa: 'სამზარეულოს გამწოვი, ჩასაშენებელი, 60 სმ', nameEn: 'Built-in cooker hood, 60 cm', nameRu: 'Встраиваемая вытяжка, 60 см', styles: ALL, rank: 2 },
  },

  // --- bathroom fan and floor drain --------------------------------------------------------
  {
    slug: 'fan-100',
    title: 'Bathroom extractor fan, louvred front',
    frame: 'wall',
    source: { type: 'polypizza', id: 'PCqBwDkgAz', url: `${PP}/be927225-dad4-4dd4-b418-6bcfbe17bf52.glb`, title: 'Air Vent', author: 'J-Toastie', license: 'CC-BY 3.0' },
    // The file stands with its louvres facing +x.
    turn: [['y', -90]],
    sizeCm: { width: 15, height: 15, depth: 4 },
    fit: 'width',
    product: { kind: 'bathroom_fan', categorySlug: 'bathroom-fans', priceGel: 65, unit: 'piece', storeSlug: 'san-plus', nameKa: 'აბაზანის გამწოვი ვენტილატორი, Ø100 მმ', nameEn: 'Bathroom extractor fan, Ø100 mm', nameRu: 'Вытяжной вентилятор для ванной, Ø100 мм', styles: ALL, rank: 1 },
  },
  {
    slug: 'drain-15',
    title: 'Floor drain grate, square, stainless steel',
    frame: 'floor',
    source: { type: 'sketchfab', uid: 'd3cb922e9304417bad755b8c7298ff4f', path: 'glbs/000-100/d3cb922e9304417bad755b8c7298ff4f.glb', title: 'Floor Grate Small Pack [Free]', author: 'Jesus Fernandez Garcia', license: 'CC-BY 4.0' },
    // A pack of grates side by side: the clean one, frame and bars in one mesh.
    keep: /\/SM_Grate_1_Clean\/SM_Grate_1_Clean_M_Grate_1_Clean_0$/,
    sizeCm: { width: 15, height: 6, depth: 15 },
    fit: 'width',
    product: { kind: 'floor_drain', categorySlug: 'floor-drains', priceGel: 85, unit: 'piece', storeSlug: 'san-plus', nameKa: 'იატაკის ტრაპი, უჟანგავი, 15×15 სმ', nameEn: 'Floor drain, stainless steel, 15×15 cm', nameRu: 'Трап напольный, нержавеющий, 15×15 см', styles: ALL, rank: 1 },
  },

  // --- TV and data sockets (8 × 8 cm plates, like /models/fixtures) ------------------------
  {
    slug: 'socket-tv',
    title: 'TV socket (coaxial), wall plate, black',
    frame: 'fitting',
    source: { type: 'sketchfab', uid: '6c7bd622341945baa49161751b8c6d1e', path: 'glbs/000-120/6c7bd622341945baa49161751b8c6d1e.glb', title: 'TV Socket', author: 'deslancer', license: 'CC-BY 4.0' },
    // The plate and the connector; the mechanism behind them goes into the wall box.
    keep: /\/Face_0\/|\/mechanism_3\/(Capsule_5|pasted__polySurface45_6)\//,
    clampBehindZ: -0.3,
    sizeCm: { width: 8, height: 8, depth: 2 },
    fit: 'width',
    product: { kind: 'socket_tv', categorySlug: 'tv-sockets', priceGel: 19, unit: 'piece', storeSlug: 'lumina', nameKa: 'ტელევიზორის როზეტი (კოაქსიალური)', nameEn: 'TV socket (coaxial)', nameRu: 'Розетка ТВ (коаксиальная)', styles: ALL, rank: 1 },
  },
  {
    slug: 'socket-data',
    title: 'Data socket (RJ45), wall plate, white',
    frame: 'fitting',
    source: { type: 'sketchfab', uid: 'ded403c85dee45b7ad8a6bcc8c3b2754', path: 'glbs/000-087/ded403c85dee45b7ad8a6bcc8c3b2754.glb', title: 'Wall rj45 plug', author: '1-3D.com', license: 'CC-BY-SA 4.0' },
    note: 'CC BY-SA: the only CC BY RJ45 wall plate found (a US plate with a plain slot) does not read as a data socket.',
    sizeCm: { width: 8, height: 8, depth: 2 },
    fit: 'width',
    product: { kind: 'socket_data', categorySlug: 'data-sockets', priceGel: 27, unit: 'piece', storeSlug: 'lumina', nameKa: 'ინტერნეტის როზეტი (RJ45, Cat 6)', nameEn: 'Data socket (RJ45, Cat 6)', nameRu: 'Розетка интернет (RJ45, Cat 6)', styles: ALL, rank: 1 },
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const entries = only ? EQUIPMENT.filter((e) => only.includes(e.slug)) : EQUIPMENT;
  if (entries.length === 0) throw new Error(`nothing matches --only=${only?.join(',')}`);
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const previous = existsSync(manifestPath) ? (JSON.parse(await readFile(manifestPath, 'utf8')) as { models: EquipmentManifestModel[] }).models : [];
  const models: EquipmentManifestModel[] = [];
  const failed: string[] = [];
  for (const entry of entries) {
    process.stdout.write(`• ${entry.slug} `);
    try {
      const model = await convertOne(entry);
      models.push(model);
      console.log(`✓ ${model.widthCm}×${model.heightCm}×${model.depthCm} cm · ${model.triangles} tris · ${(model.bytes / 1024).toFixed(0)} KB · ${model.license}`);
    } catch (error) {
      failed.push(`${entry.slug} — ${(error as Error).message}`);
      console.log(`✗ ${(error as Error).message}`);
    }
  }

  // Every entry of the list, in its order: the new row, else the previous one (a failed or skipped entry keeps its file and its row).
  const all = EQUIPMENT.map((e) => models.find((m) => m.slug === e.slug) ?? previous.find((m) => m.slug === e.slug)).filter((m): m is EquipmentManifestModel => !!m);
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        note: 'Written by scripts/equipment-models.ts from CC0 / CC-BY / CC-BY-SA sources (see each model’s credit). In metres, front along +z: a wall model stands on y = 0, centred on x, its back on z = 0; a fitting is centred on x and y, its back on z = 0; a floor model is centred on x and z with its top at y = 0.',
        models: all,
      },
      null,
      2
    ) + '\n'
  );
  await writeFile(
    TS_OUT,
    `/**\n * Generated by scripts/equipment-models.ts — do not edit. The technical equipment in\n * public/models/equipment, one model per catalogue product (\`kind\` is the product's\n * model3dKind), in metres with the front along +z:\n *\n *   - 'wall'    stands on y = 0 (its bottom edge), centred on x, its back on z = 0;\n *   - 'fitting' is centred on x and y, its back on z = 0 (the sockets of /models/fixtures);\n *   - 'floor'   is centred on x and z with its top at y = 0, everything else below.\n *\n * Sizes are measured from the files. The models are other people's work under CC0, CC BY or\n * CC BY-SA: \`author\`, \`license\` and \`sourceUrl\` are the credit the licence asks for.\n */\n\nimport type { StyleId } from '@/lib/design/types';\n\nexport type EquipmentFrame = 'wall' | 'fitting' | 'floor';\n\nexport interface EquipmentModel {\n  slug: string;\n  kind: string;\n  frame: EquipmentFrame;\n  url: string;\n  widthCm: number;\n  heightCm: number;\n  depthCm: number;\n  styles: StyleId[];\n  title: string;\n  source: 'polyhaven' | 'polypizza' | 'sketchfab';\n  sourceUrl: string;\n  author: string;\n  license: string;\n}\n\nexport const EQUIPMENT_MODELS: EquipmentModel[] = ${JSON.stringify(
      all.map(({ slug, kind, frame, url, widthCm, heightCm, depthCm, styles, title, source, sourceUrl, author, license }) => ({ slug, kind, frame, url, widthCm, heightCm, depthCm, styles, title, source, sourceUrl, author, license })),
      null,
      2
    )};\n`
  );
  console.log(`\n${all.length} equipment models in manifest · ${path.relative(ROOT, OUT_DIR)}`);
  if (failed.length) {
    console.log(`\n${failed.length} failed:\n${failed.map((f) => `  · ${f}`).join('\n')}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// One model
// ---------------------------------------------------------------------------

async function convertOne(entry: EquipmentEntry): Promise<EquipmentManifestModel> {
  const sourceFile = await fetchSource(CACHE_DIR, entry.source);
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = newIO();
  const doc = await io.read(sourceFile);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));

  // --- the nodes that are the product ---------------------------------------------------------
  if (entry.keep) {
    let kept = 0;
    for (const { node, path: nodePath } of meshNodes(doc)) {
      if (entry.keep.test(nodePath)) kept++;
      else node.setMesh(null);
    }
    if (kept === 0) throw new Error(`keep ${entry.keep} matched no mesh node`);
  }
  // Tangents would not survive the turns below, and three.js does without them.
  for (const prim of listPrimitives(doc)) if (prim.getAttribute('TANGENT')) prim.setAttribute('TANGENT', null);
  await doc.transform(prune(), dedup(), flatten(), join({ keepNamed: false, keepMeshes: false }), weld(), prune());
  bakeNodeTransforms(doc);

  await simplifyTowards(doc, TARGET_TRIANGLES);

  // --- orient -------------------------------------------------------------------------------
  for (const [axis, degrees] of entry.turn ?? []) transformAll(doc, turnFn(axis, degrees));
  if (entry.clampBehindZ !== undefined) {
    const z0 = entry.clampBehindZ;
    transformPositions(doc, (p) => [p[0], p[1], Math.max(p[2], z0)]);
  }

  // --- size ---------------------------------------------------------------------------------
  let b = boundsOf(doc);
  let size = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  const axis = entry.fit === 'width' ? 0 : 1;
  const scale = entry.sizeCm[entry.fit] / 100 / size[axis];
  transformPositions(doc, (p) => [p[0] * scale, p[1] * scale, p[2] * scale]);

  // --- frame --------------------------------------------------------------------------------
  b = boundsOf(doc);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  if (entry.frame === 'wall') transformPositions(doc, (p) => [p[0] - cx, p[1] - b.min[1], p[2] - b.min[2]]);
  else if (entry.frame === 'fitting') transformPositions(doc, (p) => [p[0] - cx, p[1] - cy, p[2] - b.min[2]]);
  else transformPositions(doc, (p) => [p[0] - cx, p[1] - b.max[1], p[2] - cz]);

  // --- materials and textures ---------------------------------------------------------------
  for (const material of doc.getRoot().listMaterials()) {
    const original = material.getName();
    const fix = entry.materials?.[original];
    material.setName(materialName(entry.slug, original));
    if (fix?.color) {
      const alpha = material.getBaseColorFactor()[3];
      material.setBaseColorFactor([...linearColor(fix.color), alpha]);
    }
    material.setMetallicFactor(fix?.metallic ?? Math.min(material.getMetallicFactor(), METALNESS_CAP));
    if (fix?.roughness !== undefined) material.setRoughnessFactor(fix.roughness);
    // Sorting whole meshes by depth is all a blended material gets; none of these has see-through parts that need it.
    if (material.getAlphaMode() === 'BLEND') material.setAlphaMode('OPAQUE');
  }
  await compressTextures(doc, { colourPx: COLOUR_TEXTURE_PX, dataPx: DATA_TEXTURE_PX, quality: WEBP_QUALITY });

  const triangles = countTriangles(doc);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  // Written beside the cache first: only a file that passes the checks below replaces the published one.
  const draft = path.join(CACHE_DIR, 'out', `${entry.slug}.glb`);
  await mkdir(path.dirname(draft), { recursive: true });
  await io.write(draft, doc);
  const { size: bytes } = await stat(draft);

  // --- what was written, measured -------------------------------------------------------------
  const written = await newIO().read(draft);
  const wb = boundsOf(written);
  size = [0, 1, 2].map((k) => wb.max[k] - wb.min[k]);
  const off = (value: number) => Math.abs(value) > FRAME_TOLERANCE_M;
  const mm = (value: number) => `${(value * 1000).toFixed(2)} mm`;
  if (off(wb.min[0] + wb.max[0])) throw new Error(`not centred on x (${mm(wb.min[0])} … ${mm(wb.max[0])})`);
  if (entry.frame === 'wall' && off(wb.min[1])) throw new Error(`does not stand on y = 0 (its foot is at ${mm(wb.min[1])})`);
  if (entry.frame === 'fitting' && off(wb.min[1] + wb.max[1])) throw new Error(`not centred on y (${mm(wb.min[1])} … ${mm(wb.max[1])})`);
  if (entry.frame !== 'floor' && off(wb.min[2])) throw new Error(`its back is not on z = 0 (it is at ${mm(wb.min[2])})`);
  if (entry.frame === 'floor' && off(wb.max[1])) throw new Error(`its top is not at y = 0 (it is at ${mm(wb.max[1])})`);
  if (entry.frame === 'floor' && off(wb.min[2] + wb.max[2])) throw new Error(`not centred on z (${mm(wb.min[2])} … ${mm(wb.max[2])})`);
  if (Math.abs(size[axis] - entry.sizeCm[entry.fit] / 100) > 0.001) throw new Error(`${entry.fit} is ${mm(size[axis])}, not ${entry.sizeCm[entry.fit] * 10} mm`);
  if (triangles > MAX_TRIANGLES) throw new Error(`${triangles} triangles (the cap is ${MAX_TRIANGLES})`);
  if (bytes > MAX_BYTES) throw new Error(`${(bytes / 1024 / 1024).toFixed(2)} MB (the cap is ${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB)`);
  for (const material of written.getRoot().listMaterials()) {
    if (hasLitWord(material.getName())) throw new Error(`the studio would light up a material called ${material.getName()}`);
  }
  const labels = ['width', 'height', 'depth'] as const;
  const astray = labels.filter((label, k) => Math.abs(size[k] * 100 / entry.sizeCm[label] - 1) > 0.35).map((label) => `${label} ${(size[labels.indexOf(label)] * 100).toFixed(1)} cm (target ${entry.sizeCm[label]})`);
  if (astray.length) process.stdout.write(`(off the target: ${astray.join(', ')}) `);
  await copyFile(draft, path.join(OUT_DIR, `${entry.slug}.glb`));
  await rm(draft, { force: true });

  const source = entry.source;
  const credit = creditOf(source);
  const cm = (metres: number) => Math.round(metres * 1000) / 10; // to the millimetre
  return {
    slug: entry.slug,
    kind: entry.product.kind,
    frame: entry.frame,
    url: `/models/equipment/${entry.slug}.glb`,
    widthCm: cm(size[0]),
    heightCm: cm(size[1]),
    depthCm: cm(size[2]),
    styles: entry.product.styles,
    title: entry.title,
    triangles,
    bytes,
    imageUrl: `/uploads/furniture/equipment-${entry.slug}.png`,
    source: source.type,
    sourceUrl: credit.url,
    author: credit.author,
    license: credit.license,
    credit,
    product: entry.product,
  };
}

// Only when run, not when the photo script reads this file's types.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
