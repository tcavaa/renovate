'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Loader2, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OrderStageBadge } from '@/components/orders/OrderStatusBadge';
import { useOrderActions } from '@/components/orders/useOrderActions';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, unitLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { lineTotal, orderSubtotal } from '@/lib/finance/money';
import { lineDiff, type OrderStage } from '@/lib/finance/orderFlow';
import { cn, formatDateTime, formatGEL, formatNumber } from '@/lib/utils';

export interface ReviewOrderLine {
  id: number;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  roomName: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  removed: boolean;
  originalQty: number | null;
  originalUnitPrice: number | null;
}

export interface ReviewOrder {
  id: number;
  partnerType: 'store' | 'worker' | 'team';
  stage: OrderStage;
  partnerName: string;
  deliveryFee: number;
  originalDeliveryFee: number | null;
  sentAt: string | null;
  confirmedAt: string | null;
  items: ReviewOrderLine[];
}

type LineEdit = { qty: number; removed: boolean };

/**
 * One order of a project as the orders agent confirms it from the project's page: which lines
 * stay (the tick), how many of each, the delivery — then "confirm and send", and the store has
 * it. A booking, or an order already sent, is shown as it stands with a link to the full order.
 */
export function OrderReviewCard({ order }: { order: ReviewOrder }) {
  const t = useT();
  const r = t.orderReview;
  const locale = useLocale();
  const { busy, notice, save, confirm } = useOrderActions(order.id);
  const [edits, setEdits] = useState<Record<number, LineEdit>>({});
  const [delivery, setDelivery] = useState(order.deliveryFee);
  const review = order.stage === 'review';

  const current = (line: ReviewOrderLine): LineEdit => edits[line.id] ?? { qty: line.qty, removed: line.removed };
  const set = (line: ReviewOrderLine, patch: Partial<LineEdit>) => setEdits((e) => ({ ...e, [line.id]: { ...current(line), ...patch } }));
  const subtotal = useMemo(() => orderSubtotal(order.items.map((l) => ({ ...current(l), unitPrice: l.unitPrice }))), [edits, order]); // eslint-disable-line react-hooks/exhaustive-deps
  const kept = order.items.filter((l) => !current(l).removed).length;
  const dirty = Object.keys(edits).length > 0 || delivery !== order.deliveryFee;
  const body = () => ({
    items: Object.entries(edits).map(([id, e]) => ({ id: Number(id), qty: e.qty, removed: e.removed })),
    deliveryFee: delivery !== order.deliveryFee ? delivery : undefined,
  });
  const kind = order.partnerType === 'store' ? t.admin.ordersPage.kindStore : order.partnerType === 'team' ? r.kindTeam : t.admin.ordersPage.kindWorker;

  return (
    <li className={cn('border bg-bg-surface', review ? 'border-warning/60' : 'border-line')}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate font-serif text-lg font-semibold text-ink">{order.partnerName}</span>
            <Badge variant="outline">{kind}</Badge>
            <OrderStageBadge stage={order.stage} t={t} />
          </p>
          <p className="mt-0.5 text-xs text-ink-muted" suppressHydrationWarning>
            {fill(t.market.orderNo, { id: order.id })}
            {order.sentAt && ` · ${order.confirmedAt ? fill(r.confirmedOn, { date: formatDateTime(order.confirmedAt) }) : fill(r.sentOn, { date: formatDateTime(order.sentAt) })}`}
          </p>
        </div>
        <Link href={`/admin/orders/${order.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-brand">
          {r.openFull}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <ul className="divide-y divide-line/70 text-sm">
        {order.items.map((line) => {
          const e = current(line);
          const diff = lineDiff({ ...e, unitPrice: line.unitPrice, originalQty: line.originalQty, originalUnitPrice: line.originalUnitPrice });
          return (
            <li key={line.id} className={cn('flex items-center gap-3 px-4 py-2', e.removed && 'bg-bg-base/60')}>
              {review && <input type="checkbox" checked={!e.removed} onChange={() => set(line, { removed: !e.removed })} aria-label={r.keep} title={r.keep} className="h-4 w-4 shrink-0 accent-ink" />}
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate', e.removed && 'text-ink-muted line-through')}>{localizedName(locale, line)}</span>
                <span className="block text-xs text-ink-muted">
                  {[line.roomName, `${formatGEL(line.unitPrice)} / ${unitLabel(t, line.unit)}`].filter(Boolean).join(' · ')}
                  {diff.kind === 'added' && <span className="ml-2 text-success">{r.addedByManager}</span>}
                  {diff.kind === 'changed' && diff.qtyFrom != null && <span className="ml-2 text-warning">{fill(r.qtyWas, { qty: formatNumber(diff.qtyFrom) })}</span>}
                </span>
              </span>
              {review ? (
                <input type="number" min={0} step={line.unit === 'piece' || line.unit === 'unit' ? 1 : 0.1} value={e.qty} disabled={e.removed} onChange={(ev) => set(line, { qty: Math.max(0, Number(ev.target.value) || 0) })} className="h-8 w-20 border border-line bg-white px-2 text-right text-sm tabular-nums focus:border-ink focus:outline-none disabled:bg-bg-base" aria-label={t.partner.qty} />
              ) : (
                <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                  {formatNumber(e.qty)} {unitLabel(t, line.unit)}
                </span>
              )}
              <span className={cn('w-24 shrink-0 text-right tabular-nums', e.removed ? 'text-ink-faint line-through' : 'text-ink')}>{formatGEL(lineTotal(e.qty, line.unitPrice))}</span>
            </li>
          );
        })}
      </ul>

      <footer className="space-y-3 border-t border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">{fill(r.keptCount, { n: kept, total: order.items.length })}</span>
          <label className="flex items-center gap-2 text-ink-muted">
            {r.deliveryFee}
            {review ? (
              <input type="number" min={0} step={1} value={delivery} onChange={(e) => setDelivery(Math.max(0, Number(e.target.value) || 0))} className="h-8 w-24 border border-line bg-white px-2 text-right tabular-nums text-ink focus:border-ink focus:outline-none" />
            ) : (
              <span className="tabular-nums text-ink">{formatGEL(order.deliveryFee)}</span>
            )}
          </label>
          <span className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(subtotal + delivery)}</span>
        </div>
        {review && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {notice && <p className={cn('mr-auto text-sm', notice.ok ? 'text-success' : 'text-danger')}>{notice.text}</p>}
            <Button type="button" variant="outline" size="sm" onClick={async () => (await save(body())) && setEdits({})} disabled={!dirty || busy}>
              <Save className="h-4 w-4" />
              {r.saveChanges}
            </Button>
            <Button type="button" variant="ink" size="sm" onClick={async () => (await confirm(dirty ? body() : null)) && setEdits({})} disabled={busy || kept === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {fill(r.confirmSendStore, { store: order.partnerName })}
            </Button>
          </div>
        )}
      </footer>
    </li>
  );
}
