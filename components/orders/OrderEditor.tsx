'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Ban, Loader2, Phone, Plus, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { OrderStageBadge } from '@/components/orders/OrderStatusBadge';
import { useOrderActions } from '@/components/orders/useOrderActions';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, orderStatusLabel, unitLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { ORDER_STATUSES, lineTotal, orderTotals, type OrderStatus } from '@/lib/finance/money';
import { lineDiff } from '@/lib/finance/orderFlow';
import type { OrderData, OrderItemData } from '@/lib/finance/view';
import { cn, formatDateTime, formatGEL, formatNumber } from '@/lib/utils';

/**
 * One order, as the platform's people work it (admin and the orders agent).
 *
 * A store's order arrives here before the store ever sees it: the agent rings the customer,
 * keeps or strikes each line (the tick is "stays in the order"), corrects quantities, prices and
 * the delivery, and presses "confirm and send" — which saves whatever is still unsaved and sends
 * the order to the store with the lines still ticked. Struck lines stay on the order, so the
 * customer sees what changed. After that — and for a brigade's or a worker's booking, which
 * goes to its partner at once — the agent can still change anything, reopen a closed order, and
 * keep a note the partner and the customer never see. Totals update as you type; nothing is
 * written until a button is pressed.
 */
type ItemEdit = { qty: number; unitPrice: number; removed: boolean; note: string | null };
type NewItem = { key: number; nameKa: string; qty: number; unitPrice: number; unit: string };

const INPUT = 'h-8 w-full border border-line bg-white px-2 text-right text-sm tabular-nums text-ink focus:border-ink focus:outline-none disabled:bg-bg-base disabled:text-ink-muted';

