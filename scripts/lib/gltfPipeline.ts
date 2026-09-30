/**
 * What the pipelines that fetch other people's models share (`scripts/equipment-models.ts`,
 * `scripts/kitchen-models.ts`): fetching and caching a source (Poly Haven, poly.pizza, a
 * Sketchfab upload from its Objaverse mirror), the credit its licence asks for, and the glTF
 * steps — picking nodes, flattening and simplifying, turning, texture re-encoding, material
 * names the studio will not light up.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Document, Logger, NodeIO, type Node as GltfNode, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dequantize, draco, getBounds, getTextureColorSpace, prune, simplify } from '@gltf-transform/functions';
import draco3d from 'draco3d';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { dracoOptions } from '../../lib/uploads/glbOptimize';

export const USER_AGENT = 'RenovationRoom-asset-fetch/1.0 (+https://remonti.ge)';
export const OBJAVERSE = 'https://huggingface.co/datasets/allenai/objaverse/resolve/main';
/** What a material may not be called: the studio makes these glow when a light is on (`LIT_MATERIAL` in lib/design3d/buildStructure.ts). */
export const LIT_WORDS = /light|lamp|glow|bulb|emiss|led|tube|shade/gi;
/** A frame's tolerance: half a millimetre. */
export const FRAME_TOLERANCE_M = 0.0005;

export type Axis = 'x' | 'y' | 'z';

export type ModelSource =
  | { type: 'polyhaven'; id: string }
  | { type: 'polypizza'; id: string; url: string; title: string; author: string; license: string }
  /** A Sketchfab upload, fetched from its Objaverse mirror (`path` inside the dataset). */
  | { type: 'sketchfab'; uid: string; path: string; title: string; author: string; license: string };

/** The attribution a CC BY / CC BY-SA licence asks for, with a ready-made line. */
export interface ModelCredit {
  title: string;
  author: string;
  license: string;
  url: string;
  via?: string;
  text: string;
}

