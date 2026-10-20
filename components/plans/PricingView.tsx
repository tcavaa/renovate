'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Box, Camera, Info } from 'lucide-react';
import { PeriodSwitch, PlanCards, type PlanCardsPrices } from '@/components/plans/PlanCards';
import { SubscribeDialog } from '@/components/plans/SubscribeDialog';
import { usePlan } from '@/hooks/usePlan';
import { fill } from '@/lib/admin/list';
import { useT } from '@/lib/i18n/client';
import { freeRendersOf, plansWith, type BillingPeriod, type PaidPlanId } from '@/lib/plans/plans';
import { formatGEL, formatNumber } from '@/lib/utils';

/** The pricing page's body: the period, the three plans, what is paid apart, and how billing works. */
export function PricingView({ prices: serverPrices, bankFeePct }: { prices: PlanCardsPrices; bankFeePct: number }) {
  const t = useT();
  const p = t.plans;
  const { status } = useSession();
  const { state } = usePlan();
  const [period, setPeriod] = useState<BillingPeriod>('month');
  const [buying, setBuying] = useState<PaidPlanId | null>(null);
  // The signed-in person's state carries the same prices; the server's are there for a visitor.
  const prices = state ? { prices: state.prices, ownItemPrice: state.ownItemPrice, renderPrice: state.renderPrice, config: state.config } : serverPrices;
  const planName = (plan: PaidPlanId) => (plan === 'premium' ? p.premium : p.professional);
  const ownPlans = plansWith('ownItems', prices.config);
  const renderPlans = plansWith('renders', prices.config);
  const saving = Math.round((1 - prices.prices.premium.year / (prices.prices.premium.month * 12)) * 100);

  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-serif text-4xl font-semibold tracking-tight md:text-5xl">{p.pageTitle}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">{p.pageSubtitle}</p>
        <div className="mt-8 flex justify-center">
          <PeriodSwitch period={period} onPeriod={setPeriod} saving={saving} />
        </div>
      </div>

      <div className="mt-10">
        <PlanCards period={period} prices={prices} state={state} signedIn={status === 'authenticated'} onChoose={setBuying} />
      </div>

      <section className="mt-14 grid gap-4 md:grid-cols-2">
        <div className="flex gap-4 rounded-[20px] border border-line bg-bg-surface p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-sand-light text-ink">
            <Box className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-serif text-lg font-semibold">{p.extraOwnTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{fill(p.extraOwnDesc, { plans: ownPlans.map(planName).join(', ') || '—', price: formatGEL(prices.ownItemPrice) })}</p>
          </div>
        </div>
        <div className="flex gap-4 rounded-[20px] border border-line bg-bg-surface p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-sand-light text-ink">
            <Camera className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-serif text-lg font-semibold">{p.extraRenderTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{fill(p.extraRenderDesc, { plans: renderPlans.map(planName).join(', ') || '—', n: renderPlans[0] ? freeRendersOf(renderPlans[0], prices.config) : 0, price: formatGEL(prices.renderPrice) })}</p>
          </div>
        </div>
      </section>

      <ul className="mx-auto mt-10 max-w-3xl space-y-2 text-sm leading-relaxed text-ink-muted">
        {[p.prepaidNote, p.upgradeNote, fill(p.bankNote, { pct: `${formatNumber(bankFeePct)}%` })].map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {line}
          </li>
        ))}
      </ul>

      {buying && (
        <SubscribeDialog
          plan={buying}
          period={period}
          offer={state?.offers[buying][period] ?? null}
          open
          onOpenChange={(next) => {
            if (!next) setBuying(null);
          }}
        />
      )}
    </div>
  );
}
