'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';

export interface TeamSelfValue {
  id: number;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  descriptionKa: string | null;
  descriptionEn: string | null;
  descriptionRu: string | null;
  leadName: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  city: string | null;
  experienceYears: number | null;
  capacityJobs: number | null;
}

/**
 * A brigade's own company details, edited from its portal: the name in three languages, the
 * words about it, the foreman and how to reach them, the logo, the city, the experience and how
 * many sites it can run at once (what makes it "busy" to customers). `PUT /api/teams/[id]`
 * takes exactly these from the brigade's own account (`teamSelfSchema`).
 */
export function TeamSelfForm({ team }: { team: TeamSelfValue }) {
  const t = useT();
  const p = t.teamPortal;
  const router = useRouter();
  const [form, setForm] = useState(team);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const update = <K extends keyof TeamSelfValue>(key: K, value: TeamSelfValue[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof TeamSelfValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, (e.target.value || null) as never);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    const { id, ...body } = form;
    try {
      const res = await fetch(`/api/teams/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, nameKa: form.nameKa.trim(), email: form.email ?? '' }) });
      const json = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
      if (!res.ok) {
        setNotice({ ok: false, text: apiErrorMessage(t, json.error) });
        return;
      }
      setNotice({ ok: true, text: t.partner.saved });
      router.refresh();
    } catch {
      setNotice({ ok: false, text: t.partner.saveError });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5 border border-line bg-bg-surface p-5">
      <p className="eyebrow">{p.companyTitle}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={p.nameKa} id="team-name-ka">
          <Input id="team-name-ka" required minLength={2} value={form.nameKa} onChange={(e) => update('nameKa', e.target.value)} />
        </Field>
        <Field label={p.nameEn} id="team-name-en">
          <Input id="team-name-en" value={form.nameEn ?? ''} onChange={text('nameEn')} />
        </Field>
        <Field label={p.nameRu} id="team-name-ru">
          <Input id="team-name-ru" value={form.nameRu ?? ''} onChange={text('nameRu')} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={p.descriptionKa} id="team-desc-ka">
          <Textarea id="team-desc-ka" rows={4} value={form.descriptionKa ?? ''} onChange={text('descriptionKa')} />
        </Field>
        <Field label={p.descriptionEn} id="team-desc-en">
          <Textarea id="team-desc-en" rows={4} value={form.descriptionEn ?? ''} onChange={text('descriptionEn')} />
        </Field>
        <Field label={p.descriptionRu} id="team-desc-ru">
          <Textarea id="team-desc-ru" rows={4} value={form.descriptionRu ?? ''} onChange={text('descriptionRu')} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={p.leadName} id="team-lead">
          <Input id="team-lead" value={form.leadName ?? ''} onChange={text('leadName')} />
        </Field>
        <Field label={p.phone} id="team-phone">
          <Input id="team-phone" type="tel" value={form.phone ?? ''} onChange={text('phone')} />
        </Field>
        <Field label={p.email} id="team-email" hint={p.emailHint}>
          <Input id="team-email" type="email" value={form.email ?? ''} onChange={text('email')} />
        </Field>
        <Field label={p.city} id="team-city">
          <Input id="team-city" value={form.city ?? ''} onChange={text('city')} />
        </Field>
        <Field label={p.experienceYears} id="team-experience">
          <Input id="team-experience" type="number" min={0} max={80} value={form.experienceYears ?? ''} onChange={(e) => update('experienceYears', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
        <Field label={p.capacity} id="team-capacity" hint={p.capacityHint}>
          <Input id="team-capacity" type="number" min={1} max={100} value={form.capacityJobs ?? ''} onChange={(e) => update('capacityJobs', e.target.value === '' ? null : Math.max(1, Number(e.target.value)))} />
        </Field>
      </div>
      <div className="max-w-md space-y-2">
        <Label>{p.logo}</Label>
        <ImageUploader value={form.logoUrl ?? ''} onChange={(url) => update('logoUrl', url || null)} folder="misc" />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {notice && <p className={cn('mr-auto text-sm', notice.ok ? 'text-success' : 'text-danger')}>{notice.text}</p>}
        <Button type="submit" variant="ink" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {p.save}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
