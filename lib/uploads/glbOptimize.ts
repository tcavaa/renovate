/**
 * Makes an uploaded GLB as light as the models the import scripts make, without changing
 * what it looks like. One recipe for both upload routes (`glbOptimizeServer.ts`, sharp) and for
 * the uploader's browser, which runs it first so that what crosses the network is already
 * small (`glbOptimizeBrowser.ts`, a canvas).
 *
 * What an upload is made of: a Meshy export is three 2048-pixel JPEGs (4–5 MB) beside 1–4 MB
 * of 32-bit geometry with nothing compressed; 5–10 MB for one sideboard, where a converted
 * partner model is 0.8 MB. The recipe:
 *
 * - **Geometry** — duplicates merged, vertices welded, simplified only as far as 0.01 % of
 *   the model's size (coplanar triangles merge, nothing visible moves), and taken down to
 *   `maxTriangles` within 0.2 % if it is still heavier than that (a 490 000-triangle scan).
 *   Then compressed: Draco (`KHR_draco_mesh_compression`) on the server, whose encoder it has
 *   and whose file is what is stored — about 40 % of meshopt's geometry as the studio serves
 *   it — and meshopt (`EXT_meshopt_compression`) in the uploader's browser, whose pass only
 *   has to make the file small enough to send. The studio's loader decodes both.
 * - **Textures** — WebP (`EXT_texture_webp`). The colour map keeps up to 2048 px: AI-made
 *   models pack it into hundreds of patches edge to edge, and at half the size neighbouring
 *   patches bleed into each other — green and pink triangles across a wooden drawer front.
 *   Normal, roughness and occlusion maps go to 1024 px, where nothing shows. A texture that
 *   is already WebP and within its size is left alone, so the server does not encode again
 *   what the browser already encoded.
 *
 * - **Glass** — a transmissive material is stored as plain alpha-blended glass
 *   (`plainGlassMaterials`): transmission makes three render the whole flat twice a frame.
 *
 * A file that already meets all of that (its geometry compressed the way the pass writes it,
 * WebP within size, triangles under the cap, no transmission) is kept byte for byte, and so is one the recipe
 * cannot read or would only make bigger — the upload then goes on exactly as it did before
 * there was a recipe.
 */

import { Logger, Primitive, type Document, type PlatformIO, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP, type Transmission } from '@gltf-transform/extensions';
import { dedup, dequantize, draco, getTextureColorSpace, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

export interface GlbOptimizeOptions {
  /** Longest side of a colour texture (base colour, emissive), in pixels. */
  colourTexturePx: number;
  /** Longest side of a data texture (normal, metallic-roughness, occlusion), in pixels. */
  dataTexturePx: number;
  /** Triangles a model is brought down to when it has more — if that stays within 0.2 %. */
  maxTriangles: number;
  /** How the geometry is written: Draco where the pass has its encoder (the server), meshopt otherwise. */
  geometry: 'draco' | 'meshopt';
}

export const GLB_OPTIMIZE_DEFAULTS: GlbOptimizeOptions = {
  colourTexturePx: 2048,
  dataTexturePx: 1024,
  maxTriangles: 100_000,
  geometry: 'meshopt',
};

/** WebP quality (0–100) for every texture, sharp's own default. */
export const WEBP_QUALITY = 80;

/**
 * Draco's settings, for uploads and for the shipped models (`scripts/lib/gltfPipeline.ts`):
 * positions to 14 bits — a quarter of a millimetre across a four-metre kitchen run — normals to
 * 10, texture coordinates to as many as their range needs (`dracoOptions`, never fewer than 12).
 */
export const DRACO_OPTIONS = { method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeGeneric: 12 } as const;

/** Steps per unit of texture coordinate: a quarter of a texel of a 2048-pixel map, what 12 bits give across 0–1. */
const TEXCOORD_STEPS_PER_UNIT = 4096;
/** Beyond this a float's own precision at such coordinates is coarser than the step. */
const MAX_TEXCOORD_BITS = 24;

/**
 * The bits Draco needs for the document's texture coordinates. Draco quantises a coordinate over
 * the whole range its primitive's coordinates span, so 12 bits are a quarter of a texel only while
 * they stay within 0–1. A model can tile its fabric by coordinates that run into the thousands —
 * the Cloud sofa's go from −1 475 to 322 — and at 12 bits those came to 37 distinct values of
 * 8 906: the pattern was gone, a few stretched stripes left in its place. So the bits follow the
 * widest range in the file, the same quarter texel wherever the coordinates run. (meshopt never
 * had the problem: it leaves coordinates outside 0–1 as floats.)
 */
export function texcoordBits(doc: Document): number {
  let range = 1;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) {
        if (!semantic.startsWith('TEXCOORD_')) continue;
        const accessor = prim.getAttribute(semantic)!;
        const min = accessor.getMinNormalized([]);
        const max = accessor.getMaxNormalized([]);
        for (let i = 0; i < min.length; i++) range = Math.max(range, max[i] - min[i]);
      }
    }
  }
  return Math.min(MAX_TEXCOORD_BITS, Math.ceil(Math.log2(range * TEXCOORD_STEPS_PER_UNIT)));
}

