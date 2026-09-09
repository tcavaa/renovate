import { blockingItems, footprintOf, type Footprint } from './manipulate';
import { pointOnEdge, polygonBounds, roomEdges } from './planGeometry';
import type { PlacedItem, PlanRoom } from './types';

/**
 * Passages a person would not get through.
 *
 * Only the cases that bite on delivery day: a big piece (a bed, a sofa, a wardrobe) that
 * leaves less than a shoulder between its long side and a wall, two big pieces with a
 * sliver between them, or anything standing in a doorway. Small things — chairs at a table,
 * a nightstand, a plant — are never in the way, and pieces that touch are not a passage at
 * all. Rugs, lamps and anything floating do not count.
 */
export const MIN_WALL_PASSAGE_M = 0.6;
export const MIN_ITEM_PASSAGE_M = 0.35;
export const DOOR_CLEARANCE_M = 0.3;
const TOUCHING_M = 0.05;
/** A piece counts as big when it is at least this large and this long. */
const LARGE_AREA_M2 = 0.8;
const LARGE_SIDE_M = 1.2;

export interface TightSpot {
  itemId: string;
  /** The narrowest passage found for this item, metres. */
  gapM: number;
  /** `wall`, `door`, or the id of the other item. */
  against: string;
}

export function tightSpots(room: PlanRoom, items: PlacedItem[]): TightSpot[] {
  const floorItems = blockingItems(items, room.id, '');
  const boxes = floorItems.map((item) => ({ item, box: footprintOf(item.position, item.size, item.rotation), large: isLarge(item) }));
  const bounds = polygonBounds(room.polygon);
  const worst = new Map<string, TightSpot>();
  const note = (itemId: string, gapM: number, against: string) => {
    const current = worst.get(itemId);
    if (!current || gapM < current.gapM) worst.set(itemId, { itemId, gapM, against });
  };

  // Doorways: a person just inside the door needs the floor there.
  const edges = roomEdges(room.polygon);
  const doorPoints = room.openings
    .filter((o) => o.kind !== 'window')
    .map((o) => {
      const edge = edges.find((e) => e.index === o.wallIndex);
      if (!edge) return null;
      const on = pointOnEdge(edge, o.t);
      return { x: on.x + edge.inward.x * 0.45, z: on.z + edge.inward.z * 0.45 };
    })
    .filter((p): p is { x: number; z: number } => p != null);
  for (const { item, box } of boxes) {
    for (const p of doorPoints) {
      const dx = Math.max(box.minX - p.x, 0, p.x - box.maxX);
      const dz = Math.max(box.minZ - p.z, 0, p.z - box.maxZ);
      const distance = Math.hypot(dx, dz);
      if (distance < DOOR_CLEARANCE_M) note(item.id, distance, 'door');
    }
  }

  // Big pieces: the passage along their long side.
  for (const { item, box, large } of boxes) {
    if (!large) continue;
    const alongX = box.maxX - box.minX >= box.maxZ - box.minZ;
    const gaps = alongX ? [box.minZ - bounds.minZ, bounds.maxZ - box.maxZ] : [box.minX - bounds.minX, bounds.maxX - box.maxX];
    for (const gap of gaps) if (gap > TOUCHING_M && gap < MIN_WALL_PASSAGE_M) note(item.id, gap, 'wall');
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (!boxes[i].large || !boxes[j].large) continue;
      const gap = gapBetween(boxes[i].box, boxes[j].box);
      if (gap != null && gap > TOUCHING_M && gap < MIN_ITEM_PASSAGE_M) {
        note(boxes[i].item.id, gap, boxes[j].item.id);
        note(boxes[j].item.id, gap, boxes[i].item.id);
      }
    }
  }
  return [...worst.values()].map((t) => ({ ...t, gapM: Math.round(t.gapM * 100) / 100 }));
}

function isLarge(item: PlacedItem): boolean {
  const { width, depth } = item.size;
  return width * depth >= LARGE_AREA_M2 && Math.max(width, depth) >= LARGE_SIDE_M;
}

/** The passage between two boxes that face each other — null when they overlap or are diagonal to each other. */
export function gapBetween(a: Footprint, b: Footprint): number | null {
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (overlapX > 0 && overlapZ > 0) return null; // overlapping, not a passage
  if (overlapX > 0) return Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ);
  if (overlapZ > 0) return Math.max(a.minX - b.maxX, b.minX - a.maxX);
  return null;
}

/** Every tight spot in the flat, keyed by item. */
export function tightSpotsByItem(rooms: PlanRoom[], items: PlacedItem[]): Map<string, TightSpot> {
  const map = new Map<string, TightSpot>();
  for (const room of rooms) {
    for (const spot of tightSpots(room, items.filter((i) => i.roomId === room.id))) map.set(spot.itemId, spot);
  }
  return map;
}
