'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle2, ChevronDown, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomerFields, type CustomerForm } from '@/components/checkout/CustomerFields';
import { useLocale, useT } from '@/lib/i18n/client';
import { apiErrorMessage, localizedName } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import type { CheckoutResult, ProjectOrderState } from '@/lib/finance/orders';
import { platformFee, type CheckoutKind } from '@/lib/finance/money';
import { cn, formatGEL, formatM2, formatNumber } from '@/lib/utils';

/** One half of a project as the dialog summarises it: the fee it carries and the products it would send. */
export interface CheckoutPart {
  kind: CheckoutKind;
  totalM2: number;
  feePerM2: number;
  lines: Array<{ key: string; productId: number | null; name: string; qty: number; total: number; where: string | null }>;
}

/**
 * The step that turns an estimate into business: the customer leaves their contact, the
 * project is saved (by the caller, so each summary saves in its own shape), and the platform
 * writes the fees and one order per store. A project with both halves is one checkout: a
 * quick line per half — fee and products — with the full list a click away; a half ordered
 * earlier is shown as already paid, and products already sent to a store are not sent again.
 * Guests are welcome. Nothing is paid here; the fees are shown.
 */
export function CheckoutDialog({
  open,
  onOpenChange,
  saveProject,
  projectId,
  parts,
  onOrdered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves (or reuses) the project and returns its id; throws on failure. */
  saveProject: () => Promise<number>;
  /** The saved project, when known, so earlier checkouts of it can be shown. */
  projectId: number | null;
  parts: CheckoutPart[];
  /** Called once an order went through — a page showing the orders can refresh itself. */
  onOrdered?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const { data: session } = useSession();
  const [form, setForm] = useState<CustomerForm | null>(null);
  const value: CustomerForm = form ?? { name: session?.user?.name ?? '', phone: '', email: session?.user?.email ?? '', note: '' };
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [state, setState] = useState<ProjectOrderState | null>(null);
  const [full, setFull] = useState(false);

  // What earlier sittings already ordered, so the preview matches what the server will do.
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    fetch(`/api/checkout?projectId=${projectId}`)
      .then((r) => r.json())
      .then((json: { data: ProjectOrderState | null }) => {
        if (!cancelled) setState(json.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const orderedKinds = new Set(state?.orderedKinds ?? []);
  // Same rules the server applies: the design's lines win over the calculator's copies of a
  // product, and units ordered earlier are taken off the top, product by product.
  const designProducts = new Set(parts.filter((p) => p.kind === 'design').flatMap((p) => p.lines.map((l) => l.productId)).filter((id): id is number => id != null));
  const covered: Record<number, number> = {};
  for (const [key, qty] of Object.entries(state?.orderedQty ?? {})) covered[Number(key)] = qty;
  const marked = new Map<string, boolean>();
  for (const part of [...parts.filter((p) => p.kind === 'design'), ...parts.filter((p) => p.kind !== 'design')]) {
    for (const line of part.lines) {
      if (line.productId == null) {
        marked.set(line.key, false);
        continue;
      }
      if (part.kind !== 'design' && designProducts.has(line.productId)) {
        marked.set(line.key, true);
        continue;
      }
      const remaining = covered[line.productId] ?? 0;
      if (remaining >= line.qty) {
        covered[line.productId] = remaining - line.qty;
        marked.set(line.key, true);
        continue;
      }
      covered[line.productId] = 0;
      marked.set(line.key, false);
    }
  }
  const view = parts.map((part) => {
    const lines = part.lines.map((line) => ({ ...line, duplicate: marked.get(line.key) ?? false }));
    const feePaid = orderedKinds.has(part.kind);
    return {
      ...part,
      lines,
      feePaid,
      fee: feePaid ? 0 : platformFee(part.totalM2, part.feePerM2),
      goods: lines.filter((l) => !l.duplicate).reduce((s, l) => s + l.total, 0),
      skipped: lines.filter((l) => l.duplicate).length,
    };
  });
  // Closing forgets the sitting: the next opening starts from a fresh form and re-reads what
  // has been ordered, so a second order from the same page does not show the first one's receipt.
  const close = (next: boolean) => {
    if (!next) {
      setResult(null);
      setError(null);
      setFull(false);
      setState(null);
    }
    onOpenChange(next);
  };

  const feeTotal = view.reduce((s, p) => s + p.fee, 0);
  const goodsTotal = view.reduce((s, p) => s + p.goods, 0);
  const skipped = view.reduce((s, p) => s + p.skipped, 0);
  // Everything already charged and sent: say so instead of letting the server refuse.
  const nothingNew = state != null && feeTotal === 0 && view.every((p) => p.lines.every((l) => l.duplicate));
  const partLabel = (kind: CheckoutKind) => (kind === 'design' ? t.market.partDesign : t.market.partCalculator);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const id = await saveProject();
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, customer: { name: value.name, phone: value.phone, email: value.email || null, note: value.note || null } }),
      });
      const json = (await res.json()) as { data: CheckoutResult | null; error: string | null };
      if (!res.ok || !json.data) {
        setError(apiErrorMessage(t, json.error));
        return;
      }
      setResult(json.data);
      onOrdered?.();
    } catch (err) {
      setError((err as Error).message === 'save-failed' ? t.market.saveFirstError : apiErrorMessage(t, (err as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        {result ? (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <DialogTitle className="text-center">{t.market.successTitle}</DialogTitle>
              <DialogDescription className="text-center">{fill(t.market.successDesc, { id: result.checkoutId })}</DialogDescription>
            </DialogHeader>
            <div className="border border-line">
              {result.fees.map((f) => (
                <div key={f.kind} className="flex items-baseline justify-between border-b border-line px-4 py-2.5 text-sm">
                  <span className="text-ink-muted">
                    {t.market.feeRecorded} · {f.kind === 'design' ? t.market.feeDesign : t.market.feeCalculator}
                  </span>
                  <span className="font-semibold tabular-nums">{formatGEL(f.fee)}</span>
                </div>
              ))}
              {result.orders.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-muted">{t.market.noStoreOrders}</p>
              ) : (
                <ul>
                  {result.orders.map((o) => (
                    <li key={o.id} className="flex items-baseline justify-between gap-3 border-b border-line/70 px-4 py-2.5 text-sm last:border-b-0">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{localizedName(locale, { nameKa: o.storeNameKa, nameEn: o.storeNameEn, nameRu: o.storeNameRu })}</span>
                        <span className="text-xs text-ink-muted">
                          {fill(t.market.orderNo, { id: o.id })} · {fill(t.market.itemsCount, { n: o.itemCount })}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatGEL(o.subtotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {result.alreadyOrdered > 0 && <p className="text-xs text-ink-muted">{fill(t.market.alreadyOrderedLines, { n: result.alreadyOrdered })}</p>}
            {result.unassigned > 0 && <p className="text-xs text-warning">{fill(t.market.noPartnerItems, { n: result.unassigned })}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {session?.user ? (
                <Button asChild variant="ink">
                  <Link href="/profile">{t.market.viewOrders}</Link>
                </Button>
              ) : (
                <Button asChild variant="ink">
                  <Link href="/register">{t.nav.register}</Link>
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => close(false)}>
                {t.market.close}
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t.market.checkoutTitle}</DialogTitle>
              <DialogDescription>{t.market.checkoutDesc}</DialogDescription>
            </DialogHeader>

            {/* quick summary: one line per half */}
            <div className="border border-line text-sm">
              {view.map((part) => (
                <div key={part.kind} className="border-b border-line px-4 py-2.5 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink">{partLabel(part.kind)}</span>
                    <span className="shrink-0 tabular-nums">{formatGEL(part.goods + part.fee)}</span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
                    <span>
                      {t.market.platformFee}: {part.feePaid ? t.market.alreadyOrderedKind : `${formatGEL(part.fee)} · ${fill(t.market.platformFeeHint, { fee: formatGEL(part.feePerM2), m2: formatM2(part.totalM2) })}`}
                    </span>
                    <span>
                      {t.summary.products}: {formatGEL(part.goods)} · {fill(t.market.itemsCount, { n: part.lines.length - part.skipped })}
                    </span>
                  </p>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t-2 border-ink px-4 py-2.5">
                <span className="font-semibold text-ink">{t.market.totalWithFee}</span>
                <span className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(goodsTotal + feeTotal)}</span>
              </div>
            </div>

            {nothingNew ? (
              <p className="border border-line bg-bg-base px-3 py-2 text-sm text-ink-muted">{t.market.nothingToOrder}</p>
            ) : (
              skipped > 0 && <p className="text-xs text-ink-muted">{fill(t.market.alreadyOrderedLines, { n: skipped })}</p>
            )}

            <button type="button" onClick={() => setFull((f) => !f)} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink hover:text-brand">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', full && 'rotate-180')} />
              {full ? t.market.hideFull : t.market.showFull}
            </button>
            {full && (
              <div className="max-h-56 overflow-y-auto border border-line text-xs">
                {view.map((part) => (
                  <div key={part.kind}>
                    <p className="border-b border-line bg-bg-base px-3 py-1.5 font-semibold uppercase tracking-[0.12em] text-ink-muted">{partLabel(part.kind)}</p>
                    <ul className="divide-y divide-line/70">
                      {part.lines.length === 0 && <li className="px-3 py-2 text-ink-muted">—</li>}
                      {part.lines.map((line) => (
                        <li key={line.key} className={cn('flex items-baseline justify-between gap-3 px-3 py-1.5', line.duplicate && 'text-ink-faint line-through')}>
                          <span className="min-w-0 truncate">
                            {line.name}
                            {line.where && <span className="ml-1 text-ink-muted no-underline">· {line.where}</span>}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {line.qty !== 1 && <span className="mr-1 text-ink-muted">{formatNumber(line.qty)} ×</span>}
                            {formatGEL(line.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <CustomerFields value={value} onChange={setForm} />
            {error && <p className="border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
            <p className="text-xs text-ink-muted">{t.market.feeNote}</p>
            <Button type="submit" variant="ink" size="lg" className="w-full" disabled={submitting || nothingNew}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? t.market.submitting : t.market.submit}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
