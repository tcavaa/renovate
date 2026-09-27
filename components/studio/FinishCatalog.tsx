'use client';

/**
 * Every floor and wall finish and every moulding in a modal — the finishes tray's
 * "catalogue", the way `CatalogBrowser` is the furniture shelf's. A search box, the filters
 * down the left (what is being finished, the category, the ones made for bathrooms, styles,
 * colours, a price band by the square metre, the shop), the finishes as cards, and the open
 * one on the right: its texture tiled at its real size over two metres by two, its price by
 * the square metre, the shop — and where it goes, with the one button that matters.
 *
 * The surface and the brush size are the tray's own (the page holds them): switching the
 * surface here switches the tray, and the pick does what a swatch on the shelf does — in a
 * painting scope it becomes the brush, otherwise it is laid on the room or the wall at once.
 * Either way the modal folds to a chip (the page's) so the room is in view; the chip opens it
 * again with the search, the filters and the open finish as they were (`state`, kept by the
 * page, since Radix unmounts a closed dialog).
 */

import Image from 'next/image';
import { useEffect, useMemo, useRef } from 'react';
import { Check, Droplets, ExternalLink, LayoutGrid, Package, PaintBucket, Paintbrush, Search, Square, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NodeIcon } from '@/components/ui/node-icon';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, styleLabel, unitLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { productStyles } from '@/lib/design/catalogBrowser';
import { COLOR_FAMILIES, productColorFamilies, type ColorFamily } from '@/lib/design/colors';
import { browseFinishes, hasFinishFilters, initialFinishBrowserState, isTrimFinishSurface, isWetFinish, type FinishBrowserState, type FinishSort, type FinishSurface } from '@/lib/design/finishBrowser';
import type { CatalogProduct } from '@/lib/design/matcher';
import { shelfIndex, shelfName, type ShelfData } from '@/lib/design/shelf';
import { STYLE_IDS } from '@/lib/design/styles';
import { surfaceSpecs } from '@/lib/design/surfaces';
import { trimSpecs } from '@/lib/design/trims';
import type { PlanRoom, StyleId } from '@/lib/design/types';
import type { IconNode } from '@/lib/admin/icons';
import { cn, formatGEL } from '@/lib/utils';
import { finishPriceLabel, finishScopeChips, finishSurfaceLabel, isPaintScope, SURFACE_TABS, type FinishScope } from './Trays';

/** A subcategory sits further in than the category above it. */
const DEPTH_INDENT = ['pl-2', 'pl-5', 'pl-8'];
/** The detail preview shows this much of a surface, so a mosaic and a big slab read at their real sizes. */
const PREVIEW_M = 2;

function CategoryIcon({ node }: { node: IconNode | null | undefined }) {
  return node ? <NodeIcon node={node} className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5 shrink-0" />;
}

