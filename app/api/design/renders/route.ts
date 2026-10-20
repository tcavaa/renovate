import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { desc } from '@/lib/db/order';
import { db } from '@/lib/db';
import { projectRenders, projects } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, requireSession } from '@/lib/api/route';
import { safeKey, storage } from '@/lib/storage';
import { claimUpload } from '@/lib/uploads/claim';
import { IMAGE_EXTENSION, sniffImage } from '@/lib/uploads/sniff';
import { log } from '@/lib/log';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { claimPaidCredit, releasePaidCredit } from '@/lib/payments/service';
import { recordPaidRender, releaseUsage, requirePlanFeature, takeFreeRender } from '@/lib/plans/server';

const point = z.array(z.number().finite().min(-1000).max(1000)).length(3);
const cameraSchema = z.object({ position: point, target: point });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const postSchema = z.object({
  /** The direct upload (`POST /api/uploads`, kind `render`) holding the studio's screenshot. */
  upload: z.string().uuid(),
  projectId: z.number().int().positive(),
  roomName: z.string().max(255).nullish(),
  // Where the photo was taken from — kept to redo the render from the same spot. Only that:
  // two points of three finite numbers each.
  camera: cameraSchema.nullish(),
});

/**
 * A photo taken in the studio, and the realistic render asked for from it.
 *
 * The browser sends the studio's own screenshot straight to storage (docs/uploads.md — kind
 * `render`, 8 MB, granted under the photo's rate limit); here it is claimed, identified by its
 * bytes and published at once (so the view can be downloaded straight away), and a
 * `project_renders` row is queued. Nothing produces the render yet — an image model will be
 * wired to the queue later — so rows wait in `queued` and the profile says so. Signed-in owners
 * only: renders live with the project.
 *
 * Renders are Professional's (docs/subscriptions.md — `PLAN_REQUIRED` otherwise): each takes one
 * of the month's free renders (`plan_usage`), and past them spends a paid `render` credit (402
 * `PAYMENT_REQUIRED` without one) — counted before the photo is stored and given back if it is
 * not queued after all.
 */
export const POST = handle('POST /api/design/renders', 'Failed to save the photo', async (req) => {
  const { session, response } = await requirePlanFeature('renders');
  if (response) return response;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { projectId } = parsed.data;

  const userId = Number(session.user.id);
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  if (!project) return fail(API_ERRORS.NOT_FOUND, 404);

  const { bytes } = await claimUpload(parsed.data.upload, ['render'], userId);
  const mime = sniffImage(bytes);
  if (!mime || mime === 'image/gif') return fail(API_ERRORS.IMAGE_INVALID, 400);

  // One of the month's free renders, else a paid credit (none to pay when admin made them free).
  const account = { id: userId, role: session.user.role };
  const free = await takeFreeRender(account, projectId);
  let credit: number | null = null;
  if (!free && (await loadPlatformSettings()).renderPrice > 0) {
    credit = await claimPaidCredit(userId, 'render');
    if (credit === null) return fail(API_ERRORS.PAYMENT_REQUIRED, 402);
  }
  let queued = false;
  try {
    const roomName = parsed.data.roomName?.slice(0, 255) || null;
    const camera = parsed.data.camera ?? null;
    const key = safeKey('renders', `u${userId}-p${projectId}-${Date.now()}-${randomBytes(6).toString('hex')}.${IMAGE_EXTENSION[mime]}`);
    const stored = await storage.put(key, bytes, mime);
    const [{ id }] = await db.insert(projectRenders).values({ projectId, userId, sourceUrl: stored.url, status: 'queued', roomName, camera }).returning({ id: projectRenders.id });
    if (credit !== null) await recordPaidRender(userId, projectId, credit);
    queued = true;
    log.info('render requested', { id, projectId, userId, bytes: stored.size, free: !!free, paymentId: credit });
    return ok({ id, projectId, sourceUrl: stored.url, status: 'queued' as const });
  } finally {
    if (!queued) {
      if (free) await releaseUsage(free.usageId);
      if (credit !== null) await releasePaidCredit(credit);
    }
  }
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
