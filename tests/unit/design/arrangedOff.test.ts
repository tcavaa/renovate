import { describe, expect, it } from 'vitest';
import { arrangedOff, withoutOrphans } from '@/lib/design/arrangedOff';
import { ARCHETYPES } from '@/lib/design/catalog';
import { generateScene, reviewedScene } from '@/lib/design/generateScene';
import { layoutRoom } from '@/lib/design/autoLayout';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { FloorPlan, PlacedItem, PlanRoom } from '@/lib/design/types';

/**
 * A piece arranged off another goes with it (docs/design-studio/generation-audit.md, M3): no
 * coffee table, armchair, rug, TV unit and TV round the floor where the sofa would be, no
 * nightstands beside no bed.
 */

const rect = (id: string, type: PlanRoom['type'], w: number, d: number): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });

const piece = (id: string, kind: string, roomId: string, x = 0, z = 0): PlacedItem => ({
  id,
  roomId,
  kind,
  slot: ARCHETYPES[kind].slot,
  position: { x, z },
  rotation: 0,
  elevationM: 0,
  size: ARCHETYPES[kind].size,
  product: null,
});
const ids = (items: PlacedItem[]) => items.map((i) => i.id);
const without = (laid: PlacedItem[], gone: string[], rooms: PlanRoom[] = []) => ids(withoutOrphans(laid, laid.filter((i) => !gone.includes(i.id)), rooms));

describe('what a kind is arranged off', () => {
  it('reads it from the archetypes\' placement rules', () => {
    // Placed off another piece, and nowhere without it.
    expect(arrangedOff('coffee_table')).toEqual({ slots: ['sofa'], only: true });
    expect(arrangedOff('tv_unit')).toEqual({ slots: ['sofa'], only: true });
    expect(arrangedOff('armchair')).toEqual({ slots: ['sofa'], only: true });
    expect(arrangedOff('nightstand')).toEqual({ slots: ['bed'], only: true });
    expect(arrangedOff('dining_chair')).toEqual({ slots: ['dining_table'], only: true });
    expect(arrangedOff('office_chair')).toEqual({ slots: ['desk'], only: true });
    expect(arrangedOff('bath_mixer')).toEqual({ slots: ['bathtub'], only: true });
    // Hung over a piece, and nowhere without it.
    expect(arrangedOff('tv')).toEqual({ slots: ['tv_unit'], only: true });
    expect(arrangedOff('tap')).toEqual({ slots: ['sink'], only: true });
    expect(arrangedOff('dryer')).toEqual({ slots: ['washer'], only: true });
    // Under a piece — or, in a room without it, under the piece the room is laid out round — and
    // nowhere without either.
    expect(arrangedOff('rug', 'living_room')).toEqual({ slots: ['coffee_table', 'sofa'], only: true, either: true });
    expect(arrangedOff('rug', 'office')).toEqual({ slots: ['coffee_table', 'desk'], only: true, either: true });
    expect(arrangedOff('rug_bed', 'bedroom')).toEqual({ slots: ['bed'], only: true, either: true });
    expect(arrangedOff('rug')).toEqual({ slots: ['coffee_table'], only: true, either: true });
  });

  it('leaves alone what takes a wall of its own when the other piece is not there', () => {
    // A print over the bed, else on a wall; the wall cabinets over the run; the fridge at the run's end.
    for (const kind of ['artwork', 'kitchen_wall', 'fridge', 'wardrobe', 'bed_double', 'sofa_corner', 'plant', 'pendant', 'curtain']) expect(arrangedOff(kind), kind).toBeNull();
    expect(arrangedOff('spaceship')).toBeNull();
  });

  it('hangs a mirror over the basin only in a bathroom or a toilet', () => {
    expect(arrangedOff('mirror', 'bathroom')).toEqual({ slots: ['sink', 'console'], only: true });
    expect(arrangedOff('mirror', 'toilet')?.only).toBe(true);
    expect(arrangedOff('mirror', 'hallway')).toBeNull();
    expect(arrangedOff('mirror')).toBeNull();
  });

  it('lays a rug under its piece or the room\'s main piece — never under whatever stands first', () => {
    // A bedroom too narrow for any bed gets its wardrobe, and no rug under it.
    const narrow = rect('b', 'bedroom', 1.5, 6.4);
    const laid = layoutRoom(narrow);
    expect(laid.some((i) => i.slot === 'bed')).toBe(false);
    expect(laid.some((i) => i.slot === 'wardrobe')).toBe(true);
    expect(laid.some((i) => i.slot === 'rug')).toBe(false);
    // An office has no coffee table: its rug lies under the desk it is laid out round.
    const office = layoutRoom(rect('o', 'office', 3.6, 3.6));
    const desk = office.find((i) => i.slot === 'desk')!;
    const rug = office.find((i) => i.slot === 'rug')!;
    expect(Math.hypot(rug.position.x - desk.position.x, rug.position.z - desk.position.z)).toBeLessThan(1.3);
  });

  it('says what the engine does: every such piece is laid nowhere in a room without the other', () => {
    // A living room's program in a room far too narrow for any sofa: nothing placed off the sofa is laid.
    const narrow = rect('l', 'living_room', 0.8, 20);
    const laid = layoutRoom(narrow);
    expect(laid.some((i) => i.slot === 'sofa')).toBe(false);
    for (const item of laid) {
      const off = arrangedOff(item.kind, narrow.type);
      if (off?.only) expect(laid.some((p) => off.slots.includes(p.slot)), item.kind).toBe(true);
    }
  });
});

