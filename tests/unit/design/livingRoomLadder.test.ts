import { describe, expect, it } from 'vitest';
import { layoutRoom, loungeRungs } from '@/lib/design/autoLayout';
import { resolveVariant } from '@/lib/design/catalog';
import { pieceWall } from '@/lib/design/manipulate';
import { matchProducts, tvInches, type CatalogProduct } from '@/lib/design/matcher';
import { isOpenEdge, refreshRoom } from '@/lib/design/planGeometry';
import { seededRng } from '@/lib/design/random';
import { ruleViolations } from '@/lib/design/ruleChecks';
import { CORNER_SOFA_SIDE_M, cornerSofaFits, floorRectangle, SOFA_OPEN_LINE_WAY_M, TV_CENTRE_M, TV_UNIT_CLEAR_MIN_M, TV_UNIT_NARROW_M, tvInchesFor } from '@/lib/design/rules';
import type { Opening, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';

// The living room and its TV (Nini, 23 Nov 2026, decisions 1, 2 and 3.3): the TV's size by its
// distance from the sofa; a sofa standing free with its back to an open line, facing the TV on a wall;
// her fallbacks in her order where the TV would not stand on a wall; the corner sofa by the room's
// proportions, not its area.

type Hole = Omit<Opening, 'roomId' | 'id'>;
const door = (wallIndex: number, t: number, widthM = 0.8): Hole => ({ kind: 'door', wallIndex, t, widthM, heightM: 2.05, sillM: 0, exterior: false });
const window = (wallIndex: number, t: number, widthM: number): Hole => ({ kind: 'window', wallIndex, t, widthM, heightM: 1.4, sillM: 0.9, exterior: true });
const rect = (w: number, d: number): Vec2[] => [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
function room(polygon: Vec2[], openings: Hole[] = [], open?: number[]): PlanRoom {
  const laid = refreshRoom({ id: 'l', type: 'living_room', name: 'l', polygon, heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `l-o${i}`, roomId: 'l' })) });
  return open ? { ...laid, open } : laid;
}
const of = (items: PlacedItem[], slot: PlacedItem['slot']) => items.filter((i) => i.slot === slot);
const SEEDS = [undefined, ...Array.from({ length: 8 }, (_, i) => seededRng(i + 1))];
/** Whether a piece stands or hangs with its back on one of the room's walls, not a separator's line. */
const onWall = (item: PlacedItem, r: PlanRoom) => {
  const wall = pieceWall(item, r, 0.12);
  return !!wall && !isOpenEdge(r, wall.edge.index);
};

