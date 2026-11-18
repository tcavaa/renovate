/**
 * Who belongs to whom: every relation between two pieces of furniture, in one module.
 *
 * The layout engine arranges some pieces off others — the coffee table in front of the sofa, the
 * nightstands beside the bed, the chairs round the table, the TV over its unit, the rug under the
 * coffee table — and the bathroom pass builds some for others (a basin's tap, the dryer on the
 * machine, the bath's mixer). Every reader that asks what goes with what asks here.
 *
 * The source is the archetypes' placement rules (`lib/design/catalog`): the rule the engine lays a
 * piece out by (`resolvePose` in `lib/design/autoLayout`) says what it goes with. The relations
 * below are different questions, and they give different answers on purpose:
 *
 * - **Arranged off** (`arrangedOff`, `withoutOrphans`): what a piece cannot stand without — laid
 *   nowhere without it, it goes when that piece goes. The generator and the whole-flat check
 *   (`lib/design/sceneAudit`).
 * - **Laid off** (`laidOffSlots`): every piece a rule names, the ones a piece merely prefers to stand
 *   by included (the fridge at the run's end, a print over the bed, the wall cabinets over the run):
 *   what the AI check would leave standing where it was by moving a piece to another wall
 *   (`heldByMove`). A wider set than "arranged off": a fridge stays when the run goes, but a move of
 *   the run would leave it at an empty end.
 * - **Measured off** (`measuredRule`, `measuredOff`): stood by measure off its anchor — beside it
 *   (`beside`: the nightstands, the bath's mixer) or a gap in front of it (`gapM`: the coffee
 *   table, the desk chair). Stood again off the anchor's real size once the anchor is matched (the
 *   matcher's `settledPosition`), and in its way meanwhile (`followsWhenMatched`).
 * - **Placed off** (`placedOff`): measured off, and not a companion — what the AI check stands by
 *   its anchor again after its fixes, and keeps out of a replaced anchor's way. The bath's mixer is
 *   measured off its bath too, but it is its bath's companion (below): linked by its id, it travels
 *   with the bath (`carryCompanions`) and the bathroom pass places it.
 * - **In front** (`inFrontOf`): measured off by a gap in front (the coffee table, the desk chair) —
 *   what moves with its anchor when the AI check pushes the anchor back to its wall. Not the
 *   nightstands: they stand beside the bed, against its wall, not in its way.
 * - **Seated at** (`seatedAt`): the chairs round a table (`seatSlots`) — seated again round the
 *   table as it stands rather than measured off it, and in neither the table's way nor one another's
 *   while they wait (the matcher's followers, the AI check's reseating). Which chairs are seated is
 *   written here (`SEATED_SLOTS`); the table is read off the chair's rule (its `to`).
 * - **Tucks under** (`tucksUnder`): a chair and the top its seat slides under, which may overlap.
 *   Which chairs tuck is written here (`TUCKING_SLOTS`), not read off the rules: the dining chair is
 *   pushed in by the seat ring when the room is tight (`placeSeatAroundTable`), the desk chair by
 *   its gap below zero — what the two share is a seat that goes under a top, and the studio lets a
 *   person push either in. The top each goes under is read off the chair's rule (its `to`), so a
 *   rule that sets a chair by another piece moves its partner with it.
 * - **Companions** (`companionsOf`, `hostOf`, `companionId`): what the bathroom pass builds for a
 *   host (`lib/design/bathroom`) — the basin's tap, the machine's dryer, the bath's mixer — linked
 *   by its id, not by its kind: a tap a person sets down by a basin is not that basin's. A move of
 *   the host carries them (`carryCompanions`), and the joinery built for the host is theirs too
 *   (`withJoinery`).
 *
 * What a move carries is not what goes when a piece is removed: a move carries its companions,
 * what rides on it (`carryRiders` in `lib/design/decor/housing`: whatever stands on its top, a TV
 * over its unit) and, for the AI check, what is placed off it; a removal takes what is arranged off
 * it, which is more (the TV unit and the armchair off the sofa, the rug under the coffee table) —
 * and none of what merely stood on its top. What is built round a piece (its vanity, its column,
 * its box) is joinery, not furniture: `HOUSING_OF_SLOT` in `lib/design/decor/housing`.
 * Pure: no React, no `window`.
 */

