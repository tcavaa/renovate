/**
 * A small bathroom's fallbacks (Nini, 23 Nov 2026, decision 3.1 — `wetLayout` in autoLayout): each
 * tried only when the room would go without an essential, in her order — the shower across the end
 * of a narrow room, a shower instead of the bath, a smaller WC and a compact basin, the mirror near
 * the basin, a 70 × 90 shower — and the must-haves ranked as she put them (`wetRank`).
 */
import { describe, expect, it } from 'vitest';
import { layoutRoom, wetRank } from '@/lib/design/autoLayout';
import { slotPool, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom } from '@/lib/design/planGeometry';
import { seededRng } from '@/lib/design/random';
import { ruleViolations } from '@/lib/design/ruleChecks';
import { BASIN_COMPACT_M, MIRROR_NEAR_BASIN_M, SHOWER_LAST_RESORT_M, SHOWER_MIN_M, WC_COMPACT_DEPTH_M, footprintQuad, quadsOverlap } from '@/lib/design/rules';
import { showerArea, showerGlass } from '@/lib/design/shower';
import type { Opening, PlacedItem, PlanRoom } from '@/lib/design/types';

/** A rectangular bathroom, `w` along x and `d` along z (walls 0–3: z = 0, x = w, z = d, x = 0). */
function bathroom(w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>>): PlanRoom {
  return refreshRoom({
    id: 'b',
    type: 'bathroom',
    name: 'b',
    polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }],
    heightM: 2.7,
    areaM2: 0,
    perimeterM: 0,
    openings: openings.map((o, i) => ({ ...o, id: `b-o${i}`, roomId: 'b' })),
  });
}

const door = (wallIndex: number, t: number, widthM = 0.7): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM, heightM: 2.05, sillM: 0, exterior: false });
const window = (wallIndex: number, widthM = 0.9, sillM = 0.9): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'window', wallIndex, t: 0.5, widthM, heightM: 1.2, sillM, exterior: true });
const of = (items: PlacedItem[], slot: string) => items.find((i) => i.slot === slot);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('a small bathroom\'s fallbacks', () => {
  it('lays the shower across the end of a narrow bathroom, wall to wall, its glass only in front', () => {
    // 1.3 m across, the door in a short wall: no corner shower leaves the WC and the basin room, the far end does.
    const room = bathroom(1.3, 2.8, [door(0, 0.2)]);
    const items = layoutRoom(room);
    const shower = of(items, 'shower')!;
    expect(shower.areaM!.width).toBeCloseTo(1.28, 2);
    expect(shower.areaM!.depth).toBeGreaterThanOrEqual(SHOWER_MIN_M);
    expect(showerGlass(shower, room)).toHaveLength(1);
    // The WC and the basin at their usual sizes, and the mirror over the basin.
    expect(of(items, 'toilet')!.size.depth).toBeGreaterThan(WC_COMPACT_DEPTH_M);
    expect(of(items, 'sink')!.size.width).toBeGreaterThan(BASIN_COMPACT_M.width);
    expect(of(items, 'mirror')).toBeDefined();
    // Nothing stands in the shower's tray.
    const area = showerArea(shower)!;
    const tray = footprintQuad({ position: area.centre, rotation: area.rotation, size: { width: area.width, depth: area.depth, height: 2 } });
    for (const item of items.filter((i) => ['toilet', 'sink'].includes(i.slot))) expect(quadsOverlap(tray, footprintQuad(item), 0.01)).toBe(false);
    // Every draw has its shower.
    for (const seed of SEEDS) expect(of(layoutRoom(room, { rng: seededRng(seed) }), 'shower'), `seed ${seed}`).toBeDefined();
  });

  it('takes a smaller WC and a compact basin before it leaves the shower out', () => {
    const items = layoutRoom(bathroom(1.2, 2.5, [door(0, 0.2)]));
    expect(of(items, 'toilet')!.size.depth).toBeCloseTo(WC_COMPACT_DEPTH_M, 3);
    expect(of(items, 'sink')!.size).toMatchObject(BASIN_COMPACT_M);
    const shower = of(items, 'shower')!;
    expect(Math.min(shower.areaM!.width, shower.areaM!.depth)).toBeGreaterThanOrEqual(SHOWER_MIN_M);
    expect(of(items, 'mirror')).toBeDefined();
  });

  it('takes a 70 × 90 shower only as the last resort, and the check still says it is small', () => {
    const room = bathroom(1.2, 2.3, [door(0, 0.2)]);
    const items = layoutRoom(room);
    const shower = of(items, 'shower')!;
    expect(shower.areaM!.depth).toBeCloseTo(SHOWER_LAST_RESORT_M.depth, 3);
    expect(shower.areaM!.width).toBeGreaterThanOrEqual(SHOWER_LAST_RESORT_M.width);
    for (const slot of ['toilet', 'sink', 'mirror']) expect(of(items, slot), slot).toBeDefined();
    const plan = { rooms: [room], walls: [], technical: { points: [] } } as never;
    expect(ruleViolations(plan, [shower]).map((v) => v.code)).toContain('shower_too_small');
    // A roomier bathroom never gets the small one, nor the compact pieces.
    const roomy = layoutRoom(bathroom(3, 2.4, [door(2, 0.8)]));
    expect(Math.min(of(roomy, 'shower')!.areaM!.width, of(roomy, 'shower')!.areaM!.depth)).toBeGreaterThanOrEqual(SHOWER_MIN_M);
    expect(of(roomy, 'toilet')!.size.depth).toBeGreaterThan(WC_COMPACT_DEPTH_M);
    expect(of(roomy, 'sink')!.size.width).toBeGreaterThan(BASIN_COMPACT_M.width);
  });

  it('hangs the mirror on another wall near the basin when a window is over the basin', () => {
    const items = layoutRoom(bathroom(1.2, 2, [door(1, 0.2), window(3)]));
    const sink = of(items, 'sink')!;
    const mirror = of(items, 'mirror')!;
    expect(mirror).toBeDefined();
    const apart = Math.hypot(mirror.position.x - sink.position.x, mirror.position.z - sink.position.z);
    expect(apart).toBeGreaterThan(0.3);
    expect(apart).toBeLessThan(MIRROR_NEAR_BASIN_M + 0.3);
    // Not over the WC, the shower or anything else standing.
    const hung = footprintQuad({ ...mirror, size: { ...mirror.size, depth: 0.45 } });
    for (const item of items.filter((i) => ['toilet', 'shower', 'washer', 'bathtub'].includes(i.slot))) expect(quadsOverlap(hung, footprintQuad(item), 0.01)).toBe(false);
  });

  it('keeps the WC and the basin with its mirror where the door leaves no room for a shower', () => {
    // 2.29 × 1.31 m with a 79 cm door in the long wall: no shower fits beside the door's floor.
    const items = layoutRoom(bathroom(2.29, 1.31, [door(0, 0.24, 0.79), window(2, 0.52, 1.5)]));
    for (const slot of ['toilet', 'sink', 'mirror']) expect(of(items, slot), slot).toBeDefined();
    expect(of(items, 'shower')).toBeUndefined();
  });
});

