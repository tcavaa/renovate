'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import type { Store } from '@/lib/db/schema';

export function StoreForm({ store }: { store?: Store }) {
  const router = useRouter();
  const ka = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    nameKa: store?.nameKa ?? '',
    nameEn: store?.nameEn ?? '',
    nameRu: store?.nameRu ?? '',
    descriptionKa: store?.descriptionKa ?? '',
    descriptionEn: store?.descriptionEn ?? '',
    descriptionRu: store?.descriptionRu ?? '',
    logoUrl: store?.logoUrl ?? '',
    websiteUrl: store?.websiteUrl ?? '',
    phone: store?.phone ?? '',
    email: store?.email ?? '',
    address: store?.address ?? '',
    city: store?.city ?? '',
    rating: store?.rating != null ? String(store.rating) : '4.50',
    reviewCount: store?.reviewCount != null ? String(store.reviewCount) : '0',
    deliveryDays: store?.deliveryDays != null ? String(store.deliveryDays) : '3',
    deliveryFeeGel: store?.deliveryFeeGel != null ? String(store.deliveryFeeGel) : '0',
    commissionRate: store?.commissionRate != null ? String(store.commissionRate) : '5',
    isActive: store?.isActive ?? true,
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(store ? `/api/stores/${store.id}` : '/api/stores', {
      method: store ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(apiErrorMessage(ka, json.error));
      return;
    }
    router.push('/admin/stores');
    router.refresh();
  };

  const remove = async () => {
    if (!store) return;
    if (!confirm(ka.admin.forms.confirms.deleteStore)) return;
    setLoading(true);
    const res = await fetch(`/api/stores/${store.id}`, { method: 'DELETE' });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(ka, json.error));
      return;
    }
    router.push('/admin/stores');
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
                  <Label>{ka.admin.forms.descriptionEn}</Label>
                  <Textarea rows={2} value={form.descriptionEn ?? ''} onChange={(e) => update('descriptionEn', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{ka.admin.forms.descriptionRu}</Label>
                  <Textarea rows={2} value={form.descriptionRu ?? ''} onChange={(e) => update('descriptionRu', e.target.value)} />
                </div>
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label>{ka.admin.forms.website}</Label>
              <Input
                type="url"
                placeholder="https://example.ge"
                value={form.websiteUrl}
                onChange={(e) => update('websiteUrl', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.phone}</Label>
              <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.email}</Label>
              <Input type="email" placeholder="orders@store.ge" value={form.email} onChange={(e) => update('email', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{ka.admin.forms.city}</Label>
              <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.address}</Label>
              <Input value={form.address} onChange={(e) => update('address', e.target.value)} />
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
                onChange={(e) => update('reviewCount', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{ka.admin.forms.deliveryDays}</Label>
              <Input
                type="number"
                min="0"
                value={form.deliveryDays}
                onChange={(e) => update('deliveryDays', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.deliveryFee}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.deliveryFeeGel}
                onChange={(e) => update('deliveryFeeGel', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{ka.admin.forms.commission}</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.commissionRate}
                onChange={(e) => update('commissionRate', e.target.value)}
              />
              <p className="text-xs text-ink-muted">{ka.admin.forms.commissionHint}</p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>{ka.admin.forms.logo}</Label>
              <ImageUploader
                value={form.logoUrl}
                onChange={(url) => update('logoUrl', url)}
                folder="misc"
                helperText={ka.admin.forms.logoHelper}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>{ka.admin.forms.description}</Label>
              <Textarea
                rows={3}
                value={form.descriptionKa}
                onChange={(e) => update('descriptionKa', e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => update('isActive', e.target.checked)}
            />
            {ka.admin.forms.active}
          </label>

          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-between">
            <div>
              {store && (
                <Button type="button" variant="destructive" onClick={remove} disabled={loading}>
                  <Trash2 className="h-4 w-4" /> {ka.admin.actions.delete}
                </Button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {ka.admin.actions.save}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
