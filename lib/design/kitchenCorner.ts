/**
 * A corner kitchen (the owner's notes of 13 Nov 2026: "the user should be able to make a corner
 * kitchen, L shaped … as furniture, as the kitchen one"). A made-to-measure run stays one straight
 * piece on its wall; the corner is more kitchen furniture — a leg of base units along the wall
 * round the corner from one of the run's ends and, when wall cabinets hang over the run, wall
 * cabinets over the leg. Each is a `PlacedItem` copied from the run's own piece (its product, its
 * material, its model), named for its run (`legOf`, `legCorner`).
 *
 * - **Where it stands.** The run fills its corner (it is stretched to it, when that fits), so the
 *   leg starts at the run's front along the next wall and goes as far as the wall is clear — under
 *   a window whose sill is at the worktop or over it, never across a door or into furniture —
 *   1.8 m unless the person sets its length, at least 60 cm.
 * - **What it is and costs.** A made-to-measure kitchen piece like the run: its own card (length,
 *   material), its own `kitchen:<id>` budget line by the m² of its façade at the material's price.
 *   Its model is the run's, drawn without the sink and the hob (`buildPlacedItem`).
 * - **It is furniture**: moved and deleted like any piece; it goes only with a run that is deleted
 *   or became a shop's unit (`withoutOrphanLegs`).
 * - **Generation** lays one by itself in a kitchen whose run is short of what a kitchen needs and
 *   whose next wall is free (`fitKitchenCorners`).
 *
 * Pure: no React, no three.js.
 */

import { backWall } from './decor/housing';
import { freeStretch } from './decor/joinery';
import { footprintInRoom, footprintOf, footprintsOverlap } from './manipulate';
import { getArchetype } from './catalog';
import { isCustomKitchenItem, kitchenFacadeM2, LOWER_UNIT_HEIGHT_M } from './kitchen';
import { roomEdges, type PlanEdge } from './planGeometry';
import type { DecorPiece, PlacedItem, PlanRoom, TechnicalPoint } from './types';

export type KitchenCorner = 'left' | 'right';

/** The shortest and the longest a leg is made, and what it is made at unless the person says. */
export const KITCHEN_LEG_M = { min: 0.6, max: 4, initial: 1.8 } as const;
/** A run shorter than this is short of a kitchen: the generation turns the corner when it can. */
export const KITCHEN_L_UNDER_M = 2.6;
/** The floor a leg keeps clear in front of it for the generation to build one: its depth and the way to it. */
const LEG_WORKING_FLOOR_M = 0.9;
/** How far short of its corner a run may stand and still count as in it. */
const IN_CORNER_M = 0.03;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The flat's radiators as things a leg (and a run stretched into its corner) may not be built over:
 * a block 90 cm square round each, off the floor. They hang on the plan, not among the furniture,
 * so the callers put these with the items they pass.
 */
export function radiatorObstacles(points: readonly TechnicalPoint[] | undefined): PlacedItem[] {
  return (points ?? [])
    .filter((p) => p.kind === 'radiator' && !!p.roomId)
    .map((p) => ({ id: `radiator:${p.id}`, roomId: p.roomId!, slot: 'wardrobe' as const, kind: 'wardrobe', position: p.position, rotation: 0, elevationM: p.elevationM ?? 0.12, size: { width: 0.9, depth: 0.9, height: 0.6 }, product: null, locked: true }));
}

/** The corner leg of a kitchen run — its base units — when it has one. */
export function kitchenLegOf(runId: string, items: readonly PlacedItem[]): PlacedItem | null {
  return items.find((i) => i.legOf === runId && i.slot === 'kitchen_run') ?? null;
}

/** Everything a run's corner is made of: the leg and the wall cabinets over it. */
export function kitchenLegsOf(runId: string, items: readonly PlacedItem[]): PlacedItem[] {
  return items.filter((i) => i.legOf === runId);
}

/** A leg's length along its wall, metres. */
export function kitchenLegLength(leg: Pick<PlacedItem, 'size'>): number {
  return round3(leg.size.width);
}

