import { describe, expect, it } from 'vitest';
import { bedRungs, layoutRoom, placeAdditional } from '@/lib/design/autoLayout';
import { resolveVariant } from '@/lib/design/catalog';
import { blocksWindow, inDoorway } from '@/lib/design/manipulate';
import { refreshRoom } from '@/lib/design/planGeometry';
import { isPlausibleForGeneration } from '@/lib/design/plausibility';
import { NARROW_DOUBLE_BED_M, rayToPolygon, SHALLOW_WARDROBE_DEPTH_M, SINGLE_BED_UNDER_M2 } from '@/lib/design/rules';
import type { Opening, PlacedItem, PlanRoom } from '@/lib/design/types';
import { fixturePlans } from '../../helpers/generationFixtures';

// A bedroom's bed, nightstands and wardrobe (Nini, 23 Nov 2026, decision 3.2): a single under 11 m²;
// in Nini's order a 1.4 m double, the bed's long side on a wall, a smaller wardrobe, one nightstand,
// a single; the wardrobe a must; the essentials before the decor.

function room(w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({ id: 'b', type: 'bedroom', name: 'b', polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `b-o${i}`, roomId: 'b' })) });
}
const door = (wallIndex: number, t: number): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM: 0.8, heightM: 2.05, sillM: 0, exterior: false, swing: 'in' });
const window = (wallIndex: number, t: number, widthM: number): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'window', wallIndex, t, widthM, heightM: 1.4, sillM: 0.9, exterior: true });

const of = (items: PlacedItem[], slot: PlacedItem['slot']) => items.filter((i) => i.slot === slot);
/** How far the nearer of a bed's long sides is from the room's walls. */
function sideToWall(bed: PlacedItem, r: PlanRoom): number {
  return Math.min(
    ...[1, -1].map((s) => {
      const right = { x: Math.cos(bed.rotation) * s, z: -Math.sin(bed.rotation) * s };
      const from = { x: bed.position.x + (right.x * bed.size.width) / 2, z: bed.position.z + (right.z * bed.size.width) / 2 };
      return rayToPolygon(from, right, r.polygon) ?? Infinity;
    })
  );
}

describe('a bedroom under 11 m²', () => {
  it('takes a single bed', () => {
    const entry = { kind: 'bed_double', count: 1 };
    expect(SINGLE_BED_UNDER_M2).toBe(11);
    expect(resolveVariant(entry, 10.99)).toBe('bed_single');
    expect(resolveVariant(entry, 9.5)).toBe('bed_single');
    expect(resolveVariant(entry, 11)).toBe('bed_double');
    const small = room(3, 3.5, [door(2, 0.8), window(0, 0.5, 1.2)]);
    const items = layoutRoom(small);
    const [bed] = of(items, 'bed');
    expect(bed.kind).toBe('bed_single');
    // As high as a headboard: never laid under a window sill the catalogue's singles would block.
    expect(blocksWindow(bed, small)).toBe(false);
    expect(of(items, 'wardrobe')).toHaveLength(1);
  });
});

describe('the bed\'s ladder', () => {
  it('tries the beds in Nini\'s order', () => {
    expect(bedRungs('bed_double')).toEqual([
      { kind: 'bed_double', width: 1.6, alongWall: false },
      { kind: 'bed_double', width: NARROW_DOUBLE_BED_M, alongWall: false },
      { kind: 'bed_double', width: 1.6, alongWall: true },
      { kind: 'bed_double', width: NARROW_DOUBLE_BED_M, alongWall: true },
      { kind: 'bed_single', width: 0.95, alongWall: false },
      { kind: 'bed_single', width: 0.95, alongWall: true },
    ]);
    expect(bedRungs('bed_single').map((r) => r.alongWall)).toEqual([false, true]);
  });

  it('keeps the 1.6 m double, both nightstands and the usual wardrobe where they fit', () => {
    const items = layoutRoom(room(3.6, 3.4, [door(2, 0.8), window(0, 0.5, 1.4)]));
    expect(of(items, 'bed').map((b) => [b.kind, b.size.width])).toEqual([['bed_double', 1.6]]);
    expect(of(items, 'nightstand')).toHaveLength(2);
    expect(of(items, 'wardrobe')[0].size.width).toBeGreaterThanOrEqual(1.17);
  });

  it('takes the 1.4 m double where it keeps both nightstands and the 1.6 m one keeps one', () => {
    // 2.2 m wide: a 1.6 m bed and two nightstands need 2.58 m.
    const items = layoutRoom(room(2.2, 5.2, [door(1, 0.5)]));
    expect(of(items, 'bed').map((b) => [b.kind, b.size.width])).toEqual([['bed_double', NARROW_DOUBLE_BED_M]]);
    expect(of(items, 'nightstand')).toHaveLength(2);
    expect(of(items, 'wardrobe')).toHaveLength(1);
  });

  it('lays the double with its long side on a wall where no wall takes its head — one nightstand, on the free side', () => {
    // Windows over three walls (sill 90 cm, under a headboard), the door in the fourth: no wall
    // takes a bed's head; the mattress stands under a sill.
    const r = room(2.6, 4.5, [window(0, 0.5, 0.8), window(1, 0.5, 4), door(2, 0.5), window(3, 0.5, 2.6)]);
    const items = layoutRoom(r);
    const [bed] = of(items, 'bed');
    expect(bed.kind).toBe('bed_double');
    expect(sideToWall(bed, r)).toBeLessThan(0.03);
    expect(inDoorway(bed, r)).toBe(false);
    const stands = of(items, 'nightstand');
    expect(stands).toHaveLength(1);
    // Beside its head on the open side: not between the bed and the wall.
    const right = { x: Math.cos(bed.rotation), z: -Math.sin(bed.rotation) };
    const side = Math.sign((stands[0].position.x - bed.position.x) * right.x + (stands[0].position.z - bed.position.z) * right.z);
    const wallSide = [1, -1].find((s) => (rayToPolygon({ x: bed.position.x + (right.x * s * bed.size.width) / 2, z: bed.position.z + (right.z * s * bed.size.width) / 2 }, { x: right.x * s, z: right.z * s }, r.polygon) ?? 9) < 0.03);
    expect(side).toBe(-wallSide!);
  });

  it('gives a room of 11 m² or more a single where no double fits with its nightstand and wardrobe', () => {
    const narrow = room(1.5, 8, [door(0, 0.5)]);
    expect(narrow.areaM2).toBeGreaterThanOrEqual(11);
    const items = layoutRoom(narrow);
    expect(of(items, 'bed').map((b) => b.kind)).toEqual(['bed_single']);
    expect(of(items, 'nightstand').length).toBeGreaterThan(0);
    expect(of(items, 'wardrobe')).toHaveLength(1);
  });
});

