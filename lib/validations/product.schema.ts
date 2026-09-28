import { z } from 'zod';

export const unitEnum = z.enum(['m2', 'linear_m', 'piece', 'liter', 'kg', 'pack', 'set']);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb colour');

/**
 * `products.specs`: free-form product data (the calculator's "size: 60×60") plus what the
 * studio reads — a floor or wall finish's surfaces, wetness, texture scale, maps and colours
 * (`lib/design/surfaces.ts`, `lib/design/colors.ts`), a moulding's profile and measurements
 * (`lib/design/trims.ts`). Those keys are checked; any other key may hold plain values.
 */
export const productSpecsSchema = z
  .object({
    surfaces: z.array(z.enum(['floor', 'wall'])).max(2).optional(),
    wet: z.boolean().optional(),
    textureScaleM: z.number().positive().max(20).optional(),
    normalUrl: z.string().max(500).nullable().optional(),
    roughnessUrl: z.string().max(500).nullable().optional(),
    colors: z.array(hexColor).max(3).optional(),
    profile: z.enum(['flat', 'rounded', 'stepped', 'ogee', 'cove']).optional(),
    heightCm: z.number().positive().max(100).optional(),
    depthCm: z.number().positive().max(100).optional(),
  })
  .catchall(z.union([z.string().max(2000), z.number(), z.boolean(), z.null(), z.array(z.string().max(500)).max(20)]));

export type ProductSpecsInput = z.infer<typeof productSpecsSchema>;

export const productSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  storeId: z.coerce.number().int().positive().optional().nullable(),
  nameKa: z.string().min(1).max(500),
  nameEn: z.string().max(500).optional().nullable(),
  nameRu: z.string().max(500).optional().nullable(),
  descriptionKa: z.string().max(5000).optional().nullable(),
  descriptionEn: z.string().max(5000).optional().nullable(),
  descriptionRu: z.string().max(5000).optional().nullable(),
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
  specs: productSpecsSchema.optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),

  // --- Design Studio ---
  // Without `styleTags`, `model3dKind` and real dimensions a product is invisible to the 3D
  // studio: the matcher selects candidates by archetype, and the layout engine reserves space
  // by size. See ARCHETYPES in lib/design/catalog.ts.
  styleTags: z
    .array(z.enum(['modern', 'scandinavian', 'industrial', 'vintage']))
    .optional()
    .nullable(),
  model3dKind: z.string().max(64).optional().nullable(),
  model3dUrl: z.string().max(500).optional().nullable(),
  textureUrl: z.string().max(500).optional().nullable(),
  colorHex: z
    .union([hexColor, z.literal('')])
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
