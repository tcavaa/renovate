/* eslint-disable no-console */
/**
 * Floor and wall finishes for the Design Studio.
 *
 *   pnpm textures:stock            → public/textures/* + surface products in the database
 *   pnpm textures:stock --only=parquet-oak-herringbone,wall-tile-hexagon-white
 *
 * A finish is a catalogue product with a `textureUrl`; the studio lists every such product
 * for its surface and prices it by the room's area. This script gives the calculator's
 * existing tiles, laminates and paints a real texture each, and adds the finishes the
 * calculator never sold — parquet, terrazzo, brick, wallpaper, bathroom tiles.
 *
 * Three sources, all CC0:
 *   - the partner asset drop, already extracted to public/textures by `pnpm assets:extract`
 *   - Poly Haven textures (1k jpg diffuse / normal / roughness)
 *   - ambientCG materials (1K-JPG zips: Color / NormalGL / Roughness)
 *
 * Prices and Georgian names are placeholders, like the rest of the catalogue.
 */

import './lib/loadEnv';

import { existsSync } from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { categories, products, stores } from '../lib/db/schema';
import { humanizeSlug } from './lib/translations';
import type { StyleId } from '../lib/design/types';

const ROOT = process.cwd();
const TEX_DIR = path.join(ROOT, 'public', 'textures');
const THUMB_DIR = path.join(ROOT, 'public', 'uploads', 'products');
const CACHE_DIR = path.join(
  process.env.ASSET_DROP ?? '/Users/torniketsava/Downloads/3D OBJECTS WITH STYLES_DRAFT_03.03.2026',
  '_STOCK',
  'textures'
);
const USER_AGENT = 'RenovationRoom-asset-fetch/1.0 (+https://remonti.ge)';
const ALL: StyleId[] = ['modern', 'scandinavian', 'industrial', 'vintage'];

type Surface = 'floor' | 'wall';

interface TextureEntry {
  /** Product slug — an existing calculator product gets its texture; a new slug is created. */
  slug: string;
  source: 'local' | 'polyhaven' | 'ambientcg';
  /** Local: base name in public/textures without `-diffuse.jpg`. Others: the asset id. */
  id: string;
  nameKa: string;
  categorySlug: 'laminate' | 'floor-tiles' | 'wall-tiles' | 'paint';
  surfaces: Surface[];
  wet?: boolean;
  /** Metres one tile of the texture covers. */
  scaleM: number;
  styles: StyleId[];
  /** GEL per m². Paints in the calculator are per litre; those keep their price and coverage. */
  priceGel?: number;
  storeSlug: string;
  /** Local textures that ship only a diffuse map. */
  noNormal?: boolean;
  noRough?: boolean;
}

const local = (slug: string, id: string, nameKa: string, categorySlug: TextureEntry['categorySlug'], surfaces: Surface[], scaleM: number, styles: StyleId[], priceGel: number | undefined, storeSlug: string, extra: Partial<TextureEntry> = {}): TextureEntry =>
  ({ slug, source: 'local', id, nameKa, categorySlug, surfaces, scaleM, styles, priceGel, storeSlug, ...extra });
const ph = (slug: string, id: string, nameKa: string, categorySlug: TextureEntry['categorySlug'], surfaces: Surface[], scaleM: number, styles: StyleId[], priceGel: number | undefined, storeSlug: string, extra: Partial<TextureEntry> = {}): TextureEntry =>
  ({ slug, source: 'polyhaven', id, nameKa, categorySlug, surfaces, scaleM, styles, priceGel, storeSlug, ...extra });
const acg = (slug: string, id: string, nameKa: string, categorySlug: TextureEntry['categorySlug'], surfaces: Surface[], scaleM: number, styles: StyleId[], priceGel: number | undefined, storeSlug: string, extra: Partial<TextureEntry> = {}): TextureEntry =>
  ({ slug, source: 'ambientcg', id, nameKa, categorySlug, surfaces, scaleM, styles, priceGel, storeSlug, ...extra });

