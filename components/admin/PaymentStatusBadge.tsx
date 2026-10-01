import { Badge } from '@/components/ui/badge';
import type { Dictionary } from '@/lib/i18n';
import type { PaymentStatus } from '@/lib/payments/flitt';

const VARIANT: Record<PaymentStatus, 'success' | 'warning' | 'danger' | 'secondary' | 'outline'> = {
  approved: 'success',
  created: 'outline',
  processing: 'warning',
  declined: 'danger',
  expired: 'secondary',
  reversed: 'warning',
};

/** A card payment's status as Flitt last gave it — and whether it was the sandbox's. */
export function PaymentStatusBadge({ status, testMode, t }: { status: PaymentStatus; testMode?: boolean; t: Dictionary }) {
  const s = t.admin.paymentsPage;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={VARIANT[status]}>{s.statuses[status]}</Badge>
      {testMode && <Badge variant="outline">{s.test}</Badge>}
    </span>
  );
}
