/**
 * The 3D models of the electrical layer — sockets, switches, wall lamps, the bare bulb of a
 * ceiling point — fetched from their sources, cleaned up and normalised for the studio.
 *
 *   pnpm models:fixtures                 → public/models/fixtures/*.glb + manifest.json
 *                                          + lib/design3d/fixtureManifest.ts (the same data, typed)
 *   pnpm models:fixtures --only=switch   → redo one entry; merges into the manifest
 *
 * Sources (all free to use; the licence and author travel in the manifest):
 *
 *   - Poly Haven (CC0): photoscanned lamps with real PBR maps, in metres.
 *   - poly.pizza (CC-BY 3.0, Google Poly archive and community uploads): the low-poly
 *     sockets and switches nobody scans. Sized here, because their files are in arbitrary
 *     units.
 *
 * Every output stands in the fixture's own frame: a wall fixture is centred on x and y with
 * its back on z = 0 and its front along +z (into the room, like `edge.facing` expects); a
 * ceiling fixture is centred on x and z with its top at y = 0, hanging down. The studio
 * places the group at the point and turns it to the wall; nothing else is scaled.
 */

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Document, NodeIO, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, getBounds, join, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import type { ElectricalKind } from '../lib/design/types';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'models', 'fixtures');
const PHOTO_DIR = path.join(ROOT, 'public', 'uploads', 'furniture');
const TS_OUT = path.join(ROOT, 'lib', 'design3d', 'fixtureManifest.ts');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'renovate-fixtures');
const USER_AGENT = 'RenovationRoom-asset-fetch/1.0 (+https://remonti.ge)';
const TARGET_TRIANGLES = 6_000;
const MAX_BYTES = 900 * 1024;

type Mount = 'wall' | 'ceiling';

interface FixtureEntry {
  slug: string;
  /** The electrical kinds drawn with this model. */
  kinds: ElectricalKind[];
  mount: Mount;
  source:
    | { type: 'polyhaven'; id: string }
    | { type: 'polypizza'; id: string; url: string; title: string; author: string; license: string };
  /** Real size to scale to (uniform, by the largest of width and height); Poly Haven files are already in metres. */
  sizeCm?: { width: number; height: number };
  /** Turn about Y (degrees) after the automatic orientation, when the face comes out wrong. */
  yawDegrees?: number;
  /** Turn upside down (a bulb modelled standing that has to hang). */
  flipY?: boolean;
  /** Thin plates are turned so their thin axis is the depth; set when the file already faces +z. */
  keepAxes?: boolean;
  /** Sold as this product in the catalogue (`pnpm models:seed` writes it). */
  product?: { kind: string; categorySlug: 'sockets-switches' | 'lighting'; priceGel: number; storeSlug: string; nameKa: string; nameEn: string; nameRu: string };
}

const FIXTURES: FixtureEntry[] = [
  {
    slug: 'socket-eu',
    kinds: ['socket', 'socket_double', 'socket_high', 'socket_kitchen', 'internet', 'tv'],
    mount: 'wall',
    source: { type: 'polypizza', id: 'MCMUq7R1w5', url: 'https://static.poly.pizza/b7766164-b6f8-471d-bfaa-bdc45dce1487.glb', title: 'EU Outlet', author: 'J-Toastie', license: 'CC-BY 3.0' },
    sizeCm: { width: 8, height: 8 },
    product: { kind: 'socket', categorySlug: 'sockets-switches', priceGel: 18, storeSlug: 'lumina', nameKa: 'როზეტი „EU“ — თეთრი', nameEn: 'Socket "EU" — white', nameRu: 'Розетка «EU» — белая' },
  },
  {
    slug: 'switch',
    kinds: ['switch'],
    mount: 'wall',
    source: { type: 'polypizza', id: '8sR1PkyAg-F', url: 'https://static.poly.pizza/f502ad13-cde0-411b-8d8a-18fb4f58c0e6.glb', title: 'Light switch', author: 'Poly by Google', license: 'CC-BY 3.0' },
    sizeCm: { width: 8, height: 8 },
    product: { kind: 'switch', categorySlug: 'sockets-switches', priceGel: 22, storeSlug: 'lumina', nameKa: 'ჩამრთველი — თეთრი', nameEn: 'Light switch — white', nameRu: 'Выключатель — белый' },
  },
  {
    slug: 'wall-lamp',
    kinds: ['light_wall'],
    mount: 'wall',
    source: { type: 'polyhaven', id: 'industrial_wall_lamp' },
    keepAxes: true,
    product: { kind: 'light_wall', categorySlug: 'lighting', priceGel: 140, storeSlug: 'lumina', nameKa: 'კედლის სანათი „Industrial“', nameEn: 'Wall lamp "Industrial"', nameRu: 'Бра «Industrial»' },
  },
  {
    slug: 'bulb',
    kinds: ['light_ceiling'],
    mount: 'ceiling',
    source: { type: 'polyhaven', id: 'lightbulb_led' },
    flipY: true,
    keepAxes: true,
    product: { kind: 'light_ceiling', categorySlug: 'lighting', priceGel: 45, storeSlug: 'lumina', nameKa: 'ჭერის სანათი — LED ნათურა', nameEn: 'Ceiling light — LED bulb', nameRu: 'Потолочный светильник — LED лампа' },
  },
];

