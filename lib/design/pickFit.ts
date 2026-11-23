/**
 * A calculator pick that does not fit where it was picked for (Nini, 24 Nov 2026, decision 13:
 * "adapt the layout before excluding a pick"). The order `placeFurniturePicks`
 * (`lib/design/fromCalculator.ts`) follows, and the pieces of it that are not the fit test itself:
 *
 * 1. another position or turn in its room — every stretch of every wall, its back to it or (a bed,
 *    a desk, a table) its side, and free floor for what stands in the middle (`pickPoses`);
 * 2. the room's secondary pieces moved, swapped for a smaller product or taken out for it — the
 *    person's pick before the generated ones (`yieldsToPick`), never a pick, a piece the person
 *    placed, a locked one or what the room is for (`PICK_KEEPS`);
 * 3. another room of the same type, and the person told (`PlacedItem.pickedFor`);
 * 4. left out of the 3D, kept in the person's list with a word that it did not fit
 *    (`GenerationRecord.unplacedPicks`, `pickStatuses`).
 *
 * Never out of the room, never in another piece, never at another size than its own.
 * Pure and isomorphic.
 */

import { getArchetype } from './catalog';
import { LIES_FLAT } from './kinds';
import { laidOffSlots } from './relations';
import { isOpenEdge, polygonBounds, roomEdges } from './planGeometry';
import type { RoomType } from '@/lib/calculator/types';
import type { GenerationRecord, PlacedItem, PlanRoom, SlotKind, Vec2 } from './types';

/** What became of a calculator furniture pick when it was put into the flat. */
export type PickStep =
  /** The room already had it (placed the last time, or chosen in the studio): nothing done. */
  | 'held'
  /** In the slot of its kind, where the real product belongs. */
  | 'slot'
  /** At the spot its kind's own rule gives it (`placeAdditional`) — a pick with no slot's usual place. */
  | 'spot'
  /** Step 1: another stretch of wall, its side to the wall, or free floor, in the same room. */
  | 'turned'
  /** Step 2: in its room once generated pieces were moved, made smaller or taken out for it. */
  | 'rearranged'
  /** Step 3: in another room of the same type. */
  | 'other_room'
  /** Step 4: nowhere — left out of the 3D, kept in the person's list. */
  | 'unplaced';

export interface PickOutcome {
  /** The room it was picked for; null for a pick for the whole flat (a WC from the materials catalogue). */
  roomId: string | null;
  productId: number;
  step: PickStep;
  /** The piece it became; null when it was left out (or the room already had it and nothing was made). */
  itemId: string | null;
  /** The room it stands in when that is not the one it was picked for. */
  placedIn: string | null;
  /** Generated pieces moved, given a smaller product, or taken out to make room for it (step 2). */
  moved?: string[];
  swapped?: string[];
  removed?: string[];
}

/**
 * What a room is for, by type: never moved, made smaller or taken out for a pick — the bed and the
 * wardrobe, the sofa and the TV unit, the kitchen, the bathroom's fixtures, the desk. Anything else
 * the engine laid (a coffee table, an armchair, a dresser, a plant, a nightstand) gives way to the
 * person's own choice, as Nini's example has it ("a coffee table or armchair blocking the chosen sofa").
 */
const KEEPS_EVERYWHERE: ReadonlySet<SlotKind> = new Set<SlotKind>(['bed', 'wardrobe', 'sofa', 'tv_unit', 'kitchen_run', 'kitchen_wall', 'kitchen_island', 'fridge', 'toilet', 'sink', 'shower', 'bathtub', 'washer', 'desk']);
/** And by room: a kitchen's dining table is one of its must-haves (decision 3.5); a living room's is not. */
const KEEPS_BY_ROOM: Partial<Record<RoomType, ReadonlySet<SlotKind>>> = {
  kitchen: new Set<SlotKind>(['dining_table']),
  studio: new Set<SlotKind>(['dining_table']),
};

