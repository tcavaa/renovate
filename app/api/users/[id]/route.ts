import bcrypt from 'bcryptjs';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';
import { linksForRole, selfChangeError } from '@/lib/auth/accounts';
import { forgetAccount } from '@/lib/auth/accountClaims';
import { partnerLinkExists } from '@/lib/admin/accounts';
import { userUpdateSchema } from '@/lib/validations/user.schema';
import type { UserRole } from '@/lib/auth/roles';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/users/[id]', 'Failed to load user', async (_req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      storeId: users.storeId,
      workerId: users.workerId,
      teamId: users.teamId,
      isActive: users.isActive,
      emailVerifiedAt: users.emailVerifiedAt,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(rows[0]);
});

/**
 * Admin changes an account: name, e-mail, role and its partner link, the active switch, a new
 * password. The change is on the account's next request — its session re-reads the row
 * (`lib/auth/accountClaims`), and this process forgets what it remembered of it at once.
 */
export const PUT = handle('PUT /api/users/[id]', 'Failed to update user', async (req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const parsed = userUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const input = parsed.data;

  const [current] = await db.select({ id: users.id, role: users.role, storeId: users.storeId, workerId: users.workerId, teamId: users.teamId }).from(users).where(eq(users.id, id)).limit(1);
  if (!current) return fail(API_ERRORS.NOT_FOUND, 404);

  // Demoting or switching off yourself would lock the last admin out of the admin area.
  const selfError = selfChangeError(Number(admin.session.user.id), id, { role: input.role as UserRole | undefined, isActive: input.isActive });
  if (selfError) return fail(API_ERRORS[selfError], 400);

  // A partner link only makes sense with the matching role; anything else is cleared so a
  // demoted account does not keep a door into the portal.
  const role = (input.role as UserRole | undefined) ?? current.role;
  const links = linksForRole(role, { storeId: input.storeId, workerId: input.workerId, teamId: input.teamId }, current);
  if (!links.ok) return fail(API_ERRORS.PARTNER_LINK_REQUIRED, 400);
  if (!(await partnerLinkExists(links.links))) return fail(API_ERRORS.NOT_FOUND, 404);

  const email = input.email?.toLowerCase();
  if (email) {
    const taken = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, id))).limit(1);
    if (taken.length > 0) return fail(API_ERRORS.EMAIL_EXISTS, 409);
  }

  await db
    .update(users)
    .set({
      name: input.name,
      email,
      role: input.role as UserRole | undefined,
      ...links.links,
      isActive: input.isActive,
      passwordHash: input.password ? await bcrypt.hash(input.password, 10) : undefined,
    })
    .where(eq(users.id, id));
  forgetAccount(id);
  log.info('account changed by admin', { by: admin.session.user.id, id, role: input.role, isActive: input.isActive, password: input.password ? 'reset' : undefined });
  return ok({ id });
});

export const DELETE = handle('DELETE /api/users/[id]', 'Failed to delete user', async (_req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const selfError = selfChangeError(Number(admin.session.user.id), id, { remove: true });
  if (selfError) return fail(API_ERRORS[selfError], 400);

  await db.delete(users).where(eq(users.id, id));
  forgetAccount(id);
  log.info('account deleted by admin', { by: admin.session.user.id, id });
  return ok({ id });
});