import type { RoomType } from '@/lib/calculator/types';
import { getArchetype, kindsOfSlot, mainSlot, type PlacementRule } from './catalog';
import { WET_ROOM_TYPES } from './rules';
import type { PlacedItem, PlanRoom, SlotKind } from './types';

type RelativeRule = Extract<PlacementRule, { type: 'relative' }>;

export interface ArrangedOff {
  /** The slots the piece is arranged off, in the order the engine looks for them: the first the room has. */
  slots: SlotKind[];
  /** With none of them in the room the engine lays the piece nowhere: standing there without them, it is left over from a piece that is gone. */
  only: true;
  /**
   * Any of them will do (a rug: under the coffee table, else under the piece the room is laid out
   * round) — it stays while one of them stands. Absent: it goes with the one it was arranged off.
   */
  either?: true;
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
 *   room without that piece, under the one the room is laid out round (`mainSlot`: the sofa, the
 *   office's desk); laid nowhere with neither (`placeUnder`).
 * - `wall-mounted` with `onlyAbove`: the TV over its unit, the tap over the basin, the dryer on the
 *   machine — laid nowhere without it. A bathroom's or a toilet's mirror likewise: it hangs over
 *   the basin and nowhere else.
 */
export function arrangedOff(kind: string, roomType?: RoomType): ArrangedOff | null {
  const archetype = getArchetype(kind);
  const rule = archetype?.placement;
  if (!archetype || !rule) return null;
  if (rule.type === 'relative') return { slots: [rule.to], only: true };
  if (rule.type === 'under') {
    const main = roomType ? mainSlot(roomType) : null;
    return { slots: main && main !== rule.to ? [rule.to, main] : [rule.to], only: true, either: true };
  }
  if (rule.type === 'wall-mounted' && rule.above) {
    const overBasinOnly = archetype.slot === 'mirror' && roomType != null && WET_ROOM_TYPES.includes(roomType);
    if (rule.onlyAbove || overBasinOnly) return { slots: Array.isArray(rule.above) ? rule.above : [rule.above], only: true };
  }
  return null;
}

/**
 * The pieces `item` was arranged off, among the pieces as they stood: the nearest of the first of
 * its slots the room had — or, where any of them will do (`either`), the nearest of each. None for
 * a piece that stands on its own, and for one whose room never had the other.
 */
function anchorsOf(item: PlacedItem, laid: readonly PlacedItem[], roomType: RoomType | undefined): PlacedItem[] {
  const off = arrangedOff(item.kind, roomType);
  if (!off) return [];
  const distance = (p: PlacedItem) => Math.hypot(p.position.x - item.position.x, p.position.z - item.position.z);
  const found: PlacedItem[] = [];
  for (const slot of off.slots) {
    const anchors = laid.filter((p) => p.roomId === item.roomId && p.id !== item.id && p.slot === slot);
    if (anchors.length === 0) continue;
    found.push(anchors.reduce((best, p) => (distance(p) < distance(best) ? p : best)));
    if (!off.either) break;
  }
  return found;
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
  const anchors = new Map<string, PlacedItem[]>();
  for (const item of kept) {
    const was = asLaid.get(item.id) ?? item;
    anchors.set(item.id, anchorsOf(was, laid, typeOf.get(was.roomId)));
  }
  let standing = kept;
  for (;;) {
    const ids = new Set(standing.map((item) => item.id));
    const next = standing.filter((item) => {
      const off = anchors.get(item.id) ?? [];
      return off.length === 0 || off.some((anchor) => ids.has(anchor.id));
    });
    if (next.length === standing.length) return standing;
    standing = next;
  }
}

/**
 * The slots a kind is laid out off by its placement rule — every one the rule names: the TV unit
 * off the sofa, the rug under the coffee table (or the sofa), the wall cabinets over the run, the
 * fridge at its end, a print over the bed — not only those it cannot stand without (`arrangedOff`).
 */
export function laidOffSlots(kind: string, roomType?: RoomType): SlotKind[] {
  const rule = getArchetype(kind)?.placement;
  const slots = new Set<SlotKind>(arrangedOff(kind, roomType)?.slots ?? []);
  if (rule?.type === 'relative' || rule?.type === 'under') slots.add(rule.to);
  if (rule?.type === 'wall-mounted' && rule.above) for (const slot of [rule.above].flat()) slots.add(slot);
  if (rule?.type === 'wall' && rule.beside) slots.add(rule.beside);
  return [...slots];
}

/** A kind's rule when it is placed relative to another piece (`relative`), else null. */
function relativeRule(kind: string): RelativeRule | null {
  const rule = getArchetype(kind)?.placement;
  return rule?.type === 'relative' ? rule : null;
}

/**
 * A kind's rule when it is stood by measure off its anchor — beside it (`beside`: a nightstand at
 * the head of the bed, the bath's mixer) or a gap in front of it (`gapM`: the coffee table, the desk
 * chair) — else null: what is stood again off the anchor's real size (`settledPosition`).
 */
export function measuredRule(kind: string): RelativeRule | null {
  const rule = relativeRule(kind);
  return rule && (rule.beside != null || rule.gapM != null) ? rule : null;
}

/** The slot a kind is stood by measure off (`measuredRule`): the nightstand's bed, the coffee table's sofa — or null. */
export function measuredOff(kind: string): SlotKind | null {
  return measuredRule(kind)?.to ?? null;
}

/**
 * The slot a kind is placed off and stood by again when that piece changes (the AI check's fixes):
 * measured off it (`measuredOff`) and not a companion — the nightstands off the bed, the coffee
 * table off the sofa, the desk chair off the desk. The bath's mixer is measured off its bath but
 * travels with it as its companion (`companionsOf`). Null for anything else.
 */
export function placedOff(kind: string): SlotKind | null {
  return COMPANION_KINDS.has(kind) ? null : measuredOff(kind);
}

/** The slot a kind stands in front of, by a gap measured off it (`gapM`): the coffee table's sofa, the desk chair's desk — or null. */
export function inFrontOf(kind: string): SlotKind | null {
  const rule = relativeRule(kind);
  return rule && rule.gapM != null ? rule.to : null;
}

/**
 * The slot the archetypes of `slot` are placed relative to — their rule's `to` (the dining chair's
 * table, the desk chair's desk) — or null. Read off the first kind of the slot (`kindsOfSlot`):
 * the chairs' slots hold one kind each. Kept per slot, as the chairs' partners are asked in the
 * studio's and the audit's pairwise loops.
 */
const RELATIVE_TO = new Map<SlotKind, SlotKind | null>();
function relativeTo(slot: SlotKind): SlotKind | null {
  if (!RELATIVE_TO.has(slot)) {
    const [kind] = kindsOfSlot(slot);
    RELATIVE_TO.set(slot, (kind != null && relativeRule(kind)?.to) || null);
  }
  return RELATIVE_TO.get(slot) ?? null;
}

/**
 * The chairs seated round a table (`seatSlots`), by slot. Which chairs are seated is written here
 * (a chair's rule does not say it: the dining chair's rule has no gap or side, as a coffee table's
 * would, and `placeSeatAroundTable` seats it round the table's sides); the table it is seated at is
 * read off its rule (`seatedAt`).
 */
const SEATED_SLOTS: ReadonlySet<SlotKind> = new Set<SlotKind>(['dining_chair']);

/**
 * The slot a chair of `slot` is seated round (`SEATED_SLOTS`) — its rule's `to`, the dining table —
 * or null for any other slot: seated again round it as it stands, not measured off it.
 */
export function seatedAt(slot: SlotKind): SlotKind | null {
  return SEATED_SLOTS.has(slot) ? relativeTo(slot) : null;
}

/**
 * Whether `other`, still to be matched, follows the piece of slot `anchor` once that is matched —
 * so it is not in that piece's way meanwhile: a piece measured off it (`measuredOff`: the
 * nightstands off the bed) or a chair seated round it (`seatedAt`). Chairs round one table are in
 * none of one another's way either (`seatedTogether`).
 */
export function followsWhenMatched(other: Pick<PlacedItem, 'kind' | 'slot'>, anchor: SlotKind): boolean {
  const rule = relativeRule(other.kind);
  return rule?.to === anchor && (rule.beside != null || rule.gapM != null || SEATED_SLOTS.has(other.slot));
}

/** Two chairs seated round a table (`seatedAt`): seated again together, in neither's way. */
export function seatedTogether(a: Pick<PlacedItem, 'slot'>, b: Pick<PlacedItem, 'slot'>): boolean {
  return a.slot === b.slot && SEATED_SLOTS.has(a.slot);
}

/**
 * The chairs whose seat slides under a top, by slot. Which chairs do is written here (not read off
 * the rules: see the header); the top each goes under is its rule's `to` (`tuckedUnder`).
 */
const TUCKING_SLOTS: ReadonlySet<SlotKind> = new Set<SlotKind>(['dining_chair', 'office_chair']);

/** The top a chair of `slot` slides under (`TUCKING_SLOTS`) — its rule's `to` — or undefined for any other slot. */
function tuckedUnder(slot: SlotKind): SlotKind | undefined {
  return TUCKING_SLOTS.has(slot) ? (relativeTo(slot) ?? undefined) : undefined;
}

/**
 * A chair and the top it slides under — a dining chair and a dining table, a desk chair and a
 * desk — either way round. The studio lets such a pair overlap freely; the matcher, which puts
 * real products of other sizes into the engine's slots, only for a chair the engine tucked under
 * its top, and only up to half the chair (`placeFitting`).
 *
 * Kept as it was: a piece of a kind that is no archetype (no slot) "tucks under" any piece that is
 * no tucking chair (undefined matches undefined) — so it is in no one's way in the studio's
 * `blockersFor`. A known fault, left for the owner (it changes what the studio lets overlap).
 */
export function tucksUnder(a: Pick<PlacedItem, 'kind'>, b: Pick<PlacedItem, 'kind'>): boolean {
  const p = getArchetype(a.kind)?.slot;
  const q = getArchetype(b.kind)?.slot;
  return (p != null && tuckedUnder(p) === q) || (q != null && tuckedUnder(q) === p);
}

/** Whether a kind's seat slides under a top (`TUCKING_SLOTS`): the chair of a pair that `tucksUnder`. */
export function isTuckingChair(kind: string): boolean {
  const slot = getArchetype(kind)?.slot;
  return slot != null && TUCKING_SLOTS.has(slot);
}

/**
 * The companions the bathroom pass builds for a host, by kind, and the suffix each one's id takes
 * after its host's (`companionId`): the basin's tap, the machine's dryer, the bath's mixer.
 */
const COMPANION_SUFFIX = { tap: 'tap', dryer: 'dryer', bath_mixer: 'mixer' } as const;
const SUFFIXES: readonly string[] = Object.values(COMPANION_SUFFIX);

/** The kinds built as a host's companion: the tap, the dryer, the bath's mixer. */
export const COMPANION_KINDS: ReadonlySet<string> = new Set(Object.keys(COMPANION_SUFFIX));

/** The id of a host's companion of this kind: what links it to its host (`companionsOf`, `hostOf`). */
export function companionId(hostId: string, kind: keyof typeof COMPANION_SUFFIX): string {
  return `${hostId}-${COMPANION_SUFFIX[kind]}`;
}

/** The pieces that travel with a host: its tap, its dryer, its mixer. */
export function companionsOf(itemId: string, items: readonly PlacedItem[]): PlacedItem[] {
  const ids = new Set(SUFFIXES.map((c) => `${itemId}-${c}`));
  return items.filter((i) => ids.has(i.id));
}

/** The id of the host a companion's id names (the basin of its tap), or null for an id that is no companion's. */
export function hostIdOf(id: string): string | null {
  const suffix = SUFFIXES.find((c) => id.endsWith(`-${c}`));
  return suffix ? id.slice(0, -(suffix.length + 1)) : null;
}

/** The host a companion travels with (the basin of its tap, the machine of its dryer, the bath of its mixer), or null. */
export function hostOf(item: Pick<PlacedItem, 'id' | 'roomId'>, items: readonly PlacedItem[]): PlacedItem | null {
  const hostId = hostIdOf(item.id);
  if (hostId == null) return null;
  return items.find((i) => i.id === hostId && i.roomId === item.roomId) ?? null;
}