/** `DRACO_OPTIONS` for this document — on its dequantised geometry, just before `draco()`. */
export function dracoOptions(doc: Document) {
  return { ...DRACO_OPTIONS, quantizeTexcoord: texcoordBits(doc) };
}

/** Draco's WASM modules, for an IO that reads or writes Draco geometry (`configureGlbIO`). */
export interface DracoCodec {
  encoder: unknown;
  decoder: unknown;
}

/** How far the first simplification may move anything, as a fraction of the model's size. */
const LOSSLESS_ERROR = 0.0001;
/** The steps taken towards `maxTriangles`, never further than 0.2 % of the model's size. */
const CAP_ERRORS = [0.0005, 0.001, 0.002];

/**
 * Re-encodes one texture, fitted within `maxPx` on its longest side when that is given (never
 * enlarged). `null` keeps the texture as it is.
 */
export type TextureEncoder = (image: Uint8Array, mimeType: string, maxPx: number | null) => Promise<{ image: Uint8Array; mimeType: string } | null>;

export interface GlbOptimizeStats {
  bytesIn: number;
  bytesOut: number;
  trianglesIn: number;
  trianglesOut: number;
  /** Textures re-encoded (converted, resized or both). */
  texturesEncoded: number;
  ms: number;
}

export type GlbOptimizeResult =
  | { status: 'optimized'; bytes: Uint8Array; stats: GlbOptimizeStats }
  | { status: 'kept'; bytes: Uint8Array; reason: 'already-optimized' | 'not-smaller' | 'failed'; error?: string };

/** An IO that reads anything the upload routes accept and writes meshopt — and Draco too when its codec is given — quietly. */
export function configureGlbIO<T extends PlatformIO>(io: T, draco?: DracoCodec): T {
  io.setLogger(new Logger(Logger.Verbosity.WARN))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  if (draco) io.registerDependencies({ 'draco3d.encoder': draco.encoder, 'draco3d.decoder': draco.decoder });
  return io;
}

/** Triangles across the document's meshes, each mesh counted once however often it is placed. */
export function countTriangles(doc: Document): number {
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
      triangles += Math.floor(count / 3);
    }
  }
  return triangles;
}

/** What is left of a fully transmissive part: this much of it covers what is behind (the studio's `plainGlass`). */
const CLEAR_GLASS_OPACITY = 0.3;
const GLASS_EXTENSIONS = ['KHR_materials_transmission', 'KHR_materials_volume'];

/**
 * Glass stored as plain transparency. A material with `KHR_materials_transmission` (a clock's
 * cover glass, a lamp's globe) makes three render the whole flat a second time every frame it is
 * on screen; stored as an alpha-blended material instead — the more it let through, the clearer —
 * it costs nothing extra (three writes no depth for a blended material either). The studio does
 * the same to any file that still carries transmission as it loads (`lib/design3d/glass.ts`).
 * Returns how many materials changed.
 */
export function plainGlassMaterials(doc: Document): number {
  const root = doc.getRoot();
  let changed = 0;
  for (const material of root.listMaterials()) {
    const transmission = material.getExtension<Transmission>('KHR_materials_transmission');
    if (!transmission) continue;
    const through = Math.min(1, Math.max(0, transmission.getTransmissionFactor()));
    for (const name of GLASS_EXTENSIONS) material.setExtension(name, null);
    if (through > 0) {
      const [r, g, b, a] = material.getBaseColorFactor();
      material.setBaseColorFactor([r, g, b, Math.min(a, 1 - through * (1 - CLEAR_GLASS_OPACITY))]).setAlphaMode('BLEND');
    }
    changed++;
  }
  // The extensions go from the file once no material uses them.
  for (const extension of root.listExtensionsUsed()) {
    if (GLASS_EXTENSIONS.includes(extension.extensionName) && !root.listMaterials().some((m) => m.getExtension(extension.extensionName))) extension.dispose();
  }
  return changed;
}

/** Whether the document still has a transmissive material (`plainGlassMaterials` would change it). */
function hasTransmission(doc: Document): boolean {
  return doc.getRoot().listMaterials().some((m) => !!m.getExtension('KHR_materials_transmission'));
}

