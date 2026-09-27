/**
 * The furniture catalogue as a searchable list — the shelf's filters (room, category, style,
 * colour) plus what a shelf of fifty tiles never needed and a catalogue of thousands cannot
 * do without: a query across names, brands, shops, kinds and categories, a price band, a
 * shop, a sort, and a count on every filter, so the person sees where the products are
 * before narrowing down. The rooms and their categories are admin's (`lib/design/shelf.ts`).
 * Pure: the studio's catalogue modal renders what this returns, and the tests read it.
 */

import type { RoomType } from '@/lib/calculator/types';
import type { Locale } from '@/lib/i18n';
import { localizedName } from '@/lib/i18n/labels';
import { pathOf } from '@/lib/catalog/tree';
import { archetypeLabel } from './catalog';
import { COLOR_FAMILIES, productColorFamilies, type ColorFamily } from './colors';
import { isFixtureProductKind } from './electrical';
import type { CatalogProduct } from './matcher';
import { isOpeningProductKind } from './openings';
import { isRadiatorProductKind } from './radiators';
import { inCategory, inShelfRoom, roomCategories, shelfRoomCounts, shelfRoomForType, shelfTrail, subcategoryCounts, type ShelfIndex, type ShelfRoomId } from './shelf';
import type { SceneStore, StyleId } from './types';

export type CatalogSort = 'priceAsc' | 'priceDesc' | 'name';

/**
 * Everything the modal's controls hold. It lives outside the modal (in the studio page) so
 * that closing, placing a piece and coming back finds the search, the filters and the open
 * product exactly as they were left.
 */
export interface CatalogBrowserState {
  query: string;
  /** A room of the shelf (its id, or "other"); `null` is every room; `undefined` follows the room the studio has in focus. */
  room: ShelfRoomId | null | undefined;
  /** A category within the open room — one it lists or one under that — or null for all of them. */
  category: number | null;
  styles: StyleId[];
  colors: ColorFamily[];
  priceMin: number | null;
  priceMax: number | null;
  storeId: number | null;
  sort: CatalogSort;
  /** Only the person's own uploads. */
  mine: boolean;
  /** The product whose details are open. */
  selectedId: number | null;
}

export function initialCatalogBrowserState(): CatalogBrowserState {
  return { query: '', room: undefined, category: null, styles: [], colors: [], priceMin: null, priceMax: null, storeId: null, sort: 'priceAsc', mine: false, selectedId: null };
}

/** Whether anything narrows the list — what the "clear filters" button undoes. */
export function hasCatalogFilters(state: CatalogBrowserState): boolean {
  return state.query.trim() !== '' || state.room !== undefined || state.category != null || state.styles.length > 0 || state.colors.length > 0 || state.priceMin != null || state.priceMax != null || state.storeId != null || state.mine;
}

/**
 * Furniture: a product with a model that is neither a fitting (the electric tray's), nor a
 * door or window (the wall's), nor a radiator (the technical tray's).
 */
export function isFurnitureProduct(p: CatalogProduct): boolean {
  return !!p.model3dUrl && !!p.model3dKind && !isFixtureProductKind(p.model3dKind) && !isOpeningProductKind(p.model3dKind) && !isRadiatorProductKind(p.model3dKind);
}

export function productStyles(p: Pick<CatalogProduct, 'styleTags'>): StyleId[] {
  return Array.isArray(p.styleTags) ? (p.styleTags as StyleId[]) : [];
}

export interface CatalogBrowse {
  /** What the list shows, in the chosen order. */
  results: CatalogProduct[];
  /** Every piece of furniture on sale, before any filter. */
  total: number;
  /** How many of them are the person's own uploads. */
  ownCount: number;
  /** How many products every room together holds after every filter but the room and the category — the "all rooms" count. */
  all: number;
  /** The rooms of the shelf with something in them after every filter but the room and the category. A product can be in several rooms, so these do not add up to `all`. */
  rooms: Array<{ id: ShelfRoomId; count: number }>;
  /** The room the list is narrowed to, if it still has anything in it. */
  openRoom: ShelfRoomId | null;
  /**
   * The open room's categories with counts, and under the chosen one its subcategories
   * (`depth` 1, 2 …) — what the sidebar lists, in order; empty when no room is open.
   */
  categories: Array<{ id: number; count: number; depth: number; opens: boolean }>;
  /** The category the list is narrowed to, if it still has anything in it. */
  openCategory: number | null;
  /** One swatch per colour family on the list as it stands, with a count. */
  swatches: Array<{ id: ColorFamily; hex: string; count: number }>;
  /** The colours ticked that the list actually has: a tick nothing answers to stands aside. */
  wantedColors: ColorFamily[];
  /** The shops with something on the list after the query, styles and price band. */
  stores: Array<{ store: SceneStore; count: number }>;
  /** The shop the list is narrowed to, if it still has anything. */
  storeId: number | null;
  /** The cheapest and dearest piece of furniture on sale, for the price band's placeholders. */
  price: { min: number; max: number } | null;
}

/**
 * The list for a state. The filters are applied from the outside in — the query, the styles
 * and the price band first, then the shop, then the room and the kind, the colour last — and
 * each control's counts are read off the list *before* that control narrows it, so a control
 * says what choosing it would leave rather than what it has already left. A room, a kind, a
 * shop or a colour that the rest of the filters have emptied stands aside instead of emptying
 * the list: the person typed "sofa" to see sofas, not a blank page because the bathroom was
 * open.
 */
