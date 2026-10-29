import { describe, expect, it } from 'vitest';
import { layoutPlan, layoutRoom } from '@/lib/design/autoLayout';
import { refreshRoom } from '@/lib/design/planGeometry';
import { seededRng } from '@/lib/design/random';
import { footprintQuad, quadsOverlap } from '@/lib/design/rules';
import type { Opening, PlacedItem, PlanRoom } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

/** A rectangular room, `w` along x and `d` along z, with its doors and windows. */
function room(id: string, type: RoomType, w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = [], x = 0): PlanRoom {
  return refreshRoom({
    id,
    type,
    name: id,
    polygon: [{ x, z: 0 }, { x: x + w, z: 0 }, { x: x + w, z: d }, { x, z: d }],
    heightM: 2.7,
    areaM2: 0,
    perimeterM: 0,
    openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })),
  });
}

const door = (wallIndex: number, t = 0.5, exterior = false): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM: 0.8, heightM: 2.05, sillM: 0, exterior });
const window = (wallIndex: number, t = 0.5, widthM = 1.2): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'window', wallIndex, t, widthM, heightM: 1.4, sillM: 0.9, exterior: true });

/** The free floor in front of a piece, `depth` deep, as a quad. */
function frontOf(item: PlacedItem, depth: number) {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  return footprintQuad({ position: { x: item.position.x + forward.x * (item.size.depth / 2 + depth / 2), z: item.position.z + forward.z * (item.size.depth / 2 + depth / 2) }, rotation: item.rotation, size: { width: item.size.width, depth, height: 1 } });
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('bathrooms', () => {
  it('never leaves a fixture with no way to it: the WC and the basin do not face each other across a narrow room', () => {
    // The owner's screenshot: a bathroom 1.1 m across, the door in a short wall.
    const bath = room('b', 'bathroom', 2.8, 1.15, [door(3, 0.5)]);
    for (const seed of SEEDS) {
      const items = layoutRoom(bath, { rng: seededRng(seed) }).filter((i) => ['toilet', 'sink', 'shower', 'bathtub', 'washer'].includes(i.slot));
      for (const item of items) {
        const front = frontOf(item, 0.38);
        const others = items.filter((o) => o !== item);
        expect(others.some((o) => quadsOverlap(front, footprintQuad(o))), `${item.slot} blocked (seed ${seed})`).toBe(false);
      }
    }
  });

  it('gives the shower its own area of 80 × 80 at least, larger in a roomy bathroom', () => {
    const small = layoutRoom(room('s', 'bathroom', 1.9, 1.8, [door(2, 0.7)])).find((i) => i.slot === 'shower');
    expect(small?.areaM).toBeDefined();
    expect(Math.min(small!.areaM!.width, small!.areaM!.depth)).toBeGreaterThanOrEqual(0.8);
    const roomy = layoutRoom(room('r', 'bathroom', 3, 2.4, [door(2, 0.8)])).find((i) => i.slot === 'shower');
    expect(roomy!.areaM!.width * roomy!.areaM!.depth).toBeGreaterThan(0.9 * 0.9 - 1e-6);
  });

  it('hangs a bathroom\'s mirror over its basin and nowhere else', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const items = layoutRoom(room('m', 'bathroom', 2.4, 2, [door(2, 0.7)]), { rng: seededRng(seed) });
      const mirror = items.find((i) => i.slot === 'mirror');
      const sink = items.find((i) => i.slot === 'sink');
      if (!mirror) continue;
      expect(sink).toBeDefined();
      expect(Math.hypot(mirror.position.x - sink!.position.x, mirror.position.z - sink!.position.z)).toBeLessThan(0.6);
    }
  });

  it('puts the washing machine in the hall when the bathroom has no room for it', () => {
    const bath = room('b', 'bathroom', 2, 2, [door(2, 0.5)]);
    const hall = room('h', 'hallway', 2, 4, [door(0, 0.5, true)], 2.12);
    const items = layoutPlan([bath, hall], { rng: seededRng(3) });
    const washer = items.find((i) => i.slot === 'washer');
    expect(washer?.roomId).toBe('h');
  });
});

