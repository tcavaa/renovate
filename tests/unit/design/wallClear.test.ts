import { describe, expect, it } from 'vitest';
import { suggestTechnical } from '@/lib/design/autoTechnical';
import { standardElectrical } from '@/lib/design/electrical';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import { radiatorBody, suggestRadiators, withRadiatorProducts } from '@/lib/design/radiators';
import type { CatalogProduct } from '@/lib/design/matcher';
import { clearOf, nearestClear, wallBlocks } from '@/lib/design/wallClear';
import { freeStretch } from '@/lib/design/decor/joinery';
import type { DecorPiece, FloorPlan, Opening, PlacedItem, PlanRoom, TechnicalPoint, Vec2 } from '@/lib/design/types';

/**
 * Placing the technical points automatically in a furnished flat reads the furniture and the decor
 * first (`lib/design/wallClear`, the owner's notes of 13 Nov 2026): no towel rail through a vanity,
 * no radiator behind a bed, no air conditioner on a wall of wardrobe, no socket behind joinery.
 */

const P = (x: number, z: number): Vec2 => ({ x, z });
function room(id: string, type: PlanRoom['type'], w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({ id, type, name: id, polygon: [P(0, 0), P(w, 0), P(w, d), P(0, d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })) });
}
const plan = (...rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12 });
const door = (wallIndex: number, t: number): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM: 0.8, heightM: 2.05, sillM: 0, exterior: false });
const window = (wallIndex: number, t: number): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'window', wallIndex, t, widthM: 1.4, heightM: 1.4, sillM: 0.9, exterior: true });
const item = (roomId: string, slot: PlacedItem['slot'], x: number, z: number, size: PlacedItem['size'], rotation = 0, elevationM = 0): PlacedItem => ({ id: `${roomId}-${slot}`, roomId, slot, kind: slot, position: P(x, z), rotation, elevationM, size, product: null });
const cabinet = (roomId: string, wallIndex: number, from: number, to: number, heightM: number, depthMm = 600): DecorPiece => ({ id: `c-${roomId}-${wallIndex}`, roomId, family: 'cabinet', wallIndex, span: { from, to }, height: { from: 0, to: heightM }, params: { sections: [{ kind: 'doors', widthMm: Math.round((to - from) * 1000), heightMm: Math.round(heightM * 1000), depthMm }] }, materials: {} });
const alongWall = (r: PlanRoom, wallIndex: number, p: Vec2) => {
  const edge = roomEdges(r.polygon)[wallIndex];
  return (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z;
};
const wallOf = (r: PlanRoom, p: Vec2) => roomEdges(r.polygon).map((e) => ({ index: e.index, off: Math.abs((p.x - e.a.x) * e.inward.x + (p.z - e.a.z) * e.inward.z) })).sort((a, b) => a.off - b.off)[0].index;
const ids = () => {
  let n = 0;
  return () => `t${n++}`;
};

describe('what stands in front of a wall', () => {
  const r = room('r', 'bedroom', 4, 3);
  const edge = roomEdges(r.polygon)[0];

  it('is the furniture within reach of it, the joinery on it and round its corners, and flat decor on it', () => {
    const bed = item('r', 'bed', 1.5, 1.05, { width: 1.6, depth: 2, height: 0.9 });
    const far = item('r', 'sofa', 2, 2.4, { width: 2, depth: 0.9, height: 0.8 }, Math.PI);
    const rug = item('r', 'rug', 2, 1, { width: 2, depth: 1.4, height: 0.01 });
    const side = cabinet('r', 1, 0, 1.2, 2.7);
    const slats: DecorPiece = { ...cabinet('r', 0, 3, 3.3, 2), id: 'slats', family: 'slats', params: {}, height: { from: 0.4, to: 2 } };
    const blocks = wallBlocks(r, edge, [bed, far, rug], [side, slats]);
    expect(blocks).toEqual([
      { from: 0.7, to: 2.3, bottom: 0, top: 0.9 },
      // The wardrobe on the next wall stands 60 cm deep in this wall's corner.
      { from: 3.4, to: 4, bottom: 0, top: 2.7, built: true },
      { from: 3, to: 3.3, bottom: 0.4, top: 2, flat: true },
    ]);
    // A radiator's band (12–72 cm): clear between the bed and the slats, not on them.
    expect(clearOf([[0, 4]], blocks, { bottom: 0.12, top: 0.72 })).toEqual([[0, 0.65], [2.35, 2.95]]);
    // A socket may sit on the slats' face.
    expect(clearOf([[0, 4]], blocks, { bottom: 0.2, top: 0.4 }, false)).toEqual([[0, 0.65], [2.35, 3.35]]);
    expect(nearestClear([[0, 0.65], [2.35, 2.95]], 2, 0.5)).toBeCloseTo(2.6, 3);
    expect(nearestClear([[0, 0.3]], 2, 0.5)).toBeNull();
  });

  it('is read the same by the joinery: a rug lies under it, a shower is its tray, a mirror hangs over joinery but is in a fitting’s way', () => {
    const bath = room('b', 'bathroom', 3, 2.5);
    const wall = roomEdges(bath.polygon)[0];
    // A shower column 25 cm wide in a 90 × 90 tray, 0.6–1.5 m along the wall.
    const shower: PlacedItem = { ...item('b', 'shower', 1.05, 0.075, { width: 0.25, depth: 0.15, height: 2.1 }), areaM: { width: 0.9, depth: 0.9 } };
    const rug = item('b', 'rug', 2.3, 0.5, { width: 1, depth: 0.6, height: 0.01 });
    const mirror = item('b', 'mirror', 2.3, 0.02, { width: 0.6, depth: 0.03, height: 0.8 }, 0, 1.3);
    const round = (n: number) => Math.round(n * 1000) / 1000;
    expect(wallBlocks(bath, wall, [shower, rug, mirror]).map((b) => [round(b.from), round(b.to)])).toEqual([[0.6, 1.5], [2, 2.6]]);
    // The joinery stops at the tray, not the column, and runs under the mirror and over the rug.
    expect(freeStretch(bath, wall, 2.3, [shower, rug, mirror], [], 0.5)?.map(round)).toEqual([1.5, 3]);
  });
});

describe('a bathroom’s towel rail', () => {
  // 2.6 × 2 m, the door in the far wall: the south wall (2.6 m) is the longest clear one.
  const bath = room('b', 'bathroom', 2.6, 2, [door(2, 0.5)]);

  it('hangs in the middle of the longest clear wall of an empty room, and beside the vanity — not through it — in a furnished one', () => {
    const [bare] = suggestRadiators(plan(bath), ids());
    expect(bare.towelRail).toBe(true);
    expect(wallOf(bath, bare.position)).toBe(0);
    expect(alongWall(bath, 0, bare.position)).toBeCloseTo(1.3, 2);
    // A vanity 0.2–2 m along that wall, and a mirror over it.
    const vanity = cabinet('b', 0, 0.2, 2, 0.8, 500);
    const mirror = item('b', 'mirror', 1.1, 0.02, { width: 0.8, depth: 0.03, height: 0.9 }, 0, 1.1);
    const [rail] = suggestRadiators(plan(bath), ids(), [], [mirror], [vanity]);
    const wall = wallOf(bath, rail.position);
    const s = alongWall(bath, wall, rail.position);
    // The rail is 48 cm wide: nowhere over the vanity.
    expect(wall === 0 && s > 0.2 - 0.24 && s < 2 + 0.24).toBe(false);
  });
});

describe('a room’s radiator', () => {
  const bedroom = room('r', 'bedroom', 4, 3, [window(0, 0.5), door(2, 0.2)]);

  it('hangs under the window of an empty room, and on clear wall when the bed stands under the window', () => {
    const [bare] = suggestRadiators(plan(bedroom), ids());
    expect(alongWall(bedroom, 0, bare.position)).toBeCloseTo(2, 2);
    const bed = item('r', 'bed', 2, 1.05, { width: 1.8, depth: 2, height: 0.9 });
    const [moved] = suggestRadiators(plan(bedroom), ids(), [], [bed]);
    const wall = wallOf(bedroom, moved.position);
    const s = alongWall(bedroom, wall, moved.position);
    expect(wall === 0 && s > 1.1 - 0.4 && s < 2.9 + 0.4).toBe(false);
    // A bedside table away from the window leaves the radiator under it.
    const table = item('r', 'nightstand', 3.6, 0.25, { width: 0.5, depth: 0.4, height: 0.5 });
    expect(alongWall(bedroom, 0, suggestRadiators(plan(bedroom), ids(), [], [table])[0].position)).toBeCloseTo(2, 2);
  });
});

describe('a room’s radiators together', () => {
  // 7 × 4.5 m: it wants two radiators, a window for each in the top wall, the door in the far one.
  const living = room('l', 'living_room', 7, 4.5, [window(0, 1.5 / 7), window(0, 5.5 / 7), door(2, 0.5)]);
  /** Two radiators 80 cm long, as they are placed, do not overlap. */
  const apart = (r: PlanRoom, a: Vec2, b: Vec2) => wallOf(r, a) !== wallOf(r, b) || Math.abs(alongWall(r, wallOf(r, a), a) - alongWall(r, wallOf(r, b), b)) >= 0.8;

  it('are never hung on one spot when both move off the furniture under their windows', () => {
    // A sofa 0.3–2.7 m and a long desk 3.9–6.9 m along the window wall: 1.1 m of it is clear, room for one.
    const sofa = item('l', 'sofa', 1.5, 0.45, { width: 2.4, depth: 0.9, height: 0.8 });
    const desk = item('l', 'desk', 5.4, 0.35, { width: 3, depth: 0.7, height: 0.75 });
    const points = suggestRadiators(plan(living), ids(), [], [sofa, desk]);
    expect(points).toHaveLength(2);
    expect(apart(living, points[0].position, points[1].position)).toBe(true);
    // Neither is behind the sofa or the desk: the second went to another wall.
    for (const point of points) {
      const s = alongWall(living, 0, point.position);
      expect(wallOf(living, point.position) === 0 && (s < 2.7 + 0.4 || s > 3.9 - 0.4)).toBe(false);
    }
  });

  it('leave the one whose window is clear under it, and move the other clear of it', () => {
    // A kitchen run 0.05–4.65 m along the window wall: the first window is behind it, the second is clear.
    const run = item('l', 'kitchen_run', 2.35, 0.3, { width: 4.6, depth: 0.6, height: 0.9 });
    const [first, second] = suggestRadiators(plan(living), ids(), [], [run]);
    expect(wallOf(living, second.position)).toBe(0);
    expect(alongWall(living, 0, second.position)).toBeCloseTo(5.5, 2);
    expect(apart(living, first.position, second.position)).toBe(true);
  });

  it('are as they were in an empty room: one under each window', () => {
    const [first, second] = suggestRadiators(plan(living), ids());
    expect(alongWall(living, 0, first.position)).toBeCloseTo(1.5, 2);
    expect(alongWall(living, 0, second.position)).toBeCloseTo(5.5, 2);
  });
});

describe('a radiator and the doors', () => {
  const doors = [door(0, 0.5), door(1, 0.5), door(2, 0.5), door(3, 0.5)];
  /** How much of the radiator, as long as it will be (`radiatorBody`), is across a door of its wall. */
  const acrossADoor = (hall: PlanRoom, point: ReturnType<typeof suggestRadiators>[number]) => {
    const body = radiatorBody({ ...plan(hall), technical: { points: [point] } }, point)!;
    return Math.max(0, ...hall.openings.filter((o) => o.kind === 'door' && o.wallIndex === body.edge.index).map((o) => Math.min(body.to, o.t * body.edge.length + o.widthM / 2) - Math.max(body.from, o.t * body.edge.length - o.widthM / 2)));
  };

  it('is hung beside the door, not across it, in a windowless hall with a door in every wall', () => {
    // 3 × 2 m: the long walls have a metre of wall each side of their door.
    const hall = room('h', 'hallway', 3, 2, doors);
    const [point] = suggestRadiators(plan(hall), ids());
    expect(acrossADoor(hall, point)).toBe(0);
    // Furnished or not.
    const chair = item('h', 'armchair', 0.3, 0.3, { width: 0.4, depth: 0.4, height: 0.45 });
    expect(acrossADoor(hall, suggestRadiators(plan(hall), ids(), [], [chair])[0])).toBe(0);
  });

  it('is hung in the widest wall beside a door where no wall holds a middling radiator', () => {
    // 2.2 × 2 m: 70 cm of wall each side of the long walls' doors — less than the 80 cm a radiator is
    // placed by, more than the four sections this hall needs.
    const hall = room('h', 'hallway', 2.2, 2, doors);
    const [point] = suggestRadiators(plan(hall), ids());
    expect(acrossADoor(hall, point)).toBe(0);
  });

  /** A style's panel radiator: `watts` a section of `sectionCm`. */
  const panel = (id: number, watts: number, sectionCm: number): CatalogProduct =>
    ({ id, nameKa: `r${id}`, slug: `r${id}`, categorySlug: 'radiators', pricePerUnit: 10, unit: 'piece', model3dKind: 'radiator', model3dUrl: `/models/r${id}.glb`, widthCm: sectionCm, depthCm: 10, heightCm: 60, styleTags: ['modern'], specs: { wattsPerSection: watts, sectionWidthCm: sectionCm } }) as unknown as CatalogProduct;
  /** The radiators as they are bought: each with the style's product and its sections. */
  const bought = (r: PlanRoom, points: TechnicalPoint[], catalog: CatalogProduct[]) => {
    const withProducts = withRadiatorProducts({ ...plan(r), technical: { points } }, catalog, 'modern');
    return withProducts.technical!.points;
  };

  it('is hung clear of a door at the length of the style’s radiator, not of a middling one', () => {
    // 5 × 3 m: a window 1–2 m along the top wall, a door 2.2–3 m beside it. The style's radiator is
    // 14 sections of 12 cm (130 W each) — 1.68 m — which, centred under the window, reaches 14 cm
    // across the door; an 80 cm radiator there would not, which is how it was placed with no style.
    const living = room('l', 'living_room', 5, 3, [{ ...window(0, 0.3), widthM: 1 }, { ...door(0, 2.6 / 5), exterior: false }]);
    const catalog = [panel(1, 130, 12)];
    expect(acrossADoor(living, bought(living, suggestRadiators(plan(living), ids(), catalog), catalog)[0])).toBeGreaterThan(0.1);
    const [point] = bought(living, suggestRadiators(plan(living), ids(), catalog, [], [], 'modern'), catalog);
    const body = radiatorBody({ ...plan(living), technical: { points: [point] } }, point)!;
    expect(body.to - body.from).toBeCloseTo(1.68, 2);
    expect(acrossADoor(living, point)).toBe(0);
    // Still under its window.
    expect(body.from).toBeLessThan(2);
    expect(body.to).toBeGreaterThan(1);
  });

  it('counts a room’s radiators by the heat a section of the style’s radiator gives', () => {
    // 5 × 3 m, two windows: 1,867 W. At 170 W a section that is 11 sections, one radiator; at the
    // style's 110 W it is 17 — more than fourteen, so two.
    const living = room('l', 'living_room', 5, 3, [window(0, 0.25), window(0, 0.75)]);
    expect(suggestRadiators(plan(living), ids())).toHaveLength(1);
    expect(suggestRadiators(plan(living), ids(), [panel(1, 110, 8)], [], [], 'modern')).toHaveLength(2);
    expect(suggestRadiators(plan(living), ids(), [panel(1, 180, 8)], [], [], 'modern')).toHaveLength(1);
  });
});

describe('the technical points and the fittings', () => {
  it('puts an air conditioner on a wall clear of a wardrobe to the ceiling', () => {
    // No window: every wall scores by its length. The two long walls are 4 m; one is all wardrobe.
    const bedroom = room('r', 'bedroom', 4, 3, [door(1, 0.5)]);
    const bare = suggestTechnical(plan(bedroom), [], ids()).points.find((p) => p.kind === 'ac_unit')!;
    const bareWall = wallOf(bedroom, bare.position);
    const wardrobe = cabinet('r', bareWall, 0, 4, 2.7);
    const furnished = suggestTechnical(plan(bedroom), [], ids(), [wardrobe]).points.find((p) => p.kind === 'ac_unit')!;
    expect(wallOf(bedroom, furnished.position)).not.toBe(bareWall);
  });

  it('keeps a general socket and a switch off joinery, and leaves a bare room as it was', () => {
    const bedroom = room('r', 'bedroom', 4, 3, [door(2, 0.5)]);
    const bare = standardElectrical(plan(bedroom));
    const socket = bare.find((p) => p.kind === 'socket')!;
    expect(socket.wallIndex).toBe(0);
    expect(socket.t).toBeCloseTo(0.5, 3);
    // A wall of wardrobe 0.5–4 m along the socket's wall.
    const wardrobe = cabinet('r', 0, 0.5, 4, 2.7);
    const furnished = standardElectrical(plan(bedroom), [], [], [wardrobe]);
    const moved = furnished.find((p) => p.kind === 'socket')!;
    const behind = moved.wallIndex === 0 && moved.t! * 4 > 0.45;
    expect(behind).toBe(false);
    // The same number of fittings either way.
    expect(furnished.map((p) => p.kind).sort()).toEqual(bare.map((p) => p.kind).sort());
    // The switch by the door goes to the door's other side when a wardrobe stands on the handle side.
    const sw = bare.find((p) => p.kind === 'switch')!;
    const s = sw.t! * 4;
    const tall = cabinet('r', 2, Math.max(0, s - 0.3), Math.min(4, s + 0.3), 2.7);
    const other = standardElectrical(plan(bedroom), [], [], [tall]).find((p) => p.kind === 'switch')!;
    expect(Math.abs(other.t! * 4 - s)).toBeGreaterThan(0.5);
  });
});
