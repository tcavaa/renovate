import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { footprintOf } from '@/lib/design/manipulate';
import { boxInPolygon, refreshRoom } from '@/lib/design/planGeometry';
import { pickNearBest, rngStreams, roomStreams, seededRng, streamRng, weightedOrder, weightedPick } from '@/lib/design/random';
import { generateScene, type GeneratedScene } from '@/lib/design/generateScene';
import { generationRecordSchema } from '@/lib/validations/design.schema';
import { GENERATION_CATALOG, generationPlan } from '../../helpers/generation';
import { runSeed } from '../../helpers/generationAudit';
import { fixturePlans } from '../../helpers/generationFixtures';
import { generatedFinish, styleFinishProduct, surfaceSpecs, withStyleFinishes } from '@/lib/design/surfaces';
import { getStyle } from '@/lib/design/styles';
import type { FloorPlan, PlacedItem, PlanRoom } from '@/lib/design/types';

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

describe('a stream per key (lib/design/random)', () => {
  const run = (r: () => number, n = 8) => Array.from({ length: n }, r);

  it('is the same for a seed and a key, whatever else was asked for and in whatever order', () => {
    const first = run(streamRng(42, 'layout:r2'));
    const streams = rngStreams(42);
    run(streams('layout:r1'), 50);
    run(streams('match:r2'), 3);
    expect(run(streams('layout:r2'))).toEqual(first);
    // Another seed, another key: another stream.
    expect(run(streamRng(43, 'layout:r2'))).not.toEqual(first);
    expect(run(streamRng(42, 'layout:r3'))).not.toEqual(first);
    expect(run(streamRng(42, 'match:r2'))).not.toEqual(first);
  });

  it('keeps each stream once made: asking for a key again carries on where it left off', () => {
    const streams = rngStreams(7);
    const a = streams('finish:bed');
    expect(streams('finish:bed')).toBe(a);
    const opened = run(streamRng(7, 'finish:bed'), 6);
    expect([...run(a, 3), ...run(streams('finish:bed'), 3)]).toEqual(opened);
  });

  it('names a stage’s room and a part of it', () => {
    const streams = rngStreams(5);
    const match = roomStreams(streams, 'match');
    expect(match('r1')).toBe(streams('match:r1'));
    expect(match('r1', 'way-out:r1-sofa-0')).toBe(streams('match:r1:way-out:r1-sofa-0'));
  });
});

