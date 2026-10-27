import { describe, expect, it } from 'vitest';
import { factorsDiffer, matchLooks, readGlbLooks, sameImage, type GlbLook } from '@/lib/uploads/glbLooks';

const PNG = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, n, n]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

/** A GLB with the given JSON and the images laid end to end in its BIN chunk, each at a bufferView of its own. */
function glb(json: Record<string, unknown>, images: Uint8Array[]): Uint8Array {
  const views: Array<{ buffer: number; byteOffset: number; byteLength: number }> = [];
  let offset = 0;
  for (const image of images) {
    views.push({ buffer: 0, byteOffset: offset, byteLength: image.length });
    offset += image.length;
  }
  const pad = (n: number) => (n + 3) & ~3;
  const bin = new Uint8Array(pad(offset));
  images.reduce((at, image) => (bin.set(image, at), at + image.length), 0);
  const text = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, bufferViews: views, buffers: [{ byteLength: bin.length }], ...json }));
  const jsonChunk = new Uint8Array(pad(text.length)).fill(0x20);
  jsonChunk.set(text);
  const out = new Uint8Array(12 + 8 + jsonChunk.length + 8 + bin.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonChunk, 20);
  view.setUint32(20 + jsonChunk.length, bin.length, true);
  view.setUint32(24 + jsonChunk.length, 0x004e4942, true);
  out.set(bin, 28 + jsonChunk.length);
  return out;
}

const sofa = (leather: Uint8Array, opts: { names?: [string, string]; leatherFactor?: number[] } = {}) =>
  glb(
    {
      materials: [
        {
          name: opts.names?.[0] ?? 'Leather',
          pbrMetallicRoughness: {
            baseColorFactor: opts.leatherFactor ?? [1, 1, 1, 1],
            baseColorTexture: { index: 0, extensions: { KHR_texture_transform: { scale: [2, 2] } } },
            metallicFactor: 0,
            roughnessFactor: 0.6,
            metallicRoughnessTexture: { index: 2 },
          },
          normalTexture: { index: 1 },
        },
        { name: opts.names?.[1] ?? 'Wood', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.1, 0.05, 1], metallicFactor: 0, roughnessFactor: 0.8 } },
      ],
      // The colour texture as a WebP extension's source, the rest plain.
      textures: [{ extensions: { EXT_texture_webp: { source: 0 } } }, { source: 1 }, { source: 2 }],
      images: [
        { bufferView: 0, mimeType: 'image/png' },
        { bufferView: 1, mimeType: 'image/jpeg' },
        { uri: `data:image/png;base64,${Buffer.from(PNG(9)).toString('base64')}` },
      ],
    },
    [leather, JPEG]
  );

describe('reading a GLB’s materials as they look', () => {
  it('takes each material’s factors and its textures as the bytes in the file', () => {
    const [leather, wood] = readGlbLooks(sofa(PNG(1)))!;
    expect(leather).toMatchObject({ index: 0, name: 'Leather', colorHex: '#FFFFFF', roughness: 0.6, metallic: 0, repeat: 2 });
    expect([...leather.color!.bytes]).toEqual([...PNG(1)]);
    expect(leather.color!.mime).toBe('image/png');
    expect([...leather.normal!.bytes]).toEqual([...JPEG]);
    // An image written into the JSON as a data URI is read too.
    expect([...leather.roughnessMap!.bytes]).toEqual([...PNG(9)]);
    // The factor is linear; the hex is what it looks like.
    expect(wood).toMatchObject({ name: 'Wood', colorHex: '#7C593F', color: null, normal: null, repeat: null });
  });

  it('refuses what is not a GLB', () => {
    expect(readGlbLooks(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readGlbLooks(new Uint8Array(40))).toBeNull();
  });
});

describe('pairing a second model’s materials with the main one’s', () => {
  const main = readGlbLooks(sofa(PNG(1)))!;

  it('pairs them by name, and names the ones the second has not got', () => {
    const other = readGlbLooks(glb({ materials: [{ name: 'Leather' }, { name: 'Cushion' }] }, []))!;
    const result = matchLooks(main, other);
    expect(result.by).toBe('name');
    expect(result.matches.map((m) => m.material)).toEqual(['Leather']);
    expect(result.unmatched).toEqual(['Wood']);
  });

  it('pairs them by their order when no name is shared and the counts agree', () => {
    const renamed = readGlbLooks(sofa(PNG(2), { names: ['mat_01', 'mat_02'] }))!;
    const result = matchLooks(main, renamed);
    expect(result.by).toBe('order');
    expect(result.matches.map((m) => [m.material, m.look.name])).toEqual([['Leather', 'mat_01'], ['Wood', 'mat_02']]);
  });

  it('tells what changed: another picture, another factor, a texture gone', () => {
    const same = readGlbLooks(sofa(PNG(1)))!;
    const fabric = readGlbLooks(sofa(PNG(3)))!;
    const tinted = readGlbLooks(sofa(PNG(1), { leatherFactor: [0.5, 0.2, 0.1, 1] }))!;
    expect(factorsDiffer(same[0], main[0]) || !sameImage(same[0].color, main[0].color)).toBe(false);
    expect(sameImage(fabric[0].color, main[0].color)).toBe(false);
    expect(factorsDiffer(tinted[0], main[0])).toBe(true);
    const plain: GlbLook = { ...main[0], color: null };
    expect(factorsDiffer(plain, main[0])).toBe(true);
    expect(sameImage(null, null)).toBe(true);
  });
});
