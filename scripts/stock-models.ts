/* eslint-disable no-console */
/**
 * Stock furniture for the Design Studio, from two CC0 libraries.
 *
 *   pnpm models:stock                      → public/models/stock/*.glb + manifest.json
 *   pnpm models:stock --only=ph-sofa_02    → redo a few; merges into the manifest
 *   pnpm models:stock --inspect            → measure and report, write nothing
 *
 * The partner drop covers 17 products in three styles and nothing at all for kitchens,
 * bathrooms, rugs or lamps. Until real partners fill those gaps the studio needs a full
 * apartment's worth of *real, downloadable* models so that every slot in every room has
 * something — and several somethings, so the swap panel is a choice rather than a dead end.
 *
 *   - **Poly Haven** (polyhaven.com, CC0): photoscanned and hand-modelled furniture with
 *     proper PBR maps and a rendered photo per asset. Real metres, Y-up, glTF with 1k maps.
 *   - **Kenney Furniture Kit** (kenney.nl, CC0) — no longer used: its flat, untextured low-poly
 *     pieces were removed from the catalogue (Oct 2026); the loader stays for a future source. Was: 140 clean low-poly pieces — the kitchens,
 *     bathrooms, rugs and floor lamps nobody photoscans. Flat colours, isometric renders.
 *     Stylised, and honest about it: these are placeholders until a partner sells the real
 *     thing.
 *
 * Each entry is tagged with the styles it *reads* as. Deliberately loose — the point is that
 * every style has several options per kind, not that a gothic chair is only ever vintage.
 * Everything is a placeholder catalogue: prices, stores and Georgian names are ours.
 *
 * Output is the same manifest shape the partner pipeline writes, so `pnpm models:seed` treats
 * both alike.
 */

import './lib/loadEnv';

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Document, NodeIO, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, getBounds, join, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { ARCHETYPES } from '../lib/design/catalog';
import type { StyleId } from '../lib/design/types';
import type { ManifestModel } from './convert-models';
import { colorsOfDocument } from './lib/modelColor';
import { compressModels } from './lib/compressModels';
import { writePhotoWebp } from './lib/photos';
import { compressTextures } from './lib/gltfPipeline';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'models', 'stock');
const PHOTO_DIR = path.join(ROOT, 'public', 'uploads', 'furniture');
/** Downloads are cached beside the partner drop so a re-run does not hit the network. */
const CACHE_DIR = path.join(
  process.env.ASSET_DROP ?? '/Users/torniketsava/Downloads/3D OBJECTS WITH STYLES_DRAFT_03.03.2026',
  '_STOCK'
);
const KENNEY_ZIP_URL =
  'https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip';
const USER_AGENT = 'RenovationRoom-asset-fetch/1.0 (+https://remonti.ge)';

const TARGET_TRIANGLES = 24_000;
/** Above this the maps are re-encoded at 512 px; a flat holds forty of these at once. */
const SOFT_BYTES = 900 * 1024;
const MAX_BYTES = 2_400 * 1024;

/** Symmetric kinds whose long side belongs along the wall or the sofa, not across the room. */
const WIDE_KINDS = new Set(['coffee_table', 'dining_table', 'rug', 'rug_bed', 'kitchen_island', 'bathtub', 'tv_unit', 'console_table', 'storage_shelf', 'sofa_3seat', 'bookshelf']);
const ALL: StyleId[] = ['modern', 'scandinavian', 'industrial', 'vintage'];

type Source = 'polyhaven' | 'kenney';

interface StockEntry {
  source: Source;
  /** Poly Haven asset id, or the Kenney model file name. */
  id: string;
  /** Output slug. Defaults to `ph-<id>` / `kk-<id>`; set when one file serves two kinds. */
  name?: string;
  kind: string;
  styles: StyleId[];
  priceGel: number;
  storeSlug: string;
  /** Override the measured facing. Degrees, applied after the heuristic. */
  yawDegrees?: number;
  /**
   * Keep only the top-level nodes whose name matches. Some Poly Haven files hold two variants
   * side by side; without this the rule is "largest node plus whatever touches it".
   */
  nodes?: RegExp;
  /** 'seat': tallest part is the back. 'panel': the flattest side is the back. 'none': symmetric. */
  facing?: 'seat' | 'panel' | 'none';
  /**
   * Kenney's kit is built at toy scale, so its pieces are sized to the archetype:
   * 'uniform' keeps the proportions and matches the largest axis, 'axis' stretches each axis
   * to the archetype (counters, rugs). Poly Haven models are real metres and keep their size.
   */
  fit?: 'none' | 'uniform' | 'axis';
  targetTriangles?: number;
  displayName?: string;
}

const ph = (
  id: string,
  kind: string,
  styles: StyleId[],
  priceGel: number,
  storeSlug: string,
  extra: Partial<StockEntry> = {}
): StockEntry => ({ source: 'polyhaven', id, kind, styles, priceGel, storeSlug, ...extra });

