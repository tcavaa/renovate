import { describe, expect, it } from 'vitest';
import { isAutoRoomName, nextRoomName, readingOrder, withRoomNames, type NamedRoom } from '@/lib/design/roomNames';
import { buildPlanFromRegions } from '@/lib/design/planGeometry';
import type { RoomType } from '@/lib/calculator/types';
import type { ParseResult } from '@/lib/design/types';

const rect = (x: number, z: number, w: number, d: number) => [
  { x, z },
  { x: x + w, z },
  { x: x + w, z: z + d },
  { x, z: z + d },
];
const room = (id: string, type: RoomType, name: string, x: number, z: number, w = 3, d = 3): NamedRoom => ({ id, type, name, polygon: rect(x, z, w, d) });
const names = (rooms: NamedRoom[]) => Object.fromEntries(rooms.map((r) => [r.id, r.name]));

const KIND = { living_room: 'მისაღები ოთახი', bedroom: 'საძინებელი', kitchen: 'სამზარეულო' } as Record<RoomType, string>;

/**
 * The flat of the screenshot that asked for this, in the reader's order: the living room, the
 * bedroom bottom left, the bedroom top left, the kitchen, the small bedroom bottom right.
 */
const flat = (name: (type: RoomType, i: number) => string): NamedRoom[] => [
  room('r1', 'living_room', name('living_room', 0), 4.94, 0, 6.7, 3.49),
  room('r2', 'bedroom', name('bedroom', 1), 0, 3.87, 4.82, 3.75),
  room('r3', 'bedroom', name('bedroom', 2), 0, 0, 4.82, 3.75),
  room('r4', 'kitchen', name('kitchen', 3), 4.94, 3.61, 4.02, 4.02),
  room('r5', 'bedroom', name('bedroom', 4), 9.08, 3.61, 2.55, 4.02),
];

