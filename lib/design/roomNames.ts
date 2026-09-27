/**
 * The names the app gives rooms.
 *
 * A room is called what it is — "სამზარეულო", "მისაღები ოთახი" — and numbered only when the
 * flat has more than one room of its kind: "საძინებელი 1", "საძინებელი 2", "საძინებელი 3". The
 * plan reader used to number every room by its place in the whole plan, so a flat with one
 * kitchen had "სამზარეულო 4" in it, which reads as though three more kitchens were somewhere.
 *
 * A name the person typed is theirs and is never touched. A generated one — a type's name,
 * bare or numbered — is dealt again by `withRoomNames` whenever the rooms or their types
 * change: the numbers of a kind stay 1…n with no gaps, and a room left alone of its kind loses
 * its number. Names are Georgian whatever the interface's language, like the rest of the plan.
 */

import { ROOM_TYPES } from '@/lib/calculator/constants';
import type { RoomType } from '@/lib/calculator/types';
import type { Vec2 } from './types';

/** What naming needs of a room — `PlanRoom` has it. */
export interface NamedRoom {
  id: string;
  type: RoomType;
  name: string;
  polygon: Vec2[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Any type's name, alone or followed by a number. */
const AUTO_NAME = new RegExp(`^(?:${Object.values(ROOM_TYPES).map((t) => escape(t.labelKa)).join('|')})(?: (\\d+))?$`);

/** The name a room of this type is given: the type's own. */
export function roomTypeName(type: RoomType): string {
  return ROOM_TYPES[type].labelKa;
}

/** True for a name the app gave ("საძინებელი", "საძინებელი 2") rather than one the person typed. */
export function isAutoRoomName(name: string): boolean {
  return AUTO_NAME.test(name.trim());
}

/** The number of a generated name; 0 for a type's name alone. */
function autoNumber(name: string): number {
  const match = AUTO_NAME.exec(name.trim());
  return match?.[1] ? Number(match[1]) : 0;
}

/**
 * The name for a room joining the rooms of `type` — a new one, or one whose type changed: the
 * type's name when it is the first of its kind, else a number after every one there, so it is
 * dealt the last number when `withRoomNames` runs.
 */
export function nextRoomName(rooms: NamedRoom[], type: RoomType, excludeRoomId?: string): string {
  const others = rooms.filter((r) => r.id !== excludeRoomId && r.type === type && isAutoRoomName(r.name));
  if (others.length === 0) return roomTypeName(type);
  return `${roomTypeName(type)} ${Math.max(others.length, ...others.map((r) => autoNumber(r.name))) + 1}`;
}

/**
 * Every generated name dealt again: a room alone of its kind is the type's name, and the rooms
 * of a kind that has several are numbered 1…n — in the order of their present numbers, so a
 * room keeps its place when another is added or taken away, and rooms with no number yet (a
 * plan just read, where every room is) in the order a plan is read, top row first and each row
 * left to right. Typed names are left as they are and do not count. Returns `rooms` itself
 * when no name changes.
 */
export function withRoomNames<T extends NamedRoom>(rooms: T[]): T[] {
  const order = readingOrder(rooms);
  const kinds = new Map<RoomType, T[]>();
  for (const room of rooms) {
    if (!isAutoRoomName(room.name)) continue;
    kinds.set(room.type, [...(kinds.get(room.type) ?? []), room]);
  }
  const names = new Map<string, string>();
  for (const [type, group] of kinds) {
    if (group.length === 1) {
      names.set(group[0].id, roomTypeName(type));
      continue;
    }
    [...group]
      .sort((a, b) => autoNumber(a.name) - autoNumber(b.name) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .forEach((room, i) => names.set(room.id, `${roomTypeName(type)} ${i + 1}`));
  }
  let changed = false;
  const next = rooms.map((room) => {
    const name = names.get(room.id);
    if (name === undefined || name === room.name) return room;
    changed = true;
    return { ...room, name };
  });
  return changed ? next : rooms;
}

/**
 * Where each room comes when a plan is read (index by id): in rows from the top, each row left
 * to right. A room belongs to the row of the highest room whose depth takes in its middle, so
 * rooms of different depths standing side by side still read as one row.
 */
export function readingOrder(rooms: Array<{ id: string; polygon: Vec2[] }>): Map<string, number> {
  const boxes = rooms.map((room, index) => {
    const xs = room.polygon.map((p) => p.x);
    const zs = room.polygon.map((p) => p.z);
    const minZ = zs.length ? Math.min(...zs) : 0;
    const maxZ = zs.length ? Math.max(...zs) : 0;
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    return { id: room.id, index, cx, cz: (minZ + maxZ) / 2, maxZ };
  });
  const rows: Array<typeof boxes> = [];
  for (const box of [...boxes].sort((a, b) => a.cz - b.cz || a.cx - b.cx || a.index - b.index)) {
    const row = rows[rows.length - 1];
    if (row && box.cz <= row[0].maxZ) row.push(box);
    else rows.push([box]);
  }
  const order = new Map<string, number>();
  for (const row of rows) for (const box of row.sort((a, b) => a.cx - b.cx || a.index - b.index)) order.set(box.id, order.size);
  return order;
}
