'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Crown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fill } from '@/lib/admin/list';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import type { PlanId } from '@/lib/plans/plans';
import { cn, formatDateTime } from '@/lib/utils';

/**
 * A person's plan on their admin page (docs/subscriptions.md): what they are on and until when,
 * a grant of Premium or Professional for so many months at no charge, and ending every
 * subscription now — support's tools, and a way to test the locks on any account.
 */
export function PlanGrantCard({ userId, plan, paidUntil, staff }: { userId: number; plan: PlanId; paidUntil: string | null; staff: boolean }) {
  const t = useT();
  const p = t.plans;
  const router = useRouter();
  const [grant, setGrant] = useState<'premium' | 'professional'>('premium');
  const [months, setMonths] = useState('1');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const name = (id: PlanId) => (id === 'premium' ? p.premium : id === 'professional' ? p.professional : p.free);

  const send = async (body: object) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/users/${userId}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json()) as { error: string | null };
      if (!res.ok) setNotice({ ok: false, text: apiErrorMessage(t, json.error) });
      else {
        setNotice({ ok: true, text: t.admin.settings.saved });
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t.admin.settings.saveError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif">
          <Crown className="h-5 w-5 text-accent" />
          {p.adminTitle}
        </CardTitle>
        <p className="text-sm text-ink-muted">
          {staff ? p.staffNote : paidUntil ? `${name(plan)} · ${fill(p.activeUntil, { date: formatDateTime(paidUntil, false) })}` : `${name(plan)} · ${p.planFreeDesc}`}
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="grant-plan">{p.adminGrantPlan}</Label>
          <select id="grant-plan" value={grant} onChange={(e) => setGrant(e.target.value as 'premium' | 'professional')} className="h-10 border border-line bg-white px-3 text-sm text-ink focus:border-ink focus:outline-none">
            <option value="premium">{p.premium}</option>
            <option value="professional">{p.professional}</option>
          </select>
        </div>
        <div className="w-28 space-y-2">
          <Label htmlFor="grant-months">{p.adminGrantMonths}</Label>
          <Input id="grant-months" type="number" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} />
        </div>
        <Button type="button" variant="ink" disabled={busy || !(Number(months) >= 1)} onClick={() => void send({ plan: grant, months: Math.min(36, Math.max(1, Math.round(Number(months)))) })}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {p.adminGrant}
        </Button>
        {paidUntil && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void send({ plan: 'free' })}>
            {p.adminEnd}
          </Button>
        )}
        {notice && <p role="status" className={cn('w-full text-sm', notice.ok ? 'text-success' : 'text-danger')}>{notice.text}</p>}
      </CardContent>
    </Card>
  );
}
