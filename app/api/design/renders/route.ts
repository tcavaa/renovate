import { randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projectRenders, projects } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok, requireSession } from '@/lib/api/route';
import { safeKey, storage } from '@/lib/storage';
import { IMAGE_EXTENSION, sniffImage } from '@/lib/uploads/sniff';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * A photo taken in the studio, and the realistic render asked for from it.
 *
 * The browser sends the studio's own screenshot; it is stored at once (so the view can be
 * downloaded straight away) and a `project_renders` row is queued. Nothing produces the
 * render yet — an image model will be wired to the queue later — so rows wait in `queued`
 * and the profile says so. Signed-in owners only: renders live with the project.
 */
export const POST = handle('POST /api/design/renders', 'Failed to save the photo', async (req) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const limited = rateLimited(req, RATE_RULES.render);
  if (limited) return limited;

  const form = await req.formData();
  const file = form.get('file');
  const projectId = Number(form.get('projectId'));
  if (!(file instanceof File)) return fail('No file provided', 400);
  if (file.size > MAX_BYTES) return fail('File too large (max 8MB)', 400);
  if (!Number.isInteger(projectId) || projectId <= 0) return fail(API_ERRORS.INVALID_ID, 400);

  const userId = Number(session.user.id);
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  if (!project) return fail(API_ERRORS.NOT_FOUND, 404);

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime || mime === 'image/gif') return fail('Unsupported file type', 400);

  const roomName = String(form.get('roomName') ?? '').slice(0, 255) || null;
  let camera: unknown = null;
  const rawCamera = form.get('camera');
  if (typeof rawCamera === 'string' && rawCamera) {
    try {
      camera = JSON.parse(rawCamera);
    } catch {
      camera = null;
    }
  }

  const key = safeKey('renders', `u${userId}-p${projectId}-${Date.now()}-${randomBytes(6).toString('hex')}.${IMAGE_EXTENSION[mime]}`);
  const stored = await storage.put(key, bytes, mime);
  const inserted = await db.insert(projectRenders).values({ projectId, userId, sourceUrl: stored.url, status: 'queued', roomName, camera });
  const id = Number(inserted[0].insertId);
  log.info('render requested', { id, projectId, userId, bytes: stored.size });
  return ok({ id, projectId, sourceUrl: stored.url, status: 'queued' as const });
});

/** The photos and renders of one of the caller's projects, newest first. */
export const GET = handle('GET /api/design/renders', 'Failed to load renders', async (req) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const projectId = Number(new URL(req.url).searchParams.get('projectId'));
  if (!Number.isInteger(projectId) || projectId <= 0) return fail(API_ERRORS.INVALID_ID, 400);
  const userId = Number(session.user.id);
  const rows = await db
    .select({ id: projectRenders.id, projectId: projectRenders.projectId, sourceUrl: projectRenders.sourceUrl, renderUrl: projectRenders.renderUrl, status: projectRenders.status, roomName: projectRenders.roomName, createdAt: projectRenders.createdAt })
    .from(projectRenders)
    .innerJoin(projects, eq(projectRenders.projectId, projects.id))
    .where(and(eq(projectRenders.projectId, projectId), eq(projects.userId, userId)))
    .orderBy(desc(projectRenders.createdAt));
  return ok(rows);
});
