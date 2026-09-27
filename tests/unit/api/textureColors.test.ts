import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { colorsOfImage } from '@/lib/uploads/textureColors';
import { colorFamily } from '@/lib/design/colors';

/** A texture drawn in memory: a background and, optionally, a block of another colour over part of it. */
async function texture(background: string, block?: { color: string; width: number; height: number }, format: 'jpeg' | 'png' = 'png'): Promise<Uint8Array> {
  const image = sharp({ create: { width: 200, height: 200, channels: 3, background } });
  if (block) image.composite([{ input: { create: { width: block.width, height: block.height, channels: 3, background: block.color } }, left: 0, top: 0 }]);
  return new Uint8Array(await (format === 'jpeg' ? image.jpeg({ quality: 95 }) : image.png()).toBuffer());
}

describe('the colours of a texture', () => {
  it('reads a plain paint as its one colour', async () => {
    const colors = await colorsOfImage(await texture('#3B78C4'));
    expect(colors).toHaveLength(1);
    expect(colorFamily(colors[0])).toBe('blue');
  });

  it('reads a two-colour tile as both, the larger first, from a JPEG too', async () => {
    // A quarter walnut, three quarters white.
    const colors = await colorsOfImage(await texture('#FFFFFF', { color: '#6E4526', width: 100, height: 100 }, 'jpeg'));
    expect(colors.map(colorFamily)).toEqual(['white', 'brown']);
  });

  it('answers nothing for bytes that are not an image', async () => {
    expect(await colorsOfImage(new Uint8Array([1, 2, 3, 4]))).toEqual([]);
  });
});
