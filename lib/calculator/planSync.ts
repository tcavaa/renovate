/**
 * The calculator's rooms and the design store's plan are one drawing (see
 * `hooks/useCalculatorPlan`). This is the pure step that keeps them agreeing, so it can be
 * tested without React: given both, it says what the plan and the rooms should be next.
 *
 * The plan follows the rooms only when the two describe different flats — the calculator
 * holds rooms and none of their ids is in the plan (a calculation typed before the plan
 * existed, or a plan left over from another flat). Otherwise the rooms follow the plan:
 * width, depth, position and area read off each room's outline.
 *
 * Both answers come from the same snapshot. The hook used to run two effects for this, and
 * each read the other's store from the render it was created in: with two different flats,
 * one effect put the rooms' flat into the plan while the other put the *old* plan's rooms
 * into the calculator, so the next render saw two different flats again — an endless
 * ping-pong that grew a sliver room per round until React gave up ("maximum update depth").
 */

import { calculatorRoomsFromPlan, edgeLengthsM, planFromCalculatorRooms } from '@/lib/design/planGeometry';
import { ensureWalls } from '@/lib/design/walls';
import type { FloorPlan } from '@/lib/design/types';
import type { Room } from './types';

/** True when the plan has to be rebuilt from the calculator's rooms: they are a different flat. */
export function planFollowsRooms(plan: FloorPlan | null, rooms: Room[]): boolean {
  if (rooms.length === 0) return false;
  if (!plan) return true;
  if (plan.rooms.length === 0) return false;
  const ids = new Set(rooms.map((r) => r.id));
  return !plan.rooms.some((r) => ids.has(r.id));
}

/** The fields the calculator reads off the plan, compared so an unchanged plan writes nothing. */
export function sameCalculatorRooms(a: Room[], b: Room[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => {
      const c = b[i];
      return !!c && c.id === r.id && c.width === r.width && c.length === r.length && c.height === r.height && c.type === r.type && c.nameKa === r.nameKa && c.x === r.x && c.z === r.z && JSON.stringify(c.split ?? null) === JSON.stringify(r.split ?? null) && JSON.stringify(c.parts ?? null) === JSON.stringify(r.parts ?? null) && JSON.stringify(c.walls ?? null) === JSON.stringify(r.walls ?? null);
    })
  );
}

/**
 * What both stores should hold next. Returns the same `plan` and `rooms` objects when
 * nothing has to change, so callers can compare by identity. Applying the result and
 * calling again is a no-op: the plan built from the rooms carries their ids (or ids the
 * rooms are then read back with), so the two agree from then on.
 */
export function reconcileCalculatorPlan(plan: FloorPlan | null, rooms: Room[]): { plan: FloorPlan | null; rooms: Room[] } {
  const nextPlan = planFollowsRooms(plan, rooms) ? ensureWalls(planFromCalculatorRooms(rooms)) : plan;
  if (!nextPlan) return { plan, rooms };
  const fromPlan = calculatorRoomsFromPlan(nextPlan);
  return { plan: nextPlan, rooms: sameCalculatorRooms(fromPlan, rooms) ? rooms : fromPlan };
}

/**
 * The rooms with each wall's length read off the board where a room has none yet — a
 * calculation from before the rooms carried their walls, opened past its plan step (the plan
 * step reads them with everything else). The walls are the board's own, in its order, so a wall
 * chosen on its own is the same wall on the board and in 3D. The same array when there is
 * nothing to fill in.
 */
export function withBoardWalls(rooms: Room[], plan: FloorPlan | null): Room[] {
  if (!plan || rooms.every((r) => r.walls)) return rooms;
  const outlines = new Map(plan.rooms.map((r) => [r.id, r.polygon]));
  let changed = false;
  const next = rooms.map((room) => {
    const outline = room.walls ? null : outlines.get(room.id);
    if (!outline || outline.length < 3) return room;
    changed = true;
    return { ...room, walls: edgeLengthsM(outline) };
  });
  return changed ? next : rooms;
}
