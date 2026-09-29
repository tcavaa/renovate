/**
 * What the calculator counts off its own drawing board rather than working out from the rooms:
 * the partition walls (`boardPartitionCounts`), the doors (`boardDoorCounts`) and the windows
 * (`boardWindowCounts`).
 *
 * Every place that prices a calculation passes `boardCounts` as the estimate's `counts` — the
 * materials and summary steps (from the board store), the save route (the board it carries,
 * else the row's), the project page and the orders — and the catalogue step and the save's
 * repricing buy a door or a window chosen for the whole flat by the same figures
 * (`aggregateRoomTotals`). A count the board cannot give is left out, and it is worked out from
 * the rooms (`estimateCounts`, `aggregateRoomTotals`).
 *
 * Pure; tested in `tests/unit/calculator/boardCounts.test.ts`.
 */

import { countDoors, countWindows } from '@/lib/design/openings';
import { boardPartitionCounts } from '@/lib/design/partitions';
import type { FloorPlan } from '@/lib/design/types';
import type { EstimateCounts, OpeningCounts } from './materials';

/** The counts the board gives: the estimate's, and its windows. */
export type BoardCounts = Partial<EstimateCounts> & Pick<OpeningCounts, 'windows'>;

/**
 * The doors on the board, once it has its doorways drawn — a door or an archway anywhere on it.
 * A plan read from an upload always has them: the doors read off the drawing, or the ones worked
 * out from how its rooms connect (`deriveOpenings`), shown on the plan step to be checked. A
 * board drawn by hand, or rooms typed by size, usually has none, and none drawn is not no
 * doors: those are left to the estimate from the rooms, a door each (an empty answer).
 */
export function boardDoorCounts(plan: FloorPlan | null | undefined): Pick<Partial<EstimateCounts>, 'doors'> {
  if (!plan) return {};
  const drawn = plan.rooms.some((room) => room.openings.some((o) => o.kind === 'door' || o.kind === 'archway'));
  return drawn ? { doors: countDoors(plan) } : {};
}

/**
 * The windows on the board, once it has any: a plan read from an upload has them (read, or put
 * on its outside walls by `deriveOpenings`). A board with none drawn is left to the rooms, a
 * window a room that usually has one (an empty answer).
 */
export function boardWindowCounts(plan: FloorPlan | null | undefined): Pick<OpeningCounts, 'windows'> {
  if (!plan) return {};
  const windows = countWindows(plan);
  return windows > 0 ? { windows } : {};
}

/** Every count the calculator's board gives: the estimate's `counts`, and its windows. */
export function boardCounts(plan: FloorPlan | null | undefined): BoardCounts {
  return { ...boardPartitionCounts(plan), ...boardDoorCounts(plan), ...boardWindowCounts(plan) };
}
