/**
 * The floor and wall finishes and the mouldings as the studio lets a person browse them.
 *
 * Two places read this. The finishes tray's shelf (`narrowFinishShelf`) is narrowed the way
 * the furniture shelf is — by style and by colour, each colour family counted on the shelf as
 * it stands. The finishes catalogue (`browseFinishes`, the modal behind the tray's
 * "catalogue" button) adds what a shelf of twenty swatches never needed and a catalogue of
 * hundreds of tiles cannot do without: a query across names, brands, shops and categories,
 * the category (laminate, tiles, paint… and admin's subcategories under them), the finishes
 * made for bathrooms, a price band by the square metre (by the running metre for a moulding),
 * a shop, a sort, and a count on every control. The surface — floor, walls, skirting, cornice —
 * is the tray's own: the modal shows the one the tray is on and switches it for both.
 *
 * Pure: the tray and the modal render what this returns, and the tests read it.
 */

import type { Locale } from '@/lib/i18n';
import { localizedName } from '@/lib/i18n/labels';
import { flattenTree, pathOf, type CategoryTree } from '@/lib/catalog/tree';
import { productStyles } from './catalogBrowser';
import { COLOR_FAMILIES, productColorFamilies, type ColorFamily } from './colors';
import type { CatalogProduct } from './matcher';
import type { ShelfCategory } from './shelf';
import { pricePerM2, surfaceOptions, surfaceSpecs } from './surfaces';
import { hasTrims, trimOptions } from './trims';
import type { PlanRoom, SceneStore, StyleId } from './types';

/** What the finishes tray finishes: a room's floor or walls, or the mouldings along them. */
export type FinishSurface = 'floor' | 'wall' | 'skirting' | 'cornice';
export const FINISH_SURFACES: FinishSurface[] = ['floor', 'wall', 'skirting', 'cornice'];

export function isTrimFinishSurface(surface: FinishSurface): surface is 'skirting' | 'cornice' {
  return surface === 'skirting' || surface === 'cornice';
}

/**
 * Everything a surface can be given, best first — for a floor or walls what suits the room
 * (a wet one in a bathroom) ahead, then the style, then the price (`surfaceOptions`); for a
 * moulding the style's own, then the price (`trimOptions`).
 */
export function finishOptions(catalog: CatalogProduct[], surface: FinishSurface, room: PlanRoom | null, styleId: StyleId): CatalogProduct[] {
  // A balcony has no skirting or cornice to choose (`hasTrims`).
  if (isTrimFinishSurface(surface)) return room && !hasTrims(room) ? [] : trimOptions(catalog, surface, styleId);
  return surfaceOptions(catalog, surface, room, styleId);
}

/** The price finishes are compared by: per m² on a floor or a wall (paint by the litre over its coverage), per running metre for a moulding. */
export function finishUnitPrice(product: CatalogProduct, surface: FinishSurface): number {
  return isTrimFinishSurface(surface) ? product.pricePerUnit : pricePerM2(product);
}

/** Made for bathrooms — tiles, not a laminate. */
export function isWetFinish(product: CatalogProduct): boolean {
  return !!surfaceSpecs(product).wet;
}

// ---------------------------------------------------------------------------
// The tray's shelf
// ---------------------------------------------------------------------------

export interface FinishShelf {
  /** The swatches after the style and the colour, in the order they came. */
  results: CatalogProduct[];
  /** One swatch per colour family on the shelf after the style, with a count. */
  swatches: Array<{ id: ColorFamily; hex: string; count: number }>;
  /** The colours ticked that the shelf actually has: a tick nothing answers to stands aside. */
  wantedColors: ColorFamily[];
}

/**
 * The finishes tray's shelf, narrowed like the furniture shelf: to the styles ticked (none
 * ticked is every style), then to the colours ticked — counted after the style, so a swatch
 * says what choosing it would leave, and a colour the style has emptied stands aside rather
 * than emptying the shelf.
 */
export function narrowFinishShelf(options: CatalogProduct[], styles: readonly StyleId[], colors: readonly ColorFamily[]): FinishShelf {
  const styled = styles.length === 0 ? options : options.filter((p) => productStyles(p).some((s) => styles.includes(s)));
  const { swatches, wantedColors, results } = byColor(styled, colors);
  return { results, swatches, wantedColors };
}

