'use client';

/**
 * The catalogue as a shelf of small tiles along the bottom of the studio — a picture and a
 * price, the name on hover — the way a game's build catalogue reads. A row of kind icons
 * and the style chips narrow it; the current style is preselected so the first shelf is
 * what the studio would choose itself. Click a tile to carry it into a room, or drag it
 * straight into the 3D view: from the moment the drag starts the model itself rides on the
 * pointer (the browser's picture of the tile is suppressed) and is set down where it is let go.
 */

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, styleLabel } from '@/lib/i18n/labels';
import { archetypeLabel } from '@/lib/design/catalog';
import { STYLE_IDS } from '@/lib/design/styles';
import { isFixtureProductKind } from '@/lib/design/electrical';
import { isOpeningProductKind } from '@/lib/design/openings';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { StyleId } from '@/lib/design/types';
import { cn, formatGEL } from '@/lib/utils';
import { archetypeIcon } from './archetypeIcons';
import { emptyDragImage } from './dragImage';

export const FURNITURE_DRAG_TYPE = 'application/x-renovate-product';

export function FurnitureTray({ catalog, styleId, roomLabel, onPick, onDragProduct }: { catalog: CatalogProduct[]; styleId: StyleId; roomLabel: string; onPick: (product: CatalogProduct) => boolean; /** A tile started or finished being dragged; the studio shows it in 3D under the pointer meanwhile. */ onDragProduct?: (product: CatalogProduct | null) => void }) {
  const t = useT();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [styles, setStyles] = useState<Set<StyleId>>(() => new Set([styleId]));
  const [notice, setNotice] = useState<{ id: number; ok: boolean } | null>(null);

  // Sockets, switches and lamps are products too, but they belong to the electric tray.
  const placeable = useMemo(() => catalog.filter((p) => p.model3dUrl && p.model3dKind && !isFixtureProductKind(p.model3dKind) && !isOpeningProductKind(p.model3dKind)), [catalog]);
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
        return [p.nameKa, p.nameEn, p.nameRu, p.brand, p.store?.nameKa, p.store?.nameEn].filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => a.pricePerUnit - b.pricePerUnit);
  }, [placeable, query, kind, styles]);

  const pick = (product: CatalogProduct) => {
    const ok = onPick(product);
    setNotice({ id: product.id, ok });
    window.setTimeout(() => setNotice((n) => (n?.id === product.id ? null : n)), ok ? 2500 : 1800);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Filters in one row: search, the kinds as icons, the styles as chips, the count. */}
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.design.searchFurniture} aria-label={t.design.searchFurniture} className="h-8 w-36 rounded-[8px] border border-line bg-white pl-7 pr-2 text-xs text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none" />
        </div>
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto" role="radiogroup" aria-label={t.design.allKinds}>
          <button type="button" role="radio" aria-checked={kind === ''} onClick={() => setKind('')} title={t.design.allKinds} className={cn('h-8 shrink-0 rounded-[8px] px-2 text-[10px] font-semibold', kind === '' ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light')}>
            {t.design.allKinds}
          </button>
          {kinds.map(([k, n]) => {
            const Icon = archetypeIcon(k);
            return (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(kind === k ? '' : k)} title={`${archetypeLabel(k, locale)} · ${n}`} aria-label={archetypeLabel(k, locale)} className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-[8px]', kind === k ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light hover:text-ink')}>
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 gap-0.5">
          {STYLE_IDS.map((id) => {
            const active = styles.has(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setStyles((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                className={cn('h-7 rounded-[7px] px-2 text-[10px] font-medium transition-colors', active ? 'bg-sand text-ink' : 'text-ink-soft hover:bg-sand-light')}
              >
                {styleLabel(t, id)}
              </button>
            );
          })}
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">
          {roomLabel} · {results.length}
        </span>
      </div>

      {/* The shelf. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {results.length === 0 && <p className="py-5 text-xs text-ink-muted">{t.design.noMatches}</p>}
        {results.map((p) => {
          const flash = notice?.id === p.id ? notice : null;
          const name = localizedName(locale, p);
          return (
            <button
              key={p.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(FURNITURE_DRAG_TYPE, String(p.id));
                e.dataTransfer.setData('text/plain', name);
                e.dataTransfer.effectAllowed = 'copy';
                // The model itself follows the pointer in 3D; no picture of the tile does.
                e.dataTransfer.setDragImage(emptyDragImage(), 0, 0);
                onDragProduct?.(p);
              }}
              onDragEnd={() => onDragProduct?.(null)}
              onClick={() => pick(p)}
              title={`${name} · ${(p.store ? localizedName(locale, p.store) : null) ?? p.brand ?? archetypeLabel(p.model3dKind!, locale)} · ${t.design.dragToPlace}`}
              className={cn('group flex w-[84px] shrink-0 flex-col overflow-hidden rounded-[10px] border bg-white text-left transition-colors', flash ? (flash.ok ? 'border-success' : 'border-danger') : 'border-line hover:border-ink')}
            >
              <span className="relative block aspect-square w-full bg-bg-base">
                {p.imageUrl ? <Image src={p.imageUrl} alt={name} fill sizes="84px" className="pointer-events-none object-cover transition-transform group-hover:scale-105" /> : <span className="block h-full w-full" style={{ backgroundColor: p.colorHex ?? '#DDD8CF' }} />}
              </span>
              <span className="block px-1.5 py-1">
                <span className="block truncate text-[10px] font-semibold tabular-nums text-ink">{formatGEL(p.pricePerUnit)}</span>
                <span className="block truncate text-[9px] leading-tight text-ink-muted">{name}</span>
              </span>
            </button>
          );
        })}
      </div>
      {notice && !notice.ok && <p role="alert" className="text-[10px] text-danger">{t.design.noSpaceForItem}</p>}
    </div>
  );
}
