import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, requireAdmin } from '@/lib/api/route';
import { linksForRole } from '@/lib/auth/accounts';
import { partnerLinkExists } from '@/lib/admin/accounts';
import { userCreateSchema } from '@/lib/validations/user.schema';
import type { UserRole } from '@/lib/auth/roles';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin makes an account: an agent, a partner's login, or a customer signed up by phone. It
 * starts active with the password admin set (passed on in person); a partner role needs the
 * store, worker or brigade it speaks for.
 */
export const POST = handle('POST /api/users', 'Failed to create the account', async (req) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const parsed = userCreateSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const input = parsed.data;
  const role = input.role as UserRole;
  const email = input.email.toLowerCase();

  const links = linksForRole(role, { storeId: input.storeId, workerId: input.workerId, teamId: input.teamId });
  if (!links.ok) return fail(API_ERRORS.PARTNER_LINK_REQUIRED, 400);
  if (!(await partnerLinkExists(links.links))) return fail(API_ERRORS.NOT_FOUND, 404);

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return fail(API_ERRORS.EMAIL_EXISTS, 409);

  const [inserted] = await db.insert(users).values({
    name: input.name,
    email,
    passwordHash: await bcrypt.hash(input.password, 10),
    role,
    ...links.links,
    emailVerifiedAt: input.emailVerified ? new Date() : null,
    isActive: true,
  });
  const id = Number(inserted.insertId);
  log.info('account created by admin', { by: admin.session.user.id, id, role });
  return ok({ id });
});
