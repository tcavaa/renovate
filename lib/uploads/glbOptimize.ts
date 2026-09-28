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
 *   Then quantised and meshopt-compressed (`EXT_meshopt_compression`), which the studio's
 *   loader already decodes.
 * - **Textures** — WebP (`EXT_texture_webp`). The colour map keeps up to 2048 px: AI-made
 *   models pack it into hundreds of patches edge to edge, and at half the size neighbouring
 *   patches bleed into each other — green and pink triangles across a wooden drawer front.
 *   Normal, roughness and occlusion maps go to 1024 px, where nothing shows. A texture that
 *   is already WebP and within its size is left alone, so the server does not encode again
 *   what the browser already encoded.
 *
 * A file that already meets all of that (meshopt, WebP within size, triangles under the cap) is
 * kept byte for byte, and so is one the recipe cannot read or would only make bigger — the
 * upload then goes on exactly as it did before there was a recipe.
 */

import { Logger, Primitive, type Document, type PlatformIO, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, dequantize, getTextureColorSpace, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

export interface GlbOptimizeOptions {
  /** Longest side of a colour texture (base colour, emissive), in pixels. */
  colourTexturePx: number;
  /** Longest side of a data texture (normal, metallic-roughness, occlusion), in pixels. */
  dataTexturePx: number;
  /** Triangles a model is brought down to when it has more — if that stays within 0.2 %. */
  maxTriangles: number;
}

export const GLB_OPTIMIZE_DEFAULTS: GlbOptimizeOptions = {
  colourTexturePx: 2048,
  dataTexturePx: 1024,
  maxTriangles: 100_000,
};

/** WebP quality (0–100) for every texture, sharp's own default. */
export const WEBP_QUALITY = 80;

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

/** An IO that reads anything the upload routes accept and writes meshopt, quietly. */
export function configureGlbIO<T extends PlatformIO>(io: T): T {
  return io
    .setLogger(new Logger(Logger.Verbosity.WARN))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
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

/** The longest side a texture may keep: colour maps more than data maps. */
function textureCap(texture: Texture, options: GlbOptimizeOptions): number {
  return getTextureColorSpace(texture) === 'srgb' ? options.colourTexturePx : options.dataTexturePx;
}

function withinCap(texture: Texture, options: GlbOptimizeOptions): boolean {
  const size = texture.getSize();
  return !!size && Math.max(size[0], size[1]) <= textureCap(texture, options);
}

/** Already what the recipe would make: meshopt geometry under the cap, every texture WebP within its size. */
function isOptimized(doc: Document, options: GlbOptimizeOptions): boolean {
  const root = doc.getRoot();
  if (!root.listExtensionsUsed().some((ext) => ext.extensionName === 'EXT_meshopt_compression')) return false;
  if (countTriangles(doc) > options.maxTriangles) return false;
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
    // Empty nodes stay: a model's named parts (a door's leaf and frame) are its own business.
    await doc.transform(prune({ keepLeaves: true, keepExtras: true }));
    const texturesEncoded = await encodeTextures(doc, encodeTexture, options);
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
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