export function newIO(): NodeIO {
  return new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

// ---------------------------------------------------------------------------
// Draco
// ---------------------------------------------------------------------------

let dracoCodec: Promise<{ encoder: unknown; decoder: unknown }> | null = null;

/** An IO that reads and writes Draco geometry as well as meshopt (Draco's codec is WASM, made once). */
export async function modelIO(): Promise<NodeIO> {
  dracoCodec ??= Promise.all([draco3d.createEncoderModule({}), draco3d.createDecoderModule({})]).then(([encoder, decoder]) => ({ encoder, decoder }));
  const { encoder, decoder } = await dracoCodec;
  return newIO().registerDependencies({ 'draco3d.encoder': encoder, 'draco3d.decoder': decoder });
}

/**
 * Geometry under this stays meshopt: in the browser every Draco primitive is a round trip to a
 * decoder worker, and a socket's 6 KB of geometry would save 3 at best.
 */
export const DRACO_MIN_GEOMETRY_BYTES = 24 * 1024;

/**
 * The document's geometry compressed with Draco instead of meshopt (write it with `modelIO`), at
 * the upload recipe's settings (`dracoOptions` in lib/uploads/glbOptimize.ts), so shipped models
 * and uploads match.
 */
export async function toDraco(doc: Document): Promise<void> {
  for (const extension of doc.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === 'EXT_meshopt_compression') extension.dispose();
  }
  await doc.transform(dequantize());
  await doc.transform(draco(dracoOptions(doc)));
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Poly Haven's 1k glTF with its textures, cached; returns the .gltf path. */
export async function fetchPolyHaven(cacheDir: string, id: string): Promise<string> {
  const dir = path.join(cacheDir, 'polyhaven', id);
  const gltf = path.join(dir, `${id}_1k.gltf`);
  if (existsSync(gltf)) return gltf;
  await mkdir(dir, { recursive: true });
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

/** One file fetched once. */
export async function fetchCached(cacheDir: string, folder: string, name: string, url: string): Promise<string> {
  const file = path.join(cacheDir, folder, name);
  if (existsSync(file)) return file;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, await fetchBytes(url));
  return file;
}

export function fetchSource(cacheDir: string, source: ModelSource): Promise<string> {
  if (source.type === 'polyhaven') return fetchPolyHaven(cacheDir, source.id);
  if (source.type === 'polypizza') return fetchCached(cacheDir, 'polypizza', `${source.id}.glb`, source.url);
  return fetchCached(cacheDir, 'objaverse', `${source.uid}.glb`, `${OBJAVERSE}/${source.path}`);
}

export function creditOf(source: ModelSource, changes = 'resized, re-oriented and simplified for RenovateGE'): ModelCredit {
  if (source.type === 'polyhaven') {
    const url = `https://polyhaven.com/a/${source.id}`;
    const title = source.id.replace(/_/g, ' ');
    return { title, author: 'Poly Haven', license: 'CC0', url, text: `“${title}” by Poly Haven (${url}), CC0` };
  }
  const url = source.type === 'polypizza' ? `https://poly.pizza/m/${source.id}` : `https://sketchfab.com/3d-models/${source.uid}`;
  const via = source.type === 'sketchfab' ? 'Objaverse (huggingface.co/datasets/allenai/objaverse)' : undefined;
  const text = `“${source.title}” by ${source.author} (${url}), ${source.license.replace(/^CC-/, 'CC ')}; ${changes}`;
  return { title: source.title, author: source.author, license: source.license, url, ...(via ? { via } : {}), text };
}

// ---------------------------------------------------------------------------
// glTF steps
// ---------------------------------------------------------------------------

/** Every node holding a mesh, with its path of names from the scene down. */
export function meshNodes(doc: Document): Array<{ node: GltfNode; path: string }> {
  const out: Array<{ node: GltfNode; path: string }> = [];
  const walk = (node: GltfNode, prefix: string) => {
    const here = `${prefix}/${node.getName()}`;
    if (node.getMesh()) out.push({ node, path: here });
    for (const child of node.listChildren()) walk(child, here);
  };
  for (const scene of doc.getRoot().listScenes()) for (const node of scene.listChildren()) walk(node, '');
  return out;
}

export function countTriangles(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) n += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
  }
  return Math.round(n);
}

export function boundsOf(doc: Document): { min: number[]; max: number[] } {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  return getBounds(scene);
}

export function listPrimitives(doc: Document): Primitive[] {
  return doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
}

/** Meshopt's simplifier in up to three passes of growing error, until the model is near `target` triangles. */
export async function simplifyTowards(doc: Document, target: number): Promise<void> {
  for (const error of [0.003, 0.008, 0.02]) {
    const current = countTriangles(doc);
    if (current <= target * 1.2) break;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / current, error }));
  }
  await doc.transform(prune());
}

