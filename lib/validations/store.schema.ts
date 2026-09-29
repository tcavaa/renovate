import { z } from 'zod';

/**
 * A partner store.
 *
 * These fields are what the Design Studio's hover card and the summary's per-store basket
 * actually render — address, rating and delivery are not decoration, they are the reason the
 * shopping list is grouped by store at all.
 */
const urlOrPath = z
  .union([
    z.string().url(),
    z.string().regex(/^\/[\w\-./]+$/, 'Must be an absolute URL or root-relative path'),
    z.literal(''),
  ])
  .optional()
  .nullable();

export const storeSchema = z.object({
  nameKa: z.string().min(1).max(255),
  nameEn: z.string().max(255).optional().nullable(),
  nameRu: z.string().max(255).optional().nullable(),
  descriptionKa: z.string().max(2000).optional().nullable(),
  descriptionEn: z.string().max(2000).optional().nullable(),
  descriptionRu: z.string().max(2000).optional().nullable(),
  logoUrl: urlOrPath,
  websiteUrl: urlOrPath,
  phone: z.string().max(50).optional().nullable(),
  email: z.union([z.string().email().max(255), z.literal('')]).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  rating: z.coerce.number().min(0).max(5).optional().nullable(),
  reviewCount: z.coerce.number().int().min(0).optional().nullable(),
  deliveryDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  deliveryFeeGel: z.coerce.number().min(0).max(100000).optional().nullable(),
  commissionRate: z.coerce.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().default(true),
  /**
   * This store supplies the rate book's construction materials (`platform_settings.materialsStoreId`
   * — one store for all of them). Admin's, like the settings it writes; not a column of the store.
   */
  suppliesMaterials: z.boolean().optional(),
});

export type StoreInput = z.infer<typeof storeSchema>;

/**
 * Maps validated input onto a Drizzle row.
 *
 * MySQL decimals round-trip as strings in Drizzle, so rating, delivery fee and commission all
 * convert on the way in. Generic over the input so a full insert keeps `nameKa` required while
 * a partial update stays partial.
 */
export function toStoreRow<T extends Partial<StoreInput>>(data: T) {
  // Not a column: the routes write it to the platform's settings.
  const fields = { ...data };
  delete fields.suppliesMaterials;
  return {
    ...fields,
    logoUrl: data.logoUrl || null,
    websiteUrl: data.websiteUrl || null,
    email: data.email !== undefined ? data.email || null : undefined,
    rating: data.rating != null ? String(data.rating) : undefined,
    deliveryFeeGel: data.deliveryFeeGel != null ? String(data.deliveryFeeGel) : undefined,
    commissionRate: data.commissionRate != null ? String(data.commissionRate) : undefined,
  };
}
