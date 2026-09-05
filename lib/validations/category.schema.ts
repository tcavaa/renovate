import { z } from 'zod';

export const calculationTypeEnum = z.enum([
  'per_m2_floor',
  'per_m2_wall',
  'per_m2_ceiling',
  'per_linear_m',
  'per_unit',
  'per_room',
  'fixed',
]);

export const categorySchema = z.object({
  nameKa: z.string().min(1).max(255),
  nameEn: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only'),
  icon: z.string().max(100).optional().nullable(),
  phase: z.coerce.number().int().min(1).max(30),
  calculationType: calculationTypeEnum,
  isVisible: z.boolean().default(true),
  isFurniture: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});

export type CategoryInput = z.infer<typeof categorySchema>;