const LIBRARY: TextureEntry[] = [
  // --- wood floors (the calculator's laminates get the partner drop's floors) ---------
  local('laminate-light-oak-budget', 'wood-floor-light', 'ლამინატი „ღია მუხა“', 'laminate', ['floor'], 1.4, ['scandinavian', 'modern'], undefined, 'kartuli-aveji'),
  local('laminate-oak-classic-8mm', 'wood-floor-warm', 'ლამინატი „მუხა კლასიკი“ 8მმ', 'laminate', ['floor'], 1.5, ['vintage', 'scandinavian'], undefined, 'kartuli-aveji', { noRough: true }),
  local('laminate-grey-10mm', 'wood-floor-grey', 'ლამინატი „ნაცრისფერი მუხა“ 10მმ', 'laminate', ['floor'], 1.6, ['modern', 'industrial'], undefined, 'kartuli-aveji', { noNormal: true, noRough: true }),
  local('laminate-walnut-12mm', 'wood-floor-dark', 'ლამინატი „კაკალი“ 12მმ', 'laminate', ['floor'], 1.8, ['vintage', 'industrial'], undefined, 'kartuli-aveji', { noNormal: true, noRough: true }),
  ph('parquet-oak-herringbone', 'herringbone_parquet', 'პარკეტი „ქოქოსის ძვალი“ მუხა', 'laminate', ['floor'], 3.4, ['scandinavian', 'vintage', 'modern'], 64, 'kartuli-aveji'),
  ph('parquet-oak-rectangular', 'rectangular_parquet', 'პარკეტი მუხა, სწორკუთხა', 'laminate', ['floor'], 2.25, ['vintage', 'scandinavian'], 52, 'kartuli-aveji'),
  ph('laminate-brown-wide-plank', 'laminate_floor_02', 'ლამინატი ფართო ფიცარი, ყავისფერი', 'laminate', ['floor'], 1.7, ['modern', 'industrial', 'vintage'], 24, 'kartuli-aveji'),
  ph('floor-slate-polished', 'slate_floor', 'ფიქალის იატაკი, გაპრიალებული', 'floor-tiles', ['floor'], 2.3, ['industrial', 'modern'], 58, 'kartuli-aveji'),
  acg('floor-microcement-grey', 'Concrete034', 'მიკროცემენტი, ღია ნაცრისფერი', 'floor-tiles', ['floor', 'wall'], 2.5, ['industrial', 'modern'], 45, 'kartuli-aveji'),

  // --- bathroom and kitchen floor tiles -------------------------------------------------
  ph('porcelain-tile-60x60-beige', 'floor_tiles_08', 'კერამოგრანიტი 60×60 ბეჟი', 'floor-tiles', ['floor', 'wall'], 1.5, ALL, undefined, 'kartuli-aveji', { wet: true }),
  acg('ceramic-tile-60x120-anthracite', 'Tiles052', 'კერამიკული ფილა 60×120 ანტრაციტი', 'floor-tiles', ['floor', 'wall'], 1.2, ['modern', 'industrial'], undefined, 'kartuli-aveji', { wet: true }),
  ph('marble-effect-tile-80x80', 'marble_01', 'მარმარილოს ეფექტის ფილა 80×80', 'floor-tiles', ['floor', 'wall'], 1.5, ['modern', 'vintage'], undefined, 'kartuli-aveji', { wet: true }),
  ph('small-tile-30x30-grey', 'interior_tiles', 'ფილა 30×30 ნაცრისფერი', 'floor-tiles', ['floor'], 1.9, ALL, undefined, 'kartuli-aveji', { wet: true }),
  ph('floor-tile-terrazzo', 'terrazzo_tiles', 'ტერაცო ფილა', 'floor-tiles', ['floor', 'wall'], 2, ['scandinavian', 'modern'], 39, 'kartuli-aveji', { wet: true }),
  ph('floor-tile-checkerboard-marble', 'floor_tiles_06', 'ჭადრაკული მარმარილოს ფილა', 'floor-tiles', ['floor'], 3, ['vintage'], 42, 'kartuli-aveji', { wet: true }),
  ph('floor-tile-terracotta', 'terracotta_floor_tiles', 'ტერაკოტის ფილა', 'floor-tiles', ['floor'], 2.08, ['vintage', 'scandinavian'], 26, 'kartuli-aveji', { wet: true }),
  ph('floor-tile-large-grey', 'tiled_floor_001', 'დიდფორმატიანი ფილა, ნაცრისფერი', 'floor-tiles', ['floor', 'wall'], 1.5, ['industrial', 'modern'], 34, 'kartuli-aveji', { wet: true }),

  // --- walls: plaster and paint ----------------------------------------------------------
  acg('paint-tikkurila-white-9l', 'PaintedPlaster017', 'საღებავი Tikkurila თეთრი 9ლ', 'paint', ['wall'], 2.5, ALL, undefined, 'kartuli-aveji'),
  ph('paint-dulux-color-3l', 'beige_wall_001', 'საღებავი Dulux ბეჟი 3ლ', 'paint', ['wall'], 3, ['scandinavian', 'vintage'], undefined, 'kartuli-aveji'),
  local('paint-marshall-eco-5l', 'plaster-warm', 'საღებავი Marshall Eco თბილი 5ლ', 'paint', ['wall'], 2.8, ['scandinavian', 'modern'], undefined, 'kartuli-aveji', { noNormal: true, noRough: true }),
  acg('paint-budget-white-10l', 'Plaster002', 'საღებავი თეთრი, ეკონომ 10ლ', 'paint', ['wall'], 2, ALL, undefined, 'kartuli-aveji'),
  local('plaster-decorative-vintage', 'plaster-vintage', 'დეკორატიული ბათქაში „ვინტაჟი“', 'paint', ['wall'], 2.5, ['vintage'], 16, 'kartuli-aveji', { noNormal: true, noRough: true }),
  ph('plaster-grey-concrete-look', 'plaster_grey_04', 'ბათქაში ბეტონის ეფექტით', 'paint', ['wall'], 1.5, ['industrial', 'modern'], 19, 'kartuli-aveji'),

  // --- walls: coverings ------------------------------------------------------------------
  local('wall-brick-red-exposed', 'brick-01', 'ღია აგურის კედელი, წითელი', 'wall-tiles', ['wall'], 1.2, ['industrial', 'vintage'], 35, 'kartuli-aveji', { noRough: true }),
  local('wall-brick-variant-2', 'brick-03', 'აგურის კედელი, ვარიანტი 2', 'wall-tiles', ['wall'], 1.2, ['industrial'], 33, 'kartuli-aveji', { noRough: true }),
  local('wall-brick-variant-3', 'brick-05', 'აგურის კედელი, ვარიანტი 3', 'wall-tiles', ['wall'], 1.2, ['industrial', 'vintage'], 33, 'kartuli-aveji', { noRough: true }),
  local('wall-concrete-panel', 'concrete', 'ბეტონის პანელი', 'wall-tiles', ['wall'], 3, ['industrial'], 28, 'kartuli-aveji', { noNormal: true, noRough: true }),
  local('wallpaper-vintage-floral', 'wallpaper-vintage', 'შპალერი „ვინტაჟი“', 'wall-tiles', ['wall'], 1.2, ['vintage'], 24, 'textil-plus', { noNormal: true, noRough: true }),

  // --- bathroom wall tiles ----------------------------------------------------------------
  acg('wall-tile-glossy-white-25x40', 'Tiles036', 'კედლის ფილა თეთრი პრიალა 25×40', 'wall-tiles', ['wall'], 1, ALL, undefined, 'san-plus', { wet: true }),
  acg('wall-tile-marble-30x60', 'Tiles074', 'კედლის ფილა მარმარილო 30×60', 'wall-tiles', ['wall', 'floor'], 1.2, ['modern', 'vintage'], undefined, 'san-plus', { wet: true }),
  acg('wall-tile-mosaic-blue', 'Tiles132A', 'მოზაიკა ლურჯი', 'wall-tiles', ['wall'], 0.8, ['modern', 'scandinavian'], undefined, 'san-plus', { wet: true }),
  acg('wall-tile-textured-grey', 'Tiles133A', 'კედლის ფილა თეთრი, თანამედროვე', 'wall-tiles', ['wall'], 1.2, ['modern', 'industrial'], undefined, 'san-plus', { wet: true }),
  acg('wall-tile-hexagon-white', 'Tiles071', 'ექვსკუთხა მოზაიკა თეთრი', 'wall-tiles', ['wall', 'floor'], 1, ['scandinavian', 'modern'], 32, 'san-plus', { wet: true }),
  acg('wall-tile-subway-green', 'Tiles032', 'მეტროს ფილა მუქი მწვანე', 'wall-tiles', ['wall'], 1, ['vintage', 'scandinavian'], 30, 'san-plus', { wet: true }),
  acg('wall-tile-penny-round', 'Tiles129B', 'მრგვალი მოზაიკა „პენი“', 'wall-tiles', ['wall', 'floor'], 0.8, ['vintage', 'modern'], 34, 'san-plus', { wet: true }),
];

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);
  const entries = only ? LIBRARY.filter((e) => only.includes(e.slug)) : LIBRARY;
  const seen = new Set<string>();
  for (const e of LIBRARY) {
    if (seen.has(e.slug)) throw new Error(`duplicate slug ${e.slug}`);
    seen.add(e.slug);
  }

  await mkdir(TEX_DIR, { recursive: true });
  await mkdir(THUMB_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });

  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const categoryBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));
  const storeRows = await db.select({ id: stores.id, nameKa: stores.nameKa }).from(stores);
  const storeBySlug = new Map(storeRows.map((s) => [storeSlugFor(s.nameKa), s.id]));

  let written = 0;
  const failed: string[] = [];
  for (const entry of entries) {
    process.stdout.write(`→ ${entry.slug.padEnd(34)}`);
    try {
      const maps = await materialise(entry);
      const thumb = await thumbnail(maps.diffuse, entry.slug);
      await upsert(entry, maps, thumb, categoryBySlug, storeBySlug);
      written++;
      console.log(`${maps.normal ? 'diffuse+normal' : 'diffuse'}${maps.rough ? '+rough' : ''}  ${entry.surfaces.join('/')}${entry.wet ? ' wet' : ''}  ${entry.scaleM} m`);
    } catch (error) {
      failed.push(entry.slug);
      console.log(`  ✗ ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${written} finishes in the catalogue${failed.length ? ` · ${failed.length} failed: ${failed.join(', ')}` : ''}`);
  await pool.end();
  if (failed.length) process.exitCode = 1;
}

interface Maps {
  diffuse: string;
  normal: string | null;
  rough: string | null;
}

/** Puts the three maps in public/textures under a predictable name and returns their URLs. */
async function materialise(entry: TextureEntry): Promise<Maps> {
  const base = entry.source === 'local' ? entry.id : `${entry.source === 'polyhaven' ? 'ph' : 'acg'}-${entry.id}`;
  const out = (kind: string) => path.join(TEX_DIR, `${base}-${kind}.jpg`);
  const url = (kind: string) => `/textures/${base}-${kind}.jpg`;

  if (entry.source === 'local') {
    // The partner drop's floors and bricks are `name-diffuse.jpg`; its plasters and the
    // concrete are plain `name.jpg`. Either is the colour map.
    const plain = path.join(TEX_DIR, `${base}.jpg`);
    const diffuse = existsSync(out('diffuse')) ? url('diffuse') : existsSync(plain) ? `/textures/${base}.jpg` : null;
    if (!diffuse) throw new Error(`missing public/textures/${base}(-diffuse).jpg — run pnpm assets:extract`);
    return {
      diffuse,
      normal: !entry.noNormal && existsSync(out('normal')) ? url('normal') : null,
      rough: !entry.noRough && existsSync(out('rough')) ? url('rough') : null,
    };
  }

  if (!existsSync(out('diffuse'))) {
    if (entry.source === 'polyhaven') {
      const files = JSON.parse(Buffer.from(await fetchBytes(`https://api.polyhaven.com/files/${entry.id}`)).toString('utf8')) as Record<string, Record<string, Record<string, { url: string }>>>;
      const pick = (key: string) => files[key]?.['1k']?.jpg?.url ?? null;
      const diffuse = pick('Diffuse');
      if (!diffuse) throw new Error('no 1k diffuse on Poly Haven');
      await writeFile(out('diffuse'), await fetchBytes(diffuse));
      const normal = pick('nor_gl');
      if (normal) await writeFile(out('normal'), await fetchBytes(normal));
      const rough = pick('Rough');
      if (rough) await writeFile(out('rough'), await fetchBytes(rough));
    } else {
      const zip = path.join(CACHE_DIR, `${entry.id}_1K-JPG.zip`);
      if (!existsSync(zip)) await writeFile(zip, await fetchBytes(`https://ambientcg.com/get?file=${entry.id}_1K-JPG.zip`));
      const work = path.join(CACHE_DIR, entry.id);
      await mkdir(work, { recursive: true });
      await run('unzip', ['-q', '-o', zip, '*_Color.jpg', '*_NormalGL.jpg', '*_Roughness.jpg', '-d', work]);
      const find = async (suffix: string) => {
        const name = `${entry.id}_1K-JPG_${suffix}.jpg`;
        return existsSync(path.join(work, name)) ? path.join(work, name) : null;
      };
      const color = await find('Color');
      if (!color) throw new Error('zip has no Color map');
      await copyFile(color, out('diffuse'));
      const normal = await find('NormalGL');
      if (normal) await copyFile(normal, out('normal'));
      const rough = await find('Roughness');
      if (rough) await copyFile(rough, out('rough'));
      await rm(work, { recursive: true, force: true });
    }
  }
  return {
    diffuse: url('diffuse'),
    normal: existsSync(out('normal')) ? url('normal') : null,
    rough: existsSync(out('rough')) ? url('rough') : null,
  };
}

/** A small square of the texture is the product photo — it is what the customer would see. */
async function thumbnail(diffuseUrl: string, slug: string): Promise<string> {
  const src = path.join(ROOT, 'public', diffuseUrl);
  const out = path.join(THUMB_DIR, `tex-${slug}.jpg`);
  await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '360', src, '--out', out]);
  return `/uploads/products/tex-${slug}.jpg`;
}