describe('the TV by its distance from the sofa (decision 1)', () => {
  it('asks about 55″ at 2.5 m, 65″ at 3 m, 75″ at 3.5 m, between them in step, and the largest from 4.2 m', () => {
    expect(tvInchesFor(2.5)).toBe(55);
    expect(tvInchesFor(3)).toBe(65);
    expect(tvInchesFor(3.5)).toBe(75);
    expect(tvInchesFor(2.75)).toBeCloseTo(60, 6);
    expect(tvInchesFor(2)).toBeCloseTo(45, 6);
    expect(tvInchesFor(4)).toBeCloseTo(85, 6);
    expect(tvInchesFor(4.2)).toBe(Infinity);
    expect(tvInchesFor(0.5)).toBe(32);
  });

  it('reads a TV\'s size off its name, else off its width', () => {
    expect(tvInches({ nameKa: 'ტელევიზორი', nameEn: '55" 4K TV on a stand', widthCm: 123 })).toBe(55);
    expect(tvInches({ nameKa: 'ტელევიზორი', nameEn: '65″ OLED TV', widthCm: 145 })).toBe(65);
    expect(tvInches({ nameKa: 'ტელევიზორი', nameEn: 'Retro TV in a wooden cabinet', widthCm: 60 })).toBe(27);
  });

  // A living room 5 m wide: the sofa against wall 0, its TV unit against wall 2 at `depth`, the TV hung
  // over it — the matcher takes the TV whose size the distance asks for, the smallest at least as large.
  const tvFor = (depth: number) => {
    const r = room(rect(5, depth));
    const sofa: PlacedItem = { id: 's', roomId: 'l', slot: 'sofa', kind: 'sofa_3seat', position: { x: 2.5, z: 0.48 }, rotation: 0, elevationM: 0, size: { width: 2.2, depth: 0.92, height: 0.84 }, product: null };
    const unit: PlacedItem = { id: 'u', roomId: 'l', slot: 'tv_unit', kind: 'tv_unit', position: { x: 2.5, z: depth - 0.23 }, rotation: Math.PI, elevationM: 0, size: { width: 1.8, depth: 0.42, height: 0.5 }, product: null };
    const tv: PlacedItem = { id: 't', roomId: 'l', slot: 'tv', kind: 'tv', position: { x: 2.5, z: depth - 0.05 }, rotation: Math.PI, elevationM: TV_CENTRE_M - 0.41, size: { width: 1.8, depth: 0.08, height: 0.82 }, product: null };
    const product = (id: number, kind: string, nameEn: string, w: number, d: number, h: number): CatalogProduct => ({ id, nameKa: nameEn, nameEn, slug: `p${id}`, brand: null, categorySlug: kind, pricePerUnit: 900, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/m${id}.glb`, widthCm: w, depthCm: d, heightCm: h, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null });
    const catalog = [
      product(1, 'sofa_3seat', 'Sofa', 220, 92, 84),
      product(2, 'tv_unit', 'TV unit', 180, 42, 50),
      product(10, 'tv', '50" TV on the wall', 112, 6, 70),
      product(11, 'tv', '55" TV on the wall', 123, 6, 75),
      product(12, 'tv', '65" TV on the wall', 145, 6, 82),
    ];
    return matchProducts([sofa, unit, tv], catalog, { styleId: 'modern', rooms: [r] }).find((i) => i.slot === 'tv')?.product?.productId;
  };

  it('takes the screen the distance asks for', () => {
    // The sofa's middle 2.5 m from the TV: a 55″ (not the 50″, not the 65″).
    expect(tvFor(2.5 + 0.48 + 0.05)).toBe(11);
    // 2.75 m asks 60″: the catalogue has none, so the next larger, 65″.
    expect(tvFor(2.75 + 0.48 + 0.05)).toBe(12);
    // 4.5 m: the largest.
    expect(tvFor(4.5 + 0.48 + 0.05)).toBe(12);
  });

  it('draws among the TVs of that size alone when generating', () => {
    const r = room(rect(5, 3.03));
    const sofa: PlacedItem = { id: 's', roomId: 'l', slot: 'sofa', kind: 'sofa_3seat', position: { x: 2.5, z: 0.48 }, rotation: 0, elevationM: 0, size: { width: 2.2, depth: 0.92, height: 0.84 }, product: null };
    const tv: PlacedItem = { id: 't', roomId: 'l', slot: 'tv', kind: 'tv', position: { x: 2.5, z: 2.98 }, rotation: Math.PI, elevationM: 0.64, size: { width: 1.8, depth: 0.08, height: 0.82 }, product: null };
    const product = (id: number, kind: string, nameEn: string, w: number): CatalogProduct => ({ id, nameKa: nameEn, nameEn, slug: `p${id}`, brand: null, categorySlug: kind, pricePerUnit: 900, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/m${id}.glb`, widthCm: w, depthCm: kind === 'tv' ? 6 : 92, heightCm: 80, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null });
    const catalog = [product(1, 'sofa_3seat', 'Sofa', 220), product(10, 'tv', '50" TV', 112), product(11, 'tv', '55" TV', 123), product(13, 'tv', '55" slim TV', 124), product(12, 'tv', '65" TV', 145)];
    for (let seed = 1; seed <= 12; seed++) {
      const items = matchProducts([sofa, tv], catalog, { styleId: 'modern', rooms: [r], rng: seededRng(seed) });
      expect([11, 13], `seed ${seed}`).toContain(items.find((i) => i.slot === 'tv')?.product?.productId);
    }
  });
});

