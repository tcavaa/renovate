import { describe, expect, it } from 'vitest';
import { hallLightSpots, suggestElectrical } from '@/lib/design/electrical';
import { lightingPlan } from '@/lib/design/lightingPlan';
import { pdfOfImages } from '@/lib/design/planPdfExport';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { FloorPlan, PlacedItem, PlanRoom } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

function room(id: string, type: RoomType, w: number, d: number, x = 0): PlanRoom {
  return refreshRoom({ id, type, name: id, polygon: [{ x, z: 0 }, { x: x + w, z: 0 }, { x: x + w, z: d }, { x, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
}
const plan = (...rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12 });
const piece = (id: string, roomId: string, slot: string, x: number, z: number, rotation: number, width: number, depth: number, height = 0.9, elevationM = 0): PlacedItem => ({ id, roomId, slot: slot as PlacedItem['slot'], kind: slot, position: { x, z }, rotation, elevationM, size: { width, depth, height }, product: null });

describe('the owner\'s lighting rules', () => {
  it('lights a hallway every 3 m or nearer, evenly down its middle', () => {
    expect(hallLightSpots(room('h', 'hallway', 1.4, 2.5))).toHaveLength(1);
    const long = hallLightSpots(room('h', 'hallway', 7, 1.4));
    expect(long).toHaveLength(3);
    for (const spot of long) expect(spot.z).toBeCloseTo(0.7, 3);
    expect(long[1].x - long[0].x).toBeCloseTo(7 / 3, 3);
    const points = suggestElectrical(plan(room('h', 'hallway', 7, 1.4)), []);
    expect(points.filter((p) => p.kind === 'light_ceiling')).toHaveLength(3);
  });

  it('gives a kitchen spots over its working floor instead of the one ceiling light, apart from the table\'s pendant', () => {
    const kitchen = room('k', 'kitchen', 4, 3);
    const run = piece('run', 'k', 'kitchen_run', 1.5, 0.33, 0, 3, 0.62);
    const points = suggestElectrical(plan(kitchen), [run]);
    expect(points.some((p) => p.kind === 'light_ceiling')).toBe(false);
    const spots = points.filter((p) => p.kind === 'light_spot');
    expect(spots.length).toBeGreaterThanOrEqual(3);
    for (const spot of spots) expect(spot.position.z).toBeLessThan(1.2);
    expect(points.some((p) => p.kind === 'light_furniture')).toBe(true);
  });

  it('gives an industrial bedroom a track of cylinder spots for its main light', () => {
    const bedroom = room('b', 'bedroom', 3.6, 3.4);
    const bed = piece('bed', 'b', 'bed', 1.8, 1.05, 0, 1.6, 2.05, 0.5);
    const industrial = suggestElectrical(plan(bedroom), [bed], [], 'industrial');
    expect(industrial.some((p) => p.kind === 'light_ceiling')).toBe(false);
    expect(industrial.filter((p) => p.kind === 'light_spot')).toHaveLength(3);
    const scandinavian = suggestElectrical(plan(bedroom), [bed], [], 'scandinavian');
    expect(scandinavian.filter((p) => p.kind === 'light_ceiling')).toHaveLength(1);
  });
});

describe('the lighting plan', () => {
  it('lists every room\'s fittings — what, what for, where and how high — counting the alike together', () => {
    const kitchen = room('k', 'kitchen', 4, 3);
    const run = piece('run', 'k', 'kitchen_run', 1.5, 0.33, 0, 3, 0.62);
    const table = piece('t', 'k', 'dining_table', 2.6, 2.2, 0, 1.4, 0.8, 0.75);
    const pendant = piece('p', 'k', 'pendant', 2.6, 2.2, 0, 0.4, 0.4, 0.5, 1.9);
    const electrical = suggestElectrical(plan(kitchen), [run]);
    const rooms = lightingPlan(plan(kitchen), [run, table, pendant], electrical);
    expect(rooms).toHaveLength(1);
    const rows = rooms[0].rows;
    const spots = rows.find((r) => r.fixture === 'light_spot')!;
    expect(spots.count).toBeGreaterThanOrEqual(3);
    expect(spots.mount).toBe('ceiling');
    expect(spots.heightM).toBeCloseTo(2.7, 2);
    expect(rows.find((r) => r.fixture === 'pendant')).toMatchObject({ purpose: 'furniture', mount: 'hanging', heightM: 1.9 });
    expect(rows.find((r) => r.fixture === 'light_furniture')?.mount).toBe('wall');
  });
});

describe('the PDF writer', () => {
  it('writes a page per image', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await pdfOfImages([
      { jpeg, pxW: 10, pxH: 10, pageW: 595.28, pageH: 841.89 },
      { jpeg, pxW: 10, pxH: 10, pageW: 595.28, pageH: 841.89 },
    ]).arrayBuffer()));
    expect(text).toContain('/Count 2');
    expect(text).toContain('/Kids [3 0 R 6 0 R]');
    expect(text.match(/\/Type \/Page /g)).toHaveLength(2);
  });
});
