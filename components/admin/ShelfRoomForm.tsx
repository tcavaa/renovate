'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Package, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { NodeIcon } from '@/components/ui/node-icon';
import type { IconNode } from '@/lib/admin/icons';
import { useLocale, useT } from '@/lib/i18n/client';
import { apiErrorMessage, pickLocalizedName, roomTypeLabel } from '@/lib/i18n/labels';
import { buildCategoryTree, flattenTree, pathOf } from '@/lib/catalog/tree';
import type { RoomType } from '@/lib/calculator/types';
import { cn, slugify } from '@/lib/utils';

/** lucide's whole set is large: it loads with this form's icon field, not with the admin. */
const IconPicker = dynamic(() => import('@/components/admin/IconPicker').then((m) => m.IconPicker), {
  ssr: false,
  loading: () => <div className="h-10 border border-line bg-bg-surface" />,
});

/** A category as the room's picker lists it. */
export interface PickerCategory {
  id: number;
  parentId: number | null;
  sortOrder: number | null;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  icon: IconNode | null;
  /** Products in its whole subtree. */
  total: number;
}

export interface ShelfRoomValue {
  id: number;
  slug: string;
  nameKa: string;
  nameEn: string;
  nameRu: string | null;
  icon: string | null;
  roomTypes: RoomType[];
  isVisible: boolean;
  categoryIds: number[];
}

/**
 * One of the studio's rooms: its names and icon, the plan's room types it opens for (the
 * shelf opens on it when a room of that type is in focus), whether the studio shows it, and
 * the categories it lists, in order — each standing for everything under it.
 */
export function ShelfRoomForm({ room, categories, roomTypes, canDelete = false }: { room?: ShelfRoomValue; categories: PickerCategory[]; roomTypes: RoomType[]; canDelete?: boolean }) {
  const t = useT();
  const s = t.admin.shelfRooms;
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(!!room);
  const [form, setForm] = useState({
    slug: room?.slug ?? '',
    nameKa: room?.nameKa ?? '',
    nameEn: room?.nameEn ?? '',
    nameRu: room?.nameRu ?? '',
    icon: room?.icon ?? '',
    roomTypes: room?.roomTypes ?? ([] as RoomType[]),
    isVisible: room?.isVisible ?? true,
    categoryIds: room?.categoryIds ?? ([] as number[]),
  });
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const name = (c: PickerCategory) => pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu);
  const path = (id: number) =>
    pathOf(tree, id)
      .slice(0, -1)
      .map((c) => name(c))
      .join(' › ');
  const addable = flattenTree(tree).filter(({ row }) => !form.categoryIds.includes(row.id));

  const moveCategory = (index: number, by: -1 | 1) => {
    const ids = [...form.categoryIds];
    const to = index + by;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    update('categoryIds', ids);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(room ? `/api/shelf-rooms/${room.id}` : '/api/shelf-rooms', {
      method: room ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, icon: form.icon || null, nameRu: form.nameRu || null }),
    });
    const json = await res.json().catch(() => ({ error: null }));
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(t, json.error));
      return;
    }
    router.push('/admin/categories/rooms');
    router.refresh();
  };

  const remove = async () => {
    if (!room || !confirm(s.deleteConfirm)) return;
    setLoading(true);
    const res = await fetch(`/api/shelf-rooms/${room.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({ error: null }));
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(t, json.error));
      return;
    }
    router.push('/admin/categories/rooms');
    router.refresh();
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t.admin.forms.nameKa}</Label>
              <Input required value={form.nameKa} onChange={(e) => update('nameKa', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t.admin.forms.nameEn}</Label>
              <Input
                required
                value={form.nameEn}
                onChange={(e) => {
                  const nameEn = e.target.value;
                  setForm((f) => ({ ...f, nameEn, ...(slugTouched ? {} : { slug: slugify(nameEn).replace(/[^a-z0-9-]/g, '') }) }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.admin.forms.nameRu}</Label>
              <Input value={form.nameRu ?? ''} onChange={(e) => update('nameRu', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t.admin.forms.slug}</Label>
              <Input
                required
                placeholder="bedroom"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  update('slug', e.target.value.toLowerCase());
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.admin.forms.icon}</Label>
              <IconPicker value={form.icon ?? ''} onChange={(icon) => update('icon', icon)} />
            </div>
            <label className={cn('flex cursor-pointer gap-3 self-end border p-3 transition-colors', form.isVisible ? 'border-ink bg-bg-base' : 'border-line bg-bg-surface')}>
              <input type="checkbox" checked={form.isVisible} onChange={(e) => update('isVisible', e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
              <span>
                <span className="block text-sm font-medium text-ink">{s.visibleLabel}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{s.visibleHint}</span>
              </span>
            </label>
          </div>

          <section className="space-y-2">
            <Label>{s.roomTypes}</Label>
            <div className="flex flex-wrap gap-1.5">
              {roomTypes.map((type) => {
                const on = form.roomTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={on}
                    onClick={() => update('roomTypes', on ? form.roomTypes.filter((x) => x !== type) : [...form.roomTypes, type])}
                    className={cn('inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-medium transition-colors', on ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface text-ink-soft hover:border-ink hover:text-ink')}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                    {roomTypeLabel(t, type)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-ink-muted">{s.roomTypesHint}</p>
          </section>

          <section className="space-y-2">
            <Label>{s.categories}</Label>
            <p className="text-xs text-ink-muted">{s.categoriesHint}</p>
            <ul className="border border-line">
              {form.categoryIds.length === 0 && <li className="px-3 py-4 text-center text-sm text-ink-muted">{s.noCategories}</li>}
              {form.categoryIds.map((id, i) => {
                const c = tree.byId.get(id);
                if (!c) return null;
                return (
                  <li key={id} className="flex items-center gap-2 border-b border-line/70 px-3 py-2 last:border-b-0">
                    <span className="grid h-7 w-7 shrink-0 place-items-center border border-line text-ink-soft">{c.icon ? <NodeIcon node={c.icon} className="h-4 w-4" /> : <Package className="h-4 w-4 opacity-40" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{name(c)}</span>
                      {path(id) && <span className="block truncate text-[11px] text-ink-muted">{path(id)}</span>}
                    </span>
                    <span className="text-xs tabular-nums text-ink-muted">{c.total}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === 0} onClick={() => moveCategory(i, -1)} aria-label={t.admin.catTree.moveUp}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={i === form.categoryIds.length - 1} onClick={() => moveCategory(i, 1)} aria-label={t.admin.catTree.moveDown}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-danger" onClick={() => update('categoryIds', form.categoryIds.filter((x) => x !== id))} aria-label={s.removeCategory} title={s.removeCategory}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <select
                value=""
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) update('categoryIds', [...form.categoryIds, id]);
                }}
                aria-label={s.addCategory}
                className="h-10 w-full max-w-md border border-line bg-bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none"
              >
                <option value="">{s.addCategory}</option>
                {addable.map(({ row, depth }) => (
                  <option key={row.id} value={row.id}>
                    {' '.repeat(depth - 1)}
                    {depth > 1 ? '└ ' : ''}
                    {name(row)} ({row.total})
                  </option>
                ))}
              </select>
            </div>
          </section>

          {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex justify-between">
            <div>
              {room && canDelete && (
                <Button type="button" variant="destructive" onClick={remove} disabled={loading}>
                  <Trash2 className="h-4 w-4" /> {t.admin.actions.delete}
                </Button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t.admin.actions.save}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