describe('bedrooms', () => {
  it('always has a wardrobe, and never one facing the bed from its foot', () => {
    for (const seed of SEEDS) {
      const items = layoutRoom(room('bed', 'bedroom', 3.6, 3.4, [door(2, 0.8), window(0)]), { rng: seededRng(seed) });
      const bed = items.find((i) => i.slot === 'bed')!;
      const wardrobe = items.find((i) => i.slot === 'wardrobe');
      expect(wardrobe, `seed ${seed}`).toBeDefined();
      // Facing the bed: turned the other way from it and standing in front of its foot.
      const turn = Math.atan2(Math.sin(wardrobe!.rotation - bed.rotation - Math.PI), Math.cos(wardrobe!.rotation - bed.rotation - Math.PI));
      const right = { x: Math.cos(bed.rotation), z: -Math.sin(bed.rotation) };
      const across = Math.abs((wardrobe!.position.x - bed.position.x) * right.x + (wardrobe!.position.z - bed.position.z) * right.z);
      const facing = Math.abs(turn) < 0.1 && across < bed.size.width / 2 + wardrobe!.size.width / 2 - 0.2;
      expect(facing, `seed ${seed}`).toBe(false);
    }
  });
});

describe('living rooms', () => {
  it('turns the armchair beside the sofa about 45° towards the TV', () => {
    const living = room('l', 'living_room', 5.5, 4.4, [door(1, 0.85), window(0, 0.5, 1.8)]);
    const items = layoutRoom(living);
    const sofa = items.find((i) => i.slot === 'sofa')!;
    const chair = items.find((i) => i.slot === 'armchair');
    expect(chair).toBeDefined();
    const turn = Math.abs(Math.atan2(Math.sin(chair!.rotation - sofa.rotation), Math.cos(chair!.rotation - sofa.rotation)));
    expect(turn).toBeCloseTo(Math.PI / 4, 2);
  });

  it('leaves 60 cm between the TV unit and the coffee table', () => {
    for (const seed of SEEDS) {
      const items = layoutRoom(room('l', 'living_room', 4.6, 3.6, [door(1, 0.85), window(0)]), { rng: seededRng(seed) });
      const unit = items.find((i) => i.slot === 'tv_unit');
      const table = items.find((i) => i.slot === 'coffee_table');
      if (!unit || !table) continue;
      const grow = (i: PlacedItem, by: number) => footprintQuad({ ...i, size: { ...i.size, width: i.size.width + 2 * by, depth: i.size.depth + 2 * by } });
      expect(quadsOverlap(grow(unit, 0.29), grow(table, 0.29)), `seed ${seed}`).toBe(false);
    }
  });
});

describe('kitchens', () => {
  it('keeps 1.2 m of floor in front of the run before the table and its chairs', () => {
    for (const seed of SEEDS) {
      const items = layoutRoom(room('k', 'kitchen', 4.8, 3.2, [door(2, 0.8), window(0, 0.3)]), { rng: seededRng(seed) });
      const run = items.find((i) => i.slot === 'kitchen_run');
      if (!run) continue;
      const zone = frontOf(run, 1.15);
      for (const piece of items.filter((i) => i.slot === 'dining_table' || i.slot === 'dining_chair')) {
        expect(quadsOverlap(zone, footprintQuad(piece)), `${piece.slot} in the run's floor (seed ${seed})`).toBe(false);
      }
    }
  });
});

describe('the shower check', () => {
  it('measures the shower\'s area, not the column standing in it', async () => {
    const { ruleViolations } = await import('@/lib/design/ruleChecks');
    const bath = room('b', 'bathroom', 2.4, 2, [door(2, 0.7)]);
    const column: PlacedItem = { id: 's', roomId: 'b', slot: 'shower', kind: 'shower', position: { x: 2.1, z: 0.27 }, rotation: 0, elevationM: 0, size: { width: 0.49, depth: 0.51, height: 2.2 }, product: null, areaM: { width: 0.9, depth: 0.9 } };
    const plan = { rooms: [bath], metresPerPixel: null, bounds: { width: 2.4, depth: 2 }, source: 'manual' as const, wallThicknessM: 0.12 };
    expect(ruleViolations(plan, [column]).map((v) => v.code)).not.toContain('shower_too_small');
    expect(ruleViolations(plan, [{ ...column, areaM: undefined }]).map((v) => v.code)).toContain('shower_too_small');
  });
});
