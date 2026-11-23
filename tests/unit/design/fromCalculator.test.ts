import { describe, expect, it } from 'vitest';
import { applyFinishPicks, applyFurniturePicks, picksFromCalculator, placeFurniturePicks, type CalculatorPicks } from '@/lib/design/fromCalculator';
import { catalogProductFromPick } from '@/lib/calculator/roomFinishes';
import { refreshRoom } from '@/lib/design/planGeometry';
import { footprintInRoom, footprintOf, footprintsOverlap, inDoorway } from '@/lib/design/manipulate';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { SelectedProduct } from '@/lib/calculator/types';
import { defaultFinishes, keepChosen } from '@/lib/design/generateScene';
import type { FloorPlan, PlacedItem, PlanRoom, SurfaceFinish } from '@/lib/design/types';

/**
 * A room's floor and walls chosen in the calculator reach the 3D design on the surface they
 * were chosen for: a wall tile that could also be laid on a floor stays on the walls.
 */

const plan: FloorPlan = {
  rooms: [
    refreshRoom({ id: 'bath', type: 'bathroom', name: 'bath', polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] }),
  ],
  metresPerPixel: null,
  bounds: { width: 2, depth: 2 },
  source: 'manual',
  wallThicknessM: 0.12,
};

const wallTile: SelectedProduct = {
  productId: 11,
  nameKa: 'მარმარილოს ფილა',
  pricePerUnit: 45,
  unit: 'm2',
  qty: 23.8,
  totalPrice: 1071,
  imageUrl: null,
  categorySlug: 'wall-tiles',
  roomId: 'bath',
  surface: 'wall',
  textureUrl: '/marble.jpg',
  // Sold for walls and floors alike.
  specs: { surfaces: ['wall', 'floor'], wet: true },
};

