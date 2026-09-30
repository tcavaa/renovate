import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { encodeTextureWebp, optimizeUploadedTexture, TEXTURE_MAX_PX, textureKind } from '@/lib/uploads/textureOptimize';

/**
 * Finish textures are stored as WebP — the shipped ones (`pnpm textures:webp`) and one uploaded
 * in the product form — colour maps at 80, normal maps at 90, never larger than 2048 px.
 */

/** A noisy gradient, so neither JPEG nor WebP can make it vanish. */
async function jpeg(width: number, height = width, quality = 95): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 11;
  for (let i = 0; i < pixels.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pixels[i] = Math.max(0, Math.min(255, ((i / 3) % width) / width * 255 + ((seed >> 24) - 64)));
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer();
}

describe('finish textures as WebP', () => {
  it('tells a normal map by its name', () => {
    expect(textureKind('ph-floor_tiles_08-normal.jpg')).toBe('normal');
    expect(textureKind('brick-03-normal')).toBe('normal');
    expect(textureKind('Tiles052_1K-JPG_NormalGL.jpg')).toBe('normal');
    expect(textureKind('wood-floor-light-diffuse.jpg')).toBe('colour');
    expect(textureKind('acg-Tiles133A-rough.jpg')).toBe('colour');
    expect(textureKind('abnormality-diffuse.jpg')).toBe('colour');
  });

  it('writes WebP at the size it was, and a normal map at a higher quality than a colour map', async () => {
    const source = await jpeg(256);
    const colour = await encodeTextureWebp(source, 'colour');
    const normal = await encodeTextureWebp(source, 'normal');
    const [colourMeta, normalMeta] = await Promise.all([sharp(colour).metadata(), sharp(normal).metadata()]);
    expect(colourMeta.format).toBe('webp');
    expect([colourMeta.width, colourMeta.height]).toEqual([256, 256]);
    expect(normalMeta.format).toBe('webp');
    expect(normal.byteLength).toBeGreaterThan(colour.byteLength);
  });

  it('fits an oversized texture within 2048 px', async () => {
    const out = await encodeTextureWebp(await jpeg(TEXTURE_MAX_PX * 2, 64, 60));
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(TEXTURE_MAX_PX);
    expect(meta.height).toBe(32);
  });

  it('stores an upload as WebP when that is smaller, and keeps what it cannot improve or read', async () => {
    const source = await jpeg(256);
    const smaller = await optimizeUploadedTexture(source);
    expect(smaller.converted).toBe(true);
    expect((await sharp(smaller.body).metadata()).format).toBe('webp');
    expect(smaller.body.byteLength).toBeLessThan(source.byteLength);

    // A tiny flat PNG: WebP would be no smaller, so it stays as it came.
    const flat = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#808080' } }).png().toBuffer();
    const kept = await optimizeUploadedTexture(flat);
    if (kept.converted) expect(kept.body.byteLength).toBeLessThan(flat.byteLength);
    else expect(kept.body).toBe(flat);

    const junk = Buffer.from('not an image at all');
    expect(await optimizeUploadedTexture(junk)).toEqual({ body: junk, converted: false });
  });
});
