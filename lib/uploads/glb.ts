/**
 * What a GLB says about itself, read from its JSON chunk without decoding any geometry.
 *
 * The studio's loader speaks core glTF 2 plus meshopt compression. A file that *requires* an
 * extension it does not have — Draco geometry, Basis/KTX2 textures — would upload fine and
 * then load as nothing, so the upload route asks here first and refuses with a message that
 * names the problem while the person who can re-export the file is still looking at it.
 */
export interface GlbInfo {
  generator: string | null;
  extensionsUsed: string[];
  extensionsRequired: string[];
  meshes: number;
  materials: number;
  images: number;
}

export function inspectGlb(bytes: Uint8Array): GlbInfo | null {
  if (bytes.length < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  if (20 + jsonLength > bytes.length) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
      asset?: { generator?: string };
      extensionsUsed?: string[];
      extensionsRequired?: string[];
      meshes?: unknown[];
      materials?: unknown[];
      images?: unknown[];
    };
    return {
      generator: json.asset?.generator ?? null,
      extensionsUsed: json.extensionsUsed ?? [],
      extensionsRequired: json.extensionsRequired ?? [],
      meshes: json.meshes?.length ?? 0,
      materials: json.materials?.length ?? 0,
      images: json.images?.length ?? 0,
    };
  } catch {
    return null;
  }
}

/** The first required extension the studio cannot handle, or null when the file is fine. */
export function unsupportedExtension(info: GlbInfo): string | null {
  const blocked = new Set<string>(['KHR_draco_mesh_compression', 'KHR_texture_basisu']);
  return info.extensionsRequired.find((e) => blocked.has(e)) ?? null;
}
