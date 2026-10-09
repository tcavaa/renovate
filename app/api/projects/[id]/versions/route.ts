import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, parseId, requireSession } from '@/lib/api/route';
import type { DesignVersion } from '@/lib/design/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A design's kept versions, alone (docs/project-flow.md#the-kept-versions). They run to megabytes,
 * so the step page's payload and the browser's copy leave them out and the studio asks for them
 * here when it opens. The caller's own project only.
 */
export const GET = handle('GET /api/projects/[id]/versions', 'Failed to load the versions', async (_req, { params }) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id, response: bad } = parseId(params.id);
  if (bad) return bad;
  const [row] = await db
    .select({ versions: projects.versions })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, Number(session.user.id))))
    .limit(1);
  if (!row) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok({ versions: Array.isArray(row.versions) ? (row.versions as DesignVersion[]) : [] });
});
