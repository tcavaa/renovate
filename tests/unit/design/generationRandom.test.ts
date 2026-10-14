import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { footprintOf } from '@/lib/design/manipulate';
import { boxInPolygon, refreshRoom } from '@/lib/design/planGeometry';
import { pickNearBest, seededRng, weightedOrder, weightedPick } from '@/lib/design/random';
import { generatedFinish, styleFinishProduct, surfaceSpecs, withStyleFinishes } from '@/lib/design/surfaces';
import { getStyle } from '@/lib/design/styles';
import type { PlacedItem, PlanRoom } from '@/lib/design/types';

const rect = (id: string, type: PlanRoom['type'], w: number, d: number): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });

function product(id: number, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: 'sofas', pricePerUnit: 1000, unit: 'piece', imageUrl: null, colorHex: null,
    textureUrl: null, model3dKind: 'sofa_3seat', model3dUrl: `/models/p${id}.glb`, widthCm: 200, depthCm: 90, heightCm: 80, styleTags: ['scandinavian'],
    tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null, ...overrides,
  };
}

const signature = (items: PlacedItem[]) => items.map((i) => `${i.kind}@${i.position.x.toFixed(2)},${i.position.z.toFixed(2)}:${i.rotation.toFixed(2)}`).join('|');

describe('seeded randomness (lib/design/random)', () => {
  it('repeats itself for one seed and differs between seeds', () => {
    const a = seededRng(7);
    const b = seededRng(7);
    const c = seededRng(8);
    const run = (r: () => number) => Array.from({ length: 5 }, r);
    expect(run(a)).toEqual(run(b));
    expect(run(seededRng(7))).not.toEqual(run(c));
  });

  it('never picks a weight of zero, keeps every item in an order, and without an rng takes the best', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 200; i++) expect(weightedPick(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1), rng)).not.toBe('b');
    expect(weightedOrder([1, 2, 3, 4], () => 1, rng).sort()).toEqual([1, 2, 3, 4]);
    expect(pickNearBest([{ value: 'low', score: 1 }, { value: 'high', score: 9 }], 100)).toBe('high');
  });
});

describe('a generated room is laid out differently each time', () => {
  const living = rect('living', 'living_room', 6, 5);

  it('is the same room without an rng, and the same room for the same seed', () => {
    expect(signature(layoutRoom(living))).toBe(signature(layoutRoom(living)));
    expect(signature(layoutRoom(living, { rng: seededRng(3) }))).toBe(signature(layoutRoom(living, { rng: seededRng(3) })));
  });

  it('varies between seeds, and every piece of every variant stands inside the room', () => {
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const items = layoutRoom(living, { rng: seededRng(seed) });
      layouts.add(signature(items));
      for (const item of items.filter((i) => i.elevationM < 0.05 && i.slot !== 'rug')) {
        expect(boxInPolygon(footprintOf(item.position, item.size, item.rotation), living.polygon), `${item.kind} seed ${seed}`).toBe(true);
      }
    }
    expect(layouts.size).toBeGreaterThan(5);
  });

  it('keeps the pieces a room is for: a bed in every bedroom, whatever the decor does', () => {
    const bedroom = rect('bed', 'bedroom', 4, 4);
    for (let seed = 1; seed <= 20; seed++) expect(layoutRoom(bedroom, { rng: seededRng(seed) }).some((i) => i.kind === 'bed_double')).toBe(true);
  });
});

describe('every product with a model can be generated', () => {
  const room = rect('room', 'living_room', 6, 5);
  const sofa: PlacedItem = { id: 's', roomId: 'room', slot: 'sofa', kind: 'sofa_3seat', position: { x: 3, z: 0.5 }, elevationM: 0, rotation: 0, size: { width: 2.2, depth: 0.9, height: 0.8 }, product: null };
  const catalog = [
    product(1, { styleTags: ['scandinavian'], pricePerUnit: 900 }),
    product(2, { styleTags: ['scandinavian'], pricePerUnit: 2400 }),
    product(3, { styleTags: ['vintage'], pricePerUnit: 1300 }),
    product(4, { styleTags: ['industrial'], pricePerUnit: 600 }),
    product(5, { styleTags: [], pricePerUnit: 5000 }),
  ];

  it('draws every sofa over enough generations, the style’s own most often', () => {
    const counts = new Map<number, number>();
    for (let seed = 1; seed <= 400; seed++) {
      const [placed] = matchProducts([sofa], catalog, { styleId: 'scandinavian', rooms: [room], rng: seededRng(seed) });
      const id = placed.product!.productId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const p of catalog) expect(counts.get(p.id) ?? 0, `product ${p.id}`).toBeGreaterThan(0);
    expect((counts.get(1) ?? 0) + (counts.get(2) ?? 0)).toBeGreaterThan(200);
  });

  it('takes the best, as before, without an rng', () => {
    const picks = new Set(Array.from({ length: 5 }, () => matchProducts([sofa], catalog, { styleId: 'scandinavian', rooms: [room] })[0].product!.productId));
    expect(picks.size).toBe(1);
  });
});

describe('a generated room’s floor and walls are drawn from the style’s kind of finish', () => {
  const finish = (id: number, category: string, surfaces: Array<'floor' | 'wall'>, wet = false, textureUrl = `/textures/f${id}.webp`) =>
    product(id, { categorySlug: category, model3dKind: null, model3dUrl: null, textureUrl, unit: 'm2', specs: { surfaces, wet }, styleTags: ['scandinavian'] });
  const style = getStyle('scandinavian');
  const bedroom = rect('bed', 'bedroom', 4, 4);
  const bathroom = rect('bath', 'bathroom', 2, 2);
  const catalog = [
    finish(10, 'paint', ['wall'], false, style.rooms.bedroom?.wall?.textureUrl ?? style.surfaces.wall.textureUrl ?? undefined),
    finish(11, 'paint', ['wall']),
    finish(12, 'paint', ['wall']),
    finish(13, 'wall-tiles', ['wall']),
    finish(20, 'wall-tiles', ['wall'], true, style.surfaces.wetWall.textureUrl ?? undefined),
    finish(21, 'wall-tiles', ['wall'], true),
    finish(22, 'paint', ['wall'], false),
  ];

  it('varies a bedroom’s paint, always among the paints, and a bathroom’s tiles, always wet ones', () => {
    const own = styleFinishProduct(catalog, bedroom, 'wall', 'scandinavian');
    expect(own?.id).toBe(10);
    const bedroomWalls = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const wall = generatedFinish(bedroom, 'wall', 'scandinavian', catalog, seededRng(seed));
      bedroomWalls.add(wall.product!.productId);
      expect(wall.laidFor).toBe('bedroom');
      const tiles = generatedFinish(bathroom, 'wall', 'scandinavian', catalog, seededRng(seed));
      expect(surfaceSpecs(catalog.find((p) => p.id === tiles.product!.productId)!).wet).toBe(true);
    }
    expect([...bedroomWalls].sort()).toEqual([10, 11, 12, 22]);
  });

  it('is kept by the pass that lays the style’s products while the room is the kind it was laid for, and laid again when it is retyped', () => {
    const drawn = generatedFinish(bedroom, 'wall', 'scandinavian', catalog, seededRng(5));
    expect(withStyleFinishes([drawn], [bedroom], 'scandinavian', catalog)).toEqual([drawn]);
    const retyped = withStyleFinishes([drawn], [{ ...bedroom, type: 'bathroom' }], 'scandinavian', catalog);
    expect(surfaceSpecs(catalog.find((p) => p.id === retyped[0].product!.productId)!).wet).toBe(true);
  });
});
