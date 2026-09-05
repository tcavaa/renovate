import { z } from 'zod';

export const unitEnum = z.enum(['m2', 'linear_m', 'piece', 'liter', 'kg', 'pack', 'set']);

export const productSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  storeId: z.coerce.number().int().positive().optional().nullable(),
  nameKa: z.string().min(1).max(500),
  descriptionKa: z.string().max(5000).optional().nullable(),
  slug: z.string().min(1).max(500),
  sku: z.string().max(100).optional().nullable(),
  pricePerUnit: z.coerce.number().positive(),
  unit: unitEnum,
  coveragePerUnit: z.coerce.number().positive().optional().nullable(),
  brand: z.string().max(255).optional().nullable(),
  imageUrl: z
    .union([
      z.string().url(),
      z.string().regex(/^\/[\w\-./]+$/, 'Must be an absolute URL or root-relative path'),
      z.literal(''),
    ])
    .optional()
    .nullable(),
  specs: z.record(z.string()).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),

  // --- Design Studio ---
  // Without `styleTags`, `model3dKind` and real dimensions a product is invisible to the 3D
  // studio: the matcher selects candidates by archetype, and the layout engine reserves space
  // by size. See lib/design/catalog.ts and lib/design3d/furniture.
  styleTags: z
    .array(z.enum(['modern', 'scandinavian', 'industrial', 'vintage']))
    .optional()
    .nullable(),
  model3dKind: z.string().max(64).optional().nullable(),
  model3dUrl: z.string().max(500).optional().nullable(),
  textureUrl: z.string().max(500).optional().nullable(),
  colorHex: z
    .union([z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb colour'), z.literal('')])
    .optional()
    .nullable(),
  widthCm: z.coerce.number().int().min(1).max(2000).optional().nullable(),
  depthCm: z.coerce.number().int().min(1).max(2000).optional().nullable(),
  heightCm: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});

export type ProductInput = z.infer<typeof productSchema>;
