import { describe, expect, it } from 'vitest';
import { cartKey, categorySlugFromKey, finishPickQuantity, isCartKey, roomFinishQuantity, roomIdFromKey, selectionKey, surfaceOfPick } from '@/lib/calculator/quantities';
import {
  boardFinishesFromPicks,
  catalogProductFromPick,
  finishGroup,
  migrateFinishPicks,
  roomFinishEntry,
  roomsLike,
  surfaceOfCategory,
  usualFinishCategory,
  withRoomFinish,
  withRoomFinishQuantities,
} from '@/lib/calculator/roomFinishes';
import { computeRoomAreas } from '@/lib/calculator/materials';
import { rebuildRooms, wallsForRectangle } from '@/lib/design/walls';
import type { Room, RoomType, SelectedProduct } from '@/lib/calculator/types';
import type { FloorPlan, SurfaceFinish } from '@/lib/design/types';

/**
 * A floor and a wall for every room (`lib/calculator/roomFinishes`): the calculator's catalogue
 * step picks one product for each and counts it from the room, where it used to put materials
 * in a cart for a placement step to lay on the board by hand.
 */

const room = (id: string, type: RoomType, width = 4, length = 3.5, height = 2.7): Room => computeRoomAreas({ id, type, nameKa: id, width, length, height });
const bedroom = room('bed', 'bedroom'); // floor 14 m², walls 40.5 m²
const living = room('liv', 'living_room', 5, 4);
const bath = room('bath', 'bathroom', 2, 2); // floor 4 m², walls 21.6 m²
const kitchen = room('kit', 'kitchen', 3, 3);
const rooms = [bedroom, living, bath, kitchen];

const product = (over: Partial<SelectedProduct> = {}): SelectedProduct => ({
  productId: 7,
  nameKa: 'ლამინატი',
  pricePerUnit: 40,
  unit: 'm2',
  qty: 0,
  totalPrice: 0,
  imageUrl: null,
  categorySlug: 'laminate',
  ...over,
});
const tile = product({ productId: 9, nameKa: 'ფილა', categorySlug: 'floor-tiles', pricePerUnit: 50 });
const wallTile = product({ productId: 11, nameKa: 'კედლის ფილა', categorySlug: 'wall-tiles', pricePerUnit: 45 });
const paint = product({ productId: 12, nameKa: 'საღებავი', categorySlug: 'paint', unit: 'liter', pricePerUnit: 30, coveragePerUnit: 10 });

describe('keys and quantities', () => {
  it('still reads a key from the cart, which is how a project from before is recognised', () => {
    expect(cartKey('laminate', 7)).toBe('laminate_item:7');
    expect(isCartKey('laminate_item:7')).toBe(true);
    expect(isCartKey('laminate_room:r1')).toBe(false);
    expect(categorySlugFromKey('laminate_item:7')).toBe('laminate');
    expect(roomIdFromKey('laminate_room:r1')).toBe('r1');
    expect(roomIdFromKey('laminate_item:7')).toBeNull();
  });

  it('buys a tile by the square metre with a tenth of cutting waste, a paint in tins by its coverage', () => {
    expect(finishPickQuantity(product(), 20)).toBe(22);
    expect(finishPickQuantity(product({ categorySlug: 'floor-tiles' }), 4)).toBe(4.4);
    expect(finishPickQuantity(product(), 0)).toBe(0);
    expect(finishPickQuantity(paint, 25)).toBe(3);
    // Eight square metres a litre when the row says nothing.
    expect(finishPickQuantity({ ...paint, coveragePerUnit: null }, 16)).toBe(2);
  });

  it('counts a room’s floor from its floor and its walls from its walls — the estimate’s own figures', () => {
    expect(roomFinishQuantity(product(), 'floor', bedroom)).toBe(15.4);
    expect(roomFinishQuantity(wallTile, 'wall', bath)).toBe(23.8);
    expect(roomFinishQuantity(paint, 'wall', bedroom)).toBe(5);
  });

  it('knows the surface of a pick by its own word, else by its category', () => {
    expect(surfaceOfPick({ categorySlug: 'laminate' })).toBe('floor');
    expect(surfaceOfPick({ categorySlug: 'paint' })).toBe('wall');
    expect(surfaceOfPick({ categorySlug: 'parquet-admin', surface: 'floor' })).toBe('floor');
    expect(surfaceOfPick({ categorySlug: 'doors' })).toBeNull();
    expect(surfaceOfCategory({ calculationType: 'per_m2_floor' })).toBe('floor');
    expect(surfaceOfCategory({ calculationType: 'per_m2_wall' })).toBe('wall');
    expect(surfaceOfCategory(null)).toBeNull();
  });
});

