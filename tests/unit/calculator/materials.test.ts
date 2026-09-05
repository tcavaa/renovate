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

  it('uses the rate book it is given, not the defaults', () => {
    const book: RateBook = { materials: {}, labour: { painting: { labelKa: 'შეღებვა', unit: 'm2', price: 1 } } };
    const summary = buildProjectSummary(rooms, 'white_frame', [], [], book);
    expect(summary.subtotalMaterials).toBe(0);
    expect(summary.workerCosts.map((w) => w.key)).toEqual(['painting']);
  });
});