describe('the wardrobe, a must', () => {
  it('comes back compact where the usual one has no wall', () => {
    const items = layoutRoom(room(2.7, 4.2, [door(0, 0.5), window(2, 0.5, 1.2)]));
    const [wardrobe] = of(items, 'wardrobe');
    expect(wardrobe.size.width).toBeCloseTo(1, 5);
    expect(wardrobe.size.depth).toBeCloseTo(0.62, 5);
    expect(of(items, 'bed')[0].size.width).toBe(1.6);
    expect(of(items, 'nightstand')).toHaveLength(2);
  });

  it('comes back shallow where no compact one stands, in a room under 8 m² too', () => {
    const small = room(2.1, 2.6, [door(0, 0.5), window(2, 0.5, 1.2)]);
    expect(small.areaM2).toBeLessThan(8);
    const items = layoutRoom(small);
    const [wardrobe] = of(items, 'wardrobe');
    expect(wardrobe.size.depth).toBeCloseTo(SHALLOW_WARDROBE_DEPTH_M, 5);
    expect(of(items, 'bed')).toHaveLength(1);
  });

  it('takes a nightstand\'s floor where nothing else gives it one', () => {
    // A 6.27 m² bedroom open on two sides (a fixture plan's): the single's nightstand stands where
    // the only wardrobe would.
    const plan = fixturePlans().find((p) => p.id === '#389')!.plan;
    const r = plan.rooms.find((x) => x.id === 'r3')!;
    const items = layoutRoom(r, { respectDoorSwing: true });
    expect(of(items, 'bed')).toHaveLength(1);
    expect(of(items, 'wardrobe')).toHaveLength(1);
    expect(of(items, 'nightstand')).toHaveLength(0);
    // Without the wardrobe there, the nightstand would have stood.
    expect(placeAdditional(r, 'nightstand', of(items, 'bed'))).not.toBeNull();
  });
});

describe('the essentials before the decor', () => {
  it('lays the bed, the nightstands and the wardrobe first, the rest round them', () => {
    const items = layoutRoom(room(4.2, 3.8, [door(2, 0.85), window(0, 0.5, 1.4)]));
    expect(items.slice(0, 4).map((i) => i.slot)).toEqual(['bed', 'nightstand', 'nightstand', 'wardrobe']);
    expect(items.slice(0, 4).map((i) => i.id)).toEqual(['b-bed_double-0', 'b-nightstand-1', 'b-nightstand-2', 'b-wardrobe-3']);
    expect(items.slice(4).some((i) => ['floor_lamp', 'plant', 'stool', 'dresser', 'rug'].includes(i.slot))).toBe(true);
  });
});

describe('the single beds generation takes', () => {
  const single = (widthCm: number, depthCm: number) => ({ model3dKind: 'bed_single', widthCm, depthCm, heightCm: 100, nameEn: 'bed', nameKa: 'bed' });
  it('are ones a grown-up sleeps in: 80 cm wide and 1.8 m long or more', () => {
    expect(isPlausibleForGeneration(single(90, 200))).toBe(true);
    expect(isPlausibleForGeneration(single(113, 212))).toBe(true);
    expect(isPlausibleForGeneration(single(54, 122))).toBe(false);
    expect(isPlausibleForGeneration(single(131, 166))).toBe(false);
    expect(isPlausibleForGeneration(single(197, 85))).toBe(false);
  });
});
