import type { aggregateRoomTotals } from './materials';
import type { Room } from './types';

export type RoomTotals = ReturnType<typeof aggregateRoomTotals>;

/**
 * How many units of a catalogue product a project needs, from the rooms alone.
 *
 * Shared by the calculator's catalogue step (to suggest the quantity) and by the save route
 * (to recompute it), so the number stored is derived from the rooms the user entered, never
 * from a value the browser sent. Pure: no rate book, no database.
 */
export function suggestedQuantity(categorySlug: string, totals: RoomTotals): number {
  switch (categorySlug) {
    case 'floor-tiles':
      // Wet-room floors, with 10 % cutting waste; the whole floor when there is no wet room.
      return Math.round((totals.totalWetRoomM2 || totals.totalFloorM2) * 1.1) || 1;
    case 'laminate': {
      // Dry floors only — laminate does not go into a bathroom.
      const dry = Math.max(0, totals.totalFloorM2 - totals.totalWetRoomM2);
      return Math.round((dry || totals.totalFloorM2) * 1.1) || 1;
    }
    case 'wall-tiles':
      return Math.round(totals.totalWetRoomM2 * 2) || 1;
    case 'paint':
      // Litres: two coats at ~12 m² per litre.
      return Math.round(totals.totalWallM2 * 0.16) || 1;
    case 'doors':
      return totals.doorCount || 1;
    case 'windows':
      return totals.windowCount || 1;
    case 'sanitary':
      return Math.max(1, Math.round(totals.totalWetRoomM2 / 4));
    case 'lighting':
      return Math.max(1, Math.round(totals.totalFloorM2 / 12));
    case 'sockets-switches':
      return Math.max(2, Math.round(totals.totalFloorM2 / 5));
    default:
      return 1;
  }
}

/**
 * The quantity for one room on its own — a floor or wall finish chosen for that room
 * rather than for the whole flat. Same rules as `suggestedQuantity`, applied to the room's
 * own areas: a tile picked for the bathroom covers the bathroom floor, a paint picked for
 * the bedroom covers the bedroom's walls.
 */
export function suggestedQuantityForRoom(categorySlug: string, room: Room): number {
  const floor = room.floorM2;
  const wall = room.wallM2;
  switch (categorySlug) {
    case 'floor-tiles':
    case 'laminate':
      return Math.round(floor * 1.1) || 1;
    case 'wall-tiles':
      return Math.round(wall) || 1;
    case 'paint':
      return Math.round(wall * 0.16) || 1;
    default:
      return 1;
  }
}

/**
 * Calculator selection keys: `<slug>_global` is a product chosen for the whole flat,
 * `<slug>_room:<roomId>` one chosen for a single room. Room ids come from nanoid (no
 * colons), so the room part is everything after the marker.
 */
export function selectionKey(categorySlug: string, roomId?: string | null): string {
  return roomId ? `${categorySlug}_room:${roomId}` : `${categorySlug}_global`;
}

/** The category slug a calculator selection key was made from (`laminate_global` → `laminate`). */
export function categorySlugFromKey(key: string): string {
  return key.replace(/_room:.*$/, '').replace(/_global$/, '');
}

/** The room a per-room selection key names, or null for a whole-flat key. */
export function roomIdFromKey(key: string): string | null {
  const at = key.indexOf('_room:');
  return at >= 0 ? key.slice(at + '_room:'.length) || null : null;
}