export function browseCatalog(catalog: CatalogProduct[], state: CatalogBrowserState, opts: { focusRoom: RoomType | null; locale: Locale; shelf: ShelfIndex }): CatalogBrowse {
  const { shelf } = opts;
  // A person's own photo waiting for its model is listed too — it is theirs and they will
  // look for it — though it cannot be placed until the model is there.
  const everything = catalog.filter((p) => isFurnitureProduct(p) || (p.own && p.pending && p.model3dKind));
  const ownCount = everything.filter((p) => p.own).length;
  const furniture = state.mine ? everything.filter((p) => p.own) : everything;
  const q = state.query.trim().toLowerCase();
  const matchesQuery = (p: CatalogProduct): boolean => {
    if (!q) return true;
    const kind = p.model3dKind!;
    // The product's category and the ones above it: "sofa" finds what sits under "Sofas".
    const categories = p.categoryId != null ? pathOf(shelf.tree, p.categoryId).flatMap((c) => [c.nameKa, c.nameEn, c.nameRu]) : [];
    return [p.nameKa, p.nameEn, p.nameRu, p.brand, p.store?.nameKa, p.store?.nameEn, p.store?.nameRu, archetypeLabel(kind, opts.locale), archetypeLabel(kind, 'ka'), archetypeLabel(kind, 'en'), ...categories]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  };
  // A piece of the person's own has no style tag and is theirs in any style.
  const matchesStyles = (p: CatalogProduct): boolean => !!p.own || state.styles.length === 0 || productStyles(p).some((s) => state.styles.includes(s));
  const matchesPrice = (p: CatalogProduct): boolean => (state.priceMin == null || p.pricePerUnit >= state.priceMin) && (state.priceMax == null || p.pricePerUnit <= state.priceMax);
  const broad = furniture.filter((p) => matchesQuery(p) && matchesStyles(p) && matchesPrice(p));

  // The shops, counted before the shop filter so the other shops stay on offer.
  const storeCounts = new Map<number, { store: SceneStore; count: number }>();
  for (const p of broad) {
    if (!p.store) continue;
    const entry = storeCounts.get(p.store.id);
    if (entry) entry.count += 1;
    else storeCounts.set(p.store.id, { store: p.store, count: 1 });
  }
  const stores = [...storeCounts.values()].sort((a, b) => b.count - a.count || a.store.nameKa.localeCompare(b.store.nameKa));
  const storeId = state.storeId != null && storeCounts.has(state.storeId) ? state.storeId : null;
  const base = storeId == null ? broad : broad.filter((p) => p.store?.id === storeId);

  // The rooms, counted before the room narrows the list.
  const rooms = shelfRoomCounts(shelf, base);
  const wantedRoom = state.room === undefined ? shelfRoomForType(shelf, opts.focusRoom) : state.room;
  const openRoom = wantedRoom != null && rooms.some((r) => r.id === wantedRoom) ? wantedRoom : null;
  const inRoom = openRoom == null ? base : base.filter((p) => inShelfRoom(shelf, p, openRoom));
  // The categories: the room's own, and under each chosen one its subcategories. A choice the
  // rest of the filters emptied stands aside, as the room does.
  const trail = openRoom == null ? [] : shelfTrail(shelf, openRoom, state.category, inRoom);
  const held = trail.findIndex((id) => !inRoom.some((p) => inCategory(shelf, p, id)));
  const chosen = held < 0 ? trail : trail.slice(0, held);
  const categories: CatalogBrowse['categories'] = [];
  const list = (entries: Array<{ id: number; count: number; opens: boolean }>, depth: number) => {
    for (const entry of entries) {
      categories.push({ ...entry, depth });
      if (chosen[depth] === entry.id) list(subcategoryCounts(shelf, inRoom, entry.id), depth + 1);
    }
  };
  if (openRoom != null) list(roomCategories(shelf, inRoom, openRoom), 0);
  const openCategory = chosen.at(-1) ?? null;
  const uncoloured = openCategory == null ? inRoom : inRoom.filter((p) => inCategory(shelf, p, openCategory));

  // The colours, counted before the colour narrows the list.
  const colorCounts = new Map<ColorFamily, number>();
  for (const p of uncoloured) for (const family of productColorFamilies(p)) colorCounts.set(family, (colorCounts.get(family) ?? 0) + 1);
  const swatches = COLOR_FAMILIES.filter((family) => colorCounts.has(family.id)).map((family) => ({ id: family.id, hex: family.hex, count: colorCounts.get(family.id)! }));
  const wantedColors = state.colors.filter((c) => colorCounts.has(c));
  const filtered = wantedColors.length === 0 ? uncoloured : uncoloured.filter((p) => productColorFamilies(p).some((family) => wantedColors.includes(family)));

  const prices = furniture.map((p) => p.pricePerUnit);
  const price = prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null;

  return {
    results: sortProducts(filtered, state.sort, opts.locale),
    total: everything.length,
    ownCount,
    all: base.length,
    rooms,
    openRoom,
    categories,
    openCategory,
    swatches,
    wantedColors,
    stores,
    storeId,
    price,
  };
}

function sortProducts(list: CatalogProduct[], sort: CatalogSort, locale: Locale): CatalogProduct[] {
  const sorted = [...list];
  if (sort === 'priceDesc') sorted.sort((a, b) => b.pricePerUnit - a.pricePerUnit || a.id - b.id);
  else if (sort === 'name') sorted.sort((a, b) => localizedName(locale, a).localeCompare(localizedName(locale, b), locale) || a.id - b.id);
  else sorted.sort((a, b) => a.pricePerUnit - b.pricePerUnit || a.id - b.id);
  return sorted;
}
