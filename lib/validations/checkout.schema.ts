import { z } from 'zod';
import { ORDER_STATUSES } from '@/lib/finance/money';

/**
 * Who the partner should call and where the goods go. A signed-in person sends only what the
 * dialogue had to ask for — the phone and the address when the profile has none, or an address
 * of this order's own — and the server fills the rest from the account (`resolveContact`,
 * `lib/account/contact.ts`); a guest (booking a brigade from its page) sends a name and a phone.
 */
export const contactSchema = z.object({
  name: z.string().trim().max(255).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(50).optional().nullable(),
  address: z
    .object({
      city: z.string().trim().max(120).optional().nullable(),
      line: z.string().trim().max(255).optional().nullable(),
      postalCode: z.string().trim().max(20).optional().nullable(),
    })
    .optional()
    .nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
  /** Keep the phone and the address typed here on the account as its defaults. */
  saveAsDefault: z.boolean().optional(),
});

export type ContactBody = z.infer<typeof contactSchema>;

export const checkoutSchema = z.object({
  projectId: z.number().int().positive(),
  customer: contactSchema,
});

/**
 * Booking one trade (`workerId`) or a whole brigade (`teamId`) — one of the two, never
 * both, because they are two different orders with two different people answering for them.
 */
export const bookingSchema = z
  .object({
    workerId: z.number().int().positive().optional(),
    teamId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional().nullable(),
    customer: contactSchema,
  })
  .refine((v) => (v.workerId ? 1 : 0) + (v.teamId ? 1 : 0) === 1, { message: 'BOOK_ONE_PARTNER' });

/** What a partner (or admin) may change on an order. */
export const orderEditSchema = z.object({
  status: z.enum(ORDER_STATUSES as [string, ...string[]]).optional(),
  partnerMessage: z.string().trim().max(4000).nullable().optional(),
  /** The agent's own note. Written and read by the platform's people only. */
  staffNote: z.string().trim().max(4000).nullable().optional(),
  /** The delivery the store charges — the platform's people only. */
  deliveryFee: z.number().min(0).max(100000).optional(),
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

/** A comment on an order, between the platform's people and the partner. */
export const orderCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const platformSettingsSchema = z.object({
  calculatorFeePerM2: z.coerce.number().min(0).max(10000).optional(),
  designFeePerM2: z.coerce.number().min(0).max(10000).optional(),
  storeCommissionPct: z.coerce.number().min(0).max(100).optional(),
  workerCommissionPct: z.coerce.number().min(0).max(100).optional(),
  /** The store that supplies the rate book's construction materials; null for nobody. */
  materialsStoreId: z.number().int().positive().nullable().optional(),
});
