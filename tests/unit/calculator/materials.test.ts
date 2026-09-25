import { describe, expect, it } from 'vitest';
import {
  aggregateRoomTotals,
  buildProjectSummary,
  calculateMaterials,
  calculateWorkerCosts,
  computeRoomAreas,
  estimateCounts,
  estimateMaterialsCost,
} from '@/lib/calculator/materials';
import { CONTINGENCY_PCT, HOME_STATES } from '@/lib/calculator/constants';
import { HOME_STATE_VALUES } from '@/lib/calculator/types';
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

  it('skips a material whose basis has no area (a bathroom floor in a flat without one)', () => {
    const book: RateBook = {
      materials: {
        tiles: { labelKa: 'ფილა', qtyPerM2: 1, unit: 'm2', wasteFactorPct: 0, phase: 9, basis: 'bath_floor', estimatedPriceGEL: 1 },
      },
      labour: {},
    };
    expect(calculateMaterials([bedroom], 'white_frame', book)).toEqual([]);
    expect(calculateMaterials([bathroom], 'white_frame', book)[0].qty).toBe(5);
  });

  it('buys what the renovation team prices for a black frame, per its basis', () => {
    const byKey = Object.fromEntries(calculateMaterials(rooms, 'black_frame').map((m) => [m.key, m]));
    expect(Object.keys(byKey)).toEqual(['wall_blocks', 'heating_pipe', 'electric_cable', 'plaster_mix', 'wall_putty', 'plumbing_pipes', 'bath_floor_mix', 'bath_wall_adhesive', 'ceiling_board']);
    expect(byKey.wall_blocks).toMatchObject({ qty: 21.23, unit: 'm2', estimatedPriceGEL: 45 });
    // 25 m of pipe per radiator: the bedroom's and the bathroom's.
    expect(byKey.heating_pipe).toMatchObject({ qty: 50, unit: 'linear_m', estimatedPriceGEL: 3.6 });
    expect(byKey.electric_cable).toMatchObject({ qty: 31, estimatedPriceGEL: 12 });
    // Plaster and putty on every wall but the bathroom's; its walls get adhesive cement.
    expect(byKey.plaster_mix).toMatchObject({ qty: 78.3, estimatedPriceGEL: 12 });
    expect(byKey.wall_putty).toMatchObject({ qty: 78.3, estimatedPriceGEL: 5 });
    expect(byKey.bath_wall_adhesive).toMatchObject({ qty: 24.3, estimatedPriceGEL: 12 });
    expect(byKey.bath_floor_mix).toMatchObject({ qty: 5, estimatedPriceGEL: 40 });
    // The bathroom's four points and the washing machine.
    expect(byKey.plumbing_pipes).toMatchObject({ qty: 5, unit: 'piece', estimatedPriceGEL: 32.5 });
    expect(byKey.ceiling_board).toMatchObject({ qty: 31, estimatedPriceGEL: 12 });
  });

  it('leaves the plasterboard out under a stretch ceiling', () => {
    const keys = calculateMaterials(rooms, 'green_frame', undefined, { choices: { ceiling: 'barisol' } }).map((m) => m.key);
    expect(keys).not.toContain('ceiling_board');
    expect(calculateMaterials(rooms, 'green_frame').map((m) => m.key)).toEqual(['wall_putty', 'ceiling_board']);
  });
});

const keysOf = (state: Parameters<typeof calculateWorkerCosts>[1], options?: Parameters<typeof calculateWorkerCosts>[3]) =>
  calculateWorkerCosts(rooms, state, undefined, options).map((c) => c.key);

