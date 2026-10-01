'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CardPayment, keepOpenOutside } from '@/components/payments/CardPayment';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import type { CheckoutKind } from '@/lib/finance/money';
import type { PaymentView } from '@/lib/finance/payments';
import { cn, formatGEL } from '@/lib/utils';

/** How long "paid" stays on screen before the step moves on. */
const PAID_PAUSE_MS = 1200;

type Stage = 'confirm' | 'pay' | 'paid';

/**
 * The hinge of a half, in two steps. First the warning: after this the plan cannot be changed
 * (the steps before it are shut — docs/project-flow.md §12), so check it now. Then the
 * platform's fee for the half — its floor area × the fee per m², and the bank's commission on
 * top — paid by card through Flitt (`CardPayment`, docs/payments.md) before the work starts:
 * the half is saved first so the server charges what is on screen, and the half counts as paid
 * only once Flitt's signed status says so; a half already paid goes straight on.
 *
 * `onPaid` is the hinge itself — the calculator sets `calculated`, the studio generates — and
 * the way on. The page mounts the dialogue only while it is open, so every opening starts
 * from the warning.
 */
export function HingeDialog({
  open,
  onOpenChange,
  kind,
  projectId,
  save,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CheckoutKind;
  projectId: number;
  /** Saves the half, so the fee is worked out on what is on screen. */
  save: () => Promise<unknown>;
  onPaid: () => void;
}) {
  const t = useT();
  const p = t.payment;
  const [stage, setStage] = useState<Stage>('confirm');
  /** Paid before this opening (another tab, an earlier visit): no form, a button on. */
  const [paidBefore, setPaidBefore] = useState<PaymentView | null>(null);
  const [paid, setPaid] = useState<{ amount: number; reference: string } | null>(null);

  // Paid: a moment to read it, then on — once, whatever the page re-renders in between.
  const onPaidRef = useRef(onPaid);
  useEffect(() => {
    onPaidRef.current = onPaid;
  });
  useEffect(() => {
    if (stage !== 'paid') return;
    const handle = window.setTimeout(() => onPaidRef.current(), PAID_PAUSE_MS);
    return () => window.clearTimeout(handle);
  }, [stage]);

  const reset = () => {
    setStage('confirm');
    setPaidBefore(null);
    setPaid(null);
  };
  const close = (next: boolean) => {
    if (stage === 'paid') return;
    if (!next) reset();
    onOpenChange(next);
  };

  /** The save before the payment: a failed one says so instead of charging for an unsaved plan. */
  const prepare = async () => {
    try {
      await save();
    } catch {
      throw new Error('save-failed');
    }
  };

  const feeLabel = kind === 'design' ? t.market.feeDesign : t.market.feeCalculator;
  const checks = kind === 'design' ? [p.checkRooms, p.checkWalls, p.checkTechnical] : [p.checkHomeState, p.checkRooms, p.checkWalls, p.checkTechnical];

  // Flitt's form is up: not modal, so its 3-D Secure window can be used (`DialogContent backdrop`),
  // and wide — the bill beside the form, nothing to scroll.
  const cardStep = stage === 'pay' && !paidBefore;
  const payHeader = (
    <DialogHeader>
      <DialogTitle className="font-serif text-xl">{p.payTitle}</DialogTitle>
      <DialogDescription>{kind === 'design' ? p.payDescDesign : p.payDescCalculator}</DialogDescription>
    </DialogHeader>
  );

  return (
    <Dialog open={open} onOpenChange={close} modal={!cardStep}>
      <DialogContent className={cn('max-h-[calc(100dvh-2rem)] overflow-y-auto', cardStep ? 'max-w-[56rem]' : 'max-w-md')} backdrop={cardStep} onInteractOutside={cardStep ? keepOpenOutside : undefined}>
        {stage === 'confirm' && (
          <>
            <DialogHeader>
              <div className="mb-2 grid h-11 w-11 place-items-center rounded-full bg-warning/15 text-warning">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <DialogTitle className="font-serif text-xl">{kind === 'design' ? p.confirmTitleDesign : p.confirmTitleCalculator}</DialogTitle>
              <DialogDescription className="leading-relaxed">{kind === 'design' ? p.confirmBodyDesign : p.confirmBodyCalculator}</DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 rounded-[12px] border border-line bg-bg-base p-4 text-sm text-ink">
              {checks.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-2 text-xs text-ink-muted">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {p.lockNote}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="h-auto min-h-10 whitespace-normal py-2" onClick={() => close(false)}>
                {p.reviewAgain}
              </Button>
              <Button type="button" variant="ink" className="h-auto min-h-10 whitespace-normal py-2" onClick={() => setStage('pay')}>
                {p.confirmContinue}
              </Button>
            </div>
          </>
        )}

        {stage === 'pay' &&
          (paidBefore ? (
            <div className="space-y-4">
              {payHeader}
              <p className="flex items-start gap-2 rounded-[12px] border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-ink">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {fill(p.alreadyPaid, { amount: formatGEL(paidBefore.amount, true) })}
              </p>
              <Button type="button" variant="ink" size="lg" className="w-full" onClick={onPaid}>
                {p.continueAfterPaid}
              </Button>
            </div>
          ) : (
            <CardPayment
              request={{ purpose: kind, projectId }}
              itemLabel={feeLabel}
              header={payHeader}
              footer={
                <Button type="button" variant="outline" onClick={() => setStage('confirm')}>
                  <ArrowLeft className="h-4 w-4" />
                  {t.common.back}
                </Button>
              }
              prepare={prepare}
              onNothingToPay={(why) => {
                if ('paid' in why) setPaidBefore(why.paid);
              }}
              onApproved={(payment, half) => {
                setPaid({ amount: payment.total, reference: half?.reference ?? payment.orderId });
                setStage('paid');
              }}
            />
          ))}

        {stage === 'paid' && paid && (
          <div className="py-4 text-center">
            <div className={cn('mx-auto grid h-16 w-16 animate-scale-in place-items-center rounded-full bg-success/15 text-success')}>
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogHeader className="mt-4 space-y-2">
              <DialogTitle className="text-center font-serif text-2xl">{p.paidTitle}</DialogTitle>
              <DialogDescription className="text-center">{fill(p.paidDesc, { amount: formatGEL(paid.amount, true), ref: paid.reference })}</DialogDescription>
            </DialogHeader>
            <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-ink-faint" aria-hidden />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
