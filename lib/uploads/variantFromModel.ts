/**
 * A material variant read off a second model of the same product (`lib/uploads/glbLooks.ts`):
 * the store sent the sofa twice, in two fabrics. The main model is the product's; the second is
 * read here in the browser, compared with it material by material, and only the parts that look
 * different become the variant — their textures uploaded to `textures/` as any finish texture is
 * (`POST /api/upload`, stored as WebP), their colours and gloss copied. The second file itself is
 * never uploaded or stored.
 *
 * Browser-only (it uploads, and compares two textures by drawing them small on a canvas).
 */

import { claimWith, sendToStorage } from './direct';
import { factorsDiffer, matchLooks, readGlbLooks, sameImage, type GlbImage, type GlbLook } from './glbLooks';
import { newVariantId, MAX_VARIANT_SLOTS, type ProductVariant, type VariantSlot } from '@/lib/design/variants';

export interface ModelVariantResult {
  /** The variant, or null when nothing of the second model looks different. */
  variant: ProductVariant | null;
  /** How the materials were paired: by name, or by their order in the files. */
  by: 'name' | 'order';
  /** The main model's materials the second model does not have. */
  unmatched: string[];
  /** Materials whose texture could not be taken (Basis, an image beside the file, too big). */
  skipped: string[];
}

export class ModelVariantError extends Error {
  constructor(readonly code: 'NOT_GLB' | 'MAIN_UNREADABLE' | 'NO_SHARED_MATERIALS') {
    super(code);
  }
}

const UPLOADABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_TEXTURE_BYTES = 8 * 1024 * 1024;
const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export async function variantFromModel(mainUrl: string, file: File, onStep?: (step: 'reading' | 'uploading') => void): Promise<ModelVariantResult> {
  onStep?.('reading');
  const other = readGlbLooks(new Uint8Array(await file.arrayBuffer()));
  if (!other) throw new ModelVariantError('NOT_GLB');
  const response = await fetch(mainUrl);
  const main = response.ok ? readGlbLooks(new Uint8Array(await response.arrayBuffer())) : null;
  if (!main) throw new ModelVariantError('MAIN_UNREADABLE');
  const { matches, unmatched, by } = matchLooks(main, other);
  if (matches.length === 0) throw new ModelVariantError('NO_SHARED_MATERIALS');

  // What looks different: the factors, or a texture that is not the same picture. The main model
  // went through the upload recipe (its textures made WebP and maybe smaller), so a texture that
  // is not the same bytes is compared by eye too.
  const changed: typeof matches = [];
  for (const match of matches) {
    const { look, main: was } = match;
    if (factorsDiffer(look, was) || !(await alike(look.color, was.color)) || !(await alike(look.normal, was.normal))) changed.push(match);
  }
  if (changed.length === 0) return { variant: null, by, unmatched, skipped: [] };

  onStep?.('uploading');
  const uploaded = new Map<GlbImage, Promise<{ url: string; colors?: string[] } | null>>();
  const upload = (image: GlbImage | null) => {
    if (!image || !UPLOADABLE.has(image.mime) || image.bytes.length > MAX_TEXTURE_BYTES) return Promise.resolve(null);
    // The same picture used by two materials goes up once.
    const known = [...uploaded.keys()].find((k) => sameImage(k, image));
    if (known) return uploaded.get(known)!;
    const sent = (async () => {
      const upload = await sendToStorage('image', new File([image.bytes as BlobPart], `texture.${EXTENSION[image.mime]}`, { type: image.mime }));
      return claimWith<{ url: string; colors?: string[] }>('/api/upload', { upload, folder: 'textures' });
    })();
    uploaded.set(image, sent);
    return sent;
  };

  // A variant holds at most MAX_VARIANT_SLOTS parts; the rest are named as left out.
  const skipped: string[] = changed.slice(MAX_VARIANT_SLOTS).map((m) => m.material);
  const slots: VariantSlot[] = [];
  let swatch: string | null = null;
  for (const { material, look } of changed.slice(0, MAX_VARIANT_SLOTS)) {
    const [colour, normal, rough] = await Promise.all([upload(look.color), upload(look.normal), upload(look.roughnessMap)]);
    if (look.color && !colour) skipped.push(material);
    slots.push({
      material,
      // glTF multiplies the texture by its factor, as the variant's colour does over its own texture.
      colorHex: look.colorHex,
      colorUrl: colour?.url ?? null,
      normalUrl: normal?.url ?? null,
      roughnessUrl: rough?.url ?? null,
      // A part with no texture is a plain colour, whatever the main model had there.
      keepTexture: look.color ? null : false,
      repeat: look.repeat,
      roughness: Math.round(look.roughness * 100) / 100,
    });
    swatch ??= colour?.colors?.[0] ?? (look.color ? null : look.colorHex);
  }
  const name = file.name.replace(/\.glb$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200) || 'variant';
  return {
    variant: { id: newVariantId(), nameKa: name, nameEn: name, nameRu: null, colorHex: (swatch ?? slots[0].colorHex ?? '#8A8A8A').toUpperCase(), imageUrl: null, pricePerUnit: null, slots },
    by,
    unmatched,
    skipped,
  };
}

/** Two textures that are the same picture: the same bytes, or alike drawn 16 px wide. */
async function alike(a: GlbImage | null, b: GlbImage | null): Promise<boolean> {
  if (!a || !b) return a === b;
  if (sameImage(a, b)) return true;
  try {
    const [pa, pb] = await Promise.all([thumb(a), thumb(b)]);
    let diff = 0;
    for (let i = 0; i < pa.length; i++) diff += Math.abs(pa[i] - pb[i]);
    return diff / pa.length < 6;
  } catch {
    return false;
  }
}

async function thumb(image: GlbImage): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(new Blob([image.bytes as BlobPart], { type: image.mime }));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, 16, 16);
  bitmap.close();
  return ctx.getImageData(0, 0, 16, 16).data;
}

export type { GlbLook };
