import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { Document, getBounds, NodeIO, type Texture } from '@gltf-transform/core';
import { dequantize } from '@gltf-transform/functions';
import { configureGlbIO, countTriangles, optimizeGlb, type TextureEncoder } from '@/lib/uploads/glbOptimize';
import { optimizeUploadedModel } from '@/lib/uploads/glbOptimizeServer';

/**
 * The upload recipe on files made here: a sphere of float geometry with JPEG textures, the
 * shape of what Meshy and most exporters hand over. Sizes are small so the suite stays quick;
 * the caps are shrunk to match.
 */

const io = configureGlbIO(new NodeIO());

/** A gradient with a little noise, so neither JPEG nor WebP can make it vanish. */
async function jpeg(size: number): Promise<Uint8Array> {
  const pixels = Buffer.alloc(size * size * 3);
  let seed = 7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const noise = (seed >> 24) - 64;
      const i = (y * size + x) * 3;
      pixels[i] = Math.max(0, Math.min(255, (x / size) * 255 + noise));
      pixels[i + 1] = Math.max(0, Math.min(255, (y / size) * 255 + noise));
      pixels[i + 2] = 128;
    }
  }
  return new Uint8Array(await sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).jpeg({ quality: 95 }).toBuffer());
}

/** A unit sphere of `segments` × `rings` quads, 32-bit everything, with a colour and a normal map. */
async function sphereGlb(segments: number, rings: number, texturePx = 256): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const n = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
      positions.push(...n);
      normals.push(...n);
      uvs.push(s / segments, r / rings);
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const material = doc
    .createMaterial('surface')
    .setBaseColorTexture(doc.createTexture('colour').setImage(await jpeg(texturePx)).setMimeType('image/jpeg'))
    .setNormalTexture(doc.createTexture('normal').setImage(await jpeg(texturePx)).setMimeType('image/jpeg'));
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer))
    .setMaterial(material);
  doc.createScene().addChild(doc.createNode('sphere').setMesh(doc.createMesh('sphere').addPrimitive(prim)));
  return new NodeIO().writeBinary(doc);
}

async function read(bytes: Uint8Array): Promise<Document> {
  const doc = await io.readBinary(bytes);
  await doc.transform(dequantize());
  return doc;
}

function extent(doc: Document): number[] {
  const { min, max } = getBounds(doc.getRoot().listScenes()[0]);
  return [0, 1, 2].map((i) => max[i] - min[i]);
}

function textureNamed(doc: Document, name: string): Texture {
  const texture = doc.getRoot().listTextures().find((t) => t.getName() === name);
  if (!texture) throw new Error(`no texture ${name}`);
  return texture;
}

describe('optimizing an uploaded GLB', () => {
  it('compresses the geometry and turns the textures into WebP, the colour map larger than the data maps', async () => {
    const input = await sphereGlb(96, 48);
    const { body, result } = await optimizeUploadedModel(Buffer.from(input), { colourTexturePx: 128, dataTexturePx: 64 });

    expect(result.status).toBe('optimized');
    expect(body.byteLength).toBeLessThan(input.byteLength / 2);
    const out = await io.readBinary(body);
    const used = out.getRoot().listExtensionsUsed().map((e) => e.extensionName);
    expect(used).toContain('EXT_meshopt_compression');
    expect(used).toContain('EXT_texture_webp');
    expect(out.getRoot().listExtensionsRequired().map((e) => e.extensionName)).toContain('EXT_texture_webp');
    expect(textureNamed(out, 'colour').getMimeType()).toBe('image/webp');
    expect(textureNamed(out, 'colour').getSize()).toEqual([128, 128]);
    expect(textureNamed(out, 'normal').getSize()).toEqual([64, 64]);
  });

  it('moves nothing a person could see: the same outline, nearly every triangle kept', async () => {
    const input = await sphereGlb(96, 48);
    const before = await read(input);
    const result = await optimizeGlb(io, input, async () => null);
    if (result.status !== 'optimized') throw new Error(`kept: ${result.reason}`);
    const after = await read(result.bytes);
    extent(after).forEach((size, i) => expect(size).toBeCloseTo(extent(before)[i], 2));
    expect(result.stats.trianglesOut).toBeGreaterThan(result.stats.trianglesIn * 0.8);
    expect(countTriangles(after)).toBe(result.stats.trianglesOut);
  });

  it('takes a heavy mesh down to the triangle cap without changing its size', async () => {
    const input = await sphereGlb(256, 128, 32);
    const before = await read(input);
    const result = await optimizeGlb(io, input, async () => null, { maxTriangles: 8000 });
    if (result.status !== 'optimized') throw new Error(`kept: ${result.reason}`);
    expect(result.stats.trianglesIn).toBe(256 * 128 * 2);
    expect(result.stats.trianglesOut).toBeLessThanOrEqual(8000 * 1.1);
    extent(await read(result.bytes)).forEach((size, i) => expect(size).toBeCloseTo(extent(before)[i], 1));
  });

  it('keeps a file it has already optimized byte for byte', async () => {
    const once = await optimizeUploadedModel(Buffer.from(await sphereGlb(64, 32)));
    const twice = await optimizeUploadedModel(once.body);
    expect(twice.result).toMatchObject({ status: 'kept', reason: 'already-optimized' });
    expect(twice.body.equals(once.body)).toBe(true);
  });

  it('keeps what it cannot read exactly as it came', async () => {
    const junk = Buffer.from('glTF but not really a model at all');
    const { body, result } = await optimizeUploadedModel(junk);
    expect(result).toMatchObject({ status: 'kept', reason: 'failed' });
    expect(body).toBe(junk);
  });

  it('asks for each map at its own size, and keeps a conversion that would not pay for itself', async () => {
    const calls: Array<{ mimeType: string; maxPx: number | null }> = [];
    const bigger: TextureEncoder = async (image, mimeType, maxPx) => {
      calls.push({ mimeType, maxPx });
      if (maxPx) return { image: new Uint8Array(await sharp(image).resize(maxPx, maxPx, { fit: 'inside' }).webp().toBuffer()), mimeType: 'image/webp' };
      return { image: new Uint8Array(image.byteLength + 1), mimeType: 'image/webp' };
    };

    // Within both caps: converted only if smaller — here never, so both stay JPEG.
    const within = await optimizeGlb(io, await sphereGlb(32, 16), bigger);
    if (within.status !== 'optimized') throw new Error(`kept: ${within.reason}`);
    expect(calls).toEqual([
      { mimeType: 'image/jpeg', maxPx: null },
      { mimeType: 'image/jpeg', maxPx: null },
    ]);
    const kept = await io.readBinary(within.bytes);
    expect(kept.getRoot().listTextures().map((t) => t.getMimeType())).toEqual(['image/jpeg', 'image/jpeg']);
    expect(kept.getRoot().listExtensionsUsed().map((e) => e.extensionName)).not.toContain('EXT_texture_webp');

    // Over them: the colour map is asked for at the colour size, the normal map at the data size.
    calls.length = 0;
    await optimizeGlb(io, await sphereGlb(32, 16), bigger, { colourTexturePx: 200, dataTexturePx: 100 });
    expect(calls).toEqual([
      { mimeType: 'image/jpeg', maxPx: 200 },
      { mimeType: 'image/jpeg', maxPx: 100 },
    ]);
  });
});
