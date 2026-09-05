import { z } from 'zod';

/** A row of the calculator's rate book, as admin edits it. */
export const rateSchema = z.object({
  kind: z.enum(['material', 'labour']),
  key: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, digits and underscores only'),
  labelKa: z.string().min(1).max(255),
  phase: z.coerce.number().int().min(0).max(20),
  unit: z.enum(['m2', 'linear_m', 'piece', 'liter', 'kg', 'm3', 'unit']),
  basis: z.enum(['floor', 'wall', 'ceiling', 'wet_floor', 'perimeter']).optional().nullable(),
  qtyPerM2: z.coerce.number().min(0).max(10000).optional().nullable(),
  wasteFactorPct: z.coerce.number().min(0).max(100).optional().nullable(),
  pricePerUnit: z.coerce.number().min(0).max(1_000_000),
  linkedCategorySlug: z.string().max(100).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type RateInput = z.infer<typeof rateSchema>;

/** Everything but the key can change on an existing row. */
export const rateUpdateSchema = rateSchema.partial().omit({ key: true, kind: true });

export function toRateRow(input: RateInput) {
  return {
    kind: input.kind,
    key: input.key,
    labelKa: input.labelKa,
    phase: input.phase,
    unit: input.unit,
    basis: input.kind === 'material' ? (input.basis ?? 'floor') : null,
    qtyPerM2: input.kind === 'material' ? String(input.qtyPerM2 ?? 0) : null,
    wasteFactorPct: input.kind === 'material' ? String(input.wasteFactorPct ?? 0) : null,
    pricePerUnit: String(input.pricePerUnit),
    linkedCategorySlug: input.linkedCategorySlug ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  };
}
