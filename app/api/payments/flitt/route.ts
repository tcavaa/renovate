import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok, requireSession } from '@/lib/api/route';
import { fill } from '@/lib/admin/list';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { getLocale, getT } from '@/lib/i18n/server';
import { log } from '@/lib/log';
import { FlittError } from '@/lib/payments/flittApi';
import { paidCredit, settleRecentPayments, startCardPayment } from '@/lib/payments/service';
import { planPurchase } from '@/lib/plans/plans';
import { activateFreeUpgrade, featureAccess, liveSubscriptions, planPricesOf } from '@/lib/plans/server';
import { startPaymentSchema } from '@/lib/validations/payment.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Starts a card payment through Flitt and hands the payment dialogue the token its embedded
 * form opens with (docs/payments.md). What is charged is the server's: a plan's price for the
 * period (less the unused part of a lower plan an upgrade replaces — `planPurchase`), the own
 * item's or the render's price — and the bank's commission on top. Nothing to pay answers so
 * instead of a token: free (admin's price is 0, or an upgrade the lower plan's credit covers —
 * bought there and then), or a credit already paid for (`credit`).
 *
 * An own item and a render are Professional's (`PLAN_REQUIRED`); a lower plan than the one in
 * force is refused (`PLAN_LOWER`).
 */
export const POST = handle('POST /api/payments/flitt', 'Failed to start the payment', async (req) => {
  const limited = await rateLimited(req, RATE_RULES.payment);
  if (limited) return limited;
  const { session, response } = await requireSession();
  if (response) return response;
  const parsed = startPaymentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);
  const userId = Number(session.user.id);
  const account = { id: userId, role: session.user.role };
  const [settings, t, locale] = await Promise.all([loadPlatformSettings(), getT(), getLocale()]);
  const body = parsed.data;

  try {
    if (body.purpose === 'subscription') {
      await settleRecentPayments({ userId, purpose: 'subscription' });
      const quote = planPurchase(
        (await liveSubscriptions(userId)).map((r) => ({ id: r.id, plan: r.plan, period: r.period, startsAt: r.startsAt, endsAt: r.endsAt, amount: Number(r.amount) })),
        body.plan,
        body.period,
        planPricesOf(settings),
        new Date()
      );
      if (!quote.ok) return fail(API_ERRORS.PLAN_LOWER, 409);
      if (quote.amount <= 0) {
        await activateFreeUpgrade(userId, body.plan, body.period);
        return ok({ free: true });
      }
      const planName = body.plan === 'premium' ? t.plans.premium : t.plans.professional;
      const started = await startCardPayment({
        userId,
        email: session.user.email,
        purpose: 'subscription',
        plan: body.plan,
        billingPeriod: body.period,
        amount: quote.amount,
        bankFeePct: settings.bankFeePct,
        description: fill(body.period === 'year' ? t.plans.flittDescYear : t.plans.flittDescMonth, { plan: planName }),
        lang: locale,
      });
      return ok({ ...started, offer: { kind: quote.kind, price: quote.price, credit: quote.credit, startsAt: quote.startsAt.toISOString(), endsAt: quote.endsAt.toISOString() } });
    }

    // An own item and a render: Professional's, a price each, a credit the upload spends.
    const feature = body.purpose === 'own_item' ? 'ownItems' : 'renders';
    const access = await featureAccess(account);
    if (!access.has(feature)) return fail(API_ERRORS.PLAN_REQUIRED, 402, { headers: { 'X-Plan-Required': access.needs(feature) ?? 'none' } });
    const price = body.purpose === 'own_item' ? settings.ownItemPrice : settings.renderPrice;
    if (price <= 0) return ok({ free: true });
    await settleRecentPayments({ userId, purpose: body.purpose });
    if (await paidCredit(userId, body.purpose)) return ok({ credit: true });
    const started = await startCardPayment({
      userId,
      email: session.user.email,
      purpose: body.purpose,
      amount: price,
      bankFeePct: settings.bankFeePct,
      description: body.purpose === 'own_item' ? t.payment.flittDescOwnItem : t.plans.flittDescRender,
      lang: locale,
    });
    return ok(started);
  } catch (e) {
    if (e instanceof FlittError || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'TypeError'))) {
      log.warn('card payment could not start', { purpose: body.purpose, err: e });
      return fail(API_ERRORS.PAYMENT_UNAVAILABLE, 502);
    }
    throw e;
  }
});
