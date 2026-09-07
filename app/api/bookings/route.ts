import { and, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects, workers } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { createWorkerBooking } from '@/lib/finance/orders';
import { bookingSchema, normaliseCustomer } from '@/lib/validations/checkout.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Books a worker. With a `projectId` the booking carries that project's labour estimate as
 * its lines (the project must be the caller's, or a guest project); without one it is a
 * request the worker prices.
 */
export const POST = handle('POST /api/bookings', 'Failed to book', async (req) => {
  const limited = rateLimited(req, RATE_RULES.checkout);
  if (limited) return limited;

  const parsed = bookingSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const workerRows = await db.select().from(workers).where(and(eq(workers.id, parsed.data.workerId), eq(workers.isActive, true))).limit(1);
  const worker = workerRows[0];
  if (!worker) return fail(API_ERRORS.NOT_FOUND, 404);

  let project = null;
  if (parsed.data.projectId) {
    const rows = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1);
    project = rows[0] ?? null;
    if (!project) return fail(API_ERRORS.NOT_FOUND, 404);
    if (project.userId != null && project.userId !== userId) return fail(API_ERRORS.FORBIDDEN, 403);
  }

  const result = await createWorkerBooking({ worker, project, customer: normaliseCustomer(parsed.data.customer), userId: userId ?? project?.userId ?? null });
  return ok(result);
});