describe('a generated flat draws each room from its own stream', () => {
  const at = (id: string, type: PlanRoom['type'], x: number, w: number, d: number): PlanRoom =>
    refreshRoom({ id, type, name: id, polygon: [{ x, z: 0 }, { x: x + w, z: 0 }, { x: x + w, z: d }, { x, z: d }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });
  const flatOf = (rooms: PlanRoom[]): FloorPlan => ({ ...generationPlan(), rooms, bounds: { width: 30, depth: 6 } });
  const generate = (plan: FloorPlan, seed: number) =>
    generateScene({ plan, styleId: 'modern', budgetGel: null, catalog: GENERATION_CATALOG, proposal: null, finishes: [], electrical: [], seed, at: '2026-11-18T00:00:00.000Z', aiCount: 0 });
  /** What a room was given: its pieces, its floor and walls, its decor. */
  const roomOf = (scene: GeneratedScene, roomId: string) => ({
    items: scene.items.filter((i) => i.roomId === roomId),
    finishes: scene.finishes.filter((f) => f.roomId === roomId),
    decor: scene.decor.filter((d) => d.roomId === roomId),
  });
  const [bed, living] = generationPlan().rooms;
  const guest = at('guest', 'bedroom', 10.6, 3.6, 3.4);

  it('is the same flat for the same seed, and another flat for another seed', () => {
    const plan = flatOf([bed, living, guest]);
    const same = (scene: GeneratedScene) => ({ ...scene, electrical: scene.electrical.map(({ id: _id, ...point }) => point) });
    expect(same(generate(plan, 11))).toEqual(same(generate(plan, 11)));
    const flats = new Set(Array.from({ length: 6 }, (_, k) => JSON.stringify(generate(plan, 100 + k).items.map((i) => [i.id, i.position, i.product?.productId]))));
    expect(flats.size).toBeGreaterThan(1);
  });

  it('leaves every other room as it was when a room before them is retyped', () => {
    // A kitchen first, then a bathroom (the catalogue furnishes neither, so no product of it is
    // "used" before the rooms after it): a bathroom's layout draws more numbers than a kitchen's —
    // and those draws once moved every room after it.
    const draws = (room: PlanRoom) => {
      let n = 0;
      const rng = seededRng(1);
      layoutRoom(room, { rng: () => (n++, rng()) });
      return n;
    };
    expect(draws(at('k', 'bathroom', 15, 3, 2.6))).not.toBe(draws(at('k', 'kitchen', 15, 3, 2.6)));
    for (const seed of [1, 2, 3, 4, 5]) {
      const kitchen = generate(flatOf([at('k', 'kitchen', 15, 3, 2.6), bed, living, guest]), seed);
      const bathroom = generate(flatOf([at('k', 'bathroom', 15, 3, 2.6), bed, living, guest]), seed);
      for (const id of ['bed', 'living', 'guest']) expect(roomOf(bathroom, id), `${id}, seed ${seed}`).toEqual(roomOf(kitchen, id));
    }
  });

  it('leaves every room before it as it was when the last room is resized or retyped', () => {
    // The guest room last: the matcher's "a product used in a room before is drawn less often" reads
    // only the rooms before, so nothing reads it — and its layout's draws once moved every room's products.
    for (const seed of [1, 2, 3, 4, 5]) {
      const base = generate(flatOf([bed, living, guest]), seed);
      for (const changed of [at('guest', 'bedroom', 10.6, 2.9, 3.1), { ...guest, type: 'kitchen' as const }]) {
        const other = generate(flatOf([bed, living, changed]), seed);
        for (const id of ['bed', 'living']) expect(roomOf(other, id), `${id}, seed ${seed}, guest ${changed.type}`).toEqual(roomOf(base, id));
      }
    }
  });

  it('records the seed it was drawn from, and the save route keeps it', () => {
    const scene = generate(flatOf([bed, living]), 2_147_483_000);
    expect(scene.generation.seed).toBe(2_147_483_000);
    expect(generationRecordSchema.parse(scene.generation).seed).toBe(2_147_483_000);
  });
});

describe('the audit draws each fixture plan from a seed of its own', () => {
  // A stream is keyed by the stage and the room's id, and the fixture plans reuse ids (r2 is a room
  // in 15 of them, a bathroom in 6): drawn from one seed, every room of that id would draw the same
  // numbers in every plan, and the audit would sample far fewer draws than it has flats.
  const plans = fixturePlans();

  it('gives every plan another seed for the same draw, and the same one each time', () => {
    for (const n of [1, 2, 3]) {
      const seeds = plans.map((p) => runSeed(p.id, n));
      expect(new Set(seeds).size, `draw ${n}`).toBe(plans.length);
      expect(plans.map((p) => runSeed(p.id, n))).toEqual(seeds);
      for (const seed of seeds) expect(generationRecordSchema.parse({ by: 'engine', at: '2026-11-18T00:00:00.000Z', aiCount: 0, seed }).seed).toBe(seed);
    }
    expect(runSeed(plans[0].id, 1)).not.toBe(runSeed(plans[0].id, 2));
  });

  it('so a room id two plans share draws two streams', () => {
    const sharing = plans.filter((p) => p.plan.rooms.some((r) => r.id === 'r2'));
    expect(sharing.length).toBeGreaterThan(1);
    const first = (planId: string) => Array.from({ length: 4 }, rngStreams(runSeed(planId, 1))('layout:r2'));
    expect(new Set(sharing.map((p) => JSON.stringify(first(p.id)))).size).toBe(sharing.length);
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

  it('draws every armchair over enough generations, the style’s own most often', () => {
    const chair: PlacedItem = { ...sofa, slot: 'armchair', kind: 'armchair', size: { width: 0.8, depth: 0.8, height: 0.8 } };
    const chairs = catalog.map((p) => ({ ...p, model3dKind: 'armchair', widthCm: 80, depthCm: 80 }));
    const counts = new Map<number, number>();
    for (let seed = 1; seed <= 400; seed++) {
      const [placed] = matchProducts([chair], chairs, { styleId: 'scandinavian', rooms: [room], rng: seededRng(seed) });
      const id = placed.product!.productId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const p of chairs) expect(counts.get(p.id) ?? 0, `product ${p.id}`).toBeGreaterThan(0);
    expect((counts.get(1) ?? 0) + (counts.get(2) ?? 0)).toBeGreaterThan(200);
  });

  it('draws the big pieces — a sofa — only from the style’s own when it has any (the rulebook, Y-7)', () => {
    const drawn = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) drawn.add(matchProducts([sofa], catalog, { styleId: 'scandinavian', rooms: [room], rng: seededRng(seed) })[0].product!.productId);
    expect([...drawn].sort()).toEqual([1, 2]);
    // A style with none of its own still gets a sofa.
    expect(matchProducts([sofa], catalog, { styleId: 'modern', rooms: [room], rng: seededRng(3) })[0].product).not.toBeNull();
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

describe('wall cabinets over the kitchen run', () => {
  const kitchen = rect('k', 'kitchen', 4, 3);

  it('hang over the run, on its wall, their bottom 55 cm over the worktop and as long as it', () => {
    const items = layoutRoom(kitchen);
    const run = items.find((i) => i.slot === 'kitchen_run')!;
    const wall = items.find((i) => i.slot === 'kitchen_wall')!;
    expect(wall).toBeDefined();
    expect(wall.rotation).toBeCloseTo(run.rotation, 6);
    expect(wall.elevationM).toBeCloseTo(1.45, 2);
    expect(wall.size.width).toBeCloseTo(run.size.width, 2);
    // Its back on the run's wall: the two backs are the same line.
    const back = (i: PlacedItem) => ({ x: i.position.x - Math.sin(i.rotation) * (i.size.depth / 2), z: i.position.z - Math.cos(i.rotation) * (i.size.depth / 2) });
    expect(Math.hypot(back(wall).x - back(run).x, back(wall).z - back(run).z)).toBeLessThan(0.05);
  });

  it('leave the window over the run clear', () => {
    // A window in the middle of every wall: the run goes under one, the cabinets keep off it.
    const window = (wallIndex: number) => ({ id: `w${wallIndex}`, kind: 'window', wallIndex, t: 0.5, widthM: 1.2, heightM: 1.4, sillM: 0.9 });
    const windowed = refreshRoom({ ...kitchen, openings: [0, 1, 2, 3].map(window) } as PlanRoom);
    const items = layoutRoom(windowed);
    const run = items.find((i) => i.slot === 'kitchen_run')!;
    const wall = items.find((i) => i.slot === 'kitchen_wall');
    if (wall) expect(wall.size.width).toBeLessThan(run.size.width);
  });

  it('take the wall with no window when the room has one', () => {
    // Windows on both long walls and one short one: the run and its cabinets go on the other short wall.
    const window = (wallIndex: number) => ({ id: `w${wallIndex}`, kind: 'window', wallIndex, t: 0.5, widthM: 1.2, heightM: 1.4, sillM: 0.9 });
    const room = refreshRoom({ ...kitchen, openings: [0, 1, 2].map(window) } as PlanRoom);
    for (let seed = 1; seed <= 5; seed++) {
      const run = layoutRoom(room, { rng: seededRng(seed) }).find((i) => i.slot === 'kitchen_run')!;
      // Wall 3 runs from (0, 3) to (0, 0): the run's back is on x = 0.
      expect(run.position.x - run.size.depth / 2).toBeCloseTo(0.02, 5);
    }
  });

  it('are made in the run’s material, and left out over a shop’s run', () => {
    const made = (id: number, slug: string, kind: string) =>
      product(id, { slug, categorySlug: 'kitchen-custom', unit: 'm2', model3dKind: kind, model3dUrl: `/models/${slug}.glb`, widthCm: null, depthCm: null, heightCm: null, styleTags: ['scandinavian'] });
    const catalog = [made(1, 'kitchen-material-mdf', 'kitchen_run'), made(2, 'kitchen-wall-material-ldsp', 'kitchen_wall'), made(3, 'kitchen-wall-material-mdf', 'kitchen_wall')];
    const slots = layoutRoom(kitchen).filter((i) => i.slot === 'kitchen_run' || i.slot === 'kitchen_wall');
    const [run, wall] = matchProducts(slots, catalog, { styleId: 'scandinavian', rooms: [kitchen] });
    expect(run.custom).toBe(true);
    expect(wall.custom).toBe(true);
    expect(wall.kitchenMaterial?.slug).toBe('kitchen-wall-material-mdf');
    // A shop's run (height 90, depth 60): no wall cabinets over it.
    const shopRun = product(9, { slug: 'shop-run', model3dKind: 'kitchen_run', widthCm: 200, depthCm: 60, heightCm: 90, categorySlug: 'kitchen-units' });
    for (let seed = 1; seed <= 40; seed++) {
      const [r, w] = matchProducts(slots, [...catalog, shopRun], { styleId: 'scandinavian', rooms: [kitchen], rng: seededRng(seed) });
      if (r.custom === false) expect(w.product).toBeNull();
      else expect(w.kitchenMaterial?.slug.startsWith('kitchen-wall-material-')).toBe(true);
    }
  });
});
