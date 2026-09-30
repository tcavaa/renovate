import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { encodePhotoWebp, optimizeUploadedImage, PHOTO_MAX_PX } from '@/lib/uploads/imageOptimize';

/**
 * Every uploaded photo is stored as WebP (quality 85, within 1600 px, transparency kept) — a
 * product's, a brigade's, a store's, a person's own furniture — and the seed pictures were made
 * the same way (`pnpm photos:webp`).
 */

/** A photo-like gradient with a little grain (pure noise would not shrink in any format); a transparent border when `alpha`. */
async function png(width: number, height = width, alpha = false): Promise<Buffer> {
  const channels = alpha ? 4 : 3;
  const pixels = Buffer.alloc(width * height * channels);
  let seed = 3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const grain = ((seed >> 26) & 0x0f) - 8;
      const i = (y * width + x) * channels;
      pixels[i] = Math.max(0, Math.min(255, (x / width) * 255 + grain));
      pixels[i + 1] = Math.max(0, Math.min(255, (y / height) * 255 + grain));
      pixels[i + 2] = 140;
      if (alpha) pixels[i + 3] = x < width / 10 ? 0 : 255;
    }
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

describe('photos as WebP', () => {
  it('keeps a render’s transparency and its size', async () => {
    const out = await encodePhotoWebp(await png(300, 200, true));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([300, 200]);
    expect(meta.hasAlpha).toBe(true);
  });

  it('fits a large photo within 1600 px', async () => {
    const meta = await sharp(await encodePhotoWebp(await png(PHOTO_MAX_PX * 2, 100))).metadata();
    expect(meta.width).toBe(PHOTO_MAX_PX);
    expect(meta.height).toBe(50);
  });

  it('stores an upload as WebP, and keeps a GIF, a small WebP and what it cannot read', async () => {
    const source = await png(400);
    const converted = await optimizeUploadedImage(source, 'image/png');
    expect(converted.converted).toBe(true);
    expect((await sharp(converted.body).metadata()).format).toBe('webp');
    expect(converted.body.byteLength).toBeLessThan(source.byteLength);

    const gif = Buffer.from('GIF89a-not-really');
    expect(await optimizeUploadedImage(gif, 'image/gif')).toEqual({ body: gif, converted: false });

    const small = await sharp(await png(64)).webp().toBuffer();
    expect(await optimizeUploadedImage(small, 'image/webp')).toEqual({ body: small, converted: false });

    const junk = Buffer.from('not an image');
    expect(await optimizeUploadedImage(junk, 'image/png')).toEqual({ body: junk, converted: false });
  });
});
