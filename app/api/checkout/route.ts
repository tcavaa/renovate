import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { NothingToOrder, checkoutPreview, createCheckoutForProject, projectOrderState } from '@/lib/finance/orders';
import { resolveContact } from '@/lib/account/contact';
import { loadAccountContact, updateAccountContact } from '@/lib/account/server';
import { log } from '@/lib/log';
import { checkoutSchema } from '@/lib/validations/checkout.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Places the order for a saved project: every store whose products are in it gets an order,
 * the construction materials go to their supplier, all delivered to the customer's address.
 * A project belongs to an account (it is made, named, before its first step) and only that
 * account orders it; the name and e-mail are the account's, the phone and the address the
 * profile's unless the dialogue asked for them (`resolveContact`), and those are kept on the
 * account when the person said so. A project can be ordered in two sittings (the calculation,
 * then the design); nothing is sent to a store twice. No fee is charged here — each half's
 * was paid before its hinge (`/api/payments`).
 */
export const POST = handle('POST /api/checkout', 'Failed to place order', async (req) => {
  const limited = rateLimited(req, RATE_RULES.checkout);
  if (limited) return limited;

  const parsed = checkoutSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!userId) return fail(API_ERRORS.UNAUTHORIZED, 401);

  const rows = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1);
  const project = rows[0];
  if (!project) return fail(API_ERRORS.NOT_FOUND, 404);
  if (project.userId !== userId) return fail(API_ERRORS.FORBIDDEN, 403);

  const account = await loadAccountContact(userId);
  if (!account) return fail(API_ERRORS.UNAUTHORIZED, 401);
  const contact = resolveContact(parsed.data.customer, account, { needAddress: true });
  if (!contact.ok) return fail(API_ERRORS[contact.error], 400);

  try {
    const result = await createCheckoutForProject(project, contact.customer, userId);
    // Kept once the order went through: an order refused is no reason to change the profile.
    if (contact.keep) {
      await updateAccountContact(userId, contact.keep).catch((e: unknown) => log.warn('keeping the checkout contact failed', { userId, err: e }));
    }
    return ok(result);
  } catch (e) {
    if (e instanceof NothingToOrder) return fail(API_ERRORS.PROJECT_ALREADY_ORDERED, 409);
    throw e;
  }
});

/**
 * What earlier checkouts of a project already sent — so the checkout dialog can show which
 * products will not be ordered again — the construction materials this checkout would send
 * their supplier and the summary's reserve, read off the saved project as the checkout will
 * read it.
 */
export const GET = handle('GET /api/checkout', 'Failed to load order state', async (req) => {
  const projectId = Number(new URL(req.url).searchParams.get('projectId'));
  if (!Number.isInteger(projectId) || projectId <= 0) return fail(API_ERRORS.INVALID_ID, 400);
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  // Signed in first: without it `project.userId !== userId` was `null !== null` for a project
  // with no owner, and anyone read its order state.
  if (!userId) return fail(API_ERRORS.UNAUTHORIZED, 401);
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = rows[0];
  if (!project) return fail(API_ERRORS.NOT_FOUND, 404);
  if (project.userId !== userId && session?.user?.role !== 'admin') return fail(API_ERRORS.FORBIDDEN, 403);
  const state = await projectOrderState(projectId);
  // A preview that cannot be worked out is no reason to refuse the dialogue its state.
  const preview = await checkoutPreview(project, state).catch((e: unknown) => {
    log.warn('checkout preview failed', { projectId, err: e });
    return { materials: null, reserve: 0 };
  });
  return ok({ ...state, ...preview });
});
