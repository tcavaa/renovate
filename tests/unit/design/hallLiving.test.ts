import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { suggestTechnical } from '@/lib/design/autoTechnical';
import { sectionSpans } from '@/lib/design/decor/joinery';
import { fitHall, housedBoilerSpot } from '@/lib/design/hall';
import type { CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
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