export interface FixtureManifestModel {
  slug: string;
  kinds: ElectricalKind[];
  mount: Mount;
  url: string;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  triangles: number;
  bytes: number;
  source: 'polyhaven' | 'polypizza';
  sourceUrl: string;
  title: string;
  author: string;
  license: string;
  /** The product's photo, under /uploads/furniture. */
  imageUrl: string | null;
  /** The catalogue product this model is sold as, when it is one. */
  product?: { kind: string; categorySlug: string; priceGel: number; storeSlug: string; nameKa: string; nameEn: string; nameRu: string };
}

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const entries = only ? FIXTURES.filter((e) => only.includes(e.slug)) : FIXTURES;
  if (entries.length === 0) throw new Error(`nothing matches --only=${only?.join(',')}`);
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(PHOTO_DIR, { recursive: true });

  const models: FixtureManifestModel[] = [];
  const failed: string[] = [];
  for (const entry of entries) {
    process.stdout.write(`• ${entry.slug} `);
    try {
      const model = await convertOne(entry);
      models.push(model);
      console.log(`✓ ${model.widthCm}×${model.heightCm}×${model.depthCm} cm · ${model.triangles} tris · ${(model.bytes / 1024).toFixed(0)} KB`);
    } catch (error) {
      failed.push(`${entry.slug} — ${(error as Error).message}`);
      console.log(`✗ ${(error as Error).message}`);
    }
  }

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  let all = models;
  if (only && existsSync(manifestPath)) {
    const previous = (JSON.parse(await readFile(manifestPath, 'utf8')) as { models: FixtureManifestModel[] }).models;
    all = [...previous.filter((m) => !models.some((n) => n.slug === m.slug)), ...models];
    all.sort((a, b) => FIXTURES.findIndex((e) => e.slug === a.slug) - FIXTURES.findIndex((e) => e.slug === b.slug));
  }
  await writeFile(
    manifestPath,
    JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), note: 'Written by scripts/fixture-models.ts. The electrical layer’s fixtures: wall models centred on x/y with the back on z = 0 and the front along +z; ceiling models centred on x/z with the top at y = 0.', models: all }, null, 2) + '\n'
  );
  await writeFile(
    TS_OUT,
    `/**\n * Generated by scripts/fixture-models.ts — do not edit. The electrical layer's 3D fixtures\n * (public/models/fixtures), one entry per model with the kinds it stands for.\n */\n\nimport type { ElectricalKind } from '@/lib/design/types';\n\nexport interface FixtureModel {\n  slug: string;\n  kinds: ElectricalKind[];\n  mount: 'wall' | 'ceiling';\n  url: string;\n  widthCm: number;\n  heightCm: number;\n  depthCm: number;\n  license: string;\n  author: string;\n}\n\nexport const FIXTURE_MODELS: FixtureModel[] = ${JSON.stringify(
      all.map(({ slug, kinds, mount, url, widthCm, heightCm, depthCm, license, author }) => ({ slug, kinds, mount, url, widthCm, heightCm, depthCm, license, author })),
      null,
      2
    )};\n`
  );
  console.log(`\n${all.length} fixtures in manifest · ${path.relative(ROOT, OUT_DIR)}`);
  if (failed.length) {
    console.log(`\n${failed.length} failed:\n${failed.map((f) => `  · ${f}`).join('\n')}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Poly Haven's 1k glTF with its textures, cached; returns the .gltf path. */
async function fetchPolyHaven(id: string): Promise<string> {
  const dir = path.join(CACHE_DIR, 'polyhaven', id);
  const gltf = path.join(dir, `${id}_1k.gltf`);
  if (existsSync(gltf)) return gltf;
  await mkdir(path.join(dir, 'textures'), { recursive: true });
  const files = JSON.parse(Buffer.from(await fetchBytes(`https://api.polyhaven.com/files/${id}`)).toString('utf8')) as {
    gltf?: Record<string, { gltf: { url: string; include: Record<string, { url: string }> } }>;
  };
  const level = files.gltf?.['1k']?.gltf;
  if (!level) throw new Error('Poly Haven has no 1k glTF for this asset');
  const jobs: Array<Promise<void>> = [fetchBytes(level.url).then((data) => writeFile(`${gltf}.part`, data))];
  for (const [name, file] of Object.entries(level.include)) {
    const out = path.join(dir, name);
    jobs.push(
      mkdir(path.dirname(out), { recursive: true })
        .then(() => fetchBytes(file.url))
        .then((data) => writeFile(out, data))
    );
  }
  await Promise.all(jobs);
  await writeFile(gltf, await readFile(`${gltf}.part`));
  await rm(`${gltf}.part`, { force: true });
  return gltf;
}

