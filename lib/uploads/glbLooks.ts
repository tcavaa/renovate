/**
 * The looks of a GLB's materials, read from the file itself: each material's base colour,
 * roughness and metalness, and its colour, normal and roughness textures as the bytes embedded
 * in the file — the original JPEG, PNG or WebP, never re-encoded. Nothing is decoded, so it is
 * quick on a large file and runs in the browser and in tests alike.
 *
 * What it is for: a store sends the same sofa twice, in two fabrics. One file is the product's
 * model; the other is only read here, its textures uploaded and appended to the product as a
 * material variant (`lib/design/variants.ts`, `components/admin/VariantsEditor.tsx`). The second
 * model is never stored.
 */

export interface GlbImage {
  bytes: Uint8Array;
  mime: string;
}

export interface GlbLook {
  /** Its index among the file's materials. */
  index: number;
  name: string;
  /** `baseColorFactor` as sRGB `#RRGGBB` (the factor is linear). */
  colorHex: string;
  roughness: number;
  metallic: number;
  color: GlbImage | null;
  normal: GlbImage | null;
  /** glTF's metallic-roughness texture: roughness in green, as three's `roughnessMap` reads it. */
  roughnessMap: GlbImage | null;
  /** The colour texture's `KHR_texture_transform` scale, when it repeats the same both ways. */
  repeat: number | null;
}

interface TextureInfo {
  index?: number;
  extensions?: { KHR_texture_transform?: { scale?: [number, number] } };
}

interface GltfJson {
  materials?: Array<{
    name?: string;
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      baseColorTexture?: TextureInfo;
      metallicFactor?: number;
      roughnessFactor?: number;
      metallicRoughnessTexture?: TextureInfo;
    };
    normalTexture?: TextureInfo;
  }>;
  textures?: Array<{ source?: number; extensions?: Record<string, { source?: number } | undefined> }>;
  images?: Array<{ bufferView?: number; mimeType?: string; uri?: string }>;
  bufferViews?: Array<{ buffer?: number; byteOffset?: number; byteLength: number }>;
}

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** The file's materials as they look, or null when it is not a GLB this can read. */
export function readGlbLooks(bytes: Uint8Array): GlbLook[] | null {
  const parsed = parseGlb(bytes);
  if (!parsed) return null;
  const { json, bin } = parsed;
  const image = (info: TextureInfo | undefined): GlbImage | null => {
    if (info?.index == null) return null;
    const texture = json.textures?.[info.index];
    // A WebP texture sits under EXT_texture_webp (with or without a fallback); Basis (KTX2) is not readable here.
    const source = texture?.extensions?.EXT_texture_webp?.source ?? texture?.source;
    const img = source != null ? json.images?.[source] : undefined;
    if (!img) return null;
    if (img.bufferView != null) {
      const view = json.bufferViews?.[img.bufferView];
      if (!view || !bin || (view.buffer ?? 0) !== 0) return null;
      const start = view.byteOffset ?? 0;
      if (start + view.byteLength > bin.length) return null;
      const out = bin.slice(start, start + view.byteLength);
      return { bytes: out, mime: img.mimeType ?? sniffMime(out) };
    }
    if (img.uri?.startsWith('data:')) {
      const comma = img.uri.indexOf(',');
      const out = base64Bytes(img.uri.slice(comma + 1));
      return { bytes: out, mime: img.uri.slice(5, img.uri.indexOf(';')) || sniffMime(out) };
    }
    return null; // an image beside the file is not in the file
  };
  return (json.materials ?? []).map((m, index) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    const scale = pbr.baseColorTexture?.extensions?.KHR_texture_transform?.scale;
    return {
      index,
      name: m.name ?? '',
      colorHex: linearToHex(pbr.baseColorFactor ?? [1, 1, 1, 1]),
      roughness: pbr.roughnessFactor ?? 1,
      metallic: pbr.metallicFactor ?? 1,
      color: image(pbr.baseColorTexture),
      normal: image(m.normalTexture),
      roughnessMap: image(pbr.metallicRoughnessTexture),
      repeat: scale && Math.abs(scale[0] - scale[1]) < 1e-6 && Math.abs(scale[0] - 1) > 1e-6 ? scale[0] : null,
    };
  });
}

export interface LookMatch {
  /** The main model's material, by its name. */
  material: string;
  look: GlbLook;
  /** The main model's look of it, to tell what changed. */
  main: GlbLook;
}

/**
 * The second model's materials paired with the main model's: by name, or — when no name is
 * shared and both have as many materials — by their order in the file (an export that renamed
 * every material). `unmatched` are the main model's materials the second does not have.
 */
export function matchLooks(main: GlbLook[], other: GlbLook[]): { matches: LookMatch[]; unmatched: string[]; by: 'name' | 'order' } {
  const byName = new Map(other.filter((l) => l.name).map((l) => [l.name, l]));
  const named = main.filter((m) => m.name && byName.has(m.name));
  if (named.length > 0 || main.length !== other.length) {
    return {
      matches: named.map((m) => ({ material: m.name, look: byName.get(m.name)!, main: m })),
      unmatched: main.filter((m) => m.name && !byName.has(m.name)).map((m) => m.name),
      by: 'name',
    };
  }
  return { matches: main.filter((m) => m.name).map((m) => ({ material: m.name, look: other[m.index], main: m })), unmatched: [], by: 'order' };
}

/** The factors differ (colour, roughness, metalness), or one has a texture the other has not. */
export function factorsDiffer(a: GlbLook, b: GlbLook): boolean {
  return (
    a.colorHex !== b.colorHex ||
    Math.abs(a.roughness - b.roughness) > 0.01 ||
    Math.abs(a.metallic - b.metallic) > 0.01 ||
    !!a.color !== !!b.color ||
    !!a.normal !== !!b.normal
  );
}

/** The same image, byte for byte. */
export function sameImage(a: GlbImage | null, b: GlbImage | null): boolean {
  if (!a || !b) return a === b;
  if (a.bytes.length !== b.bytes.length) return false;
  for (let i = 0; i < a.bytes.length; i++) if (a.bytes[i] !== b.bytes[i]) return false;
  return true;
}

function parseGlb(bytes: Uint8Array): { json: GltfJson; bin: Uint8Array | null } | null {
  if (bytes.length < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return null;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) {
      try {
        json = JSON.parse(new TextDecoder().decode(body)) as GltfJson;
      } catch {
        return null;
      }
    } else if (type === CHUNK_BIN) bin = body;
    offset += 8 + length;
  }
  return json ? { json, bin } : null;
}

function linearToHex(factor: number[]): string {
  const channel = (c: number) => {
    const v = Math.min(1, Math.max(0, c ?? 1));
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(s * 255).toString(16).padStart(2, '0');
  };
  return `#${[factor[0], factor[1], factor[2]].map(channel).join('').toUpperCase()}`;
}

function sniffMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  return 'application/octet-stream';
}

function base64Bytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
