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
import { commissionFor, platformFee, type PlatformSettings } from '@/lib/finance/money';
import { cn, formatDateTime, formatGEL } from '@/lib/utils';

/**
 * The platform's own prices. Four numbers, but the ones the whole business model hangs on,
 * so the form shows what they mean on a real flat before you save.
 */
export function SettingsForm({ initial }: { initial: PlatformSettings & { updatedAt: string | null } }) {
  const t = useT();
  const router = useRouter();
  const s = t.admin.settings;
  const [form, setForm] = useState({
    calculatorFeePerM2: String(initial.calculatorFeePerM2),
    designFeePerM2: String(initial.designFeePerM2),
    storeCommissionPct: String(initial.storeCommissionPct),
    workerCommissionPct: String(initial.workerCommissionPct),
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
          calculatorFeePerM2: num(form.calculatorFeePerM2),
          designFeePerM2: num(form.designFeePerM2),
          storeCommissionPct: num(form.storeCommissionPct),
          workerCommissionPct: num(form.workerCommissionPct),
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

  const example = fill(s.example, {
    calc: formatGEL(platformFee(75, num(form.calculatorFeePerM2))),
    design: formatGEL(platformFee(75, num(form.designFeePerM2))),
    store: formatGEL(commissionFor(10000, num(form.storeCommissionPct))),
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">{s.fees}</CardTitle>
            <p className="text-sm text-ink-muted">{s.feesHint}</p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{s.calculatorFee}</Label>
              <Input type="number" step="0.1" min={0} value={form.calculatorFeePerM2} onChange={(e) => update('calculatorFeePerM2', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{s.designFee}</Label>
              <Input type="number" step="0.1" min={0} value={form.designFeePerM2} onChange={(e) => update('designFeePerM2', e.target.value)} />
            </div>
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
