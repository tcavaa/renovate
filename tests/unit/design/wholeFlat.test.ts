import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { decorFaceAt } from '@/lib/design/decor/layout';
import { ringSpots, suggestElectrical } from '@/lib/design/electrical';
import type { CatalogProduct } from '@/lib/design/matcher';
import { isGlassDoor, openingCandidates } from '@/lib/design/openings';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { DecorPiece, FloorPlan, PlanRoom } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

function room(id: string, type: RoomType, w: number, d: number): PlanRoom {
  return refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
}
const plan = (...rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12 });
const door = (id: number, kind: string, nameEn: string): CatalogProduct => ({ id, nameKa: nameEn, nameEn, slug: `d${id}`, model3dKind: kind, model3dUrl: `/m/${id}.glb`, styleTags: ['modern'], pricePerUnit: 100 + id, unit: 'piece' }) as unknown as CatalogProduct;

describe('doors in their places', () => {
  const catalog = [door(1, 'door', 'Glazed oak interior door'), door(2, 'door', 'Solid white interior door'), door(3, 'entrance_door', 'Steel front door')];
  it('never gives an interior door the front door, nor a bedroom or a bathroom a glass one', () => {
    const interior = { kind: 'door' as const, exterior: false };
    expect(openingCandidates(interior, catalog, 'modern', ['hallway', 'living_room']).map((p) => p.id)).toEqual([1, 2]);
    expect(openingCandidates(interior, catalog, 'modern', ['hallway', 'bathroom']).map((p) => p.id)).toEqual([2]);
    expect(openingCandidates({ kind: 'door', exterior: true }, catalog, 'modern', ['hallway']).map((p) => p.id)).toEqual([3]);
    // The person's swap list still has every door.
    expect(openingCandidates(interior, catalog, 'modern')).toHaveLength(3);
    expect(isGlassDoor({ nameEn: 'Glass sliding door' })).toBe(true);
  });
});

describe('the main light by style', () => {
  it('rings the main light of a Scandinavian, Modern or Vintage room with four spots; an Industrial one not', () => {
    const living = room('l', 'living_room', 5, 4);
    expect(ringSpots(living)).toHaveLength(4);
    const scandi = suggestElectrical(plan(living), [], [], 'scandinavian');
    expect(scandi.filter((p) => p.kind === 'light_ceiling')).toHaveLength(1);
    expect(scandi.filter((p) => p.kind === 'light_spot')).toHaveLength(4);
    expect(suggestElectrical(plan(living), [], [], 'industrial').filter((p) => p.kind === 'light_spot')).toHaveLength(0);
  });

  it('lights a hall only with its row of ceiling lights, no pendant besides', () => {
    expect(layoutRoom(room('h', 'hallway', 6, 1.6), {}).some((i) => i.slot === 'pendant')).toBe(false);
  });
});

describe('fittings on decor', () => {
  it('sets a socket on the face of the slats it is under, and on the bare wall elsewhere', () => {
    const slats: DecorPiece = { id: 's', roomId: 'r', family: 'slats', wallIndex: 0, span: { from: 1, to: 3 }, height: { from: 0, to: 2.6 }, params: { depthMm: 22 }, materials: {} };
    expect(decorFaceAt([slats], 'r', 0, 2, 0.45)).toBeGreaterThan(0.03);
    expect(decorFaceAt([slats], 'r', 0, 3.5, 0.45)).toBe(0);
    expect(decorFaceAt([slats], 'r', 1, 2, 0.45)).toBe(0);
  });
});
