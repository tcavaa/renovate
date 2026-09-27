import { Badge } from '@/components/ui/badge';
import type { Dictionary } from '@/lib/i18n';
import { orderStatusLabel } from '@/lib/i18n/labels';
import type { OrderStatus } from '@/lib/finance/money';
import type { OrderStage } from '@/lib/finance/orderFlow';

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

const STAGE_VARIANT: Record<OrderStage, 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline'> = {
  review: 'warning',
  awaiting_partner: 'warning',
  accepted: 'secondary',
  in_progress: 'default',
  done: 'success',
  cancelled: 'danger',
};

/**
 * Where an order stands in words people use — "being checked by our manager", "waiting for the
 * partner" — rather than the bare status, which says "new" for both.
 */
export function OrderStageBadge({ stage, t }: { stage: OrderStage; t: Dictionary }) {
  return <Badge variant={STAGE_VARIANT[stage] ?? 'outline'}>{(t.orderReview.stages as Record<string, string>)[stage] ?? stage}</Badge>;
}
