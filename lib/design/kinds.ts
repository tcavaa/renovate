/**
 * The named sets of slots and kinds: each list of pieces that means one thing, in one place, under
 * a name that says what it is. A reader that asks "is this one of those" asks here rather than
 * listing the pieces again. Two sets that differ on purpose have two names, and each says how.
 *
 * A comparison that reads clearly where it stands ("a TV hangs over its unit") stays where it is;
 * what belongs here is a list of pieces that more than one reader means. Who belongs to whom is
 * `lib/design/relations`. Pure data, no React, no `window`.
 */

import { getArchetype, kindsOfSlot } from './catalog';
import { COMPANION_KINDS } from './relations';
import type { SlotKind } from './types';

/**
 * Laid to something else: the rug to the piece it lies under, the curtain to its window. Sized by
 * the layout engine, not by its product, and never a piece standing against a wall or across a
 * window — what the fit, the window test, the wall's free stretches and the checks pass over.
 */
export const LAID_TO_ANOTHER: ReadonlySet<SlotKind> = new Set<SlotKind>(['rug', 'curtain']);

/**
 * What the layout sizes itself, so a product's own width is no question of fit or of ranking: the
 * kitchen run, stretched to its wall, besides what is laid to another piece (`LAID_TO_ANOTHER`).
 */
export const SIZED_BY_LAYOUT: ReadonlySet<SlotKind> = new Set<SlotKind>(['kitchen_run', ...LAID_TO_ANOTHER]);

/**
 * Lies flat on the floor or hangs at a window — nothing to walk or stand into, solid or not: what is
 * laid to another piece (`LAID_TO_ANOTHER`) and the door mat, which lies flat too but at the front
 * door, its own size (so not one of those).
 */
export const LIES_FLAT: ReadonlySet<SlotKind> = new Set<SlotKind>([...LAID_TO_ANOTHER, 'door_mat']);

/**
 * What never stands in front of a wall: it lies flat or dresses a window (`LIES_FLAT`), or hangs
 * from the ceiling (the pendant). One list for every reader of what stands before a wall —
 * `wallBlocks` (the fittings, the radiators, the technical points) and the joinery's `freeStretch`
 * (`decor/joinery.ts`, which leaves out more of its own: what hangs over joinery and what rides on
 * a piece, `OVER_JOINERY`).
 */
export const NOT_IN_THE_WAY: ReadonlySet<SlotKind> = new Set<SlotKind>([...LIES_FLAT, 'pendant']);

/** The kitchen's pieces that can be made to measure: the run, the wall cabinets, the island (`lib/design/kitchen`). */
export const CUSTOM_KITCHEN_SLOTS = ['kitchen_run', 'kitchen_wall', 'kitchen_island'] as const;

export type KitchenSlot = (typeof CUSTOM_KITCHEN_SLOTS)[number];

/** Whether a slot (or a product's 3D kind) is one of the kitchen's pieces made to measure (`CUSTOM_KITCHEN_SLOTS`). */
export function isCustomKitchenSlot(slot: string | null | undefined): slot is KitchenSlot {
  return (CUSTOM_KITCHEN_SLOTS as readonly (string | null | undefined)[]).includes(slot);
}

/** The kinds that fill the kitchen's made-to-measure slots — the run, the wall cabinets, the island: what the engine furnishes itself. */
export const CUSTOM_KITCHEN_KINDS: ReadonlySet<string> = new Set(CUSTOM_KITCHEN_SLOTS.flatMap((slot) => kindsOfSlot(slot)));

/** The slots of a host's companions (`COMPANION_KINDS` in `lib/design/relations`): the tap, the dryer, the bath's mixer. */
export const COMPANION_SLOTS: ReadonlySet<SlotKind> = new Set([...COMPANION_KINDS].flatMap((kind) => getArchetype(kind)?.slot ?? []));

/** Where one bathes: a shower or a bath — what wets the floor round it, needs a drain and keeps the boiler away. */
export const BATH_OR_SHOWER: ReadonlySet<SlotKind> = new Set<SlotKind>(['shower', 'bathtub']);
