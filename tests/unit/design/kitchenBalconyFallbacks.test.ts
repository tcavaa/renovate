import { describe, expect, it } from 'vitest';
import { kitchenRank, layoutPlan, layoutRoom } from '@/lib/design/autoLayout';
import { kitchenWorktopM } from '@/lib/design/kitchenCorner';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom } from '@/lib/design/planGeometry';
import { seededRng } from '@/lib/design/random';
import { BALCONY_CHAIR_MAX_M, BALCONY_TWO_SEATS_M, COMPACT_TABLE_SIDES_M, KITCHEN_RUN_M, doorClearFloor } from '@/lib/design/rules';
import type { Opening, PlacedItem, PlanRoom } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

/**
 * The fourth round's stage 4 (Nini, 23 Nov 2026, decisions 3.5 and 3.6): a kitchen's fallbacks when it
 * would go without its run, its fridge or its table; the run's length; the washing machine's last
 * room; balconies furnished.
 */

type Hole = Omit<Opening, 'roomId' | 'id'>;
function room(id: string, type: RoomType, w: number, d: number, openings: Hole[] = [], at = { x: 0, z: 0 }): PlanRoom {
  const { x, z } = at;
  return refreshRoom({ id, type, name: id, polygon: [{ x, z }, { x: x + w, z }, { x: x + w, z: z + d }, { x, z: z + d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })) });
}
const door = (wallIndex: number, t = 0.5, widthM = 0.8): Hole => ({ kind: 'door', wallIndex, t, widthM, heightM: 2.05, sillM: 0, exterior: false });
const window = (wallIndex: number, t = 0.5, widthM = 1.2): Hole => ({ kind: 'window', wallIndex, t, widthM, heightM: 1.4, sillM: 0.9, exterior: true });

function product(id: number, kind: string, nameEn: string, extra: Partial<CatalogProduct> = {}): CatalogProduct {
  return { id, nameKa: nameEn, nameEn, nameRu: null, slug: `p${id}`, brand: null, categorySlug: 'x', categoryId: null, pricePerUnit: 500, unit: 'piece', imageUrl: null, colorHex: '#cccccc', textureUrl: null, model3dKind: kind, model3dUrl: `/m/${id}.glb`, widthCm: 60, depthCm: 60, heightCm: 90, styleTags: ['modern'], tags: null, isFeatured: false, specs: null, coveragePerUnit: null, store: null, ...extra } as CatalogProduct;
}

/** The box a piece takes on the floor, axis-aligned (the layout's pieces stand at right angles). */
function box(i: Pick<PlacedItem, 'position' | 'size' | 'rotation'>) {
  const turned = Math.abs(Math.sin(i.rotation)) > 0.7;
  const w = turned ? i.size.depth : i.size.width;
  const d = turned ? i.size.width : i.size.depth;
  return { minX: i.position.x - w / 2, maxX: i.position.x + w / 2, minZ: i.position.z - d / 2, maxZ: i.position.z + d / 2 };
}
const apart = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => Math.max(a.minX - b.maxX, b.minX - a.maxX, a.minZ - b.maxZ, b.minZ - a.maxZ);
const of = (items: PlacedItem[], slot: string) => items.filter((i) => i.slot === slot);

describe('a kitchen\'s rank (decision 3.5)', () => {
  const piece = (slot: PlacedItem['slot']): PlacedItem => ({ id: slot, roomId: 'k', slot, kind: slot, position: { x: 0, z: 0 }, rotation: 0, elevationM: 0, size: { width: 1, depth: 1, height: 1 }, product: null });

  it('counts the run, the fridge and a table or an island alike, then the worktop by 1.8 and 1.5 m', () => {
    expect(KITCHEN_RUN_M).toEqual({ preferred: 1.8, small: 1.5, studio: 1.2 });
    expect(kitchenRank([piece('kitchen_run'), piece('fridge'), piece('dining_table')], 2, true)).toEqual([3, 2]);
    expect(kitchenRank([piece('kitchen_run'), piece('fridge'), piece('kitchen_island')], 1.6, true)).toEqual([3, 1]);
    expect(kitchenRank([piece('kitchen_run'), piece('dining_table')], 1.3, true)).toEqual([2, 0]);
    // A studio's kitchen half is held to its run and its fridge: its table may be the living half's.
    expect(kitchenRank([piece('kitchen_run'), piece('fridge')], 1.8, false)).toEqual([2, 2]);
  });
});

