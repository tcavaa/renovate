/**
 * The furniture shelf's rooms and categories, as admin made them.
 *
 * The shelf's top row is the studio's rooms (`shelf_rooms`: living room, bedroom, …), each
 * listing categories of the one category tree (`shelf_room_categories`). A product sits on the
 * shelf under every listed category whose subtree holds its category — a room can list
 * "Beds" and cover the double and the single beds, or list them one by one — so a product can
 * be in several rooms (a pendant light in every room that lists pendants). A listed category
 * with subcategories of its own opens onto them. Whatever no room covers is still findable,
 * under "other".
 *
 * Pure: the server sends `ShelfData` with the catalogue (icons already drawn as `IconNode`s,
 * so the studio does not ship an icon set), the tray and the catalogue modal read it here.
 */

import type { IconNode } from '@/lib/admin/icons';
import type { RoomType } from '@/lib/calculator/types';
import { buildCategoryTree, childrenOf, pathOf, subtreeIds, type CategoryTree } from '@/lib/catalog/tree';

export interface ShelfCategory {
  id: number;
  parentId: number | null;
  slug: string;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  icon: IconNode | null;
  sortOrder: number;
}

export interface ShelfRoomDef {
  id: number;
  slug: string;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  icon: IconNode | null;
  /** The plan's room types it is for: the shelf opens on it when one of them is in focus. */
  roomTypes: RoomType[];
  /** The categories it lists, in its order. */
  categoryIds: number[];
}

export interface ShelfData {
  /** The visible rooms, in order. */
  rooms: ShelfRoomDef[];
  /** The whole category tree. */
  categories: ShelfCategory[];
}

export const EMPTY_SHELF: ShelfData = { rooms: [], categories: [] };

/** A room of the shelf, or what no room covers. */
export type ShelfRoomId = number | 'other';

/** What a product needs to be placed on the shelf. */
export interface ShelfItem {
  categoryId?: number | null;
}

export interface ShelfIndex {
  tree: CategoryTree<ShelfCategory>;
  rooms: ShelfRoomDef[];
  /** Each category and the ids of its subtree. */
  covers: (categoryId: number) => ReadonlySet<number>;
}

export function shelfIndex(shelf: ShelfData): ShelfIndex {
  const tree = buildCategoryTree(shelf.categories);
  const memo = new Map<number, Set<number>>();
  const covers = (categoryId: number): ReadonlySet<number> => {
    let set = memo.get(categoryId);
    if (!set) {
      set = new Set(subtreeIds(tree, categoryId));
      memo.set(categoryId, set);
    }
    return set;
  };
  // A room listing a category that is gone (deleted since) simply lists one fewer.
  const rooms = shelf.rooms.map((r) => ({ ...r, categoryIds: r.categoryIds.filter((id) => tree.byId.has(id)) }));
  return { tree, rooms, covers };
}

/** Whether a product sits under this category (itself or anything below it). */
export function inCategory(index: ShelfIndex, item: ShelfItem, categoryId: number): boolean {
  return item.categoryId != null && index.covers(categoryId).has(item.categoryId);
}

/** The room the shelf opens on for a plan room of this type: the first visible one that is for it. */
export function shelfRoomForType(index: ShelfIndex, type: RoomType | null | undefined): number | null {
  if (!type) return null;
  return index.rooms.find((r) => r.roomTypes.includes(type))?.id ?? null;
}

export interface ShelfRoomCount {
  id: ShelfRoomId;
  count: number;
}

/**
 * The rooms with something in them for these products, each with how many of them it holds
 * (a product in two rooms counts in both), and "other" for what no room covers.
 */
export function shelfRoomCounts<T extends ShelfItem>(index: ShelfIndex, items: readonly T[]): ShelfRoomCount[] {
  const out: ShelfRoomCount[] = [];
  const covered = new Set<T>();
  for (const room of index.rooms) {
    let count = 0;
    for (const item of items) {
      if (room.categoryIds.some((id) => inCategory(index, item, id))) {
        count += 1;
        covered.add(item);
      }
    }
    if (count > 0) out.push({ id: room.id, count });
  }
  const other = items.filter((item) => !covered.has(item)).length;
  if (other > 0) out.push({ id: 'other', count: other });
  return out;
}

