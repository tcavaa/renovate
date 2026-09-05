'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import type { Category } from '@/lib/db/schema';

const CALCULATION_TYPE_KEYS = [
  'per_m2_floor',
  'per_m2_wall',
  'per_m2_ceiling',
  'per_linear_m',
  'per_unit',
  'per_room',
  'fixed',
] as const;

interface Props {
  category?: Category;
}

export function CategoryForm({ category }: Props) {
  const router = useRouter();
  const ka = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nameKa: category?.nameKa ?? '',
    nameEn: category?.nameEn ?? '',
    slug: category?.slug ?? '',
    icon: category?.icon ?? '',
    phase: category?.phase ?? 1,
    calculationType:
      (category?.calculationType ?? 'per_unit') as
        | 'per_m2_floor'
        | 'per_m2_wall'
        | 'per_m2_ceiling'
        | 'per_linear_m'
        | 'per_unit'
        | 'per_room'
        | 'fixed',
    isVisible: category?.isVisible ?? true,
    isFurniture: category?.isFurniture ?? false,
    sortOrder: category?.sortOrder ?? 0,
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload = {
      ...form,
      phase: Number(form.phase),
      sortOrder: Number(form.sortOrder),
    };
    const url = category ? `/api/categories/${category.id}` : '/api/categories';
    const method = category ? 'PUT' : 'POST';
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
    router.push('/admin/categories');
    router.refresh();
  };

  const remove = async () => {
    if (!category) return;
    if (!confirm(ka.admin.forms.confirms.deleteCategory)) return;
    setLoading(true);
    const res = await fetch(`/api/categories/${category.id}`, { method: 'DELETE' });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(ka, json.error));
      return;
    }
    router.push('/admin/categories');
    router.refresh();
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{ka.admin.forms.nameKa}</Label>
              <Input
                required
                value={form.nameKa}
                onChange={(e) => update('nameKa', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.nameEn}</Label>
              <Input
                required
                value={form.nameEn}
                onChange={(e) => update('nameEn', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.slug}</Label>
              <Input
                required
                placeholder="floor-tiles"
                value={form.slug}
                onChange={(e) => update('slug', e.target.value.toLowerCase())}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.icon}</Label>
              <Input
                placeholder="layers, home, ..."
                value={form.icon ?? ''}
                onChange={(e) => update('icon', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.phaseField}</Label>
              <Input
                type="number"
                min={1}
                max={30}
                required
                value={form.phase}
                onChange={(e) => update('phase', Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.calcType}</Label>
              <Select
                value={form.calculationType}
                onValueChange={(v) =>
                  update('calculationType', v as typeof form.calculationType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALCULATION_TYPE_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {ka.admin.forms.calcTypes[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.sortOrder}</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => update('sortOrder', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isVisible}
                onChange={(e) => update('isVisible', e.target.checked)}
              />
              {ka.admin.forms.visible}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFurniture}
                onChange={(e) => update('isFurniture', e.target.checked)}
              />
              {ka.admin.forms.furniture}
            </label>
          </div>

          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-between">
            <div>
              {category && (
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
