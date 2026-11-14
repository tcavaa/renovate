/**
 * What is fitted to the furniture, kept where the furniture is (the owner's notes of 13 Nov 2026):
 * the joinery and boxes built round a piece (`lib/design/decor/housing`), a kitchen run's corner
 * leg (`lib/design/kitchenCorner`) and a shower's glass (`lib/design/shower`). The store runs
 * these after every change to the furniture, and when a piece is set down from the catalogue.
 *
 * Pure: no React, no three.js.
 */

import { houseItem, housingOf, followHoused, HOUSING_OF_SLOT } from './decor/housing';
import { withoutOrphanLegs } from './kitchenCorner';
import { isBuiltInBath } from './productRoles';
import { WET_ROOM_TYPES } from './rules';
import { withShowerArea } from './shower';
import type { DecorMaterial, DecorPiece, DecorSlot, PlacedItem, PlanRoom, StyleId } from './types';

export interface Fitted {
  items: PlacedItem[];
  decor: DecorPiece[];
}

/** After the furniture changed: every housing where its piece stands, and no corner leg left of a kitchen run that is gone. */
export function settleFitted(decor: DecorPiece[], items: PlacedItem[], rooms: readonly PlanRoom[]): Fitted {
  const housed = followHoused(decor, items, rooms);
  // A corner leg was joinery once; it is kitchen furniture now, and such a piece is not kept.
  const kept = housed.decor.some((d) => d.params.corner) ? housed.decor.filter((d) => !d.params.corner) : housed.decor;
  return { items: withoutOrphanLegs(housed.items), decor: kept };
}

/**
 * Whether a piece set down from the catalogue is given its housing unasked, as the generation
 * gives it (`lib/design/bathroom`): a WC its box always; a washing machine its column and a
 * countertop basin in a bathroom its vanity in every style but Vintage, whose machine stands free
 * and whose basin stands on its own; a bath its tiled box when it is a built-in one, or in Vintage.
 */
export function takesHousing(item: PlacedItem, room: Pick<PlanRoom, 'type'>, styleId: StyleId): boolean {
  const vintage = styleId === 'vintage';
  switch (HOUSING_OF_SLOT[item.slot]) {
    case 'wc':
      return true;
    case 'column':
      return !vintage;
    case 'vanity':
      return !vintage && WET_ROOM_TYPES.includes(room.type) && item.size.height < 0.5;
    case 'bath':
      return vintage || isBuiltInBath(item.product);
    default:
      return false;
  }
}

/** Whether a piece could be given a housing it does not have: the card's "add" button. */
export function lacksHousing(item: PlacedItem, decor: readonly DecorPiece[]): boolean {
  if (item.slot === 'shower') return !item.areaM;
  return !!HOUSING_OF_SLOT[item.slot] && !housingOf(item.id, decor);
}

/**
 * A piece set down (`force`: asked for on its card) with what is built for it: a shower its floor
 * and glass, the others their housing in the joiner's `face`. Null when it takes none or there is
 * no wall or room for it where it stands.
 */
export function withFitted(itemId: string, rooms: readonly PlanRoom[], items: PlacedItem[], decor: DecorPiece[], styleId: StyleId, face?: Partial<Record<DecorSlot, DecorMaterial>>, force = false): Fitted | null {
  const item = items.find((i) => i.id === itemId);
  const room = item && rooms.find((r) => r.id === item.roomId);
  if (!item || !room) return null;
  if (item.slot === 'shower') {
    const next = withShowerArea(item);
    return next === item ? null : { items: items.map((i) => (i.id === itemId ? next : i)), decor };
  }
  if (!force && !takesHousing(item, room, styleId)) return null;
  return houseItem(item, rooms, items, decor, face);
}
