import { z } from 'zod';
import { USER_ROLES } from '@/lib/auth/roles';

/**
 * Admin's account forms. A partner role's link (`storeId` / `workerId` / `teamId`) is checked
 * against the role by `linksForRole` in `lib/auth/accounts.ts`; these only check the shapes.
 */
const role = z.enum(USER_ROLES as unknown as [string, ...string[]]);
const link = z.number().int().positive().nullable().optional();
const password = z.string().min(8).max(100);

export const userCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  password,
  role,
  storeId: link,
  workerId: link,
  teamId: link,
  /** Admin vouches for the address (a colleague, a partner signed up in person). */
  emailVerified: z.boolean().optional(),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().max(255).optional(),
  role: role.optional(),
  storeId: link,
  workerId: link,
  teamId: link,
  isActive: z.boolean().optional(),
  /** A new password set by admin — for an agent who lost theirs, or a partner's first login. */
  password: password.optional(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
