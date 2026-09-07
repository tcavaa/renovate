'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import type { Worker } from '@/lib/db/schema';

interface Props {
  worker?: Worker;
}

export function WorkerForm({ worker }: Props) {
  const router = useRouter();
  const ka = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nameKa: worker?.nameKa ?? '',
    nameEn: worker?.nameEn ?? '',
    nameRu: worker?.nameRu ?? '',
    bioEn: worker?.bioEn ?? '',
    bioRu: worker?.bioRu ?? '',
    specialty: worker?.specialty ?? '',
    specialtySlug: worker?.specialtySlug ?? '',
    phone: worker?.phone ?? '',
    pricePerM2: worker?.pricePerM2 ? String(worker.pricePerM2) : '',
    pricePerUnit: worker?.pricePerUnit ? String(worker.pricePerUnit) : '',
    priceUnit: (worker?.priceUnit ?? 'm2') as 'm2' | 'unit' | 'fixed',
    rating: worker?.rating ? String(worker.rating) : '5.00',
    reviewCount: worker?.reviewCount ?? 0,
    bio: worker?.bio ?? '',
    avatarUrl: worker?.avatarUrl ?? '',
    city: worker?.city ?? '',
    experienceYears: worker?.experienceYears != null ? String(worker.experienceYears) : '',
    completedJobs: worker?.completedJobs != null ? String(worker.completedJobs) : '0',
    isVerified: worker?.isVerified ?? false,
    isActive: worker?.isActive ?? true,
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload = {
      ...form,
      pricePerM2: form.pricePerM2 ? Number(form.pricePerM2) : null,
      pricePerUnit: form.pricePerUnit ? Number(form.pricePerUnit) : null,
      rating: form.rating ? Number(form.rating) : 5,
      reviewCount: Number(form.reviewCount) || 0,
      city: form.city || null,
      experienceYears: form.experienceYears ? Number(form.experienceYears) : null,
      completedJobs: Number(form.completedJobs) || 0,
    };
    const url = worker ? `/api/workers/${worker.id}` : '/api/workers';
    const method = worker ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(ka, json.error));
      return;
    }
    router.push('/admin/workers');
    router.refresh();
  };

  const remove = async () => {
    if (!worker) return;
    if (!confirm(ka.admin.forms.confirms.deleteWorker)) return;
    setLoading(true);
    await fetch(`/api/workers/${worker.id}`, { method: 'DELETE' });
    setLoading(false);
    router.push('/admin/workers');
    router.refresh();
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>{ka.admin.table.name}</Label>
              <Input
                required
                value={form.nameKa}
                onChange={(e) => update('nameKa', e.target.value)}
              />
            </div>
            <fieldset className="space-y-3 rounded-md border border-line p-4 md:col-span-2">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{ka.admin.forms.translations}</legend>
              <p className="text-xs text-ink-muted">{ka.admin.forms.translationsHint}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>{ka.admin.forms.nameEn}</Label>
                  <Input value={form.nameEn} onChange={(e) => update('nameEn', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{ka.admin.forms.nameRu}</Label>
                  <Input value={form.nameRu} onChange={(e) => update('nameRu', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{ka.admin.forms.bioEn}</Label>
                  <Textarea rows={2} value={form.bioEn ?? ''} onChange={(e) => update('bioEn', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{ka.admin.forms.bioRu}</Label>
                  <Textarea rows={2} value={form.bioRu ?? ''} onChange={(e) => update('bioRu', e.target.value)} />
                </div>
              </div>
            </fieldset>
            <div className="space-y-2">
              <Label>{ka.admin.forms.specialty}</Label>
              <Input
                required
                value={form.specialty}
                onChange={(e) => update('specialty', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.specialtySlug}</Label>
              <Input
                required
                placeholder="tiling, painting, plumbing..."
                value={form.specialtySlug}
                onChange={(e) => update('specialtySlug', e.target.value.toLowerCase())}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.phone}</Label>
              <Input
                placeholder="+995..."
                value={form.phone ?? ''}
                onChange={(e) => update('phone', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.city}</Label>
              <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.experienceYears}</Label>
              <Input type="number" min={0} max={80} value={form.experienceYears} onChange={(e) => update('experienceYears', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.completedJobs}</Label>
              <Input type="number" min={0} value={form.completedJobs} onChange={(e) => update('completedJobs', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.priceUnit}</Label>
              <Select
                value={form.priceUnit}
                onValueChange={(v) => update('priceUnit', v as typeof form.priceUnit)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="m2">{ka.admin.forms.priceUnits.m2}</SelectItem>
                  <SelectItem value="unit">{ka.admin.forms.priceUnits.unit}</SelectItem>
                  <SelectItem value="fixed">{ka.admin.forms.priceUnits.fixed}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.pricePerM2}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.pricePerM2}
                onChange={(e) => update('pricePerM2', e.target.value)}
                disabled={form.priceUnit !== 'm2'}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.pricePerPiece}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.pricePerUnit}
                onChange={(e) => update('pricePerUnit', e.target.value)}
                disabled={form.priceUnit !== 'unit'}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.ratingField}</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={form.rating}
                onChange={(e) => update('rating', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.reviewCount}</Label>
              <Input
                type="number"
                min="0"
                value={form.reviewCount}
                onChange={(e) => update('reviewCount', Number(e.target.value))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{ka.admin.forms.photo}</Label>
              <ImageUploader
                value={form.avatarUrl ?? ''}
                onChange={(url) => update('avatarUrl', url)}
                folder="workers"
                helperText={ka.admin.forms.photoHelperWorker}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{ka.admin.forms.bio}</Label>
              <Textarea
                rows={4}
                value={form.bio ?? ''}
                onChange={(e) => update('bio', e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => update('isActive', e.target.checked)}
              />
              {ka.admin.forms.active}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isVerified}
                onChange={(e) => update('isVerified', e.target.checked)}
              />
              {ka.admin.forms.verified}
            </label>
          </div>

          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-between">
            <div>
              {worker && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={remove}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" /> {ka.admin.actions.delete}
                </Button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {ka.admin.actions.save}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