describe('the corner sofa by the room\'s proportions (decision 3.3)', () => {
  it('measures the largest rectangle of floor, not the bounding box', () => {
    expect(floorRectangle(rect(4.7, 4.7))).toEqual({ short: 4.7, long: 4.7 });
    // An L: 6 × 3 along wall 0, 3.5 × 5.5 on its west side.
    const l = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }, { x: 3.5, z: 3 }, { x: 3.5, z: 5.5 }, { x: 0, z: 5.5 }];
    expect(floorRectangle(l)).toEqual({ short: 3.5, long: 5.5 });
  });

  it('gives 4.7 × 4.7 m a corner sofa and 2.75 × 8 m — the same 22 m² — a straight one', () => {
    expect(CORNER_SOFA_SIDE_M).toBe(3.8);
    const entry = { kind: 'sofa_3seat', count: 1, cornerWhereFits: true };
    expect(cornerSofaFits(rect(4.7, 4.7))).toBe(true);
    expect(resolveVariant(entry, 22.09, rect(4.7, 4.7))).toBe('sofa_corner');
    expect(cornerSofaFits(rect(2.75, 8))).toBe(false);
    expect(resolveVariant(entry, 22, rect(2.75, 8))).toBe('sofa_3seat');
    // By its shape, not its size: 3.9 × 4.2 m (16 m²) takes one, 3.7 × 7 m (26 m²) does not.
    expect(resolveVariant(entry, 16.4, rect(3.9, 4.2))).toBe('sofa_corner');
    expect(resolveVariant(entry, 25.9, rect(3.7, 7))).toBe('sofa_3seat');
    const l = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }, { x: 3.5, z: 3 }, { x: 3.5, z: 5.5 }, { x: 0, z: 5.5 }];
    expect(resolveVariant(entry, 26.75, l)).toBe('sofa_3seat');
  });

  it('lays the corner sofa in a square room and a three-seat in a long one', () => {
    const square = layoutRoom(room(rect(4.7, 4.7), [door(3, 0.85), window(0, 0.5, 1.6)]));
    expect(of(square, 'sofa')[0]?.kind).toBe('sofa_corner');
    const long = layoutRoom(room(rect(2.75, 8), [door(0, 0.5), window(2, 0.5, 1.2)]));
    expect(of(long, 'sofa')[0]?.kind).toBe('sofa_3seat');
  });
});

describe('a sofa standing free, its back to the open side (decision 2)', () => {
  // 2.6 × 5 m, open on its far short side (the kitchen beyond): against a long wall the sofa faces a
  // wall 2.6 m off, too near for its unit; against the near short wall it faces the open line.
  const open = room(rect(2.6, 5), [], [2]);

  it('faces the TV on a wall, with the way kept between its back and the line', () => {
    for (const rng of SEEDS) {
      const items = layoutRoom(open, { rng });
      const [sofa] = of(items, 'sofa');
      const [unit] = of(items, 'tv_unit');
      expect(sofa).toBeDefined();
      expect(unit).toBeDefined();
      expect(of(items, 'tv')).toHaveLength(1);
      expect(of(items, 'coffee_table')).toHaveLength(1);
      expect(onWall(unit, open)).toBe(true);
      // Its back to the open line (z 5), the way behind it.
      expect(Math.cos(sofa.rotation)).toBeCloseTo(-1, 6);
      const back = sofa.position.z + sofa.size.depth / 2;
      expect(5 - back).toBeGreaterThanOrEqual(SOFA_OPEN_LINE_WAY_M[1] - 0.01);
      // Nothing laid after it stands in that way.
      for (const piece of items.filter((i) => i.elevationM < 0.05 && i.slot !== 'rug' && i.id !== sofa.id)) {
        const front = piece.position.z - piece.size.depth / 2;
        const across = Math.abs(piece.position.x - sofa.position.x) < (piece.size.width + sofa.size.width) / 2;
        if (across) expect(front < back - 0.01 || piece.position.z < sofa.position.z, `${piece.kind} behind the sofa`).toBe(true);
      }
    }
  });

  it('stood its TV unit on the separator\'s line before', () => {
    // Every wall but the sofa's is open: what it faced was the line, and the unit stood on it.
    const through = room(rect(3.4, 3.48), [], [1, 2, 3]);
    for (const rng of SEEDS) {
      const items = layoutRoom(through, { rng });
      const screen = of(items, 'tv_unit')[0] ?? of(items, 'tv')[0];
      expect(screen).toBeDefined();
      expect(onWall(screen, through)).toBe(true);
    }
  });
});

