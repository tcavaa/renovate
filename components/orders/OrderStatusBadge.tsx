import { Badge } from '@/components/ui/badge';
import type { Dictionary } from '@/lib/i18n';
import { orderStatusLabel } from '@/lib/i18n/labels';
import type { OrderStatus } from '@/lib/finance/money';

const VARIANT: Record<OrderStatus, 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline'> = {
  new: 'warning',
  confirmed: 'secondary',
  in_progress: 'default',
  done: 'success',
  cancelled: 'danger',
};

/** The one place an order status turns into a colour. Server- and client-safe. */
export function OrderStatusBadge({ status, t }: { status: OrderStatus; t: Dictionary }) {
  return <Badge variant={VARIANT[status] ?? 'outline'}>{orderStatusLabel(t, status)}</Badge>;
}