function byColor(list: CatalogProduct[], colors: readonly ColorFamily[]) {
  const counts = new Map<ColorFamily, number>();
  for (const p of list) for (const family of productColorFamilies(p)) counts.set(family, (counts.get(family) ?? 0) + 1);
  const swatches = COLOR_FAMILIES.filter((family) => counts.has(family.id)).map((family) => ({ id: family.id, hex: family.hex, count: counts.get(family.id)! }));
  const wantedColors = colors.filter((c) => counts.has(c));
  const results = wantedColors.length === 0 ? list : list.filter((p) => productColorFamilies(p).some((family) => wantedColors.includes(family)));
  return { swatches, wantedColors, results };
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export type FinishSort = 'best' | 'priceAsc' | 'priceDesc' | 'name';

/**
 * Everything the finishes catalogue's controls hold. It lives in the studio page, not in the
 * modal, so that picking a finish, painting with it and coming back finds the search, the
 * filters and the open product as they were left.
 */
export interface FinishBrowserState {
  query: string;
  /** A category the surface's finishes are filed under (laminate, floor tiles… or one under them); null for all. */
  category: number | null;
  /** Only finishes made for bathrooms. */
  wet: boolean;
  styles: StyleId[];
  colors: ColorFamily[];
  /** By the square metre for a floor or walls, by the running metre for a moulding. */
  priceMin: number | null;
  priceMax: number | null;
  storeId: number | null;
  sort: FinishSort;
  /** The product whose details are open. */
  selectedId: number | null;
}

export function initialFinishBrowserState(): FinishBrowserState {
  return { query: '', category: null, wet: false, styles: [], colors: [], priceMin: null, priceMax: null, storeId: null, sort: 'best', selectedId: null };
}

/** Whether anything narrows the list — what the "clear filters" button undoes. */
export function hasFinishFilters(state: FinishBrowserState): boolean {
  return state.query.trim() !== '' || state.category != null || state.wet || state.styles.length > 0 || state.colors.length > 0 || state.priceMin != null || state.priceMax != null || state.storeId != null;
}

export interface FinishBrowse {
  /** What the list shows, in the chosen order. */
  results: CatalogProduct[];
  /** Every finish the surface can be given, before any filter. */
  total: number;
  /** Each surface with how many finishes it has after the query and the styles — what switching to it would show. */
  surfaces: Array<{ id: FinishSurface; count: number }>;
  /**
   * The categories the surface's finishes are filed under, with counts — laminate, floor
   * tiles, paint… — and under the chosen one its subcategories (`depth` 1, 2), in the tree's
   * order; `opens` when a category has finishes further down.
   */
  categories: Array<{ id: number; count: number; depth: number; opens: boolean }>;
  /** The category the list is narrowed to, if it still has anything in it. */
  openCategory: number | null;
  /** How many of the list (before the bathroom filter) are made for bathrooms. */
  wetCount: number;
  /** The bathroom filter is ticked and something answers it. */
  wetOn: boolean;
  swatches: Array<{ id: ColorFamily; hex: string; count: number }>;
  wantedColors: ColorFamily[];
  /** The shops with something on the list after the query, styles and price band. */
  stores: Array<{ store: SceneStore; count: number }>;
  storeId: number | null;
  /** The cheapest and dearest finish of the surface, for the price band's placeholders. */
  price: { min: number; max: number } | null;
}

/**
 * The list for a state. The filters apply from the outside in — the query, the styles and
 * the price band first, then the shop, the bathroom filter, the category, the colour last —
 * and each control's counts are read off the list *before* that control narrows it, so a
 * control says what choosing it would leave. A shop, a category, a colour or the bathroom
 * filter that the rest has emptied stands aside instead of emptying the list.
 */
export function browseFinishes(
  catalog: CatalogProduct[],
  state: FinishBrowserState,
  opts: { surface: FinishSurface; room: PlanRoom | null; styleId: StyleId; locale: Locale; tree: CategoryTree<ShelfCategory> }
): FinishBrowse {
  const { surface, tree } = opts;
  const q = state.query.trim().toLowerCase();

  // Where each finish sits below the category the studio knows it by: laminate → oak laminate.
  const relPaths = new Map<number, number[]>();
  const rel = (p: CatalogProduct): number[] => {
    let known = relPaths.get(p.id);
    if (!known) {
      const path = p.categoryId != null ? pathOf(tree, p.categoryId) : [];
      let top = 0;
      for (let i = path.length - 1; i >= 0; i--) {
        if (path[i].slug === p.categorySlug) {
          top = i;
          break;
        }
      }
      known = path.slice(top).map((c) => c.id);
      relPaths.set(p.id, known);
    }
    return known;
  };

  const matchesQuery = (p: CatalogProduct): boolean => {
    if (!q) return true;
    const categories = p.categoryId != null ? pathOf(tree, p.categoryId).flatMap((c) => [c.nameKa, c.nameEn, c.nameRu]) : [];
    return [p.nameKa, p.nameEn, p.nameRu, p.brand, p.store?.nameKa, p.store?.nameEn, p.store?.nameRu, ...categories].filter(Boolean).join(' ').toLowerCase().includes(q);
  };
  const matchesStyles = (p: CatalogProduct): boolean => state.styles.length === 0 || productStyles(p).some((s) => state.styles.includes(s));
  const matchesPrice = (p: CatalogProduct): boolean => {
    const price = finishUnitPrice(p, surface);
    return (state.priceMin == null || price >= state.priceMin) && (state.priceMax == null || price <= state.priceMax);
  };

  const surfaces = FINISH_SURFACES.map((id) => ({ id, count: finishOptions(catalog, id, opts.room, opts.styleId).filter((p) => matchesQuery(p) && matchesStyles(p)).length }));
  const everything = finishOptions(catalog, surface, opts.room, opts.styleId);
  const broad = everything.filter((p) => matchesQuery(p) && matchesStyles(p) && matchesPrice(p));

  // The shops, counted before the shop narrows the list.
  const storeCounts = new Map<number, { store: SceneStore; count: number }>();
  for (const p of broad) {
    if (!p.store) continue;
    const entry = storeCounts.get(p.store.id);
    if (entry) entry.count += 1;
    else storeCounts.set(p.store.id, { store: p.store, count: 1 });
  }
  const stores = [...storeCounts.values()].sort((a, b) => b.count - a.count || a.store.nameKa.localeCompare(b.store.nameKa));
  const storeId = state.storeId != null && storeCounts.has(state.storeId) ? state.storeId : null;
  const inStore = storeId == null ? broad : broad.filter((p) => p.store?.id === storeId);

  // Made for bathrooms, counted before the filter.
  const wetCount = inStore.filter(isWetFinish).length;
  const wetOn = state.wet && wetCount > 0;
  const base = wetOn ? inStore.filter(isWetFinish) : inStore;

  // The categories: the ones the finishes are filed under, and under the chosen one its
  // subcategories. The chosen one's trail runs from the top category down to it.
  const trailOf = (category: number | null): number[] => {
    if (category == null) return [];
    for (const p of everything) {
      const r = rel(p);
      const at = r.indexOf(category);
      if (at >= 0) return r.slice(0, at + 1);
    }
    return [];
  };
  const trail = trailOf(state.category);
  const held = trail.findIndex((id) => !base.some((p) => rel(p).includes(id)));
  const chosen = held < 0 ? trail : trail.slice(0, held);
  const order = new Map(flattenTree(tree).map(({ row }, index) => [row.id, index]));
  const categories: FinishBrowse['categories'] = [];
  const list = (products: CatalogProduct[], depth: number) => {
    const counts = new Map<number, { count: number; opens: boolean }>();
    for (const p of products) {
      const r = rel(p);
      const id = r[depth];
      if (id == null) continue;
      const entry = counts.get(id) ?? { count: 0, opens: false };
      entry.count += 1;
      if (r.length > depth + 1) entry.opens = true;
      counts.set(id, entry);
    }
    const ids = [...counts.keys()].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    for (const id of ids) {
      categories.push({ id, depth, ...counts.get(id)! });
      if (chosen[depth] === id) list(products.filter((p) => rel(p)[depth] === id), depth + 1);
    }
  };
  list(base, 0);
  const openCategory = chosen.at(-1) ?? null;
  const uncoloured = openCategory == null ? base : base.filter((p) => rel(p).includes(openCategory));

  // The colours, counted before the colour narrows the list.
  const { swatches, wantedColors, results } = byColor(uncoloured, state.colors);

  const prices = everything.map((p) => finishUnitPrice(p, surface));
  const price = prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null;

  return {
    results: sortFinishes(results, state.sort, surface, opts.locale),
    total: everything.length,
    surfaces,
    categories,
    openCategory,
    wetCount,
    wetOn,
    swatches,
    wantedColors,
    stores,
    storeId,
    price,
  };
}

/** "Best" keeps the order `finishOptions` gave — what suits the room, then the style, then the price. */
function sortFinishes(list: CatalogProduct[], sort: FinishSort, surface: FinishSurface, locale: Locale): CatalogProduct[] {
  if (sort === 'best') return list;
  const sorted = [...list];
  if (sort === 'priceDesc') sorted.sort((a, b) => finishUnitPrice(b, surface) - finishUnitPrice(a, surface) || a.id - b.id);
  else if (sort === 'name') sorted.sort((a, b) => localizedName(locale, a).localeCompare(localizedName(locale, b), locale) || a.id - b.id);
  else sorted.sort((a, b) => finishUnitPrice(a, surface) - finishUnitPrice(b, surface) || a.id - b.id);
  return sorted;
}
