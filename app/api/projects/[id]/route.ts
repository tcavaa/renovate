import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projectRenders, projects } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, parseId, requireSession } from '@/lib/api/route';
import { storage } from '@/lib/storage';
import { renameProjectSchema } from '@/lib/validations/project.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/projects/[id]', 'Failed to load project', async (_req, { params }) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id, response: bad } = parseId(params.id);
  if (bad) return bad;
  const rows = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, Number(session.user.id)))).limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(rows[0]);
});

/** Renames one of the caller's projects. */
export const PATCH = handle('PATCH /api/projects/[id]', 'Failed to rename project', async (req, { params }) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id, response: bad } = parseId(params.id);
  if (bad) return bad;
  const parsed = renameProjectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);
  const own = and(eq(projects.id, id), eq(projects.userId, Number(session.user.id)));
  const rows = await db.select({ id: projects.id }).from(projects).where(own).limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  await db.update(projects).set({ nameKa: parsed.data.name }).where(own);
  return ok({ id, name: parsed.data.name });
});

/**
 * Deletes one of the caller's projects — one they no longer want. An ordered project is history that partners are working from and
 * stays. Admin may delete anyone's. The photos' files go with the row (the rows cascade).
 */
export const DELETE = handle('DELETE /api/projects/[id]', 'Failed to delete project', async (_req, { params }) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id, response: bad } = parseId(params.id);
  if (bad) return bad;

  const isAdmin = session.user.role === 'admin';
  const rows = await db
    .select({ id: projects.id, userId: projects.userId, status: projects.status })
    .from(projects)
    .where(isAdmin ? eq(projects.id, id) : and(eq(projects.id, id), eq(projects.userId, Number(session.user.id))))
    .limit(1);
  const project = rows[0];
  if (!project) return fail(API_ERRORS.NOT_FOUND, 404);
  if (project.status === 'submitted' && !isAdmin) return fail(API_ERRORS.PROJECT_HAS_ORDERS, 409);

  const renders = await db.select({ sourceUrl: projectRenders.sourceUrl, renderUrl: projectRenders.renderUrl }).from(projectRenders).where(eq(projectRenders.projectId, id));
  for (const render of renders) {
    for (const url of [render.sourceUrl, render.renderUrl]) {
      const key = url ? storage.keyFor(url) : null;
      if (key) await storage.delete(key);
    }
  }
  await db.delete(projects).where(eq(projects.id, id));
  return ok({ id });
});
