import { describe, expect, it } from 'vitest';
import {
  aggregateRoomTotals,
  buildProjectSummary,
  calculateMaterials,
  calculateWorkerCosts,
  computeRoomAreas,
  estimateMaterialsCost,
} from '@/lib/calculator/materials';
import { CONTINGENCY_PCT, HOME_STATES } from '@/lib/calculator/constants';
import type { RateBook } from '@/lib/calculator/rates';

const bedroom = computeRoomAreas({ id: 'r1', type: 'bedroom', nameKa: 'საძინებელი', width: 4, length: 5, height: 2.7 });
const bathroom = computeRoomAreas({ id: 'r2', type: 'bathroom', nameKa: 'აბაზანა', width: 2, length: 2.5, height: 2.7 });
const hallway = computeRoomAreas({ id: 'r3', type: 'hallway', nameKa: 'დერეფანი', width: 1.5, length: 4, height: 2.7 });
const rooms = [bedroom, bathroom, hallway];

describe('computeRoomAreas', () => {
  it('derives floor, perimeter, wall and ceiling from the dimensions', () => {
    expect(bedroom.floorM2).toBe(20);
    expect(bedroom.perimeterM).toBe(18);
    expect(bedroom.wallM2).toBeCloseTo(48.6, 2);
    expect(bedroom.ceilingM2).toBe(bedroom.floorM2);
  });

  it('marks bathrooms, toilets and kitchens as wet rooms', () => {
    expect(bathroom.isWetRoom).toBe(true);
    expect(bedroom.isWetRoom).toBe(false);
  });

  it('never produces negative dimensions', () => {
    const odd = computeRoomAreas({ id: 'x', type: 'bedroom', nameKa: 'x', width: -3, length: Number.NaN, height: 2.7 });
    expect(odd.floorM2).toBe(0);
    expect(odd.wallM2).toBe(0);
  });
});

describe('aggregateRoomTotals', () => {
  const totals = aggregateRoomTotals(rooms);

  it('sums the areas and separates the wet-room floor', () => {
    expect(totals.totalFloorM2).toBe(31);
    expect(totals.totalWetRoomM2).toBe(5);
    expect(totals.totalWallM2).toBeCloseTo(bedroom.wallM2 + bathroom.wallM2 + hallway.wallM2, 2);
  });

  it('counts one door per room and windows only in rooms that have them', () => {
    expect(totals.doorCount).toBe(3);
    expect(totals.windowCount).toBe(1); // bathroom and hallway are excluded
  });

  it('counts the wet rooms', () => {
    expect(totals.wetRoomCount).toBe(1);
    expect(aggregateRoomTotals([bedroom, hallway]).wetRoomCount).toBe(0);
  });

  it('is empty for no rooms', () => {
    expect(aggregateRoomTotals([]).totalFloorM2).toBe(0);
  });
});

describe('calculateMaterials', () => {
  it('returns nothing for an empty project', () => {
    expect(calculateMaterials([], 'black_frame')).toEqual([]);
  });

  it('only includes materials whose phase the home state covers', () => {
    const black = calculateMaterials(rooms, 'black_frame');
    const green = calculateMaterials(rooms, 'green_frame');
    expect(black.length).toBeGreaterThan(green.length);
    for (const item of green) {
      expect(HOME_STATES.green_frame.includedPhases).toContain(
        black.find((b) => b.key === item.key) ? HOME_STATES.green_frame.includedPhases[0] : -1
      );
    }
  });

  it('applies the quantity per m² and the waste factor from the rate book', () => {
    const book: RateBook = {
      materials: {
        test_floor: {
          labelKa: 'ტესტი',
          qtyPerM2: 2,
          unit: 'm2',
          wasteFactorPct: 10,
          phase: 11,
          basis: 'floor',
          linkedCategorySlug: 'laminate',
          estimatedPriceGEL: 30,
        },
      },
      labour: {},
    };
    const [item] = calculateMaterials(rooms, 'white_frame', book);
    expect(item.key).toBe('test_floor');
    expect(item.qty).toBeCloseTo(31 * 2 * 1.1, 2);
    expect(item.estimatedPriceGEL).toBe(30);
    expect(item.linkedCategorySlug).toBe('laminate');
    expect(estimateMaterialsCost([item])).toBeCloseTo(item.qty * 30, 2);
  });

  it('skips a material whose basis has no area (wet floor in a dry flat)', () => {
    const book: RateBook = {
      materials: {
        tiles: { labelKa: 'ფილა', qtyPerM2: 1, unit: 'm2', wasteFactorPct: 0, phase: 9, basis: 'wet_floor', estimatedPriceGEL: 1 },
      },
      labour: {},
    };
    expect(calculateMaterials([bedroom], 'white_frame', book)).toEqual([]);
    expect(calculateMaterials([bathroom], 'white_frame', book)[0].qty).toBeCloseTo(5 * 1.5, 2);
  });

  it('adds the strip-out materials for an old renovation, on top of everything a black frame needs', () => {
    const old = calculateMaterials(rooms, 'old_renovation');
    const black = calculateMaterials(rooms, 'black_frame');
    const byKey = Object.fromEntries(old.map((m) => [m.key, m]));

    expect(byKey.debris_bags.qty).toBeCloseTo(31 * 0.6, 2);
    expect(byKey.debris_bags.unit).toBe('piece');
    expect(byKey.waste_container.qty).toBeCloseTo(31 * 0.02, 2);
    expect(byKey.waste_container.estimatedPriceGEL).toBe(250);

    expect(black.map((m) => m.key)).not.toContain('debris_bags');
    expect(black.map((m) => m.key)).not.toContain('waste_container');
    expect(old.filter((m) => !['debris_bags', 'waste_container'].includes(m.key))).toEqual(black);
  });

  it('runs phase 0 alone when the works override asks for nothing else', () => {
    const items = calculateMaterials(rooms, 'green_frame', undefined, [0]);
    expect(items.map((m) => m.key)).toEqual(['debris_bags', 'waste_container']);
  });
});

