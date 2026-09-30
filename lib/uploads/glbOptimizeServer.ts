/**
 * The upload routes' pass of the GLB recipe (`glbOptimize.ts`): sharp re-encodes the textures
 * (WebP, Lanczos when it shrinks them), NodeIO reads and writes, and the geometry is stored as
 * Draco. A browser-optimized file arrives with WebP textures and meshopt geometry; this pass
 * keeps the textures and rewrites the geometry as Draco, and finishes everything else — a
 * browser that cannot write WebP (Safari), one whose pass failed, a script posting straight to
 * the route. A file already Draco and WebP within its caps is kept byte for byte. Server-only:
 * sharp and draco3d are native / WASM modules loaded from node_modules (`serverExternalPackages`).
 *
 * Cost, measured on the admin uploads it was written for (Apple M4): 0.3 s and 280 MB peak
 * for a 5.7 MB sideboard, 1 s and 450 MB for a 21 MB, 490 000-triangle scan.
 */

import sharp from 'sharp';
import draco3d from 'draco3d';
import { NodeIO } from '@gltf-transform/core';
import { log } from '@/lib/log';
import { configureGlbIO, optimizeGlb, WEBP_QUALITY, type GlbOptimizeOptions, type GlbOptimizeResult, type TextureEncoder } from './glbOptimize';

let serverIO: Promise<NodeIO> | null = null;

/** The server's IO: meshopt and Draco both ways (Draco's codec is WASM, made once). */
export function glbServerIO(): Promise<NodeIO> {
  serverIO ??= Promise.all([draco3d.createEncoderModule({}), draco3d.createDecoderModule({})]).then(([encoder, decoder]) => configureGlbIO(new NodeIO(), { encoder, decoder }));
  return serverIO;
}

const encodeWithSharp: TextureEncoder = async (image, _mimeType, maxPx) => {
  let pipeline = sharp(image);
  if (maxPx) pipeline = pipeline.resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' });
  const out = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
  return { image: new Uint8Array(out.buffer, out.byteOffset, out.byteLength), mimeType: 'image/webp' };
};

/**
 * An uploaded GLB as it should be stored: optimized, or — already optimized, unreadable to the
 * recipe, or no smaller for it — exactly as it came. Never throws.
 */
export async function optimizeUploadedModel(bytes: Buffer, options?: Partial<GlbOptimizeOptions>): Promise<{ body: Buffer; result: GlbOptimizeResult }> {
  const result = await optimizeGlb(await glbServerIO(), bytes, encodeWithSharp, { geometry: 'draco', ...options });
  if (result.status === 'optimized') {
    log.info('model optimized', { ...result.stats });
    return { body: Buffer.from(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength), result };
  }
  if (result.reason === 'failed') log.warn('model kept as uploaded: optimization failed', { error: result.error, bytes: bytes.length });
  return { body: bytes, result };
}
