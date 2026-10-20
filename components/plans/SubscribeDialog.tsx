'use client';

import { useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CardPayment, keepOpenOutside } from '@/components/payments/CardPayment';
import { usePlan } from '@/hooks/usePlan';
import { fill } from '@/lib/admin/list';
import { useT } from '@/lib/i18n/client';
import type { BillingPeriod, PaidPlanId } from '@/lib/plans/plans';
import type { OfferView } from '@/lib/plans/server';
import { cn, formatDateTime } from '@/lib/utils';

/**
 * Buying a plan for a month or a year by card (docs/subscriptions.md): Flitt's form beside the
 * bill (`CardPayment`, purpose `subscription` — the server prices it, an upgrade less what is
 * left of the lower plan), then "the plan is on", and the page's plan is read again. An upgrade
 * the credit covers whole is bought without a form. Not modal while the form is up, for 3-D
 * Secure (docs/payments.md#the-dialogue-cardpayment).
 */
export function SubscribeDialog({
  plan,
  period,
  offer,
  open,
  onOpenChange,
  onDone,
}: {
  plan: PaidPlanId;
  period: BillingPeriod;
  /** The purchase as the plan's state quoted it: what the heading says until the server answers. */
  offer: OfferView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const t = useT();
  const { refresh, state } = usePlan();
  const [done, setDone] = useState(false);
  const planName = plan === 'premium' ? t.plans.premium : t.plans.professional;
  const periodName = period === 'year' ? t.plans.periodYear : t.plans.periodMonth;

  const finish = async () => {
    await refresh();
    setDone(true);
  };
  const close = (next: boolean) => {
    if (!next && done) onDone?.();
    if (!next) setDone(false);
    onOpenChange(next);
  };

  const paying = open && !done;
  const until = state?.subscription?.plan === plan ? state.subscription.paidUntil : offer?.ok ? offer.endsAt : null;

  return (
    <Dialog open={open} onOpenChange={close} modal={!paying}>
      <DialogContent className={cn('max-h-[calc(100dvh-2rem)] overflow-y-auto', paying ? 'max-w-[56rem]' : 'max-w-md')} backdrop={paying} onInteractOutside={paying ? keepOpenOutside : undefined}>
        {done ? (
          <div className="py-4 text-center">
            <div className="mx-auto grid h-16 w-16 animate-scale-in place-items-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogHeader className="mt-4 space-y-2">
              <DialogTitle className="text-center font-serif text-2xl">{t.plans.paidPlanTitle}</DialogTitle>
              <DialogDescription className="text-center">{fill(t.plans.paidPlanDesc, { plan: planName, date: until ? formatDateTime(until, false) : '—' })}</DialogDescription>
            </DialogHeader>
            <Button type="button" variant="ink" size="lg" className="mt-6 w-full" onClick={() => close(false)}>
              {t.plans.continueAfterPlan}
            </Button>
          </div>
        ) : (
          open && (
            <CardPayment
              request={{ purpose: 'subscription', plan, period }}
              itemLabel={fill(t.plans.subscribeItem, { plan: planName, period: periodName })}
              header={
                <DialogHeader>
                  <DialogTitle className="font-serif text-xl">{fill(t.plans.subscribeTitle, { plan: planName })}</DialogTitle>
                  <DialogDescription>
                    {offer?.ok
                      ? fill(offer.kind === 'renew' ? t.plans.subscribeRenewDesc : t.plans.subscribeDesc, { from: formatDateTime(offer.startsAt, false), to: formatDateTime(offer.endsAt, false) })
                      : t.plans.prepaidNote}
                  </DialogDescription>
                </DialogHeader>
              }
              footer={
                <Button type="button" variant="outline" onClick={() => close(false)}>
                  <ArrowLeft className="h-4 w-4" />
                  {t.common.back}
                </Button>
              }
              onNothingToPay={() => void finish()}
              onApproved={() => void finish()}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
