/**
 * Finish textures as WebP — the floor and wall maps the studio tiles over its surfaces. One
 * encoder for the ones shipped in `public/textures` (`pnpm textures:webp`, `pnpm textures:stock`)
 * and for a texture uploaded in the product form (`/api/upload`, folder `textures`).
 *
 * Colour and roughness maps take the upload recipe's quality 80 (`WEBP_QUALITY`): measured on
 * the shipped maps they stay within 36–44 dB of the JPEGs, which were saved near quality 100
 * (47 MB for 93 maps; about 7 MB as WebP). Normal maps are encoded at 90 with sharp YUV
 * (`smartSubsample`): lossy WebP keeps colour at half resolution, and a normal map's colour is
 * a direction — at 80 the median map's normals moved 2° and a tile's grout lines came out
 * visibly harder under raking light; at 90 the median is 1.4° and the grout holds.
 *
 * Server-only (sharp).
 */

import sharp from 'sharp';
import { WEBP_QUALITY } from './glbOptimize';

/** Longest side a finish texture keeps; a larger one is only GPU memory (22 MB with mipmaps at 2048). */
export const TEXTURE_MAX_PX = 2048;
/** Quality for a normal map (see above). */
export const NORMAL_MAP_WEBP_QUALITY = 90;

/** What a map is by its file name: `…-normal.…` is a normal map, anything else is colour or data. */
export function textureKind(name: string): 'normal' | 'colour' {
  return /(^|[-_])normal([-_.]|gl|$)/i.test(name) ? 'normal' : 'colour';
}

/** A texture's bytes as WebP, fitted within `TEXTURE_MAX_PX` (never enlarged). */
export async function encodeTextureWebp(bytes: Uint8Array, kind: 'normal' | 'colour' = 'colour'): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(TEXTURE_MAX_PX, TEXTURE_MAX_PX, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
    .webp(kind === 'normal' ? { quality: NORMAL_MAP_WEBP_QUALITY, smartSubsample: true } : { quality: WEBP_QUALITY })
    .toBuffer();
}

/**
 * An uploaded finish texture as it should be stored: WebP, unless that is no smaller and no
 * resize was needed (a tiny flat-colour PNG), when it stays as it came. Never throws.
 */
export async function optimizeUploadedTexture(bytes: Buffer, kind: 'normal' | 'colour' = 'colour'): Promise<{ body: Buffer; converted: boolean }> {
  try {
    const meta = await sharp(bytes).metadata();
    const oversize = Math.max(meta.width ?? 0, meta.height ?? 0) > TEXTURE_MAX_PX;
    const webp = await encodeTextureWebp(bytes, kind);
    if (!oversize && webp.byteLength >= bytes.byteLength) return { body: bytes, converted: false };
    return { body: webp, converted: true };
  } catch {
    return { body: bytes, converted: false };
  }
}
