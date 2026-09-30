/**
 * The partition walls a renovation builds (phase 1, `wall_build`), measured off the plan.
 *
 * A partition is a wall with a room on both sides, or one standing free — never a wall with a
 * room on one side only, which is the building's own (its outer walls, the walls onto the
 * stairwell) and is never priced. A black frame has its partitions built as part of the
 * renovation, and some of them are often up already: those are marked `built` on the board
 * and left out of the price. A balcony's walls always stand — they are the building's, whatever
 * state the flat is in — so a wall with a balcony on either side is never priced either
 * (`standsAlready`); where the balcony is open the person draws a railing instead.
 *
 * The studio prices from these (`lib/design/pricing.ts`). The calculator prices from its own
 * board's (`boardPartitionCounts`, with the board's doors in `lib/calculator/boardCounts.ts`)
 * when the board is a flat drawn joined up; rooms typed by size stand apart on the sheet, share
 * no wall and would come to nothing, so those are still estimated from the rooms
 * (`estimateCounts` in `lib/calculator/materials.ts`).
 *
 * Pure; tested in `tests/unit/design/partitions.test.ts`.
 */

import type { EstimateCounts } from '@/lib/calculator/materials';
import { pointInPolygon } from './planGeometry';
import { wallLength } from './walls';
import type { FloorPlan, PlanRoom, Wall } from './types';

export interface PartitionWall {
  wall: Wall;
  /** Its length times its height — its own, else the flat's. */
  areaM2: number;
  /** A room on both sides (true), or none — a wall standing free (false). */
  interior: boolean;
  /** A balcony on one side of it: it stands already, like a wall marked `built`, and is never priced. */
  balcony: boolean;
}

/**
 * A room whose walls stand whatever state the flat is in: a balcony's are the building's. The
 * board draws them as already built, and the estimate never builds them.
 */
export function standsAlready(room: Pick<PlanRoom, 'type'>): boolean {
  return room.type === 'balcony';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** How far past a wall's face its sides are looked at for a room. */
const PROBE_M = 0.05;

/** The height a partition is priced at: its own, else the flat's, else the rooms' average. */
function heightOf(plan: FloorPlan, wall: Wall): number {
  const fallback = plan.wallHeightM ?? (plan.rooms.length > 0 ? plan.rooms.reduce((s, r) => s + r.heightM, 0) / plan.rooms.length : 2.7);
  return wall.heightM ?? fallback;
}

/**
 * The room on each side of a wall (none, one or two — the same room twice for a partial wall),
 * looked at a hand's breadth past each face at its middle. A partial wall standing in a room has
 * that room on both sides — asking which rooms a wall *bounds* (`wallsBoundingRoom`) called one
 * the building's own, since it runs on into the corner of the room it stands in.
 */
function roomSides(plan: FloorPlan, wall: Wall): PlanRoom[] {
  const dx = wall.b.x - wall.a.x;
  const dz = wall.b.z - wall.a.z;
  const length = Math.hypot(dx, dz) || 1;
  const normal = { x: -dz / length, z: dx / length };
  const mid = { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 };
  const reach = wall.thicknessM / 2 + PROBE_M;
  const roomAt = (k: number) => plan.rooms.find((room) => pointInPolygon({ x: mid.x + normal.x * reach * k, z: mid.z + normal.z * reach * k }, room.polygon));
  return [roomAt(1), roomAt(-1)].filter((room): room is PlanRoom => !!room);
}

function asPartition(plan: FloorPlan, wall: Wall): PartitionWall | null {
  // A room separator is no wall at all: nothing is built along it.
  if (wall.separator) return null;
  const sides = roomSides(plan, wall);
  if (sides.length === 1) return null;
  return { wall, areaM2: round2(wallLength(wall) * heightOf(plan, wall)), interior: sides.length === 2, balcony: sides.some(standsAlready) };
}

/**
 * The walls a black frame still has to build: every partition not marked `built` and not a
 * balcony's. Its board draws these grey and every other wall black — the building's outer
 * walls, a balcony's, the partitions already standing.
 */
export function wallsToBuild(plan: FloorPlan): Set<string> {
  return new Set(partitionWalls(plan).flatMap((p) => (p.wall.built || p.balcony ? [] : [p.wall.id])));
}

/**
 * The walls that stand whatever the estimate builds: every wall with a balcony on one side of
 * it, outer or not — never a partition to build, and their card says so.
 */
export function standingWallIds(plan: FloorPlan): Set<string> {
  const ids = new Set<string>();
  if (!plan.rooms.some(standsAlready)) return ids;
  for (const wall of plan.walls ?? []) {
    if (!wall.separator && roomSides(plan, wall).some(standsAlready)) ids.add(wall.id);
  }
  return ids;
}

/** Every partition on the plan, built or not, with its area. */
export function partitionWalls(plan: FloorPlan): PartitionWall[] {
  return (plan.walls ?? []).flatMap((wall) => asPartition(plan, wall) ?? []);
}

/** One wall as a partition — its area and whether it stands between rooms — or null for the building's own (or a room separator). */
export function partitionWall(plan: FloorPlan, wallId: string): PartitionWall | null {
  const wall = plan.walls?.find((w) => w.id === wallId);
  return wall ? asPartition(plan, wall) : null;
}

/**
 * The partition walls to build, in m²: every partition that is not already standing
 * (`Wall.built`, or a balcony's). Nothing when the plan has no walls — the estimate then works it
 * out from the rooms, as the calculator does without a board.
 */
export function partitionArea(plan: FloorPlan): Pick<Partial<EstimateCounts>, 'partitionM2'> {
  if ((plan.walls ?? []).length === 0) return {};
  // Summed unrounded, and rounded once: the figure is multiplied by a rate.
  const area = partitionWalls(plan).reduce((sum, p) => sum + (p.wall.built || p.balcony ? 0 : wallLength(p.wall) * heightOf(plan, p.wall)), 0);
  return { partitionM2: round2(area) };
}

/**
 * The calculator's partition walls, measured off its board: what `partitionArea` says, once
 * the board is a flat drawn joined up — at least one wall between two rooms, or a single room.
 * Rooms typed by size stand apart on the sheet (`findFreeSpot`), share no wall, and measured
 * they would come to nothing, so those — and a calculation without a board — are left to the
 * estimate from the rooms (an empty answer). Every place that prices a calculation passes this,
 * with the board's doors, as its `counts` (`boardCounts` in `lib/calculator/boardCounts.ts`).
 */
export function boardPartitionCounts(plan: FloorPlan | null | undefined): Pick<Partial<EstimateCounts>, 'partitionM2'> {
  if (!plan || plan.rooms.length === 0 || (plan.walls ?? []).length === 0) return {};
  if (plan.rooms.length > 1 && !partitionWalls(plan).some((p) => p.interior)) return {};
  return partitionArea(plan);
}

/** The renovation phase that builds the partition walls (`wall_build`, `lib/calculator/constants`). */
export const PARTITION_PHASE = 1;

/**
 * Whether an estimate running these phases builds the partition walls — a black frame, or
 * works ticked to include them: when the board asks which walls already stand.
 */
export function buildsPartitions(phases: readonly number[] | null | undefined): boolean {
  return !!phases?.includes(PARTITION_PHASE);
}