describe('a piece that is gone takes what was arranged off it', () => {
  const living = [
    piece('sofa', 'sofa_corner', 'l', 2, 0.9),
    piece('table', 'coffee_table', 'l', 2, 2.5),
    piece('unit', 'tv_unit', 'l', 2, 4.8),
    piece('tv', 'tv', 'l', 2, 4.9),
    piece('armchair', 'armchair', 'l', 3.9, 1.9),
    piece('shelf', 'bookshelf', 'l', 4.8, 3),
    piece('rug', 'rug', 'l', 2, 2.5),
    piece('lamp', 'floor_lamp', 'l', 0.3, 0.3),
    piece('print', 'artwork', 'l', 2, 0.03),
    piece('plant', 'plant', 'l', 4.7, 4.7),
  ];

  it('no sofa: no coffee table, no rug under it, no armchair, no TV unit — and so no TV', () => {
    expect(without(living, ['sofa'])).toEqual(['shelf', 'lamp', 'print', 'plant']);
  });

  it('no TV unit: no TV; no coffee table: no rug under it; everything else stays', () => {
    expect(without(living, ['unit'])).toEqual(['sofa', 'table', 'armchair', 'shelf', 'rug', 'lamp', 'print', 'plant']);
    expect(without(living, ['table'])).toEqual(['sofa', 'unit', 'tv', 'armchair', 'shelf', 'lamp', 'print', 'plant']);
  });

  it('keeps the rug of a room whose coffee table is gone and whose sofa stands — and takes it with both', () => {
    const room = [rect('l', 'living_room', 5, 5)];
    expect(without(living, ['table'], room)).toEqual(['sofa', 'unit', 'tv', 'armchair', 'shelf', 'rug', 'lamp', 'print', 'plant']);
    expect(without(living, ['sofa'], room)).toEqual(['shelf', 'lamp', 'print', 'plant']);
    // An office's rug lies under the desk: no desk, no rug.
    const office = [piece('desk', 'desk', 'o', 1, 0.35), piece('chair', 'office_chair', 'o', 1, 0.9), piece('rug', 'rug', 'o', 1, 0.9)];
    expect(without(office, ['desk'], [rect('o', 'office', 3, 3)])).toEqual([]);
  });

  it('leaves a flat with nothing gone as it is', () => {
    expect(withoutOrphans(living, living)).toBe(living);
  });

  it('no bed: no nightstands and no rug under it — the print, the wardrobe and the lamp stay', () => {
    const bedroom = [piece('bed', 'bed_double', 'b', 2, 1), piece('n1', 'nightstand', 'b', 3, 0.2), piece('n2', 'nightstand', 'b', 1, 0.2), piece('wardrobe', 'wardrobe', 'b', 4, 2), piece('rug', 'rug_bed', 'b', 2, 1.3), piece('print', 'artwork', 'b', 2, 0.03), piece('lamp', 'floor_lamp', 'b', 0.3, 3)];
    expect(without(bedroom, ['bed'])).toEqual(['wardrobe', 'print', 'lamp']);
  });

  it('no table: no chairs; no desk: no desk chair', () => {
    const kitchen = [piece('run', 'kitchen_run', 'k', 1.5, 0.3), piece('fridge', 'fridge', 'k', 3.4, 0.36), piece('table', 'dining_table', 'k', 2, 3), piece('c1', 'dining_chair', 'k', 2, 2.4), piece('c2', 'dining_chair', 'k', 2, 3.6)];
    expect(without(kitchen, ['table'])).toEqual(['run', 'fridge']);
    const office = [piece('desk', 'desk', 'o', 1, 0.35), piece('chair', 'office_chair', 'o', 1, 0.9), piece('rug', 'rug', 'o', 1, 0.9)];
    // The office's rug was laid under the desk for want of a coffee table: a rug of its own.
    expect(without(office, ['desk'])).toEqual(['rug']);
  });

  it('keeps what stood on its own: a fridge in a kitchen where no run was laid, a rug under the room\'s main piece', () => {
    const kitchen = [piece('fridge', 'fridge', 'k', 0.4, 0.36), piece('cabinets', 'kitchen_wall', 'k', 2, 0.2)];
    expect(without(kitchen, [])).toEqual(['fridge', 'cabinets']);
    const lounge = [piece('shelf', 'bookshelf', 'l', 1, 0.2), piece('rug', 'rug', 'l', 1, 0.5), piece('lamp', 'floor_lamp', 'l', 3, 3)];
    expect(without(lounge, ['lamp'])).toEqual(['shelf', 'rug']);
    expect(without(lounge, ['shelf'])).toEqual(['rug', 'lamp']);
  });

  it('takes the chairs of the table that is gone, not of the one that stands', () => {
    const studio = [piece('t1', 'dining_table', 's', 2, 2), piece('a', 'dining_chair', 's', 2, 1.4), piece('t2', 'dining_table', 's', 8, 2), piece('b', 'dining_chair', 's', 8, 1.4)];
    expect(without(studio, ['t1'])).toEqual(['t2', 'b']);
  });

  it('a bathroom\'s mirror and tap go with the basin, a hall\'s mirror stays without its console', () => {
    const bath = rect('bath', 'bathroom', 3, 2.5);
    const hall = rect('hall', 'hallway', 3, 2.5);
    const wet = [piece('basin', 'sink', 'bath', 1, 0.25), piece('mirror', 'mirror', 'bath', 1, 0.03), piece('tap', 'tap', 'bath', 1, 0.1), piece('wc', 'toilet', 'bath', 2.4, 0.35)];
    expect(without(wet, ['basin'], [bath, hall])).toEqual(['wc']);
    const entry = [piece('console', 'console_table', 'hall', 1, 0.18), piece('mirror', 'mirror', 'hall', 1, 0.03)];
    expect(without(entry, ['console'], [bath, hall])).toEqual(['mirror']);
  });

  it('reads a piece as it stood when it was arranged, whatever it is now', () => {
    // The bedroom's rug as laid (under the bed) and as matched (a rug product: kind `rug`).
    const laid = [piece('bed', 'bed_double', 'b', 2, 1), piece('rug', 'rug_bed', 'b', 2, 1.3)];
    const matched = [{ ...laid[1], kind: 'rug' }];
    expect(withoutOrphans(laid, matched)).toEqual([]);
    // A piece that was never part of the flat as laid stands on its own.
    expect(ids(withoutOrphans(laid, [laid[0], piece('extra', 'armchair', 'b', 3, 3)]))).toEqual(['bed', 'extra']);
  });
});

