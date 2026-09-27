'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, CircleDot, Loader2, MessageSquare, PenLine, Send, ShoppingCart, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage, orderStatusLabel, roleLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import type { OrderEventData } from '@/lib/finance/view';
import { cn, formatDateTime, formatGEL } from '@/lib/utils';

const ICON: Record<OrderEventData['kind'], typeof CircleDot> = {
  created: ShoppingCart,
  confirmed: CheckCircle2,
  status: CircleDot,
  edited: PenLine,
  message: Undo2,
  comment: MessageSquare,
};

/**
 * An order's history and its thread: when it was placed, confirmed and sent, every status
 * change and edit, the messages to the customer, and the comments the platform's people and
 * the partner leave each other ("the tiles come in a week"). The customer sees none of it.
 */
export function OrderTimeline({ orderId, events, canComment = true }: { orderId: number; events: OrderEventData[]; canComment?: boolean }) {
  const t = useT();
  const r = t.orderReview;
  const router = useRouter();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      const json = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
      if (!res.ok) {
        setError(apiErrorMessage(t, json.error));
        return;
      }
      setBody('');
      router.refresh();
    } catch {
      setError(t.partner.saveError);
    } finally {
      setSending(false);
    }
  };

  const describe = (e: OrderEventData): string => {
    const meta = e.meta ?? {};
    if (e.kind === 'status') return fill(r.events.status, { from: orderStatusLabel(t, String(meta.from ?? '')), to: orderStatusLabel(t, String(meta.to ?? '')) });
    if (e.kind === 'edited') {
      const parts: string[] = [];
      const p = r.editedParts;
      for (const key of ['removed', 'restored', 'qtyChanged', 'priceChanged', 'added'] as const) {
        const n = Number(meta[key] ?? 0);
        if (n > 0) parts.push(fill(p[key], { n }));
      }
      if (meta.deliveryTo !== undefined) parts.push(fill(p.delivery, { from: formatGEL(Number(meta.deliveryFrom ?? 0)), to: formatGEL(Number(meta.deliveryTo)) }));
      return parts.length ? `${r.events.edited}: ${parts.join(', ')}` : r.events.edited;
    }
    return (r.events as Record<string, string>)[e.kind] ?? e.kind;
  };

  return (
    <section className="border border-line bg-bg-surface">
      <header className="border-b border-line px-5 py-3">
        <p className="eyebrow">{r.timelineTitle}</p>
        <p className="mt-1 text-xs text-ink-muted">{r.timelineHint}</p>
      </header>
      {events.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-muted">{r.noEvents}</p>
      ) : (
        <ol className="divide-y divide-line/70">
          {events.map((e) => {
            const Icon = ICON[e.kind] ?? CircleDot;
            const isComment = e.kind === 'comment';
            return (
              <li key={e.id} className={cn('flex gap-3 px-5 py-3', isComment && 'bg-bg-base/60')}>
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', isComment ? 'text-brand' : 'text-ink-faint')} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-muted">
                    <span className="font-semibold text-ink">{e.actorName ?? '—'}</span>
                    {e.actorRole && <span>{roleLabel(t, e.actorRole)}</span>}
                    <span suppressHydrationWarning>{formatDateTime(e.createdAt)}</span>
                  </p>
                  {isComment ? (
                    <p className="mt-1 whitespace-pre-line text-sm text-ink">{e.body}</p>
                  ) : (
                    <>
                      <p className="mt-0.5 text-sm text-ink">{describe(e)}</p>
                      {e.kind === 'message' && e.body && <p className="mt-1 whitespace-pre-line border-l-2 border-line pl-3 text-sm text-ink-soft">{e.body}</p>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {canComment && (
        <form onSubmit={send} className="space-y-2 border-t border-line p-4">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={r.commentPlaceholder} rows={2} maxLength={4000} />
          <div className="flex items-center justify-between gap-3">
            {error ? <p className="text-sm text-danger">{error}</p> : <span />}
            <Button type="submit" variant="ink" size="sm" disabled={sending || !body.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {r.commentSend}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