export function pickKeeps(slot: SlotKind, roomType: RoomType): boolean {
  return KEEPS_EVERYWHERE.has(slot) || !!KEEPS_BY_ROOM[roomType]?.has(slot);
}

/**
 * Whether a piece gives way to a pick (step 2): one the engine laid on the floor of the pick's
 * room, nobody's choice (not a pick, not placed in the studio, not locked or pinned), not what the
 * room is for (`pickKeeps`), and nothing a pick in the room was arranged off (the table a picked
 * chair stands at: taking it out would take the chair with it — `withoutOrphans`).
 */
export function yieldsToPick(item: PlacedItem, room: Pick<PlanRoom, 'id' | 'type'>, items: readonly PlacedItem[]): boolean {
  if (item.roomId !== room.id || item.origin === 'calculator' || item.origin === 'studio' || item.locked || item.pinned) return false;
  if (item.elevationM >= 0.05 || LIES_FLAT.has(item.slot) || getArchetype(item.kind)?.ghost) return false;
  if (pickKeeps(item.slot, room.type)) return false;
  return !items.some((other) => other.roomId === room.id && other.origin === 'calculator' && laidOffSlots(other.kind, room.type).includes(item.slot));
}

/** Kinds that may stand with a long side on a wall rather than their back: a bed (decision 3.2), a desk, a table. */
const SIDE_ON: ReadonlySet<SlotKind> = new Set<SlotKind>(['bed', 'desk', 'dining_table', 'coffee_table', 'kitchen_island', 'console']);
/** Kinds that stand anywhere on the floor, not only against a wall. */
const FREE_STANDING: ReadonlySet<SlotKind> = new Set<SlotKind>(['dining_table', 'coffee_table', 'kitchen_island', 'armchair', 'dining_chair', 'office_chair']);

/** How finely the walls and the floor are walked for another spot: 10 cm along a wall, 20 cm over the floor. */
const WALL_STEP_M = 0.1;
const FLOOR_STEP_M = 0.2;
/** Off the wall by this much, so the piece's back does not graze it. */
const OFF_WALL_M = 0.005;

export interface PickPose {
  position: Vec2;
  rotation: number;
}

/**
 * Every other place a piece `size` big could stand in a room (step 1), the ones nearest `near`
 * first: its back to each wall, every 10 cm along it (the walls before a room separator's open
 * line); then, for a bed, a desk or a table, a long side to the wall; then, for what stands in the
 * middle (a table, an armchair, a plant), the free floor, square to the room. The fit test is the
 * caller's (the room, the pieces, the windows, a door's way): these are only where to try.
 */
export function pickPoses(room: PlanRoom, slot: SlotKind, size: { width: number; depth: number }, near: Vec2): PickPose[] {
  const ranked: Array<{ pose: PickPose; rank: number; distance: number }> = [];
  const push = (pose: PickPose, rank: number) => ranked.push({ pose, rank, distance: Math.hypot(pose.position.x - near.x, pose.position.z - near.z) });
  const sides: Array<{ turn: number; rank: number }> = [{ turn: 0, rank: 0 }, ...(SIDE_ON.has(slot) ? [{ turn: Math.PI / 2, rank: 1 }, { turn: -Math.PI / 2, rank: 1 }] : [])];
  for (const edge of roomEdges(room.polygon)) {
    const open = isOpenEdge(room, edge.index) ? 3 : 0;
    for (const { turn, rank } of sides) {
      const along = turn === 0 ? size.width : size.depth;
      const across = turn === 0 ? size.depth : size.width;
      if (edge.length < along) continue;
      const steps = Math.max(0, Math.floor((edge.length - along) / WALL_STEP_M));
      for (let i = 0; i <= steps + 1; i++) {
        // Every 10 cm, and hard into the far corner as well.
        const t = i > steps ? edge.length - along / 2 : along / 2 + i * WALL_STEP_M;
        const off = across / 2 + OFF_WALL_M;
        push({ position: { x: edge.a.x + edge.dir.x * t + edge.inward.x * off, z: edge.a.z + edge.dir.z * t + edge.inward.z * off }, rotation: edge.facing + turn }, rank + open);
      }
    }
  }
  if (FREE_STANDING.has(slot)) {
    const bounds = polygonBounds(room.polygon);
    for (const rotation of [0, Math.PI / 2]) {
      const halfX = (rotation === 0 ? size.width : size.depth) / 2;
      const halfZ = (rotation === 0 ? size.depth : size.width) / 2;
      for (let x = bounds.minX + halfX; x <= bounds.maxX - halfX + 1e-9; x += FLOOR_STEP_M) {
        for (let z = bounds.minZ + halfZ; z <= bounds.maxZ - halfZ + 1e-9; z += FLOOR_STEP_M) push({ position: { x, z }, rotation }, 2);
      }
    }
  }
  return ranked.sort((a, b) => a.rank - b.rank || a.distance - b.distance).map((r) => r.pose);
}

