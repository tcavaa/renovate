'use client';

/**
 * The catalogue as a shelf of small tiles along the bottom of the studio — a picture and a
 * price, the name on hover — the way a game's build catalogue reads. Click a tile to carry
 * it into a room, or drag it straight into the 3D view: from the moment the drag starts the
 * model itself rides on the pointer (the browser's picture of the tile is suppressed) and is
 * set down where it is let go.
 *
 * What narrows the shelf, from the outside in:
 * - the **styles**, down the left edge, the project's own preselected;
 * - the **room**, then the **category** within it — two levels of icons on one line. Thirty-four
 *   kinds in a row of look-alike pictures was a row nobody could read; a person furnishing a
 *   bedroom thinks "bedroom" first, and then has nine icons to look at. The rooms, their
 *   categories and every icon are admin's (`lib/design/shelf.ts`); a category that has
 *   subcategories of its own opens onto them, a chip at the head of the line for each step
 *   back. The line opens on the room that is in focus in the studio, the chip at its head is
 *   both where one is and the way back to the rooms;
 * - the **colour**: swatches of the colour families that are actually on the shelf as it
 *   stands (`lib/design/colors`; the colours themselves are read off the models);
 * - the search, folded to an icon until it is wanted.
 * Both lines scroll without a scrollbar and fade at the edge they continue past (`ScrollRow`).
 */

import Image from '@/components/ui/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, LayoutGrid, Package, Palette, Plus, Search, X } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, styleLabel } from '@/lib/i18n/labels';
import { archetypeLabel } from '@/lib/design/catalog';
import { COLOR_FAMILIES, productColorFamilies, type ColorFamily } from '@/lib/design/colors';
import { STYLE_IDS } from '@/lib/design/styles';
import { isFurnitureProduct } from '@/lib/design/catalogBrowser';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { StyleId } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';
import { inCategory, inShelfRoom, roomCategories, shelfIndex, shelfName, shelfRoomCounts, shelfRoomForType, shelfTrail, subcategoryCounts, type ShelfData, type ShelfRoomId } from '@/lib/design/shelf';
import type { IconNode } from '@/lib/admin/icons';
import { ScrollRow } from '@/components/ui/scroll-row';
import { NodeIcon } from '@/components/ui/node-icon';
import { cn, formatGEL } from '@/lib/utils';
import { emptyDragImage } from './dragImage';

export const FURNITURE_DRAG_TYPE = 'application/x-renovate-product';

/** An icon admin chose, or a plain package where there is none. */
function ShelfIcon({ node, className }: { node: IconNode | null | undefined; className?: string }) {
  return node ? <NodeIcon node={node} className={className} /> : <Package className={className} />;
}

