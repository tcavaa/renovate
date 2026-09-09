import { describe, expect, it } from 'vitest';
import { sniffImage, sniffModel } from '@/lib/uploads/sniff';

/** A minimal GLB header: magic, version, total length, then a JSON chunk header. */
function glb(opts: { version?: number; length?: number; chunkType?: number; size?: number } = {}): Uint8Array {
  const size = opts.size ?? 32;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set([0x67, 0x6c, 0x54, 0x46], 0); // glTF
  view.setUint32(4, opts.version ?? 2, true);
  view.setUint32(8, opts.length ?? size, true);
  view.setUint32(12, 2, true); // chunk length
  view.setUint32(16, opts.chunkType ?? 0x4e4f534a, true); // JSON
  return bytes;
}

describe('sniffModel', () => {
  it('accepts a binary glTF 2 container', () => {
    expect(sniffModel(glb())).toBe('model/gltf-binary');
  });

  it('refuses glTF 1, a truncated file, a non-JSON first chunk and anything that is not glTF', () => {
    expect(sniffModel(glb({ version: 1 }))).toBeNull();
    expect(sniffModel(glb({ length: 1024 }))).toBeNull();
    expect(sniffModel(glb({ chunkType: 0x004e4942 }))).toBeNull();
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    expect(sniffModel(png)).toBeNull();
    expect(sniffImage(png)).toBe('image/png');
    expect(sniffModel(new Uint8Array(8))).toBeNull();
  });

  it('does not mistake a model for an image', () => {
    expect(sniffImage(glb())).toBeNull();
  });
});

describe('inspectGlb', () => {
  const withJson = (json: object) => {
    const text = new TextEncoder().encode(JSON.stringify(json));
    const bytes = new Uint8Array(20 + text.length);
    const view = new DataView(bytes.buffer);
    bytes.set([0x67, 0x6c, 0x54, 0x46], 0);
    view.setUint32(4, 2, true);
    view.setUint32(8, bytes.length, true);
    view.setUint32(12, text.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    bytes.set(text, 20);
    return bytes;
  };

  it('reads the generator, the extensions and the counts', async () => {
    const { inspectGlb, unsupportedExtension } = await import('@/lib/uploads/glb');
    const info = inspectGlb(withJson({ asset: { generator: 'Blender' }, meshes: [{}], materials: [{}], images: [{}, {}], extensionsUsed: ['EXT_meshopt_compression'], extensionsRequired: ['EXT_meshopt_compression'] }))!;
    expect(info.generator).toBe('Blender');
    expect(info.meshes).toBe(1);
    expect(info.images).toBe(2);
    expect(unsupportedExtension(info)).toBeNull();
  });

  it('names Draco and Basis as the extensions the studio cannot decode', async () => {
    const { inspectGlb, unsupportedExtension } = await import('@/lib/uploads/glb');
    expect(unsupportedExtension(inspectGlb(withJson({ meshes: [{}], extensionsRequired: ['KHR_draco_mesh_compression'] }))!)).toBe('KHR_draco_mesh_compression');
    expect(unsupportedExtension(inspectGlb(withJson({ meshes: [{}], extensionsRequired: ['KHR_texture_basisu'] }))!)).toBe('KHR_texture_basisu');
    expect(inspectGlb(new Uint8Array(4))).toBeNull();
  });
});
