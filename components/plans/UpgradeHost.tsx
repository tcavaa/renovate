'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FolderLock, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PeriodSwitch, PlanCards } from '@/components/plans/PlanCards';
import { SubscribeDialog } from '@/components/plans/SubscribeDialog';
import { usePlan } from '@/hooks/usePlan';
import { fill } from '@/lib/admin/list';
import { useT } from '@/lib/i18n/client';
import { PAID_PLANS, planRank, plansWith, type BillingPeriod, type PaidPlanId, type PlanConfig, type PlanFeature } from '@/lib/plans/plans';
import { usePlanStore, type UpgradeRequest } from '@/store/planStore';
import { formatDateTime, formatGEL } from '@/lib/utils';

/** What a locked feature is called, and what it would let the person do. */
export function featureText(t: ReturnType<typeof useT>, feature: PlanFeature): { title: string; desc: string } {
  const p = t.plans;
  switch (feature) {
    case 'planUpload':
      return { title: p.featurePlanUpload, desc: p.featurePlanUploadDesc };
    case 'catalog':
      return { title: p.featureCatalog, desc: p.featureCatalogDesc };
    case 'moveFurniture':
      return { title: p.featureMoveFurniture, desc: p.featureMoveFurnitureDesc };
    case 'walk':
      return { title: p.featureWalk, desc: p.featureWalkDesc };
    case 'renders':
      return { title: p.featureRenders, desc: p.featureRendersDesc };
    case 'ownItems':
      return { title: p.featureOwnItems, desc: p.featureOwnItemsDesc };
  }
}

/**
 * The plans that answer a request: those admin gave the feature to, the one chosen, or — for
 * used-up projects — the paid plans above the current one.
 */
function offeredPlans(request: UpgradeRequest, current: PaidPlanId | 'free', config: PlanConfig | undefined): PaidPlanId[] {
  if ('feature' in request) return plansWith(request.feature, config);
  if ('plan' in request) return [request.plan];
  return PAID_PLANS.filter((plan) => planRank(plan) > planRank(current));
}

/**
 * The upgrade dialogue (docs/subscriptions.md), one for the whole site, mounted in the main
 * layout: a locked feature was clicked (`usePlanGate().gate`), the projects are used up, or a plan
 * was chosen. It says what the feature is and which plan has it, shows the plans that do — a
 * month or a year — and buys one there and then (`SubscribeDialog`); "all plans" opens /pricing.
 */
export function UpgradeHost() {
  const t = useT();
  const p = t.plans;
  const request = usePlanStore((s) => s.upgrade);
  const close = usePlanStore((s) => s.closeUpgrade);
  const { state } = usePlan();
  const [period, setPeriod] = useState<BillingPeriod>('month');
  const [buying, setBuying] = useState<PaidPlanId | null>(null);

  const current = state?.plan ?? 'free';
  const offered = request ? offeredPlans(request, current, state?.config) : [];
  const wanted: PaidPlanId = offered[0] ?? 'professional';
  const feature = request && 'feature' in request ? featureText(t, request.feature) : null;
  const wantedName = wanted === 'premium' ? p.premium : p.professional;

  let title = fill(p.choosePlanTitle, { plan: wantedName });
  let desc = p.prepaidNote;
  if (feature) {
    title = fill(p.lockedTitle, { feature: feature.title, plan: wantedName });
    desc = feature.desc;
  } else if (request && 'limit' in request) {
    title = p.limitTitle;
    const projects = state?.projects;
    desc = !projects || projects.per === 'total' ? fill(p.limitDescFree, { n: projects?.limit ?? 2 }) : fill(p.limitDescMonth, { n: projects.limit ?? 0, date: projects.resetsAt ? formatDateTime(projects.resetsAt, false) : '—' });
  }

  const prices = state ? { prices: state.prices, ownItemPrice: state.ownItemPrice, renderPrice: state.renderPrice, config: state.config } : null;
  const saving = state ? Math.round((1 - state.prices.premium.year / (state.prices.premium.month * 12)) * 100) : 0;

  return (
    <>
      <Dialog open={!!request && !buying} onOpenChange={(next) => !next && close()}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <div className="mb-2 grid h-11 w-11 place-items-center rounded-full bg-accent/15 text-accent-dark">{request && 'limit' in request ? <FolderLock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}</div>
            <DialogTitle className="font-serif text-2xl">{title}</DialogTitle>
            <DialogDescription className="leading-relaxed">{desc}</DialogDescription>
          </DialogHeader>

          {prices ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <PeriodSwitch period={period} onPeriod={setPeriod} saving={saving} />
                <p className="text-xs text-ink-muted">{fill(p.bankNote, { pct: `${state?.bankFeePct ?? 0}%` })}</p>
              </div>
              <PlanCards period={period} prices={prices} state={state} signedIn onChoose={setBuying} only={offered} compact />
            </>
          ) : (
            <p className="text-sm text-ink-muted">{p.signInForPlans}</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" onClick={close}>
              {p.notNow}
            </Button>
            <Button asChild variant="outline">
              <Link href="/pricing" onClick={close}>
                {p.comparePlans}
              </Link>
            </Button>
          </div>
          {state && request && 'feature' in request && request.feature === 'renders' && <p className="text-xs text-ink-muted">{fill(p.renderPriceNote, { price: formatGEL(state.renderPrice) })}</p>}
        </DialogContent>
      </Dialog>

      {buying && (
        <SubscribeDialog
          plan={buying}
          period={period}
          offer={state?.offers[buying][period] ?? null}
          open
          onOpenChange={(next) => {
            if (!next) setBuying(null);
          }}
          onDone={() => {
            setBuying(null);
            close();
          }}
        />
      )}
    </>
  );
}