export function OrderEditor({ order, backHref }: { order: OrderData; backHref: string }) {
  const t = useT();
  const r = t.orderReview;
  const locale = useLocale();
  const { busy, notice, save, confirm } = useOrderActions(order.id);
  const [edits, setEdits] = useState<Record<number, ItemEdit>>({});
  const [added, setAdded] = useState<NewItem[]>([]);
  const [message, setMessage] = useState(order.partnerMessage ?? '');
  const [staffNote, setStaffNote] = useState(order.staffNote ?? '');
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [delivery, setDelivery] = useState<number>(order.deliveryFee);

  const review = order.stage === 'review';
  const current = (item: OrderItemData): ItemEdit => edits[item.id] ?? { qty: item.qty, unitPrice: item.unitPrice, removed: item.removed, note: item.note };
  const setItem = (item: OrderItemData, patch: Partial<ItemEdit>) => setEdits((e) => ({ ...e, [item.id]: { ...current(item), ...patch } }));

  const totals = useMemo(() => {
    const live = [...order.items.map((i) => current(i)), ...added.map((a) => ({ qty: a.qty, unitPrice: a.unitPrice, removed: false }))];
    return orderTotals(live, order.commissionPct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, added, order]);
  const kept = order.items.filter((i) => !current(i).removed).length + added.length;

  const dirty =
    Object.keys(edits).length > 0 || added.length > 0 || message !== (order.partnerMessage ?? '') || staffNote !== (order.staffNote ?? '') || status !== order.status || delivery !== order.deliveryFee;

  /** Only what changed, so an unchanged field is never rewritten. */
  const body = () => ({
    status: status !== order.status ? status : undefined,
    partnerMessage: message !== (order.partnerMessage ?? '') ? message || null : undefined,
    staffNote: staffNote !== (order.staffNote ?? '') ? staffNote || null : undefined,
    deliveryFee: delivery !== order.deliveryFee ? delivery : undefined,
    items: Object.entries(edits).map(([id, e]) => ({ id: Number(id), qty: e.qty, unitPrice: e.unitPrice, removed: e.removed, note: e.note })),
    addItems: added.filter((a) => a.nameKa.trim()).map((a) => ({ nameKa: a.nameKa.trim(), qty: a.qty, unitPrice: a.unitPrice, unit: a.unit })),
  });
  const reset = () => {
    setEdits({});
    setAdded([]);
  };

  const onSave = async () => {
    if (await save(body())) reset();
  };
  const onConfirm = async () => {
    if (await confirm(dirty ? body() : null)) reset();
  };
  const onCancel = async () => {
    if (!window.confirm(r.cancelConfirm)) return;
    if (await save({ ...body(), status: 'cancelled' })) {
      reset();
      setStatus('cancelled');
    }
  };

  const net = Math.max(0, totals.subtotal - totals.commissionAmount);

  return (
    <div className="space-y-6">
      {review && (
        <section className="flex flex-wrap items-center justify-between gap-4 border border-warning/60 bg-warning/5 p-5">
          <div className="max-w-2xl">
            <p className="font-serif text-lg font-semibold text-ink">{r.awaitingTitle}</p>
            <p className="mt-1 text-sm text-ink-soft">{r.awaitingHint}</p>
            <p className="mt-2 text-xs text-ink-muted">{fill(r.keptCount, { n: kept, total: order.items.length + added.length })}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              <Ban className="h-4 w-4" />
              {r.cancelOrder}
            </Button>
            <Button type="button" variant="ink" onClick={onConfirm} disabled={busy || kept === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {order.partner ? fill(r.confirmSendStore, { store: order.partner.nameKa }) : r.confirmSend}
            </Button>
          </div>
        </section>
      )}
      {!review && order.sentAt && (
        <p className="text-sm text-ink-muted" suppressHydrationWarning>
          {order.confirmedAt ? fill(r.confirmedOn, { date: formatDateTime(order.confirmedAt) }) : fill(r.sentOn, { date: formatDateTime(order.sentAt) })}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        {/* customer */}
        <section className="border border-line bg-bg-surface p-5">
          <p className="eyebrow">{t.partner.customer}</p>
          <p className="mt-2 font-serif text-xl font-semibold text-ink">{order.customerName}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1.5 hover:text-ink">
              <Phone className="h-3.5 w-3.5" />
              {order.customerPhone}
            </a>
            {order.customerEmail && (
              <a href={`mailto:${order.customerEmail}`} className="hover:text-ink">
                {order.customerEmail}
              </a>
            )}
          </p>
          {order.customerNote && (
            <div className="mt-4 border-l-2 border-ink pl-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{t.partner.customerNote}</p>
              <p className="mt-1 text-sm text-ink">{order.customerNote}</p>
            </div>
          )}
          <dl className="mt-4 grid gap-2 text-xs text-ink-muted sm:grid-cols-2">
            <div>
              <dt className="uppercase tracking-wide">{t.partner.placedOn}</dt>
              <dd className="mt-0.5 text-sm text-ink" suppressHydrationWarning>
                {formatDateTime(order.createdAt)}
              </dd>
            </div>
            {order.project && (
              <div>
                <dt className="uppercase tracking-wide">{t.partner.project}</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  <Link href={`/admin/projects/${order.project.id}`} className="text-brand hover:underline">
                    {order.project.nameKa ?? `#${order.project.id}`} · {formatNumber(order.project.totalM2)} {t.units.m2}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </section>

        {/* money and status */}
        <section className="border border-line bg-bg-surface p-5">
          <p className="eyebrow">{t.partner.total}</p>
          <p className="mt-2 font-serif text-3xl font-semibold tabular-nums text-ink">{formatGEL(totals.subtotal + delivery)}</p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-muted">
              <dt>{t.partner.items}</dt>
              <dd className="tabular-nums">{formatGEL(totals.subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 text-ink-muted">
              <dt>
                <label htmlFor={`delivery-${order.id}`}>{r.deliveryFee}</label>
                {order.originalDeliveryFee != null && delivery !== order.originalDeliveryFee && <span className="block text-[11px]">{fill(r.deliveryWas, { amount: formatGEL(order.originalDeliveryFee) })}</span>}
              </dt>
              <dd>
                <input id={`delivery-${order.id}`} type="number" min={0} step={1} value={delivery} onChange={(e) => setDelivery(Math.max(0, Number(e.target.value) || 0))} className={cn(INPUT, 'w-24')} />
              </dd>
            </div>
            <div className="flex justify-between text-ink-muted">
              <dt>{fill(t.partner.commission, { pct: formatNumber(order.commissionPct) })}</dt>
              <dd className="tabular-nums">− {formatGEL(totals.commissionAmount)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
              <dt>{t.partner.net}</dt>
              <dd className="tabular-nums">{formatGEL(net)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">
            <span className="text-xs uppercase tracking-wide text-ink-muted">{t.partner.statusLabel}</span>
            <OrderStageBadge stage={order.stage} t={t} />
          </div>
          {/* A store's order still with the platform is sent on by the button above, not from a list. */}
          {!review && (
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className="mt-2 h-9 w-full border border-line bg-white px-2 text-sm text-ink focus:border-ink focus:outline-none" aria-label={t.partner.statusLabel}>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {orderStatusLabel(t, s)}
                </option>
              ))}
            </select>
          )}
        </section>
      </div>

      {/* items */}
      <section className="border border-line bg-bg-surface">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="eyebrow">
            {t.partner.items} <span className="ml-2 normal-case tracking-normal text-ink-muted">{fill(r.keptCount, { n: kept, total: order.items.length + added.length })}</span>
          </p>
          <button type="button" onClick={() => setAdded((a) => [...a, { key: Date.now(), nameKa: '', qty: 1, unitPrice: 0, unit: 'piece' }])} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink hover:text-brand">
            <Plus className="h-3.5 w-3.5" />
            {t.partner.addItem}
          </button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                <th className="w-10 px-3 py-2" aria-label={r.keep} />
                <th className="px-2 py-2">{t.partner.item}</th>
                <th className="px-2 py-2 text-right">{t.partner.qty}</th>
                <th className="px-2 py-2 text-right">{t.partner.unitPrice}</th>
                <th className="px-2 py-2 text-right">{t.partner.lineTotal}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const e = current(item);
                const diff = lineDiff({ ...e, originalQty: item.originalQty, originalUnitPrice: item.originalUnitPrice });
                return (
                  <tr key={item.id} className={cn('border-b border-line/70 align-top last:border-b-0', e.removed && 'bg-bg-base/60')}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={!e.removed} onChange={() => setItem(item, { removed: !e.removed })} aria-label={r.keep} title={r.keep} className="mt-1 h-4 w-4 accent-ink" />
                    </td>
                    <td className="px-2 py-2.5">
                      <p className={cn('font-medium text-ink', e.removed && 'text-ink-muted line-through')}>{localizedName(locale, item)}</p>
                      <p className="text-xs text-ink-muted">
                        {[item.roomName, item.categorySlug?.includes(':') ? null : item.categorySlug].filter(Boolean).join(' · ')}
                        {diff.kind === 'removed' && <span className="ml-2 border border-danger/40 px-1 text-[10px] uppercase tracking-wide text-danger">{r.removedByManager}</span>}
                        {diff.kind === 'added' && <span className="ml-2 border border-success/40 px-1 text-[10px] uppercase tracking-wide text-success">{r.addedByManager}</span>}
                        {diff.kind === 'changed' && diff.qtyFrom != null && <span className="ml-2 text-warning">{fill(r.qtyWas, { qty: formatNumber(diff.qtyFrom) })}</span>}
                        {diff.kind === 'changed' && diff.priceFrom != null && <span className="ml-2 text-warning">{fill(r.priceWas, { price: formatGEL(diff.priceFrom) })}</span>}
                      </p>
                      {!e.removed && (
                        <input
                          type="text"
                          value={e.note ?? ''}
                          onChange={(ev) => setItem(item, { note: ev.target.value || null })}
                          placeholder={t.partner.itemNote}
                          className="mt-1.5 h-7 w-full max-w-md border border-line bg-white px-2 text-xs text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                        />
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input type="number" min={0} step={item.unit === 'piece' || item.unit === 'unit' ? 1 : 0.1} value={e.qty} disabled={e.removed} onChange={(ev) => setItem(item, { qty: Math.max(0, Number(ev.target.value) || 0) })} className={cn(INPUT, 'w-20')} />
                        <span className="w-10 text-left text-xs text-ink-muted">{unitLabel(t, item.unit)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <input type="number" min={0} step={0.01} value={e.unitPrice} disabled={e.removed} onChange={(ev) => setItem(item, { unitPrice: Math.max(0, Number(ev.target.value) || 0) })} className={cn(INPUT, 'w-28')} />
                    </td>
                    <td className={cn('px-2 py-2.5 text-right font-semibold tabular-nums', e.removed ? 'text-ink-faint line-through' : 'text-ink')}>{formatGEL(lineTotal(e.qty, e.unitPrice))}</td>
                  </tr>
                );
              })}
              {added.map((a, index) => (
                <tr key={a.key} className="border-b border-line/70 bg-success/5 align-top last:border-b-0">
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => setAdded((list) => list.filter((_, i) => i !== index))} aria-label={t.partner.remove} className="grid h-7 w-7 place-items-center border border-line text-ink-faint hover:border-danger hover:text-danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="px-2 py-2.5">
                    <input type="text" autoFocus value={a.nameKa} placeholder={t.partner.newItemName} onChange={(ev) => setAdded((list) => list.map((x, i) => (i === index ? { ...x, nameKa: ev.target.value } : x)))} className="h-8 w-full max-w-md border border-line bg-white px-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none" />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input type="number" min={0} step={1} value={a.qty} onChange={(ev) => setAdded((list) => list.map((x, i) => (i === index ? { ...x, qty: Math.max(0, Number(ev.target.value) || 0) } : x)))} className={cn(INPUT, 'w-20')} />
                      <select value={a.unit} onChange={(ev) => setAdded((list) => list.map((x, i) => (i === index ? { ...x, unit: ev.target.value } : x)))} className="h-8 border border-line bg-white px-1 text-xs text-ink focus:border-ink focus:outline-none">
                        {['piece', 'm2', 'linear_m', 'pack', 'set', 'unit'].map((u) => (
                          <option key={u} value={u}>
                            {unitLabel(t, u)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <input type="number" min={0} step={0.01} value={a.unitPrice} onChange={(ev) => setAdded((list) => list.map((x, i) => (i === index ? { ...x, unitPrice: Math.max(0, Number(ev.target.value) || 0) } : x)))} className={cn(INPUT, 'w-28')} />
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-ink">{formatGEL(lineTotal(a.qty, a.unitPrice))}</td>
                </tr>
              ))}
              {order.items.length === 0 && added.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-muted">
                    —
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-ink">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-ink">
                  {t.partner.total}
                </td>
                <td className="px-2 py-3 text-right font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(totals.subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* message to the customer */}
      <section className="border border-line bg-bg-surface p-5">
        <label className="block">
          <span className="eyebrow">{t.partner.messageLabel}</span>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.partner.messagePlaceholder} rows={3} className="mt-2" />
        </label>
        <p className="mt-2 text-xs text-ink-muted">{t.admin.ordersPage.adminEdit}</p>
      </section>

      {/*
        The agent's own note. Checking that the furniture is still to be had, ringing the
        customer about a substitution and agreeing what goes instead is most of the job, and
        none of it is written anywhere until it is written here. Neither the customer nor the
        partner ever sees it — the API strips it for both.
      */}
      <section className="border border-warning/40 bg-warning/5 p-5">
        <label className="block">
          <span className="eyebrow">{t.admin.ordersPage.staffNote}</span>
          <Textarea value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder={t.admin.ordersPage.staffNotePlaceholder} rows={3} className="mt-2 bg-white" />
        </label>
        <p className="mt-2 text-xs text-ink-muted">{t.admin.ordersPage.staffNoteHint}</p>
      </section>

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg-base/90 py-3 backdrop-blur-md">
        <Link href={backHref} className="text-sm font-medium text-ink-soft hover:text-ink">
          ← {t.admin.ordersPage.backToAll}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {notice ? (
            <p role="status" className={cn('text-sm', notice.ok ? 'text-success' : 'text-danger')}>
              {notice.text}
            </p>
          ) : (
            dirty && <p className="text-sm text-warning">{r.unsaved}</p>
          )}
          {!review && order.status === 'cancelled' && (
            <Button type="button" variant="outline" onClick={() => save({ status: order.sentAt ? 'confirmed' : 'new' })} disabled={busy}>
              <RotateCcw className="h-4 w-4" />
              {r.reopen}
            </Button>
          )}
          <Button type="button" variant={review ? 'outline' : 'ink'} onClick={onSave} disabled={!dirty || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {r.saveChanges}
          </Button>
          {review && (
            <Button type="button" variant="ink" onClick={onConfirm} disabled={busy || kept === 0}>
              <Send className="h-4 w-4" />
              {r.confirmSend}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
