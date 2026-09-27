import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, shelfRoomCategories, shelfRooms } from '@/lib/db/schema';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import type { RoomType } from '@/lib/calculator/types';
import { pickLocalizedName } from '@/lib/i18n/labels';
import type { Locale } from '@/lib/i18n';
import { flattenTree, subtreeCounts, subtreeIds } from '@/lib/catalog/tree';
import { loadCategoryTree, roomTypesOf } from '@/lib/catalog/queries';
import { iconNodeFor } from '@/lib/catalog/iconNodes';
import type { PickerCategory } from '@/components/admin/ShelfRoomForm';

/** The plan's room types a studio room can be for, in the order the plan lists them. */
export const SHELF_ROOM_TYPES = Object.keys(ROOM_TYPES) as RoomType[];

/**
 * The studio rooms' pages read the tree, what each category holds (the catalogue's own
 * products, not people's uploads) and the rooms with their categories.
 */
export async function loadShelfRoomData(locale: Locale) {
  const [tree, productRows, rooms, links] = await Promise.all([
    loadCategoryTree(),
    db.select({ categoryId: products.categoryId }).from(products).where(and(eq(products.isActive, true), isNull(products.ownerUserId))),
    db.select().from(shelfRooms).orderBy(asc(shelfRooms.sortOrder), asc(shelfRooms.id)),
    db.select().from(shelfRoomCategories).orderBy(asc(shelfRoomCategories.sortOrder)),
  ]);
  const own = new Map<number, number>();
  for (const p of productRows) own.set(p.categoryId, (own.get(p.categoryId) ?? 0) + 1);
  const totals = subtreeCounts(tree, own);
  const categories: PickerCategory[] = flattenTree(tree).map(({ row }) => ({
    id: row.id,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    nameKa: row.nameKa,
    nameEn: row.nameEn,
    nameRu: row.nameRu,
    icon: iconNodeFor(row.icon),
    total: totals.get(row.id) ?? 0,
  }));
  const roomList = rooms.map((r) => {
    const categoryIds = links.filter((l) => l.shelfRoomId === r.id).map((l) => l.categoryId);
    // A product counts once however many of the room's categories cover it.
    const covered = new Set(categoryIds.flatMap((id) => subtreeIds(tree, id)));
    return {
      ...r,
      name: pickLocalizedName(locale, r.nameKa, r.nameEn, r.nameRu),
      roomTypes: roomTypesOf(r.roomTypes),
      categoryIds,
      products: productRows.filter((p) => covered.has(p.categoryId)).length,
    };
  });
  return { tree, categories, rooms: roomList };
}
