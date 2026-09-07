import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { createCheckoutForProject } from '@/lib/finance/orders';
import { checkoutSchema, normaliseCustomer } from '@/lib/validations/checkout.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Places the order for a saved project: the platform fee is recorded and every store whose
 * products are in it gets an order. Guests may order a guest project; a project that
 * belongs to an account can only be ordered by that account. A project is ordered once.
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
  if (project.status === 'submitted') return fail(API_ERRORS.PROJECT_ALREADY_ORDERED, 409);

  const result = await createCheckoutForProject(project, normaliseCustomer(parsed.data.customer), userId ?? project.userId);
  return ok(result);
});
