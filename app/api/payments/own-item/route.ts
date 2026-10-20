import { handle, ok, requireSession } from '@/lib/api/route';
import { withBankFee } from '@/lib/finance/money';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { paidCredit } from '@/lib/payments/service';
import { hasFeature } from '@/lib/plans/plans';
import { planOf } from '@/lib/plans/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What adding an own item costs this person now: the price, the bank's commission on top,
 * whether they have one paid for already (a payment whose upload did not go through), and
 * whether their plan has own items at all (Professional's).
 */
export const GET = handle('GET /api/payments/own-item', 'Failed to load the price', async () => {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = Number(session.user.id);
  const [settings, plan] = await Promise.all([loadPlatformSettings(), planOf({ id: userId, role: session.user.role })]);
  const charge = withBankFee(settings.ownItemPrice, settings.bankFeePct);
  const credit = charge.amount > 0 ? Boolean(await paidCredit(userId, 'own_item')) : false;
  return ok({ charge, free: charge.amount <= 0, credit, allowed: hasFeature(plan, 'ownItems') });
});
