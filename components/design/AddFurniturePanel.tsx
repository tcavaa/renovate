'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { ArrowLeft, GripVertical, Plus, Search } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, styleLabel } from '@/lib/i18n/labels';
import { archetypeLabel } from '@/lib/design/catalog';
import { STYLE_IDS } from '@/lib/design/styles';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PlanRoom, StyleId } from '@/lib/design/types';
import { formatGEL, cn } from '@/lib/utils';

/** What a dragged row carries: the studio's drop handler reads the product id back. */
export const FURNITURE_DRAG_TYPE = 'application/x-renovate-product';

/**
 * Browse the whole placeable catalogue and drop a product into a room. Search runs over the
 * name, brand and store; the type filter lists only the archetypes the catalogue actually
 * has models for; the style chips filter on the product's style tags. The current style is
 * preselected so the first screen is what the studio would have chosen itself.
 *
 * Two ways in: the "+" puts the product on the pointer for the chosen room (or, for the
 * whole flat, the first room with space), and every row can be dragged straight into the
 * 3D view and dropped where it should stand.
 */
export function AddFurniturePanel({
  catalog,
  rooms,
  roomId,
  styleId,
  onRoom,
  onAdd,
  onBack,
}: {
  catalog: CatalogProduct[];
  rooms: PlanRoom[];
  /** The room to add into, or null for the whole flat. */
  roomId: string | null;
  styleId: StyleId;
  onRoom: (roomId: string | null) => void;
  /** Returns false when no room had space for the product. */
  onAdd: (product: CatalogProduct) => boolean;
  onBack: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<string>('');
  const [styles, setStyles] = useState<Set<StyleId>>(() => new Set([styleId]));
  const [notice, setNotice] = useState<{ id: number; ok: boolean } | null>(null);

  const placeable = useMemo(() => catalog.filter((p) => p.model3dUrl && p.model3dKind), [catalog]);
  const kinds = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of placeable) seen.set(p.model3dKind!, (seen.get(p.model3dKind!) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => archetypeLabel(a[0], locale).localeCompare(archetypeLabel(b[0], locale)));
  }, [placeable, locale]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return placeable
      .filter((p) => !kind || p.model3dKind === kind)
      .filter((p) => styles.size === 0 || (Array.isArray(p.styleTags) ? (p.styleTags as string[]) : []).some((s) => styles.has(s as StyleId)))
      .filter((p) => {
        if (!q) return true;
        const hay = [p.nameKa, p.nameEn, p.nameRu, p.brand, p.store?.nameKa, p.store?.nameEn].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.pricePerUnit - b.pricePerUnit);
  }, [placeable, query, kind, styles]);

  const toggleStyle = (id: StyleId) =>
    setStyles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = (product: CatalogProduct) => {
    const ok = onAdd(product);
    setNotice({ id: product.id, ok });
    window.setTimeout(() => setNotice((n) => (n?.id === product.id ? null : n)), ok ? 5000 : 1800);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" />
        {t.design.backToItems}
      </button>

      <label className="block">
        <span className="eyebrow">{t.design.chooseRoom}</span>
        <select value={roomId ?? ''} onChange={(e) => onRoom(e.target.value || null)} className="mt-1 h-9 w-full border border-line bg-white px-2 text-sm text-ink focus:border-ink focus:outline-none">
          <option value="">{t.design.wholeFlat}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.design.searchFurniture} className="h-9 w-full border border-line bg-white pl-8 pr-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none" />
      </div>

      <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-full border border-line bg-white px-2 text-sm text-ink focus:border-ink focus:outline-none" aria-label={t.design.allKinds}>
        <option value="">{t.design.allKinds}</option>
        {kinds.map(([k, n]) => (
          <option key={k} value={k}>
            {archetypeLabel(k, locale)} ({n})
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-1.5">
        {STYLE_IDS.map((id) => {
          const active = styles.has(id);
          return (
            <button key={id} type="button" onClick={() => toggleStyle(id)} aria-pressed={active} className={cn('border px-2 py-1 text-[11px] font-medium transition-colors', active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-ink')}>
              {styleLabel(t, id)}
            </button>
          );
        })}
      </div>

      <p className="flex items-center justify-between text-[11px] text-ink-muted">
        <span>{results.length}</span>
        <span className="flex items-center gap-1">
          <GripVertical className="h-3 w-3" />
          {t.design.dropHereHint}
        </span>
      </p>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {results.length === 0 && <li className="py-6 text-center text-sm text-ink-muted">{t.design.noMatches}</li>}
        {results.map((p) => {
          const flash = notice?.id === p.id ? notice : null;
          return (
            <li
              key={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(FURNITURE_DRAG_TYPE, String(p.id));
                e.dataTransfer.setData('text/plain', localizedName(locale, p));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              title={t.design.dragToPlace}
              className="flex cursor-grab items-center gap-3 border border-line bg-white p-2 active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-ink-faint" />
              <span className="relative h-12 w-12 shrink-0 overflow-hidden bg-bg-base">
                {p.imageUrl ? <Image src={p.imageUrl} alt="" fill sizes="48px" className="pointer-events-none object-cover" /> : <span className="block h-full w-full" style={{ backgroundColor: p.colorHex ?? '#DDD8CF' }} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-ink">{localizedName(locale, p)}</span>
                <span className="block truncate text-[11px] text-ink-muted">
                  {archetypeLabel(p.model3dKind!, locale)} · {(p.store ? localizedName(locale, p.store) : null) ?? p.brand ?? ''}
                </span>
                <span className="block text-xs font-semibold tabular-nums text-ink">{formatGEL(p.pricePerUnit)}</span>
              </span>
              <button
                type="button"
                onClick={() => add(p)}
                title={t.design.addToRoom}
                className={cn('grid h-8 w-8 shrink-0 place-items-center border transition-colors', flash ? (flash.ok ? 'border-success bg-success text-white' : 'border-danger bg-danger text-white') : 'border-line text-ink hover:bg-ink hover:text-white')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {notice && !notice.ok && (
        <p role="alert" className="border border-danger/40 bg-danger/5 px-2 py-1.5 text-[11px] text-danger">
          {t.design.noSpaceForItem}
        </p>
      )}
      {notice && notice.ok && (
        <p role="status" className="border border-ink/30 bg-white px-2 py-1.5 text-[11px] text-ink">
          {t.design.carryStarted}
        </p>
      )}
    </div>
  );
}
