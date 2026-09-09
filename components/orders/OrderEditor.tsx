'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Loader2, Phone, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { useLocale, useT } from '@/lib/i18n/client';
import { apiErrorMessage, localizedName, orderStatusLabel, unitLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { ORDER_STATUSES, lineTotal, orderTotals, type OrderStatus } from '@/lib/finance/money';
import type { OrderData, OrderItemData } from '@/lib/finance/view';
import { cn, formatDateTime, formatGEL, formatNumber } from '@/lib/utils';

/**
 * One order, editable by the partner it belongs to (and by admin): quantities and prices
 * per line, lines struck out and restored, new lines, a message to the customer and the
 * status. Totals update as you type; nothing is written until "save". Struck-out lines stay
 * visible so the customer can see what changed, and the platform's commission is shown next
 * to the partner's share — a partner should never have to guess what the platform takes.
 */
type ItemEdit = { qty: number; unitPrice: number; removed: boolean; note: string | null };
type NewItem = { key: number; nameKa: string; qty: number; unitPrice: number; unit: string };

const INPUT = 'h-8 w-full border border-line bg-white px-2 text-right text-sm tabular-nums text-ink focus:border-ink focus:outline-none disabled:bg-bg-base disabled:text-ink-muted';

export function OrderEditor({ order, mode, backHref }: { order: OrderData; mode: 'partner' | 'admin'; backHref: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [edits, setEdits] = useState<Record<number, ItemEdit>>({});
  const [added, setAdded] = useState<NewItem[]>([]);
  const [message, setMessage] = useState(order.partnerMessage ?? '');
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const closed = mode === 'partner' && (order.status === 'done' || order.status === 'cancelled');

  const current = (item: OrderItemData): ItemEdit => edits[item.id] ?? { qty: item.qty, unitPrice: item.unitPrice, removed: item.removed, note: item.note };
  const setItem = (item: OrderItemData, patch: Partial<ItemEdit>) => setEdits((e) => ({ ...e, [item.id]: { ...current(item), ...patch } }));

  const totals = useMemo(() => {
    const live = [...order.items.map((i) => current(i)), ...added.map((a) => ({ qty: a.qty, unitPrice: a.unitPrice, removed: false }))];
    return orderTotals(live, order.commissionPct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, added, order]);

  const dirty = Object.keys(edits).length > 0 || added.length > 0 || message !== (order.partnerMessage ?? '') || status !== order.status;

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const body = {
      status: status !== order.status ? status : undefined,
      partnerMessage: message !== (order.partnerMessage ?? '') ? message || null : undefined,
      items: Object.entries(edits).map(([id, e]) => ({ id: Number(id), qty: e.qty, unitPrice: e.unitPrice, removed: e.removed, note: e.note })),
      addItems: added.filter((a) => a.nameKa.trim()).map((a) => ({ nameKa: a.nameKa.trim(), qty: a.qty, unitPrice: a.unitPrice, unit: a.unit })),
    };
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json()) as { error: string | null };
      if (!res.ok) {
        setNotice({ ok: false, text: apiErrorMessage(t, json.error) });
        return;
      }
      setEdits({});
      setAdded([]);
      setNotice({ ok: true, text: t.partner.saved });
      router.refresh();
    } catch {
      setNotice({ ok: false, text: t.partner.saveError });
    } finally {
      setSaving(false);
    }
  };

  const net = Math.max(0, totals.subtotal - totals.commissionAmount);

  return (
    <div className="space-y-6">
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
                  {mode === 'admin' ? (
                    <Link href={`/admin/projects/${order.project.id}`} className="text-brand hover:underline">
                      {order.project.nameKa ?? `#${order.project.id}`} · {formatNumber(order.project.totalM2)} {t.units.m2}
                    </Link>
                  ) : (
                    <>
                      {order.project.nameKa ?? `#${order.project.id}`} · {formatNumber(order.project.totalM2)} {t.units.m2}
                    </>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {/* money */}
        <section className="border border-line bg-bg-surface p-5">
          <p className="eyebrow">{t.partner.total}</p>
          <p className="mt-2 font-serif text-3xl font-semibold tabular-nums text-ink">{formatGEL(totals.subtotal)}</p>
          <dl className="mt-4 space-y-1.5 text-sm">
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-ink-muted">
                <dt>{t.partner.deliveryFee}</dt>
                <dd className="tabular-nums">{formatGEL(order.deliveryFee)}</dd>
              </div>
            )}
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
            <OrderStatusBadge status={status} t={t} />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus)}
            disabled={closed}
            className="mt-2 h-9 w-full border border-line bg-white px-2 text-sm text-ink focus:border-ink focus:outline-none disabled:bg-bg-base"
            aria-label={t.partner.statusLabel}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {orderStatusLabel(t, s)}
              </option>
            ))}
          </select>
        </section>
      </div>

      {/* items */}
      <section className="border border-line bg-bg-surface">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="eyebrow">{t.partner.items}</p>
          {!closed && (
            <button type="button" onClick={() => setAdded((a) => [...a, { key: Date.now(), nameKa: '', qty: 1, unitPrice: 0, unit: 'piece' }])} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink hover:text-brand">
              <Plus className="h-3.5 w-3.5" />
              {t.partner.addItem}
            </button>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                <th className="px-4 py-2">{t.partner.item}</th>
                <th className="px-2 py-2 text-right">{t.partner.qty}</th>
                <th className="px-2 py-2 text-right">{t.partner.unitPrice}</th>
                <th className="px-2 py-2 text-right">{t.partner.lineTotal}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const e = current(item);
                return (
                  <tr key={item.id} className={cn('border-b border-line/70 align-top last:border-b-0', e.removed && 'bg-bg-base/60')}>
                    <td className="px-4 py-2.5">
                      <p className={cn('font-medium text-ink', e.removed && 'line-through text-ink-muted')}>{localizedName(locale, item)}</p>
                      <p className="text-xs text-ink-muted">
                        {[item.roomName, item.categorySlug?.startsWith('labour:') ? null : item.categorySlug].filter(Boolean).join(' · ')}
                        {e.removed && <span className="ml-2 border border-danger/40 px-1 text-[10px] uppercase tracking-wide text-danger">{t.partner.removed}</span>}
                      </p>
                      {!closed && !e.removed && (
                        <input
                          type="text"
                          value={e.note ?? ''}
                          onChange={(ev) => setItem(item, { note: ev.target.value || null })}
                          placeholder={t.partner.itemNote}
                          className="mt-1.5 h-7 w-full max-w-md border border-line bg-white px-2 text-xs text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                        />
                      )}
                      {(closed || e.removed) && e.note && <p className="mt-1 text-xs italic text-ink-muted">{e.note}</p>}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input type="number" min={0} step={item.unit === 'piece' || item.unit === 'unit' ? 1 : 0.1} value={e.qty} disabled={closed || e.removed} onChange={(ev) => setItem(item, { qty: Math.max(0, Number(ev.target.value) || 0) })} className={cn(INPUT, 'w-20')} />
                        <span className="w-10 text-left text-xs text-ink-muted">{unitLabel(t, item.unit)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <input type="number" min={0} step={0.01} value={e.unitPrice} disabled={closed || e.removed} onChange={(ev) => setItem(item, { unitPrice: Math.max(0, Number(ev.target.value) || 0) })} className={cn(INPUT, 'w-28')} />
                    </td>
                    <td className={cn('px-2 py-2.5 text-right font-semibold tabular-nums', e.removed ? 'text-ink-faint line-through' : 'text-ink')}>{formatGEL(lineTotal(e.qty, e.unitPrice))}</td>
                    <td className="px-2 py-2.5 text-right">
                      {!closed && (
                        <button
                          type="button"
                          onClick={() => setItem(item, { removed: !e.removed })}
                          title={e.removed ? t.partner.restore : t.partner.remove}
                          aria-label={e.removed ? t.partner.restore : t.partner.remove}
                          className={cn('grid h-8 w-8 place-items-center border transition-colors', e.removed ? 'border-line text-ink hover:bg-ink hover:text-white' : 'border-line text-ink-faint hover:border-danger hover:text-danger')}
                        >
                          {e.removed ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {added.map((a, index) => (
                <tr key={a.key} className="border-b border-line/70 bg-success/5 align-top last:border-b-0">
                  <td className="px-4 py-2.5">
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
                  <td className="px-2 py-2.5 text-right">
                    <button type="button" onClick={() => setAdded((list) => list.filter((_, i) => i !== index))} aria-label={t.partner.remove} className="grid h-8 w-8 place-items-center border border-line text-ink-faint hover:border-danger hover:text-danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
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
                <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-ink">
                  {t.partner.total}
                </td>
                <td className="px-2 py-3 text-right font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(totals.subtotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* message */}
      <section className="border border-line bg-bg-surface p-5">
        <label className="block">
          <span className="eyebrow">{t.partner.messageLabel}</span>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.partner.messagePlaceholder} rows={3} className="mt-2" disabled={closed && mode === 'partner'} />
        </label>
        {mode === 'admin' && <p className="mt-2 text-xs text-ink-muted">{t.admin.ordersPage.adminEdit}</p>}
        {closed && <p className="mt-2 text-xs text-warning">{t.partner.closed}</p>}
      </section>

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg-base/90 py-3 backdrop-blur-md">
        <Link href={backHref} className="text-sm font-medium text-ink-soft hover:text-ink">
          ← {mode === 'admin' ? t.admin.ordersPage.backToAll : t.partner.orders}
        </Link>
        <div className="flex items-center gap-3">
          {notice && (
            <p role="status" className={cn('text-sm', notice.ok ? 'text-success' : 'text-danger')}>
              {notice.text}
            </p>
          )}
          <Button type="button" variant="ink" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t.partner.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
