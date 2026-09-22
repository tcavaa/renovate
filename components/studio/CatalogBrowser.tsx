'use client';

/**
 * The whole furniture catalogue in a modal: a search box, the filters down the left (rooms
 * and their kinds, styles, colours, a price band, the shop), the products as cards with
 * their names, and the open product's details on the right with the one button that
 * matters — "place". The shelf along the bottom of the studio is fine for fifty tiles; a
 * catalogue of thousands wants a page.
 *
 * Placing does not stand the piece anywhere by itself: the modal folds away and the product
 * rides on the pointer, exactly as a tile clicked on the shelf does, so a click in a room
 * sets it down and Escape gives it up. The studio keeps this modal's state (`state`) and
 * shows a chip while it is folded, so coming back finds the search, the filters and the
 * open product where they were left.
 */

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, LayoutGrid, MousePointerClick, Package, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, roomTypeLabel, styleLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { archetypeLabel } from '@/lib/design/catalog';
import { browseCatalog, hasCatalogFilters, initialCatalogBrowserState, productStyles, type CatalogBrowserState, type CatalogSort, type ShelfRoom } from '@/lib/design/catalogBrowser';
import { COLOR_FAMILIES, productColorFamilies, type ColorFamily } from '@/lib/design/colors';
import { STYLE_IDS } from '@/lib/design/styles';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { StyleId } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';
import { cn, formatGEL } from '@/lib/utils';
import { archetypeIcon, roomIcon } from './archetypeIcons';

/** Where a placed product goes: on the pointer in 3D, on the pointer on the board, or nowhere (the walk-through has no pointer to carry on). */
export type CatalogPlaceMode = '2d' | '3d' | 'walk';