describe('calculateWorkerCosts', () => {
  it('prices each labour line at quantity × rate for the covered phases', () => {
    const costs = calculateWorkerCosts(rooms, 'white_frame');
    expect(costs.length).toBeGreaterThan(0);
    for (const c of costs) {
      expect(c.totalGEL).toBeCloseTo(c.qty * c.pricePerQty, 2);
      expect(c.qty).toBeGreaterThan(0);
    }
    expect(costs.map((c) => c.key)).not.toContain('demolition'); // phase 1 is black frame only
  });

  it('drops a labour line the admin switched off', () => {
    const book: RateBook = { materials: {}, labour: { tiling: { labelKa: 'კაფელი', unit: 'm2', price: 40 } } };
    const costs = calculateWorkerCosts(rooms, 'white_frame', book);
    expect(costs.map((c) => c.key)).toEqual(['tiling']);
    expect(costs[0].totalGEL).toBeCloseTo(5 * 1.5 * 40, 2);
  });

  it('has no labour at all for a finished flat', () => {
    expect(calculateWorkerCosts(rooms, 'green_frame')).toEqual([]);
  });

  it('strips an old renovation out first: floors, walls, ceilings, tiles, doors, windows, sanitary ware, debris', () => {
    const costs = calculateWorkerCosts(rooms, 'old_renovation');
    const byKey = Object.fromEntries(costs.map((c) => [c.key, c]));
    const totals = aggregateRoomTotals(rooms);

    expect(byKey.strip_floor).toMatchObject({ qty: 31, qtyUnit: 'm2', pricePerQty: 6, totalGEL: 186 });
    expect(byKey.strip_walls.qty).toBeCloseTo(totals.totalWallM2, 2);
    expect(byKey.strip_walls.pricePerQty).toBe(5);
    expect(byKey.strip_ceiling).toMatchObject({ qty: 31, pricePerQty: 5, totalGEL: 155 });
    // Old tiles cover the wet rooms' floor and part of their walls — the tiler's own ×1.5.
    expect(byKey.strip_tiles).toMatchObject({ qty: 7.5, qtyUnit: 'm2', pricePerQty: 12, totalGEL: 90 });
    // Three doors and the bedroom's window.
    expect(byKey.remove_doors_windows).toMatchObject({ qty: 4, qtyUnit: 'unit', pricePerQty: 35, totalGEL: 140 });
    // One wet room: the bathroom.
    expect(byKey.remove_sanitary).toMatchObject({ qty: 1, qtyUnit: 'unit', pricePerQty: 60, totalGEL: 60 });
    expect(byKey.debris_removal).toMatchObject({ qty: 31, pricePerQty: 7, totalGEL: 217 });

    // The strip-out comes before the black frame's own works, which are all still there.
    expect(costs.slice(0, 7).map((c) => c.key)).toEqual([
      'strip_floor',
      'strip_walls',
      'strip_ceiling',
      'strip_tiles',
      'remove_doors_windows',
      'remove_sanitary',
      'debris_removal',
    ]);
    expect(costs.slice(7)).toEqual(calculateWorkerCosts(rooms, 'black_frame'));
    expect(byKey.demolition).toBeDefined();
  });

  it('leaves the strip-out lines out of every other home state', () => {
    const STRIP_OUT = ['strip_floor', 'strip_walls', 'strip_ceiling', 'strip_tiles', 'remove_doors_windows', 'remove_sanitary', 'debris_removal'];
    for (const state of ['black_frame', 'white_frame', 'green_frame'] as const) {
      const keys = calculateWorkerCosts(rooms, state).map((c) => c.key);
      for (const key of STRIP_OUT) expect(keys).not.toContain(key);
    }
  });

  it('skips the tiles and the sanitary ware in a flat with no wet room', () => {
    const keys = calculateWorkerCosts([bedroom, hallway], 'old_renovation').map((c) => c.key);
    expect(keys).toContain('strip_floor');
    expect(keys).not.toContain('strip_tiles');
    expect(keys).not.toContain('remove_sanitary');
  });

  it('honours a works override that includes phase 0, whatever the home state says', () => {
    const onlyStripOut = calculateWorkerCosts(rooms, 'green_frame', undefined, [0]);
    expect(onlyStripOut.map((c) => c.key)).toEqual([
      'strip_floor',
      'strip_walls',
      'strip_ceiling',
      'strip_tiles',
      'remove_doors_windows',
      'remove_sanitary',
      'debris_removal',
    ]);
    // …and one that leaves it out: an old renovation whose owner unticked the strip-out.
    const withoutStripOut = calculateWorkerCosts(rooms, 'old_renovation', undefined, [1, 13]);
    expect(withoutStripOut.map((c) => c.key)).toEqual(['demolition', 'painting']);
  });

  it('drops a strip-out line the admin switched off', () => {
    const book: RateBook = { materials: {}, labour: { debris_removal: { labelKa: 'ნარჩენები', unit: 'm2', price: 10 } } };
    const costs = calculateWorkerCosts(rooms, 'old_renovation', book);
    expect(costs.map((c) => c.key)).toEqual(['debris_removal']);
    expect(costs[0].totalGEL).toBe(310);
  });
});

