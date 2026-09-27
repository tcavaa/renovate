import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, shelfRoomCategories, shelfRooms, type Category } from '@/lib/db/schema';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import type { RoomType } from '@/lib/calculator/types';
import type { ShelfData } from '@/lib/design/shelf';
import { buildCategoryTree, subtreeIds, type CategoryTree } from './tree';
import { iconNodeFor } from './iconNodes';

/**
 * Reading the category tree and the studio's rooms. The tree is small (a few dozen rows), so
 * every reader takes it whole and walks it in memory (`lib/catalog/tree.ts`).
 */

export async function loadCategoryTree(): Promise<CategoryTree<Category>> {
  return buildCategoryTree(await db.select().from(categories));
}

/** The category with this slug and everything under it; empty for an unknown slug. */
export function subtreeOfSlug(tree: CategoryTree<Category>, slug: string): number[] {
  const row = [...tree.byId.values()].find((c) => c.slug === slug);
  return row ? subtreeIds(tree, row.id) : [];
}

const isRoomType = (value: unknown): value is RoomType => typeof value === 'string' && value in ROOM_TYPES;

/** The room types a studio room is for, as stored (a JSON array), unknown ones dropped. */
export function roomTypesOf(value: unknown): RoomType[] {
  return Array.isArray(value) ? value.filter(isRoomType) : [];
}

/**
 * The studio's shelf: its visible rooms in order, each with the categories it lists, and the
 * whole category tree — icons drawn, so the studio needs no icon set of its own.
 */
export async function loadShelf(tree?: CategoryTree<Category>): Promise<ShelfData> {
  const [rooms, links, catTree] = await Promise.all([
    db.select().from(shelfRooms).where(eq(shelfRooms.isVisible, true)).orderBy(asc(shelfRooms.sortOrder), asc(shelfRooms.id)),
    db.select().from(shelfRoomCategories).orderBy(asc(shelfRoomCategories.sortOrder)),
    tree ? Promise.resolve(tree) : loadCategoryTree(),
  ]);
  return {
    rooms: rooms.map((r) => ({
      id: r.id,
      slug: r.slug,
      nameKa: r.nameKa,
      nameEn: r.nameEn,
      nameRu: r.nameRu,
      icon: iconNodeFor(r.icon),
      roomTypes: roomTypesOf(r.roomTypes),
      categoryIds: links.filter((l) => l.shelfRoomId === r.id).map((l) => l.categoryId),
    })),
    categories: [...catTree.byId.values()].map((c) => ({
      id: c.id,
      parentId: c.parentId,
      slug: c.slug,
      nameKa: c.nameKa,
      nameEn: c.nameEn,
      nameRu: c.nameRu,
      icon: iconNodeFor(c.icon),
      sortOrder: c.sortOrder ?? 0,
    })),
  };
}
