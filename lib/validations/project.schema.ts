import { z } from 'zod';
import { calculatorRequestSchema } from './room.schema';

const selectedProductSchema = z.object({
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
});

export const saveProjectSchema = calculatorRequestSchema.extend({
  nameKa: z.string().min(1).max(255).default('ჩემი პროექტი'),
  selectedProducts: z.record(selectedProductSchema).default({}),
  selectedFurniture: z.record(z.array(selectedProductSchema)).default({}),
  edits: calculatorEditsSchema.optional(),
  /** An existing project of the caller's to write into, so a calculation and a design share one row. */
  projectId: z.number().int().positive().optional(),
  /** An autosave: keeps the row a draft (or whatever it already is) instead of marking it saved. */
  draft: z.boolean().optional(),
});

/** The calculator's half of a project, as a design save carries it along. */
export const calculatorPicksPayloadSchema = calculatorRequestSchema.extend({
  selectedProducts: z.record(selectedProductSchema).default({}),
  selectedFurniture: z.record(z.array(selectedProductSchema)).default({}),
  edits: calculatorEditsSchema.optional(),
});

export type CalculatorPicksPayload = z.infer<typeof calculatorPicksPayloadSchema>;

export type SaveProjectInput = z.infer<typeof saveProjectSchema>;
