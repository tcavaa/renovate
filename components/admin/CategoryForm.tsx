'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Check, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useLocale, useT } from '@/lib/i18n/client';
import { apiErrorMessage, pickLocalizedName, productKindLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { MAX_CATEGORY_DEPTH, buildCategoryTree, depthOf, flattenTree, subtreeHeight, subtreeIds } from '@/lib/catalog/tree';
import { PRODUCT_KINDS } from '@/lib/catalog/kinds';
import type { Category } from '@/lib/db/schema';
import { cn, slugify } from '@/lib/utils';

/** lucide's whole set is large: it loads with this form's icon field, not with the admin. */
const IconPicker = dynamic(() => import('@/components/admin/IconPicker').then((m) => m.IconPicker), {
  ssr: false,
  loading: () => <div className="h-10 border border-line bg-bg-surface" />,
});

const CALCULATION_TYPE_KEYS = ['per_m2_floor', 'per_m2_wall', 'per_m2_ceiling', 'per_linear_m', 'per_unit', 'per_room', 'fixed'] as const;
type CalculationType = (typeof CALCULATION_TYPE_KEYS)[number];

/** What the parent select needs of every category. */
export type CategoryNode = Pick<Category, 'id' | 'parentId' | 'sortOrder' | 'nameKa' | 'nameEn' | 'nameRu' | 'slug' | 'isFurniture' | 'calculationType'>;

interface Props {
  category?: Category;
  /** Every category, for the parent select. */
  all: CategoryNode[];
  /** Where a new category starts: under this parent (`?parent=` from the tree's "+"). */
  initialParentId?: number | null;
  /** The studio's rooms, and the ones listing this category now. */
  rooms: Array<{ id: number; name: string }>;
  roomIds?: number[];
  /** Products filed here, and under it too. */
  counts?: { own: number; total: number };
  /** Whether the delete button is offered: admin only (`canDeleteIn`). */
  canDelete?: boolean;
}

/**
 * A category of the tree: where it sits (its parent — the tree is three levels deep at most,
 * and a category moves with everything under it), its names and icon, and where it shows —
 * the site's catalogue, the calculator's tabs, the studio's rooms. Its place among its
 * siblings is set with the arrows on the tree page, not here.
 */
export function CategoryForm({ category, all, initialParentId = null, rooms, roomIds = [], counts, canDelete = false }: Props) {
  const router = useRouter();
  const ka = useT();
  const cf = ka.admin.catForm;
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tree = useMemo(() => buildCategoryTree(all), [all]);
  const parentAtStart = category ? category.parentId : initialParentId;
  const inherited = parentAtStart != null ? tree.byId.get(parentAtStart) : undefined;
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [form, setForm] = useState({
    parentId: parentAtStart ?? null,
    nameKa: category?.nameKa ?? '',
    nameEn: category?.nameEn ?? '',
    nameRu: category?.nameRu ?? '',
    slug: category?.slug ?? '',
    icon: category?.icon ?? '',
    calculationType: (category?.calculationType ?? inherited?.calculationType ?? 'per_unit') as CalculationType,
    isVisible: category?.isVisible ?? true,
    isFurniture: category?.isFurniture ?? inherited?.isFurniture ?? false,
    inCalculator: category?.inCalculator ?? false,
    model3dKind: category?.model3dKind ?? '',
    shelfRoomIds: roomIds,
  });
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Where it may go: not under itself or anything under it, and not so deep that its own
  // subtree would pass the third level.
  const height = category ? subtreeHeight(tree, category.id) : 1;
  const own = new Set(category ? subtreeIds(tree, category.id) : []);
  const parentOptions = flattenTree(tree).filter(({ row, depth }) => !own.has(row.id) && depth + height <= MAX_CATEGORY_DEPTH);
  const name = (c: CategoryNode) => pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu);
  const depthHere = form.parentId != null ? depthOf(tree, form.parentId) + 1 : 1;

  const chooseParent = (value: string) => {
    const parentId = value === 'top' ? null : Number(value);
    const parent = parentId != null ? tree.byId.get(parentId) : undefined;
    // A new subcategory takes after its parent until the admin says otherwise.
    setForm((f) => ({ ...f, parentId, ...(category || !parent ? {} : { isFurniture: parent.isFurniture, calculationType: parent.calculationType as CalculationType }) }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload = { ...form, icon: form.icon || null, nameRu: form.nameRu || null, model3dKind: form.model3dKind || null };
    const res = await fetch(category ? `/api/categories/${category.id}` : '/api/categories', {
      method: category ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({ error: null }));
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
    const json = await res.json().catch(() => ({ error: null }));
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(ka, json.error));
      return;
    }
    router.push('/admin/categories');
    router.refresh();
  };

  const hasChildren = category ? (tree.children.get(category.id)?.length ?? 0) > 0 : false;

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-6">
          <section className="space-y-2">
            <Label>{cf.parent}</Label>
            <Select value={form.parentId == null ? 'top' : String(form.parentId)} onValueChange={chooseParent}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">{cf.parentNone}</SelectItem>
                {parentOptions.map(({ row, depth }) => (
                  <SelectItem key={row.id} value={String(row.id)}>
                    {' '.repeat(depth - 1)}
                    {depth > 1 ? '└ ' : ''}
                    {name(row)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-muted">{fill(cf.parentHint, { level: depthHere, max: MAX_CATEGORY_DEPTH })}</p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{ka.admin.forms.nameKa}</Label>
              <Input required value={form.nameKa} onChange={(e) => update('nameKa', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.nameEn}</Label>
              <Input
                required
                value={form.nameEn}
                onChange={(e) => {
                  const nameEn = e.target.value;
                  // A new category's slug follows its English name until it is typed by hand.
                  setForm((f) => ({ ...f, nameEn, ...(slugTouched ? {} : { slug: slugify(nameEn).replace(/[^a-z0-9-]/g, '') }) }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.nameRu}</Label>
              <Input value={form.nameRu} onChange={(e) => update('nameRu', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.slug}</Label>
              <Input
                required
                placeholder="floor-tiles"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  update('slug', e.target.value.toLowerCase());
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.icon}</Label>
              <IconPicker value={form.icon ?? ''} onChange={(icon) => update('icon', icon)} />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.calcType}</Label>
              <Select value={form.calculationType} onValueChange={(v) => update('calculationType', v as CalculationType)}>
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
              <p className="text-xs text-ink-muted">{cf.calcTypeHint}</p>
            </div>
          </div>

          <section className="space-y-3">
            <p className="eyebrow">{cf.whereTitle}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Switch checked={form.isVisible} onChange={(v) => update('isVisible', v)} label={cf.visibleLabel} hint={cf.visibleHint} />
              <Switch checked={form.inCalculator} onChange={(v) => update('inCalculator', v)} label={cf.calculatorLabel} hint={cf.calculatorHint} />
              <Switch checked={form.isFurniture} onChange={(v) => update('isFurniture', v)} label={cf.furnitureLabel} hint={cf.furnitureHint} />
            </div>
            <div className="space-y-2">
              <Label>{cf.roomsLabel}</Label>
              {rooms.length === 0 ? (
                <p className="text-xs text-ink-muted">{cf.roomsNone}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {rooms.map((room) => {
                    const on = form.shelfRoomIds.includes(room.id);
                    return (
                      <button
                        key={room.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update('shelfRoomIds', on ? form.shelfRoomIds.filter((id) => id !== room.id) : [...form.shelfRoomIds, room.id])}
                        className={cn('inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-medium transition-colors', on ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface text-ink-soft hover:border-ink hover:text-ink')}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                        {room.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-ink-muted">
                {cf.roomsHint}{' '}
                <Link href="/admin/categories/rooms" className="underline-offset-4 hover:text-ink hover:underline">
                  {ka.admin.shelfRooms.tab}
                </Link>
              </p>
            </div>
            <div className="space-y-2 md:max-w-md">
              <Label>{cf.kindLabel}</Label>
              <Select value={form.model3dKind || 'none'} onValueChange={(v) => update('model3dKind', v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{cf.kindNone}</SelectItem>
                  {PRODUCT_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {productKindLabel(ka, locale, kind)} · {kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-ink-muted">{cf.kindHint}</p>
            </div>
          </section>

          {counts && (
            <p className="border-l-2 border-line pl-3 text-sm text-ink-muted">
              {fill(cf.productsHere, { own: counts.own, total: counts.total })}{' '}
              {category && (
                <Link href={`/admin/products?category=${category.id}`} className="underline-offset-4 hover:text-ink hover:underline">
                  {cf.openProducts}
                </Link>
              )}
            </p>
          )}

          {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {category && canDelete && (
                <Button type="button" variant="destructive" onClick={remove} disabled={loading || hasChildren || (counts?.own ?? 0) > 0}>
                  <Trash2 className="h-4 w-4" /> {ka.admin.actions.delete}
                </Button>
              )}
              {category && canDelete && (hasChildren || (counts?.own ?? 0) > 0) && <p className="max-w-xs text-xs text-ink-muted">{cf.deleteBlocked}</p>}
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

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint: string }) {
  return (
    <label className={cn('flex cursor-pointer gap-3 border p-3 transition-colors', checked ? 'border-ink bg-bg-base' : 'border-line bg-bg-surface hover:border-ink/40')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-ink" />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}