describe('room names', () => {
  it('calls a lone room of its kind what it is, and numbers a kind that has several in the order the plan is read', () => {
    // A flat just read: every room has only its kind's name.
    expect(names(withRoomNames(flat((type) => KIND[type])))).toEqual({
      r1: 'მისაღები ოთახი',
      r4: 'სამზარეულო',
      // Top left, then the bottom row from the left.
      r3: 'საძინებელი 1',
      r2: 'საძინებელი 2',
      r5: 'საძინებელი 3',
    });
  });

  it('deals the names the reader used to write again, in the order of their numbers', () => {
    // "მისაღები ოთახი 1", "საძინებელი 2", "საძინებელი 3", "სამზარეულო 4", "საძინებელი 5".
    expect(names(withRoomNames(flat((type, i) => `${KIND[type]} ${i + 1}`)))).toEqual({
      r1: 'მისაღები ოთახი',
      r4: 'სამზარეულო',
      r2: 'საძინებელი 1',
      r3: 'საძინებელი 2',
      r5: 'საძინებელი 3',
    });
  });

  it('never touches a name the person typed, and does not count it', () => {
    const rooms = [room('a', 'bedroom', 'ბავშვის ოთახი', 0, 0), room('b', 'bedroom', 'საძინებელი 2', 4, 0), room('c', 'kitchen', 'My kitchen', 8, 0)];
    expect(names(withRoomNames(rooms))).toEqual({ a: 'ბავშვის ოთახი', b: 'საძინებელი', c: 'My kitchen' });
  });

  it('takes the number off the last of its kind and closes the gap one leaves', () => {
    expect(names(withRoomNames([room('a', 'bedroom', 'საძინებელი 2', 0, 0)]))).toEqual({ a: 'საძინებელი' });
    expect(names(withRoomNames([room('a', 'bedroom', 'საძინებელი 1', 0, 0), room('c', 'bedroom', 'საძინებელი 3', 4, 0)]))).toEqual({ a: 'საძინებელი 1', c: 'საძინებელი 2' });
  });

  it('keeps each room’s place when another joins: the new one is dealt the last number', () => {
    // Drawn to the left of the first, but numbered after it.
    const rooms = [room('a', 'bedroom', 'საძინებელი', 4, 0), room('b', 'bedroom', nextRoomName([room('a', 'bedroom', 'საძინებელი', 4, 0)], 'bedroom'), 0, 0)];
    expect(rooms[1].name).toBe('საძინებელი 2');
    expect(names(withRoomNames(rooms))).toEqual({ a: 'საძინებელი 1', b: 'საძინებელი 2' });
  });

  it('renames a room by the type it has now, whatever type its generated name was for', () => {
    expect(names(withRoomNames([room('a', 'kitchen', 'საძინებელი 2', 0, 0), room('b', 'bedroom', 'საძინებელი 1', 4, 0)]))).toEqual({ a: 'სამზარეულო', b: 'საძინებელი' });
  });

  it('gives back the same list when every name is already right', () => {
    const rooms = [room('a', 'bedroom', 'საძინებელი', 0, 0), room('b', 'kitchen', 'სამზარეულო', 4, 0)];
    expect(withRoomNames(rooms)).toBe(rooms);
  });

  it('tells a generated name from a typed one', () => {
    expect(isAutoRoomName('საძინებელი')).toBe(true);
    expect(isAutoRoomName('საძინებელი 12')).toBe(true);
    expect(isAutoRoomName(' მისაღები ოთახი 1 ')).toBe(true);
    expect(isAutoRoomName('სველი წერტილი')).toBe(true);
    expect(isAutoRoomName('საძინებელი ბავშვის')).toBe(false);
    expect(isAutoRoomName('Bedroom 1')).toBe(false);
    expect(isAutoRoomName('')).toBe(false);
  });

  it('names a room joining a kind: the kind’s name when it is the first, after the highest number otherwise', () => {
    expect(nextRoomName([], 'kitchen')).toBe('სამზარეულო');
    expect(nextRoomName([room('a', 'bedroom', 'ბავშვის ოთახი', 0, 0)], 'bedroom')).toBe('საძინებელი');
    expect(nextRoomName([room('a', 'bedroom', 'საძინებელი 1', 0, 0), room('b', 'bedroom', 'საძინებელი 4', 4, 0)], 'bedroom')).toBe('საძინებელი 5');
    // The room whose type is changing is not one of the others.
    expect(nextRoomName([room('a', 'bedroom', 'საძინებელი', 0, 0)], 'bedroom', 'a')).toBe('საძინებელი');
  });

  it('reads rooms of different depths standing side by side as one row', () => {
    // A tall room on the left, two on the right one above the other.
    const order = readingOrder([
      { id: 'low', polygon: rect(4, 4, 3, 4) },
      { id: 'tall', polygon: rect(0, 0, 4, 8) },
      { id: 'high', polygon: rect(4, 0, 3, 4) },
    ]);
    expect([...order.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual(['tall', 'high', 'low']);
  });
});

describe('a plan read from a drawing', () => {
  it('names its rooms by the rule', () => {
    // The screenshot's flat in pixels, a centimetre each: 18.1, 23.4, 18.1, 16.2 and 10.3 m².
    const region = (x: number, y: number, w: number, h: number) => ({
      polygonPx: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
      areaPx: w * h,
      bboxPx: { x, y, w, h },
      rectangularity: 1,
    });
    const parse: ParseResult = {
      regions: [region(494, 0, 670, 349), region(908, 361, 255, 402), region(0, 0, 482, 375), region(494, 361, 402, 402), region(0, 387, 482, 375)],
      imageWidth: 1200,
      imageHeight: 800,
      wallRatio: 0.1,
    };
    const plan = buildPlanFromRegions(parse, { metresPerPixel: 0.01 });
    expect(plan.rooms.map((r) => [r.type, r.name])).toEqual([
      ['living_room', 'მისაღები ოთახი'],
      ['bedroom', 'საძინებელი 3'],
      ['bedroom', 'საძინებელი 1'],
      ['kitchen', 'სამზარეულო'],
      ['bedroom', 'საძინებელი 2'],
    ]);
  });
});
