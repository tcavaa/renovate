import { z } from 'zod';
import { calculatorRequestSchema } from './room.schema';

const selectedProductSchema = z.object({
  productId: z.number().int(),
  nameKa: z.string(),
  pricePerUnit: z.number(),
  unit: z.string(),
  qty: z.number(),
  totalPrice: z.number(),
  imageUrl: z.string().nullable().optional(),
  categorySlug: z.string().optional(),
});

export const saveProjectSchema = calculatorRequestSchema.extend({
  nameKa: z.string().min(1).max(255).default('ჩემი პროექტი'),
  selectedProducts: z.record(selectedProductSchema).default({}),
  selectedFurniture: z.record(z.array(selectedProductSchema)).default({}),
});

export type SaveProjectInput = z.infer<typeof saveProjectSchema>;
