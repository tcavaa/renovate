import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { suggestTechnical } from '@/lib/design/autoTechnical';
import { sectionSpans } from '@/lib/design/decor/joinery';
import { fitHall, housedBoilerSpot } from '@/lib/design/hall';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import { seededRng } from '@/lib/design/random';
import { footprintQuad, quadsOverlap } from '@/lib/design/rules';
import type { FloorPlan, Opening, PlacedItem, PlanRoom } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

function room(id: string, type: RoomType, w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })) });
}
const door = (wallIndex: number, t = 0.5, exterior = false): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM: 0.9, heightM: 2.05, sillM: 0, exterior });
const window = (wallIndex: number, t = 0.5): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'window', wallIndex, t, widthM: 1.2, heightM: 1.4, sillM: 0.9, exterior: true });
const plan = (...rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12 });
const material = { id: 50, nameKa: 'MDF', nameEn: 'MDF', slug: 'mdf', categorySlug: 'kitchen-custom', unit: 'm2', pricePerUnit: 600, model3dKind: 'kitchen_run', model3dUrl: null, styleTags: ['modern'] } as unknown as CatalogProduct;

describe('the entrance hall', () => {
  // A hall 3.6 × 1.8 m, the front door in its short wall.
  const hall = room('h', 'hallway', 3.6, 1.8, [door(3, 0.5, true), door(1, 0.5)]);

  it('builds one wardrobe to the ceiling by the front door — the boiler\'s cupboard, the coats, the shoes — in place of the coat rack and shoe cabinet', () => {
    const items = layoutRoom(hall, {}).map((i) => ({ ...i, product: null }));
    expect(items.some((i) => i.slot === 'coat_rack' || i.slot === 'shoe_cabinet')).toBe(true);
    const { items: out, decor } = fitHall({ rooms: [hall], items, catalog: [material], styleId: 'modern' });
    const wardrobe = decor.find((d) => d.family === 'cabinet');
    expect(wardrobe).toBeDefined();
    const kinds = sectionSpans(wardrobe!).map((s) => s.section.kind);
    expect(kinds).toEqual(expect.arrayContaining(['boiler', 'coats', 'shoes']));
    expect(wardrobe!.height.to).toBeCloseTo(2.7, 3);
    expect(wardrobe!.materials.face?.product?.productId).toBe(50);
    expect(out.some((i) => i.slot === 'coat_rack' || i.slot === 'shoe_cabinet')).toBe(false);
    // The boiler hangs in its section, with no cabinet of its own.
    const spot = housedBoilerSpot([hall], decor)!;
    expect(spot.room.id).toBe('h');
    let n = 0;
    const boiler = suggestTechnical(plan(hall), out, () => `t${n++}`, decor).points.find((p) => p.kind === 'boiler')!;
    expect(boiler.position).toEqual(spot.position);
    expect(boiler.cabinet).toBeNull();
  });

  it('keeps the coat rack in a hall too narrow for a wardrobe', () => {
    const narrow = room('n', 'hallway', 3.6, 1.1, [door(3, 0.5, true)]);
    const items = layoutRoom(narrow, {});
    const { decor, items: out } = fitHall({ rooms: [narrow], items, catalog: [material], styleId: 'modern' });
    expect(decor).toHaveLength(0);
    expect(out).toEqual(items);
  });

  it('lays a door mat inside the front door, and nowhere else', () => {
    const mat = layoutRoom(hall, {}).find((i) => i.slot === 'door_mat');
    expect(mat).toBeDefined();
    expect(mat!.position.x).toBeLessThan(0.5);
    expect(layoutRoom(room('x', 'hallway', 3, 1.6, [door(3, 0.5)]), {}).some((i) => i.slot === 'door_mat')).toBe(false);
  });
});