describe('a floor and a wall for every room', () => {
  it('gives a room one floor, whatever category the next one is from, and leaves its walls alone', () => {
    let picks = withRoomFinish({}, rooms, ['bed'], 'floor', product());
    picks = withRoomFinish(picks, rooms, ['bed'], 'wall', paint);
    picks = withRoomFinish(picks, rooms, ['bed'], 'floor', tile);
    expect(Object.keys(picks).sort()).toEqual(['floor-tiles_room:bed', 'paint_room:bed']);
    expect(picks['floor-tiles_room:bed']).toMatchObject({ roomId: 'bed', surface: 'floor', qty: 15.4, totalPrice: 770 });
    expect(roomFinishEntry(picks, 'bed', 'wall')?.[1]).toMatchObject({ productId: 12, qty: 5, totalPrice: 150 });
  });

  it('takes one choice into several rooms at once, each counted from its own', () => {
    const picks = withRoomFinish({}, rooms, ['bed', 'liv'], 'floor', product());
    expect(picks[selectionKey('laminate', 'bed')].qty).toBe(15.4);
    expect(picks[selectionKey('laminate', 'liv')].qty).toBe(22);
  });

  it('clears a surface with nothing, and nothing else', () => {
    let picks = withRoomFinish({}, rooms, ['bed'], 'floor', product());
    picks = withRoomFinish(picks, rooms, ['bed'], 'wall', paint);
    picks = { ...picks, doors_global: product({ productId: 3, categorySlug: 'doors' }) };
    const cleared = withRoomFinish(picks, rooms, ['bed'], 'floor', null);
    expect(Object.keys(cleared).sort()).toEqual(['doors_global', 'paint_room:bed']);
  });

  it('counts a room again when it changes, drops what a room that is gone had, and is left alone otherwise', () => {
    const picks = withRoomFinish({}, rooms, ['bed', 'bath'], 'floor', product());
    expect(withRoomFinishQuantities(picks, rooms)).toBe(picks);
    const bigger = rooms.map((r) => (r.id === 'bed' ? room('bed', 'bedroom', 5, 4) : r));
    expect(withRoomFinishQuantities(picks, bigger)['laminate_room:bed'].qty).toBe(22);
    expect(Object.keys(withRoomFinishQuantities(picks, rooms.filter((r) => r.id !== 'bath')))).toEqual(['laminate_room:bed']);
    // A flat with no rooms is one not read yet: its picks are not thrown away.
    expect(withRoomFinishQuantities(picks, [])).toBe(picks);
  });

  it('groups rooms the way the works are done: tiled and laid floors, tiled and painted walls', () => {
    expect(finishGroup('bathroom', 'floor')).toBe('tiled-floor');
    expect(finishGroup('kitchen', 'floor')).toBe('tiled-floor');
    expect(finishGroup('kitchen', 'wall')).toBe('painted-wall');
    expect(finishGroup('toilet', 'wall')).toBe('tiled-wall');
    expect(usualFinishCategory('bedroom', 'floor')).toBe('laminate');
    expect(usualFinishCategory('bathroom', 'wall')).toBe('wall-tiles');
    expect(roomsLike(rooms, bedroom, 'floor').map((r) => r.id)).toEqual(['liv']);
    expect(roomsLike(rooms, bath, 'floor').map((r) => r.id)).toEqual(['kit']);
    expect(roomsLike(rooms, bedroom, 'wall').map((r) => r.id)).toEqual(['liv', 'kit']);
  });
});