/** A right-handed turn about an axis. */
export function turnFn(axis: Axis, degrees: number): (p: number[]) => number[] {
  const a = (degrees * Math.PI) / 180;
  const c = Math.round(Math.cos(a) * 1e12) / 1e12;
  const s = Math.round(Math.sin(a) * 1e12) / 1e12;
  if (axis === 'x') return (p) => [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
  if (axis === 'y') return (p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  return (p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

export function transformPositions(doc: Document, fn: (p: number[]) => number[]): void {
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

export function transformNormals(doc: Document, fn: (n: number[]) => number[]): void {
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
export function transformAll(doc: Document, fn: (p: number[]) => number[]): void {
  transformPositions(doc, fn);
  transformNormals(doc, fn);
  // A reflection turns the winding inside out; flip the indices back.
  const [a, b, c] = [fn([1, 0, 0]), fn([0, 1, 0]), fn([0, 0, 1])];
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (det < 0) {
    const done = new Set<object>();
    for (const prim of listPrimitives(doc)) {
      const indices = prim.getIndices();
      if (!indices || done.has(indices)) continue;
      done.add(indices);
      const array = Array.from(indices.getArray()!);
      for (let i = 0; i + 2 < array.length; i += 3) [array[i + 1], array[i + 2]] = [array[i + 2], array[i + 1]];
      indices.setArray(indices.getArray() instanceof Uint16Array ? Uint16Array.from(array) : Uint32Array.from(array));
    }
  }
}

export function bakeNodeTransforms(doc: Document): void {
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
    // Normals by the inverse transpose, so a model scaled unevenly still shades right.
    const inv = normalMatrix(m);
    const transformNormal = (d: number[]) => {
      const v = [inv[0] * d[0] + inv[1] * d[1] + inv[2] * d[2], inv[3] * d[0] + inv[4] * d[1] + inv[5] * d[2], inv[6] * d[0] + inv[7] * d[1] + inv[8] * d[2]];
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / len, v[1] / len, v[2] / len];
    };
    const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
    const done = new Set<object>();
    for (const prim of target.listPrimitives()) {
      for (const semantic of ['POSITION', 'NORMAL']) {
        const accessor = prim.getAttribute(semantic);
        if (!accessor || done.has(accessor)) continue;
        if (accessor.listParents().filter((p) => p.propertyType === 'Primitive').length > 1) prim.setAttribute(semantic, accessor.clone());
        const own = prim.getAttribute(semantic)!;
        done.add(own);
        const array = Float32Array.from(own.getArray()!);
        for (let i = 0; i < array.length; i += 3) {
          const out = semantic === 'POSITION' ? transformPoint([array[i], array[i + 1], array[i + 2]]) : transformNormal([array[i], array[i + 1], array[i + 2]]);
          array[i] = out[0];
          array[i + 1] = out[1];
          array[i + 2] = out[2];
        }
        own.setArray(array);
      }
      // A mirroring transform turns the winding inside out; flip it back.
      const indices = prim.getIndices();
      if (det < 0 && indices && !done.has(indices)) {
        done.add(indices);
        const array = Array.from(indices.getArray()!);
        for (let i = 0; i + 2 < array.length; i += 3) [array[i + 1], array[i + 2]] = [array[i + 2], array[i + 1]];
        indices.setArray(indices.getArray() instanceof Uint16Array ? Uint16Array.from(array) : Uint32Array.from(array));
      }
    }
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
}

/** The transpose of the inverse of a column-major 4×4's upper 3×3, row-major: what carries normals. */
function normalMatrix(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C || 1;
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
}

/** Every texture as WebP (what the upload recipe writes, `lib/uploads/glbOptimize.ts`), colour maps up to `colourPx` and data maps `dataPx`. */
export async function compressTextures(doc: Document, options: { colourPx: number; dataPx: number; quality: number }): Promise<void> {
  const textures = doc.getRoot().listTextures();
  if (textures.length === 0) return;
  for (const texture of textures) {
    const image = texture.getImage();
    if (!image) continue;
    const px = getTextureColorSpace(texture) === 'srgb' ? options.colourPx : options.dataPx;
    const out = await sharp(image).resize(px, px, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' }).webp({ quality: options.quality }).toBuffer();
    texture.setImage(new Uint8Array(out.buffer, out.byteOffset, out.byteLength)).setMimeType('image/webp').setURI('');
  }
  doc.createExtension(EXTTextureWebP).setRequired(true);
}

/** `panel-12` + `Hood_light 2` → `panel-12-hood-part-2`: readable, and nothing the studio lights up. */
export function materialName(slug: string, original: string): string {
  const clean = (original || 'material').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(LIT_WORDS, 'part') || 'material';
  return `${slug}-${clean}`;
}

export function hasLitWord(name: string): boolean {
  return new RegExp(LIT_WORDS.source, 'i').test(name);
}

/** sRGB hex → linear RGB, the way glTF colour factors are stored. */
export function linearColor(hex: string): [number, number, number] {
  const channel = (at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
}
