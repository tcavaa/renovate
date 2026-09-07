'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomerFields, type CustomerForm } from '@/components/checkout/CustomerFields';
import { useLocale, useT } from '@/lib/i18n/client';
import { apiErrorMessage, localizedName } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import type { CheckoutResult } from '@/lib/finance/orders';
import { formatGEL, formatM2 } from '@/lib/utils';

/**
 * The step that turns an estimate into business: the customer leaves their contact, the
 * project is saved (by the caller, so each summary saves in its own shape), and the platform
 * writes the fee and one order per store. Guests are welcome — the whole point is that a
 * calculation should be orderable without an account. Nothing is paid here; the fee is shown.
 */
export function CheckoutDialog({
  open,
  onOpenChange,
  saveProject,
  fee,
  totalM2,
  feePerM2,
  goodsTotal,
  storeCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves (or reuses) the project and returns its id; throws on failure. */
  saveProject: () => Promise<number>;
  fee: number;
  totalM2: number;
  feePerM2: number;
  goodsTotal: number;
  storeCount: number | null;
}) {
  const t = useT();
  const locale = useLocale();
  const { data: session } = useSession();
  const [form, setForm] = useState<CustomerForm | null>(null);
  // Until the customer types, the form shows what the session knows — no effect needed.
  const value: CustomerForm = form ?? { name: session?.user?.name ?? '', phone: '', email: session?.user?.email ?? '', note: '' };
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const projectId = await saveProject();
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, customer: { name: value.name, phone: value.phone, email: value.email || null, note: value.note || null } }),
      });
      const json = (await res.json()) as { data: CheckoutResult | null; error: string | null };
      if (!res.ok || !json.data) {
        setError(apiErrorMessage(t, json.error));
        return;
      }
      setResult(json.data);
    } catch (err) {
      setError((err as Error).message === 'save-failed' ? t.market.saveFirstError : apiErrorMessage(t, (err as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5 text-sm">
                <span className="text-ink-muted">{t.market.feeRecorded}</span>
                <span className="font-semibold tabular-nums">{formatGEL(result.platformFee)}</span>
              </div>
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
            <div className="grid grid-cols-2 border border-line text-sm">
              <div className="border-r border-line p-3">
                <p className="eyebrow">{t.market.platformFee}</p>
                <p className="mt-1 font-serif text-xl font-semibold tabular-nums text-ink">{formatGEL(fee)}</p>
                <p className="text-xs text-ink-muted">{fill(t.market.platformFeeHint, { fee: formatGEL(feePerM2), m2: formatM2(totalM2) })}</p>
              </div>
              <div className="p-3">
                <p className="eyebrow">{t.summary.products}</p>
                <p className="mt-1 font-serif text-xl font-semibold tabular-nums text-ink">{formatGEL(goodsTotal)}</p>
                {storeCount != null && <p className="text-xs text-ink-muted">{fill(t.market.storesToOrder, { n: storeCount })}</p>}
              </div>
            </div>
            <CustomerFields value={value} onChange={setForm} />
            {error && <p className="border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
            <p className="text-xs text-ink-muted">{t.market.feeNote}</p>
            <Button type="submit" variant="ink" size="lg" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? t.market.submitting : t.market.submit}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
