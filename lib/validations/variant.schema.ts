import { z } from 'zod';
import { MAX_VARIANTS, MAX_VARIANT_SLOTS } from '@/lib/design/variants';

/** A product's material variants (`lib/design/variants.ts`), as the product form sends them in `specs.variants`. */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb colour');
const fileUrl = z.string().max(500);

export const variantSlotSchema = z.object({
  material: z.string().trim().min(1).max(200),
  colorHex: hexColor.nullable().optional(),
  colorUrl: fileUrl.nullable().optional(),
  normalUrl: fileUrl.nullable().optional(),
  roughnessUrl: fileUrl.nullable().optional(),
  keepTexture: z.boolean().nullable().optional(),
  repeat: z.number().positive().max(100).nullable().optional(),
  roughness: z.number().min(0).max(1).nullable().optional(),
});

export const productVariantSchema = z.object({
  id: z.string().trim().min(1).max(64),
  nameKa: z.string().trim().min(1).max(200),
  nameEn: z.string().max(200).nullable().optional(),
  nameRu: z.string().max(200).nullable().optional(),
  colorHex: hexColor,
  imageUrl: fileUrl.nullable().optional(),
  pricePerUnit: z.number().positive().max(10_000_000).nullable().optional(),
  slots: z.array(variantSlotSchema).min(1).max(MAX_VARIANT_SLOTS),
});

export const productVariantsSchema = z
  .array(productVariantSchema)
  .max(MAX_VARIANTS)
  .refine((list) => new Set(list.map((v) => v.id)).size === list.length, 'Variant ids must be unique');

/** The variant on a scene's product snapshot (`SceneProduct.variant`); the save route rebuilds it from the catalogue. */
export const sceneVariantSchema = z.object({
  id: z.string().max(64),
  nameKa: z.string().max(200),
  nameEn: z.string().max(200).nullable().optional(),
  nameRu: z.string().max(200).nullable().optional(),
  colorHex: z.string().max(7),
  slots: z.array(variantSlotSchema).max(MAX_VARIANT_SLOTS),
});
