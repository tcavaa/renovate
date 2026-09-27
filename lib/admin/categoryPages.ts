import { asc, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products, shelfRoomCategories, shelfRooms } from '@/lib/db/schema';
import { pickLocalizedName } from '@/lib/i18n/labels';
import type { Locale } from '@/lib/i18n';

/**
 * What the category form and the studio room form are opened with: every category (for the
 * parent select and the room's picker) and the studio's rooms by name.
 */
export async function loadCategoryFormData(locale: Locale) {
  const [all, rooms] = await Promise.all([
    db
      .select({ id: categories.id, parentId: categories.parentId, sortOrder: categories.sortOrder, nameKa: categories.nameKa, nameEn: categories.nameEn, nameRu: categories.nameRu, slug: categories.slug, isFurniture: categories.isFurniture, calculationType: categories.calculationType, icon: categories.icon })
      .from(categories),
    db.select({ id: shelfRooms.id, nameKa: shelfRooms.nameKa, nameEn: shelfRooms.nameEn, nameRu: shelfRooms.nameRu }).from(shelfRooms).orderBy(asc(shelfRooms.sortOrder), asc(shelfRooms.id)),
  ]);
  return { all, rooms: rooms.map((r) => ({ id: r.id, name: pickLocalizedName(locale, r.nameKa, r.nameEn, r.nameRu) })) };
}

/** How many products a category itself holds, per category. */
export async function productCountsByCategory(): Promise<Map<number, number>> {
  const rows = await db.select({ categoryId: products.categoryId, n: count() }).from(products).groupBy(products.categoryId);
  return new Map(rows.map((r) => [r.categoryId, Number(r.n)]));
}

/** The rooms that list a category. */
export async function roomIdsOfCategory(categoryId: number): Promise<number[]> {
  const rows = await db.select({ id: shelfRoomCategories.shelfRoomId }).from(shelfRoomCategories).where(eq(shelfRoomCategories.categoryId, categoryId));
  return rows.map((r) => r.id);
}
