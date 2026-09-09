import { z } from 'zod';
import { ORDER_STATUSES } from '@/lib/finance/money';

/** Who the partner should call. Guests fill this in; signed-in users get it prefilled. */
export const customerSchema = z.object({
  name: z.string().trim().min(2).max(255),
  phone: z.string().trim().min(5).max(50),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal('')),
  note: z.string().trim().max(2000).optional().nullable(),
});

export type CustomerInput = z.infer<typeof customerSchema>;

export const checkoutSchema = z.object({
  projectId: z.number().int().positive(),
  customer: customerSchema,
});

export const bookingSchema = z.object({
  workerId: z.number().int().positive(),
  projectId: z.number().int().positive().optional().nullable(),
  customer: customerSchema,
});

/** What a partner (or admin) may change on an order. */
export const orderEditSchema = z.object({
  status: z.enum(ORDER_STATUSES as [string, ...string[]]).optional(),
  partnerMessage: z.string().trim().max(4000).nullable().optional(),
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        qty: z.number().min(0).max(100000).optional(),
        unitPrice: z.number().min(0).max(10_000_000).optional(),
        removed: z.boolean().optional(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
    )
    .max(200)
    .optional(),
  addItems: z
    .array(
      z.object({
        nameKa: z.string().trim().min(1).max(500),
        qty: z.number().min(0).max(100000),
        unitPrice: z.number().min(0).max(10_000_000),
        unit: z.string().trim().max(20).optional(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
    )
    .max(50)
    .optional(),
});

export type OrderEditInput = z.infer<typeof orderEditSchema>;

export const platformSettingsSchema = z.object({
  calculatorFeePerM2: z.coerce.number().min(0).max(10000).optional(),
  designFeePerM2: z.coerce.number().min(0).max(10000).optional(),
  storeCommissionPct: z.coerce.number().min(0).max(100).optional(),
  workerCommissionPct: z.coerce.number().min(0).max(100).optional(),
});

/** Turns the form's empty string / null e-mail into what the row wants. */
export function normaliseCustomer(input: CustomerInput) {
  return {
    name: input.name,
    phone: input.phone,
    email: input.email ? input.email : null,
    note: input.note ? input.note : null,
  };
}