describe('the calculator’s room finishes in 3D', () => {
  it('carry the surface they were chosen for', () => {
    const picks = picksFromCalculator({ 'wall-tiles_room:bath': wallTile }, {});
    expect(picks.roomProducts).toEqual([{ roomId: 'bath', productId: 11, surface: 'wall' }]);
    // A pick from before it carried its surface is read by its category.
    const { surface: _surface, ...older } = wallTile;
    expect(picksFromCalculator({ 'wall-tiles_room:bath': older }, {}).roomProducts).toEqual([{ roomId: 'bath', productId: 11, surface: 'wall' }]);
  });

  it('go on that surface only, even when the product would suit another', () => {
    const catalog = [catalogProductFromPick(wallTile)];
    const finishes = applyFinishPicks([], plan, picksFromCalculator({ 'wall-tiles_room:bath': wallTile }, {}), catalog);
    expect(finishes.map((f) => `${f.roomId}:${f.surface}:${f.product?.productId}`)).toEqual(['bath:wall:11']);
  });

  it('go on the walls they were chosen for one by one, and a floor two products share in both, the one with more of it first', () => {
    const paint: SelectedProduct = { ...wallTile, productId: 12, categorySlug: 'paint', textureUrl: '/paint.jpg', specs: { surfaces: ['wall'] }, walls: [0, 2, 3] };
    const tile: SelectedProduct = { ...wallTile, walls: [1] };
    const floor = (productId: number, share: number): SelectedProduct => ({ ...wallTile, productId, categorySlug: 'floor-tiles', surface: 'floor', textureUrl: `/floor-${productId}.jpg`, specs: { surfaces: ['floor'] }, share });
    const selected = { 'paint_room:bath/walls12': paint, 'wall-tiles_room:bath/walls11': tile, 'floor-tiles_room:bath': floor(21, 0.3), 'floor-tiles_room:bath/floor2': floor(22, 0.7) };
    const picks = picksFromCalculator(selected, {});
    expect(picks.roomProducts).toContainEqual({ roomId: 'bath', productId: 12, surface: 'wall', walls: [0, 2, 3] });
    expect(picks.roomProducts).toContainEqual({ roomId: 'bath', productId: 21, surface: 'floor', share: 0.3 });
    const finishes = applyFinishPicks([], plan, picks, Object.values(selected).map(catalogProductFromPick));
    const walls = finishes.filter((f) => f.surface === 'wall').map((f) => [f.wallIndex, f.product?.productId]);
    expect(walls.sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual([
      [0, 12],
      [1, 11],
      [2, 12],
      [3, 12],
    ]);
    // Each wall is bought by its own area: two metres of wall 2.7 m high.
    expect(finishes.find((f) => f.wallIndex === 1)?.product?.qty).toBe(5.4);
    // Both, each bought for its share of the floor, as the calculator priced them; the one with more of it drawn.
    expect(finishes.filter((f) => f.surface === 'floor').map((f) => [f.product?.productId, f.share])).toEqual([
      [22, 0.7],
      [21, 0.3],
    ]);
  });

  it('keep every part of a floor two products share through a new layout and a plan edit', () => {
    const floor = (productId: number, share: number): SelectedProduct => ({ ...wallTile, productId, categorySlug: 'floor-tiles', surface: 'floor', textureUrl: `/floor-${productId}.jpg`, specs: { surfaces: ['floor'], wet: true }, share });
    const selected = { 'floor-tiles_room:bath': floor(21, 0.4), 'floor-tiles_room:bath/floor2': floor(22, 0.6) };
    const catalog = Object.values(selected).map(catalogProductFromPick);
    const split = applyFinishPicks([], plan, picksFromCalculator(selected, {}), catalog);
    const floors = (list: SurfaceFinish[]) => list.filter((f) => f.roomId === 'bath' && f.surface === 'floor').map((f) => [f.product?.productId, f.share]);
    // A generation (with the catalogue) and a plan edit (without one) lay the style's defaults again.
    for (const defaults of [defaultFinishes(plan, 'modern', catalog), defaultFinishes(plan, 'modern')]) {
      expect(floors(keepChosen(defaults, split))).toEqual([
        [22, 0.6],
        [21, 0.4],
      ]);
    }
    // The style's own floor is still replaced by the fresh one.
    const styled = defaultFinishes(plan, 'modern', catalog);
    expect(keepChosen(styled, styled.map((f) => ({ ...f })))).toEqual(styled);
  });
});

describe('the calculator’s furniture in 3D', () => {
  const furniture = (id: number, kind: string, widthCm: number, depthCm: number, heightCm: number): CatalogProduct =>
    ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: kind, pricePerUnit: 500, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/p${id}.glb`, widthCm, depthCm, heightCm, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null }) as CatalogProduct;
  /** A bedroom 4 × 3.5 m: wall 0 runs along z = 0 and faces +z. */
  const bedroom: PlanRoom = refreshRoom({ id: 'bed', type: 'bedroom', name: 'bed', polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3.5 }, { x: 0, z: 3.5 }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
  const flat: FloorPlan = { rooms: [bedroom], metresPerPixel: null, bounds: { width: 4, depth: 3.5 }, source: 'manual', wallThicknessM: 0.12 };
  const styleWardrobe = furniture(1, 'wardrobe', 120, 58, 200);
  const styleDresser = furniture(2, 'dresser', 100, 45, 80);
  /** A piece the style stood with its back on wall 0, its middle `x` along it. */
  const onWall0 = (id: string, product: CatalogProduct, x: number): PlacedItem => ({
    id,
    roomId: 'bed',
    slot: product.model3dKind as PlacedItem['slot'],
    kind: product.model3dKind!,
    position: { x, z: product.depthCm! / 200 },
    rotation: 0,
    elevationM: 0,
    size: { width: product.widthCm! / 100, depth: product.depthCm! / 100, height: product.heightCm! / 100 },
    product: { productId: product.id, nameKa: product.nameKa, slug: product.slug, brand: null, pricePerUnit: 500, unit: 'piece', qty: 1, totalPrice: 500, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: product.model3dUrl, categorySlug: product.categorySlug, store: null },
    origin: 'style',
  });
  const items = [onWall0('wardrobe', styleWardrobe, 1.4), onWall0('dresser', styleDresser, 2.9)];
  const picked = (catalog: CatalogProduct[], picks: CalculatorPicks['furniture'], list = items) => applyFurniturePicks(list, flat, { furniture: picks, productIds: [] }, catalog);
  const box = (i: PlacedItem) => footprintOf(i.position, i.size, i.rotation);
  const clashes = (list: PlacedItem[], item: PlacedItem) => list.filter((o) => o.id !== item.id && footprintsOverlap(box(item), box(o), 0.01));

  it('take their slot standing where the real product belongs — its back on the slot’s wall — inside the room', () => {
    const deep = furniture(10, 'wardrobe', 100, 72, 210);
    const next = picked([styleWardrobe, styleDresser, deep], [{ roomId: 'bed', productId: 10 }]);
    const wardrobe = next.find((i) => i.product?.productId === 10)!;
    expect(wardrobe.origin).toBe('calculator');
    expect(wardrobe.size.depth).toBeCloseTo(0.72, 5);
    expect(wardrobe.position.z).toBeCloseTo(0.36, 5);
    expect(footprintInRoom(box(wardrobe), bedroom.polygon)).toBe(true);
    expect(next).toHaveLength(2);
  });

  it('go to a free spot of the room, at their own size, when their slot cannot take them — never another product in their place', () => {
    // Two metres of dresser at the 1 m dresser's slot would stand 10 cm into the wardrobe.
    const wide = furniture(11, 'dresser', 200, 50, 80);
    const next = picked([styleWardrobe, styleDresser, wide], [{ roomId: 'bed', productId: 11 }]);
    const dresser = next.find((i) => i.product?.productId === 11)!;
    expect(dresser.size.width).toBeCloseTo(2, 5);
    expect(footprintInRoom(box(dresser), bedroom.polygon)).toBe(true);
    expect(clashes(next, dresser)).toEqual([]);
    expect(next.filter((i) => i.slot === 'dresser')).toHaveLength(1);
  });

  it('with no slot of their kind, are given a spot found for their own size', () => {
    const desk = furniture(12, 'desk', 180, 80, 75);
    const next = picked([styleWardrobe, styleDresser, desk], [{ roomId: 'bed', productId: 12 }]);
    const placed = next.find((i) => i.product?.productId === 12)!;
    expect(placed.size).toEqual({ width: 1.8, depth: 0.8, height: 0.75 });
    expect(footprintInRoom(box(placed), bedroom.polygon)).toBe(true);
    expect(clashes(next, placed)).toEqual([]);
  });

  it('keep a door’s way clear wherever the room has a spot that does, before they stand in it at their slot', () => {
    // A door on wall 1 (x = 4) whose way runs 0.9 m into the room over z 0.15–0.95: 1.6 m of
    // dresser at the dresser's slot (x 2.1–3.7) stands in it, and only there.
    const door = { id: 'd', kind: 'door' as const, wallIndex: 1, t: 0.55 / 3.5, widthM: 0.8, heightM: 2.1, sillM: 0, roomId: 'bed', exterior: false };
    const withDoor = refreshRoom({ ...bedroom, openings: [door] });
    const wide = furniture(14, 'dresser', 160, 45, 80);
    const next = applyFurniturePicks(items, { ...flat, rooms: [withDoor] }, { furniture: [{ roomId: 'bed', productId: 14 }], productIds: [] }, [styleWardrobe, styleDresser, wide]);
    const dresser = next.find((i) => i.product?.productId === 14)!;
    expect(inDoorway(dresser, withDoor)).toBe(false);
    expect(footprintInRoom(box(dresser), withDoor.polygon)).toBe(true);
    expect(clashes(next, dresser)).toEqual([]);
  });

  it('where they fit nowhere, are left out of the 3D and said so — never stood out of the room or in a piece, the slot keeping its piece', () => {
    const huge = furniture(13, 'wardrobe', 600, 70, 220);
    const { items: next, outcomes } = placeFurniturePicks(items, flat, { furniture: [{ roomId: 'bed', productId: 13 }], productIds: [] }, [styleWardrobe, styleDresser, huge]);
    expect(next.some((i) => i.product?.productId === 13)).toBe(false);
    expect(next.find((i) => i.id === 'wardrobe')?.product?.productId).toBe(1);
    expect(outcomes).toEqual([{ roomId: 'bed', productId: 13, step: 'unplaced', itemId: null, placedIn: null }]);
  });
});

describe('what a calculator pick brings with it', () => {
  const furniture = (id: number, kind: string, widthCm: number, depthCm: number, heightCm: number, patch: Partial<CatalogProduct> = {}): CatalogProduct =>
    ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: kind, pricePerUnit: 500, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/p${id}.glb`, widthCm, depthCm, heightCm, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null, ...patch }) as CatalogProduct;
  const room = (id: string, type: PlanRoom['type'], w: number, d: number): PlanRoom =>
    refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
  const planOf = (r: PlanRoom): FloorPlan => ({ rooms: [r], metresPerPixel: null, bounds: { width: 10, depth: 10 }, source: 'manual', wallThicknessM: 0.12 });
  const scene = (p: CatalogProduct, qty = 1) => ({ productId: p.id, nameKa: p.nameKa, slug: p.slug, brand: null, pricePerUnit: p.pricePerUnit, unit: p.unit, qty, totalPrice: p.pricePerUnit * qty, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: p.model3dUrl, categorySlug: p.categorySlug, store: null });
  const piece = (id: string, roomId: string, p: CatalogProduct, position: { x: number; z: number }, patch: Partial<PlacedItem> = {}): PlacedItem => ({
    id, roomId, slot: p.model3dKind as PlacedItem['slot'], kind: p.model3dKind!, position, rotation: 0, elevationM: 0,
    size: { width: p.widthCm! / 100, depth: p.depthCm! / 100, height: p.heightCm! / 100 }, product: scene(p), origin: 'style', ...patch,
  });

  it('a shop’s kitchen unit is a unit at its own size, its back on the run’s wall — not a run made to measure', () => {
    const kitchen = room('k', 'kitchen', 4, 3);
    const material = { ...furniture(30, 'kitchen_run', 300, 60, 90), categorySlug: 'kitchen-materials', unit: 'm2' as const, model3dKind: null };
    const run = piece('run', 'k', furniture(31, 'kitchen_run', 300, 60, 92), { x: 1.6, z: 0.3 }, { custom: true, kitchenMaterial: scene(material, 3) });
    const unit = furniture(32, 'kitchen_run', 240, 63, 220);
    const next = applyFurniturePicks([run], planOf(kitchen), { furniture: [{ roomId: 'k', productId: 32 }], productIds: [] }, [unit]);
    const placed = next.find((i) => i.product?.productId === 32)!;
    expect(placed.custom).toBe(false);
    expect(placed.kitchenMaterial).toBeUndefined();
    expect(placed.size).toEqual({ width: 2.4, depth: 0.63, height: 2.2 });
    expect(placed.position.z).toBeCloseTo(0.315, 5);
  });

  describe('a shop’s kitchen unit picked for the run', () => {
    const kitchen = room('k', 'kitchen', 4, 3);
    const material = { ...furniture(30, 'kitchen_run', 300, 60, 90), categorySlug: 'kitchen-custom', unit: 'm2' as const, model3dKind: null };
    const wallMaterial = { ...furniture(34, 'kitchen_wall', 300, 35, 70), slug: 'kitchen-wall-oak', categorySlug: 'kitchen-custom', unit: 'm2' as const, model3dKind: null };
    /** A 3 m run made to measure on wall 0, the fridge at its end and its wall cabinets over it. */
    const run = piece('run', 'k', furniture(31, 'kitchen_run', 300, 60, 92), { x: 1.5, z: 0.3 }, { custom: true, kitchenMaterial: scene(material, 3) });
    const fridge = piece('fridge', 'k', furniture(33, 'fridge', 60, 65, 180), { x: 3.32, z: 0.325 });
    const cabinets = piece('wall', 'k', furniture(35, 'kitchen_wall', 300, 35, 70), { x: 1.5, z: 0.175 }, { elevationM: 1.81, custom: true, kitchenMaterial: scene(wallMaterial, 2) });
    const box = (i: PlacedItem) => footprintOf(i.position, i.size, i.rotation);
    const pick = (unit: CatalogProduct, list = [run, fridge, cabinets]) => applyFurniturePicks(list, planOf(kitchen), { furniture: [{ roomId: 'k', productId: unit.id }], productIds: [] }, [unit]);

    it('stands where it fits, never through the wall or into the fridge', () => {
      const wider = furniture(36, 'kitchen_run', 360, 63, 90);
      const next = pick(wider);
      const placed = next.find((i) => i.product?.productId === 36)!;
      expect(footprintInRoom(box(placed), kitchen.polygon)).toBe(true);
      const floor = next.filter((i) => i.id !== placed.id && i.elevationM < 0.05);
      expect(floor.filter((o) => footprintsOverlap(box(placed), box(o), 0.01))).toEqual([]);
    });

    it('where it fits nowhere, is left out of the 3D and the run stays made to measure, never stretched to the run’s size', () => {
      const huge = furniture(37, 'kitchen_run', 600, 63, 90);
      const next = pick(huge);
      expect(next.some((i) => i.product?.productId === 37)).toBe(false);
      expect(next.find((i) => i.id === 'run')).toEqual(run);
    });

    it('has no wall cabinets made to measure over it, as a shop’s run the matcher lays has none', () => {
      const unit = furniture(32, 'kitchen_run', 240, 63, 220);
      const next = pick(unit);
      expect(next.find((i) => i.product?.productId === 32)?.custom).toBe(false);
      expect(next.filter((i) => i.slot === 'kitchen_wall')).toEqual([]);
      // A kitchen maker's material picked for the run keeps them: the run is still made to measure.
      expect(pick({ ...material, id: 38, model3dKind: 'kitchen_run' }).filter((i) => i.slot === 'kitchen_wall')).toHaveLength(1);
    });
  });

  it('the TV stands on the TV unit picked under it', () => {
    const living = room('liv', 'living_room', 5, 4);
    const styleUnit = furniture(40, 'tv_unit', 160, 40, 40);
    const tv = furniture(41, 'tv', 120, 25, 75);
    const items = [piece('unit', 'liv', styleUnit, { x: 2.5, z: 0.2 }), piece('tv', 'liv', tv, { x: 2.5, z: 0.2 }, { elevationM: 0.4 })];
    const taller = furniture(42, 'tv_unit', 180, 45, 62);
    const next = applyFurniturePicks(items, planOf(living), { furniture: [{ roomId: 'liv', productId: 42 }], productIds: [] }, [styleUnit, tv, taller]);
    expect(next.find((i) => i.id === 'tv')?.elevationM).toBeCloseTo(0.62, 5);
  });

  it('as many as were picked: four chairs are four chairs', () => {
    const chair: SelectedProduct = { productId: 50, nameKa: 'სკამი', pricePerUnit: 120, unit: 'piece', qty: 4, totalPrice: 480, imageUrl: null };
    const picks = picksFromCalculator({}, { din: [chair] });
    expect(picks.furniture).toEqual(Array.from({ length: 4 }, () => ({ roomId: 'din', productId: 50 })));
    // A rug sold by the square metre is one rug, however many metres.
    expect(picksFromCalculator({}, { din: [{ ...chair, unit: 'm2', qty: 6 }] }).furniture).toHaveLength(1);
  });
});