interface CornerSpot {
  /** The run's wall, and where the run stands along it. */
  edge: PlanEdge;
  from: number;
  to: number;
  /** The wall round the corner, and where along it the leg begins (a run's depth from the corner) and which way it grows. */
  next: PlanEdge;
  start: number;
  grows: 1 | -1;
  /** How far the run's end is from the corner. */
  gap: number;
}

/**
 * The corner at one end of a run: the wall the run stands on and the wall that meets it there at a
 * right angle, turning into the room. Null for a run off its wall, an end at an open side of the
 * room (a studio's line), or a corner that turns away.
 */
export function kitchenCorner(run: PlacedItem, room: PlanRoom, corner: KitchenCorner): CornerSpot | null {
  const wall = backWall(run, room, 0.3);
  if (!wall) return null;
  const edges = roomEdges(room.polygon);
  const { edge } = wall;
  const from = wall.along - run.size.width / 2;
  const to = wall.along + run.size.width / 2;
  const open = room.open ?? [];
  // Where the run's front is: the leg begins there, so the two meet and never overlap.
  const front = Math.max(0, wall.gap) + run.size.depth;
  if (corner === 'right') {
    const next = edges.find((e) => Math.hypot(e.a.x - edge.b.x, e.a.z - edge.b.z) < 0.01);
    if (!next || open.includes(next.index) || next.dir.x * edge.inward.x + next.dir.z * edge.inward.z < 0.9) return null;
    return { edge, from, to, next, start: front, grows: 1, gap: edge.length - to };
  }
  const next = edges.find((e) => Math.hypot(e.b.x - edge.a.x, e.b.z - edge.a.z) < 0.01);
  if (!next || open.includes(next.index) || next.dir.x * edge.inward.x + next.dir.z * edge.inward.z > -0.9) return null;
  return { edge, from, to, next, start: next.length - front, grows: -1, gap: from };
}

/** Whether a kitchen piece stands inside its room and on nothing at its height (`stretchedKitchen`'s test). */
function stands(item: PlacedItem, room: PlanRoom, items: readonly PlacedItem[]): boolean {
  const footprint = footprintOf(item.position, item.size, item.rotation);
  if (!footprintInRoom(footprint, room.polygon)) return false;
  const top = item.elevationM + item.size.height;
  return !items.some((other) => other.roomId === item.roomId && other.id !== item.id && !getArchetype(other.kind)?.ghost && other.elevationM < top - 0.01 && other.elevationM + other.size.height > item.elevationM + 0.01 && footprintsOverlap(footprint, footprintOf(other.position, other.size, other.rotation)));
}

/** The run with one end in its corner: stretched to it from its other end. Null where that would stand on something. */
export function runIntoCorner(run: PlacedItem, room: PlanRoom, corner: KitchenCorner, items: readonly PlacedItem[]): PlacedItem | null {
  const spot = kitchenCorner(run, room, corner);
  if (!spot) return null;
  if (spot.gap <= IN_CORNER_M) return run;
  const width = round3(run.size.width + spot.gap);
  const shift = (spot.gap / 2) * (corner === 'right' ? 1 : -1);
  const next: PlacedItem = { ...run, size: { ...run.size, width }, position: { x: round3(run.position.x + spot.edge.dir.x * shift), z: round3(run.position.z + spot.edge.dir.z * shift) } };
  return stands(next, room, items) ? next : null;
}

/** The run at another length with its corner end kept in its corner. Null where it would not stand. */
export function runFromCorner(run: PlacedItem, room: PlanRoom, corner: KitchenCorner, widthM: number, items: readonly PlacedItem[]): PlacedItem | null {
  const spot = kitchenCorner(run, room, corner);
  if (!spot) return null;
  const width = round3(widthM);
  // Its middle half the new length in from the corner.
  const centre = corner === 'right' ? spot.edge.length - width / 2 : width / 2;
  const off = (run.position.x - spot.edge.a.x) * spot.edge.inward.x + (run.position.z - spot.edge.a.z) * spot.edge.inward.z;
  const next: PlacedItem = { ...run, size: { ...run.size, width }, position: { x: round3(spot.edge.a.x + spot.edge.dir.x * centre + spot.edge.inward.x * off), z: round3(spot.edge.a.z + spot.edge.dir.z * centre + spot.edge.inward.z * off) } };
  return stands(next, room, items) ? next : null;
}

