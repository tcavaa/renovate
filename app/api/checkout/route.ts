import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { NothingToOrder, createCheckoutForProject, projectOrderState } from '@/lib/finance/orders';
import { checkoutSchema, normaliseCustomer } from '@/lib/validations/checkout.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Places the order for a saved project: the platform fee is recorded and every store whose
 * products are in it gets an order. Guests may order a guest project; a project that
 * belongs to an account can only be ordered by that account. A project can be ordered in
 * two sittings (the calculation, then the design); each half is charged once and nothing is
 * sent to a store twice.
 */
export const POST = handle('POST /api/checkout', 'Failed to place order', async (req) => {
  const limited = rateLimited(req, RATE_RULES.checkout);
  if (limited) return limited;

  const parsed = checkoutSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const rows = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1);
  const project = rows[0];
  if (!project) return fail(API_ERRORS.NOT_FOUND, 404);
  if (project.userId != null && project.userId !== userId) return fail(API_ERRORS.FORBIDDEN, 403);

  try {
    const result = await createCheckoutForProject(project, normaliseCustomer(parsed.data.customer), userId ?? project.userId);
    return ok(result);
  } catch (e) {
    if (e instanceof NothingToOrder) return fail(API_ERRORS.PROJECT_ALREADY_ORDERED, 409);
    throw e;
  }
});

/**
 * What earlier checkouts of a project already charged and sent — so the checkout dialog can
 * show which half is still to be paid and which products will not be ordered again.
 */
export const GET = handle('GET /api/checkout', 'Failed to load order state', async (req) => {
  const projectId = Number(new URL(req.url).searchParams.get('projectId'));
  if (!Number.isInteger(projectId) || projectId <= 0) return fail(API_ERRORS.INVALID_ID, 400);
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  const rows = await db.select({ userId: projects.userId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = rows[0];
  if (!project) return fail(API_ERRORS.NOT_FOUND, 404);
  if (project.userId != null && project.userId !== userId && session?.user?.role !== 'admin') return fail(API_ERRORS.FORBIDDEN, 403);
  return ok(await projectOrderState(projectId));
});
