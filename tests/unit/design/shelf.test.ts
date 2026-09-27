import { describe, expect, it } from 'vitest';
import { inShelfRoom, roomCategories, shelfIndex, shelfName, shelfRoomCounts, shelfRoomForType, shelfTrail, subcategoryCounts, type ShelfCategory, type ShelfData } from '@/lib/design/shelf';

/**
 * The furniture shelf as admin arranges it: studio rooms listing categories of the one tree.
 * A product is in every room one of whose categories covers its own; what no room covers is
 * under "other".
 */

const cat = (id: number, parentId: number | null, nameKa: string, nameEn: string | null = null): ShelfCategory => ({ id, parentId, slug: `c${id}`, nameKa, nameEn, nameRu: null, icon: null, sortOrder: id });
//  1 Furniture ─ 2 Sofas ─ 3 Corner, 4 Three-seat
//              └ 5 Beds
//  6 Lighting ─ 7 Pendants
//  8 Odds
const SHELF: ShelfData = {
  categories: [cat(1, null, 'ავეჯი', 'Furniture'), cat(2, 1, 'დივნები'), cat(3, 2, 'კუთხის'), cat(4, 2, 'სამადგილიანი'), cat(5, 1, 'საწოლები'), cat(6, null, 'განათება'), cat(7, 6, 'ჭაღები'), cat(8, null, 'სხვადასხვა')],
  rooms: [
    { id: 10, slug: 'living', nameKa: 'მისაღები', nameEn: 'Living', nameRu: null, icon: null, roomTypes: ['living_room'], categoryIds: [2, 7] },
    { id: 20, slug: 'bedroom', nameKa: 'საძინებელი', nameEn: null, nameRu: null, icon: null, roomTypes: ['bedroom', 'closet'], categoryIds: [5, 7, 999] },
  ],
};
const index = shelfIndex(SHELF);
const items = [
  { id: 'corner', categoryId: 3 },
  { id: 'sofa', categoryId: 4 },
  { id: 'bed', categoryId: 5 },
  { id: 'lamp', categoryId: 7 },
  { id: 'odd', categoryId: 8 },
  { id: 'loose', categoryId: null },
];

describe('the shelf', () => {
  it('drops a category a room lists that is gone', () => {
    expect(index.rooms.find((r) => r.id === 20)?.categoryIds).toEqual([5, 7]);
  });

  it('counts a room\'s products, one in two rooms in both, and the rest under "other"', () => {
    expect(shelfRoomCounts(index, items)).toEqual([
      { id: 10, count: 3 },
      { id: 20, count: 2 },
      { id: 'other', count: 2 },
    ]);
    expect(items.filter((i) => inShelfRoom(index, i, 'other')).map((i) => i.id)).toEqual(['odd', 'loose']);
    expect(inShelfRoom(index, items[3], 10) && inShelfRoom(index, items[3], 20)).toBe(true);
  });

  it('opens on the room for the plan room type in focus', () => {
    expect(shelfRoomForType(index, 'bedroom')).toBe(20);
    expect(shelfRoomForType(index, 'closet')).toBe(20);
    expect(shelfRoomForType(index, 'kitchen')).toBeNull();
    expect(shelfRoomForType(index, null)).toBeNull();
  });

  it('lists a room\'s categories with their counts, and which open onto more', () => {
    expect(roomCategories(index, items, 10)).toEqual([
      { id: 2, count: 2, opens: true },
      { id: 7, count: 1, opens: false },
    ]);
    expect(subcategoryCounts(index, items, 2)).toEqual([
      { id: 3, count: 1, opens: false },
      { id: 4, count: 1, opens: false },
    ]);
    // "other" lists the categories its products sit in.
    expect(roomCategories(index, items, 'other').map((c) => c.id)).toEqual([8]);
    // A category with nothing on the shelf is left out.
    expect(roomCategories(index, [items[0]], 10).map((c) => c.id)).toEqual([2]);
  });

  it('traces the trail from the listed category down to the chosen one', () => {
    expect(shelfTrail(index, 10, 3)).toEqual([2, 3]);
    expect(shelfTrail(index, 10, 2)).toEqual([2]);
    expect(shelfTrail(index, 10, 5)).toEqual([]);
    expect(shelfTrail(index, 10, null)).toEqual([]);
    expect(shelfTrail(index, 'other', 8, items)).toEqual([8]);
  });

  it('names in the visitor\'s language, falling back to Georgian', () => {
    const furniture = SHELF.categories[0];
    expect(shelfName(furniture, 'en')).toBe('Furniture');
    expect(shelfName(furniture, 'ru')).toBe('Furniture');
    expect(shelfName(SHELF.categories[1], 'en')).toBe('დივნები');
  });
});