/** The picks the generation record keeps: those left out of the 3D (`GenerationRecord.unplacedPicks`). */
export function unplacedPicksOf(outcomes: readonly PickOutcome[]): GenerationRecord['unplacedPicks'] {
  const left = outcomes.filter((outcome) => outcome.step === 'unplaced').map((outcome) => ({ roomId: outcome.roomId, productId: outcome.productId }));
  return left.length > 0 ? left : undefined;
}

/** Where a calculator furniture pick is in the design now: what the studio's picks list shows. */
export interface PickStatus {
  /** Its place in the calculator's list (`CalculatorPicks.furniture`). */
  index: number;
  roomId: string;
  productId: number;
  /** In the room it was picked for; in another room (`placedIn`); or not in the 3D. */
  state: 'placed' | 'moved' | 'unplaced';
  itemId: string | null;
  placedIn: string | null;
  /** Why it is not in the 3D: it fitted nowhere when the flat was laid out, or it was taken out since. */
  reason: 'no_fit' | 'removed' | null;
}

/**
 * Each calculator furniture pick against the design as it stands: the piece it is (in the room it
 * was picked for, or one it was moved to — `pickedFor`), or none. Picks of one product for one
 * room are matched to the pieces in turn, the calculator's own first; a pick with no piece is one
 * generation could not fit (`unplacedPicks`) or one taken out of the 3D since.
 */
export function pickStatuses(picks: ReadonlyArray<{ roomId: string; productId: number }>, items: readonly PlacedItem[], generation: Pick<GenerationRecord, 'unplacedPicks'> | null | undefined): PickStatus[] {
  const used = new Set<string>();
  const unfit = new Map<string, number>();
  for (const entry of generation?.unplacedPicks ?? []) {
    const key = `${entry.roomId ?? ''}:${entry.productId}`;
    unfit.set(key, (unfit.get(key) ?? 0) + 1);
  }
  const forRoom = (item: PlacedItem) => item.pickedFor ?? item.roomId;
  return picks.map((pick, index) => {
    const mine = items.filter((item) => !used.has(item.id) && item.product?.productId === pick.productId && forRoom(item) === pick.roomId);
    const item = mine.find((i) => i.origin === 'calculator') ?? mine[0];
    if (item) {
      used.add(item.id);
      const moved = item.roomId !== pick.roomId;
      return { index, roomId: pick.roomId, productId: pick.productId, state: moved ? 'moved' : 'placed', itemId: item.id, placedIn: moved ? item.roomId : null, reason: null };
    }
    const key = `${pick.roomId}:${pick.productId}`;
    const left = unfit.get(key) ?? 0;
    if (left > 0) unfit.set(key, left - 1);
    return { index, roomId: pick.roomId, productId: pick.productId, state: 'unplaced', itemId: null, placedIn: null, reason: left > 0 ? 'no_fit' : 'removed' };
  });
}