// Stores: antikvari (vintage), domus-interior (modern), nordic-home (scandinavian),
// loft-42 (industrial), lumina (lighting), textil-plus (rugs), san-plus (sanitary),
// kartuli-aveji (kitchens and general).
const STOCK: StockEntry[] = [
  // --- sofas -------------------------------------------------------------
  ph('sofa_02', 'sofa_3seat', ['modern', 'scandinavian', 'industrial'], 2400, 'domus-interior', { yawDegrees: 180 }),
  ph('sofa_03', 'sofa_3seat', ['vintage', 'industrial'], 3900, 'antikvari'),
  ph('Sofa_01', 'sofa_3seat', ['vintage'], 2200, 'antikvari'),
  ph('chinese_sofa', 'sofa_3seat', ['vintage'], 3600, 'antikvari'),
  ph('painted_wooden_sofa', 'sofa_3seat', ['scandinavian', 'vintage'], 1900, 'nordic-home'),

  // --- armchairs -----------------------------------------------------------
  ph('ArmChair_01', 'armchair', ['vintage'], 1200, 'antikvari'),
  ph('GreenChair_01', 'armchair', ['vintage', 'scandinavian'], 890, 'antikvari'),
  ph('mid_century_lounge_chair', 'armchair', ['modern', 'scandinavian', 'industrial'], 1650, 'domus-interior'),
  ph('modern_arm_chair_01', 'armchair', ['modern', 'scandinavian'], 1450, 'domus-interior'),
  ph('chinese_armchair', 'armchair', ['vintage'], 1500, 'antikvari'),
  ph('Rockingchair_01', 'armchair', ['vintage', 'scandinavian'], 980, 'antikvari'),
  ph('Ottoman_01', 'armchair', ['modern', 'industrial', 'scandinavian'], 520, 'loft-42', { facing: 'none' }),
  ph('BarberShopChair_01', 'armchair', ['industrial', 'vintage'], 2100, 'loft-42'),

  // --- coffee tables --------------------------------------------------------
  ph('CoffeeTable_01', 'coffee_table', ['vintage', 'scandinavian'], 640, 'antikvari', { facing: 'none' }),
  ph('coffee_table_round_01', 'coffee_table', ['modern'], 890, 'domus-interior', { facing: 'none' }),
  ph('gothic_coffee_table', 'coffee_table', ['vintage'], 720, 'antikvari', { facing: 'none' }),
  ph('industrial_coffee_table', 'coffee_table', ['industrial'], 560, 'loft-42', { facing: 'none' }),
  ph('modern_coffee_table_01', 'coffee_table', ['modern', 'scandinavian'], 780, 'domus-interior', { facing: 'none' }),
  ph('modern_coffee_table_02', 'coffee_table', ['modern'], 820, 'domus-interior', { facing: 'none' }),
  ph('chinese_tea_table', 'coffee_table', ['vintage'], 690, 'antikvari', { facing: 'none' }),
  ph('gallinera_table', 'coffee_table', ['vintage', 'scandinavian'], 450, 'antikvari', { facing: 'none' }),
  ph('small_wooden_table_01', 'coffee_table', ['scandinavian', 'vintage', 'industrial'], 380, 'nordic-home', { facing: 'none' }),

  // --- TV units, consoles ---------------------------------------------------
  ph('modern_wooden_cabinet', 'tv_unit', ['modern', 'scandinavian'], 1900, 'domus-interior', { facing: 'panel', yawDegrees: 180 }),
  ph('vintage_wooden_drawer_01', 'tv_unit', ['industrial', 'vintage'], 640, 'loft-42', { facing: 'panel' }),
  ph('ClassicConsole_01', 'console_table', ['vintage'], 980, 'antikvari', { facing: 'panel' }),
  ph('chinese_console_table', 'console_table', ['vintage'], 1100, 'antikvari', { facing: 'panel' }),

  // --- dining ---------------------------------------------------------------
  ph('dining_table', 'dining_table', ['vintage'], 1400, 'antikvari', { facing: 'none' }),
  ph('painted_wooden_table', 'dining_table', ['scandinavian', 'vintage'], 1600, 'nordic-home', { facing: 'none' }),
  ph('round_wooden_table_01', 'dining_table', ['vintage', 'modern'], 1350, 'antikvari', { facing: 'none' }),
  ph('round_wooden_table_02', 'dining_table', ['scandinavian', 'vintage'], 620, 'nordic-home', { facing: 'none' }),
  ph('wooden_table_02', 'dining_table', ['scandinavian', 'industrial'], 540, 'nordic-home', { facing: 'none' }),
  ph('dining_chair_02', 'dining_chair', ['modern', 'industrial'], 420, 'domus-interior'),
  ph('painted_wooden_chair_01', 'dining_chair', ['scandinavian', 'vintage'], 260, 'nordic-home'),
  ph('painted_wooden_chair_02', 'dining_chair', ['vintage'], 240, 'antikvari'),
  ph('SchoolChair_01', 'dining_chair', ['industrial', 'modern'], 190, 'loft-42'),
  ph('gallinera_chair', 'dining_chair', ['vintage'], 280, 'antikvari'),

  // --- kitchen --------------------------------------------------------------

  // --- bathroom -------------------------------------------------------------
  // Kenney's bathroomMirror is a cabinet with a shelf, 37 cm deep — not a wall mirror.
  ph('ornate_mirror_01', 'mirror', ALL, 380, 'antikvari', { facing: 'panel', yawDegrees: 180 }),

  // --- bedroom --------------------------------------------------------------
  ph('GothicBed_01', 'bed_double', ['vintage'], 2900, 'antikvari'),
  ph('old_bed_frame', 'bed_single', ['industrial', 'vintage'], 780, 'loft-42'),
  ph('vintage_day_bed', 'bed_single', ['vintage', 'scandinavian'], 1700, 'antikvari'),
  ph('ClassicNightstand_01', 'nightstand', ['vintage'], 420, 'antikvari', { facing: 'panel', yawDegrees: 180 }),
  ph('painted_wooden_nightstand', 'nightstand', ['scandinavian', 'vintage'], 310, 'nordic-home', { facing: 'panel' }),
  ph('side_table_01', 'nightstand', ['modern', 'scandinavian'], 290, 'domus-interior', { facing: 'panel' }),
  ph('side_table_tall_01', 'nightstand', ['vintage', 'industrial'], 260, 'antikvari', { facing: 'none' }),
  ph('WoodenTable_02', 'nightstand', ['industrial', 'scandinavian'], 180, 'loft-42', { facing: 'none' }),
  ph('chinese_stool', 'nightstand', ['vintage'], 340, 'antikvari', { facing: 'none' }),
  ph('vintage_cabinet_01', 'wardrobe', ['vintage', 'scandinavian'], 2600, 'antikvari', { facing: 'panel' }),
  ph('GothicCabinet_01', 'wardrobe', ['vintage'], 2400, 'antikvari', { facing: 'panel', yawDegrees: 180 }),
  ph('painted_wooden_cabinet_02', 'wardrobe', ['vintage', 'scandinavian'], 1500, 'nordic-home', { facing: 'panel' }),
  ph('drawer_cabinet', 'wardrobe', ['modern', 'industrial'], 1300, 'loft-42', { facing: 'panel' }),
  ph('GothicCommode_01', 'dresser', ['vintage'], 1250, 'antikvari', { facing: 'panel' }),
  ph('painted_wooden_cabinet', 'dresser', ['vintage', 'scandinavian'], 880, 'nordic-home', { facing: 'panel', yawDegrees: 180 }),
  ph('tool_cart', 'dresser', ['industrial'], 640, 'loft-42', { facing: 'panel' }),

  // --- shelves --------------------------------------------------------------
  ph('Shelf_01', 'bookshelf', ['scandinavian', 'modern'], 620, 'nordic-home', { facing: 'panel' }),
  ph('steel_frame_shelves_01', 'bookshelf', ['industrial', 'modern'], 890, 'loft-42', { facing: 'panel' }),
  ph('steel_frame_shelves_03', 'bookshelf', ['modern', 'industrial'], 1400, 'loft-42', { facing: 'panel' }),
  ph('wooden_bookshelf_worn', 'bookshelf', ['vintage', 'industrial'], 540, 'antikvari', { facing: 'panel' }),
  ph('wooden_display_shelves_01', 'bookshelf', ['scandinavian', 'modern'], 480, 'nordic-home', { facing: 'panel' }),
  ph('steel_frame_shelves_02', 'storage_shelf', ['industrial', 'modern'], 560, 'loft-42', { facing: 'panel' }),
  ph('painted_wooden_shelves', 'storage_shelf', ['vintage', 'scandinavian'], 320, 'antikvari', { facing: 'panel' }),
  ph('worn_metal_rack', 'storage_shelf', ['industrial'], 380, 'loft-42', { facing: 'panel' }),
  ph('industrial_storage_cart', 'storage_shelf', ['industrial'], 720, 'loft-42', { facing: 'panel' }),

  // --- office ---------------------------------------------------------------
  ph('metal_office_desk', 'desk', ['industrial', 'modern'], 1100, 'loft-42', { facing: 'panel', yawDegrees: 180 }),
  ph('SchoolDesk_01', 'desk', ['vintage', 'scandinavian'], 380, 'antikvari', { facing: 'panel', yawDegrees: 180 }),
  ph('WoodenTable_03', 'desk', ['vintage', 'industrial'], 520, 'antikvari', { facing: 'panel' }),
  ph('metal_stool_01', 'office_chair', ['industrial', 'modern'], 260, 'loft-42', { facing: 'none' }),
  ph('metal_stool_03', 'office_chair', ['industrial'], 300, 'loft-42'),
  ph('SchoolChair_01', 'office_chair', ['modern', 'industrial'], 190, 'loft-42', { name: 'ph-SchoolChair_01-office' }),
  ph('dining_chair_02', 'office_chair', ['modern'], 420, 'domus-interior', { name: 'ph-dining_chair_02-office' }),

  // --- lighting -------------------------------------------------------------
  ph('Chandelier_01', 'pendant', ['vintage'], 1400, 'lumina', { facing: 'none' }),
  ph('Chandelier_02', 'pendant', ['vintage'], 1250, 'lumina', { facing: 'none' }),
  ph('Chandelier_03', 'pendant', ['vintage', 'modern'], 1600, 'lumina', { facing: 'none' }),
  ph('chinese_chandelier', 'pendant', ['vintage'], 1300, 'lumina', { facing: 'none' }),
  ph('lantern_chandelier_01', 'pendant', ['vintage', 'industrial'], 980, 'lumina', { facing: 'none' }),
  ph('hanging_industrial_lamp', 'pendant', ['industrial'], 420, 'lumina', { facing: 'none' }),
  ph('caged_hanging_light', 'pendant', ['industrial'], 380, 'lumina', { facing: 'none' }),
  ph('modern_ceiling_lamp_01', 'pendant', ['modern', 'scandinavian'], 460, 'lumina', { facing: 'none' }),
  ph('ceiling_fan', 'pendant', ['modern', 'industrial'], 520, 'lumina', { facing: 'none' }),

  // --- rugs, plants, art ----------------------------------------------------
  // The pot and pebbles sit below the foliage's box, so the touching rule would drop them.
  ph('potted_plant_01', 'plant', ALL, 140, 'domus-interior', { facing: 'none', nodes: /./ }),
  ph('potted_plant_02', 'plant', ALL, 120, 'domus-interior', { facing: 'none' }),
  ph('planter_box_03', 'plant', ['scandinavian', 'industrial'], 160, 'nordic-home', { facing: 'none' }),
  ph('hanging_picture_frame_01', 'artwork', ['modern', 'scandinavian'], 180, 'domus-interior', { facing: 'panel' }),
  ph('hanging_picture_frame_02', 'artwork', ['vintage', 'industrial'], 160, 'antikvari', { facing: 'panel' }),
  ph('hanging_picture_frame_03', 'artwork', ['vintage'], 120, 'antikvari', { facing: 'panel' }),
  ph('fancy_picture_frame_01', 'artwork', ['vintage'], 260, 'antikvari', { facing: 'panel' }),
  ph('fancy_picture_frame_02', 'artwork', ['vintage'], 320, 'antikvari', { facing: 'panel' }),
  ph('wall_clock', 'artwork', ['modern', 'industrial', 'scandinavian'], 110, 'domus-interior', { facing: 'panel' }),
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Outcome {
  name: string;
  model?: ManifestModel;
  error?: string;
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);
  const inspect = args.includes('--inspect');

  const entries = only ? STOCK.filter((e) => only.includes(slugOf(e))) : STOCK;
  if (only && entries.length !== only.length) {
    const known = new Set(STOCK.map(slugOf));
    console.error(`✗ unknown entries: ${only.filter((n) => !known.has(n)).join(', ')}`);
    process.exit(1);
  }
  const seen = new Set<string>();
  for (const e of STOCK) {
    const slug = slugOf(e);
    if (seen.has(slug)) throw new Error(`duplicate slug ${slug} — give one of them a name`);
    seen.add(slug);
    if (!ARCHETYPES[e.kind]) throw new Error(`${slug}: unknown archetype ${e.kind}`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(PHOTO_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;

  const polyhaven = await loadPolyHavenIndex();
  const kenneyDir = entries.some((e) => e.source === 'kenney') ? await ensureKenneyKit() : null;
  await prefetchPolyHaven(entries.filter((e) => e.source === 'polyhaven' && polyhaven[e.id]).map((e) => e.id));

  const outcomes: Outcome[] = [];
  for (const entry of entries) {
    const slug = slugOf(entry);
    process.stdout.write(`→ ${slug.padEnd(34)}`);
    try {
      const model = await convertOne(entry, polyhaven, kenneyDir, inspect);
      outcomes.push({ name: slug, model });
      console.log(
        `${String(model.triangles).padStart(6)} tris ${(model.bytes / 1024).toFixed(0).padStart(5)} KB  ` +
          `${model.widthCm}×${model.depthCm}×${model.heightCm} cm  ${model.kind}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcomes.push({ name: slug, error: message });
      console.log(`  ✗ ${message.split('\n')[0]}`);
    }
  }

  if (inspect) {
    console.log('\n(inspect only — nothing written)');
    return;
  }

  let models = outcomes.flatMap((o) => (o.model ? [o.model] : []));
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  if (only && existsSync(manifestPath)) {
    const previous = (JSON.parse(await readFile(manifestPath, 'utf8')) as { models: ManifestModel[] }).models;
    const redone = new Set(entries.map(slugOf));
    const order = new Map(STOCK.map((e, i) => [slugOf(e), i]));
    models = [...previous.filter((m) => !redone.has(m.name)), ...models].sort(
      (a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999)
    );
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        note: 'Written by scripts/stock-models.ts. CC0 stock furniture from Poly Haven and the Kenney Furniture Kit, unit-sized, Y-up, front along +Z. Placeholder catalogue until partners cover these kinds.',
        models,
      },
      null,
      2
    )}\n`
  );

  const total = models.reduce((sum, m) => sum + m.bytes, 0) / 1024 / 1024;
  console.log(`\n${models.length} stock models in manifest · ${total.toFixed(1)} MB · ${path.relative(ROOT, OUT_DIR)}`);
  // The library as the studio downloads it: WebP maps, Draco geometry where that pays.
  await compressModels();
  const byKind = models.reduce<Record<string, number>>((acc, m) => ((acc[m.kind] = (acc[m.kind] ?? 0) + 1), acc), {});
  console.log(
    `  per kind: ${Object.entries(byKind)
      .sort()
      .map(([k, n]) => `${k} ${n}`)
      .join(' · ')}`
  );
  const failed = outcomes.filter((o) => o.error);
  if (failed.length) {
    console.log(`\n${failed.length} failed:\n${failed.map((o) => `  · ${o.name} — ${o.error}`).join('\n')}`);
    process.exitCode = 1;
  }
  console.log('\nSeed the catalogue with:  pnpm models:seed');
}

function slugOf(entry: StockEntry): string {
  return entry.name ?? `${entry.source === 'polyhaven' ? 'ph' : 'kk'}-${entry.id}`;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

interface PolyHavenAsset {
  name: string;
  dimensions?: [number, number, number];
  polycount?: number;
}

async function loadPolyHavenIndex(): Promise<Record<string, PolyHavenAsset>> {
  const cached = path.join(CACHE_DIR, 'polyhaven-models.json');
  if (!existsSync(cached)) {
    const data = await fetchBytes('https://api.polyhaven.com/assets?t=models');
    await writeFile(cached, data);
  }
  return JSON.parse(await readFile(cached, 'utf8')) as Record<string, PolyHavenAsset>;
}

/** Downloads a Poly Haven model's 1k glTF and its textures once; returns the .gltf path. */
async function fetchPolyHaven(id: string): Promise<{ gltf: string; photo: string }> {
  const dir = path.join(CACHE_DIR, 'polyhaven', id);
  const gltf = path.join(dir, `${id}_1k.gltf`);
  const photo = path.join(dir, `${id}.png`);
  if (!existsSync(gltf) || !existsSync(photo)) {
    await mkdir(path.join(dir, 'textures'), { recursive: true });
    const files = JSON.parse(
      Buffer.from(await fetchBytes(`https://api.polyhaven.com/files/${id}`)).toString('utf8')
    ) as { gltf?: Record<string, { gltf: { url: string; include: Record<string, { url: string }> } }> };
    const level = files.gltf?.['1k']?.gltf;
    if (!level) throw new Error('Poly Haven has no 1k glTF for this asset');
    // The CDN is slow per connection and fine with several; fetch the whole set at once.
    // Written to temporary names first so a half-finished download never looks cached.
    const jobs: Array<Promise<void>> = [
      fetchBytes(level.url).then((data) => writeFile(`${gltf}.part`, data)),
      fetchBytes(`https://cdn.polyhaven.com/asset_img/primary/${id}.png?width=900`).then((data) =>
        writeFile(`${photo}.part`, data)
      ),
    ];
    for (const [name, file] of Object.entries(level.include)) {
      const out = path.join(dir, name);
      jobs.push(
        mkdir(path.dirname(out), { recursive: true })
          .then(() => fetchBytes(file.url))
          .then((data) => writeFile(out, data))
      );
    }
    await Promise.all(jobs);
    await rename(`${photo}.part`, photo);
    await rename(`${gltf}.part`, gltf);
  }
  return { gltf, photo };
}

/** Warms the download cache for every Poly Haven entry, a few assets at a time. */
async function prefetchPolyHaven(ids: string[]): Promise<void> {
  const queue = [...new Set(ids)];
  if (queue.length === 0) return;
  process.stdout.write(`⇣ fetching ${queue.length} Poly Haven assets`);
  let failures = 0;
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        await fetchPolyHaven(id);
        process.stdout.write('.');
      } catch {
        failures++;
        process.stdout.write('x');
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(failures ? ` (${failures} failed — reported below)` : ' done');
}

/** The Kenney kit is one zip; it is fetched once and unpacked beside the cache. */
async function ensureKenneyKit(): Promise<string> {
  const dir = path.join(CACHE_DIR, 'kenney_furniture-kit');
  const marker = path.join(dir, 'Models', 'GLTF format', 'loungeSofa.glb');
  if (!existsSync(marker)) {
    const zip = path.join(CACHE_DIR, 'kenney_furniture-kit.zip');
    if (!existsSync(zip)) await writeFile(zip, await fetchBytes(KENNEY_ZIP_URL));
    await mkdir(dir, { recursive: true });
    await run('unzip', ['-q', '-o', zip, 'Models/GLTF format/*', 'Isometric/*', 'License.txt', '-d', dir]);
  }
  return dir;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

// ---------------------------------------------------------------------------
// One model
// ---------------------------------------------------------------------------

async function convertOne(
  entry: StockEntry,
  polyhaven: Record<string, PolyHavenAsset>,
  kenneyDir: string | null,
  inspect: boolean
): Promise<ManifestModel> {
  const slug = slugOf(entry);
  const archetype = ARCHETYPES[entry.kind];

  let source: string;
  let photo: string;
  let displayName: string;
  let brand: string;
  if (entry.source === 'polyhaven') {
    const asset = polyhaven[entry.id];
    if (!asset) throw new Error(`not on Poly Haven: ${entry.id}`);
    ({ gltf: source, photo } = await fetchPolyHaven(entry.id));
    displayName = entry.displayName ?? asset.name;
    brand = 'Poly Haven';
  } else {
    if (!kenneyDir) throw new Error('Kenney kit not available');
    source = path.join(kenneyDir, 'Models', 'GLTF format', `${entry.id}.glb`);
    if (!existsSync(source)) throw new Error(`not in the Kenney kit: ${entry.id}`);
    photo = path.join(kenneyDir, 'Isometric', `${entry.id}_SW.png`);
    displayName = entry.displayName ?? entry.id.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    brand = 'Kenney';
  }

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(source);

  // World-space geometry with node transforms baked in, one primitive per material.
  await doc.transform(dedup(), flatten());
  const dropped = selectNodes(doc, entry.nodes, inspect);
  await doc.transform(join({ keepNamed: false, keepMeshes: false }), weld(), prune());
  bakeNodeTransforms(doc);
  const sourceTriangles = countTriangles(doc);
  if (dropped.length && !inspect) process.stdout.write(`(dropped ${dropped.join(', ')}) `);
  if (dropped.length && inspect) process.stdout.write(`\n      dropped nodes: ${dropped.join(', ')}\n      `);

  const target = entry.targetTriangles ?? TARGET_TRIANGLES;
  for (const error of [0.003, 0.008, 0.02, 0.05]) {
    const current = countTriangles(doc);
    if (current <= target * 1.2) break;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / current, error }));
  }
  await doc.transform(prune());

  // --- orient, size, normalise ------------------------------------------------
  const points = worldPoints(doc);
  const facing = entry.facing ?? defaultFacing(entry.kind);
  let yaw = facing === 'none' ? 0 : facingYaw(points, facing);
  if (yaw === 0 && WIDE_KINDS.has(entry.kind)) {
    // Nothing told us which way it faces, but a table lying across the room is still wrong:
    // the long side goes along X, where the layout engine expects the width.
    const b = boundsOf(doc);
    if (b.max[2] - b.min[2] > (b.max[0] - b.min[0]) * 1.15) yaw = Math.PI / 2;
  }
  yaw += ((entry.yawDegrees ?? 0) * Math.PI) / 180;
  if (yaw !== 0) rotateY(doc, yaw);

  let before = boundsOf(doc);
  let size = [before.max[0] - before.min[0], before.max[1] - before.min[1], before.max[2] - before.min[2]];

  // Poly Haven publishes each asset's size in millimetres. Almost every file is in metres,
  // but the odd one is exported in millimetres or centimetres, and that is the one thing a
  // bounding box cannot tell on its own.
  if (entry.source === 'polyhaven') {
    const declared = polyhaven[entry.id].dimensions;
    if (declared) {
      const expected = Math.max(...declared) / 1000;
      const measured = Math.max(...size);
      const power = Math.round(Math.log10(expected / measured));
      if (power !== 0 && Math.abs(power) <= 3) {
        const factor = 10 ** power;
        transformPositions(doc, (p) => [p[0] * factor, p[1] * factor, p[2] * factor]);
        before = boundsOf(doc);
        size = size.map((v) => v * factor);
        process.stdout.write(`(file is in ${factor === 0.001 ? 'mm' : factor === 0.01 ? 'cm' : `×${factor}`}) `);
      }
    }
  }
  const fit = entry.fit ?? 'none';
  const arch = [archetype.size.width, archetype.size.height, archetype.size.depth];
  let scale: [number, number, number];
  if (fit === 'axis') {
    scale = [arch[0] / size[0], arch[1] / size[1], arch[2] / size[2]];
  } else if (fit === 'uniform') {
    const s = Math.max(...arch) / Math.max(...size);
    scale = [s, s, s];
  } else {
    scale = [1, 1, 1];
  }
  const realCm: [number, number, number] = [
    Math.round(size[0] * scale[0] * 100),
    Math.round(size[2] * scale[2] * 100),
    Math.round(size[1] * scale[1] * 100),
  ];
  sanityCheck(realCm, archetype.size, slug);

  // Unit-sized like the partner models: largest axis 1, standing on y=0, centred on x/z.
  const largest = Math.max(size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]);
  const unit: [number, number, number] = [scale[0] / largest, scale[1] / largest, scale[2] / largest];
  const centre = [(before.min[0] + before.max[0]) / 2, before.min[1], (before.min[2] + before.max[2]) / 2];
  transformPositions(doc, (p) => [
    (p[0] - centre[0]) * unit[0],
    (p[1] - centre[1]) * unit[1],
    (p[2] - centre[2]) * unit[2],
  ]);

  for (const material of doc.getRoot().listMaterials()) {
    // Thin things (leaves, lampshades) want both sides; solid furniture does not.
    if (entry.source === 'kenney') material.setDoubleSided(false);
  }

  const triangles = countTriangles(doc);
  const textures = doc
    .getRoot()
    .listTextures()
    .map((t) => t.getName() || t.getURI() || 'texture');

  if (inspect) {
    return {
      url: '',
      name: slug,
      style: entry.styles[0],
      styles: entry.styles,
      kind: entry.kind,
      displayName,
      nameKa: nameKaFor(entry.kind, displayName),
      widthCm: realCm[0],
      depthCm: realCm[1],
      heightCm: realCm[2],
      priceGel: entry.priceGel,
      storeSlug: entry.storeSlug,
      imageUrl: null,
      colorHex: null,
      triangles,
      bytes: 0,
      textures,
      source: entry.source,
      license: 'CC0',
      brand,
    };
  }

  // WebP maps at quality 80, as every pipeline and the upload recipe write them.
  await compressTextures(doc, { colourPx: 1024, dataPx: 1024, quality: 80 });
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT_DIR, `${slug}.glb`);
  await io.write(out, doc);
  let { size: bytes } = await stat(out);
  // Poly Haven's 1k set is three maps per material, and a chair with four materials is a
  // dozen textures. Geometry is rarely the problem, so shrink the maps before giving up.
  for (const [px, limit] of [[512, SOFT_BYTES], [256, MAX_BYTES]] as const) {
    if (bytes <= limit) break;
    await compressTextures(doc, { colourPx: px, dataPx: px, quality: 80 });
    await io.write(out, doc);
    ({ size: bytes } = await stat(out));
    process.stdout.write(`(maps→${px}px) `);
  }
  if (bytes > MAX_BYTES) {
    await rm(out, { force: true });
    throw new Error(`too heavy (${(bytes / 1024 / 1024).toFixed(1)} MB after decimation, ${sourceTriangles} source tris)`);
  }

  const imageUrl = await placePhoto(photo, slug, entry.source);
  // What colour the piece is, for the shelf's colour filter: read off the model itself.
  const colors = await colorsOfDocument(doc).catch(() => [] as string[]);

  return {
    url: `/models/stock/${slug}.glb`,
    name: slug,
    style: entry.styles[0],
    styles: entry.styles,
    kind: entry.kind,
    displayName,
    nameKa: nameKaFor(entry.kind, displayName),
    widthCm: realCm[0],
    depthCm: realCm[1],
    heightCm: realCm[2],
    priceGel: entry.priceGel,
    storeSlug: entry.storeSlug,
    imageUrl,
    colorHex: colors[0] ?? null,
    colors,
    triangles,
    bytes,
    textures,
    source: entry.source,
    license: 'CC0',
    brand,
  };
}

function nameKaFor(kind: string, displayName: string): string {
  return `${ARCHETYPES[kind].labelKa} „${displayName}“`;
}

/** A model whose measured size is wildly off the archetype is almost always a scene or a prop. */
function sanityCheck(cm: [number, number, number], size: { width: number; depth: number; height: number }, slug: string) {
  const ratio = Math.max(cm[0] / 100 / size.width, cm[1] / 100 / size.depth, cm[2] / 100 / size.height);
  const inverse = Math.max(size.width / (cm[0] / 100), size.depth / (cm[1] / 100), size.height / (cm[2] / 100));
  if (ratio > 3.5 || inverse > 4) {
    throw new Error(`${slug}: ${cm.join('×')} cm is nothing like a ${Math.round(size.width * 100)}×${Math.round(size.depth * 100)}×${Math.round(size.height * 100)} — check the entry`);
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function countTriangles(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      n += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
    }
  }
  return Math.round(n);
}

function boundsOf(doc: Document): { min: number[]; max: number[] } {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  return getBounds(scene);
}

/** Every vertex in world space (after flatten+join the node transforms are identity). */
function worldPoints(doc: Document): Float32Array {
  const chunks: Float32Array[] = [];
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const array = prim.getAttribute('POSITION')?.getArray();
      if (!array) continue;
      const f = array instanceof Float32Array ? array : Float32Array.from(array);
      chunks.push(f);
      total += f.length;
    }
  }
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Writes every node's transform into its vertices and resets the node to identity.
 *
 * `join` merges what it can, but a door with its own material stays a separate node carrying
 * a translation — and every measurement and edit below reads vertex positions directly. A
 * cabinet whose doors kept a ±1.19 m offset came out 4.8 m wide before this existed.
 */
function bakeNodeTransforms(doc: Document): void {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix();
    const identity = matrix.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9);
    if (identity) continue;

    // A mesh shared by two nodes cannot be baked twice; give this node its own copy.
    const owners = mesh.listParents().filter((p) => p.propertyType === 'Node');
    const target = owners.length > 1 ? mesh.clone() : mesh;
    if (target !== mesh) node.setMesh(target);

    const m = matrix;
    const transformPoint = (p: number[]) => [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ];
    const transformDirection = (d: number[]) => {
      const v = [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / len, v[1] / len, v[2] / len];
    };
    const done = new Set<object>();
    for (const prim of target.listPrimitives()) {
      for (const semantic of ['POSITION', 'NORMAL', 'TANGENT']) {
        const accessor = prim.getAttribute(semantic);
        if (!accessor || done.has(accessor)) continue;
        // An accessor shared with another mesh would be transformed twice; copy it first.
        if (accessor.listParents().filter((p) => p.propertyType === 'Primitive').length > 1) {
          prim.setAttribute(semantic, accessor.clone());
        }
        const own = prim.getAttribute(semantic)!;
        done.add(own);
        const stride = own.getElementSize();
        const array = Float32Array.from(own.getArray()!);
        for (let i = 0; i < array.length; i += stride) {
          const out = semantic === 'POSITION' ? transformPoint([array[i], array[i + 1], array[i + 2]]) : transformDirection([array[i], array[i + 1], array[i + 2]]);
          array[i] = out[0];
          array[i + 1] = out[1];
          array[i + 2] = out[2];
        }
        own.setArray(array);
      }
    }
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
}

