'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Save, Trash2, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage, workerSpecialtyLabel } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';

export interface TeamFormValue {
  id?: number;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  slug: string;
  descriptionKa: string | null;
  leadName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  experienceYears: number | null;
  completedJobs: number | null;
  markupPct: number | null;
  commissionRate: number | null;
  capacityJobs: number | null;
  isVerified: boolean;
  isActive: boolean;
  memberIds: number[];
  leadWorkerId: number | null;
}

export interface WorkerOption {
  id: number;
  nameKa: string;
  specialtySlug: string;
  city: string | null;
}

/**
 * A brigade: who it is, who answers the phone, and — the part that matters — which workers
 * are in it. The trades it covers are not typed in; they are read off the members, so a
 * brigade cannot claim a trade it has nobody for.
 */
export function TeamForm({ team, workers }: { team: TeamFormValue; workers: WorkerOption[] }) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState<TeamFormValue>(team);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof TeamFormValue>(key: K, value: TeamFormValue[K]) => setForm((f) => ({ ...f, [key]: value }));

  const toggleMember = (id: number) =>
    setForm((f) => {
      const memberIds = f.memberIds.includes(id) ? f.memberIds.filter((m) => m !== id) : [...f.memberIds, id];
      return { ...f, memberIds, leadWorkerId: memberIds.includes(f.leadWorkerId ?? -1) ? f.leadWorkerId : (memberIds[0] ?? null) };
    });

  const trades = [...new Set(form.memberIds.map((id) => workers.find((w) => w.id === id)?.specialtySlug).filter(Boolean) as string[])];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(team.id ? `/api/teams/${team.id}` : '/api/teams', {
        method: team.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { data: { id: number } | null; error: string | null };
      if (!res.ok || !json.data) {
        setError(apiErrorMessage(t, json.error));
        return;
      }
      router.push('/admin/teams');
      router.refresh();
    } catch {
      setError(apiErrorMessage(t, null));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!team.id || !confirm(t.admin.actions.delete)) return;
    await fetch(`/api/teams/${team.id}`, { method: 'DELETE' });
    router.push('/admin/teams');
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{t.admin.teams}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <Label>{t.admin.table.name}</Label>
            <Input value={form.nameKa} onChange={(e) => update('nameKa', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <Label>{t.teams.lead}</Label>
            <Input value={form.leadName ?? ''} onChange={(e) => update('leadName', e.target.value || null)} />
          </label>
          <label className="space-y-1.5">
            <Label>{t.teams.phoneLabel}</Label>
            <Input value={form.phone ?? ''} onChange={(e) => update('phone', e.target.value || null)} />
          </label>
          <label className="space-y-1.5">
            <Label>{t.teams.emailLabel}</Label>
            <Input type="email" value={form.email ?? ''} onChange={(e) => update('email', e.target.value || null)} />
          </label>
          <label className="space-y-1.5">
            <Label>{t.workers.city}</Label>
            <Input value={form.city ?? ''} onChange={(e) => update('city', e.target.value || null)} />
          </label>
          <label className="space-y-1.5">
            <Label>{t.workers.experienceLabel}</Label>
            <Input type="number" min={0} value={form.experienceYears ?? ''} onChange={(e) => update('experienceYears', e.target.value ? Number(e.target.value) : null)} />
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <Label>{t.admin.forms.description}</Label>
            <Textarea rows={3} value={form.descriptionKa ?? ''} onChange={(e) => update('descriptionKa', e.target.value || null)} />
          </label>
          <label className="space-y-1.5">
            <Label>{t.teams.markupLabel}</Label>
            <Input type="number" min={0} max={100} step={0.5} value={form.markupPct ?? ''} onChange={(e) => update('markupPct', e.target.value ? Number(e.target.value) : null)} />
          </label>
          <label className="space-y-1.5">
            <Label>{t.teams.commissionLabel}</Label>
            <Input type="number" min={0} max={100} step={0.5} value={form.commissionRate ?? ''} onChange={(e) => update('commissionRate', e.target.value ? Number(e.target.value) : null)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isVerified} onChange={(e) => update('isVerified', e.target.checked)} className="accent-ink" />
            {t.workers.verified}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => update('isActive', e.target.checked)} className="accent-ink" />
            {t.admin.badges.active}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif">
            <UsersRound className="h-4 w-4" />
            {t.teams.membersTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-muted">{t.teams.membersHint}</p>
          <p className="text-xs text-ink-muted">
            {t.teams.coversTitle}: {trades.length > 0 ? trades.map((s) => workerSpecialtyLabel(t, s)).join(', ') : '—'}
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {workers.map((w) => {
              const on = form.memberIds.includes(w.id);
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => toggleMember(w.id)}
                    className={cn('flex w-full items-center justify-between gap-2 border px-3 py-2 text-left text-sm', on ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{w.nameKa}</span>
                      <span className={cn('block truncate text-[11px]', on ? 'text-white/70' : 'text-ink-muted')}>{workerSpecialtyLabel(t, w.specialtySlug)}</span>
                    </span>
                    {on && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          update('leadWorkerId', w.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            update('leadWorkerId', w.id);
                          }
                        }}
                        className={cn('shrink-0 border px-1.5 py-0.5 text-[10px] uppercase tracking-wide', form.leadWorkerId === w.id ? 'border-white bg-white text-ink' : 'border-white/40 text-white/70')}
                      >
                        {t.teams.lead}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {workers.length === 0 && <p className="text-sm text-ink-muted">{t.admin.workersEmpty}</p>}
        </CardContent>
      </Card>

      {error && <p className="border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        {team.id ? (
          <Button type="button" variant="outline" onClick={remove} className="text-danger">
            <Trash2 className="h-4 w-4" />
            {t.common.delete}
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" variant="ink" onClick={save} disabled={saving || !form.nameKa.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t.common.save}
        </Button>
      </div>
    </div>
  );
}
