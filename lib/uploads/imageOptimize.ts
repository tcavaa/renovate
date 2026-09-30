/**
 * Photos as WebP — a product's picture, a brigade's, a store's, a category's. One encoder for an
 * image uploaded through `/api/upload` or as a person's own furniture, and for the seed pictures in
 * `public/uploads/products` and `/furniture` (`pnpm photos:webp`, and the model pipelines that
 * render or place them).
 *
 * Quality 85, within 1600 px, the transparency of a render kept (WebP has an alpha channel): the
 * seed pictures went from 89.7 MB of PNG and JPEG to 7.4 MB. The site shows photos through Next's
 * image optimizer, which serves browsers a resized WebP anyway; what this saves is the upload's
 * and the repo's weight and the optimizer's first read, and a raw `<img>` (the plan board's
 * inspector) gets a small file too. A GIF is kept as it came — it may be animated.
 *
 * Server-only (sharp).
 */

import sharp from 'sharp';

export const PHOTO_WEBP_QUALITY = 85;
/** Longest side a photo keeps: a product page shows it at 800 CSS px at most, twice that on a retina screen. */
export const PHOTO_MAX_PX = 1600;

/** A photo's bytes as WebP, fitted within `PHOTO_MAX_PX` (never enlarged), turned upright by its EXIF. */
export async function encodePhotoWebp(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(PHOTO_MAX_PX, PHOTO_MAX_PX, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
    .webp({ quality: PHOTO_WEBP_QUALITY })
    .toBuffer();
}

/**
 * An uploaded photo as it should be stored: WebP — unless it is a GIF, or WebP would be no
 * smaller and no resize was needed, when it stays as it came. Never throws.
 */
export async function optimizeUploadedImage(bytes: Buffer, mime: string): Promise<{ body: Buffer; converted: boolean }> {
  if (mime === 'image/gif') return { body: bytes, converted: false };
  try {
    const meta = await sharp(bytes).metadata();
    const oversize = Math.max(meta.width ?? 0, meta.height ?? 0) > PHOTO_MAX_PX;
    if (mime === 'image/webp' && !oversize) return { body: bytes, converted: false };
    const webp = await encodePhotoWebp(bytes);
    if (!oversize && webp.byteLength >= bytes.byteLength) return { body: bytes, converted: false };
    return { body: webp, converted: true };
  } catch {
    return { body: bytes, converted: false };
  }
}
