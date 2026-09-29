import { describe, expect, it } from 'vitest';
import { cartKey, categorySlugFromKey, finishPickQuantity, isCartKey, partFromKey, roomFinishQuantity, roomIdFromKey, roomWallAreasM2, roomWalls, selectionKey, surfaceOfPick } from '@/lib/calculator/quantities';
import {
  boardFinishesFromPicks,
  catalogProductFromPick,
  finishGroup,
  migrateFinishPicks,
  normalizeRoomFinishes,
  roomFinishEntry,
  roomFinishesOf,
  roomsLike,
  surfaceOfCategory,
  usualFinishCategory,
  withFloorProduct,
  withFloorShare,
  withRoomFinish,
  withRoomFinishQuantities,
  withSameFinish,
  withWallProduct,
  withWallsOneByOne,
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

  it('keys a second floor product and a product chosen wall by wall apart from the room’s own, and reads them back', () => {
    expect(selectionKey('paint', 'r1', 'walls12')).toBe('paint_room:r1/walls12');
    expect(roomIdFromKey('paint_room:r1/walls12')).toBe('r1');
    expect(partFromKey('paint_room:r1/walls12')).toBe('walls12');
    expect(partFromKey('laminate_room:r1')).toBeNull();
    expect(partFromKey('laminate_global')).toBeNull();
    expect(categorySlugFromKey('floor-tiles_room:r1/floor2')).toBe('floor-tiles');
  });

  it('knows a room’s walls one by one — the board’s, else the four sides of its rectangle — and what each measures', () => {
    expect(roomWalls(bedroom)).toEqual([4, 3.5, 4, 3.5]);
    expect(roomWallAreasM2(bedroom)).toEqual([10.8, 9.45, 10.8, 9.45]);
    const lShape = { ...bedroom, walls: [4, 2, 1.5, 1.5, 2.5, 3.5] };
    expect(roomWalls(lShape)).toEqual([4, 2, 1.5, 1.5, 2.5, 3.5]);
    expect(roomWallAreasM2(lShape)[2]).toBe(4.05);
  });

  it('counts each wall as the board measured it, less its doors and windows — only beside the walls it was read with', () => {
    // Read off the board with a 1.8 × 1.4 m window in wall 0 and a 0.9 × 2.05 m door in wall 3; the room's walls already without them.
    const opened = { ...bedroom, walls: [4, 3.5, 4, 3.5], wallsM2: [8.28, 9.45, 10.8, 7.61], wallM2: 36.14 };
    expect(roomWallAreasM2(opened)).toEqual([8.28, 9.45, 10.8, 7.61]);
    expect(roomFinishQuantity({ ...wallTile, walls: [0] }, 'wall', opened)).toBe(9.1); // 8.28 m² + 10 %
    expect(roomFinishQuantity(wallTile, 'wall', opened)).toBe(39.8); // 36.14 m² + 10 %
    // Not beside the walls they were read with — none recorded, not as many, or not areas — they count gross.
    expect(roomWallAreasM2({ ...bedroom, wallsM2: [8.28, 9.45, 10.8, 7.61] })).toEqual([10.8, 9.45, 10.8, 9.45]);
    expect(roomWallAreasM2({ ...opened, wallsM2: [8.28] })).toEqual([10.8, 9.45, 10.8, 9.45]);
    expect(roomWallAreasM2({ ...opened, wallsM2: [Number.NaN, 0, 0, 0] })).toEqual([10.8, 9.45, 10.8, 9.45]);
  });

  it('counts a share of the floor and the walls chosen one by one from that part of the room alone', () => {
    expect(roomFinishQuantity({ ...product(), share: 0.25 }, 'floor', bedroom)).toBe(3.9); // 3.5 m² + 10 %
    expect(roomFinishQuantity({ ...wallTile, walls: [1] }, 'wall', bedroom)).toBe(10.4); // 9.45 m² + 10 %
    // Litres over the walls together, not a tin per wall: 31.05 m² at 10 m² a litre.
    expect(roomFinishQuantity({ ...paint, walls: [0, 2, 3] }, 'wall', bedroom)).toBe(4);
    expect(roomFinishQuantity({ ...paint, walls: [9] }, 'wall', bedroom)).toBe(0);
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

describe('a floor in two products', () => {
  const parquet = product({ productId: 8, nameKa: 'პარკეტი' });
  const shared = withFloorShare(withFloorProduct(withFloorProduct({}, rooms, 'bed', 0, product()), rooms, 'bed', 1, tile), rooms, 'bed', 0.7);

  it('takes a second product at half the floor, under a key of its own', () => {
    const two = withFloorProduct(withFloorProduct({}, rooms, 'bed', 0, product()), rooms, 'bed', 1, tile);
    expect(Object.keys(two)).toEqual(['laminate_room:bed', 'floor-tiles_room:bed/floor2']);
    expect(two['laminate_room:bed']).toMatchObject({ share: 0.5, qty: 7.7, surface: 'floor', roomId: 'bed' });
    expect(two['floor-tiles_room:bed/floor2']).toMatchObject({ share: 0.5, qty: 7.7, totalPrice: 385 });
  });

  it('splits it as the slider says, each product counted over its own share', () => {
    expect(shared['laminate_room:bed']).toMatchObject({ share: 0.7, qty: 10.8, totalPrice: 432 });
    expect(shared['floor-tiles_room:bed/floor2']).toMatchObject({ share: 0.3, qty: 4.6, totalPrice: 230 });
    expect(roomFinishesOf(shared, bedroom).floor.map(([, p]) => p.productId)).toEqual([7, 9]);
    // One product is the whole floor: there is nothing to split.
    const single = withFloorProduct({}, rooms, 'bed', 0, product());
    expect(withFloorShare(single, rooms, 'bed', 0.3)).toBe(single);
  });

  it('keeps the split when either product changes, and a second product is replaced, never a third added', () => {
    const changed = withFloorProduct(shared, rooms, 'bed', 0, parquet);
    expect(changed['laminate_room:bed']).toMatchObject({ productId: 8, share: 0.7 });
    const replaced = withFloorProduct(shared, rooms, 'bed', 1, parquet);
    expect(Object.keys(replaced)).toEqual(['laminate_room:bed', 'laminate_room:bed/floor2']);
    expect(replaced['laminate_room:bed/floor2']).toMatchObject({ productId: 8, share: 0.3 });
  });

  it('gives the whole floor to the product that is left, and to one product chosen twice', () => {
    const left = withFloorProduct(shared, rooms, 'bed', 0, null);
    expect(Object.keys(left)).toEqual(['floor-tiles_room:bed']);
    expect(left['floor-tiles_room:bed'].share).toBeUndefined();
    expect(left['floor-tiles_room:bed'].qty).toBe(15.4);
    const twice = withFloorProduct(shared, rooms, 'bed', 1, product());
    expect(Object.keys(twice)).toEqual(['laminate_room:bed']);
    expect(twice['laminate_room:bed']).toMatchObject({ qty: 15.4 });
    expect(twice['laminate_room:bed'].share).toBeUndefined();
  });

  it('is a whole floor again when chosen for the whole room', () => {
    const whole = withRoomFinish(shared, rooms, ['bed'], 'floor', parquet);
    expect(Object.keys(whole)).toEqual(['laminate_room:bed']);
    expect(whole['laminate_room:bed']).toMatchObject({ productId: 8, qty: 15.4 });
  });
});

describe('walls chosen one by one', () => {
  const painted = withRoomFinish({}, rooms, ['bed'], 'wall', paint);
  const feature = withWallProduct(painted, rooms, 'bed', 1, wallTile);

  it('leaves the room’s paint on the other walls when one wall takes a tile, one pick per product', () => {
    expect(Object.keys(feature)).toEqual(['paint_room:bed/walls12', 'wall-tiles_room:bed/walls11']);
    expect(feature['paint_room:bed/walls12']).toMatchObject({ walls: [0, 2, 3], qty: 4, totalPrice: 120, surface: 'wall' });
    expect(feature['wall-tiles_room:bed/walls11']).toMatchObject({ walls: [1], qty: 10.4, totalPrice: 468 });
    const read = roomFinishesOf(feature, bedroom);
    expect(read.walls).toBeNull();
    expect(read.byWall?.map((p) => p?.productId ?? null)).toEqual([12, 11, 12, 12]);
  });

  it('takes a wall back to nothing, and ignores a wall the room does not have', () => {
    const bare = withWallProduct(feature, rooms, 'bed', 3, null);
    expect(bare['paint_room:bed/walls12']).toMatchObject({ walls: [0, 2], qty: 3 });
    expect(roomFinishesOf(bare, bedroom).byWall?.map((p) => p?.productId ?? null)).toEqual([12, 11, 12, null]);
    expect(withWallProduct(feature, rooms, 'bed', 4, paint)).toBe(feature);
  });

  it('switches between the whole room and wall by wall, keeping what covers most of the room', () => {
    const whole = withWallsOneByOne(feature, rooms, 'bed', false);
    expect(Object.keys(whole)).toEqual(['paint_room:bed']);
    expect(whole['paint_room:bed']).toMatchObject({ qty: 5 });
    expect(whole['paint_room:bed'].walls).toBeUndefined();
    const again = withWallsOneByOne(whole, rooms, 'bed', true);
    expect(Object.keys(again)).toEqual(['paint_room:bed/walls12']);
    expect(again['paint_room:bed/walls12']).toMatchObject({ walls: [0, 1, 2, 3], qty: 5 });
    expect(withWallsOneByOne({}, rooms, 'bed', true)).toEqual({});
    // One product chosen for the whole room replaces whatever the walls were in.
    expect(Object.keys(withRoomFinish(feature, rooms, ['bed'], 'wall', wallTile))).toEqual(['wall-tiles_room:bed']);
  });

  it('copies a room’s floor, split and all, and its walls product into the rooms like it — not walls chosen one by one', () => {
    const copied = withSameFinish(shared(), rooms, 'bed', ['liv'], 'floor');
    expect(copied['laminate_room:liv']).toMatchObject({ share: 0.7, qty: 15.4 });
    expect(copied['floor-tiles_room:liv/floor2']).toMatchObject({ share: 0.3, qty: 6.6 });
    expect(Object.keys(withSameFinish(painted, rooms, 'bed', ['liv', 'kit'], 'wall')).sort()).toEqual(['paint_room:bed', 'paint_room:kit', 'paint_room:liv']);
    expect(withSameFinish(feature, rooms, 'bed', ['liv'], 'wall')).toBe(feature);
  });

  function shared() {
    return withFloorShare(withFloorProduct(withFloorProduct({}, rooms, 'bed', 0, product()), rooms, 'bed', 1, tile), rooms, 'bed', 0.7);
  }
});

describe('a room’s finishes put back in shape — by the store after an edit and by the server on a save', () => {
  const on = (p: SelectedProduct, extra: Partial<SelectedProduct> = {}): SelectedProduct => ({ ...p, roomId: 'bed', ...extra });

  it('puts the room’s walls product on the walls nobody chose one by one', () => {
    const picks = { 'paint_room:bed': on(paint, { surface: 'wall' }), 'wall-tiles_room:bed/walls11': on(wallTile, { surface: 'wall', walls: [2] }) };
    const shaped = normalizeRoomFinishes(picks, rooms);
    expect(Object.keys(shaped)).toEqual(['paint_room:bed/walls12', 'wall-tiles_room:bed/walls11']);
    expect(shaped['paint_room:bed/walls12'].walls).toEqual([0, 1, 3]);
  });

  it('gives a wall claimed twice to the first, and lets walls the room does not have go', () => {
    const picks = {
      'paint_room:bed/walls12': on(paint, { surface: 'wall', walls: [0, 1, 7] }),
      'wall-tiles_room:bed/walls11': on(wallTile, { surface: 'wall', walls: [1, 2] }),
      'paint_room:bed/walls13': on(paint, { productId: 13, surface: 'wall', walls: [9] }),
    };
    const shaped = normalizeRoomFinishes(picks, rooms);
    expect(Object.keys(shaped)).toEqual(['paint_room:bed/walls12', 'wall-tiles_room:bed/walls11']);
    expect(shaped['paint_room:bed/walls12'].walls).toEqual([0, 1]);
    expect(shaped['wall-tiles_room:bed/walls11'].walls).toEqual([2]);
  });

  it('keeps two floor products at most, their shares making the whole, and moves a lone second up', () => {
    const three = {
      'laminate_room:bed': on(product(), { surface: 'floor', share: 0.8 }),
      'floor-tiles_room:bed/floor2': on(tile, { surface: 'floor', share: 0.8 }),
      'laminate_room:bed/floor3': on(product({ productId: 8 }), { surface: 'floor' }),
    };
    const shaped = normalizeRoomFinishes(three, rooms);
    expect(Object.keys(shaped)).toEqual(['laminate_room:bed', 'floor-tiles_room:bed/floor2']);
    expect(shaped['laminate_room:bed'].share).toBe(0.8);
    expect(shaped['floor-tiles_room:bed/floor2'].share).toBe(0.2);
    const lone = normalizeRoomFinishes({ 'floor-tiles_room:bed/floor2': on(tile, { surface: 'floor', share: 0.3 }) }, rooms);
    expect(Object.keys(lone)).toEqual(['floor-tiles_room:bed']);
    expect(lone['floor-tiles_room:bed'].share).toBeUndefined();
  });

  it('is the same object when everything is already in shape', () => {
    const picks = withWallProduct(withFloorProduct(withFloorProduct({}, rooms, 'bed', 0, product()), rooms, 'bed', 1, tile), rooms, 'bed', 2, wallTile);
    expect(normalizeRoomFinishes(picks, rooms)).toBe(picks);
    expect(withRoomFinishQuantities(picks, rooms)).toBe(picks);
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

  it('wears walls chosen one by one on those walls, and a floor two products share in both, the larger part first', () => {
    const plan = rebuildRooms(blank, wallsForRectangle({ x: 0, z: 0, width: 4, depth: 3.5 }, 0.12, 'user', 'r'));
    const id = plan.rooms[0].id;
    const flat = [{ ...bedroom, id }];
    let picks = withRoomFinish({}, flat, [id], 'wall', { ...paint, textureUrl: '/p.jpg' });
    picks = withWallProduct(picks, flat, id, 1, { ...wallTile, textureUrl: '/t.jpg' });
    picks = withFloorShare(withFloorProduct(withFloorProduct(picks, flat, id, 0, product()), flat, id, 1, tile), flat, id, 0.3);
    const finishes = boardFinishesFromPicks(plan, picks);
    const walls = finishes.filter((f) => f.surface === 'wall').map((f) => [f.wallIndex, f.product?.productId]);
    expect(walls.sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual([
      [0, 12],
      [1, 11],
      [2, 12],
      [3, 12],
    ]);
    // Both parts of the floor, each bought for its share; the board draws the first.
    const floors = finishes.filter((f) => f.surface === 'floor');
    expect(floors.map((f) => [f.product?.productId, f.share])).toEqual([
      [9, 0.7],
      [7, 0.3],
    ]);
    expect(floors[0].product!.qty + floors[1].product!.qty).toBeCloseTo(plan.rooms[0].areaM2, 1);
  });

  it('draws a pick with what it carries from its catalogue row', () => {
    const drawn = catalogProductFromPick({ ...product(), slug: 'lam', textureUrl: '/t.jpg', colorHex: '#abcdef', specs: { textureScaleM: 0.5 } });
    expect(drawn).toMatchObject({ id: 7, slug: 'lam', textureUrl: '/t.jpg', colorHex: '#abcdef', categorySlug: 'laminate', specs: { textureScaleM: 0.5 } });
  });
});