/** A poly.pizza GLB, cached. */
async function fetchPolyPizza(id: string, url: string): Promise<string> {
  const file = path.join(CACHE_DIR, 'polypizza', `${id}.glb`);
  if (existsSync(file)) return file;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, await fetchBytes(url));
  return file;
}

// ---------------------------------------------------------------------------
// One model
// ---------------------------------------------------------------------------

async function convertOne(entry: FixtureEntry): Promise<FixtureManifestModel> {
  const source = entry.source.type === 'polyhaven' ? await fetchPolyHaven(entry.source.id) : await fetchPolyPizza(entry.source.id, entry.source.url);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(source);

  await doc.transform(dedup(), flatten());
  await doc.transform(join({ keepNamed: false, keepMeshes: false }), weld(), prune());
  bakeNodeTransforms(doc);

  for (const error of [0.003, 0.008, 0.02]) {
    const current = countTriangles(doc);
    if (current <= TARGET_TRIANGLES * 1.2) break;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_TRIANGLES / current, error }));
  }
  await doc.transform(prune());

  // --- orient ---------------------------------------------------------------
  if (entry.flipY) transformAll(doc, (p) => [p[0], -p[1], -p[2]]);
  if (!entry.keepAxes) {
    // A plate: its thinnest axis is the depth, which has to be z.
    const b = boundsOf(doc);
    const size = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
    const thin = size.indexOf(Math.min(...size));
    if (thin === 0) transformAll(doc, (p) => [-p[2], p[1], p[0]]);
    else if (thin === 1) transformAll(doc, (p) => [p[0], -p[2], p[1]]);
  }
  if (entry.yawDegrees) {
    const a = (entry.yawDegrees * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    transformAll(doc, (p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]);
  }

  // --- size -----------------------------------------------------------------
  let b = boundsOf(doc);
  let size = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  if (entry.sizeCm) {
    const scale = Math.max(entry.sizeCm.width, entry.sizeCm.height) / 100 / Math.max(size[0], size[1]);
    transformPositions(doc, (p) => [p[0] * scale, p[1] * scale, p[2] * scale]);
    b = boundsOf(doc);
    size = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  }

  // --- frame ----------------------------------------------------------------
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  if (entry.mount === 'wall') transformPositions(doc, (p) => [p[0] - cx, p[1] - cy, p[2] - b.min[2]]);
  else transformPositions(doc, (p) => [p[0] - cx, p[1] - b.max[1], p[2] - cz]);

  const triangles = countTriangles(doc);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT_DIR, `${entry.slug}.glb`);
  await io.write(out, doc);
  let { size: bytes } = await stat(out);
  if (bytes > MAX_BYTES) {
    await shrinkTextures(doc, 512);
    await io.write(out, doc);
    ({ size: bytes } = await stat(out));
  }

  const src = entry.source;
  const imageUrl = await placePhoto(entry);
  return {
    slug: entry.slug,
    kinds: entry.kinds,
    mount: entry.mount,
    url: `/models/fixtures/${entry.slug}.glb`,
    widthCm: Math.round(size[0] * 100),
    heightCm: Math.round(size[1] * 100),
    depthCm: Math.round(size[2] * 100),
    triangles,
    bytes,
    source: src.type,
    sourceUrl: src.type === 'polyhaven' ? `https://polyhaven.com/a/${src.id}` : `https://poly.pizza/m/${src.id}`,
    title: src.type === 'polyhaven' ? src.id.replace(/_/g, ' ') : src.title,
    author: src.type === 'polyhaven' ? 'Poly Haven' : src.author,
    license: src.type === 'polyhaven' ? 'CC0' : src.license,
    imageUrl,
    ...(entry.product ? { product: entry.product } : {}),
  };
}

