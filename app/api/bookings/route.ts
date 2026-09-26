import { and, desc, eq, inArray } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { orders, projects, teams, workers } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { createTeamBooking, createWorkerBooking } from '@/lib/finance/orders';
import { bookingSchema, normaliseCustomer } from '@/lib/validations/checkout.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `?projectId=`: who this project's work has been sent to, and what each of them answered —
 * the brigade step shows it on the brigade's card, so a customer who comes back sees
 * "accepted" rather than a button that would send the same job twice. The caller's own
 * projects only; a guest's bookings are not listed to anybody.
 */
export const GET = handle('GET /api/bookings', 'Failed to load bookings', async (req) => {
  const projectId = Number(new URL(req.url).searchParams.get('projectId'));
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!userId || !Number.isInteger(projectId) || projectId <= 0) return ok([]);
  const [project] = await db.select({ userId: projects.userId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || project.userId !== userId) return ok([]);
  const rows = await db
    .select({ id: orders.id, partnerType: orders.partnerType, teamId: orders.teamId, workerId: orders.workerId, status: orders.status, subtotal: orders.subtotal, partnerMessage: orders.partnerMessage, createdAt: orders.createdAt })
    .from(orders)
    .where(and(eq(orders.projectId, projectId), inArray(orders.partnerType, ['team', 'worker'])))
    .orderBy(desc(orders.id));
  return ok(rows.map((r) => ({ ...r, subtotal: Number(r.subtotal) })));
});

/**
 * Books a worker for one trade, or a brigade for the whole job. With a `projectId` the
 * booking carries that project's labour estimate as its lines (the project must be the
 * caller's own); without one it is a request the partner prices.
 */
export const POST = handle('POST /api/bookings', 'Failed to book', async (req) => {
  const limited = rateLimited(req, RATE_RULES.checkout);
  if (limited) return limited;

  const parsed = bookingSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const worker = parsed.data.workerId
    ? (await db.select().from(workers).where(and(eq(workers.id, parsed.data.workerId), eq(workers.isActive, true))).limit(1))[0]
    : null;
  const team = parsed.data.teamId
    ? (await db.select().from(teams).where(and(eq(teams.id, parsed.data.teamId), eq(teams.isActive, true))).limit(1))[0]
    : null;
  if (!worker && !team) return fail(API_ERRORS.NOT_FOUND, 404);

  let project = null;
  if (parsed.data.projectId) {
    const rows = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1);
    project = rows[0] ?? null;
    if (!project) return fail(API_ERRORS.NOT_FOUND, 404);
    if (!userId || project.userId !== userId) return fail(API_ERRORS.FORBIDDEN, 403);
  }

  const customer = normaliseCustomer(parsed.data.customer);
  const owner = userId ?? project?.userId ?? null;
  const result = team
    ? await createTeamBooking({ team, project, customer, userId: owner })
    : await createWorkerBooking({ worker: worker!, project, customer, userId: owner });
  return ok(result);
});