describe('picks from before every room took its own', () => {
  const laidOn = (roomId: string, surface: 'floor' | 'wall', productId: number, extra: Partial<SurfaceFinish> = {}): SurfaceFinish => ({
    roomId,
    surface,
    colorHex: '#fff',
    textureUrl: null,
    textureScaleM: 1,
    product: { productId, nameKa: 'x', slug: 'x', brand: null, pricePerUnit: 40, unit: 'm2', qty: 1, totalPrice: 40, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: null, categorySlug: 'laminate', store: null },
    ...extra,
  });

  it('moves a material laid by hand onto the rooms whose floor it covered, and lets one laid nowhere go', () => {
    const picks = { 'laminate_item:7': { ...product(), surface: 'floor' as const, qty: 30 }, 'paint_item:12': { ...paint, surface: 'wall' as const } };
    const board = [laidOn('bed', 'floor', 7), laidOn('liv', 'floor', 7), laidOn('kit', 'floor', 7, { cells: [[0, 0]] })];
    const moved = withRoomFinishQuantities(migrateFinishPicks(picks, rooms, board), rooms);
    // The kitchen had a tile of it, not its floor: that says nothing about the room.
    expect(Object.keys(moved).sort()).toEqual(['laminate_room:bed', 'laminate_room:liv']);
    expect(moved['laminate_room:liv']).toMatchObject({ surface: 'floor', qty: 22 });
  });

  it('spreads a finish chosen for the whole flat over the rooms its kind of work suits, never over a room’s own', () => {
    const picks = {
      laminate_global: product(),
      'floor-tiles_global': tile,
      'wall-tiles_global': wallTile,
      'paint_room:liv': { ...paint, roomId: 'liv', surface: 'wall' as const },
      doors_global: product({ productId: 3, categorySlug: 'doors' }),
    };
    const moved = migrateFinishPicks(picks, rooms, []);
    expect(Object.keys(moved).sort()).toEqual(['doors_global', 'floor-tiles_room:bath', 'floor-tiles_room:kit', 'laminate_room:bed', 'laminate_room:liv', 'paint_room:liv', 'wall-tiles_room:bath']);
  });

  it('is the same object when there is nothing from before', () => {
    const picks = withRoomFinish({}, rooms, ['bed'], 'floor', product());
    expect(migrateFinishPicks(picks, rooms, [])).toBe(picks);
  });
});

describe('the drawing board in the rooms’ picks', () => {
  const blank: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, walls: [] };

  it('wears each room’s floor and walls, and nothing where nothing was chosen', () => {
    const plan = rebuildRooms(blank, wallsForRectangle({ x: 0, z: 0, width: 4, depth: 3.5 }, 0.12, 'user', 'r'));
    const id = plan.rooms[0].id;
    const picks = withRoomFinish({}, [{ ...bedroom, id }], [id], 'floor', { ...product(), textureUrl: '/t.jpg', colorHex: '#abcdef' });
    const finishes = boardFinishesFromPicks(plan, picks);
    expect(finishes).toHaveLength(1);
    expect(finishes[0]).toMatchObject({ roomId: id, surface: 'floor', textureUrl: '/t.jpg', colorHex: '#abcdef', origin: 'calculator' });
    expect(finishes[0].product?.productId).toBe(7);
    expect(boardFinishesFromPicks(null, picks)).toEqual([]);
  });

  it('draws a pick with what it carries from its catalogue row', () => {
    const drawn = catalogProductFromPick({ ...product(), slug: 'lam', textureUrl: '/t.jpg', colorHex: '#abcdef', specs: { textureScaleM: 0.5 } });
    expect(drawn).toMatchObject({ id: 7, slug: 'lam', textureUrl: '/t.jpg', colorHex: '#abcdef', categorySlug: 'laminate', specs: { textureScaleM: 0.5 } });
  });
});
