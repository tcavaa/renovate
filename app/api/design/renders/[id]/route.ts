import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projectRenders, projects } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, parseId, requireSession } from '@/lib/api/route';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Removes one of the caller's photos, files included. Admin may remove any. */
export const DELETE = handle('DELETE /api/design/renders/[id]', 'Failed to delete the photo', async (_req, { params }) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id, response: bad } = parseId(params.id);
  if (bad) return bad;

  const rows = await db
    .select({ id: projectRenders.id, sourceUrl: projectRenders.sourceUrl, renderUrl: projectRenders.renderUrl, ownerId: projects.userId })
    .from(projectRenders)
    .innerJoin(projects, eq(projectRenders.projectId, projects.id))
    .where(and(eq(projectRenders.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) return fail(API_ERRORS.NOT_FOUND, 404);
  if (session.user.role !== 'admin' && row.ownerId !== Number(session.user.id)) return fail(API_ERRORS.FORBIDDEN, 403);

  for (const url of [row.sourceUrl, row.renderUrl]) {
    const key = url ? storage.keyFor(url) : null;
    if (key) await storage.delete(key);
  }
  await db.delete(projectRenders).where(eq(projectRenders.id, id));
  return ok({ id });
});