describe('a kitchen\'s fallbacks (decision 3.5)', () => {
  it('puts the run on another wall so the table fits (the 2.6 × 4.2 m kitchen)', () => {
    // On the long wall the run and its 1.2 m of working floor left a 76 cm strip and no table.
    const kitchen = room('k', 'kitchen', 2.6, 4.2, [door(0, 0.5)]);
    const items = layoutRoom(kitchen, {});
    expect(of(items, 'kitchen_run')).toHaveLength(1);
    expect(of(items, 'fridge')).toHaveLength(1);
    const table = of(items, 'dining_table')[0];
    expect(table).toBeDefined();
    expect(Math.max(table.size.width, table.size.depth)).toBeGreaterThanOrEqual(1.2);
    expect(of(items, 'dining_chair').length).toBeGreaterThanOrEqual(3);
    expect(kitchenWorktopM(kitchen, items)).toBeGreaterThanOrEqual(KITCHEN_RUN_M.preferred);
  });

  it('shortens the run so the fridge stands hard beside it, on its wall', () => {
    // The whole wall's run left the fridge no wall: the two corner tries were refused.
    const kitchen = room('k', 'kitchen', 2.2, 3.8, [door(2, 0.5)]);
    const items = layoutRoom(kitchen, {});
    const run = of(items, 'kitchen_run')[0];
    const fridge = of(items, 'fridge')[0];
    expect(run).toBeDefined();
    expect(fridge).toBeDefined();
    expect(apart(box(run), box(fridge))).toBeLessThan(0.05);
    expect(Math.abs(run.rotation - fridge.rotation) % (2 * Math.PI)).toBeLessThan(0.01);
    expect(run.size.width).toBeGreaterThanOrEqual(KITCHEN_RUN_M.studio);
  });

  it('gives a kitchen under 10 m² a two-seat table against a wall, its chairs facing each other along it', () => {
    const kitchen = room('k', 'kitchen', 2.2, 3.4, [door(0, 0.5), window(1)]);
    const items = layoutRoom(kitchen, {});
    expect(of(items, 'kitchen_run')).toHaveLength(1);
    expect(of(items, 'fridge')).toHaveLength(1);
    const table = of(items, 'dining_table')[0];
    expect(table).toBeDefined();
    expect(COMPACT_TABLE_SIDES_M).toContain(Math.round(table.size.width * 100) / 100);
    const chairs = of(items, 'dining_chair');
    expect(chairs.length).toBeGreaterThanOrEqual(1);
    // Never a worktop under the 1.5 m a very small kitchen is allowed.
    expect(kitchenWorktopM(kitchen, items)).toBeGreaterThanOrEqual(KITCHEN_RUN_M.small);
    // The table stands against a wall: one of its sides within a few centimetres of the room's edge.
    const t = box(table);
    expect(Math.min(t.minX, t.minZ, 2.2 - t.maxX, 3.4 - t.maxZ)).toBeLessThan(0.05);
  });

  it('lays a kitchen that has everything as it always did: one table for four, no fallback\'s', () => {
    const kitchen = room('k', 'kitchen', 4.2, 3.4, [door(3, 0.8)]);
    const items = layoutRoom(kitchen, {});
    const table = of(items, 'dining_table')[0];
    expect(Math.max(table.size.width, table.size.depth)).toBeGreaterThanOrEqual(1.2);
    expect(of(items, 'fridge')).toHaveLength(1);
  });
});

describe('the washing machine (decision 3.6)', () => {
  // A bathroom under the 4.5 m² a machine needs, a bedroom, and a balcony.
  const bathroom = room('b', 'bathroom', 1.5, 1.9, [door(3, 0.5, 0.7)], { x: 0, z: 0 });
  const bedroom = room('r', 'bedroom', 3.5, 3.5, [door(2, 0.5)], { x: 2, z: 0 });
  const balcony = room('y', 'balcony', 4, 1.6, [door(0, 0.3), { kind: 'railing', wallIndex: 2, t: 0.5, widthM: 4, heightM: 1, sillM: 0, exterior: true }], { x: 2, z: 3.6 });

  it('stands on the balcony, against a wall, when the flat has no hall or kitchen to take it', () => {
    const items = layoutPlan([bathroom, bedroom, balcony], {});
    const washer = of(items, 'washer');
    expect(washer).toHaveLength(1);
    expect(washer[0].roomId).toBe('y');
    const w = box(washer[0]);
    expect(Math.min(w.minX - 2, w.minZ - 3.6, 6 - w.maxX, 5.2 - w.maxZ)).toBeLessThan(0.05);
    // The balcony is laid round it, its table and chairs as well.
    expect(items.some((i) => i.roomId === 'y' && i.slot === 'dining_table')).toBe(true);
  });

  it('stands in the hall before the balcony', () => {
    const hall = room('h', 'hallway', 3, 1.6, [door(0, 0.5), door(2, 0.5)], { x: -4, z: 0 });
    const items = layoutPlan([bathroom, bedroom, balcony, hall], {});
    expect(of(items, 'washer').map((i) => i.roomId)).toEqual(['h']);
  });
});

