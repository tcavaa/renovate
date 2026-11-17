import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { getArchetype } from '@/lib/design/catalog';
import { blocksWindow, pieceWall } from '@/lib/design/manipulate';
import { isOpenEdge, roomEdges } from '@/lib/design/planGeometry';
import { seededRng } from '@/lib/design/random';
import { effectiveSplit, lineCoordinate, partRoom, studioParts } from '@/lib/design/studio';
import type { Opening, PlanRoom, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const opening = (id: string, kind: Opening['kind'], wallIndex: number, t: number, widthM: number, extra: Partial<Opening> = {}): Opening => ({
  id,
  kind,
  wallIndex,
  t,
  widthM,
  heightM: kind === 'window' ? 1.4 : 2.05,
  sillM: kind === 'window' ? 0.9 : 0,
  roomId: 'r1',
  exterior: kind === 'window',
  ...extra,
});

// Test project 26's living room and kitchen: a studio (the kitchen a third of it, across the long
// side, the line at z 2.57), a room separator to the hallway on its right (edge 3, in the living
// half), a door and a window on its left wall (7), two windows on the wall the sofa faces (6). The line between the halves got
// six prints hung on it, and the TV hung across a window.
const studio: PlanRoom = {
  id: 'r1',
  name: 'Living Room and Kitchen',
  type: 'studio',
  areaM2: 38.65,
  heightM: 2.8,
  perimeterM: 25.31,
  open: [3],
  polygon: [P(2.211, 0.058), P(7.618, 0.058), P(7.618, 2.968), P(7.753, 2.968), P(7.753, 4.302), P(7.618, 4.302), P(7.618, 7.173), P(2.211, 7.173)],
  openings: [
    opening('r1-o1', 'door', 7, 0.4385, 0.9, { exterior: false, connectsToRoomId: 'r5', hinge: 'right', swing: 'out' }),
    opening('r1-o8', 'window', 7, 0.8595, 1.7),
    opening('r1-o9', 'window', 6, 0.6985, 1.61),
    opening('r1-o10', 'window', 6, 0.2412, 1.59),
  ],
};

const line = lineCoordinate(studio, effectiveSplit(studio));
const onLine = (p: Vec2) => Math.abs(p.z - line) < 1e-3;

describe('a studio half as a room of its own (partRoom)', () => {
  const [kitchen, living] = studioParts(studio)!.map((part) => partRoom(studio, part));

  it('leaves the line between the halves open, and the room separator', () => {
    for (const half of [kitchen, living]) {
      const edges = roomEdges(half.polygon);
      const divider = edges.filter((e) => onLine(e.a) && onLine(e.b));
      expect(divider).toHaveLength(1);
      expect(half.open).toContain(divider[0].index);
    }
    // The separator to the hallway (x 7.753, z 2.97–4.30) is the living half's, at its own index there.
    const separator = roomEdges(living.polygon).filter((e) => Math.abs(e.a.x - 7.753) < 1e-3 && Math.abs(e.b.x - 7.753) < 1e-3);
    expect(separator).toHaveLength(1);
    expect(living.open).toEqual(expect.arrayContaining([separator[0].index]));
    expect(living.open).toHaveLength(2);
    expect(kitchen.open).toHaveLength(1);
  });

  it('moves the doors and windows onto the edges of the half they are in, at the same spot', () => {
    const where = (room: PlanRoom, o: Opening) => {
      const edge = roomEdges(room.polygon).find((e) => e.index === o.wallIndex)!;
      return { x: edge.a.x + (edge.b.x - edge.a.x) * o.t, z: edge.a.z + (edge.b.z - edge.a.z) * o.t };
    };
    const all = [...kitchen.openings, ...living.openings];
    expect(all.map((o) => o.id).sort()).toEqual(studio.openings.map((o) => o.id).sort());
    for (const half of [kitchen, living]) {
      for (const o of half.openings) {
        const was = where(studio, studio.openings.find((s) => s.id === o.id)!);
        const now = where(half, o);
        expect(Math.hypot(now.x - was.x, now.z - was.z)).toBeLessThan(1e-6);
      }
    }
    expect(living.openings.map((o) => o.id).sort()).toEqual(['r1-o1', 'r1-o10', 'r1-o9']);
  });
});

describe('a studio laid out half by half', () => {
  const layouts = Array.from({ length: 30 }, (_, seed) => layoutRoom(studio, { rng: seededRng(seed + 1) }));

  it('hangs nothing on the line between the halves', () => {
    for (const items of layouts) {
      for (const item of items.filter((i) => getArchetype(i.kind)?.placement.type === 'wall-mounted')) {
        // Its back: half its depth behind its middle, the way it faces.
        const back = { x: item.position.x - Math.sin(item.rotation) * (item.size.depth / 2), z: item.position.z - Math.cos(item.rotation) * (item.size.depth / 2) };
        expect(Math.abs(back.z - line), `${item.kind} at z ${item.position.z}`).toBeGreaterThan(0.05);
      }
    }
  });

  // The line is no wall to stand a piece against either: the TV unit stood on it, its back to the
  // kitchen, on every one of these draws — the sofa under the windows, "3.7 m from the screen".
  // The sofa takes the wall between the separator and the corner, its unit the wall across from it.
  it('stands the TV unit against a wall of the living half, never on the line or the separator', () => {
    const living = partRoom(studio, studioParts(studio)!.find((part) => part.type === 'living_room')!);
    const units = layouts.flatMap((items) => items.filter((i) => i.kind === 'tv_unit'));
    expect(units).toHaveLength(layouts.length);
    for (const unit of units) {
      const back = { x: unit.position.x - Math.sin(unit.rotation) * (unit.size.depth / 2), z: unit.position.z - Math.cos(unit.rotation) * (unit.size.depth / 2) };
      expect(Math.abs(back.z - line), `unit at z ${unit.position.z}`).toBeGreaterThan(0.05);
      const wall = pieceWall(unit, living);
      expect(wall, `unit at (${unit.position.x}, ${unit.position.z})`).not.toBeNull();
      expect(isOpenEdge(living, wall!.edge.index)).toBe(false);
    }
  });

  it('hangs the TV clear of the windows', () => {
    const tvs = layouts.flatMap((items) => items.filter((i) => i.kind === 'tv'));
    expect(tvs.length).toBeGreaterThan(0);
    // Measured against the whole room, its windows where they are on its own walls.
    for (const tv of tvs) expect(blocksWindow(tv, studio)).toBe(false);
  });
});

describe('an opening that reaches across the line between the halves', () => {
  // 6 × 4 m, the kitchen the low 35 % along x (the line at x 2.1). A window on the wall at z 0
  // from x 1.7 to 3.3: its middle in the living half, 40 cm of it on the kitchen half's wall. A
  // door fills the kitchen's long wall, so its run and fridge go on one of its two short walls —
  // the fridge at the line's end of the wall, where the half was told of no window.
  const across: PlanRoom = {
    id: 'r1',
    name: 'Studio',
    type: 'studio',
    areaM2: 24,
    heightM: 2.8,
    perimeterM: 20,
    polygon: [P(0, 0), P(6, 0), P(6, 4), P(0, 4)],
    openings: [opening('w', 'window', 0, 2.5 / 6, 1.6), opening('d', 'door', 3, 0.5, 0.9, { exterior: false })],
  };
  const [kitchen, living] = studioParts(across)!.map((part) => partRoom(across, part));
  const cut = lineCoordinate(across, effectiveSplit(across));
  const span = (room: PlanRoom, o: Opening) => {
    const edge = roomEdges(room.polygon).find((e) => e.index === o.wallIndex)!;
    const at = edge.a.x + (edge.b.x - edge.a.x) * o.t;
    return [at - o.widthM / 2, at + o.widthM / 2];
  };

  it('gives the half its middle is in the whole of it, and the other half the stretch on its side', () => {
    expect(cut).toBeCloseTo(2.1, 2);
    const whole = living.openings.find((o) => o.id === 'w')!;
    expect(whole.reachesIn).toBeUndefined();
    expect(whole.widthM).toBe(1.6);
    expect(span(living, whole)[0]).toBeCloseTo(1.7, 6);
    const rest = kitchen.openings.filter((o) => o.id === 'w');
    expect(rest).toHaveLength(1);
    expect(rest[0].reachesIn).toBe(true);
    expect(rest[0].kind).toBe('window');
    expect(span(kitchen, rest[0])[0]).toBeCloseTo(1.7, 6);
    expect(span(kitchen, rest[0])[1]).toBeCloseTo(cut, 2);
    // The door is all the kitchen's: the living half hears nothing of it.
    expect(living.openings.some((o) => o.id === 'd')).toBe(false);
  });

  it('is no opening to the other half where only a sliver of it is past the line', () => {
    // The same window 38 cm further along: 2 cm of it on the kitchen half's wall (plan #392's
    // studio). No piece stands across a window by reaching 2 cm onto it — the whole room's own
    // test (`blocksWindow`) allows 5 cm — so the kitchen half has no window on that wall.
    const sliver: PlanRoom = { ...across, openings: [opening('w', 'window', 0, 2.88 / 6, 1.6), across.openings[1]] };
    const [kitchenHalf, livingHalf] = studioParts(sliver)!.map((part) => partRoom(sliver, part));
    expect(kitchenHalf.openings.some((o) => o.id === 'w')).toBe(false);
    expect(livingHalf.openings.find((o) => o.id === 'w')?.widthM).toBe(1.6);
    // 10 cm of it past the line is a stretch of window there.
    const more: PlanRoom = { ...across, openings: [opening('w', 'window', 0, 2.8 / 6, 1.6), across.openings[1]] };
    const told = partRoom(more, studioParts(more)![0]).openings.filter((o) => o.id === 'w');
    expect(told).toHaveLength(1);
    expect(told[0].widthM).toBeCloseTo(0.1, 2);
  });

  it('stands and hangs nothing tall over the stretch on its side, and dresses the window once', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const items = layoutRoom(across, { rng: seededRng(seed) });
      for (const item of items) expect(blocksWindow(item, across), `${item.kind} (seed ${seed})`).toBe(false);
      // One curtain or blind (both are the curtain's slot) on the window's wall: the window's own.
      expect(items.filter((i) => i.slot === 'curtain' && Math.abs(i.position.z) < 0.2).length, `seed ${seed}`).toBe(1);
    }
  });
});