/** Whether a product is on the shelf in this room. */
export function inShelfRoom<T extends ShelfItem>(index: ShelfIndex, item: T, room: ShelfRoomId): boolean {
  if (room === 'other') return !index.rooms.some((r) => r.categoryIds.some((id) => inCategory(index, item, id)));
  const def = index.rooms.find((r) => r.id === room);
  return !!def && def.categoryIds.some((id) => inCategory(index, item, id));
}

export interface ShelfCategoryCount {
  id: number;
  count: number;
  /** It has subcategories with something in them: choosing it opens onto them. */
  opens: boolean;
}

/**
 * The categories a room lists, with how many of these products each holds, those holding
 * none left out. "other" lists the categories its products sit in, in the tree's order.
 */
export function roomCategories<T extends ShelfItem>(index: ShelfIndex, items: readonly T[], room: ShelfRoomId): ShelfCategoryCount[] {
  const ids =
    room === 'other'
      ? [...new Set(items.filter((item) => inShelfRoom(index, item, 'other')).map((item) => item.categoryId).filter((id): id is number => id != null && index.tree.byId.has(id)))].sort((a, b) => treeOrder(index, a) - treeOrder(index, b))
      : (index.rooms.find((r) => r.id === room)?.categoryIds ?? []);
  return countCategories(index, items, ids);
}

/** A category's subcategories with how many of these products each holds, empty ones left out. */
export function subcategoryCounts<T extends ShelfItem>(index: ShelfIndex, items: readonly T[], categoryId: number): ShelfCategoryCount[] {
  return countCategories(
    index,
    items,
    childrenOf(index.tree, categoryId).map((c) => c.id)
  );
}

function countCategories<T extends ShelfItem>(index: ShelfIndex, items: readonly T[], ids: readonly number[]): ShelfCategoryCount[] {
  return ids
    .map((id) => {
      const count = items.filter((item) => inCategory(index, item, id)).length;
      const opens = childrenOf(index.tree, id).some((child) => items.some((item) => inCategory(index, item, child.id)));
      return { id, count, opens };
    })
    .filter((c) => c.count > 0);
}

/** A category's position in reading order, for sorting categories from different branches. */
function treeOrder(index: ShelfIndex, id: number): number {
  let order = 0;
  for (const node of pathOf(index.tree, id)) {
    const siblings = childrenOf(index.tree, node.parentId ?? null);
    order = order * 1000 + Math.max(0, siblings.findIndex((s) => s.id === node.id));
  }
  return order;
}

/**
 * The trail of categories from what the room lists down to `categoryId`: the listed one first,
 * then each subcategory on the way. Empty when the category is not under anything the room
 * lists (a choice left over from another room).
 */
export function shelfTrail(index: ShelfIndex, room: ShelfRoomId, categoryId: number | null, items: readonly ShelfItem[] = []): number[] {
  if (categoryId == null || !index.tree.byId.has(categoryId)) return [];
  const listed = room === 'other' ? roomCategories(index, items, 'other').map((c) => c.id) : (index.rooms.find((r) => r.id === room)?.categoryIds ?? []);
  const path = pathOf(index.tree, categoryId).map((c) => c.id);
  // The deepest listed category on the way down (a room may list both a parent and its child).
  for (let i = path.length - 1; i >= 0; i--) if (listed.includes(path[i])) return path.slice(i);
  return [];
}

/** The category's name in the visitor's language, falling back to Georgian. */
export function shelfName(entry: { nameKa: string; nameEn: string | null; nameRu: string | null }, locale: 'ka' | 'en' | 'ru'): string {
  if (locale === 'en') return entry.nameEn || entry.nameKa;
  if (locale === 'ru') return entry.nameRu || entry.nameEn || entry.nameKa;
  return entry.nameKa;
}