/**
 * Which nodes are the product?
 *
 * A Poly Haven file is sometimes a small scene — a cabinet with its doors open beside the same
 * cabinet closed, a set of three vases. After `flatten` every object is a top-level node, so
 * the rule from the partner pipeline applies: keep the largest node and everything touching
 * it. Returns the names it dropped.
 */
function selectNodes(doc: Document, include?: RegExp, verbose = false): string[] {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const nodes = scene.listChildren().filter((n) => n.getMesh());
  if (nodes.length <= 1) return [];
  if (verbose) {
    const described = nodes.map((n) => {
      const b = getBounds(n);
      return `${n.getName() || '(unnamed)'} ${[0, 1, 2].map((k) => (b.max[k] - b.min[k]).toFixed(2)).join('×')} @${[0, 2].map((k) => ((b.min[k] + b.max[k]) / 2).toFixed(2)).join(',')}`;
    });
    process.stdout.write(`\n      nodes: ${described.join(' | ')}\n      `);
  }

  const boxes = nodes.map((node) => {
    const b = getBounds(node);
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    return { node, min: b.min, max: b.max, volume: Math.max(size[0], 1e-6) * Math.max(size[1], 1e-6) * Math.max(size[2], 1e-6), largest: Math.max(...size) };
  });

  let keep: typeof boxes;
  if (include) {
    keep = boxes.filter((b) => include.test(b.node.getName()));
    if (keep.length === 0) throw new Error(`nodes ${include} matched nothing among ${nodes.map((n) => n.getName()).join(', ')}`);
  } else {
    const main = boxes.reduce((best, b) => (b.volume > best.volume ? b : best), boxes[0]);
    const margin = main.largest * 0.06;
    keep = boxes.filter((b) => {
      if (b === main) return true;
      for (let k = 0; k < 3; k++) {
        if (b.max[k] < main.min[k] - margin || b.min[k] > main.max[k] + margin) return false;
      }
      return true;
    });
  }

  const dropped: string[] = [];
  for (const b of boxes) {
    if (keep.includes(b)) continue;
    dropped.push(b.node.getName() || '(unnamed)');
    b.node.dispose();
  }
  return dropped;
}

