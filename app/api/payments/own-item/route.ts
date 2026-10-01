import { handle, ok, requireSession } from '@/lib/api/route';
import { withBankFee } from '@/lib/finance/money';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { ownItemCredit } from '@/lib/payments/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What adding an own item costs this person now: the price, the bank's commission on top, and
 * whether they have one paid for already (a payment whose upload did not go through).
 */
export const GET = handle('GET /api/payments/own-item', 'Failed to load the price', async () => {
  const { session, response } = await requireSession();
  if (response) return response;
  const settings = await loadPlatformSettings();
  const charge = withBankFee(settings.ownItemPrice, settings.bankFeePct);
  const credit = charge.amount > 0 ? Boolean(await ownItemCredit(Number(session.user.id))) : false;
  return ok({ charge, free: charge.amount <= 0, credit });
});
