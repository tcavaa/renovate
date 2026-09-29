'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, CreditCard, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePlatformFees } from '@/hooks/usePlatformFees';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { platformFee, type CheckoutKind } from '@/lib/finance/money';
import type { PaymentQuote, PaymentView } from '@/lib/finance/payments';
import { cn, formatGEL, formatM2 } from '@/lib/utils';

/**
 * The published test card every payment provider accepts in its sandbox. It fills the form so
 * the step can be walked through; nothing is charged and only its last four digits are sent.
 */
const TEST_CARD = { number: '4242 4242 4242 4242', expiry: '12/34', cvc: '123' };
/** How long "paid" stays on screen before the step moves on. */
const PAID_PAUSE_MS = 1200;

type Stage = 'confirm' | 'pay' | 'paid';

/**
 * The hinge of a half, in two steps. First the warning: after this the plan cannot be changed
 * (the steps before it are shut — docs/project-flow.md §12), so check it now. Then the
 * platform's fee for the half — its floor area × the fee per m² — paid before the work
 * starts: the half is saved first so the server charges what is on screen, and the payment
 * is recorded once (`POST /api/payments`); a half already paid goes straight on. There is no
 * payment provider yet: the card form is filled with a test card and nothing is charged.
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
  areaM2,
  save,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CheckoutKind;
  projectId: number;
  /** The half's floor area as the page has it: the fee shown until the saved figure arrives. */
  areaM2: number;
  /** Saves the half, so the fee is worked out on what is on screen. */
  save: () => Promise<unknown>;
  onPaid: () => void;
}) {
  const t = useT();
  const p = t.payment;
  const { data: session } = useSession();
  const fees = usePlatformFees();
  const [stage, setStage] = useState<Stage>('confirm');
  const [preparing, setPreparing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [paid, setPaid] = useState<PaymentView | null>(null);
  const [card, setCard] = useState({ ...TEST_CARD, holder: '' });
  const holder = card.holder || (session?.user?.name ?? '').toUpperCase() || 'TEST CARD';

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
    setPreparing(false);
    setPaying(false);
    setError(null);
    setQuote(null);
    setPaid(null);
  };
  const close = (next: boolean) => {
    if (paying || stage === 'paid') return;
    if (!next) reset();
    onOpenChange(next);
  };

  /** The warning read: save the half, then ask what it costs — or whether it is paid already. */
  const toPayment = async () => {
    setStage('pay');
    setPreparing(true);
    setError(null);
    try {
      await save();
      const res = await fetch(`/api/payments?projectId=${projectId}`);
      const json = (await res.json()) as { data: { paid: Partial<Record<CheckoutKind, PaymentView>>; quote: Record<CheckoutKind, PaymentQuote> } | null; error: string | null };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'quote-failed');
      setPaid(json.data.paid[kind] ?? null);
      setQuote(json.data.quote[kind]);
    } catch (e) {
      setError((e as Error).message === 'save-failed' ? t.market.saveFirstError : p.quoteError);
    } finally {
      setPreparing(false);
    }
  };

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaying(true);
    setError(null);
    try {
      const digits = card.number.replace(/\D/g, '');
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, kind, cardLast4: digits.length >= 4 ? digits.slice(-4) : null }),
      });
      const json = (await res.json()) as { data: { payment: PaymentView; alreadyPaid: boolean } | null; error: string | null };
      if (!res.ok || !json.data) {
        setError(apiErrorMessage(t, json.error));
        return;
      }
      setPaid(json.data.payment);
      setStage('paid');
    } catch {
      setError(apiErrorMessage(t, null));
    } finally {
      setPaying(false);
    }
  };

  const perM2 = quote?.feePerM2 ?? (kind === 'design' ? fees.designFeePerM2 : fees.calculatorFeePerM2);
  const m2 = quote?.totalM2 ?? areaM2;
  const amount = quote?.amount ?? platformFee(areaM2, perM2);
  const feeLabel = kind === 'design' ? t.market.feeDesign : t.market.feeCalculator;
  const checks = kind === 'design' ? [p.checkRooms, p.checkWalls, p.checkTechnical] : [p.checkHomeState, p.checkRooms, p.checkWalls, p.checkTechnical];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto">
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
              <Button type="button" variant="ink" className="h-auto min-h-10 whitespace-normal py-2" onClick={toPayment}>
                {p.confirmContinue}
              </Button>
            </div>
          </>
        )}

        {stage === 'pay' && (
          <form onSubmit={pay} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl">{p.payTitle}</DialogTitle>
              <DialogDescription>{kind === 'design' ? p.payDescDesign : p.payDescCalculator}</DialogDescription>
            </DialogHeader>

            <div className="rounded-[12px] border border-line p-4">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-soft">{feeLabel}</span>
                <span className="text-xs text-ink-muted">{fill(t.market.platformFeeHint, { fee: formatGEL(perM2), m2: formatM2(m2) })}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2">
                <span className="font-semibold text-ink">{p.amountDue}</span>
                <span className="font-serif text-2xl font-semibold tabular-nums text-ink">{preparing ? <Loader2 className="h-5 w-5 animate-spin text-ink-faint" /> : formatGEL(amount)}</span>
              </div>
            </div>

            {paid ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 rounded-[12px] border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-ink">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {fill(p.alreadyPaid, { amount: formatGEL(paid.amount) })}
                </p>
                <Button type="button" variant="ink" size="lg" className="w-full" onClick={onPaid}>
                  {p.continueAfterPaid}
                </Button>
              </div>
            ) : (
              <>
                <fieldset disabled={preparing || paying || !quote} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <CreditCard className="h-4 w-4" aria-hidden />
                      {p.cardTitle}
                    </span>
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-warning">{p.testBadge}</span>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="card-number">{p.cardNumber}</Label>
                    <Input id="card-number" inputMode="numeric" autoComplete="off" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} className="font-mono tracking-wider" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="card-expiry">{p.cardExpiry}</Label>
                      <Input id="card-expiry" autoComplete="off" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} className="font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="card-cvc">{p.cardCvc}</Label>
                      <Input id="card-cvc" inputMode="numeric" autoComplete="off" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} className="font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="card-holder">{p.cardHolder}</Label>
                    <Input id="card-holder" autoComplete="off" value={holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} />
                  </div>
                  <p className="text-xs leading-relaxed text-ink-muted">{p.testNote}</p>
                </fieldset>
                {error && <p className="border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={() => setStage('confirm')} disabled={paying}>
                    <ArrowLeft className="h-4 w-4" />
                    {t.common.back}
                  </Button>
                  {error && !quote ? (
                    <Button type="button" variant="ink" className="flex-1" onClick={toPayment}>
                      {t.common.retry}
                    </Button>
                  ) : (
                    <Button type="submit" variant="ink" className="flex-1" disabled={preparing || paying || !quote}>
                      {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      {paying ? p.paying : fill(p.payButton, { amount: formatGEL(amount) })}
                    </Button>
                  )}
                </div>
              </>
            )}
          </form>
        )}

        {stage === 'paid' && paid && (
          <div className="py-4 text-center">
            <div className={cn('mx-auto grid h-16 w-16 animate-scale-in place-items-center rounded-full bg-success/15 text-success')}>
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogHeader className="mt-4 space-y-2">
              <DialogTitle className="text-center font-serif text-2xl">{p.paidTitle}</DialogTitle>
              <DialogDescription className="text-center">{fill(p.paidDesc, { amount: formatGEL(paid.amount), ref: paid.reference })}</DialogDescription>
            </DialogHeader>
            <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-ink-faint" aria-hidden />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
