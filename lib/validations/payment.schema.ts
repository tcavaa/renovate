import { z } from 'zod';

/**
 * Starting a card payment (`POST /api/payments/flitt`): a half's fee before its hinge, or an own
 * item. Only what is paid for — the amount is the server's, never the browser's.
 */
export const startPaymentSchema = z.discriminatedUnion('purpose', [
  z.object({ purpose: z.enum(['calculator', 'design']), projectId: z.number().int().positive() }),
  z.object({ purpose: z.literal('own_item') }),
]);

export type StartPaymentBody = z.infer<typeof startPaymentSchema>;

/** A Flitt order id as the platform makes them (`remonti-…`), in a route's path. */
export const orderIdSchema = z.string().regex(/^remonti-[a-z]+-[a-z0-9]+-[0-9a-f]+$/);