describe('buildProjectSummary', () => {
  it('adds up every subtotal and applies the contingency on top', () => {
    const product = { productId: 1, nameKa: 'p', pricePerUnit: 10, unit: 'piece' as const, qty: 3, totalPrice: 30, imageUrl: null };
    const furniture = { productId: 2, nameKa: 'f', pricePerUnit: 500, unit: 'piece' as const, qty: 1, totalPrice: 500, imageUrl: null };
    const summary = buildProjectSummary(rooms, 'white_frame', [product], [furniture]);

    expect(summary.subtotalProducts).toBe(30);
    expect(summary.subtotalFurniture).toBe(500);
    expect(summary.grandTotal).toBeCloseTo(
      summary.subtotalMaterials + summary.subtotalProducts + summary.subtotalFurniture + summary.subtotalWorkers,
      2
    );
    expect(summary.grandTotalWithMargin).toBeCloseTo(summary.grandTotal * (1 + CONTINGENCY_PCT / 100), 1);
  });

  it('costs an old renovation more than a black frame by exactly the strip-out', () => {
    const old = buildProjectSummary(rooms, 'old_renovation', [], []);
    const black = buildProjectSummary(rooms, 'black_frame', [], []);
    const stripLabour = old.workerCosts.filter((w) => !black.workerCosts.some((b) => b.key === w.key));
    const stripMaterials = old.materials.filter((m) => !black.materials.some((b) => b.key === m.key));

    expect(stripLabour).toHaveLength(7);
    expect(stripMaterials.map((m) => m.key)).toEqual(['debris_bags', 'waste_container']);
    expect(old.subtotalWorkers - black.subtotalWorkers).toBeCloseTo(stripLabour.reduce((s, w) => s + w.totalGEL, 0), 2);
    expect(old.subtotalMaterials - black.subtotalMaterials).toBeCloseTo(estimateMaterialsCost(stripMaterials), 2);
    expect(old.grandTotal).toBeGreaterThan(black.grandTotal);
  });

  it('uses the rate book it is given, not the defaults', () => {
    const book: RateBook = { materials: {}, labour: { painting: { labelKa: 'შეღებვა', unit: 'm2', price: 1 } } };
    const summary = buildProjectSummary(rooms, 'white_frame', [], [], book);
    expect(summary.subtotalMaterials).toBe(0);
    expect(summary.workerCosts.map((w) => w.key)).toEqual(['painting']);
  });
});
