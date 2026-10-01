import { z } from 'zod';

/**
 * A person's own account, as they edit it on their profile (`PATCH /api/profile`): the name,
 * the phone and the default delivery address. The e-mail is the sign-in and is not changed
 * here. An empty phone or a `null` address clears it.
 */
export const addressSchema = z.object({
  city: z.string().trim().min(1).max(120),
  line: z.string().trim().min(1).max(255),
  postalCode: z.string().trim().max(20).optional().nullable(),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  phone: z
    .string()
    .trim()
    .max(50)
    .refine((v) => v === '' || v.replace(/\D/g, '').length >= 5, { message: 'PHONE_REQUIRED' })
    .optional()
    .nullable(),
  address: addressSchema.nullable().optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
