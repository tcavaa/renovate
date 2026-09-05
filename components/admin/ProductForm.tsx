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
import { useT, useLocale } from '@/lib/i18n/client';
import { unitLabel, pickLocalizedName } from '@/lib/i18n/labels';
import { ARCHETYPES } from '@/lib/design/catalog';
import { STYLES, STYLE_IDS } from '@/lib/design/styles';
import type { StyleId } from '@/lib/design/types';
import type { Category, Product, Store } from '@/lib/db/schema';

const UNIT_KEYS = ['m2', 'linear_m', 'piece', 'liter', 'kg', 'pack', 'set'] as const;

/**
 * Every archetype the 3D studio can draw, with the room slot it fills.
 *
 * Read straight from the registry rather than hard-coded, so adding a furniture builder makes
 * it selectable here without anyone remembering to update a list.
 */
const MODEL_KINDS = Object.values(ARCHETYPES)
  .map((a) => ({ kind: a.kind, label: a.labelKa, size: a.size }))
  .sort((a, b) => a.label.localeCompare(b.label, 'ka'));

function asStyleTags(value: unknown): StyleId[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is StyleId => STYLE_IDS.includes(v as StyleId));
}

interface Props {
  product?: Product;
  categories: Category[];
  stores: Store[];
}

export function ProductForm({ product, categories, stores }: Props) {
  const router = useRouter();
  const ka = useT();
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nameKa: product?.nameKa ?? '',
    descriptionKa: product?.descriptionKa ?? '',
    slug: product?.slug ?? '',
    sku: product?.sku ?? '',
    categoryId: product?.categoryId ? String(product.categoryId) : (categories[0] ? String(categories[0].id) : ''),
    pricePerUnit: product?.pricePerUnit ? String(product.pricePerUnit) : '',
    unit: product?.unit ?? 'piece',
    brand: product?.brand ?? '',
    imageUrl: product?.imageUrl ?? '',
    isActive: product?.isActive ?? true,
    isFeatured: product?.isFeatured ?? false,
    storeId: product?.storeId ? String(product.storeId) : '',
    styleTags: asStyleTags(product?.styleTags),
    model3dKind: product?.model3dKind ?? '',
    colorHex: product?.colorHex ?? '#C9C4BA',
    widthCm: product?.widthCm != null ? String(product.widthCm) : '',
    depthCm: product?.depthCm != null ? String(product.depthCm) : '',
    heightCm: product?.heightCm != null ? String(product.heightCm) : '',
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload = {
      ...form,
      categoryId: Number(form.categoryId),
      pricePerUnit: Number(form.pricePerUnit),
      storeId: form.storeId ? Number(form.storeId) : null,
      model3dKind: form.model3dKind || null,
      // Blank dimensions mean "use the archetype's default", not zero.
      widthCm: form.widthCm ? Number(form.widthCm) : null,
      depthCm: form.depthCm ? Number(form.depthCm) : null,
      heightCm: form.heightCm ? Number(form.heightCm) : null,
      styleTags: form.styleTags.length > 0 ? form.styleTags : null,
    };
    const url = product ? `/api/products/${product.id}` : '/api/products';
    const method = product ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? 'Error');
      return;
    }
    router.push('/admin/products');
    router.refresh();
  };

  const remove = async () => {
    if (!product) return;
    if (!confirm(ka.admin.forms.confirms.deleteProduct)) return;
    setLoading(true);
    await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
    setLoading(false);
    router.push('/admin/products');
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
            <div className="space-y-2">
              <Label>{ka.admin.forms.slug}</Label>
              <Input
                required
                value={form.slug}
                onChange={(e) => update('slug', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.sku}</Label>
              <Input value={form.sku ?? ''} onChange={(e) => update('sku', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.table.category}</Label>
              <Select value={form.categoryId} onValueChange={(v) => update('categoryId', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {pickLocalizedName(locale, c.nameKa, c.nameEn)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.store}</Label>
              <Select
                value={form.storeId || 'none'}
                onValueChange={(v) => update('storeId', v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{ka.admin.forms.storeNone}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nameKa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.table.unit}</Label>
              <Select value={form.unit} onValueChange={(v) => update('unit', v as typeof form.unit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_KEYS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {unitLabel(ka, u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.table.price} (GEL)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.pricePerUnit}
                onChange={(e) => update('pricePerUnit', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.brand}</Label>
              <Input value={form.brand ?? ''} onChange={(e) => update('brand', e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{ka.admin.forms.photo}</Label>
              <ImageUploader
                value={form.imageUrl ?? ''}
                onChange={(url) => update('imageUrl', url)}
                folder="products"
                helperText={ka.admin.forms.photoHelperProduct}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{ka.admin.forms.description}</Label>
              <Textarea
                rows={4}
                value={form.descriptionKa ?? ''}
                onChange={(e) => update('descriptionKa', e.target.value)}
              />
            </div>
          </div>

          <section className="space-y-4 rounded-lg border border-line bg-bg-base/40 p-4">
            <div>
              <h2 className="font-serif text-lg font-semibold">
                {ka.admin.forms.designSection}
              </h2>
              <p className="mt-0.5 text-sm text-ink-muted">{ka.admin.forms.designHelper}</p>
            </div>

            <div className="space-y-2">
              <Label>{ka.admin.forms.styleTags}</Label>
              <div className="flex flex-wrap gap-2">
                {STYLE_IDS.map((id) => {
                  const active = form.styleTags.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        update(
                          'styleTags',
                          active
                            ? form.styleTags.filter((s) => s !== id)
                            : [...form.styleTags, id]
                        )
                      }
                      className={
                        'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ' +
                        (active
                          ? 'border-brand bg-brand/10 text-brand-dark'
                          : 'border-line bg-bg-surface text-ink-muted hover:border-brand/40')
                      }
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-line"
                        style={{ backgroundColor: STYLES[id].swatches[0] }}
                      />
                      {id}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{ka.admin.forms.model3dKind}</Label>
                <Select
                  value={form.model3dKind || 'none'}
                  onValueChange={(v) => {
                    if (v === 'none') {
                      update('model3dKind', '');
                      return;
                    }
                    update('model3dKind', v);
                    // Prefill the archetype's real-world size so the field is never left empty
                    // by accident — an item with no dimensions is laid out at a guess.
                    const chosen = MODEL_KINDS.find((m) => m.kind === v);
                    if (chosen && !form.widthCm && !form.depthCm && !form.heightCm) {
                      setForm((f) => ({
                        ...f,
                        model3dKind: v,
                        widthCm: String(Math.round(chosen.size.width * 100)),
                        depthCm: String(Math.round(chosen.size.depth * 100)),
                        heightCm: String(Math.round(chosen.size.height * 100)),
                      }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{ka.admin.forms.model3dKindNone}</SelectItem>
                    {/*
                      A stored kind that is no longer in the registry would otherwise render as
                      an empty select and be lost on the next save. Keep it listed so it is
                      visible and deliberate to change.
                    */}
                    {form.model3dKind &&
                      !MODEL_KINDS.some((m) => m.kind === form.model3dKind) && (
                        <SelectItem value={form.model3dKind}>{form.model3dKind} (?)</SelectItem>
                      )}
                    {MODEL_KINDS.map((m) => (
                      <SelectItem key={m.kind} value={m.kind}>
                        {m.label} · {m.kind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{ka.admin.forms.colorHex}</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={form.colorHex || '#C9C4BA'}
                    onChange={(e) => update('colorHex', e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-md border border-line bg-bg-surface"
                    aria-label={ka.admin.forms.colorHex}
                  />
                  <Input
                    value={form.colorHex ?? ''}
                    onChange={(e) => update('colorHex', e.target.value)}
                    placeholder="#C9C4BA"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ['widthCm', ka.admin.forms.widthCm],
                  ['depthCm', ka.admin.forms.depthCm],
                  ['heightCm', ka.admin.forms.heightCm],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    min="1"
                    max="2000"
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </section>

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
                checked={form.isFeatured}
                onChange={(e) => update('isFeatured', e.target.checked)}
              />
              {ka.admin.forms.featured}
            </label>
          </div>

          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-between">
            <div>
              {product && (
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