/** The source's own render of the model, kept as the product photo. */
async function placePhoto(entry: FixtureEntry): Promise<string | null> {
  const src = entry.source;
  const url = src.type === 'polyhaven' ? `https://cdn.polyhaven.com/asset_img/primary/${src.id}.png?width=600` : src.url.replace(/\.glb$/, '.jpg');
  const ext = src.type === 'polyhaven' ? 'png' : 'jpg';
  const file = path.join(PHOTO_DIR, `fixture-${entry.slug}.${ext}`);
  try {
    if (!existsSync(file)) await writeFile(file, await fetchBytes(url));
    return `/uploads/furniture/fixture-${entry.slug}.${ext}`;
  } catch (error) {
    console.warn(`(no photo: ${(error as Error).message}) `);
    return null;
  }
}

// ---------------------------------------------------------------------------
// glTF helpers (the same ones the stock script uses)
// ---------------------------------------------------------------------------

function countTriangles(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) n += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
  }
  return Math.round(n);
}

function boundsOf(doc: Document): { min: number[]; max: number[] } {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  return getBounds(scene);
}

function listPrimitives(doc: Document): Primitive[] {
  return doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
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
    const accessor = prim.getAttribute('NORMAL');
    if (!accessor || done.has(accessor)) continue;
    done.add(accessor);
    const array = Float32Array.from(accessor.getArray()!);
    for (let i = 0; i < array.length; i += 3) {
      const [x, y, z] = fn([array[i], array[i + 1], array[i + 2]]);
      const len = Math.hypot(x, y, z) || 1;
      array[i] = x / len;
      array[i + 1] = y / len;
      array[i + 2] = z / len;
    }
    accessor.setArray(array);
  }
}

/** A rotation or reflection applied to positions and normals alike. */
function transformAll(doc: Document, fn: (p: number[]) => number[]): void {
  transformPositions(doc, fn);
  transformNormals(doc, fn);
  // A reflection turns the winding inside out; flip the indices back.
  const det = determinant(fn);
  if (det < 0) {
    for (const prim of listPrimitives(doc)) {
      const indices = prim.getIndices();
      if (!indices) continue;
      const array = Array.from(indices.getArray()!);
      for (let i = 0; i + 2 < array.length; i += 3) [array[i + 1], array[i + 2]] = [array[i + 2], array[i + 1]];
      indices.setArray(indices.getArray() instanceof Uint16Array ? Uint16Array.from(array) : Uint32Array.from(array));
    }
  }
}

function determinant(fn: (p: number[]) => number[]): number {
  const [a, b, c] = [fn([1, 0, 0]), fn([0, 1, 0]), fn([0, 0, 1])];
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function bakeNodeTransforms(doc: Document): void {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix();
    const identity = matrix.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9);
    if (identity) continue;
    const owners = mesh.listParents().filter((p) => p.propertyType === 'Node');
    const target = owners.length > 1 ? mesh.clone() : mesh;
    if (target !== mesh) node.setMesh(target);
    const m = matrix;
    const transformPoint = (p: number[]) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
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
        if (accessor.listParents().filter((p) => p.propertyType === 'Primitive').length > 1) prim.setAttribute(semantic, accessor.clone());
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

async function shrinkTextures(doc: Document, px: number): Promise<void> {
  const work = await mkdtemp(path.join(os.tmpdir(), 'rr-fixture-tex-'));
  try {
    let i = 0;
    for (const texture of doc.getRoot().listTextures()) {
      const image = texture.getImage();
      if (!image) continue;
      const ext = texture.getMimeType() === 'image/png' ? 'png' : 'jpg';
      const src = path.join(work, `${i}.${ext}`);
      const dst = path.join(work, `${i}-small.${ext}`);
      i++;
      await writeFile(src, image);
      await run('sips', ext === 'png' ? ['-Z', String(px), src, '--out', dst] : ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', String(px), src, '--out', dst]);
      texture.setImage(new Uint8Array(await readFile(dst)));
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
