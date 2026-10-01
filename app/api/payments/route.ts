import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { paymentQuote, paymentsOf } from '@/lib/finance/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `?projectId=`: what each half of the project has paid, and what each would cost now — the
 * summaries' fee line and the project pages. The owner (or admin) only. Paying goes through
 * Flitt: `POST /api/payments/flitt`.
 */
export const GET = handle('GET /api/payments', 'Failed to load payments', async (req) => {
  const projectId = Number(new URL(req.url).searchParams.get('projectId'));
  if (!Number.isInteger(projectId) || projectId <= 0) return fail(API_ERRORS.INVALID_ID, 400);
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!userId) return fail(API_ERRORS.UNAUTHORIZED, 401);
  const [project] = await db.select({ id: projects.id, userId: projects.userId, rooms: projects.rooms, plan: projects.plan }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return fail(API_ERRORS.NOT_FOUND, 404);
  if (project.userId !== userId && session?.user?.role !== 'admin') return fail(API_ERRORS.FORBIDDEN, 403);
  const [paid, calculator, design] = await Promise.all([paymentsOf(projectId), paymentQuote(project, 'calculator'), paymentQuote(project, 'design')]);
  return ok({ paid, quote: { calculator, design } });
});