export function FinishCatalog({
  open,
  onOpenChange,
  catalog,
  shelf,
  styleId,
  surface,
  onSurface,
  scope,
  onScope,
  hasWall,
  flat,
  room,
  areaLabel,
  currentId,
  state,
  onState,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: CatalogProduct[];
  /** The category tree the finishes are filed in. */
  shelf: ShelfData;
  styleId: StyleId;
  /** The tray's surface: what is being finished. */
  surface: FinishSurface;
  onSurface: (surface: FinishSurface) => void;
  /** The tray's scope: where a pick goes. */
  scope: FinishScope;
  onScope: (scope: FinishScope) => void;
  /** A wall is selected, so "this wall" can be chosen. */
  hasWall: boolean;
  /** The 2D board is the view: a square metre of wall cannot be pointed at. */
  flat: boolean;
  /** The room a pick goes on; null is every room. */
  room: PlanRoom | null;
  areaLabel: string | null;
  /** What is on the target now, or in the brush (see `FinishesTray`). */
  currentId: number | null | 'mixed' | undefined;
  state: FinishBrowserState;
  onState: (state: FinishBrowserState) => void;
  /** Lays the finish where the scope says, or puts it in the brush. */
  onPick: (product: CatalogProduct) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const searchRef = useRef<HTMLInputElement>(null);
  const index = useMemo(() => shelfIndex(shelf), [shelf]);
  const browse = useMemo(() => browseFinishes(catalog, state, { surface, room, styleId, locale, tree: index.tree }), [catalog, state, surface, room, styleId, locale, index]);
  const patch = (next: Partial<FinishBrowserState>) => onState({ ...state, ...next });
  const selected = state.selectedId != null ? (catalog.find((p) => p.id === state.selectedId) ?? null) : null;
  const trim = isTrimFinishSurface(surface);
  const painting = isPaintScope(scope);
  const chips = finishScopeChips(t, surface, { hasWall, flat });
  const pickLabel = painting ? t.design.finishTakeBrush : scope === 'wall' ? t.design.finishLayWall : room ? t.design.finishLayRoom : t.design.finishLayAllRooms;
  const PickIcon = painting ? Paintbrush : scope === 'wall' ? Square : LayoutGrid;

  // The open finish is brought back into view when the modal comes back.
  useEffect(() => {
    if (!open || state.selectedId == null) return;
    const handle = window.setTimeout(() => document.getElementById(`finish-card-${state.selectedId}`)?.scrollIntoView({ block: 'nearest' }), 50);
    return () => window.clearTimeout(handle);
    // Only when the modal opens: a card chosen while it is open is already in view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const categoryDef = (id: number) => index.tree.byId.get(id) ?? null;
  // Choosing the open category again steps back to the one above it.
  const chooseCategory = (id: number) => {
    if (browse.openCategory !== id) return patch({ category: id });
    const entry = browse.categories.find((c) => c.id === id);
    const parent = entry && entry.depth > 0 ? [...browse.categories.slice(0, browse.categories.indexOf(entry))].reverse().find((c) => c.depth === entry.depth - 1) : undefined;
    patch({ category: parent?.id ?? null });
  };
  const colorName = (family: ColorFamily) => (t.design.colorNames as Record<string, string>)[family] ?? family;
  const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const sortOptions: Array<{ id: FinishSort; label: string }> = [
    { id: 'best', label: t.design.catalogSortBest },
    { id: 'priceAsc', label: t.design.catalogSortPriceAsc },
    { id: 'priceDesc', label: t.design.catalogSortPriceDesc },
    { id: 'name', label: t.design.catalogSortName },
  ];
  const sectionTitle = 'mb-1.5 mt-4 px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted first:mt-0';
  const filterRow = (active: boolean) => cn('flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-xs transition-colors', active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light hover:text-ink');
  const clearFilters = () => onState({ ...initialFinishBrowserState(), sort: state.sort, selectedId: state.selectedId });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(800px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[1200px] flex-col gap-0 overflow-hidden rounded-[18px] p-0"
        // Escape closes the modal and nothing else: the studio's own Escape — put the brush
        // down — listens further up and must not hear it (see `CatalogBrowser`).
        onEscapeKeyDown={(event) => {
          if (open) event.stopPropagation();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">{t.design.finishCatalogTitle}</DialogTitle>
        <DialogDescription className="sr-only">{t.design.finishCatalogDescription}</DialogDescription>

        {/* ---- header: the title, the count, the search, the sort ---- */}
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3 pr-14">
          <PaintBucket className="h-5 w-5 shrink-0 text-ink" aria-hidden />
          <h2 className="shrink-0 font-serif text-lg font-semibold text-ink">{t.design.finishCatalogTitle}</h2>
          <span className="shrink-0 text-xs tabular-nums text-ink-muted">{fill(t.design.finishCatalogResults, { n: browse.results.length })}</span>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={searchRef}
              type="search"
              value={state.query}
              onChange={(e) => patch({ query: e.target.value })}
              placeholder={t.design.finishSearch}
              aria-label={t.design.finishSearch}
              className="h-9 w-full rounded-[10px] border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
            />
          </div>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
            <span className="hidden sm:inline">{t.design.catalogSort}</span>
            <select value={state.sort} onChange={(e) => patch({ sort: e.target.value as FinishSort })} className="h-9 rounded-[10px] border border-line bg-white px-2 text-xs text-ink focus:border-ink focus:outline-none">
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
            <p className={sectionTitle}>{t.design.finishSurfaceTitle}</p>
            <div role="tablist" aria-label={t.design.finishSurfaceTitle}>
              {SURFACE_TABS.map(({ id, icon: Icon }) => {
                const count = browse.surfaces.find((s) => s.id === id)?.count ?? 0;
                return (
                  <button key={id} type="button" role="tab" aria-selected={surface === id} onClick={() => surface !== id && onSurface(id)} className={filterRow(surface === id)}>
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', id === 'cornice' && 'rotate-180')} />
                    <span className="flex-1 truncate">{finishSurfaceLabel(t, id)}</span>
                    <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>

            {browse.categories.length > 0 && (
              <>
                <p className={sectionTitle}>{t.design.finishCategories}</p>
                <button type="button" onClick={() => patch({ category: null })} className={cn(filterRow(browse.openCategory === null), 'h-7')}>
                  <span className="flex-1 truncate">{t.design.allKinds}</span>
                </button>
                {browse.categories.map((c) => {
                  const def = categoryDef(c.id);
                  return (
                    <button key={`${c.depth}-${c.id}`} type="button" onClick={() => chooseCategory(c.id)} className={cn(filterRow(browse.openCategory === c.id), 'h-7', DEPTH_INDENT[c.depth] ?? DEPTH_INDENT[DEPTH_INDENT.length - 1])}>
                      <CategoryIcon node={def?.icon} />
                      <span className="flex-1 truncate">{def ? shelfName(def, locale) : ''}</span>
                      <span className="tabular-nums opacity-70">{c.count}</span>
                    </button>
                  );
                })}
              </>
            )}

            {/* Tiles and paints that take water — the only thing a bathroom asks of a finish. */}
            {browse.wetCount > 0 && (
              <button type="button" aria-pressed={browse.wetOn} onClick={() => patch({ wet: !state.wet })} className={cn(filterRow(browse.wetOn), 'mt-3')}>
                <Droplets className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{t.design.finishWetFilter}</span>
                <span className="tabular-nums opacity-70">{browse.wetCount}</span>
              </button>
            )}

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

            <p className={sectionTitle}>{trim ? t.design.finishPriceM : t.design.finishPriceM2}</p>
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

            {hasFinishFilters(state) && (
              <button type="button" onClick={clearFilters} className="mt-4 flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] border border-line bg-white text-xs font-semibold text-ink-soft hover:border-ink hover:text-ink">
                <X className="h-3.5 w-3.5" />
                {t.design.catalogClear}
              </button>
            )}
          </aside>

          {/* ---- middle: the finishes ---- */}
          <section className="min-w-0 flex-1 overflow-y-auto p-4" aria-label={t.design.finishCatalogTitle}>
            {browse.results.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="max-w-sm text-sm text-ink-muted">{browse.total === 0 ? t.design.noAlternatives : t.design.catalogNoResults}</p>
                {hasFinishFilters(state) && (
                  <button type="button" onClick={clearFilters} className="h-8 rounded-[8px] bg-ink px-3 text-xs font-semibold text-white hover:bg-brand">
                    {t.design.catalogClear}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {browse.results.map((p) => {
                  const name = localizedName(locale, p);
                  const active = state.selectedId === p.id;
                  const onIt = currentId === p.id;
                  const picture = trim ? p.imageUrl : p.textureUrl;
                  const seller = (p.store ? localizedName(locale, p.store) : null) ?? p.brand;
                  return (
                    // A card is a button that holds a button (pick), so it is a div with the role.
                    <div
                      key={p.id}
                      id={`finish-card-${p.id}`}
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
                      className={cn('group flex cursor-pointer flex-col overflow-hidden rounded-[12px] border bg-white text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink', active ? 'border-ink ring-1 ring-ink' : onIt ? 'border-brand' : 'border-line hover:border-ink/60')}
                    >
                      <span className="relative block aspect-square w-full bg-bg-base">
                        {picture ? <Image src={picture} alt={name} fill sizes="180px" className="pointer-events-none object-cover transition-transform group-hover:scale-105" /> : <span className="block h-full w-full" style={{ backgroundColor: p.colorHex ?? '#DDD8CF' }} />}
                        {onIt && (
                          <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-[6px] bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            <Check className="h-3 w-3" />
                            {painting ? t.design.finishInBrush : t.design.finishNow}
                          </span>
                        )}
                        {!trim && isWetFinish(p) && (
                          <span title={t.design.finishWetBadge} className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-ink-soft">
                            <Droplets className="h-3 w-3" />
                          </span>
                        )}
                      </span>
                      <span className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
                        <span className="line-clamp-2 text-xs font-medium leading-snug text-ink">{name}</span>
                        <span className="truncate text-[10px] text-ink-muted">{seller ?? ' '}</span>
                        <span className="mt-auto flex items-center justify-between gap-2 pt-1">
                          <span className="text-sm font-semibold tabular-nums text-ink">{finishPriceLabel(t, p, surface)}</span>
                          <button
                            type="button"
                            title={pickLabel}
                            aria-label={pickLabel}
                            onClick={(e) => {
                              e.stopPropagation();
                              onPick(p);
                            }}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-ink text-white transition-colors hover:bg-brand"
                          >
                            <PickIcon className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- right: the open finish; its details scroll, where it goes and the button stay ---- */}
          <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-line">
            <div className="px-4 pt-4">
              {selected ? (
                <FinishDetails product={selected} surface={surface} styleId={styleId} />
              ) : (
                <p className="mx-auto max-w-[220px] py-16 text-center text-sm text-ink-muted">{t.design.finishPickOne}</p>
              )}
            </div>

            {/* Where it goes — the tray's brush sizes — and the button. */}
            <div className="sticky bottom-0 mt-auto border-t border-line/60 bg-white p-4 pt-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.applyTo}</p>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t.build.applyTo}>
                {chips.map((c) => {
                  const Icon = c.icon;
                  return (
                    <button key={c.id} type="button" role="radio" aria-checked={scope === c.id} disabled={c.disabled} title={c.title ?? c.label} onClick={() => onScope(c.id)} className={cn('flex h-7 items-center gap-1 rounded-[7px] px-2 text-[11px] font-medium disabled:opacity-40', scope === c.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft hover:border-ink')}>
                      <Icon className="h-3 w-3 shrink-0" />
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 truncate text-[11px] text-ink-muted">
                {room?.name ?? t.design.finishForAllRooms}
                {areaLabel && !painting ? ` · ${areaLabel}` : ''}
              </p>
              <button type="button" disabled={!selected} onClick={() => selected && onPick(selected)} className="mt-1.5 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-ink text-sm font-semibold text-white transition-colors hover:bg-brand disabled:cursor-not-allowed disabled:opacity-40">
                <PickIcon className="h-4 w-4" />
                {pickLabel}
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">{painting ? t.design.finishBrushNote : t.design.finishApplyNote}</p>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The open finish: its texture over two metres by two (a moulding's photo), its price, where it is from and what it is. */
function FinishDetails({ product: p, surface, styleId }: { product: CatalogProduct; surface: FinishSurface; styleId: StyleId }) {
  const t = useT();
  const locale = useLocale();
  const name = localizedName(locale, p);
  const trim = isTrimFinishSurface(surface);
  const specs = surfaceSpecs(p);
  const moulding = trimSpecs(p);
  const styles = productStyles(p);
  const families = productColorFamilies(p);
  const colorName = (family: ColorFamily) => (t.design.colorNames as Record<string, string>)[family] ?? family;
  // Sold by the litre or the pack: what one unit costs and how far it goes.
  const perUnit = !trim && p.unit !== 'm2' ? `${formatGEL(p.pricePerUnit)} / ${unitLabel(t, p.unit)}` : null;
  const scaleM = specs.textureScaleM ?? 1.5;
  const tilePx = Math.max(24, Math.round((scaleM / PREVIEW_M) * 268));
  const surfaces = (specs.surfaces ?? []).map((s) => (s === 'floor' ? t.design.finishFloor : t.design.finishWall)).join(' · ');
  const heightCm = moulding.heightCm ?? p.heightCm;
  const depthCm = moulding.depthCm ?? p.depthCm;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
  return (
    <>
      {trim || !p.textureUrl ? (
        <div className="relative aspect-square w-full overflow-hidden rounded-[12px] border border-line bg-bg-base">
          {p.imageUrl ? <Image src={p.imageUrl} alt={name} fill sizes="300px" className="object-contain" /> : <span className="block h-full w-full" style={{ backgroundColor: p.colorHex ?? '#DDD8CF' }} />}
        </div>
      ) : (
        // The texture repeated at its real size: a mosaic reads as a mosaic, a slab as a slab.
        <div className="relative aspect-square w-full overflow-hidden rounded-[12px] border border-line bg-bg-base" style={{ backgroundImage: `url("${p.textureUrl}")`, backgroundSize: `${tilePx}px ${tilePx}px`, backgroundRepeat: 'repeat' }} role="img" aria-label={name}>
          <span className="absolute bottom-1.5 left-1.5 rounded-[6px] bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink">{t.design.finishPreviewSize}</span>
        </div>
      )}
      <h3 className="mt-3 font-serif text-base font-semibold leading-snug text-ink">{name}</h3>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{finishPriceLabel(t, p, surface)}</p>
      {perUnit && <p className="text-[11px] tabular-nums text-ink-muted">{p.coveragePerUnit ? fill(t.design.finishPerUnitCoverage, { price: perUnit, m2: String(p.coveragePerUnit) }) : perUnit}</p>}

      <dl className="mt-3 space-y-1.5 text-xs">
        {p.store &&
          row(
            t.design.catalogStore,
            <>
              {localizedName(locale, p.store)}
              {p.store.deliveryDays != null && <span className="block text-[10px] text-ink-muted">{fill(t.design.catalogDelivery, { n: p.store.deliveryDays })}</span>}
            </>
          )}
        {p.brand && row(t.design.catalogBrand, p.brand)}
        {!trim && surfaces && row(t.design.finishSurfacesLabel, surfaces)}
        {!trim && isWetFinish(p) && row(t.design.finishWetBadge, t.common.yes)}
        {!trim && p.textureUrl && row(t.design.finishRepeat, `${scaleM} ${t.units.m}`)}
        {trim && moulding.profile && row(t.design.finishProfile, (t.design.trimProfiles as Record<string, string>)[moulding.profile] ?? moulding.profile)}
        {trim && heightCm != null && depthCm != null && row(t.design.finishTrimSize, `${heightCm} × ${depthCm} ${t.units.cm}`)}
        {styles.length > 0 &&
          row(
            t.design.styleTitle,
            <span className="flex flex-wrap justify-end gap-1">
              {styles.map((id) => (
                <span key={id} className={cn('rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold', id === styleId ? 'bg-brand/10 text-brand' : 'bg-sand-light text-ink-soft')}>
                  {styleLabel(t, id)}
                </span>
              ))}
            </span>
          )}
        {families.length > 0 &&
          row(
            t.design.shelfColors,
            <span className="flex items-center justify-end gap-1">
              {families.map((family) => (
                <span key={family} title={colorName(family)} className="block h-4 w-4 rounded-full border border-black/15" style={{ backgroundColor: COLOR_FAMILIES.find((f) => f.id === family)?.hex }} />
              ))}
            </span>
          )}
      </dl>

      <a href={`/catalog/${p.slug}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-soft underline-offset-2 hover:text-ink hover:underline">
        <ExternalLink className="h-3.5 w-3.5" />
        {t.design.productPage}
      </a>
    </>
  );
}