/** A copy of a kitchen piece at another length, bought again by the façade it now has. */
function resized(item: PlacedItem, width: number): PlacedItem {
  const next = { ...item, size: { ...item.size, width: round3(width) } };
  if (!next.kitchenMaterial) return next;
  const qty = kitchenFacadeM2(next);
  return { ...next, kitchenMaterial: { ...next.kitchenMaterial, qty, totalPrice: Math.round(next.kitchenMaterial.pricePerUnit * qty * 100) / 100 } };
}

/**
 * The corner of a run standing in it: a leg `lengthM` long, or as long as its wall is clear to
 * (`KITCHEN_LEG_M`) — under a window whose sill is at the worktop or over it, never across a door,
 * into furniture `clearM` in front of the wall or into joinery — and, when wall cabinets hang over
 * the run, wall cabinets over the leg from the corner out to the first window. Each is a copy of
 * the run's own piece (its product, its material, its model), so the corner is the same kitchen,
 * and furniture like the run: selected, moved, swapped and priced as a kitchen piece. Empty with
 * no corner, a run short of it, or less than 60 cm of clear wall beside it.
 */
export function kitchenLeg(run: PlacedItem, room: PlanRoom, corner: KitchenCorner, items: readonly PlacedItem[], decor: readonly DecorPiece[], lengthM: number = KITCHEN_LEG_M.initial, clearM = 0): PlacedItem[] {
  if (!isCustomKitchenItem(run)) return [];
  const spot = kitchenCorner(run, room, corner);
  const wall = backWall(run, room, 0.3);
  if (!spot || !wall || spot.gap > IN_CORNER_M) return [];
  const others = items.filter((i) => i.id !== run.id && i.legOf !== run.id);
  const height = Math.min(run.size.height, LOWER_UNIT_HEIGHT_M);
  const depth = Math.min(0.9, Math.max(0.3, run.size.depth));
  // A window with its sill at the worktop or over it is no obstacle to base units (a sill at 90 cm
  // over a 90 cm worktop is how kitchens are built).
  const under = { ...room, openings: room.openings.filter((o) => !(o.kind === 'window' && o.sillM >= height - 0.03)) };
  const probe = spot.start + spot.grows * 0.3;
  const stretch = freeStretch(under, spot.next, probe, others, [], depth + clearM, decor);
  if (!stretch) return [];
  // Nothing between the run and its leg: the clear wall has to begin where the run ends.
  const reach = spot.grows > 0 ? stretch[1] - spot.start : spot.start - stretch[0];
  const tight = spot.grows > 0 ? stretch[0] <= spot.start + 0.02 : stretch[1] >= spot.start - 0.02;
  const length = round3(Math.min(KITCHEN_LEG_M.max, Math.max(KITCHEN_LEG_M.min, lengthM), reach));
  if (!tight || length < KITCHEN_LEG_M.min - 1e-6) return [];
  const from = spot.grows > 0 ? spot.start : spot.start - length;
  const on = (along: number, off: number) => ({ x: round3(spot.next.a.x + spot.next.dir.x * along + spot.next.inward.x * off), z: round3(spot.next.a.z + spot.next.dir.z * along + spot.next.inward.z * off) });
  const copy = (piece: PlacedItem, id: string, width: number, middle: number, gap: number): PlacedItem => ({
    ...resized(piece, width),
    id,
    legOf: run.id,
    legCorner: corner,
    position: on(middle, gap + piece.size.depth / 2),
    rotation: spot.next.facing,
    pinned: true,
    locked: false,
    mirrored: false,
  });
  const out = [copy(run, `${run.id}-leg`, length, from + length / 2, Math.max(0, wall.gap))];
  // The run's wall cabinets turn the corner too: over the leg, and back into the corner flush
  // against the front of the run's own (shallower) wall cabinets — a corner unit, with no gap —
  // never across a window.
  const hung = others.find((i) => i.roomId === room.id && i.slot === 'kitchen_wall' && backWall(i, room, 0.3)?.edge.index === spot.edge.index);
  if (hung) {
    const hungGap = Math.max(0, backWall(hung, room, 0.3)?.gap ?? 0);
    const back = Math.max(0, (spot.grows > 0 ? spot.start : spot.next.length - spot.start) - hungGap - hung.size.depth);
    let a = spot.grows > 0 ? from - back : from;
    let b = spot.grows > 0 ? from + length : from + length + back;
    for (const o of room.openings) {
      if (o.wallIndex !== spot.next.index || o.kind === 'railing' || o.sillM + o.heightM <= hung.elevationM - 0.05) continue;
      const w0 = o.t * spot.next.length - o.widthM / 2 - 0.05;
      const w1 = o.t * spot.next.length + o.widthM / 2 + 0.05;
      if (w1 <= a || w0 >= b) continue;
      if (spot.grows > 0) b = Math.min(b, w0);
      else a = Math.max(a, w1);
    }
    if (b - a >= 0.3) out.push(copy(hung, `${run.id}-leg-wall`, b - a, (a + b) / 2, hungGap));
  }
  return out;
}