function defaultFacing(kind: string): 'seat' | 'panel' | 'none' {
  if (/sofa|armchair|chair|bed_/.test(kind)) return 'seat';
  if (/wardrobe|dresser|shelf|bookshelf|tv_unit|nightstand|desk|console|shoe|fridge|washer|kitchen|sink|shower|mirror|artwork/.test(kind)) return 'panel';
  return 'none';
}

/**
 * Which way does it face? Returns the rotation about Y that turns the front to +Z.
 *
 * 'seat': the back of a chair, sofa or bed is its tallest part, so the horizontal offset from
 * the centroid of the top third to the footprint centre points forward.
 *
 * 'panel': a cabinet's back is a flat panel while its front is doors, shelves and handles, so
 * the extreme plane that carries the most vertices is the back. Only trusted when one side
 * wins clearly; a symmetric result means "leave it".
 */
function facingYaw(points: Float32Array, mode: 'seat' | 'panel'): number {
  const n = points.length / 3;
  if (n === 0) return 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = points[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const width = max[0] - min[0];
  const depth = max[2] - min[2];

  let front: [number, number] | null = null;
  if (mode === 'seat') {
    const threshold = min[1] + (max[1] - min[1]) * 0.62;
    let sx = 0;
    let sz = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (points[i * 3 + 1] >= threshold) {
        sx += points[i * 3];
        sz += points[i * 3 + 2];
        count++;
      }
    }
    if (count === 0) return 0;
    const dx = cx - sx / count;
    const dz = cz - sz / count;
    // Symmetric tops (an ottoman, a round stool) have nothing to say.
    if (Math.hypot(dx / width, dz / depth) < 0.05) return 0;
    front = Math.abs(dx / width) > Math.abs(dz / depth) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  } else {
    const tol = Math.max(width, depth) * 0.02;
    const counts = [0, 0, 0, 0]; // -x, +x, -z, +z
    for (let i = 0; i < n; i++) {
      const x = points[i * 3];
      const z = points[i * 3 + 2];
      if (x - min[0] < tol) counts[0]++;
      if (max[0] - x < tol) counts[1]++;
      if (z - min[2] < tol) counts[2]++;
      if (max[2] - z < tol) counts[3]++;
    }
    const best = counts.indexOf(Math.max(...counts));
    const opposite = [1, 0, 3, 2][best];
    // The back must be decisively flatter than the front, or the guess is noise.
    if (counts[best] < counts[opposite] * 2.2) return 0;
    front = [[1, 0], [-1, 0], [0, 1], [0, -1]][best] as [number, number];
  }

  // Rotation that carries `front` onto +Z.
  return -Math.atan2(front[0], front[1]);
}