describe('what a bathroom must have, in order (wetRank)', () => {
  const piece = (slot: string): PlacedItem => ({ id: slot, roomId: 'b', slot: slot as PlacedItem['slot'], kind: slot, position: { x: 9, z: 9 }, rotation: 0, elevationM: 0, size: { width: 0.1, depth: 0.1, height: 0.1 }, product: null });
  const rank = (slots: string[], only = true) => wetRank(slots.map(piece), only);
  const above = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  };

  it('puts the WC first, then the basin and the shower alike, then the mirror, the washing machine and a bath', () => {
    expect(above(rank(['toilet']), rank(['sink', 'shower', 'mirror', 'washer', 'bathtub']))).toBe(true);
    // In a flat's only bathroom the basin and the shower are as important as each other.
    expect(rank(['toilet', 'sink']).slice(0, 2)).toEqual(rank(['toilet', 'shower']).slice(0, 2));
    // In a second bathroom the basin comes first.
    expect(above(rank(['toilet', 'sink'], false), rank(['toilet', 'shower'], false))).toBe(true);
    expect(above(rank(['toilet', 'sink', 'shower', 'mirror']), rank(['toilet', 'sink', 'shower', 'washer', 'bathtub']))).toBe(true);
    expect(above(rank(['toilet', 'sink', 'shower', 'washer']), rank(['toilet', 'sink', 'shower', 'bathtub']))).toBe(true);
    // A shower instead of a bath that costs the mirror; a bath counts as the shower where it has one of its own.
    expect(above(rank(['toilet', 'sink', 'shower', 'mirror']), rank(['toilet', 'sink', 'bathtub']))).toBe(true);
    expect(above(rank(['toilet', 'sink', 'bathtub', 'mirror']), rank(['toilet', 'sink', 'shower', 'mirror']))).toBe(true);
  });
});

describe('the WC\'s slot', () => {
  it('takes a WC, never a bidet the library filed under toilets (a smaller WC drew the shortest of the two)', () => {
    const product = (id: number, nameEn: string, depthCm: number): CatalogProduct => ({ id, nameKa: nameEn, nameEn, slug: `p${id}`, brand: null, categorySlug: 'sanitary', pricePerUnit: 500, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: 'toilet', model3dUrl: null, widthCm: 40, depthCm, heightCm: 45, styleTags: [], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null });
    const wc: PlacedItem = { id: 't', roomId: 'b', slot: 'toilet', kind: 'toilet', position: { x: 0.5, z: 0.3 }, rotation: 0, elevationM: 0, size: { width: 0.4, depth: WC_COMPACT_DEPTH_M, height: 0.45 }, product: null };
    const pool = slotPool(wc, [product(1, 'Black egg-shaped floor bidet', 49), product(2, 'Wall-hung square ceramic toilet', 53)], bathroom(1.2, 2, []));
    expect(pool.map((p) => p.id)).toEqual([2]);
  });
});