// --- through the generator -------------------------------------------------------------------

function product(id: number, kind: string, widthCm: number, depthCm: number, heightCm: number): CatalogProduct {
  return {
    id,
    nameKa: `p${id}`,
    slug: `p${id}`,
    brand: null,
    categorySlug: kind,
    pricePerUnit: 900,
    unit: 'piece',
    imageUrl: null,
    colorHex: '#999999',
    textureUrl: null,
    model3dKind: kind,
    model3dUrl: `/models/p${id}.glb`,
    widthCm,
    depthCm,
    heightCm,
    styleTags: ['modern'],
    tags: [],
    isFeatured: false,
    specs: null,
    coveragePerUnit: null,
    store: null,
  };
}

describe('generating a room whose sofa or bed no product fits', () => {
  const plan: FloorPlan = { rooms: [rect('bed', 'bedroom', 4, 4), { ...rect('living', 'living_room', 6, 5), polygon: [{ x: 4.2, z: 0 }, { x: 10.2, z: 0 }, { x: 10.2, z: 5 }, { x: 4.2, z: 5 }] }].map(refreshRoom), metresPerPixel: null, bounds: { width: 10.2, depth: 5 }, source: 'manual', wallThicknessM: 0.2 };
  const around = [
    product(1, 'nightstand', 45, 40, 55),
    product(2, 'coffee_table', 110, 60, 40),
    product(3, 'tv_unit', 180, 42, 50),
    product(4, 'tv', 140, 6, 80),
    product(5, 'armchair', 86, 88, 82),
    product(6, 'rug', 240, 170, 2),
    product(7, 'bookshelf', 90, 35, 190),
    product(8, 'wardrobe', 180, 62, 225),
    product(9, 'floor_lamp', 40, 40, 160),
  ];
  // No sofa and no bed of any kind or style that fits: wider than the rooms.
  const tooBig = [product(20, 'sofa_corner', 900, 300, 85), product(21, 'sofa_3seat', 900, 100, 85), product(22, 'bed_double', 900, 210, 100)];
  const fitting = [product(30, 'sofa_corner', 270, 175, 85), product(31, 'bed_double', 160, 205, 100)];
  const generate = (catalog: CatalogProduct[], seed: number) => generateScene({ plan, styleId: 'modern', budgetGel: null, catalog, proposal: null, finishes: [], electrical: [], seed, at: '2026-11-16T00:00:00.000Z', aiCount: 0 });
  const slotsOf = (items: PlacedItem[], roomId: string) => new Set(items.filter((i) => i.roomId === roomId).map((i) => i.slot));

  it('leaves nothing arranged round the sofa that is not there, nor beside the bed that is not', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const scene = generate([...around, ...tooBig], seed);
      const living = slotsOf(scene.items, 'living');
      expect(living.has('sofa')).toBe(false);
      for (const slot of ['coffee_table', 'tv_unit', 'tv', 'armchair', 'rug'] as const) expect(living.has(slot), `${slot} with no sofa (seed ${seed})`).toBe(false);
      expect(slotsOf(scene.items, 'bed').has('nightstand')).toBe(false);
      // What stands on its own is still there.
      expect(slotsOf(scene.items, 'bed').has('wardrobe') || scene.decor.some((d) => d.id === 'decor-bed-wardrobe-wall')).toBe(true);
    }
  });

  it('keeps them all where the sofa and the bed stand', () => {
    const scene = generate([...around, ...fitting], 1);
    const living = slotsOf(scene.items, 'living');
    for (const slot of ['sofa', 'coffee_table', 'tv_unit', 'tv'] as const) expect(living.has(slot), slot).toBe(true);
    expect(scene.items.filter((i) => i.roomId === 'bed' && i.slot === 'nightstand')).toHaveLength(2);
  });

  it('takes the TV with the TV unit the designer\'s check removes', () => {
    const scene = generate([...around, ...fitting], 1);
    const unit = scene.items.find((i) => i.slot === 'tv_unit')!;
    const review = { model: 'claude-test', notes: {}, fixes: [{ target: unit.id, action: 'remove' as const, productId: null, wallIndex: null, reason: 'in the way' }] };
    const reviewed = reviewedScene(scene, review, [...around, ...fitting]);
    expect(reviewed.items.some((i) => i.id === unit.id)).toBe(false);
    expect(reviewed.items.some((i) => i.slot === 'tv')).toBe(false);
    expect(reviewed.items.some((i) => i.slot === 'sofa')).toBe(true);
  });
});
