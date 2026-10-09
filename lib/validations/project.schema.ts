import { z } from 'zod';

export const selectedProductSchema = z.object({
  productId: z.number().int(),
  nameKa: z.string().max(255),
  nameEn: z.string().max(255).nullable().optional(),
  nameRu: z.string().max(255).nullable().optional(),
  // The server reprices from the catalogue; these only have to be sane.
  pricePerUnit: z.number().min(0).max(1e8),
  unit: z.string().max(32),
  qty: z.number().min(0).max(1e6),
  totalPrice: z.number().min(0).max(1e10),
  imageUrl: z.string().max(1024).nullable().optional(),
  categorySlug: z.string().max(128).optional(),
  roomId: z.string().max(64).optional(),
  /** A finish in the cart: which surface it is laid on, and what the board shows it with (see `SelectedProduct`). */
  surface: z.enum(['floor', 'wall']).optional(),
  /** Its part of a floor laid in two products, and the walls it was chosen for one by one (see `SelectedProduct`). */
  share: z.number().min(0).max(1).optional(),
  walls: z.array(z.number().int().min(0).max(63)).max(64).optional(),
  slug: z.string().max(255).optional(),
  textureUrl: z.string().max(1024).nullable().optional(),
  colorHex: z.string().max(16).nullable().optional(),
  coveragePerUnit: z.number().nullable().optional(),
  /** The catalogue product's own specs, carried along; bounded so a save cannot carry megabytes in it. */
  specs: z.unknown().optional().refine((v) => v === undefined || JSON.stringify(v).length <= 8000, 'specs too large'),
  /** What the product is on a plan, and its model (see `SelectedProduct`). */
  model3dKind: z.string().max(64).nullable().optional(),
  model3dUrl: z.string().max(1024).nullable().optional(),
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
    .object({ step: z.number().int().min(1).max(6), calculated: z.boolean(), at: z.number().int().min(1).max(6).nullable().optional() })
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