describe('the hall\'s mirror', () => {
  const furniture = (id: number, kind: string, w: number, d: number, h: number): CatalogProduct =>
    ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: kind, pricePerUnit: 500, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/p${id}.glb`, widthCm: w, depthCm: d, heightCm: h, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null }) as CatalogProduct;
  const consoleTable = furniture(60, 'console_table', 100, 35, 80);
  /** As tall as a person, flat on the wall: the hall's full-height mirror (E-8). */
  const fullHeight = furniture(61, 'mirror', 70, 10, 180);
  const wallMirror = furniture(62, 'mirror', 60, 3, 80);
  const plainHall = room('p', 'hallway', 4, 1.8);
  // As the engine lays them: the console against the north wall, the mirror's slot over it.
  const consoleSlot: PlacedItem = { id: 'console', roomId: 'p', kind: 'console_table', slot: 'console', position: { x: 2, z: 0.175 }, rotation: 0, elevationM: 0, size: { width: 1, depth: 0.35, height: 0.8 }, product: null };
  const mirrorSlot: PlacedItem = { id: 'mirror', roomId: 'p', kind: 'mirror', slot: 'mirror', position: { x: 2, z: 0.035 }, rotation: 0, elevationM: 1, size: { width: 0.7, depth: 0.05, height: 1.1 }, product: null };
  const intoWhatStandsBelow = (mirror: PlacedItem, items: PlacedItem[]) =>
    items.some((p) => p.id !== mirror.id && p.roomId === mirror.roomId && p.elevationM < 0.05 && p.size.height > mirror.elevationM + 0.005 && quadsOverlap(footprintQuad({ ...mirror, size: { ...mirror.size, depth: Math.max(mirror.size.depth, 0.05) } }), footprintQuad(p)));

  it('over the console is one that hangs clear of it, under the ceiling — not the full-height one behind it', () => {
    for (const seed of [undefined, 1, 2, 3]) {
      const matched = matchProducts([consoleSlot, mirrorSlot], [consoleTable, fullHeight, wallMirror], { styleId: 'modern', rooms: [plainHall], ...(seed == null ? {} : { rng: seededRng(seed) }) });
      const mirror = matched.find((i) => i.slot === 'mirror')!;
      expect(mirror.product?.productId).toBe(62);
      expect(mirror.elevationM).toBeGreaterThanOrEqual(0.8 + 0.12 - 1e-9);
      expect(mirror.elevationM + mirror.size.height).toBeLessThanOrEqual(2.7);
      expect(intoWhatStandsBelow(mirror, matched)).toBe(false);
    }
  });

  it('on a wall free from the floor up is the full-height one', () => {
    const [mirror] = matchProducts([mirrorSlot], [consoleTable, fullHeight, wallMirror], { styleId: 'modern', rooms: [plainHall] });
    expect(mirror.product?.productId).toBe(61);
    expect(mirror.elevationM).toBeCloseTo(0.3);
  });

  it('is kept where the catalogue has none that fits over the console', () => {
    const matched = matchProducts([consoleSlot, mirrorSlot], [consoleTable, fullHeight], { styleId: 'modern', rooms: [plainHall] });
    expect(matched.find((i) => i.slot === 'mirror')!.product?.productId).toBe(61);
  });

  it('across from the built wardrobe is the full-height one, on a stretch of wall free from the floor up', () => {
    // A hall 5 × 1.8 m, the front door in its west wall; the console and the mirror over it at
    // the far end of the south wall, which leaves the wardrobe a long wall and the mirror a
    // stretch of the wall across from it.
    const hall = room('h', 'hallway', 5, 1.8, [door(3, 0.5, true), door(1, 0.5)]);
    const catalog = [material, consoleTable, fullHeight, wallMirror];
    const south = { roomId: 'h', rotation: Math.PI };
    const laid = [{ ...consoleSlot, ...south, position: { x: 4, z: 1.8 - 0.175 } }, { ...mirrorSlot, ...south, position: { x: 4, z: 1.8 - 0.035 } }];
    const matched = matchProducts(laid, catalog, { styleId: 'modern', rooms: [hall] });
    const before = matched.find((i) => i.slot === 'mirror')!;
    // Laid over the console, it is the one that fits over it.
    expect(before.product?.productId).toBe(62);
    const { items, decor } = fitHall({ rooms: [hall], items: matched, catalog, styleId: 'modern' });
    expect(decor.some((d) => d.id === 'decor-h-hall-wardrobe')).toBe(true);
    const mirror = items.find((i) => i.slot === 'mirror')!;
    // Moved across from the wardrobe: the full-height mirror, its top at door height, nothing under it.
    expect(mirror.position).not.toEqual(before.position);
    expect(mirror.product?.productId).toBe(61);
    expect(mirror.size).toEqual({ width: 0.7, depth: 0.1, height: 1.8 });
    expect(mirror.elevationM + mirror.size.height).toBeCloseTo(2.0);
    expect(intoWhatStandsBelow(mirror, items)).toBe(false);
    // With no full-height mirror to hang there, the one it has, at eye level.
    const plain = fitHall({ rooms: [hall], items: matched, catalog: [material, consoleTable, wallMirror], styleId: 'modern' }).items.find((i) => i.slot === 'mirror')!;
    expect(plain.product?.productId).toBe(62);
    expect(plain.elevationM + plain.size.height / 2).toBeCloseTo(1.5);
  });
});

describe('the living room', () => {
  it('dresses every window, not one a room', () => {
    const living = room('l', 'living_room', 6, 4, [window(0, 0.25), window(0, 0.75), door(2, 0.5)]);
    for (const styleId of ['scandinavian', 'modern'] as const) {
      const dressed = layoutRoom(living, { styleId }).filter((i) => i.slot === 'curtain');
      expect(dressed, styleId).toHaveLength(2);
    }
  });

  it('keeps the floor between the sofa and the TV off the way between the doors', () => {
    // Doors on both long walls, near the same end: the way through runs across that end.
    const living = room('p', 'living_room', 6, 4.6, [door(0, 0.2), door(2, 0.8)]);
    const items = layoutRoom(living, {});
    const sofa = items.find((i) => i.slot === 'sofa');
    const tv = items.find((i) => i.slot === 'tv_unit');
    if (!sofa || !tv) return;
    const edges = roomEdges(living.polygon);
    const doors = living.openings.map((o) => {
      const e = edges.find((x) => x.index === o.wallIndex)!;
      return { x: e.a.x + (e.b.x - e.a.x) * o.t, z: e.a.z + (e.b.z - e.a.z) * o.t };
    });
    const path = footprintQuad({ position: { x: (doors[0].x + doors[1].x) / 2, z: (doors[0].z + doors[1].z) / 2 }, rotation: Math.atan2(doors[1].x - doors[0].x, doors[1].z - doors[0].z), size: { width: 0.4, depth: Math.hypot(doors[1].x - doors[0].x, doors[1].z - doors[0].z), height: 1 } });
    const between = footprintQuad({ position: { x: (sofa.position.x + tv.position.x) / 2, z: (sofa.position.z + tv.position.z) / 2 }, rotation: sofa.rotation, size: { width: sofa.size.width * 0.6, depth: Math.max(0.1, Math.hypot(tv.position.x - sofa.position.x, tv.position.z - sofa.position.z) - 1.2), height: 1 } });
    expect(quadsOverlap(path, between)).toBe(false);
    void (null as unknown as PlacedItem);
  });
});