export function FurnitureTray({
  catalog,
  shelf,
  styleId,
  roomLabel,
  roomType = null,
  onPick,
  onDragProduct,
  onOpenCatalog,
  onAddOwn,
}: {
  catalog: CatalogProduct[];
  /** The rooms and the category tree the shelf is arranged by. */
  shelf: ShelfData;
  styleId: StyleId;
  roomLabel: string;
  /** The type of the room in focus in the studio, if one is: the shelf opens on it. */
  roomType?: RoomType | null;
  onPick: (product: CatalogProduct) => boolean;
  /** A tile started or finished being dragged; the studio shows it in 3D under the pointer meanwhile. */
  onDragProduct?: (product: CatalogProduct | null) => void;
  /** Opens the whole catalogue as a page (`CatalogBrowser`): search, filters, details. */
  onOpenCatalog?: () => void;
  /** Opens the dialog for a piece of the person's own — a model or a photo of theirs. */
  onAddOwn?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const index = useMemo(() => shelfIndex(shelf), [shelf]);
  const [room, setRoom] = useState<ShelfRoomId | null>(() => shelfRoomForType(index, roomType));
  const [category, setCategory] = useState<number | null>(null);
  const [colors, setColors] = useState<Set<ColorFamily>>(() => new Set());
  const [styles, setStyles] = useState<Set<StyleId>>(() => new Set([styleId]));
  // The style the project was given follows a change of mind on the style step; the person's
  // own ticks in this tray are theirs and are left alone.
  const lastStyle = useRef(styleId);
  useEffect(() => {
    if (lastStyle.current === styleId) return;
    lastStyle.current = styleId;
    setStyles(new Set([styleId]));
  }, [styleId]);
  // The shelf follows the studio's focus: step into the bathroom and it is showing bathroom
  // things. (State adjusted while rendering, the way React asks for a prop to be followed.)
  const [followed, setFollowed] = useState(roomType);
  if (followed !== roomType) {
    setFollowed(roomType);
    setRoom(shelfRoomForType(index, roomType));
    setCategory(null);
  }
  const [notice, setNotice] = useState<{ id: number; ok: boolean } | null>(null);

  // A fitting, a door and a radiator are all products with a model, but none of them is
  // furniture: they belong to the electrical layer, the wall and the technical layer.
  const placeable = useMemo(() => catalog.filter(isFurnitureProduct), [catalog]);

  // The rooms worth listing (something on the shelf is in them) and, in the open one, where
  // one is among its categories: the trail from the category the room lists down to the one
  // chosen. The line shows the level under the last step that opens onto more, else the level
  // the chosen category is on.
  const rooms = useMemo(() => shelfRoomCounts(index, placeable), [index, placeable]);
  // A room in focus that the shelf has nothing for (or a catalogue still loading) is the
  // rooms list, not an empty line.
  const openRoom = room != null && rooms.some((r) => r.id === room) ? room : null;
  const inRoom = useMemo(() => (openRoom == null ? placeable : placeable.filter((p) => inShelfRoom(index, p, openRoom))), [index, placeable, openRoom]);
  const { chosen, levelParent, crumbs, options, picked } = useMemo(() => {
    const trail = openRoom == null ? [] : shelfTrail(index, openRoom, category, inRoom);
    const last = trail.length ? trail[trail.length - 1] : null;
    const opens = last != null && subcategoryCounts(index, inRoom, last).length > 0;
    const parent = opens ? last : trail.length > 1 ? trail[trail.length - 2] : null;
    return {
      chosen: last,
      levelParent: parent,
      crumbs: parent == null ? [] : trail.slice(0, trail.indexOf(parent) + 1),
      options: openRoom == null ? [] : parent == null ? roomCategories(index, inRoom, openRoom) : subcategoryCounts(index, inRoom, parent),
      picked: opens ? null : last,
    };
  }, [index, openRoom, category, inRoom]);

  // Everything but the colour, so that the swatches can say which colours are to be had.
  const uncoloured = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRoom
      .filter((p) => chosen == null || inCategory(index, p, chosen))
      // A piece of the person's own has no style tag and is theirs in any style.
      .filter((p) => p.own || styles.size === 0 || (Array.isArray(p.styleTags) ? (p.styleTags as string[]) : []).some((s) => styles.has(s as StyleId)))
      .filter((p) => {
        if (!q) return true;
        return [p.nameKa, p.nameEn, p.nameRu, p.brand, p.store?.nameKa, p.store?.nameEn].filter(Boolean).join(' ').toLowerCase().includes(q);
      });
  }, [index, inRoom, chosen, query, styles]);
  const swatches = useMemo(() => {
    const seen = new Map<ColorFamily, number>();
    for (const p of uncoloured) for (const family of productColorFamilies(p)) seen.set(family, (seen.get(family) ?? 0) + 1);
    return COLOR_FAMILIES.filter((family) => seen.has(family.id)).map((family) => ({ ...family, count: seen.get(family.id)! }));
  }, [uncoloured]);
  // A colour ticked in the living room may not exist among the bathroom's things: a filter
  // that has nothing to show for itself stands aside rather than emptying the shelf.
  const wanted = useMemo(() => swatches.filter((s) => colors.has(s.id)).map((s) => s.id), [swatches, colors]);
  const results = useMemo(() => {
    const list = wanted.length === 0 ? uncoloured : uncoloured.filter((p) => productColorFamilies(p).some((family) => wanted.includes(family)));
    return [...list].sort((a, b) => a.pricePerUnit - b.pricePerUnit);
  }, [uncoloured, wanted]);

  const openSearch = () => {
    setSearching(true);
    window.setTimeout(() => searchInput.current?.focus(), 0);
  };
  const roomDef = (r: ShelfRoomId) => (r === 'other' ? null : (index.rooms.find((x) => x.id === r) ?? null));
  const roomName = (r: ShelfRoomId) => {
    const def = roomDef(r);
    return def ? shelfName(def, locale) : t.design.shelfOther;
  };
  const categoryDef = (id: number) => index.tree.byId.get(id) ?? null;
  const categoryName = (id: number) => {
    const def = categoryDef(id);
    return def ? shelfName(def, locale) : '';
  };
  const leaveRoom = () => {
    setRoom(null);
    setCategory(null);
  };

  const pick = (product: CatalogProduct) => {
    const ok = onPick(product);
    setNotice({ id: product.id, ok });
    window.setTimeout(() => setNotice((n) => (n?.id === product.id ? null : n)), ok ? 2500 : 1800);
  };

  return (
    <div className="flex gap-2">
      {/*
        The styles down the left edge, like the finishes tray's surfaces: they are what the
        shelf *is*, not another filter in the row, and the kinds then get the full width.
      */}
      <div className="flex shrink-0 flex-col gap-0.5 border-r border-line pr-2" role="group" aria-label={t.design.styleTitle}>
        {STYLE_IDS.map((id) => {
          const active = styles.has(id);
          // The project's own style is marked whether it is ticked or not: with four chips
          // that all look alike, nothing on the shelf said which one the flat was designed in.
          const own = id === styleId;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              title={own ? `${styleLabel(t, id)} · ${t.design.yourStyle}` : styleLabel(t, id)}
              onClick={() =>
                setStyles((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              className={cn(
                'flex h-7 w-[104px] items-center gap-1 rounded-[7px] px-2 text-[10px] font-semibold transition-colors',
                active && own ? 'bg-brand text-white' : active ? 'bg-ink text-white' : own ? 'text-ink ring-1 ring-inset ring-brand/40 hover:bg-sand-light' : 'text-ink-soft hover:bg-sand-light hover:text-ink'
              )}
            >
              {own && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? 'bg-white' : 'bg-brand')} aria-hidden />}
              <span className="truncate">{styleLabel(t, id)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/*
          One line: where one is (the rooms, or the room that is open with its kinds), then
          the colours to be had there, then the search and the count.
        */}
        <div className="flex items-center gap-1.5">
          {/* The open room's chip is the way back — a chevron before its name — and it stays
              put while its categories scroll behind it; a chip for each category opened
              onto its subcategories follows it, each a step back. */}
          {openRoom != null && (
            <button type="button" onClick={leaveRoom} title={t.design.shelfBack} className="flex h-7 shrink-0 items-center gap-0.5 rounded-[8px] bg-ink pl-1 pr-2 text-[10px] font-semibold text-white hover:bg-brand">
              <ChevronLeft className="h-3.5 w-3.5" />
              <ShelfIcon node={roomDef(openRoom)?.icon} className="h-3.5 w-3.5" />
              <span className="max-w-[110px] truncate">{roomName(openRoom)}</span>
            </button>
          )}
          {crumbs.map((id, i) => (
            <button key={id} type="button" onClick={() => setCategory(crumbs[i - 1] ?? null)} title={t.design.shelfBack} className="flex h-7 shrink-0 items-center gap-0.5 rounded-[8px] bg-ink/80 pl-1 pr-2 text-[10px] font-semibold text-white hover:bg-brand">
              <ChevronLeft className="h-3.5 w-3.5" />
              <ShelfIcon node={categoryDef(id)?.icon} className="h-3.5 w-3.5" />
              <span className="max-w-[96px] truncate">{categoryName(id)}</span>
            </button>
          ))}
          <ScrollRow className="min-w-0 flex-1" contentClassName="items-center gap-0.5" role="radiogroup" ariaLabel={openRoom != null ? roomName(openRoom) : t.design.shelfRooms}>
            {openRoom != null ? (
              <>
                <button type="button" role="radio" aria-checked={picked == null} onClick={() => setCategory(levelParent)} title={t.design.allKinds} className={cn('h-7 shrink-0 rounded-[8px] px-2 text-[10px] font-semibold', picked == null ? 'bg-ink/10 text-ink' : 'text-ink-soft hover:bg-sand-light')}>
                  {t.design.allKinds}
                </button>
                {options.map((o) => {
                  const active = picked === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      // One that opens onto subcategories is stepped into; another is ticked and unticked.
                      onClick={() => setCategory(o.opens ? o.id : active ? levelParent : o.id)}
                      title={`${categoryName(o.id)} · ${o.count}`}
                      aria-label={categoryName(o.id)}
                      className={cn('relative grid h-7 w-7 shrink-0 place-items-center rounded-[8px]', active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light hover:text-ink')}
                    >
                      <ShelfIcon node={categoryDef(o.id)?.icon} className="h-4 w-4" />
                      {o.opens && <span className="absolute bottom-0.5 right-0.5 h-1 w-1 rounded-full bg-current opacity-60" aria-hidden />}
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                <button type="button" role="radio" aria-checked className="h-7 shrink-0 rounded-[8px] bg-ink/10 px-2 text-[10px] font-semibold text-ink" title={t.design.shelfAllRooms}>
                  {t.design.shelfAllRooms}
                </button>
                {/* The tray is 880 px whatever the window, so the rooms are icons like the
                    categories, their names in the tooltip; the chip at the head names the one opened. */}
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={false}
                    onClick={() => {
                      setRoom(r.id);
                      setCategory(null);
                    }}
                    title={`${roomName(r.id)} · ${r.count}`}
                    aria-label={roomName(r.id)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-ink-soft hover:bg-sand-light hover:text-ink"
                  >
                    <ShelfIcon node={roomDef(r.id)?.icon} className="h-4 w-4" />
                  </button>
                ))}
              </>
            )}
          </ScrollRow>

          {/* The colours on the shelf as it stands: one swatch per family, ticked to narrow. */}
          {swatches.length > 0 && (
            <div className="flex shrink-0 items-center gap-0.5 border-l border-line pl-1.5" role="group" aria-label={t.design.shelfColors}>
              <Palette className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
              {swatches.map((swatch) => {
                const active = wanted.includes(swatch.id);
                const name = (t.design.colorNames as Record<string, string>)[swatch.id] ?? swatch.id;
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    aria-pressed={active}
                    title={`${name} · ${swatch.count}`}
                    aria-label={name}
                    onClick={() =>
                      setColors((prev) => {
                        const next = new Set(prev);
                        if (next.has(swatch.id)) next.delete(swatch.id);
                        else next.add(swatch.id);
                        return next;
                      })
                    }
                    className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full transition-shadow', active ? 'ring-2 ring-ink ring-offset-1' : 'hover:ring-2 hover:ring-line hover:ring-offset-1')}
                  >
                    <span className="block h-3.5 w-3.5 rounded-full border border-black/15" style={{ backgroundColor: swatch.hex }} />
                  </button>
                );
              })}
              {wanted.length > 0 && (
                <button type="button" onClick={() => setColors(new Set())} title={t.design.shelfNoColor} aria-label={t.design.shelfNoColor} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-faint hover:text-ink">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* A piece of the person's own: their model, or a photo waiting to become one. */}
          {onAddOwn && (
            <button type="button" onClick={onAddOwn} title={t.design.ownAdd} aria-label={t.design.ownAdd} data-tour="own-add" className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-dashed border-ink/40 text-ink transition-colors hover:border-ink hover:bg-sand-light">
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          {/* The whole catalogue as a page — search, filters, details — for when the shelf is not enough. */}
          {onOpenCatalog && (
            <button type="button" onClick={onOpenCatalog} title={t.design.catalogOpenHint} data-tour="catalog" className="flex h-7 shrink-0 items-center gap-1 rounded-[8px] bg-ink px-2 text-[10px] font-semibold text-white transition-colors hover:bg-brand">
              <LayoutGrid className="h-3.5 w-3.5" />
              {t.design.catalogOpen}
            </button>
          )}
          {/* The search: an icon until it is wanted, so the rooms have the line. */}
          {searching || query ? (
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                ref={searchInput}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => !query && setSearching(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setQuery('');
                    setSearching(false);
                  }
                }}
                placeholder={t.design.searchFurniture}
                aria-label={t.design.searchFurniture}
                className="h-7 w-32 rounded-[8px] border border-line bg-white pl-7 pr-2 text-xs text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              />
            </div>
          ) : (
            <button type="button" onClick={openSearch} title={t.design.searchFurniture} aria-label={t.design.searchFurniture} className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-ink-soft hover:bg-sand-light hover:text-ink">
              <Search className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="shrink-0 text-[10px] tabular-nums text-ink-muted" title={`${roomLabel} · ${results.length}`}>
            {results.length}
          </span>
        </div>

        {/* The shelf. The name lives in the tile's tooltip — at this size it would not be read. */}
        <ScrollRow contentClassName="gap-1 pb-0.5">
          {results.length === 0 && <p className="py-3 text-xs text-ink-muted">{t.design.noMatches}</p>}
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
                className={cn('group flex w-[52px] shrink-0 flex-col overflow-hidden rounded-[8px] border bg-white text-left transition-colors', flash ? (flash.ok ? 'border-success' : 'border-danger') : 'border-line hover:border-ink')}
              >
                <span className="relative block aspect-square w-full bg-bg-base">
                  {p.imageUrl ? <Image src={p.imageUrl} alt={name} fill sizes="52px" className="pointer-events-none object-cover transition-transform group-hover:scale-105" /> : <span className="block h-full w-full" style={{ backgroundColor: p.colorHex ?? '#DDD8CF' }} />}
                </span>
                <span className="block px-1 py-0.5 text-center">
                  <span className="block truncate text-[9px] font-semibold tabular-nums leading-tight text-ink">{formatGEL(p.pricePerUnit)}</span>
                </span>
              </button>
            );
          })}
        </ScrollRow>
        {notice && !notice.ok && (
          <p role="alert" className="text-[10px] text-danger">
            {t.design.noSpaceForItem}
          </p>
        )}
      </div>
    </div>
  );
}
