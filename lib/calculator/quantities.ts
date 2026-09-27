import type { aggregateRoomTotals } from './materials';
import type { Room, SelectedProduct } from './types';

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
 * The quantity for one room on its own, for a per-room pick whose surface is not known (a
 * finish category the seeds do not make, sent without its surface). Every pick the catalogue
 * step makes knows its surface and is counted by `roomFinishQuantity` instead.
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
 * Calculator selection keys: `<slug>_global` is a product chosen for the whole flat (a socket,
 * a door), `<slug>_room:<roomId>` a room's floor or walls (`lib/calculator/roomFinishes`), and
 * `<slug>_item:<productId>` a floor or wall material from the cart that was laid on the rooms
 * by hand on the placement step, until September 2026 — no longer made, still read, and moved
 * onto the rooms when its project opens (`migrateFinishPicks`).
 *
 * A room's surface in more than one product adds a part after the room: `/<part>` — the
 * floor's second product (`floor2`), or one product over the walls it was chosen for one by
 * one (`walls<productId>`). What the pick covers is on the pick itself (`share`, `walls`); the
 * part only keeps the keys apart. Room ids come from nanoid (no colons, no slashes).
 */
export function selectionKey(categorySlug: string, roomId?: string | null, part?: string | null): string {
  if (!roomId) return `${categorySlug}_global`;
  return part ? `${categorySlug}_room:${roomId}/${part}` : `${categorySlug}_room:${roomId}`;
}

/** The key a finish had in the cart (one per product), before every room took its own. */
export function cartKey(categorySlug: string, productId: number): string {
  return `${categorySlug}_item:${productId}`;
}

/** A cart key — a finish whose quantity was the area it was laid on by hand (see `selectionKey`). */
export function isCartKey(key: string): boolean {
  return /_item:\d+$/.test(key);
}

/** The category slug a calculator selection key was made from (`laminate_global` → `laminate`). */
export function categorySlugFromKey(key: string): string {
  return key.replace(/_room:.*$/, '').replace(/_item:\d+$/, '').replace(/_global$/, '');
}

/** Cutting waste on a finish bought by the square metre: a tenth more tiles or boards than the floor measures. */
const FINISH_WASTE: Record<string, number> = { 'floor-tiles': 1.1, laminate: 1.1, 'wall-tiles': 1.1 };

/**
 * How many units of a finish an area comes to: square metres with the category's cutting
 * waste for a product sold by the m², tins for a paint (its own coverage, one coat, eight m²
 * a litre when the row says nothing), one unit per whatever else covers a square metre. Zero
 * area is zero units.
 */
export function finishPickQuantity(pick: Pick<SelectedProduct, 'unit' | 'categorySlug' | 'coveragePerUnit'>, areaM2: number): number {
  if (!(areaM2 > 0)) return 0;
  if (pick.unit === 'm2') return Math.round(areaM2 * (FINISH_WASTE[pick.categorySlug ?? ''] ?? 1) * 10) / 10;
  const coverage = pick.coveragePerUnit && pick.coveragePerUnit > 0 ? pick.coveragePerUnit : pick.unit === 'liter' ? 8 : 1;
  return Math.ceil(areaM2 / coverage - 1e-9);
}

/** The room a per-room selection key names, or null for a whole-flat key. */
export function roomIdFromKey(key: string): string | null {
  const at = key.indexOf('_room:');
  if (at < 0) return null;
  const rest = key.slice(at + '_room:'.length);
  const slash = rest.indexOf('/');
  return (slash >= 0 ? rest.slice(0, slash) : rest) || null;
}

/** The part a per-room key names after its room (`floor2`, `walls12`), or null for the room's whole surface. */
export function partFromKey(key: string): string | null {
  const at = key.indexOf('_room:');
  const slash = at >= 0 ? key.indexOf('/', at) : -1;
  return slash >= 0 ? key.slice(slash + 1) || null : null;
}

/** The two surfaces a room's finishes cover in the calculator. */
export type FinishSurface = 'floor' | 'wall';

/**
 * The finish categories the seeds make, by the surface they are for — what a pick without a
 * surface of its own is read by, and what the server trusts over the one a pick was sent with.
 * A finish category made in admin (a category whose `calculationType` is `per_m2_floor` or
 * `per_m2_wall`) is not here, and its picks carry their surface themselves.
 */
export const SURFACE_OF_SLUG: Readonly<Record<string, FinishSurface>> = { laminate: 'floor', 'floor-tiles': 'floor', 'wall-tiles': 'wall', paint: 'wall' };

/** The surface a pick covers — its own, else its category's — or null for a pick that is not a finish. */
export function surfaceOfPick(pick: Pick<SelectedProduct, 'surface' | 'categorySlug'>): FinishSurface | null {
  return pick.surface ?? SURFACE_OF_SLUG[pick.categorySlug ?? ''] ?? null;
}

/**
 * A room's area of one surface: its floor, or its walls as the estimate counts them — the
 * perimeter times the height, doors and windows not taken off, the same figure the engine
 * prices the plaster and the painting by (and the server has, where the drawing is not).
 */
export function roomSurfaceAreaM2(room: Pick<Room, 'floorM2' | 'wallM2'>, surface: FinishSurface): number {
  return surface === 'floor' ? room.floorM2 : room.wallM2;
}

type RoomGeometry = Pick<Room, 'floorM2' | 'wallM2' | 'width' | 'length' | 'height' | 'walls'>;

/**
 * A room's walls one by one: each one's length, metres, in the board's order (`Room.walls`); a
 * room that has none recorded is the four sides of its rectangle.
 */
export function roomWalls(room: Pick<Room, 'width' | 'length' | 'walls'>): number[] {
  if (room.walls && room.walls.length >= 3 && room.walls.every((l) => Number.isFinite(l) && l >= 0)) return room.walls;
  return [room.width, room.length, room.width, room.length];
}

/** Each wall's area as the estimate counts a wall — its length times the room's height, doors and windows not taken off. */
export function roomWallAreasM2(room: Pick<Room, 'width' | 'length' | 'height' | 'walls'>): number[] {
  return roomWalls(room).map((length) => Math.round(length * room.height * 100) / 100);
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * The area a room's finish covers: the whole surface, the pick's share of the floor when two
 * products share it, or the walls it was chosen for one by one.
 */
export function roomFinishAreaM2(pick: Pick<SelectedProduct, 'share' | 'walls'>, surface: FinishSurface, room: RoomGeometry): number {
  if (surface === 'floor') return pick.share == null ? room.floorM2 : room.floorM2 * clamp01(pick.share);
  if (!pick.walls) return room.wallM2;
  const areas = roomWallAreasM2(room);
  return [...new Set(pick.walls)].reduce((sum, i) => sum + (areas[i] ?? 0), 0);
}

/**
 * How much of a finish one room takes: the area it covers there (`roomFinishAreaM2`), in the
 * product's units with the cutting waste (`finishPickQuantity`). The catalogue step shows it
 * and the save route stores it — the same function on both sides, so the figure the person saw
 * is the figure saved.
 */
export function roomFinishQuantity(pick: Pick<SelectedProduct, 'unit' | 'categorySlug' | 'coveragePerUnit' | 'share' | 'walls'>, surface: FinishSurface, room: RoomGeometry): number {
  return finishPickQuantity(pick, roomFinishAreaM2(pick, surface, room));
}