describe('a balcony (decision 3.6)', () => {
  const railing = (wallIndex: number, widthM: number): Hole => ({ kind: 'railing', wallIndex, t: 0.5, widthM, heightM: 1, sillM: 0, exterior: true });

  it('takes a compact table and two chairs facing each other along a wall, off the door\'s floor, planters off its window', () => {
    const balcony = room('y', 'balcony', 5, 2.2, [door(0, 0.3), window(0, 0.75, 1.2), railing(1, 2.2), railing(2, 5), railing(3, 2.2)]);
    expect(2.2).toBeGreaterThanOrEqual(BALCONY_TWO_SEATS_M);
    for (const seed of [undefined, 1, 2, 3]) {
      const items = layoutRoom(balcony, seed ? { rng: seededRng(seed) } : {});
      const table = of(items, 'dining_table')[0];
      expect(table, `seed ${seed}`).toBeDefined();
      expect(Math.max(table.size.width, table.size.depth)).toBeLessThanOrEqual(Math.max(...COMPACT_TABLE_SIDES_M) + 1e-6);
      const chairs = of(items, 'dining_chair');
      expect(chairs).toHaveLength(2);
      // Facing each other: turned half a turn apart.
      const turn = Math.abs(Math.cos(chairs[0].rotation - chairs[1].rotation));
      expect(turn).toBeGreaterThan(0.99);
      // Nothing in the door's clear floor (90 cm deep, the door's width and 10 cm either side).
      const zone = doorClearFloor('balcony', balcony.openings[0])[0];
      const doorBox = { minX: 1.5 - zone.widthAlong / 2, maxX: 1.5 + zone.widthAlong / 2, minZ: 0, maxZ: zone.depth };
      for (const piece of [table, ...chairs, ...of(items, 'plant')]) expect(apart(box(piece), doorBox), piece.id).toBeGreaterThan(-0.01);
      // A planter stands across no window: none in front of the stretch of wall 0 from 3.15 to 4.35 m.
      for (const plant of of(items, 'plant')) {
        const p = box(plant);
        expect(p.minZ < 0.05 && p.maxX > 3.15 && p.minX < 4.35, plant.id).toBe(false);
      }
    }
  });

  it('seats one at its table where it is narrow', () => {
    const balcony = room('y', 'balcony', 5, 1.2, [door(0, 0.3), railing(1, 1.2), railing(2, 5), railing(3, 1.2)]);
    const items = layoutRoom(balcony, {});
    expect(of(items, 'dining_table')).toHaveLength(1);
    expect(of(items, 'dining_chair')).toHaveLength(1);
  });

  it('is matched with a compact table of another style rather than the style\'s own large one, and café chairs', () => {
    const balcony = room('y', 'balcony', 5, 2.2, [door(0, 0.3), railing(1, 2.2), railing(2, 5), railing(3, 2.2)]);
    const catalog = [
      product(1, 'dining_table', 'Long oak dining table', { widthCm: 160, depthCm: 90, heightCm: 75, styleTags: ['modern'] }),
      product(2, 'dining_table', 'Square plywood bistro table', { widthCm: 70, depthCm: 70, heightCm: 76, styleTags: ['scandinavian'] }),
      product(3, 'dining_chair', 'Upholstered bench on metal frame', { widthCm: 48, depthCm: 170, heightCm: 37, styleTags: ['modern'] }),
      product(4, 'dining_chair', 'Henriksdal bar stool', { widthCm: 64, depthCm: 65, heightCm: 102, styleTags: ['modern'] }),
      product(5, 'dining_chair', 'French café bentwood chair', { widthCm: 31, depthCm: 39, heightCm: 66, styleTags: ['vintage'] }),
    ];
    const matched = matchProducts(layoutRoom(balcony, {}), catalog, { styleId: 'modern', rooms: [balcony] });
    expect(matched.find((i) => i.slot === 'dining_table')?.product?.productId).toBe(2);
    const chairs = matched.filter((i) => i.slot === 'dining_chair' && i.product);
    expect(chairs.length).toBeGreaterThan(0);
    for (const chair of chairs) {
      expect(chair.product?.productId).toBe(5);
      expect(chair.size.depth).toBeLessThanOrEqual(BALCONY_CHAIR_MAX_M.depth);
    }
  });
});
