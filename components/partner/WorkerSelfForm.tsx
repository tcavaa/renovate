'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { KNOWN_SPECIALTIES, WorkerServiceFields, workerServicePayload, type WorkerServiceForm } from '@/components/partner/WorkerServiceFields';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage, workerSpecialtyLabel } from '@/lib/i18n/labels';
import type { Worker } from '@/lib/db/schema';

/**
 * A worker's own card in the partner portal: the service and price they registered with,
 * plus name, contact, photo and bio. The same fields as registration, saved through the
 * worker's own route — rating, verification and commission are admin's.
 */
export function WorkerSelfForm({ worker }: { worker: Worker }) {
  const router = useRouter();
  const t = useT();
  const known = (KNOWN_SPECIALTIES as readonly string[]).includes(worker.specialtySlug);
  const [service, setService] = useState<WorkerServiceForm>({
    specialtySlug: known ? worker.specialtySlug : '',
    specialtyCustom: known ? '' : worker.specialty,
    priceUnit: worker.priceUnit,
    pricePerM2: worker.pricePerM2 ? String(worker.pricePerM2) : '',
    pricePerUnit: worker.pricePerUnit ? String(worker.pricePerUnit) : '',
    phone: worker.phone ?? '',
    city: worker.city ?? '',
    experienceYears: worker.experienceYears != null ? String(worker.experienceYears) : '',
    bio: worker.bio ?? '',
  });
  const [names, setNames] = useState({ nameKa: worker.nameKa, nameEn: worker.nameEn ?? '', nameRu: worker.nameRu ?? '', bioEn: worker.bioEn ?? '', bioRu: worker.bioRu ?? '', email: worker.email ?? '', avatarUrl: worker.avatarUrl ?? '' });
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('saving');
    setError(null);
    const res = await fetch(`/api/workers/${worker.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...names, ...workerServicePayload(service, (slug) => workerSpecialtyLabel(t, slug)) }),
    });
    const json = await res.json();
    if (!res.ok) {
      setState('error');
      setError(apiErrorMessage(t, json.error));
      return;
    }
    setState('saved');
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-6 border border-line bg-bg-surface p-5 md:p-6">
      <div>
        <p className="eyebrow">{t.partner.editProfile}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="eyebrow">{t.auth.workerName}</Label>
          <Input required minLength={2} value={names.nameKa} onChange={(e) => setNames((n) => ({ ...n, nameKa: e.target.value }))} className="h-12" />
        </div>
        <div className="space-y-1.5">
          <Label className="eyebrow">{t.admin.forms.nameEn}</Label>
          <Input value={names.nameEn} onChange={(e) => setNames((n) => ({ ...n, nameEn: e.target.value }))} className="h-12" />
        </div>
        <div className="space-y-1.5">
          <Label className="eyebrow">{t.admin.forms.nameRu}</Label>
          <Input value={names.nameRu} onChange={(e) => setNames((n) => ({ ...n, nameRu: e.target.value }))} className="h-12" />
        </div>
        <div className="space-y-1.5">
          <Label className="eyebrow">{t.admin.forms.email}</Label>
          <Input type="email" value={names.email} onChange={(e) => setNames((n) => ({ ...n, email: e.target.value }))} className="h-12" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="eyebrow">{t.admin.forms.photo}</Label>
          <ImageUploader value={names.avatarUrl} onChange={(url) => setNames((n) => ({ ...n, avatarUrl: url }))} folder="workers" helperText={t.admin.forms.photoHelperWorker} />
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <WorkerServiceFields value={service} onChange={setService} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="eyebrow">{t.admin.forms.bioEn}</Label>
          <Textarea rows={2} value={names.bioEn} onChange={(e) => setNames((n) => ({ ...n, bioEn: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="eyebrow">{t.admin.forms.bioRu}</Label>
          <Textarea rows={2} value={names.bioRu} onChange={(e) => setNames((n) => ({ ...n, bioRu: e.target.value }))} />
        </div>
      </div>

      {error && <p className="border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {state === 'saved' && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="h-4 w-4" />
            {t.partner.saved}
          </span>
        )}
        <Button type="submit" variant="ink" disabled={state === 'saving'}>
          {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t.partner.save}
        </Button>
      </div>
    </form>
  );
}
