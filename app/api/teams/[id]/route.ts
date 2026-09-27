import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { teamMembers, teams } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, parseId, requireStaff } from '@/lib/api/route';
import { teamRow, teamSchema, teamSelfSchema } from '@/lib/validations/team.schema';
import { droppedUrls, removeUnusedUploads } from '@/lib/storage/cleanup';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A brigade's details and its members — admin's whole form. The brigade's own account may
 * change its company details from the portal (`teamSelfSchema`): name, words, contact, logo,
 * capacity; never its crew, markup, commission or standing.
 */
export const PUT = handle('PUT /api/teams/[id]', 'Failed to update team', async (req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;
  const session = await auth();
  const self = session?.user?.role === 'team' && session.user.teamId === id;
  const [existing] = await db.select({ id: teams.id, logoUrl: teams.logoUrl }).from(teams).where(eq(teams.id, id)).limit(1);

  if (self) {
    if (!existing) return fail(API_ERRORS.NOT_FOUND, 404);
    const own = teamSelfSchema.safeParse(await req.json());
    if (!own.success) return fail(own.error.message, 400);
    await db.update(teams).set({ ...own.data, logoUrl: own.data.logoUrl || null }).where(eq(teams.id, id));
    await removeUnusedUploads(droppedUrls({ logoUrl: existing.logoUrl }, { logoUrl: own.data.logoUrl }));
    return ok({ id });
  }

  const staff = await requireStaff('teams');
  if (staff.response) return staff.response;
  const parsed = teamSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { memberIds, leadWorkerId, ...fields } = parsed.data;
  if (!existing) return fail(API_ERRORS.NOT_FOUND, 404);

  await db.transaction(async (tx) => {
    await tx.update(teams).set(teamRow(fields, fields.slug || slugify(fields.nameKa))).where(eq(teams.id, id));
    await tx.delete(teamMembers).where(eq(teamMembers.teamId, id));
    if (memberIds.length > 0) {
      await tx.insert(teamMembers).values(memberIds.map((workerId, i) => ({ teamId: id, workerId, isLead: workerId === leadWorkerId, sortOrder: i })));
    }
  });
  await removeUnusedUploads(droppedUrls({ logoUrl: existing.logoUrl }, { logoUrl: fields.logoUrl }));
  return ok({ id });
});

export const DELETE = handle('DELETE /api/teams/[id]', 'Failed to delete team', async (_req, { params }) => {
  const staff = await requireStaff('teams');
  if (staff.response) return staff.response;
  const { id, response } = parseId(params.id);
  if (response) return response;
  const [team] = await db.select({ logoUrl: teams.logoUrl }).from(teams).where(eq(teams.id, id)).limit(1);
  await db.delete(teamMembers).where(eq(teamMembers.teamId, id));
  await db.delete(teams).where(eq(teams.id, id));
  await removeUnusedUploads([team?.logoUrl]);
  return ok({ id });
});

/** Used by the form to check which workers are already in another brigade. */
export const GET = handle('GET /api/teams/[id]', 'Failed to load team', async (_req, { params }) => {
  const staff = await requireStaff('teams');
  if (staff.response) return staff.response;
  const { id, response } = parseId(params.id);
  if (response) return response;
  const rows = await db.select().from(teamMembers).where(eq(teamMembers.teamId, id));
  return ok(rows);
});
