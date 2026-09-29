'use client';

import { CheckCircle2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { formatGEL, formatM2 } from '@/lib/utils';
import type { CheckoutKind } from '@/lib/finance/money';
import type { PaymentView } from '@/lib/finance/payments';

/**
 * The platform's fee on a summary: paid before the half's hinge, so it is a line of its own
 * that says so — never added to what the project comes to. Nothing for a half that has no
 * payment (one that passed its hinge before the fee was taken there).
 */
export function FeePaidNote({ kind, payment }: { kind: CheckoutKind; payment: PaymentView | null | undefined }) {
  const t = useT();
  if (!payment) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="flex items-start gap-1.5">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
        <span>
          {kind === 'design' ? t.market.feeDesign : t.market.feeCalculator} · {t.payment.paidShort}
          <span className="block text-xs text-ink-muted">{fill(t.market.platformFeeHint, { fee: formatGEL(payment.feePerM2), m2: formatM2(payment.totalM2) })}</span>
        </span>
      </span>
      <span className="shrink-0 font-medium tabular-nums text-ink-muted">{formatGEL(payment.amount)}</span>
    </div>
  );
}
