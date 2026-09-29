import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { payProjectHalf, paymentQuote, paymentsOf } from '@/lib/finance/payments';
import { paymentSchema } from '@/lib/validations/profile.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `?projectId=`: what each half of the project has paid, and what each would cost now — the
 * payment dialogue before the hinge, the summaries' fee line. The owner (or admin) only.
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

/**
 * Pays a half's fee — before "start the calculation" or the generation. The dialogue has saved
 * the half first, so the fee is the saved row's area at today's rate. There is no payment
 * provider yet: the card is a test card and nothing is charged; the row is the record.
 */
export const POST = handle('POST /api/payments', 'Failed to pay', async (req) => {
  const limited = rateLimited(req, RATE_RULES.checkout);
  if (limited) return limited;
  const parsed = paymentSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!userId) return fail(API_ERRORS.UNAUTHORIZED, 401);
  const [project] = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1);
  if (!project) return fail(API_ERRORS.NOT_FOUND, 404);
  if (project.userId !== userId) return fail(API_ERRORS.FORBIDDEN, 403);
  const result = await payProjectHalf(project, parsed.data.kind, userId, parsed.data.cardLast4 ?? null);
  if (!result.ok) return fail(API_ERRORS.NOTHING_TO_PAY, 400);
  return ok({ payment: result.payment, alreadyPaid: result.alreadyPaid });
});
