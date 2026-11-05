import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { suggestElectrical } from '@/lib/design/electrical';
import { equipmentCandidates } from '@/lib/design/equipment';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom, polygonBounds } from '@/lib/design/planGeometry';
import { seededRng } from '@/lib/design/random';
import type { FloorPlan, Opening, PlacedItem, PlanRoom } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

function room(id: string, type: RoomType, w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })) });
}
const door = (wallIndex: number, t = 0.5): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM: 0.8, heightM: 2.05, sillM: 0, exterior: false });
const plan = (...rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12 });

function product(id: number, kind: string, nameEn: string, extra: Partial<CatalogProduct> = {}): CatalogProduct {
  return { id, nameKa: nameEn, nameEn, nameRu: null, slug: `p${id}`, brand: null, categorySlug: 'x', categoryId: null, pricePerUnit: 500, unit: 'piece', imageUrl: null, colorHex: '#cccccc', textureUrl: null, model3dKind: kind, model3dUrl: `/m/${id}.glb`, widthCm: 60, depthCm: 60, heightCm: 90, styleTags: ['modern'], tags: null, isFeatured: false, specs: null, coveragePerUnit: null, store: null, ...extra } as CatalogProduct;
}

/** The box a piece takes on the floor, axis-aligned (the layout's pieces stand at right angles). */
function box(i: PlacedItem) {
  const turned = Math.abs(Math.sin(i.rotation)) > 0.7;
  const w = turned ? i.size.depth : i.size.width;
  const d = turned ? i.size.width : i.size.depth;
  return { minX: i.position.x - w / 2, maxX: i.position.x + w / 2, minZ: i.position.z - d / 2, maxZ: i.position.z + d / 2 };
}

describe('the kitchen island', () => {
  it('never stands against a wall: 1.2 m of floor on every side', () => {
    const kitchen = room('k', 'kitchen', 6.5, 5.5, [door(3, 0.2)]);
    for (let seed = 1; seed <= 10; seed++) {
      const items = layoutRoom(kitchen, { rng: seededRng(seed) });
      const island = items.find((i) => i.slot === 'kitchen_island');
      if (!island) continue;
      const b = box(island);
      expect(Math.min(b.minX, b.minZ, 6.5 - b.maxX, 5.5 - b.maxZ), `seed ${seed}`).toBeGreaterThanOrEqual(1.19);
    }
  });

  it('is not a second hob and oven beside a run that has them', () => {
    const kitchen = room('k', 'kitchen', 6.5, 5.5, [door(3, 0.2)]);
    const items = layoutRoom(kitchen, {});
    if (!items.some((i) => i.slot === 'kitchen_island')) return;
    const catalog = [product(1, 'kitchen_run', 'Kitchen run', { widthCm: 300 }), product(2, 'kitchen_island', 'Dark kitchen island with sink, hob and oven', { widthCm: 180, depthCm: 90 })];
    const matched = matchProducts(items, catalog, { styleId: 'modern', rooms: [kitchen] });
    expect(matched.find((i) => i.slot === 'kitchen_island')?.product).toBeNull();
  });
});

describe('the dining table', () => {
  it('seats four at least in a kitchen — 1.2 m or more, never a small table and one chair', () => {
    const kitchen = room('k', 'kitchen', 4.2, 3.4, [door(3, 0.8)]);
    const items = layoutRoom(kitchen, {});
    const table = items.find((i) => i.slot === 'dining_table');
    expect(table).toBeDefined();
    expect(Math.max(table!.size.width, table!.size.depth)).toBeGreaterThanOrEqual(1.2);
    expect(items.filter((i) => i.slot === 'dining_chair').length).toBeGreaterThanOrEqual(3);
  });

  it('is long in a long kitchen', () => {
    const kitchen = room('k', 'kitchen', 7, 3.6, [door(3, 0.5)]);
    const table = layoutRoom(kitchen, {}).find((i) => i.slot === 'dining_table');
    expect(table).toBeDefined();
    expect(Math.max(table!.size.width, table!.size.depth)).toBeGreaterThanOrEqual(1.6);
  });

  it('stands well away from the sofa in a living room, in the free floor', () => {
    const living = room('l', 'living_room', 8, 5, [door(3, 0.5)]);
    const items = layoutRoom(living, {});
    const table = items.find((i) => i.slot === 'dining_table');
    const sofa = items.find((i) => i.slot === 'sofa');
    if (!table || !sofa) return;
    expect(Math.max(table.size.width, table.size.depth)).toBeGreaterThanOrEqual(1.2);
    const t = box(table);
    const s = box(sofa);
    const gap = Math.max(s.minX - t.maxX, t.minX - s.maxX, s.minZ - t.maxZ, t.minZ - s.maxZ);
    expect(gap).toBeGreaterThanOrEqual(0.99);
  });
});

describe('the kitchen\'s style, hood and light', () => {
  it('makes the run in the style\'s own material when the kitchen maker has one', () => {
    const kitchen = room('k', 'kitchen', 4, 3, [door(3, 0.8)]);
    const materials = [
      product(10, 'kitchen_run', 'Oak veneer', { categorySlug: 'kitchen-custom', unit: 'm2', styleTags: ['scandinavian'] }),
      product(11, 'kitchen_run', 'Black lacquer', { categorySlug: 'kitchen-custom', unit: 'm2', styleTags: ['industrial'] }),
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const run = matchProducts(layoutRoom(kitchen, {}), materials, { styleId: 'scandinavian', rooms: [kitchen], rng: seededRng(seed) }).find((i) => i.slot === 'kitchen_run');
      expect(run?.kitchenMaterial?.productId ?? run?.product?.productId).toBe(10);
    }
  });

  it('chooses a round hood first, then a thick one, never a wall of an island frame', () => {
    const catalog = [
      product(20, 'cooker_hood', 'Built-in hood insert', { widthCm: 60, heightCm: 22 }),
      product(21, 'cooker_hood', 'Stainless steel chimney hood', { widthCm: 90, heightCm: 90 }),
      product(22, 'cooker_hood', 'Grey cylindrical island hood', { widthCm: 60, heightCm: 152 }),
      product(23, 'cooker_hood', 'Black suspended hood with shelf frame', { widthCm: 290, heightCm: 116 }),
    ];
    expect(equipmentCandidates('cooker_hood', catalog, 'modern').map((p) => p.id)).toEqual([22, 21, 20]);
  });

  it('sets the light into the wall cabinets\' underside, as long as they are', () => {
    const kitchen = room('k', 'kitchen', 4, 3);
    const run: PlacedItem = { id: 'run', roomId: 'k', slot: 'kitchen_run', kind: 'kitchen_run', position: { x: 1.5, z: 0.31 }, rotation: 0, elevationM: 0, size: { width: 3, depth: 0.62, height: 0.9 }, product: null };
    const wall: PlacedItem = { id: 'w', roomId: 'k', slot: 'kitchen_wall', kind: 'kitchen_wall', position: { x: 1.4, z: 0.17 }, rotation: 0, elevationM: 1.52, size: { width: 2.6, depth: 0.34, height: 0.72 }, product: null };
    const strip = suggestElectrical(plan(kitchen), [run, wall]).find((p) => p.kind === 'light_furniture')!;
    expect(strip.elevationM).toBeCloseTo(1.52, 3);
    expect(strip.lengthM).toBeCloseTo(2.56, 2);
    expect(polygonBounds(kitchen.polygon).width).toBe(4);
  });
});
