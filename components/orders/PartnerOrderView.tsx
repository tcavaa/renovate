'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Check, Loader2, Lock, Phone, Play, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { OrderStageBadge } from '@/components/orders/OrderStatusBadge';
import { useOrderActions } from '@/components/orders/useOrderActions';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, unitLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { partnerNextStatuses } from '@/lib/finance/orderFlow';
import type { OrderStatus } from '@/lib/finance/money';
import type { OrderData } from '@/lib/finance/view';
import { cn, formatDateTime, formatGEL, formatNumber } from '@/lib/utils';

const ACTION_ICON: Partial<Record<OrderStatus, typeof Check>> = { confirmed: Check, in_progress: Play, done: Check, cancelled: X };

/**
 * An order as its partner sees it — a store, a brigade, a worker: who ordered and how to reach
 * them, what was ordered (the lines the platform kept; the struck ones are not the partner's
 * business), what it comes to and the platform's share, the next step as a button ("accept",
 * "start the work", "done"), and a message to the customer. Lines, quantities and prices are
 * locked: the partner says what it cannot supply in a comment, and the platform changes it.
 */
export function PartnerOrderView({ order, backHref, projectHref }: { order: OrderData; backHref: string; /** The project to look at, for a brigade (`/partner/projects/[id]`). */ projectHref?: string | null }) {
  const t = useT();
  const r = t.orderReview;
  const locale = useLocale();
  const { busy, notice, save } = useOrderActions(order.id);
  const [message, setMessage] = useState(order.partnerMessage ?? '');

  const next = partnerNextStatuses(order);
  const closed = order.status === 'done' || order.status === 'cancelled';
  const lines = order.items.filter((i) => !i.removed);
  const net = Math.max(0, order.subtotal - order.commissionAmount);
  const messageDirty = message !== (order.partnerMessage ?? '');

  const move = async (status: OrderStatus) => {
    if (status === 'cancelled' && !window.confirm(r.cancelConfirm)) return;
    await save({ status, partnerMessage: messageDirty ? message || null : undefined });
  };

  return (
    <div className="space-y-6">
      {next.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-4 border border-ink bg-bg-surface p-5">
          <div>
            <p className="eyebrow">{r.nextStep}</p>
            <p className="mt-1 max-w-2xl text-sm text-ink">{order.status === 'new' ? t.teams.acceptHint : (r.customerHints as Record<string, string>)[order.stage]}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {next.map((status) => {
              const Icon = ACTION_ICON[status] ?? Check;
              return (
                <Button key={status} type="button" variant={status === 'cancelled' ? 'outline' : 'ink'} onClick={() => move(status)} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  {(r.actions as Record<string, string>)[status] ?? status}
                </Button>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
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
                {formatDateTime(order.sentAt ?? order.createdAt)}
              </dd>
            </div>
            {order.project && (
              <div>
                <dt className="uppercase tracking-wide">{t.partner.project}</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {order.project.nameKa ?? `#${order.project.id}`} · {formatNumber(order.project.totalM2)} {t.units.m2}
                </dd>
              </div>
            )}
          </dl>
          {projectHref && (
            <Link href={projectHref} className="mt-4 inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-brand">
              {t.projectView.openProject}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </section>

        <section className="border border-line bg-bg-surface p-5">
          <p className="eyebrow">{t.partner.total}</p>
          <p className="mt-2 font-serif text-3xl font-semibold tabular-nums text-ink">{formatGEL(order.subtotal)}</p>
          <dl className="mt-4 space-y-1.5 text-sm">
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-ink-muted">
                <dt>{t.partner.deliveryFee}</dt>
                <dd className="tabular-nums">{formatGEL(order.deliveryFee)}</dd>
              </div>
            )}
            <div className="flex justify-between text-ink-muted">
              <dt>{fill(t.partner.commission, { pct: formatNumber(order.commissionPct) })}</dt>
              <dd className="tabular-nums">− {formatGEL(order.commissionAmount)}</dd>
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
        </section>
      </div>

      <section className="border border-line bg-bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <p className="eyebrow">{t.partner.items}</p>
          <p className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <Lock className="h-3.5 w-3.5" />
            {r.linesLocked}
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                <th className="px-4 py-2">{t.partner.item}</th>
                <th className="px-2 py-2 text-right">{t.partner.qty}</th>
                <th className="px-2 py-2 text-right">{t.partner.unitPrice}</th>
                <th className="px-4 py-2 text-right">{t.partner.lineTotal}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((item) => (
                <tr key={item.id} className="border-b border-line/70 align-top last:border-b-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink">{localizedName(locale, item)}</p>
                    {item.roomName && <p className="text-xs text-ink-muted">{item.roomName}</p>}
                    {item.note && <p className="mt-1 text-xs italic text-ink-muted">{item.note}</p>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatNumber(item.qty)} <span className="text-xs text-ink-muted">{unitLabel(t, item.unit)}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatGEL(item.unitPrice)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatGEL(item.total)}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-muted">
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
                <td className="px-4 py-3 text-right font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(order.subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="border border-line bg-bg-surface p-5">
        <label className="block">
          <span className="eyebrow">{t.partner.messageLabel}</span>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.partner.messagePlaceholder} rows={3} className="mt-2" disabled={closed} />
        </label>
        {closed && <p className="mt-2 text-xs text-warning">{r.closedNote}</p>}
      </section>

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg-base/90 py-3 backdrop-blur-md">
        <Link href={backHref} className="text-sm font-medium text-ink-soft hover:text-ink">
          ← {t.partner.orders}
        </Link>
        <div className="flex items-center gap-3">
          {notice && (
            <p role="status" className={cn('text-sm', notice.ok ? 'text-success' : 'text-danger')}>
              {notice.text}
            </p>
          )}
          {!closed && (
            <Button type="button" variant="ink" onClick={() => save({ partnerMessage: message || null })} disabled={!messageDirty || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t.partner.save}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
