/**
 * Material variants: one product, one 3D model, several looks — a sofa in black leather and in
 * white, a chair's seat in three fabrics. Admin gives a product its variants in the product form
 * (`products.specs.variants`); the studio's item card shows them as swatches, and the one picked
 * re-colours or re-textures the parts of the model it names (`lib/design3d/variantMaterials.ts`).
 *
 * A variant changes *materials of the GLB*, by name: "Leather" and not "Wood", so the legs stay
 * as they are. For each it can set a colour (over the part's own texture, which keeps its grain,
 * or instead of it), a colour map of its own with normal and roughness maps, and how glossy the
 * part is. It may have its own price and photo; without, the product's.
 *
 * The variant chosen rides on the item's product snapshot (`SceneProduct.variant`), not on the
 * item: every swap or re-match makes a fresh snapshot, so a variant can never outlive the product
 * it belongs to. The save route rebuilds it from the catalogue by its id (`repriceItemSnapshot`),
 * price and files included, so a client's own slots or price are never stored.
 *
 * Pure and isomorphic.
 */

import type { CatalogProduct } from './matcher';
import type { PlacedItem, SceneProduct } from './types';

/** One material of the model, as a variant changes it. */
export interface VariantSlot {
  /** The GLB material this changes, by its name in the file. */
  material: string;
  /** The colour the part takes — over its own texture when that is kept, else plain. */
  colorHex?: string | null;
  /** A colour map in place of the part's own, laid on the model's own UVs. */
  colorUrl?: string | null;
  normalUrl?: string | null;
  roughnessUrl?: string | null;
  /** Keep the part's own texture under `colorHex` (leather grain, a weave). Default true. */
  keepTexture?: boolean | null;
  /** How many times `colorUrl` repeats across the part's UVs. Default 1. */
  repeat?: number | null;
  /** 0 glossy … 1 matt; absent keeps the part's own. */
  roughness?: number | null;
}

/** One look of a product, as admin defines it (`products.specs.variants`). */
export interface ProductVariant {
  /** Stable for good: saved designs name the variant by it. */
  id: string;
  nameKa: string;
  nameEn?: string | null;
  nameRu?: string | null;
  /** The swatch the studio shows. */
  colorHex: string;
  /** A photo of the product in this look; none: the product's own. */
  imageUrl?: string | null;
  /** Its own price per unit; none: the product's. */
  pricePerUnit?: number | null;
  slots: VariantSlot[];
}

/** The variant an item is in, on its product snapshot: what the 3D view and the budget need. */
export interface SceneVariant {
  id: string;
  nameKa: string;
  nameEn?: string | null;
  nameRu?: string | null;
  colorHex: string;
  slots: VariantSlot[];
}

export const MAX_VARIANTS = 12;
export const MAX_VARIANT_SLOTS = 16;

const HEX = /^#[0-9a-f]{6}$/i;

const str = (value: unknown, max = 500): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function readSlot(raw: unknown): VariantSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const material = str(r.material, 200);
  if (!material) return null;
  const colorHex = str(r.colorHex, 7);
  const repeat = num(r.repeat);
  const roughness = num(r.roughness);
  return {
    material,
    colorHex: colorHex && HEX.test(colorHex) ? colorHex.toUpperCase() : null,
    colorUrl: str(r.colorUrl),
    normalUrl: str(r.normalUrl),
    roughnessUrl: str(r.roughnessUrl),
    keepTexture: r.keepTexture === false ? false : true,
    repeat: repeat != null && repeat > 0 && repeat <= 100 ? repeat : null,
    roughness: roughness != null ? Math.min(1, Math.max(0, roughness)) : null,
  };
}

/**
 * A product's variants as `specs` holds them, every malformed one left out: an id, a name, a
 * swatch colour and at least one material it changes, or it is not a variant. Ids are unique.
 */
export function productVariants(specs: unknown): ProductVariant[] {
  const list = specs && typeof specs === 'object' ? (specs as Record<string, unknown>).variants : null;
  if (!Array.isArray(list)) return [];
  const out: ProductVariant[] = [];
  const seen = new Set<string>();
  for (const raw of list.slice(0, MAX_VARIANTS)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.id, 64);
    const nameKa = str(r.nameKa, 200);
    const colorHex = str(r.colorHex, 7);
    if (!id || seen.has(id) || !nameKa || !colorHex || !HEX.test(colorHex)) continue;
    const slots = (Array.isArray(r.slots) ? r.slots : []).slice(0, MAX_VARIANT_SLOTS).map(readSlot).filter((s): s is VariantSlot => s != null);
    if (slots.length === 0) continue;
    const price = num(r.pricePerUnit);
    seen.add(id);
    out.push({
      id,
      nameKa,
      nameEn: str(r.nameEn, 200),
      nameRu: str(r.nameRu, 200),
      colorHex: colorHex.toUpperCase(),
      imageUrl: str(r.imageUrl),
      pricePerUnit: price != null && price > 0 ? price : null,
      slots,
    });
  }
  return out;
}

