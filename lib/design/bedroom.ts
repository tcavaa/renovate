/**
 * A bedroom's wall of wardrobe (the rulebook, 6 Nov 2026 — B-9, B-10): when the wall the wardrobe
 * stands on is otherwise empty — its free stretch is the whole side, or a niche — the joiner builds
 * a wardrobe filling it, to the ceiling, in the flat's joinery material (`cabinet` decor,
 * `joinery.ts`), in place of the shop's wardrobe; and a room with a full-length wardrobe has no
 * chest of drawers besides (a desk or a dressing table with its mirror may stay).
 *
 * Pure: `generateScene` runs it after the hall pass.
 */

import { getArchetype } from './catalog';
import type { CatalogProduct } from './matcher';
import type { PlanEdge } from './planGeometry';
import { floorTaken } from './shower';
import type { CabinetSection, DecorPiece, PlacedItem, PlanRoom, SlotKind, StyleId } from './types';
import { footprintQuad, quadsOverlap, WARDROBE_DEPTH_M, SHALLOW_WARDROBE_DEPTH_M } from './rules';
import { cabinetPiece, freeStretch, joineryFace, joineryMaterial, wallOf } from './decor/joinery';
import type { RadiatorBody } from './radiators';

/** The share of the wall the free stretch must take to count as "the whole side". */
const WHOLE_SIDE = 0.85;
/** Narrower than this a wall of wardrobe is not worth building. */
const MIN_BUILT_M = 1.2;
/** The longest one section runs before the next begins (the joiner's carcasses). */
const SECTION_MAX_M = 1.2;

export interface BedroomInput {
  rooms: readonly PlanRoom[];
  items: PlacedItem[];
  catalog: CatalogProduct[];
  styleId: StyleId;
  /** The flat's radiators (`radiatorBodies`): a wall of wardrobe is not built over one. */
  radiators?: readonly RadiatorBody[];
}

export function fitWardrobes(input: BedroomInput): { items: PlacedItem[]; decor: DecorPiece[] } {
  const { rooms, catalog, styleId } = input;
  let items = [...input.items];
  const decor: DecorPiece[] = [];
  const face = joineryFace(joineryMaterial(catalog, styleId, items));
  for (const room of rooms) {
    if (room.type !== 'bedroom') continue;
    const wardrobe = items.find((i) => i.roomId === room.id && i.slot === 'wardrobe');
    const wall = wardrobe ? wallOf(wardrobe, room) : null;
    if (!wardrobe || !wall) continue;
    const depth = wardrobe.size.depth < 0.5 ? SHALLOW_WARDROBE_DEPTH_M : WARDROBE_DEPTH_M;
    const stretch = freeStretch(room, wall.edge, wall.along, items, [wardrobe.id], depth, [], [], { radiators: input.radiators, strict: true });
    if (!stretch) continue;
    const length = stretch[1] - stretch[0];
    if (length < MIN_BUILT_M || length < wall.edge.length * WHOLE_SIDE - 1e-6) continue;
    // Its doors open into the room: the floor in front of the whole wall of it is kept as clear as
    // the engine keeps it before a wardrobe; where something stands there, the shop's wardrobe stays.
    if (!clearInFront(room, wall.edge, stretch, depth, items, [wardrobe.id])) continue;
    // Sections of equal width, none over 1.2 m: the inside divided as the joiner builds it.
    const count = Math.max(1, Math.ceil(length / SECTION_MAX_M - 1e-6));
    const sections: CabinetSection[] = Array.from({ length: count }, () => ({ kind: 'doors' as const, widthMm: Math.round((length / count) * 1000), heightMm: Math.round(room.heightM * 1000), depthMm: Math.round(depth * 1000) }));
    decor.push(cabinetPiece(`decor-${room.id}-wardrobe-wall`, room, wall.edge, stretch[0], sections, face));
    // The shop's wardrobe gives way to it, and so does a chest of drawers (B-10).
    items = items.filter((i) => i.id !== wardrobe.id && !(i.roomId === room.id && i.slot === 'dresser'));
  }
  return { items, decor };
}

/** What lies on the floor or hangs over it, in nobody's way before a wardrobe's doors — and the chest of drawers, which gives way to the wall of wardrobe. */
const OUT_OF_THE_WAY = new Set<SlotKind>(['rug', 'door_mat', 'curtain', 'dresser']);

/**
 * Whether the floor in front of joinery `depth` deep on `edge` over `stretch` is clear for its
 * doors: as deep as the clear floor the layout keeps before a wardrobe (`clearanceM` of the
 * wardrobe's archetype), nothing standing on it but what is out of the way.
 */
export function clearInFront(room: PlanRoom, edge: PlanEdge, stretch: readonly [number, number], depth: number, items: readonly PlacedItem[], except: readonly string[] = []): boolean {
  const rule = getArchetype('wardrobe')?.placement;
  const clear = rule && 'clearanceM' in rule ? rule.clearanceM : 0;
  const at = (s: number, off: number) => ({ x: edge.a.x + edge.dir.x * s + edge.inward.x * off, z: edge.a.z + edge.dir.z * s + edge.inward.z * off });
  const band = [at(stretch[0], depth), at(stretch[1], depth), at(stretch[1], depth + clear), at(stretch[0], depth + clear)];
  return !items.some((i) => i.roomId === room.id && !except.includes(i.id) && i.elevationM < 0.05 && !OUT_OF_THE_WAY.has(i.slot) && quadsOverlap(band, footprintQuad(floorTaken(i))));
}
