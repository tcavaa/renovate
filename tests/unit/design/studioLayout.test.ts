import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { getArchetype } from '@/lib/design/catalog';
import { blocksWindow } from '@/lib/design/manipulate';
import { roomEdges } from '@/lib/design/planGeometry';
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

  it('hangs the TV clear of the windows', () => {
    const tvs = layouts.flatMap((items) => items.filter((i) => i.kind === 'tv'));
    expect(tvs.length).toBeGreaterThan(0);
    // Measured against the whole room, its windows where they are on its own walls.
    for (const tv of tvs) expect(blocksWindow(tv, studio)).toBe(false);
  });
});
