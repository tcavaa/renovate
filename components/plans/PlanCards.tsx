'use client';

import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanName } from '@/components/plans/PlanBadge';
import { fill } from '@/lib/admin/list';
import { useT } from '@/lib/i18n/client';
import { planLines } from '@/components/plans/planLines';
import type { BillingPeriod, PaidPlanId, PlanConfig, PlanId, PlanPrices } from '@/lib/plans/plans';
import type { OfferView, PlanState } from '@/lib/plans/server';
import { cn, formatDateTime, formatGEL } from '@/lib/utils';

export interface PlanCardsPrices {
  prices: PlanPrices;
  ownItemPrice: number;
  renderPrice: number;
  /** What admin set each plan to include. */
  config: PlanConfig;
}

/**
 * Free, Premium and Professional side by side (docs/subscriptions.md): the price for the period
 * chosen above them, what each adds to the one before, and the button — "your current plan",
 * renew, upgrade (less what is left of the lower plan), buy, or nothing for a lower plan than
 * the one in force. A visitor's button signs them up first. `only` narrows it to the plans an
 * upgrade dialogue offers.
 */
export function PlanCards({
  period,
  prices,
  state,
  signedIn,
  onChoose,
  only,
  compact = false,
}: {
  period: BillingPeriod;
  prices: PlanCardsPrices;
  state: PlanState | null;
  signedIn: boolean;
  onChoose: (plan: PaidPlanId) => void;
  only?: PlanId[];
  compact?: boolean;
}) {
  const t = useT();
  const p = t.plans;
  const current: PlanId = state?.plan ?? 'free';
  const plans = (['free', 'premium', 'professional'] as const).filter((plan) => !only || only.includes(plan));

  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-4', plans.length === 3 ? 'lg:grid-cols-3' : plans.length === 2 ? 'sm:grid-cols-2' : '')}>
      {plans.map((plan) => {
        const isCurrent = signedIn && !state?.staff && current === plan;
        const popular = plan === 'professional';
        const offer: OfferView | null = plan !== 'free' ? (state?.offers[plan][period] ?? null) : null;
        const monthly = plan === 'free' ? 0 : period === 'month' ? prices.prices[plan].month : prices.prices[plan].year / 12;
        const included = planLines(t, plan, prices);
        const saving = plan === 'free' ? 0 : Math.round((1 - prices.prices[plan].year / (prices.prices[plan].month * 12)) * 100);
        // The highlighted plan is an olive card; its muted text and quiet buttons turn light on it.
        const muted = popular ? 'text-sand-light/65' : 'text-ink-muted';
        const quietOnDark = popular ? 'border-sand-light/25 text-sand-light hover:border-sand-light/50 hover:bg-white/10' : undefined;
        return (
          <div
            key={plan}
            className={cn(
              'relative flex flex-col rounded-3xl border',
              compact ? 'p-5' : 'p-6 md:p-8',
              popular ? 'border-olive bg-olive text-sand-light shadow-cardHover' : 'border-line bg-bg-surface shadow-card',
              isCurrent && (popular ? 'ring-2 ring-wood-light/60 ring-offset-2 ring-offset-bg-base' : 'ring-2 ring-olive/30')
            )}
          >
            {popular && !compact && (
              <span className="paper-label absolute -top-3.5 right-6 inline-flex rotate-2 items-center gap-1.5 text-[11px]">
                <Sparkles className="h-3 w-3 text-brand" aria-hidden />
                {p.mostPopular}
              </span>
            )}
            <h3 className={cn('font-serif font-semibold', compact ? 'text-xl' : 'text-2xl')}>
              <PlanName plan={plan} />
            </h3>
            {!compact && <p className={cn('mt-1 text-sm', muted)}>{plan === 'free' ? p.freeTagline : plan === 'premium' ? p.premiumTagline : p.professionalTagline}</p>}

            <div className={cn('flex items-baseline gap-1.5', compact ? 'mt-3' : 'mt-5')}>
              <span className={cn('font-serif font-semibold tabular-nums', compact ? 'text-3xl' : 'text-4xl')}>{plan === 'free' ? formatGEL(0) : formatGEL(period === 'month' ? prices.prices[plan].month : prices.prices[plan].year)}</span>
              {plan !== 'free' && <span className={cn('text-sm', muted)}>{period === 'month' ? p.perMonth : p.perYear}</span>}
            </div>
            <p className={cn('mt-1 min-h-[1.25rem] text-xs', muted)}>
              {plan === 'free' ? p.freeForever : period === 'year' ? fill(p.yearEquivalent, { amount: formatGEL(monthly, true), pct: saving }) : fill(p.orYearly, { amount: formatGEL(prices.prices[plan].year) })}
            </p>

            <div className={compact ? 'mt-4' : 'mt-6'}>
              {plan === 'free' ? (
                <Button type="button" variant="outline" className="w-full" disabled>
                  {isCurrent ? p.currentPlan : signedIn && !state?.staff ? p.includedInYours : p.freeForever}
                </Button>
              ) : !signedIn ? (
                <Button asChild variant={popular ? 'default' : 'outline'} className="w-full">
                  <Link href="/register?callbackUrl=%2Fpricing">{p.signUpToBuy}</Link>
                </Button>
              ) : state?.staff ? (
                <Button type="button" variant="outline" className={cn('w-full', quietOnDark)} disabled>
                  {p.staffIncluded}
                </Button>
              ) : offer && !offer.ok ? (
                <Button type="button" variant="outline" className={cn('h-auto min-h-10 w-full whitespace-normal py-2', quietOnDark)} disabled>
                  {fill(p.lowerUntil, { date: formatDateTime(offer.until, false) })}
                </Button>
              ) : (
                <Button type="button" variant={popular ? 'default' : isCurrent ? 'ink' : 'outline'} className="w-full" onClick={() => onChoose(plan)}>
                  {offer?.ok && offer.kind === 'renew' ? p.renew : offer?.ok && offer.kind === 'upgrade' ? fill(p.upgradeTo, { plan: plan === 'premium' ? p.premium : p.professional }) : fill(p.buy, { plan: plan === 'premium' ? p.premium : p.professional })}
                </Button>
              )}
              {isCurrent && state?.subscription && <p className={cn('mt-2 text-center text-xs', popular ? 'text-wood-light' : 'text-success')}>{fill(p.activeUntil, { date: formatDateTime(state.subscription.paidUntil, false) })}</p>}
              {offer?.ok && offer.kind === 'upgrade' && offer.credit > 0 && <p className={cn('mt-2 text-center text-xs', muted)}>{fill(p.upgradeCreditNote, { credit: formatGEL(offer.credit, true), amount: formatGEL(offer.amount, true) })}</p>}
            </div>

            <div className={cn('border-t', popular ? 'border-sand-light/15' : 'border-line', compact ? 'mt-4 pt-4' : 'mt-6 pt-6')}>
              <p className={cn('eyebrow', popular ? 'text-sand-light/80' : 'text-ink')}>{included.heading}</p>
              <ul className="mt-3 space-y-2.5">
                {included.lines.map((line) => (
                  <li key={line} className={cn('flex items-start gap-2.5 text-sm leading-relaxed', popular ? 'text-sand-light/85' : 'text-ink-soft')}>
                    <span className={cn('mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full', popular ? 'bg-wood-light text-olive-dark' : 'bg-olive text-sand-light')}>
                      <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Month or year, above the cards. */
export function PeriodSwitch({ period, onPeriod, saving }: { period: BillingPeriod; onPeriod: (period: BillingPeriod) => void; saving: number }) {
  const t = useT();
  return (
    <div role="tablist" className="inline-flex items-center gap-1 rounded-full bg-sand/60 p-1 text-sm">
      {(['month', 'year'] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={period === value}
          onClick={() => onPeriod(value)}
          className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-medium transition-colors', period === value ? 'bg-bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink')}
        >
          {value === 'month' ? t.plans.monthly : t.plans.yearly}
          {value === 'year' && saving > 0 && <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', period === value ? 'bg-brand/10 text-brand' : 'bg-olive-soft text-olive')}>−{saving}%</span>}
        </button>
      ))}
    </div>
  );
}
