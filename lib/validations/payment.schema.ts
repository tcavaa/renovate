import { z } from 'zod';

/**
 * Starting a card payment (`POST /api/payments/flitt`): a plan for a month or a year, an own
 * item, or a render past a Professional month's free ones. Only what is paid for — the amount
 * is the server's, never the browser's.
 */
export const startPaymentSchema = z.discriminatedUnion('purpose', [
  z.object({ purpose: z.literal('subscription'), plan: z.enum(['premium', 'professional']), period: z.enum(['month', 'year']) }),
  z.object({ purpose: z.literal('own_item') }),
  z.object({ purpose: z.literal('render') }),
]);

export type StartPaymentBody = z.infer<typeof startPaymentSchema>;

/** A Flitt order id as the platform makes them (`remonti-…`), in a route's path. */
export const orderIdSchema = z.string().regex(/^remonti-[a-z]+-[a-z0-9]+-[0-9a-f]+$/);

/** Admin's grant of a plan (`POST /api/admin/users/[id]/plan`): a plan for so many months, or none — every subscription ended now. */
export const grantPlanSchema = z.union([
  z.object({ plan: z.enum(['premium', 'professional']), months: z.number().int().min(1).max(36) }),
  z.object({ plan: z.literal('free') }),
]);