describe('calculateWorkerCosts', () => {
  it('prices each labour line at quantity × rate', () => {
    for (const state of HOME_STATE_VALUES) {
      for (const c of calculateWorkerCosts(rooms, state)) {
        expect(c.totalGEL).toBeCloseTo(c.qty * c.pricePerQty, 2);
        expect(c.qty).toBeGreaterThan(0);
      }
    }
  });

  it('prices a black frame with every work the team named, each once', () => {
    const byKey = Object.fromEntries(calculateWorkerCosts(rooms, 'black_frame').map((c) => [c.key, c]));
    expect(Object.keys(byKey)).toEqual([
      'wall_build',
      'heating_piping',
      'radiator_mount',
      'floor_screed',
      'electric_point',
      'plaster_walls',
      'paint_walls',
      'plumbing_install',
      'bath_screed',
      'bath_wall_prep',
      'bath_tiling',
      'laminate_laying',
      'ceiling_gypsum',
      'ceiling_finish',
      'door_install',
      'debris_new',
    ]);
    expect(byKey.wall_build).toMatchObject({ qty: 21.23, qtyUnit: 'm2', pricePerQty: 45 });
    expect(byKey.heating_piping).toMatchObject({ qty: 2, qtyUnit: 'unit', pricePerQty: 50, totalGEL: 100 });
    expect(byKey.radiator_mount).toMatchObject({ qty: 2, pricePerQty: 50, totalGEL: 100 });
    // The ordinary screed stops at the bathroom, which has its own at 80 ₾.
    expect(byKey.floor_screed).toMatchObject({ qty: 26, pricePerQty: 35, totalGEL: 910 });
    expect(byKey.bath_screed).toMatchObject({ qty: 5, pricePerQty: 80, totalGEL: 400 });
    expect(byKey.electric_point).toMatchObject({ qty: 16, pricePerQty: 35, totalGEL: 560 });
    expect(byKey.plaster_walls).toMatchObject({ qty: 78.3, pricePerQty: 16.5, totalGEL: 1291.95 });
    // Painted: every wall but the bathroom's, never the ceiling.
    expect(byKey.paint_walls).toMatchObject({ qty: 78.3, pricePerQty: 35, totalGEL: 2740.5 });
    expect(byKey.plumbing_install).toMatchObject({ qty: 5, pricePerQty: 80, totalGEL: 400 });
    expect(byKey.bath_wall_prep).toMatchObject({ qty: 24.3, pricePerQty: 80, totalGEL: 1944 });
    // The bathroom tiled floor and walls.
    expect(byKey.bath_tiling).toMatchObject({ qty: 29.3, pricePerQty: 60, totalGEL: 1758 });
    expect(byKey.laminate_laying).toMatchObject({ qty: 26, pricePerQty: 15, totalGEL: 390 });
    expect(byKey.ceiling_gypsum).toMatchObject({ qty: 31, pricePerQty: 30, totalGEL: 930 });
    expect(byKey.ceiling_finish).toMatchObject({ qty: 31, pricePerQty: 35, totalGEL: 1085 });
    expect(byKey.door_install).toMatchObject({ qty: 3, pricePerQty: 150, totalGEL: 450 });
    // 500 ₾ for 100 m².
    expect(byKey.debris_new).toMatchObject({ qty: 31, pricePerQty: 5, totalGEL: 155 });
  });

  it('prices a white frame without the walls, the screed and the plaster, and chases the plastered walls', () => {
    const keys = keysOf('white_frame');
    for (const key of ['wall_build', 'floor_screed', 'plaster_walls']) expect(keys).not.toContain(key);
    const chasing = calculateWorkerCosts(rooms, 'white_frame').find((c) => c.key === 'wall_chasing')!;
    expect(chasing).toMatchObject({ qty: 16, pricePerQty: 5, totalGEL: 80 });
    expect(keysOf('black_frame')).not.toContain('wall_chasing');
  });

  it('prices a green frame with the finishing alone', () => {
    expect(keysOf('green_frame')).toEqual(['paint_walls', 'bath_tiling', 'laminate_laying', 'ceiling_gypsum', 'ceiling_finish', 'debris_new']);
  });

  it('never counts a work twice, and every work of a lighter state is the same line in a heavier one', () => {
    const lines = Object.fromEntries(HOME_STATE_VALUES.map((state) => [state, calculateWorkerCosts(rooms, state)]));
    for (const state of HOME_STATE_VALUES) {
      const keys = lines[state].map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    const same = (lighter: (typeof HOME_STATE_VALUES)[number], heavier: (typeof HOME_STATE_VALUES)[number], except: string[] = []) => {
      for (const line of lines[lighter]) {
        if (except.includes(line.key)) continue;
        expect(lines[heavier].find((c) => c.key === line.key)).toEqual(line);
      }
    };
    same('green_frame', 'white_frame');
    // The white frame's wall chasing is the one thing a black frame does not do: its walls are plastered after the wiring.
    same('white_frame', 'black_frame', ['wall_chasing']);
    // An old renovation is a black frame whose walls stand, and whose own removal carries the rubbish out.
    same('black_frame', 'old_renovation', ['wall_build', 'debris_new']);
    expect(keysOf('old_renovation')).not.toContain('wall_build');
    expect(keysOf('old_renovation')).not.toContain('debris_new');
  });

  it('lays parquet instead of laminate, and a stretch ceiling instead of plasterboard, when chosen', () => {
    const choices = { floor: 'parquet', ceiling: 'barisol' } as const;
    const byKey = Object.fromEntries(calculateWorkerCosts(rooms, 'green_frame', undefined, { choices }).map((c) => [c.key, c]));
    expect(byKey.parquet_laying).toMatchObject({ qty: 26, pricePerQty: 80, totalGEL: 2080 });
    expect(byKey.ceiling_barisol).toMatchObject({ qty: 31, pricePerQty: 35, totalGEL: 1085 });
    for (const key of ['laminate_laying', 'ceiling_gypsum', 'ceiling_finish']) expect(byKey[key]).toBeUndefined();
  });

  it('tiles the kitchen floor and lays the wood floors around it', () => {
    const kitchen = computeRoomAreas({ id: 'k', type: 'kitchen', nameKa: 'სამზარეულო', width: 3, length: 4, height: 2.7 });
    const byKey = Object.fromEntries(calculateWorkerCosts([bedroom, kitchen], 'green_frame').map((c) => [c.key, c]));
    expect(byKey.kitchen_tiling).toMatchObject({ qty: 12, pricePerQty: 60, totalGEL: 720 });
    expect(byKey.laminate_laying.qty).toBe(20);
  });

  it('strips an old renovation out first: the floors, the walls, the tiles, and the rubbish', () => {
    const costs = calculateWorkerCosts(rooms, 'old_renovation');
    const byKey = Object.fromEntries(costs.map((c) => [c.key, c]));
    expect(costs.slice(0, 4).map((c) => c.key)).toEqual(['demolish_floor', 'demolish_walls', 'demolish_tiles', 'debris_old']);
    expect(byKey.demolish_floor).toMatchObject({ qty: 26, qtyUnit: 'm2', pricePerQty: 15, totalGEL: 390 });
    expect(byKey.demolish_walls).toMatchObject({ qty: 78.3, pricePerQty: 20, totalGEL: 1566 });
    // The bathroom's tiled floor and walls.
    expect(byKey.demolish_tiles).toMatchObject({ qty: 29.3, pricePerQty: 12, totalGEL: 351.6 });
    // 4000 ₾ for 100 m².
    expect(byKey.debris_old).toMatchObject({ qty: 31, pricePerQty: 40, totalGEL: 1240 });
  });

  it('leaves the strip-out lines out of every other home state', () => {
    for (const state of ['black_frame', 'white_frame', 'green_frame'] as const) {
      const keys = keysOf(state);
      for (const key of ['demolish_floor', 'demolish_walls', 'demolish_tiles', 'debris_old']) expect(keys).not.toContain(key);
    }
  });

  it('honours a works override, whatever the home state says', () => {
    expect(keysOf('green_frame', { phases: [0] })).toEqual(['demolish_floor', 'demolish_walls', 'demolish_tiles', 'debris_old']);
    // …and one that leaves the strip-out out: an old renovation whose owner unticked it.
    expect(keysOf('old_renovation', { phases: [1, 6] })).toEqual(['wall_build', 'paint_walls']);
  });

  it('counts with the points the caller knows, not the room-type estimate', () => {
    const costs = calculateWorkerCosts(rooms, 'white_frame', undefined, { counts: { electricPoints: 3, plumbingPoints: 0, radiators: 1, doors: 5 } });
    const byKey = Object.fromEntries(costs.map((c) => [c.key, c]));
    expect(byKey.electric_point.qty).toBe(3);
    expect(byKey.wall_chasing.qty).toBe(3);
    expect(byKey.plumbing_install).toBeUndefined();
    expect(byKey.radiator_mount.qty).toBe(1);
    expect(byKey.door_install.qty).toBe(5);
  });

  it('drops a labour line the admin switched off', () => {
    const book: RateBook = { materials: {}, labour: { bath_tiling: { labelKa: 'ფილა', unit: 'm2', price: 40 } } };
    const costs = calculateWorkerCosts(rooms, 'white_frame', book);
    expect(costs.map((c) => c.key)).toEqual(['bath_tiling']);
    expect(costs[0].totalGEL).toBeCloseTo(29.3 * 40, 2);
  });
});

describe('estimateCounts', () => {
  it('counts points, radiators and doors by room type, and the partitions from the outline', () => {
    expect(estimateCounts(rooms)).toEqual({ electricPoints: 16, plumbingPoints: 5, radiators: 2, doors: 3, partitionM2: 21.23 });
    expect(estimateCounts([bedroom]).partitionM2).toBe(0);
    expect(estimateCounts([bedroom]).plumbingPoints).toBe(0);
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

  it('costs an old renovation as the strip-out plus a black frame, less its walls and its rubbish', () => {
    const old = buildProjectSummary(rooms, 'old_renovation', [], []);
    const black = buildProjectSummary(rooms, 'black_frame', [], []);
    const strip = old.workerCosts.filter((w) => w.key.startsWith('demolish_') || w.key === 'debris_old');
    const notDone = black.workerCosts.filter((w) => w.key === 'wall_build' || w.key === 'debris_new');
    const wallsMaterial = black.materials.filter((m) => m.key === 'wall_blocks');

    expect(old.subtotalWorkers).toBeCloseTo(black.subtotalWorkers + strip.reduce((s, w) => s + w.totalGEL, 0) - notDone.reduce((s, w) => s + w.totalGEL, 0), 2);
    expect(old.subtotalMaterials).toBeCloseTo(black.subtotalMaterials - estimateMaterialsCost(wallsMaterial), 2);
  });

  it('uses the rate book it is given, not the defaults', () => {
    const book: RateBook = { materials: {}, labour: { paint_walls: { labelKa: 'შეღებვა', unit: 'm2', price: 1 } } };
    const summary = buildProjectSummary(rooms, 'white_frame', [], [], book);
    expect(summary.subtotalMaterials).toBe(0);
    expect(summary.workerCosts.map((w) => w.key)).toEqual(['paint_walls']);
  });
});