export function findVariant(specs: unknown, id: string | null | undefined): ProductVariant | null {
  if (!id) return null;
  return productVariants(specs).find((v) => v.id === id) ?? null;
}

/** What one unit costs in this variant: its own price, else the product's. */
export function variantUnitPrice(basePrice: number, variant: Pick<ProductVariant, 'pricePerUnit'> | null | undefined): number {
  return variant?.pricePerUnit != null && variant.pricePerUnit > 0 ? variant.pricePerUnit : basePrice;
}

/** The variant as the snapshot carries it. */
export function sceneVariant(variant: ProductVariant): SceneVariant {
  return { id: variant.id, nameKa: variant.nameKa, nameEn: variant.nameEn ?? null, nameRu: variant.nameRu ?? null, colorHex: variant.colorHex, slots: variant.slots };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A snapshot in a variant (or in the product's own look, `null`): the variant's price, its photo
 * and the variant itself. `base` is what the product costs and looks like without one.
 */
export function snapshotInVariant(
  snapshot: SceneProduct,
  base: { pricePerUnit: number; imageUrl: string | null },
  variant: ProductVariant | null
): SceneProduct {
  const pricePerUnit = variantUnitPrice(base.pricePerUnit, variant);
  const { variant: _previous, ...rest } = snapshot;
  return {
    ...rest,
    pricePerUnit,
    totalPrice: round2(pricePerUnit * snapshot.qty),
    imageUrl: variant?.imageUrl || base.imageUrl,
    ...(variant ? { variant: sceneVariant(variant) } : {}),
  };
}

/**
 * The item in this variant of its product, or in the product's own look (`variantId` null). An
 * item of another product, or an id the product has no variant by, leaves the item as it was.
 */
export function withItemVariant(item: PlacedItem, product: CatalogProduct, variantId: string | null): PlacedItem {
  if (!item.product || item.product.productId !== product.id) return item;
  const variant = variantId ? findVariant(product.specs, variantId) : null;
  if (variantId && !variant) return item;
  return { ...item, product: snapshotInVariant(item.product, { pricePerUnit: product.pricePerUnit, imageUrl: product.imageUrl }, variant) };
}

type Named = { nameKa: string; nameEn?: string | null; nameRu?: string | null };

/**
 * A product's names with its variant's after them — "Sofa Lund — black leather" — for the budget
 * line and the order a store is sent. Without a variant, the product's names as they are.
 */
export function namesWithVariant(product: Named & { variant?: Named | null }): { nameKa: string; nameEn: string | null; nameRu: string | null } {
  const v = product.variant;
  if (!v) return { nameKa: product.nameKa, nameEn: product.nameEn ?? null, nameRu: product.nameRu ?? null };
  const join = (a: string | null | undefined, b: string | null | undefined) => (a ? `${a} — ${b || v.nameKa}` : null);
  return {
    nameKa: `${product.nameKa} — ${v.nameKa}`,
    nameEn: join(product.nameEn, v.nameEn),
    nameRu: join(product.nameRu, v.nameRu || v.nameEn),
  };
}

/** Every file the variants name — what a deleted product or a dropped variant lets go of. */
export function variantFileUrls(specs: unknown): string[] {
  const out: string[] = [];
  for (const variant of productVariants(specs)) {
    if (variant.imageUrl) out.push(variant.imageUrl);
    for (const slot of variant.slots) for (const url of [slot.colorUrl, slot.normalUrl, slot.roughnessUrl]) if (url) out.push(url);
  }
  return out;
}

/** What a variant's look is made of, for telling two looks apart (the 3D view rebuilds on a change). */
export function variantSignature(variant: Pick<SceneVariant, 'id' | 'slots'> | null | undefined): string {
  if (!variant) return '';
  return `${variant.id}:${variant.slots.map((s) => [s.material, s.colorHex ?? '', s.colorUrl ?? '', s.normalUrl ?? '', s.roughnessUrl ?? '', s.keepTexture === false ? 0 : 1, s.repeat ?? '', s.roughness ?? ''].join(',')).join(';')}`;
}

/** A fresh id for a variant made in the form. */
export function newVariantId(): string {
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
