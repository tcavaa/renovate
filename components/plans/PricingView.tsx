'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Box, Camera, Info } from 'lucide-react';
import { PeriodSwitch, PlanCards, type PlanCardsPrices } from '@/components/plans/PlanCards';
import { SubscribeDialog } from '@/components/plans/SubscribeDialog';
import { LogoMark } from '@/components/layout/Logo';
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
      <div className="relative mx-auto max-w-2xl text-center">
        <LogoMark tone="sand" className="mx-auto mb-7 h-12 w-12 shadow-card" />
        <h1 className="display text-[clamp(2.2rem,4.8vw,4rem)] text-ink">{p.pageTitle}</h1>
        <p className="mx-auto mt-5 max-w-xl font-serif text-xl leading-relaxed text-ink-soft md:text-2xl">{p.pageSubtitle}</p>
        {/* The brand board's six swatches, a short strip under the title. */}
        <div className="mx-auto mt-7 grid h-1.5 w-40 grid-cols-6 overflow-hidden rounded-full" aria-hidden>
          <span className="bg-sand" />
          <span className="bg-stone" />
          <span className="bg-wood" />
          <span className="bg-brand" />
          <span className="bg-olive-light" />
          <span className="bg-charcoal" />
        </div>
        <div className="mt-8 flex justify-center">
          <PeriodSwitch period={period} onPeriod={setPeriod} saving={saving} />
        </div>
      </div>

      <div className="mt-12">
        <PlanCards period={period} prices={prices} state={state} signedIn={status === 'authenticated'} onChoose={setBuying} />
      </div>

      <section className="mt-14 grid gap-4 md:grid-cols-2">
        <div className="flex gap-5 rounded-3xl border border-line bg-bg-surface p-6 shadow-card md:p-7">
          <span className="arch grid h-14 w-12 shrink-0 place-items-center bg-wood pt-1 text-white">
            <Box className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold">{p.extraOwnTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{fill(p.extraOwnDesc, { plans: ownPlans.map(planName).join(', ') || '—', price: formatGEL(prices.ownItemPrice) })}</p>
          </div>
        </div>
        <div className="flex gap-5 rounded-3xl border border-line bg-bg-surface p-6 shadow-card md:p-7">
          <span className="arch grid h-14 w-12 shrink-0 place-items-center bg-olive pt-1 text-sand-light">
            <Camera className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold">{p.extraRenderTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{fill(p.extraRenderDesc, { plans: renderPlans.map(planName).join(', ') || '—', n: renderPlans[0] ? freeRendersOf(renderPlans[0], prices.config) : 0, price: formatGEL(prices.renderPrice) })}</p>
          </div>
        </div>
      </section>

      <ul className="mx-auto mt-10 max-w-3xl space-y-2.5 rounded-2xl bg-sand/50 px-6 py-5 text-sm leading-relaxed text-ink-muted">
        {[p.prepaidNote, p.upgradeNote, fill(p.bankNote, { pct: `${formatNumber(bankFeePct)}%` })].map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-wood" aria-hidden />
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