async function upsert(
  entry: TextureEntry,
  maps: Maps,
  thumb: string,
  categoryBySlug: Map<string, number>,
  storeBySlug: Map<string, number>
) {
  const categoryId = categoryBySlug.get(entry.categorySlug);
  if (!categoryId) throw new Error(`no category ${entry.categorySlug}`);
  const existing = await db.select().from(products).where(eq(products.slug, entry.slug)).limit(1);
  const specs = {
    ...((existing[0]?.specs as Record<string, unknown> | null) ?? {}),
    surfaces: entry.surfaces,
    wet: !!entry.wet,
    textureScaleM: entry.scaleM,
    normalUrl: maps.normal,
    roughnessUrl: maps.rough,
    source: entry.source,
    license: 'CC0',
  };
  const shared = {
    textureUrl: maps.diffuse,
    imageUrl: thumb,
    specs,
    styleTags: entry.styles,
    tags: [...entry.styles, ...entry.surfaces, ...(entry.wet ? ['bathroom'] : [])],
    isActive: true,
  };
  if (existing.length) {
    // A calculator product keeps its price, unit and coverage; it only gains a texture.
    await db.update(products).set(shared).where(eq(products.id, existing[0].id));
    return;
  }
  if (entry.priceGel == null) throw new Error('a new product needs a price');
  await db.insert(products).values({
    ...shared,
    categoryId,
    storeId: storeBySlug.get(entry.storeSlug) ?? null,
    nameKa: entry.nameKa,
    nameEn: humanizeSlug(entry.slug),
    slug: entry.slug,
    sku: `TX-${entry.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`,
    pricePerUnit: String(entry.priceGel),
    unit: 'm2',
    coveragePerUnit: '1',
    brand: entry.source === 'polyhaven' ? 'Poly Haven' : entry.source === 'ambientcg' ? 'ambientCG' : null,
    isFeatured: false,
  });
}

function storeSlugFor(nameKa: string): string {
  const known: Record<string, string> = {
    'ქართული ავეჯი': 'kartuli-aveji',
    'Nordic Home Tbilisi': 'nordic-home',
    'LOFT 42': 'loft-42',
    'Domus Interior': 'domus-interior',
    'ანტიკვარი — ვინტაჟის სალონი': 'antikvari',
    'ლუმინა განათება': 'lumina',
    'ტექსტილ+ ხალიჩები': 'textil-plus',
    'სან-პლუს სანტექნიკა': 'san-plus',
  };
  return known[nameKa] ?? nameKa.toLowerCase().replace(/\s+/g, '-');
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 200)}`))));
  });
}


main().catch(async (error) => {
  console.error('✗ textures failed:', error);
  await pool.end();
  process.exit(1);
});
