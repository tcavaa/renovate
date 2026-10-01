import { describe, expect, it } from 'vitest';
import { hangingLampsKey, lightsFrom, nightLights } from '@/lib/design3d/buildStructure';
import { placeElectrical } from '@/lib/design/electrical';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';

/**
 * The flat's lights after dusk (`nightLights`, gotcha 25 in docs/design-studio/3d-engine.md):
 * one point light per room that has lights of its own, its switched-on fittings merged, so a
 * switch changes an intensity and never the number of lights three compiles into every shader.
 */

const P = (x: number, z: number): Vec2 => ({ x, z });
const rect = (id: string, x: number, z: number, w: number, d: number, type: PlanRoom['type']): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [P(x, z), P(x + w, z), P(x + w, z + d), P(x, z + d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });

function plan(): FloorPlan {
  const rooms = [rect('bed', 0, 0, 4, 3.5, 'bedroom'), rect('living', 0, 3.62, 5, 5, 'living_room'), rect('kitchen', 5.12, 3.62, 3.6, 3, 'kitchen'), rect('store', 5.12, 0, 2, 3.5, 'storage')];
  return { rooms, metresPerPixel: null, bounds: { width: 8.7, depth: 8.6 }, source: 'manual', wallThicknessM: 0.12 };
}

function points(): ElectricalPoint[] {
  const [bed, living, kitchen, store] = plan().rooms;
  return [
    placeElectrical(bed, 'light_ceiling', P(2, 1.75), 'bed-ceiling'),
    placeElectrical(bed, 'light_wall', P(0.6, 0.02), 'bed-left'),
    placeElectrical(bed, 'light_wall', P(3.4, 0.02), 'bed-right'),
    placeElectrical(living, 'light_ceiling', P(2.5, 6.1), 'living-ceiling'),
    placeElectrical(kitchen, 'light_furniture', P(6.9, 3.7), 'kitchen-strip'),
    placeElectrical(kitchen, 'socket', P(5.2, 4), 'kitchen-socket'),
    placeElectrical(store, 'socket', P(6, 0.02), 'store-socket'),
  ];
}

const switched = (all: ElectricalPoint[], ids: string[], on: boolean) => all.map((p) => (ids.includes(p.id) ? { ...p, on } : p));

describe('the lights after dusk', () => {
  it('lights each room that has lights from one point light, its fittings merged', () => {
    const lights = nightLights(plan(), points());
    // The store room has a socket and no light: it gets none.
    expect(lights.map((l) => l.id)).toEqual(['bed', 'living', 'kitchen']);
    expect(lights.every((l) => !l.standIn)).toBe(true);

    const fittings = lightsFrom(plan(), points()).filter((l) => l.id.startsWith('bed-'));
    expect(fittings).toHaveLength(3);
    const bedroom = lights[0];
    // As bright as the three together, centred where their light is (the ceiling light outweighs the bedside lamps)…
    expect(bedroom.intensity).toBeCloseTo(fittings.reduce((s, l) => s + l.intensity, 0), 6);
    const ceiling = fittings.find((l) => l.id === 'bed-ceiling')!;
    expect(Math.hypot(bedroom.position[0] - ceiling.position[0], bedroom.position[2] - ceiling.position[2])).toBeLessThan(1);
    expect(bedroom.position[2]).toBeLessThan(ceiling.position[2]);
    // …and reaching at least as far as each of them did.
    for (const light of fittings) {
      const gap = Math.hypot(light.position[0] - bedroom.position[0], light.position[1] - bedroom.position[1], light.position[2] - bedroom.position[2]);
      expect(bedroom.distance).toBeGreaterThanOrEqual(light.distance + gap - 1e-9);
    }
  });

  it('changes an intensity at a switch, never the number of lights', () => {
    const all = points();
    const before = nightLights(plan(), all);
    const oneOff = nightLights(plan(), switched(all, ['bed-left'], false));
    expect(oneOff.map((l) => l.id)).toEqual(before.map((l) => l.id));
    expect(oneOff[0].intensity).toBeLessThan(before[0].intensity);

    // The bedroom's every light off: its light stays, at zero.
    const dark = nightLights(plan(), switched(all, ['bed-ceiling', 'bed-left', 'bed-right'], false));
    expect(dark.map((l) => l.id)).toEqual(before.map((l) => l.id));
    expect(dark[0].intensity).toBe(0);
    expect(dark[1].intensity).toBe(before[1].intensity);
  });

  it('lends every room in view a lamp under its ceiling when no light is on anywhere', () => {
    const all = points();
    const lights = nightLights(plan(), switched(all, ['bed-ceiling', 'bed-left', 'bed-right', 'living-ceiling', 'kitchen-strip'], false));
    expect(lights.map((l) => l.id)).toEqual(['bed', 'living', 'kitchen', 'store']);
    expect(lights.every((l) => l.standIn)).toBe(true);
    const living = plan().rooms[1];
    expect(lights[1].intensity).toBeCloseTo(6 + living.areaM2 * 0.9, 6);
    expect(lights[1].position).toEqual([2.5, 2.7 - 0.35, 3.62 + 2.5]);
    // A flat with no fittings at all is lit the same way.
    expect(nightLights(plan(), []).map((l) => l.id)).toEqual(['bed', 'living', 'kitchen', 'store']);
  });

  it('lights only the room in focus', () => {
    expect(nightLights(plan(), points(), new Set(['living'])).map((l) => l.id)).toEqual(['living']);
    expect(nightLights(plan(), points(), new Set(['store'])).map((l) => l.id)).toEqual(['store']);
  });
});

describe('the hanging lamps the fittings read', () => {
  const item = (id: string, slot: PlacedItem['slot'], x: number, z: number, roomId = 'living'): PlacedItem => ({ id, roomId, slot, kind: slot, position: P(x, z), elevationM: 0, rotation: 0, size: { width: 1, depth: 1, height: 1 }, product: null });
  const furniture = [item('sofa', 'sofa', 1, 5), item('pendant', 'pendant', 2.5, 6.1), item('table', 'dining_table', 3, 7)];

  it('do not change when the rest of the furniture moves', () => {
    const key = hangingLampsKey(furniture);
    expect(JSON.parse(key)).toEqual([{ roomId: 'living', x: 2.5, z: 6.1 }]);
    const sofaMoved = furniture.map((i) => (i.id === 'sofa' ? { ...i, position: P(1.4, 5.2), rotation: 1 } : i));
    expect(hangingLampsKey(sofaMoved)).toBe(key);
  });

  it('change when a hanging lamp moves, comes or goes', () => {
    const key = hangingLampsKey(furniture);
    expect(hangingLampsKey(furniture.map((i) => (i.id === 'pendant' ? { ...i, position: P(2.6, 6.1) } : i)))).not.toBe(key);
    expect(hangingLampsKey([...furniture, item('pendant-2', 'pendant', 1, 1, 'bed')])).not.toBe(key);
    expect(hangingLampsKey(furniture.filter((i) => i.slot !== 'pendant'))).toBe('[]');
  });
});
