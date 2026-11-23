import { describe, expect, it } from 'vitest';
import { layoutPlan, layoutRoom, placeAdditional } from '@/lib/design/autoLayout';
import { fitKitchenCorners, kitchenLegOf } from '@/lib/design/kitchenCorner';
import { pieceWall } from '@/lib/design/manipulate';
import { isOpenEdge, refreshRoom } from '@/lib/design/planGeometry';
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

/** The free floor in front of a piece, `depth` deep, as a quad — or a stretch of it `width` wide, `offset` to the piece's right. */
function frontOf(item: PlacedItem, depth: number, offset = 0, width = item.size.width) {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const right = { x: forward.z, z: -forward.x };
  const ahead = item.size.depth / 2 + depth / 2;
  return footprintQuad({ position: { x: item.position.x + forward.x * ahead + right.x * offset, z: item.position.z + forward.z * ahead + right.z * offset }, rotation: item.rotation, size: { width, depth, height: 1 } });
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('bathrooms', () => {
  it('never leaves a fixture with no way to it: the WC and the basin do not face each other across a narrow room', () => {
    // The owner's screenshot: a bathroom 1.1 m across, the door in a short wall.
    const bath = room('b', 'bathroom', 2.8, 1.15, [door(3, 0.5)]);
    for (const seed of SEEDS) {
      const items = layoutRoom(bath, { rng: seededRng(seed) }).filter((i) => ['toilet', 'sink', 'shower', 'bathtub', 'washer'].includes(i.slot));
      for (const item of items) {
        const others = items.filter((o) => o !== item);
        // Reached over 60 cm of its front, or the whole of a narrower one's — a shower across the end
        // of the room (wall to wall) is stepped into beside what stands before the rest of it.
        const reach = Math.min(0.6, item.size.width);
        const fronts = Array.from({ length: Math.floor((item.size.width - reach) / 0.05 + 1e-6) + 1 }, (_, k) => frontOf(item, 0.38, -item.size.width / 2 + reach / 2 + k * 0.05, reach));
        expect(fronts.every((front) => others.some((o) => quadsOverlap(front, footprintQuad(o)))), `${item.slot} blocked (seed ${seed})`).toBe(false);
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

  it('hangs a bathroom\'s mirror over its basin where the wall over it takes it (else near it: bathroomFallbacks.test)', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const items = layoutRoom(room('m', 'bathroom', 2.4, 2, [door(2, 0.7)]), { rng: seededRng(seed) });
      const mirror = items.find((i) => i.slot === 'mirror');
      const sink = items.find((i) => i.slot === 'sink');
      expect(mirror, `seed ${seed}`).toBeDefined();
      expect(sink, `seed ${seed}`).toBeDefined();
      expect(Math.hypot(mirror!.position.x - sink!.position.x, mirror!.position.z - sink!.position.z)).toBeLessThan(0.6);
    }
  });

  it('puts the washing machine in the hall when the bathroom has no room for it', () => {
    const bath = room('b', 'bathroom', 2, 2, [door(2, 0.5)]);
    const hall = room('h', 'hallway', 2, 4, [door(0, 0.5, true)], 2.12);
    const items = layoutPlan([bath, hall], { rng: seededRng(3) });
    const washer = items.find((i) => i.slot === 'washer');
    expect(washer?.roomId).toBe('h');
  });

  it('puts it in a studio\'s kitchen half when the flat has no hall and no kitchen of its own', () => {
    // A studio flat: the small bathroom, and one room that is the kitchen (its low 35 % along x,
    // to about x 4.1) and the living room. The kitchen half is the flat's kitchen.
    const bath = room('b', 'bathroom', 2, 2, [door(2, 0.5)]);
    const studio = room('s', 'studio', 6, 4, [door(2, 0.1, true), window(0, 0.7)], 2);
    for (const rng of [undefined, ...SEEDS.map((seed) => seededRng(seed))]) {
      const items = layoutPlan([bath, studio], { rng });
      const washer = items.filter((i) => i.slot === 'washer');
      expect(washer).toHaveLength(1);
      expect(washer[0].roomId).toBe('s');
      expect(washer[0].position.x + washer[0].size.width / 2).toBeLessThan(4.11);
      // On free floor: in nothing else that stands in the studio.
      const others = items.filter((i) => i.roomId === 's' && i !== washer[0] && i.elevationM < 0.05 && i.slot !== 'rug');
      for (const other of others) expect(quadsOverlap(footprintQuad(washer[0]), footprintQuad(other)), `in the ${other.kind}`).toBe(false);
    }
  });

  /** The corner leg the generation builds once the flat is matched and the run is made to measure (`fitKitchenCorners`). */
  const cornerLeg = (rooms: PlanRoom[], items: PlacedItem[]) => {
    const made = items.map((i) => (i.slot === 'kitchen_run' ? { ...i, custom: true } : i));
    const run = made.find((i) => i.slot === 'kitchen_run');
    return run ? kitchenLegOf(run.id, fitKitchenCorners(rooms, made, [])) : null;
  };

  it('stands it in a kitchen off the floor the kitchen\'s corner is then built on', () => {
    // A short run that turns its corner along the next wall: the washing machine stood 60 cm
    // along that wall, and the kitchen had no corner (plan #393's studio, every flat).
    const bath = room('b', 'bathroom', 2, 2, [door(2, 0.5)]);
    for (const kitchen of [room('k', 'kitchen', 3.4, 3, [door(3, 0.5, true), window(0, 0.5)], 2.2), room('k', 'kitchen', 2.6, 3.4, [door(3, 0.5, true), window(0, 0.5)], 2.2)]) {
      let legs = 0;
      for (const rng of [undefined, ...SEEDS.map((seed) => seededRng(seed))]) {
        const items = layoutPlan([bath, kitchen], { rng });
        const washer = items.find((i) => i.slot === 'washer');
        expect(washer?.roomId).toBe('k');
        const without = cornerLeg([bath, kitchen], items.filter((i) => i !== washer));
        // A run laid along the whole of its wall turns no corner (some draws of the first kitchen,
        // its fridge in the corner by the door): no corner's floor for the machine to keep off.
        if (!without) continue;
        legs++;
        expect(cornerLeg([bath, kitchen], items)?.size.width).toBe(without.size.width);
      }
      expect(legs).toBeGreaterThan(SEEDS.length / 2);
    }
  });

  it('keeps the machine where a kitchen has no wall for it off its corner', () => {
    // A kitchen 2.8 m across with its table and chairs: on some draws the only wall with room for
    // the machine is the one the corner's leg would take. The flat keeps its washing machine.
    const bath = room('b', 'bathroom', 2, 2, [door(2, 0.5)]);
    const kitchen = room('k', 'kitchen', 2.8, 3.6, [door(2, 0.5, true), window(0, 0.5)], 2.2);
    let onCorner = 0;
    for (const rng of [undefined, ...SEEDS.map((seed) => seededRng(seed))]) {
      const items = layoutPlan([bath, kitchen], { rng });
      const washer = items.find((i) => i.slot === 'washer');
      expect(washer?.roomId).toBe('k');
      const others = items.filter((i) => i.roomId === 'k' && i !== washer && i.elevationM < 0.05 && i.slot !== 'rug');
      for (const other of others) expect(quadsOverlap(footprintQuad(washer!), footprintQuad(other)), `in the ${other.kind}`).toBe(false);
      if (cornerLeg([bath, kitchen], items.filter((i) => i !== washer)) && !cornerLeg([bath, kitchen], items)) onCorner++;
    }
    expect(onCorner).toBeGreaterThan(0);
  });

  it('still prefers the hall, and leaves a flat with no bathroom without one', () => {
    const bath = room('b', 'bathroom', 2, 2, [door(2, 0.5)]);
    const hall = room('h', 'hallway', 2, 4, [door(0, 0.5, true)], -2.12);
    const studio = room('s', 'studio', 6, 4, [door(2, 0.1, true), window(0, 0.7)], 2);
    expect(layoutPlan([bath, hall, studio]).find((i) => i.slot === 'washer')?.roomId).toBe('h');
    expect(layoutPlan([studio]).some((i) => i.slot === 'washer')).toBe(false);
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

describe('a piece that fits its wall', () => {
  it('stands on it: a 1.6 m bed on a 1.84 m wall', () => {
    // Test project 388's bedroom, 1.84 × 4.94 m: each short wall has 12 cm to spare either side
    // of the bed, and was passed over for being less than 25 cm longer than it. (Laid out, the room
    // takes a single — it is under 11 m², and no nightstand stands beside a double there.)
    const bed = placeAdditional(room('n', 'bedroom', 1.84, 4.94), 'bed_double', []);
    expect(bed?.kind).toBe('bed_double');
    expect(bed!.position.x - bed!.size.width / 2).toBeGreaterThan(0);
    expect(bed!.position.x + bed!.size.width / 2).toBeLessThan(1.84);
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
      expect(unit, `seed ${seed}`).toBeDefined();
      expect(table, `seed ${seed}`).toBeDefined();
      const grow = (i: PlacedItem, by: number) => footprintQuad({ ...i, size: { ...i.size, width: i.size.width + 2 * by, depth: i.size.depth + 2 * by } });
      expect(quadsOverlap(grow(unit!, 0.29), grow(table!, 0.29)), `seed ${seed}`).toBe(false);
    }
  });
});

describe('a wall drawn as two edges in line', () => {
  // 5 × 3.4 m; the far long wall has a corner in its middle (x 2.5) and runs straight on. The sofa
  // stands in the middle of the near wall, its TV unit across from it — over the joint — and the
  // TV, measured against the one edge its unit's middle is on, "ran past the wall's end".
  const jointed: PlanRoom = refreshRoom({
    id: 'j',
    type: 'living_room',
    name: 'j',
    polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 3.4 }, { x: 2.5, z: 3.4 }, { x: 0, z: 3.4 }],
    heightM: 2.7,
    areaM2: 0,
    perimeterM: 0,
    openings: [],
  });

  it('hangs the TV over a unit that stands across the joint', () => {
    const items = layoutRoom(jointed);
    const unit = items.find((i) => i.slot === 'tv_unit')!;
    const tv = items.find((i) => i.slot === 'tv');
    expect(Math.abs(unit.position.x - 2.5)).toBeLessThan(0.5);
    expect(tv).toBeDefined();
    // On the wall over the unit, not standing on it: within the unit's width, its back on the wall.
    expect(tv!.elevationM).toBeGreaterThan(unit.size.height);
    expect(Math.abs(tv!.position.x - unit.position.x)).toBeLessThanOrEqual((unit.size.width - tv!.size.width) / 2 + 1e-6);
    expect(3.4 - tv!.position.z - tv!.size.depth / 2).toBeLessThan(0.03);
  });

  it('keeps the TV off a window in the next edge of the same wall', () => {
    // A window in the far wall's second edge, x 0.9–2.1, under the unit's left end: the TV is
    // slid and shrunk along the unit until it is clear of it.
    const windowed: PlanRoom = { ...jointed, openings: [{ id: 'j-w', roomId: 'j', kind: 'window', wallIndex: 3, t: 0.4, widthM: 1.2, heightM: 1.4, sillM: 0.9, exterior: true }] };
    const items = layoutRoom(windowed);
    const unit = items.find((i) => i.slot === 'tv_unit')!;
    const tv = items.find((i) => i.slot === 'tv');
    expect(unit.position.x - unit.size.width / 2).toBeLessThan(2.1);
    expect(tv).toBeDefined();
    expect(tv!.position.x - tv!.size.width / 2).toBeGreaterThan(2.1 - 1e-6);
  });
});

describe('a living room open onto the next room', () => {
  /** The wall the TV unit stands with its back to, and whether that is a room separator's line. */
  const unitWall = (living: PlanRoom, items: PlacedItem[]) => {
    const unit = items.find((i) => i.slot === 'tv_unit');
    const wall = unit ? pieceWall(unit, living) : null;
    return { unit, wall, open: !!wall && isOpenEdge(living, wall.edge.index) };
  };

  // 4.2 × 3.48 m, the long side at z 3.48 a room separator (the kitchen beyond). The sofa used to
  // take the long wall across from it — "2.96 m from the screen", the screen being the open line —
  // and its TV unit stood in the opening with its back to the kitchen.
  const living: PlanRoom = { ...room('l', 'living_room', 4.2, 3.48, [window(3)]), open: [2] };

  it('stands the TV unit on a wall, never on the separator, whatever the draw', () => {
    for (const rng of [undefined, ...SEEDS.map((seed) => seededRng(seed))]) {
      const items = layoutRoom(living, { rng });
      const { unit, wall, open } = unitWall(living, items);
      expect(unit).toBeDefined();
      expect(wall).not.toBeNull();
      expect(open).toBe(false);
      // The whole of its back, not its middle alone.
      expect(wall!.along - unit!.size.width / 2).toBeGreaterThan(-0.01);
      expect(wall!.along + unit!.size.width / 2).toBeLessThan(wall!.edge.length + 0.01);
      expect(items.some((i) => i.slot === 'tv')).toBe(true);
    }
  });

  // 5 × 3.4 m; the far long side is wall for its first 2.2 m and open from there on (edge 2, in
  // line with the wall). A sofa in the middle of the near wall put its unit half on the wall and
  // half across the opening.
  it('stands the whole of the unit\'s back on the wall, not half of it past the wall\'s end', () => {
    const half: PlanRoom = refreshRoom({
      id: 'h',
      type: 'living_room',
      name: 'h',
      polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 3.4 }, { x: 2.2, z: 3.4 }, { x: 0, z: 3.4 }],
      heightM: 2.7,
      areaM2: 0,
      perimeterM: 0,
      openings: [],
      open: [1, 2],
    });
    for (const rng of [undefined, ...SEEDS.map((seed) => seededRng(seed))]) {
      const items = layoutRoom(half, { rng });
      const { unit, wall, open } = unitWall(half, items);
      expect(unit).toBeDefined();
      expect(wall).not.toBeNull();
      expect(open).toBe(false);
      expect(wall!.along - unit!.size.width / 2).toBeGreaterThan(-0.01);
      expect(wall!.along + unit!.size.width / 2).toBeLessThan(wall!.edge.length + 0.01);
    }
  });

  // Every wall but the sofa's is open or too short for the unit: no spot of the sofa gives its
  // unit a wall. The room keeps its TV as it always had it; what stands there is the owner's rule.
  it('keeps the TV unit of a room where no sofa spot gives it a wall', () => {
    const through: PlanRoom = { ...room('t', 'living_room', 3.4, 3.48), open: [1, 2, 3] };
    for (const rng of [undefined, ...SEEDS.map((seed) => seededRng(seed))]) {
      const items = layoutRoom(through, { rng });
      expect(items.some((i) => i.slot === 'sofa')).toBe(true);
      expect(items.some((i) => i.slot === 'tv_unit')).toBe(true);
      expect(items.some((i) => i.slot === 'tv')).toBe(true);
    }
  });
});

describe('kitchens', () => {
  it('keeps 1.2 m of floor in front of the run before the table and its chairs', () => {
    for (const seed of SEEDS) {
      const items = layoutRoom(room('k', 'kitchen', 4.8, 3.2, [door(2, 0.8), window(0, 0.3)]), { rng: seededRng(seed) });
      const run = items.find((i) => i.slot === 'kitchen_run');
      expect(run, `seed ${seed}`).toBeDefined();
      const zone = frontOf(run!, 1.15);
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
