import { describe, expect, it } from 'vitest';
import { isPlacementValid, rotateItem, snapPlacement } from '@/lib/design/manipulate';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { PlacedItem, PlanRoom } from '@/lib/design/types';

const room: PlanRoom = refreshRoom({
  id: 'r1',
  type: 'living_room',
  name: 'living',
  polygon: [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 0, z: 3 },
  ],
  heightM: 2.8,
  areaM2: 0,
  perimeterM: 0,
  openings: [],
});

const item = (id: string, x: number, z: number, width: number, depth: number, rotation = 0): PlacedItem => ({
  id,
  roomId: 'r1',
  slot: 'sofa',
  kind: 'sofa_3seat',
  position: { x, z },
  elevationM: 0,
  rotation,
  size: { width, depth, height: 0.8 },
  product: null,
});

describe('rotateItem', () => {
  it('turns a piece that has room to turn', () => {
    const sofa = item('sofa', 2, 1.5, 2, 0.9);
    const result = rotateItem(room, sofa, 2, []);
    expect(result.valid).toBe(true);
    expect(result.rotation).toBeCloseTo(Math.PI / 2, 6);
  });

  it('still turns when nothing fits, and says so', () => {
    // A 2.6 m sofa against the top wall of a 3 m deep room with a table in the middle:
    // turned, it is 2.6 m deep and lands on the table wherever the nudge puts it.
    const sofa = item('sofa', 2, 0.45, 2.6, 0.9);
    const table = item('t', 2, 1.5, 1.2, 0.8);
    const result = rotateItem(room, sofa, 2, [sofa, table]);
    expect(result.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(result.valid).toBe(false);
    // Turned in place but kept inside the room, so it never pokes through a wall.
    expect(result.position.z - 1.3).toBeGreaterThanOrEqual(-1e-9);
    expect(result.position.z + 1.3).toBeLessThanOrEqual(3 + 1e-9);
    expect(isPlacementValid(room, { ...sofa, position: result.position, rotation: result.rotation }, [sofa, table])).toBe(false);
  });
});

describe('isPlacementValid', () => {
  it('is false outside the room or on top of another piece', () => {
    expect(isPlacementValid(room, item('a', 3.9, 1.5, 1, 1), [])).toBe(false);
    const table = item('t', 2, 1.5, 1.2, 0.8);
    expect(isPlacementValid(room, item('a', 2.2, 1.6, 1, 1), [table])).toBe(false);
    expect(isPlacementValid(room, item('a', 0.8, 0.8, 1, 1), [table])).toBe(true);
  });

  it('agrees with what a drop is judged by', () => {
    const table = item('t', 2, 1.5, 1.2, 0.8);
    const dropped = snapPlacement(room, item('a', 0, 0, 1, 1), { position: { x: 2.1, z: 1.4 }, rotation: 0 }, [table]);
    expect(dropped.valid).toBe(false);
    expect(isPlacementValid(room, { ...item('a', 0, 0, 1, 1), position: dropped.position, rotation: dropped.rotation }, [table])).toBe(false);
  });
});

describe('placeAdditional with a real product size', () => {
  it('never seats a product where it overlaps, and finds free floor when the walls are taken', async () => {
    const { placeAdditional } = await import('@/lib/design/autoLayout');
    // Every wall has something on it; the only free floor is the middle of the room.
    const existing: PlacedItem[] = [
      item('a', 2, 0.35, 3.8, 0.6),
      item('b', 2, 2.65, 3.8, 0.6),
      item('c', 0.3, 1.5, 1.6, 0.5, Math.PI / 2),
      item('d', 3.7, 1.5, 1.6, 0.5, Math.PI / 2),
    ];
    const size = { width: 1.9, depth: 0.63, height: 1.11 };
    const placed = placeAdditional(room, 'shoe_cabinet', existing, size);
    expect(placed).not.toBeNull();
    expect(placed!.size).toEqual(size);
    expect(isPlacementValid(room, placed!, existing)).toBe(true);
  });

  it('refuses when nothing of that size fits anywhere', async () => {
    const { placeAdditional } = await import('@/lib/design/autoLayout');
    const table = item('t', 2, 1.5, 3.6, 2.6);
    expect(placeAdditional(room, 'shoe_cabinet', [table], { width: 1.9, depth: 0.63, height: 1.11 })).toBeNull();
  });
});
