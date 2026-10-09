import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok, requireSession } from '@/lib/api/route';
import { fill } from '@/lib/admin/list';
import { halfPayment, paymentQuote } from '@/lib/finance/payments';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { formatM2 } from '@/lib/utils';
import { getLocale, getT } from '@/lib/i18n/server';
import { log } from '@/lib/log';
import { FlittError } from '@/lib/payments/flittApi';
import { ownItemCredit, settleRecentPayments, startCardPayment } from '@/lib/payments/service';
import { startPaymentSchema } from '@/lib/validations/payment.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Starts a card payment through Flitt and hands the payment dialogue the token its embedded
 * form opens with (docs/payments.md). What is charged is the server's: a half's fee off the
 * saved row (the dialogue saved it first) at today's rate, or the own item's price — and the
 * bank's commission on top. Nothing to pay answers so instead of a token: a half already paid
 * (`paid`), a half or an own item that is free (`free` — admin's rate or price is 0), an own
 * item already paid for (`credit`).
 */
export const POST = handle('POST /api/payments/flitt', 'Failed to start the payment', async (req) => {
  const limited = rateLimited(req, RATE_RULES.payment);
  if (limited) return limited;
  const { session, response } = await requireSession();
  if (response) return response;
  const parsed = startPaymentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);
  const userId = Number(session.user.id);
  const [settings, t, locale] = await Promise.all([loadPlatformSettings(), getT(), getLocale()]);
  const body = parsed.data;

  try {
    if (body.purpose === 'own_item') {
      if (settings.ownItemPrice <= 0) return ok({ free: true });
      await settleRecentPayments({ userId, purpose: 'own_item' });
      if (await ownItemCredit(userId)) return ok({ credit: true });
      const started = await startCardPayment({
        userId,
        email: session.user.email,
        purpose: 'own_item',
        amount: settings.ownItemPrice,
        bankFeePct: settings.bankFeePct,
        description: t.payment.flittDescOwnItem,
        lang: locale,
      });
      return ok(started);
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, body.projectId)).limit(1);
    if (!project) return fail(API_ERRORS.NOT_FOUND, 404);
    if (project.userId !== userId) return fail(API_ERRORS.FORBIDDEN, 403);
    await settleRecentPayments({ userId, purpose: body.purpose, projectId: project.id });
    const paid = await halfPayment(project.id, body.purpose);
    if (paid) return ok({ paid });
    const quote = await paymentQuote(project, body.purpose);
    // No rooms yet: nothing to charge for, and the half has nothing to start on.
    if (quote.totalM2 <= 0) return fail(API_ERRORS.NOTHING_TO_PAY, 400);
    // Admin set the half's rate to 0: it is free, and the dialogue goes on without a form.
    if (quote.amount <= 0) return ok({ free: true });
    const started = await startCardPayment({
      userId,
      email: session.user.email,
      purpose: body.purpose,
      projectId: project.id,
      amount: quote.amount,
      bankFeePct: settings.bankFeePct,
      totalM2: quote.totalM2,
      feePerM2: quote.feePerM2,
      description: fill(body.purpose === 'design' ? t.payment.flittDescDesign : t.payment.flittDescCalculator, { project: project.nameKa ?? `#${project.id}`, m2: formatM2(quote.totalM2) }),
      lang: locale,
    });
    return ok({ ...started, quote });
  } catch (e) {
    if (e instanceof FlittError || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'TypeError'))) {
      log.warn('card payment could not start', { purpose: body.purpose, err: e });
      return fail(API_ERRORS.PAYMENT_UNAVAILABLE, 502);
    }
    throw e;
  }
});
