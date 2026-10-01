'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FlittCheckout } from '@/components/payments/FlittCheckout';
import { fill } from '@/lib/admin/list';
import type { CardCharge } from '@/lib/finance/money';
import type { PaymentQuote, PaymentView } from '@/lib/finance/payments';
import type { CardPaymentView } from '@/lib/payments/service';
import type { StartPaymentBody } from '@/lib/validations/payment.schema';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { cn, formatGEL, formatM2, formatNumber } from '@/lib/utils';

/** What `POST /api/payments/flitt` answers. */
export type StartPaymentResponse =
  | { paid: PaymentView }
  | { free: true }
  | { credit: true }
  | { payment: CardPaymentView; token: string; charge: CardCharge; quote?: PaymentQuote };

/** What `GET /api/payments/flitt/[orderId]` answers. */
interface PaymentStatusResponse {
  payment: CardPaymentView;
  half: PaymentView | null;
}

/** Why there was nothing to pay. */
export type NothingToPay = { paid: PaymentView } | { free: true } | { credit: true };

/*
 * A dialogue holding Flitt's form is not modal while the form is up. Flitt puts 3-D Secure — the
 * bank's page — in a window of its own on <body>, outside the dialogue, and a modal dialogue
 * makes everything outside it unclickable (`pointer-events: none` on the body) and pulls the
 * focus back out of the bank's code field. So the dialogue drops `modal`, draws its backdrop
 * itself (`DialogContent backdrop`), and keeps open on a click outside (`keepOpenOutside`).
 */

/** For the dialogue's `onInteractOutside`: a click or a focus outside does not close it mid-payment. */
export function keepOpenOutside(event: Event) {
  event.preventDefault();
}

/** How a start went: Flitt's token, nothing to pay, or an error code to put into words. */
type StartOutcome =
  | { kind: 'form'; started: Extract<StartPaymentResponse, { token: string }> }
  | { kind: 'nothing'; why: NothingToPay }
  | { kind: 'error'; code: string | null };