export function CatalogBrowser({
  open,
  onOpenChange,
  catalog,
  styleId,
  focusRoom,
  roomLabel,
  state,
  onState,
  placeMode,
  onPlace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: CatalogProduct[];
  styleId: StyleId;
  /** The type of the room the studio has in focus: the list opens on it until a room is chosen here. */
  focusRoom: RoomType | null;
  /** Where a placed piece goes — the room in focus, or the whole flat. */
  roomLabel: string;
  state: CatalogBrowserState;
  onState: (state: CatalogBrowserState) => void;
  placeMode: CatalogPlaceMode;
  /** Puts the product on the pointer; false when there is no room for it. */
  onPlace: (product: CatalogProduct) => boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const searchRef = useRef<HTMLInputElement>(null);
  const [refused, setRefused] = useState<number | null>(null);

  const browse = browseCatalog(catalog, state, { focusRoom, locale });
  const patch = (next: Partial<CatalogBrowserState>) => onState({ ...state, ...next });
  const selected = state.selectedId != null ? (catalog.find((p) => p.id === state.selectedId) ?? null) : null;
  const canPlace = placeMode !== 'walk';
  const placeLabel = placeMode === '2d' ? t.design.catalogPlace2d : t.design.catalogPlace3d;

  // The open product is brought back into view when the modal comes back.
  useEffect(() => {
    if (!open || state.selectedId == null) return;
    const handle = window.setTimeout(() => document.getElementById(`catalog-card-${state.selectedId}`)?.scrollIntoView({ block: 'nearest' }), 50);
    return () => window.clearTimeout(handle);
    // Only when the modal opens: a card chosen while it is open is already in view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const place = (product: CatalogProduct) => {
    if (!canPlace) return;
    if (onPlace(product)) {
      setRefused(null);
      return;
    }
    setRefused(product.id);
  };

  const roomName = (room: ShelfRoom) => (room === 'other' ? t.design.shelfOther : roomTypeLabel(t, room));
  const colorName = (family: ColorFamily) => (t.design.colorNames as Record<string, string>)[family] ?? family;
  const sortOptions: Array<{ id: CatalogSort; label: string }> = [
    { id: 'priceAsc', label: t.design.catalogSortPriceAsc },
    { id: 'priceDesc', label: t.design.catalogSortPriceDesc },
    { id: 'name', label: t.design.catalogSortName },
  ];
  const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const sectionTitle = 'mb-1.5 mt-4 px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted first:mt-0';
  const filterRow = (active: boolean) => cn('flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-xs transition-colors', active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light hover:text-ink');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(800px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[1200px] flex-col gap-0 overflow-hidden rounded-[18px] p-0"
        // Escape closes the modal and nothing else: the studio's own Escape — give up the
        // piece on the pointer, put the tools down — listens further up and must not hear it.
        // Only while the modal is really open, though: Radix keeps the layer for the beat of
        // the closing animation, and an Escape in that beat is the studio's.
        onEscapeKeyDown={(event) => {
          if (open) event.stopPropagation();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">{t.design.catalogTitle}</DialogTitle>
        <DialogDescription className="sr-only">{t.design.catalogDescription}</DialogDescription>

        {/* ---- header: the title, the count, the search, the sort ---- */}
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3 pr-14">
          <LayoutGrid className="h-5 w-5 shrink-0 text-ink" aria-hidden />
          <h2 className="shrink-0 font-serif text-lg font-semibold text-ink">{t.design.catalogTitle}</h2>
          <span className="shrink-0 text-xs tabular-nums text-ink-muted">{fill(t.design.catalogResults, { n: browse.results.length })}</span>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={searchRef}
              type="search"
              value={state.query}
              onChange={(e) => patch({ query: e.target.value })}
              placeholder={t.design.searchFurniture}
              aria-label={t.design.searchFurniture}
              className="h-9 w-full rounded-[10px] border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
            />
          </div>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
            <span className="hidden sm:inline">{t.design.catalogSort}</span>
            <select value={state.sort} onChange={(e) => patch({ sort: e.target.value as CatalogSort })} className="h-9 rounded-[10px] border border-line bg-white px-2 text-xs text-ink focus:border-ink focus:outline-none">
              {sortOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* ---- left: the filters ---- */}
          <aside className="w-[236px] shrink-0 overflow-y-auto border-r border-line bg-sand-light/40 p-3">
            <p className={sectionTitle}>{t.design.shelfRooms}</p>
            <button type="button" onClick={() => patch({ room: null, kind: '' })} className={filterRow(browse.openRoom === null)}>
              <span className="flex-1 truncate">{t.design.shelfAllRooms}</span>
              <span className="tabular-nums opacity-70">{browse.all}</span>
            </button>
            {browse.rooms.map((room) => {
              const Icon = room.id === 'other' ? Package : roomIcon(room.id);
              const isOpen = browse.openRoom === room.id;
              return (
                <div key={room.id}>
                  <button type="button" onClick={() => patch({ room: isOpen ? null : room.id, kind: '' })} className={filterRow(isOpen)}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">{roomName(room.id)}</span>
                    <span className="tabular-nums opacity-70">{room.count}</span>
                  </button>
                  {/* The open room's kinds, indented under it. */}
                  {isOpen && browse.kinds.length > 0 && (
                    <div className="my-1 ml-3 border-l border-line pl-1.5">
                      <button type="button" onClick={() => patch({ kind: '' })} className={cn(filterRow(browse.openKind === ''), 'h-7')}>
                        <span className="flex-1 truncate">{t.design.allKinds}</span>
                      </button>
                      {browse.kinds.map((kind) => {
                        const Icon = archetypeIcon(kind.id);
                        const active = browse.openKind === kind.id;
                        return (
                          <button key={kind.id} type="button" onClick={() => patch({ kind: active ? '' : kind.id })} className={cn(filterRow(active), 'h-7')}>
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex-1 truncate">{archetypeLabel(kind.id, locale)}</span>
                            <span className="tabular-nums opacity-70">{kind.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <p className={sectionTitle}>{t.design.styleTitle}</p>
            <div className="flex flex-wrap gap-1">
              {STYLE_IDS.map((id) => {
                const active = state.styles.includes(id);
                const own = id === styleId;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    title={own ? `${styleLabel(t, id)} · ${t.design.yourStyle}` : styleLabel(t, id)}
                    onClick={() => patch({ styles: toggle(state.styles, id) })}
                    className={cn('flex h-7 items-center gap-1 rounded-[8px] px-2 text-[11px] font-semibold transition-colors', active && own ? 'bg-brand text-white' : active ? 'bg-ink text-white' : own ? 'text-ink ring-1 ring-inset ring-brand/40 hover:bg-sand-light' : 'text-ink-soft ring-1 ring-inset ring-line hover:bg-sand-light hover:text-ink')}
                  >
                    {own && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? 'bg-white' : 'bg-brand')} aria-hidden />}
                    {styleLabel(t, id)}
                  </button>
                );
              })}
            </div>

            {browse.swatches.length > 0 && (
              <>
                <p className={sectionTitle}>{t.design.shelfColors}</p>
                <div className="flex flex-wrap items-center gap-1 px-1" role="group" aria-label={t.design.shelfColors}>
                  {browse.swatches.map((swatch) => {
                    const active = browse.wantedColors.includes(swatch.id);
                    return (
                      <button
                        key={swatch.id}
                        type="button"
                        aria-pressed={active}
                        title={`${colorName(swatch.id)} · ${swatch.count}`}
                        aria-label={colorName(swatch.id)}
                        onClick={() => patch({ colors: toggle(state.colors, swatch.id) })}
                        className={cn('grid h-7 w-7 place-items-center rounded-full transition-shadow', active ? 'ring-2 ring-ink ring-offset-1' : 'hover:ring-2 hover:ring-line hover:ring-offset-1')}
                      >
                        <span className="block h-5 w-5 rounded-full border border-black/15" style={{ backgroundColor: swatch.hex }} />
                      </button>
                    );
                  })}
                  {browse.wantedColors.length > 0 && (
                    <button type="button" onClick={() => patch({ colors: [] })} title={t.design.shelfNoColor} aria-label={t.design.shelfNoColor} className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:text-ink">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </>
            )}

            <p className={sectionTitle}>{t.design.catalogPrice}</p>
            <div className="flex items-center gap-1.5 px-1">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={state.priceMin ?? ''}
                onChange={(e) => patch({ priceMin: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                placeholder={browse.price ? String(Math.floor(browse.price.min)) : t.design.catalogPriceFrom}
                aria-label={t.design.catalogPriceFrom}
                className="h-8 w-full min-w-0 rounded-[8px] border border-line bg-white px-2 text-xs tabular-nums text-ink focus:border-ink focus:outline-none"
              />
              <span className="text-ink-faint">–</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={state.priceMax ?? ''}
                onChange={(e) => patch({ priceMax: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                placeholder={browse.price ? String(Math.ceil(browse.price.max)) : t.design.catalogPriceTo}
                aria-label={t.design.catalogPriceTo}
                className="h-8 w-full min-w-0 rounded-[8px] border border-line bg-white px-2 text-xs tabular-nums text-ink focus:border-ink focus:outline-none"
              />
            </div>

            {browse.stores.length > 0 && (
              <>
                <p className={sectionTitle}>{t.design.catalogStore}</p>
                <select value={browse.storeId ?? ''} onChange={(e) => patch({ storeId: e.target.value === '' ? null : Number(e.target.value) })} aria-label={t.design.catalogStore} className="mx-1 h-8 w-[calc(100%-0.5rem)] rounded-[8px] border border-line bg-white px-2 text-xs text-ink focus:border-ink focus:outline-none">
                  <option value="">{t.design.catalogAllStores}</option>
                  {browse.stores.map(({ store, count }) => (
                    <option key={store.id} value={store.id}>
                      {localizedName(locale, store)} · {count}
                    </option>
                  ))}
                </select>
              </>
            )}

            {hasCatalogFilters(state) && (
              <button type="button" onClick={() => onState({ ...initialCatalogBrowserState(), sort: state.sort, selectedId: state.selectedId })} className="mt-4 flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] border border-line bg-white text-xs font-semibold text-ink-soft hover:border-ink hover:text-ink">
                <X className="h-3.5 w-3.5" />
                {t.design.catalogClear}
              </button>
            )}
          </aside>

          {/* ---- middle: the products ---- */}
          <section className="min-w-0 flex-1 overflow-y-auto p-4" aria-label={t.design.catalogTitle}>
            {browse.results.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="max-w-sm text-sm text-ink-muted">{t.design.catalogNoResults}</p>
                {hasCatalogFilters(state) && (
                  <button type="button" onClick={() => onState({ ...initialCatalogBrowserState(), sort: state.sort })} className="h-8 rounded-[8px] bg-ink px-3 text-xs font-semibold text-white hover:bg-brand">
                    {t.design.catalogClear}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {browse.results.map((p) => {
                  const name = localizedName(locale, p);
                  const active = state.selectedId === p.id;
                  const seller = (p.store ? localizedName(locale, p.store) : null) ?? p.brand ?? archetypeLabel(p.model3dKind!, locale);
                  return (
                    // A card is a button that holds a button (place), so it is a div with the role.
                    <div
                      key={p.id}
                      id={`catalog-card-${p.id}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={active}
                      onClick={() => patch({ selectedId: p.id })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          patch({ selectedId: p.id });
                        }
                      }}
                      className={cn('group flex cursor-pointer flex-col overflow-hidden rounded-[12px] border bg-white text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink', active ? 'border-ink ring-1 ring-ink' : refused === p.id ? 'border-danger' : 'border-line hover:border-ink/60')}
                    >
                      <span className="relative block aspect-square w-full bg-bg-base">
                        {p.imageUrl ? <Image src={p.imageUrl} alt={name} fill sizes="180px" className="pointer-events-none object-cover transition-transform group-hover:scale-105" /> : <span className="block h-full w-full" style={{ backgroundColor: p.colorHex ?? '#DDD8CF' }} />}
                      </span>
                      <span className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
                        <span className="line-clamp-2 text-xs font-medium leading-snug text-ink">{name}</span>
                        <span className="truncate text-[10px] text-ink-muted">{seller}</span>
                        <span className="mt-auto flex items-center justify-between gap-2 pt-1">
                          <span className="text-sm font-semibold tabular-nums text-ink">{formatGEL(p.pricePerUnit)}</span>
                          <button
                            type="button"
                            disabled={!canPlace}
                            title={canPlace ? placeLabel : t.design.catalogPlaceWalk}
                            aria-label={placeLabel}
                            onClick={(e) => {
                              e.stopPropagation();
                              place(p);
                            }}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-ink text-white transition-colors hover:bg-brand disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <MousePointerClick className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- right: the open product ---- */}
          <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-line p-4">
            {selected ? (
              <ProductDetails product={selected} locale={locale} styleId={styleId} roomLabel={roomLabel} canPlace={canPlace} placeLabel={placeLabel} refused={refused === selected.id} onPlace={() => place(selected)} />
            ) : (
              <p className="m-auto max-w-[220px] text-center text-sm text-ink-muted">{t.design.catalogPickOne}</p>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductDetails({ product: p, locale, styleId, roomLabel, canPlace, placeLabel, refused, onPlace }: { product: CatalogProduct; locale: ReturnType<typeof useLocale>; styleId: StyleId; roomLabel: string; canPlace: boolean; placeLabel: string; refused: boolean; onPlace: () => void }) {
  const t = useT();
  const name = localizedName(locale, p);
  const size = p.widthCm && p.depthCm && p.heightCm ? `${p.widthCm} × ${p.depthCm} × ${p.heightCm} ${t.units.cm}` : null;
  const styles = productStyles(p);
  const families = productColorFamilies(p);
  const colorName = (family: ColorFamily) => (t.design.colorNames as Record<string, string>)[family] ?? family;
  return (
    <>
      <div className="relative aspect-square w-full overflow-hidden rounded-[12px] border border-line bg-bg-base">
        {p.imageUrl ? <Image src={p.imageUrl} alt={name} fill sizes="300px" className="object-contain" /> : <span className="block h-full w-full" style={{ backgroundColor: p.colorHex ?? '#DDD8CF' }} />}
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{archetypeLabel(p.model3dKind!, locale)}</p>
      <h3 className="mt-0.5 font-serif text-base font-semibold leading-snug text-ink">{name}</h3>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatGEL(p.pricePerUnit)}</p>

      <dl className="mt-3 space-y-1.5 text-xs">
        {p.store && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-ink-muted">{t.design.catalogStore}</dt>
            <dd className="text-right text-ink">
              {localizedName(locale, p.store)}
              {p.store.deliveryDays != null && <span className="block text-[10px] text-ink-muted">{fill(t.design.catalogDelivery, { n: p.store.deliveryDays })}</span>}
            </dd>
          </div>
        )}
        {p.brand && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-ink-muted">{t.design.catalogBrand}</dt>
            <dd className="text-right text-ink">{p.brand}</dd>
          </div>
        )}
        {size && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-ink-muted">{t.design.catalogDimensions}</dt>
            <dd className="text-right tabular-nums text-ink">{size}</dd>
          </div>
        )}
        {styles.length > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-ink-muted">{t.design.styleTitle}</dt>
            <dd className="flex flex-wrap justify-end gap-1">
              {styles.map((id) => (
                <span key={id} className={cn('rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold', id === styleId ? 'bg-brand/10 text-brand' : 'bg-sand-light text-ink-soft')}>
                  {styleLabel(t, id)}
                </span>
              ))}
            </dd>
          </div>
        )}
        {families.length > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-ink-muted">{t.design.shelfColors}</dt>
            <dd className="flex items-center gap-1">
              {families.map((family) => (
                <span key={family} title={colorName(family)} className="block h-4 w-4 rounded-full border border-black/15" style={{ backgroundColor: COLOR_FAMILIES.find((f) => f.id === family)?.hex }} />
              ))}
            </dd>
          </div>
        )}
      </dl>

      <a href={`/catalog/${p.slug}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-soft underline-offset-2 hover:text-ink hover:underline">
        <ExternalLink className="h-3.5 w-3.5" />
        {t.design.productPage}
      </a>

      <div className="mt-auto pt-4">
        <p className="mb-1.5 truncate text-[11px] text-ink-muted">{fill(t.design.catalogPlaceInto, { room: roomLabel })}</p>
        <button type="button" disabled={!canPlace} onClick={onPlace} className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-ink text-sm font-semibold text-white transition-colors hover:bg-brand disabled:cursor-not-allowed disabled:opacity-40">
          <MousePointerClick className="h-4 w-4" />
          {placeLabel}
        </button>
        <p className={cn('mt-2 text-[11px] leading-relaxed', canPlace ? 'text-ink-muted' : 'text-warning')}>{canPlace ? t.design.catalogPlaceNote : t.design.catalogPlaceWalk}</p>
        {refused && (
          <p role="alert" className="mt-2 text-[11px] text-danger">
            {t.design.noSpaceForItem}
          </p>
        )}
      </div>
    </>
  );
}
