import { PricingView } from '@/components/plans/PricingView';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { getT } from '@/lib/i18n/server';
import { planPricesOf } from '@/lib/plans/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getT();
  return { title: t.plans.pageTitle };
}

/**
 * The plans and their prices (docs/subscriptions.md): Free, Premium and Professional, a month or
 * a year, with what each adds and what is paid apart (an own item, a render past the free ones).
 * Public — a visitor sees the prices admin set and signs up to buy; a signed-in person sees their
 * own plan marked and buys, renews or upgrades from here.
 */
export default async function PricingPage() {
  const settings = await loadPlatformSettings();
  return <PricingView prices={{ prices: planPricesOf(settings), ownItemPrice: settings.ownItemPrice, renderPrice: settings.renderPrice }} bankFeePct={settings.bankFeePct} />;
}
