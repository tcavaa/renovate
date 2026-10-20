'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { commissionFor, withBankFee, type PlatformSettings } from '@/lib/finance/money';
import { cn, formatDateTime, formatGEL, formatNumber } from '@/lib/utils';

/**
 * The platform's own prices — the plans' (docs/subscriptions.md), the commissions, what adding
 * an own item and a render cost, and the bank's commission every card payment shows — the
 * numbers the business model hangs on, so the form shows what they mean before you save.
 */
export function SettingsForm({ initial, stores }: { initial: PlatformSettings & { materialsStoreId: number | null; updatedAt: string | null }; stores: Array<{ id: number; name: string }> }) {
  const t = useT();
  const router = useRouter();
  const s = t.admin.settings;
  const [form, setForm] = useState({
    premiumMonthPrice: String(initial.premiumMonthPrice),
    premiumYearPrice: String(initial.premiumYearPrice),
    professionalMonthPrice: String(initial.professionalMonthPrice),
    professionalYearPrice: String(initial.professionalYearPrice),
    renderPrice: String(initial.renderPrice),
    storeCommissionPct: String(initial.storeCommissionPct),
    workerCommissionPct: String(initial.workerCommissionPct),
    ownItemPrice: String(initial.ownItemPrice),
    bankFeePct: String(initial.bankFeePct),
    materialsStoreId: initial.materialsStoreId != null ? String(initial.materialsStoreId) : '',
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const num = (v: string) => (v === '' ? 0 : Number(v) || 0);
  const update = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          premiumMonthPrice: num(form.premiumMonthPrice),
          premiumYearPrice: num(form.premiumYearPrice),
          professionalMonthPrice: num(form.professionalMonthPrice),
          professionalYearPrice: num(form.professionalYearPrice),
          renderPrice: num(form.renderPrice),
          storeCommissionPct: num(form.storeCommissionPct),
          workerCommissionPct: num(form.workerCommissionPct),
          ownItemPrice: num(form.ownItemPrice),
          bankFeePct: num(form.bankFeePct),
          materialsStoreId: form.materialsStoreId ? Number(form.materialsStoreId) : null,
        }),
      });
      const json = (await res.json()) as { error: string | null };
      if (!res.ok) {
        setNotice({ ok: false, text: apiErrorMessage(t, json.error) });
        return;
      }
      setNotice({ ok: true, text: s.saved });
      router.refresh();
    } catch {
      setNotice({ ok: false, text: s.saveError });
    } finally {
      setSaving(false);
    }
  };

  const example = fill(s.commissionExample, { store: formatGEL(commissionFor(10000, num(form.storeCommissionPct))) });

  // A month of Professional, as the person pays it by card.
  const planCharge = withBankFee(num(form.professionalMonthPrice), num(form.bankFeePct));
  const ownCharge = withBankFee(num(form.ownItemPrice), num(form.bankFeePct));
  const renderCharge = withBankFee(num(form.renderPrice), num(form.bankFeePct));
  const paymentsExample = fill(s.paymentsExample, {
    fee: formatGEL(planCharge.amount, true),
    bank: formatGEL(planCharge.bankFee, true),
    total: formatGEL(planCharge.total, true),
    own: ownCharge.amount > 0 ? formatGEL(ownCharge.total, true) : s.ownItemFree,
    render: renderCharge.amount > 0 ? formatGEL(renderCharge.total, true) : s.ownItemFree,
  });
  const yearSaving = (month: string, year: string) => (num(month) > 0 ? Math.round((1 - num(year) / (num(month) * 12)) * 100) : 0);
  const planField = (id: keyof typeof form, label: string) => (
    <div className="space-y-2">
      <Label htmlFor={`plan-${id}`}>{label}</Label>
      <Input id={`plan-${id}`} type="number" step="0.5" min={1} value={form[id]} onChange={(e) => update(id, e.target.value)} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">{s.plansTitle}</CardTitle>
            <p className="text-sm text-ink-muted">{s.plansHint}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {planField('premiumMonthPrice', s.premiumMonth)}
              {planField('premiumYearPrice', s.premiumYear)}
              {planField('professionalMonthPrice', s.professionalMonth)}
              {planField('professionalYearPrice', s.professionalYear)}
            </div>
            <p className="text-xs text-ink-muted">
              {fill(s.yearSaving, { premium: yearSaving(form.premiumMonthPrice, form.premiumYearPrice), professional: yearSaving(form.professionalMonthPrice, form.professionalYearPrice) })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">{s.commissions}</CardTitle>
            <p className="text-sm text-ink-muted">{s.commissionsHint}</p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{s.storeCommission}</Label>
              <Input type="number" step="0.1" min={0} max={100} value={form.storeCommissionPct} onChange={(e) => update('storeCommissionPct', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{s.workerCommission}</Label>
              <Input type="number" step="0.1" min={0} max={100} value={form.workerCommissionPct} onChange={(e) => update('workerCommissionPct', e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="border-l-2 border-ink pl-4 text-sm text-ink-soft">{example}</p>

      {/* Card payments: what an own item and a render cost, and the bank's cut every payment shows. */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{s.payments}</CardTitle>
          <p className="text-sm text-ink-muted">{s.paymentsHint}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="own-item-price">{s.ownItemPrice}</Label>
              <Input id="own-item-price" type="number" step="0.5" min={0} value={form.ownItemPrice} onChange={(e) => update('ownItemPrice', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="render-price">{s.renderPrice}</Label>
              <Input id="render-price" type="number" step="0.5" min={0} value={form.renderPrice} onChange={(e) => update('renderPrice', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank-fee-pct">{s.bankFeePct}</Label>
              <Input id="bank-fee-pct" type="number" step="0.1" min={0} max={20} value={form.bankFeePct} onChange={(e) => update('bankFeePct', e.target.value)} />
            </div>
          </div>
          <p className="border-l-2 border-ink pl-4 text-sm text-ink-soft">
            {paymentsExample} <span className="text-ink-muted">({fill(s.bankFeeShown, { pct: `${formatNumber(num(form.bankFeePct))}%` })})</span>
          </p>
        </CardContent>
      </Card>

      {/* Who is sent the rate book's construction materials with every order. */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{t.orderReview.supplierTitle}</CardTitle>
          <p className="text-sm text-ink-muted">{t.orderReview.supplierHint}</p>
        </CardHeader>
        <CardContent>
          <select value={form.materialsStoreId} onChange={(e) => update('materialsStoreId', e.target.value)} aria-label={t.orderReview.supplierTitle} className="h-10 w-full max-w-md border border-line bg-white px-3 text-sm text-ink focus:border-ink focus:outline-none">
            <option value="">{t.orderReview.supplierNone}</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted" suppressHydrationWarning>
          {s.updatedAt}: {initial.updatedAt ? formatDateTime(initial.updatedAt) : s.never}
        </p>
        <div className="flex items-center gap-3">
          {notice && (
            <p role="status" className={cn('text-sm', notice.ok ? 'text-success' : 'text-danger')}>
              {notice.text}
            </p>
          )}
          <Button type="submit" variant="ink" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {s.save}
          </Button>
        </div>
      </div>
    </form>
  );
}