/** The longest side a texture may keep: colour maps more than data maps. */
function textureCap(texture: Texture, options: GlbOptimizeOptions): number {
  return getTextureColorSpace(texture) === 'srgb' ? options.colourTexturePx : options.dataTexturePx;
}

function withinCap(texture: Texture, options: GlbOptimizeOptions): boolean {
  const size = texture.getSize();
  return !!size && Math.max(size[0], size[1]) <= textureCap(texture, options);
}

/** The extension the pass writes the geometry with. */
function geometryExtension(options: GlbOptimizeOptions): string {
  return options.geometry === 'draco' ? 'KHR_draco_mesh_compression' : 'EXT_meshopt_compression';
}

/** Already what the recipe would make: geometry compressed as the pass writes it and under the cap, every texture WebP within its size. */
function isOptimized(doc: Document, options: GlbOptimizeOptions): boolean {
  const root = doc.getRoot();
  if (!root.listExtensionsUsed().some((ext) => ext.extensionName === geometryExtension(options))) return false;
  if (countTriangles(doc) > options.maxTriangles) return false;
  if (hasTransmission(doc)) return false;
  return root.listTextures().every((texture) => texture.getMimeType() === 'image/webp' && withinCap(texture, options));
}

async function encodeTextures(doc: Document, encode: TextureEncoder, options: GlbOptimizeOptions): Promise<number> {
  let encoded = 0;
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const size = texture.getSize();
    const cap = textureCap(texture, options);
    const tooLarge = !size || Math.max(size[0], size[1]) > cap;
    if (texture.getMimeType() === 'image/webp' && !tooLarge) continue;
    const result = await encode(image, texture.getMimeType(), tooLarge ? cap : null).catch(() => null);
    if (!result) continue;
    // A change of format has to pay for itself; a smaller size is worth it anyway — it is
    // GPU memory as much as download.
    if (!tooLarge && result.image.byteLength >= image.byteLength) continue;
    texture.setImage(result.image).setMimeType(result.mimeType);
    encoded++;
  }
  if (doc.getRoot().listTextures().some((texture) => texture.getMimeType() === 'image/webp')) {
    doc.createExtension(EXTTextureWebP).setRequired(true);
  }
  return encoded;
}

/**
 * The recipe on one file. Never throws: anything it cannot read, or a result no smaller than
 * the input, comes back as `kept` with the input's own bytes.
 */
export async function optimizeGlb(io: PlatformIO, bytes: Uint8Array, encodeTexture: TextureEncoder, overrides: Partial<GlbOptimizeOptions> = {}): Promise<GlbOptimizeResult> {
  const options = { ...GLB_OPTIMIZE_DEFAULTS, ...overrides };
  const started = performance.now();
  try {
    await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
    const doc = await io.readBinary(bytes);
    if (isOptimized(doc, options)) return { status: 'kept', bytes, reason: 'already-optimized' };

    const trianglesIn = countTriangles(doc);
    // Quantised input (a converted model sent again) goes back to floats first: welding and
    // simplifying want real positions, and meshopt quantises it all again at the end.
    await doc.transform(dedup({ keepUniqueNames: true }), dequantize(), weld(), simplify({ simplifier: MeshoptSimplifier, error: LOSSLESS_ERROR }));
    for (const error of CAP_ERRORS) {
      const current = countTriangles(doc);
      if (current <= options.maxTriangles) break;
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: options.maxTriangles / current, error }));
    }
    plainGlassMaterials(doc);
    // Empty nodes stay: a model's named parts (a door's leaf and frame) are its own business.
    await doc.transform(prune({ keepLeaves: true, keepExtras: true }));
    const texturesEncoded = await encodeTextures(doc, encodeTexture, options);
    // A file that came in with the other compression (a browser pass's meshopt arriving at the
    // server) leaves it behind: a document is written with one or the other.
    for (const extension of doc.getRoot().listExtensionsUsed()) {
      if (/^(EXT_meshopt_compression|KHR_draco_mesh_compression)$/.test(extension.extensionName) && extension.extensionName !== geometryExtension(options)) extension.dispose();
    }
    if (options.geometry === 'draco') await doc.transform(draco(dracoOptions(doc)));
    else await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
    const out = await io.writeBinary(doc);

    if (out.byteLength >= bytes.byteLength) return { status: 'kept', bytes, reason: 'not-smaller' };
    return {
      status: 'optimized',
      bytes: out,
      stats: {
        bytesIn: bytes.byteLength,
        bytesOut: out.byteLength,
        trianglesIn,
        trianglesOut: countTriangles(doc),
        texturesEncoded,
        ms: Math.round(performance.now() - started),
      },
    };
  } catch (e) {
    return { status: 'kept', bytes, reason: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}
