import { z } from 'zod';

export const selectedProductSchema = z.object({
  productId: z.number().int(),
  nameKa: z.string(),
  nameEn: z.string().nullable().optional(),
  nameRu: z.string().nullable().optional(),
  pricePerUnit: z.number(),
  unit: z.string(),
  qty: z.number(),
  totalPrice: z.number(),
  imageUrl: z.string().nullable().optional(),
  categorySlug: z.string().optional(),
  roomId: z.string().max(64).optional(),
  /** Ticked off the order on the summary; still part of the estimate. */
  excluded: z.boolean().optional(),
  /** A finish in the cart: which surface it is laid on, and what the board shows it with (see `SelectedProduct`). */
  surface: z.enum(['floor', 'wall']).optional(),
  slug: z.string().max(255).optional(),
  textureUrl: z.string().max(1024).nullable().optional(),
  colorHex: z.string().max(16).nullable().optional(),
  coveragePerUnit: z.number().nullable().optional(),
  specs: z.unknown().optional(),
});

/**
 * What the person made of the estimate on the summary: lines ticked out of the order, and
 * quantities of their own, by line key (`lib/design/ticks`). The estimate itself is never
 * sent — the server works it out again from the rooms and the picks — so this is only ever
 * laid over figures the server trusts.
 */
export const calculatorEditsSchema = z.object({
  excluded: z.array(z.union([z.number().int().positive(), z.string().min(3).max(96)])).max(1200).optional(),
  quantities: z.record(z.string().min(3).max(96), z.number().min(0).max(1_000_000)).optional(),
  choices: z.object({ floor: z.enum(['laminate', 'parquet']), ceiling: z.enum(['gypsum', 'barisol']) }).partial().optional(),
  progress: z
    .object({ step: z.number().int().min(1).max(7), calculated: z.boolean(), at: z.number().int().min(1).max(7).nullable().optional(), steps: z.number().int().min(1).max(12).optional() })
    .optional(),
});

/** A project's name, as the person typed it. */
export const projectNameSchema = z.string().trim().min(1).max(120);

/** "New project": a name, and which product it starts in (`POST /api/projects/create`). */
export const createProjectSchema = z.object({
  name: projectNameSchema,
  journey: z.enum(['calculator', 'design']),
});

export const renameProjectSchema = z.object({ name: projectNameSchema });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