/**
 * The furniture without the corners of runs that are gone or are a shop's unit now — a corner is
 * its run's. A leg is furniture otherwise: it stays where it is put. The same array when nothing went.
 */
export function withoutOrphanLegs(items: PlacedItem[]): PlacedItem[] {
  if (!items.some((i) => i.legOf)) return items;
  const runs = new Set(items.filter((i) => !i.legOf && isCustomKitchenItem(i)).map((i) => i.id));
  const kept = items.filter((i) => !i.legOf || runs.has(i.legOf));
  return kept.length === items.length ? items : kept;
}

/**
 * The generation's corner kitchens: a made-to-measure run shorter than a kitchen needs
 * (`KITCHEN_L_UNDER_M`) turns the corner at the end with more clear wall, the working floor in
 * front of the leg free and no radiator under it — the run stretched into that corner first.
 */
export function fitKitchenCorners(rooms: readonly PlanRoom[], itemsIn: PlacedItem[], decor: readonly DecorPiece[], points: readonly TechnicalPoint[] = []): PlacedItem[] {
  const radiators = radiatorObstacles(points);
  let items = itemsIn;
  for (const run of itemsIn.filter((i) => i.slot === 'kitchen_run' && isCustomKitchenItem(i) && !i.legOf)) {
    const room = rooms.find((r) => r.id === run.roomId);
    if (!room || run.size.width >= KITCHEN_L_UNDER_M || kitchenLegOf(run.id, items)) continue;
    let best: { run: PlacedItem; legs: PlacedItem[] } | null = null;
    for (const corner of ['left', 'right'] as const) {
      // The radiators hang where they hang: no leg and no stretched run over one.
      const others = [...items.filter((i) => i.id !== run.id), ...radiators];
      const stretched = runIntoCorner(run, room, corner, others);
      // Only a run that is all but in its corner: one stretched a metre is another kitchen.
      if (!stretched || stretched.size.width - run.size.width > 0.6) continue;
      const legs = kitchenLeg(stretched, room, corner, others, decor, KITCHEN_LEG_M.initial, LEG_WORKING_FLOOR_M);
      if (legs.length > 0 && kitchenLegLength(legs[0]) >= 0.9 && (!best || kitchenLegLength(legs[0]) > kitchenLegLength(best.legs[0]))) best = { run: stretched, legs };
    }
    if (!best) continue;
    const { run: placed, legs } = best;
    items = [...items.map((i) => (i.id === run.id ? placed : i)), ...legs.map((leg) => ({ ...leg, pinned: false, origin: run.origin }))];
  }
  return items;
}