/** Saves first when asked to (a failed save is `save-failed`), then starts the payment on the server. */
async function startPayment(request: StartPaymentBody, prepare?: () => Promise<unknown>): Promise<StartOutcome> {
  try {
    await prepare?.();
  } catch {
    return { kind: 'error', code: 'save-failed' };
  }
  try {
    const res = await fetch('/api/payments/flitt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    const json = (await res.json()) as { data: StartPaymentResponse | null; error: string | null };
    if (!res.ok || !json.data) return { kind: 'error', code: json.error };
    return 'token' in json.data ? { kind: 'form', started: json.data } : { kind: 'nothing', why: json.data };
  } catch {
    return { kind: 'error', code: null };
  }
}

/**
 * Flitt's servers refuse to serve the embedded form to a page on `localhost` (or 127.0.0.1) —
 * a developer's machine opens the app on any `*.localhost` name instead, e.g.
 * http://renovate.localhost:3000 (docs/payments.md).
 */
function blockedHost(): boolean {
  return typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
}

/** How long Flitt's form may take to come up before the dialogue says it did not. */
const FORM_TIMEOUT_MS = 20_000;

/** After the form says "paid": how often, and how long apart, the server is asked to confirm. */
const VERIFY_TRIES = 8;
const VERIFY_EVERY_MS = 1500;

type Stage = 'starting' | 'form' | 'verifying' | 'approved' | 'declined' | 'pending' | 'error';

/**
 * A card payment through Flitt, inside a dialogue (docs/payments.md), in two columns — what is
 * paid for on the left, Flitt's form on the right, so the dialogue needs no scrolling on a
 * laptop (stacked on a phone). It starts the payment on
 * the server — which fixes the amount: the price, and the bank's commission on top, shown as a
 * line of its own — then shows Flitt's embedded form. When the form says it is done, the server
 * asks Flitt for the signed status, and only an `approved` from there reaches `onApproved`.
 * A declined card or a form that would not load can be tried again: a new order each time.
 *
 * Nothing to pay — a half already paid, an own item that is free or paid for before — goes to
 * `onNothingToPay` without a form.
 */
export function CardPayment({
  request,
  itemLabel,
  header,
  footer,
  prepare,
  onNothingToPay,
  onApproved,
}: {
  request: StartPaymentBody;
  /** Above the bill, in the left column: the dialogue's own heading. */
  header?: React.ReactNode;
  /** Under the notes, in the left column: the way back. */
  footer?: React.ReactNode;
  /** The first line of the bill: what is being paid for. */
  itemLabel: string;
  /** Runs before the payment is started — the hinge saves the half, so the fee is the saved row's. */
  prepare?: () => Promise<unknown>;
  onNothingToPay: (why: NothingToPay) => void;
  onApproved: (payment: CardPaymentView, half: PaymentView | null) => void;
}) {
  const t = useT();
  const p = t.payment;
  const [stage, setStage] = useState<Stage>('starting');
  const [started, setStarted] = useState<Extract<StartPaymentResponse, { token: string }> | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The latest callbacks, so a parent's re-render does not start the payment again.
  const props = useRef({ request, prepare, onNothingToPay, onApproved });
  useEffect(() => {
    props.current = { request, prepare, onNothingToPay, onApproved };
  });

  /**
   * One payment per attempt: React's development double-mount runs this effect twice, and each
   * run would otherwise be an order at Flitt. The second run takes up the first one's request.
   */
  const startRef = useRef<{ attempt: number; result: Promise<StartOutcome> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (startRef.current?.attempt !== attempt) {
      startRef.current = { attempt, result: startPayment(props.current.request, props.current.prepare) };
    }
    startRef.current.result.then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === 'error') {
        setError(outcome.code === 'save-failed' ? t.market.saveFirstError : apiErrorMessage(t, outcome.code));
        setStage('error');
      } else if (outcome.kind === 'nothing') {
        props.current.onNothingToPay(outcome.why);
      } else {
        setStarted(outcome.started);
        setStage('form');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, t]);

  // Flitt's form that never comes up — a page Flitt refuses to serve, a network that dropped it —
  // is said so, with a new attempt, rather than left spinning.
  useEffect(() => {
    if (stage !== 'form' || formReady) return;
    const handle = window.setTimeout(() => {
      setError(blockedHost() ? p.localhostNote : p.formError);
      setStage('error');
    }, FORM_TIMEOUT_MS);
    return () => window.clearTimeout(handle);
  }, [stage, formReady, p]);

  /** The form says it is done: the server asks Flitt, a few times while the bank is still at it. */
  const verify = useCallback(async () => {
    if (!started) return;
    setStage('verifying');
    for (let i = 0; i < VERIFY_TRIES; i++) {
      try {
        const res = await fetch(`/api/payments/flitt/${encodeURIComponent(started.payment.orderId)}`, { cache: 'no-store' });
        const json = (await res.json()) as { data: PaymentStatusResponse | null; error: string | null };
        const status = json.data?.payment.status;
        if (json.data && status === 'approved') {
          setStage('approved');
          props.current.onApproved(json.data.payment, json.data.half);
          return;
        }
        if (json.data && (status === 'declined' || status === 'expired' || status === 'reversed')) {
          setError(json.data.payment.responseDescription);
          setStage('declined');
          return;
        }
      } catch {
        // A lost answer is asked again.
      }
      await new Promise((resolve) => window.setTimeout(resolve, VERIFY_EVERY_MS));
    }
    setStage('pending');
  }, [started]);

  /** A new payment: a declined card, a form that did not load. */
  const retry = () => {
    setStage('starting');
    setStarted(null);
    setFormReady(false);
    setError(null);
    setAttempt((n) => n + 1);
  };

  const charge = started?.charge ?? null;
  const quote = started?.quote ?? null;
  const testMode = started?.payment.testMode ?? false;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] md:gap-8">
      {/* Left: what is paid for — the dialogue's heading, the bill, the notes, the way back. */}
      <div className="flex min-w-0 flex-col gap-4">
        {header}

        {/* The bill: the price, the bank's commission on top, what the card is charged. */}
        <div className="rounded-[12px] border border-line p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-ink-soft">
              {itemLabel}
              {quote && <span className="block text-xs text-ink-muted">{fill(t.market.platformFeeHint, { fee: formatGEL(quote.feePerM2), m2: formatM2(quote.totalM2) })}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-ink">{charge ? formatGEL(charge.amount, true) : '—'}</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="text-ink-soft">{fill(p.bankFee, { pct: `${formatNumber(charge?.bankFeePct ?? 0)}%` })}</span>
            <span className="shrink-0 tabular-nums text-ink">{charge ? formatGEL(charge.bankFee, true) : '—'}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2">
            <span className="font-semibold text-ink">{p.total}</span>
            <span className="font-serif text-2xl font-semibold tabular-nums text-ink">{charge ? formatGEL(charge.total, true) : <Loader2 className="h-5 w-5 animate-spin text-ink-faint" />}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">{p.bankFeeNote}</p>
        </div>

        {testMode && stage === 'form' && (
          <p className="rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-ink">
            <span className="mr-1.5 rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-warning">{p.testBadge}</span>
            {p.testNote}
          </p>
        )}

        {blockedHost() && stage !== 'approved' && <p className="rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-ink">{p.localhostNote}</p>}

        <p className="flex items-start gap-2 text-xs text-ink-muted">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {p.secureNote}
        </p>

        {footer && <div className="mt-auto pt-1">{footer}</div>}
      </div>

      {/* Right: Flitt's form, and what became of the payment — clear of the dialogue's close button. */}
      <div className="min-w-0 md:pt-6">
        {stage === 'starting' && (
          <p className="flex items-center gap-2 py-6 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {p.starting}
          </p>
        )}

        {started && (stage === 'form' || stage === 'verifying') && (
          <div className="relative">
            <div className={cn(stage === 'verifying' && 'pointer-events-none opacity-40')}>
              <FlittCheckout
                key={started.token}
                token={started.token}
                onReady={() => setFormReady(true)}
                onSuccess={verify}
                onError={(message) => {
                  // The form shows a decline itself and lets the card be typed again; the words are kept for the hint below.
                  if (message) setError(message);
                }}
                onLoadFailed={() => {
                  setError(p.formError);
                  setStage('error');
                }}
              />
            </div>
            {!formReady && stage === 'form' && (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 py-6 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {p.starting}
              </div>
            )}
            {stage === 'verifying' && (
              <div className="absolute inset-0 grid place-items-center">
                <p className="flex items-center gap-2 rounded-full bg-bg-surface px-4 py-2 text-sm font-medium text-ink shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {p.verifying}
                </p>
              </div>
            )}
          </div>
        )}

        {stage === 'approved' && (
          <p className="flex items-center gap-2 rounded-[12px] border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-ink">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            {p.paidTitle}
          </p>
        )}

        {(stage === 'declined' || stage === 'error' || stage === 'pending') && (
          <div className="space-y-3">
            <p role="alert" className="border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
              {stage === 'declined' ? fill(p.declined, { reason: error ? ` — ${error}` : '' }) : stage === 'pending' ? p.stillProcessing : error}
            </p>
            <Button type="button" variant="outline" className="w-full" onClick={stage === 'pending' ? verify : retry}>
              <RotateCcw className="h-4 w-4" />
              {stage === 'pending' ? p.checkAgain : t.common.retry}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
