/**
 * What goes with a piece that is gone.
 *
 * The layout engine arranges some pieces off others — the coffee table in front of the sofa, the
 * nightstands beside the bed, the chairs round the table, the TV over its unit, the rug under the
 * coffee table. When the piece they were arranged off leaves the flat (no product fitted its slot,
 * the designer's check took it out) they go with it: a coffee table, an armchair, a rug, a TV unit
 * and a TV round the empty floor where the sofa would be is no room
 * (docs/design-studio/generation-audit.md, M3).
 *
 * Which piece is arranged off which is read from the archetypes' own placement rules
 * (`lib/design/catalog`), as the engine applies them (`resolvePose` in `lib/design/autoLayout`),
 * so there is one answer for the generator and for the whole-flat check (`lib/design/sceneAudit`).
 * Pure: no React, no `window`.
 */

import type { RoomType } from '@/lib/calculator/types';
import { getArchetype } from './catalog';
import { WET_ROOM_TYPES } from './rules';
import type { PlacedItem, PlanRoom, SlotKind } from './types';

export interface ArrangedOff {
  /** The slots the piece is arranged off, in the order the engine looks for them: the first the room has. */
  slots: SlotKind[];
  /**
   * With none of them in the room the engine lays the piece nowhere (true: a nightstand with no
   * bed), or lays it on its own all the same (false: a rug under the room's main piece when it has
   * no coffee table) — so only a piece of the first sort is, by standing in a room without them,
   * left over from a piece that is gone.
   */
  only: boolean;
}

/**
 * The pieces a kind is arranged off, in a room of this type — or null for a kind that stands on its
 * own, and for one that merely prefers a spot by another piece and takes a wall without it: a print
 * over the bed, else on a wall; a hall's mirror over the console, else on a wall; the wall cabinets
 * over the run; the fridge at the run's end. Those stay when the other piece goes.
 *
 * - `relative` (off its `to`): the coffee table, the TV unit and the armchair off the sofa, the
 *   nightstands off the bed, the chairs off their table or desk, the bath's mixer off the bath —
 *   laid nowhere without it.
 * - `under` (its `to`): the rug under the coffee table, the bedroom's under the bed — and, in a
 *   room with neither, under the room's main piece (`placeUnder`), where it is a rug of its own.
 * - `wall-mounted` with `onlyAbove`: the TV over its unit, the tap over the basin, the dryer on the
 *   machine — laid nowhere without it. A bathroom's or a toilet's mirror likewise: it hangs over
 *   the basin and nowhere else.
 */
export function arrangedOff(kind: string, roomType?: RoomType): ArrangedOff | null {
  const archetype = getArchetype(kind);
  const rule = archetype?.placement;
  if (!archetype || !rule) return null;
  if (rule.type === 'relative') return { slots: [rule.to], only: true };
  if (rule.type === 'under') return { slots: [rule.to], only: false };
  if (rule.type === 'wall-mounted' && rule.above) {
    const overBasinOnly = archetype.slot === 'mirror' && roomType != null && WET_ROOM_TYPES.includes(roomType);
    if (rule.onlyAbove || overBasinOnly) return { slots: Array.isArray(rule.above) ? rule.above : [rule.above], only: true };
  }
  return null;
}

/** The piece `item` was arranged off, among the pieces as they stood: the nearest of the first of its slots the room had. */
function anchorOf(item: PlacedItem, laid: readonly PlacedItem[], roomType: RoomType | undefined): PlacedItem | null {
  const off = arrangedOff(item.kind, roomType);
  if (!off) return null;
  for (const slot of off.slots) {
    const anchors = laid.filter((p) => p.roomId === item.roomId && p.id !== item.id && p.slot === slot);
    if (anchors.length === 0) continue;
    const distance = (p: PlacedItem) => Math.hypot(p.position.x - item.position.x, p.position.z - item.position.z);
    return anchors.reduce((best, p) => (distance(p) < distance(best) ? p : best));
  }
  return null;
}

/**
 * `kept` without the pieces arranged off a piece that is gone — and without what was arranged off
 * those (no sofa: no TV unit; no TV unit: no TV).
 *
 * `laid` is the flat as it stood with every piece in it, the ones now gone included: the engine's
 * slots before products were matched to them, the scene before the designer's check. A piece is
 * read as it stood there (its kind then, its place then). Only what was arranged off a piece that
 * stood and is gone goes: a piece whose room never had the other — a fridge on a wall of a kitchen
 * with no run, a rug under the desk — stood on its own, and stays.
 */
export function withoutOrphans(laid: readonly PlacedItem[], kept: PlacedItem[], rooms: ReadonlyArray<Pick<PlanRoom, 'id' | 'type'>> = []): PlacedItem[] {
  const typeOf = new Map(rooms.map((room) => [room.id, room.type]));
  const asLaid = new Map(laid.map((item) => [item.id, item]));
  const anchors = new Map<string, PlacedItem | null>();
  for (const item of kept) {
    const was = asLaid.get(item.id) ?? item;
    anchors.set(item.id, anchorOf(was, laid, typeOf.get(was.roomId)));
  }
  let standing = kept;
  for (;;) {
    const ids = new Set(standing.map((item) => item.id));
    const next = standing.filter((item) => {
      const anchor = anchors.get(item.id);
      return !anchor || ids.has(anchor.id);
    });
    if (next.length === standing.length) return standing;
    standing = next;
  }
}