function rotateY(doc: Document, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  transformPositions(doc, (p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]);
  transformNormals(doc, (nrm) => [nrm[0] * c + nrm[2] * s, nrm[1], -nrm[0] * s + nrm[2] * c]);
}

function transformPositions(doc: Document, fn: (p: number[]) => number[]): void {
  const done = new Set<object>();
  for (const prim of listPrimitives(doc)) {
    const accessor = prim.getAttribute('POSITION');
    if (!accessor || done.has(accessor)) continue;
    done.add(accessor);
    const array = Float32Array.from(accessor.getArray()!);
    for (let i = 0; i < array.length; i += 3) {
      const [x, y, z] = fn([array[i], array[i + 1], array[i + 2]]);
      array[i] = x;
      array[i + 1] = y;
      array[i + 2] = z;
    }
    accessor.setArray(array);
  }
}

function transformNormals(doc: Document, fn: (n: number[]) => number[]): void {
  const done = new Set<object>();
  for (const prim of listPrimitives(doc)) {
    for (const semantic of ['NORMAL', 'TANGENT']) {
      const accessor = prim.getAttribute(semantic);
      if (!accessor || done.has(accessor)) continue;
      done.add(accessor);
      const stride = accessor.getElementSize();
      const array = Float32Array.from(accessor.getArray()!);
      for (let i = 0; i < array.length; i += stride) {
        const [x, y, z] = fn([array[i], array[i + 1], array[i + 2]]);
        array[i] = x;
        array[i + 1] = y;
        array[i + 2] = z;
      }
      accessor.setArray(array);
    }
  }
}

function listPrimitives(doc: Document): Primitive[] {
  return doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
}

// ---------------------------------------------------------------------------
// Photos and shell
// ---------------------------------------------------------------------------

/** The source's picture of the piece as its product photo, WebP (Kenney's keep their transparency). */
async function placePhoto(source: string, slug: string, _kind: Source): Promise<string | null> {
  if (!existsSync(source)) return null;
  await writePhotoWebp(await readFile(source), path.join(PHOTO_DIR, `stock-${slug}.webp`));
  return `/uploads/furniture/stock-${slug}.webp`;
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 300)}`))));
  });
}


main().catch((error) => {
  console.error('✗ stock conversion failed:', error);
  process.exit(1);
});