describe('the living room\'s fallbacks, in Nini\'s order (decision 3.3)', () => {
  it('tries them in her order, each on its own before with the ones before it', () => {
    const rungs = loungeRungs('sofa_3seat');
    expect(rungs.map((r) => `${r.sofa} ${r.unitM ?? 'wall'} ${r.side ? 'side' : 'ahead'} ${r.clearM} ${r.console ? 'console' : 'table'}`)).toEqual([
      'own 1.8 ahead 0.6 table',
      'own 1.2 ahead 0.6 table',
      'two 1.8 ahead 0.6 table',
      'two 1.2 ahead 0.6 table',
      'own 1.8 side 0.6 table',
      'two 1.2 side 0.6 table',
      'own 1.8 ahead 0.45 table',
      'two 1.2 side 0.45 table',
      'own wall ahead 0.6 table',
      'two wall side 0.6 table',
      'two 1.2 side 0.45 console',
    ]);
    // A corner sofa's three-seat before the two-seat.
    expect(loungeRungs('sofa_corner').slice(2, 4).map((r) => r.sofa)).toEqual(['three', 'three']);
    expect(TV_UNIT_NARROW_M).toBe(1.2);
    expect(TV_UNIT_CLEAR_MIN_M).toBe(0.45);
  });

  it('stands a 1.2 m unit beside a door where a 1.8 m one does not fit', () => {
    // 4 × 3.4 m: a door in the middle of wall 2, windows over the side walls (no TV under them).
    const r = room(rect(4, 3.4), [door(2, 0.5), window(1, 0.5, 2.4), window(3, 0.5, 2.4)]);
    const items = layoutRoom(r);
    const [unit] = of(items, 'tv_unit');
    expect(unit.size.width).toBeCloseTo(TV_UNIT_NARROW_M, 6);
    expect(onWall(unit, r)).toBe(true);
    expect(of(items, 'tv')).toHaveLength(1);
  });

  it('hangs the TV on the wall with no unit where no unit has its floor', () => {
    // 4.5 × 2.7 m: across the room 1.3 m before the coffee table, under the 1.35 m a unit needs even
    // 45 cm off it; windows over the side walls.
    const r = room(rect(4.5, 2.7), [window(1, 0.5, 2.2), window(3, 0.5, 2.2)]);
    const items = layoutRoom(r);
    expect(of(items, 'tv_unit')).toHaveLength(0);
    const [tv] = of(items, 'tv');
    expect(tv).toBeDefined();
    expect(onWall(tv, r)).toBe(true);
    expect(tv.elevationM + tv.size.height / 2).toBeCloseTo(TV_CENTRE_M, 6);
    // Straight ahead of the sofa, and the coffee table kept.
    expect(tv.position.x).toBeCloseTo(of(items, 'sofa')[0].position.x, 6);
    expect(of(items, 'coffee_table')).toHaveLength(1);
    // The sofa–TV check measures to the TV on the wall where there is no unit: 2.2 m, too near.
    const plan = { rooms: [r], metresPerPixel: null, bounds: { width: 4.5, depth: 2.7 }, source: 'manual' as const, wallThicknessM: 0.12 };
    expect(ruleViolations(plan, items).filter((v) => v.code === 'sofa_tv_distance')).toHaveLength(1);
  });

  it('stands a console table behind the sofa where no coffee table of any size fits before it', () => {
    // 5 × 4.2 m, a column across the floor in front of the near wall where the coffee table would stand.
    const r = room(rect(5, 4.2), [window(1, 0.5, 3.4), window(3, 0.5, 3.4), window(2, 0.5, 4.2)]);
    const items = layoutRoom(r, { obstacles: { l: [{ minX: 0.5, maxX: 4.5, minZ: 1.4, maxZ: 1.95 }] } });
    const [sofa] = of(items, 'sofa');
    const [console] = of(items, 'console');
    expect(of(items, 'coffee_table')).toHaveLength(0);
    expect(console).toBeDefined();
    // Behind the sofa, against its back, its own back on the wall.
    const forward = { x: Math.sin(sofa.rotation), z: Math.cos(sofa.rotation) };
    const gap = (sofa.position.x - console.position.x) * forward.x + (sofa.position.z - console.position.z) * forward.z - (sofa.size.depth + console.size.depth) / 2;
    expect(gap).toBeGreaterThan(-0.01);
    expect(gap).toBeLessThan(0.05);
    expect(onWall(console, r)).toBe(true);
    expect(onWall(of(items, 'tv_unit')[0], r)).toBe(true);
  });
});
