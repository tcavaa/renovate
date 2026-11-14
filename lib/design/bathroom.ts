/**
 * The bathroom pass (the rulebook, 6 Nov 2026 — BA-7 to BA-18): once the layout engine has laid a
 * flat out and the matcher has put products in its slots, every bathroom and toilet is finished the
 * way a joiner and a plumber would finish it:
 *
 * - **The vanity** — in every style but Vintage, a basin set on a cabinet made to measure (`cabinet`
 *   decor, `joinery.ts`): its top under 90 cm, the basin on it, as wide as the wall lets it grow
 *   (from the basin's width and 40 cm, to 1.8 m), run on to a corner rather than leave a sliver.
 *   Vintage keeps its standing basin (pedestal or vanity product).
 * - **A tap on every basin** that is not sold with its own (`includesTap`): on the deck behind the
 *   bowl, or on the wall over it — Vintage's taps on the wall (BA-18).
 * - **The washing machine's column** — never freestanding but in Vintage (BA-12): 65 cm deep, its
 *   sides close round the machine; the column at the end of its wall (BA-14), joined to the vanity
 *   when they share the wall (BA-15, "one piece of furniture with different openings"); a dryer
 *   stacked on the machine inside it at the highest budget (BA-13, G-29).
 * - **The bath** — built in (boxed and tiled) when the product is a built-in one, and in Vintage a
 *   tiled enclosure round a freestanding rectangular bath (BA-16, BA-18); its mixer at its head:
 *   on the wall over a boxed bath, standing on the floor by a freestanding one (BA-17).
 *
 * Pure and isomorphic: the generation (`generateScene`) runs it, and it adds items and decor.
 */

import { candidatesFor, toSceneProduct, type BudgetLevel, type CatalogProduct } from './matcher';
import { getArchetype } from './catalog';
import { includesTap, isBuiltInBath, isFloorTap, isWallTap } from './productRoles';
import { weightedPick, type Rng } from './random';
import { styleAffinity } from './styles';
import { styleRejects } from './styleGuide';
import { pointOnEdge, type PlanEdge } from './planGeometry';
import { WET_ROOM_TYPES } from './rules';
import type { CabinetSection, DecorPiece, PlacedItem, PlanRoom, StyleId } from './types';
import { CARCASS_M, JOINERY_SLIVER_M, VANITY_DEPTH_M, VANITY_MAX_M, VANITY_MIN_M, WASHER_COLUMN_DEPTH_M, cabinetPiece, freeStretch, joineryFace, joineryMaterial, wallOf } from './decor/joinery';
import { defaultDecorMaterial } from './decor/materials';
import { decorMaterialFrom } from './decor/resolve';

export interface BathroomInput {
  /** The rooms as laid out (under their ceilings). */
  rooms: readonly PlanRoom[];
  items: PlacedItem[];
  catalog: CatalogProduct[];
  styleId: StyleId;
  level: BudgetLevel;
  rng?: Rng;
}

/** The widest a vanity grows to on its own; the wall may stop it sooner. */
export const VANITY_GROW_M = 1.8;
/** Room a vanity keeps beside its basin, both sides together. */
const VANITY_ELBOW_M = 0.4;
/** The ceiling a dryer needs over the machine (two machines and the column's top). */
const DRYER_CEILING_M = 2.2;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function fitBathrooms(input: BathroomInput): { items: PlacedItem[]; decor: DecorPiece[] } {
  const { rooms, catalog, styleId, level, rng } = input;
  let items = [...input.items];
  const decor: DecorPiece[] = [];
  const vintage = styleId === 'vintage';
  const material = joineryMaterial(catalog, styleId, items);
  const face = joineryFace(material);
  const pick = (kind: string, keep: (p: CatalogProduct) => boolean = () => true): CatalogProduct | null => {
    const all = candidatesFor(kind, catalog, styleId).filter(keep);
    const kept = all.filter((p) => !styleRejects(p, styleId));
    const pool = kept.length > 0 ? kept : all;
    if (pool.length === 0) return null;
    return rng ? weightedPick(pool, (p) => [1, 3, 10][styleAffinity(styleId, p.styleTags, p.tags)] ?? 1, rng) ?? pool[0] : pool[0];
  };

  for (const room of rooms) {
    const wet = WET_ROOM_TYPES.includes(room.type);
    const vanities = new Map<string, { edge: PlanEdge; from: number; to: number; height: number }>();

    // --- the basins: a vanity under each (but Vintage's), and a tap on each that has none ---
    for (const sink of items.filter((i) => i.roomId === room.id && i.slot === 'sink' && i.product)) {
      const wall = wallOf(sink, room);
      if (!wall) continue;
      let basin = sink;
      if (wet && !vintage && sink.size.height < 0.5) {
        const stretch = freeStretch(room, wall.edge, wall.along, items, [sink.id], VANITY_DEPTH_M);
        if (stretch) {
          const want = Math.min(VANITY_GROW_M, Math.max(sink.size.width + VANITY_ELBOW_M, 0.8));
          let from = Math.max(stretch[0], wall.along - want / 2);
          let to = Math.min(stretch[1], from + want);
          from = Math.max(stretch[0], to - want);
          if (from - stretch[0] < JOINERY_SLIVER_M) from = stretch[0];
          if (stretch[1] - to < JOINERY_SLIVER_M) to = stretch[1];
          if (to - from >= sink.size.width + 0.05) {
            const height = round3(Math.min(VANITY_MAX_M - 0.05, Math.max(VANITY_MIN_M, VANITY_MAX_M - sink.size.height)));
            vanities.set(sink.id, { edge: wall.edge, from, to, height });
            // The basin on the vanity's top, in the middle of its depth.
            const at = pointOnEdge(wall.edge, Math.min(to - sink.size.width / 2, Math.max(from + sink.size.width / 2, wall.along)) / wall.edge.length);
            const off = Math.max(sink.size.depth / 2 + 0.03, VANITY_DEPTH_M / 2);
            basin = { ...sink, elevationM: height, position: { x: at.x + wall.edge.inward.x * off, z: at.z + wall.edge.inward.z * off } };
            items = items.map((i) => (i.id === sink.id ? basin : i));
          }
        }
      }
      if (!includesTap(sink.product)) {
        const onVanity = vanities.has(sink.id);
        const tap = pick('tap', (p) => !isFloorTap(p) && (vintage ? isWallTap(p) : true)) ?? (vintage ? pick('tap', (p) => !isFloorTap(p)) : null);
        if (tap) items.push(tapItem(room, basin, wall.edge, tap, onVanity ? vanities.get(sink.id)!.height : null));
      }
    }

    // --- the washing machine's column (and the dryer on it) ---
    for (const washer of items.filter((i) => i.roomId === room.id && i.slot === 'washer' && i.product)) {
      if (vintage) continue;
      const dryerProduct = level === 'premium' && room.heightM >= DRYER_CEILING_M ? pick('dryer') : null;
      const columnW = round3(washer.size.width + 2 * CARCASS_M + 0.02);
      const columnH = round3(washer.size.height + 0.03 + (dryerProduct ? (dryerProduct.heightCm ?? 86) / 100 + 0.03 : 0));
      const column: CabinetSection = { kind: 'washer', widthMm: mm(columnW), heightMm: mm(columnH), depthMm: mm(WASHER_COLUMN_DEPTH_M), ...(dryerProduct ? { dryer: true } : {}), itemId: washer.id };
      let placedWasher = washer;
      let piece: DecorPiece | null = null;

      // Beside a vanity on the same wall, the column at the wall's end, the gap between filled at the vanity's height.
      const vanityEntry = [...vanities.entries()].find(([, v]) => !!v);
      if (vanityEntry) {
        const [sinkId, v] = vanityEntry;
        const sink = items.find((i) => i.id === sinkId)!;
        const tapIds = items.filter((i) => i.roomId === room.id && i.slot === 'tap').map((i) => i.id);
        const stretch = freeStretch(room, v.edge, (v.from + v.to) / 2, items, [sinkId, washer.id, ...tapIds], WASHER_COLUMN_DEPTH_M);
        if (stretch) {
          const right = stretch[1] - v.to >= columnW;
          const left = v.from - stretch[0] >= columnW;
          // The end with more wall past the vanity first; the column against that end of the stretch.
          const side = right && (!left || stretch[1] - v.to >= v.from - stretch[0]) ? 'right' : left ? 'left' : null;
          if (side) {
            const colFrom = side === 'right' ? stretch[1] - columnW : stretch[0];
            const fillFrom = side === 'right' ? v.to : colFrom + columnW;
            const fillTo = side === 'right' ? colFrom : v.from;
            const vanityH = mm(v.height);
            const basin: CabinetSection = { kind: 'basin', widthMm: mm(v.to - v.from), heightMm: vanityH, depthMm: mm(VANITY_DEPTH_M), itemId: sinkId };
            const fill: CabinetSection[] = fillTo - fillFrom > 0.05 ? [{ kind: 'doors', widthMm: mm(fillTo - fillFrom), heightMm: vanityH, depthMm: mm(VANITY_DEPTH_M) }] : [];
            const sections = side === 'right' ? [basin, ...fill, column] : [column, ...fill, basin];
            const start = side === 'right' ? v.from : colFrom;
            piece = cabinetPiece(`decor-${room.id}-joinery-${sinkId}`, room, v.edge, start, sections, face);
            const mid = colFrom + columnW / 2;
            const at = pointOnEdge(v.edge, mid / v.edge.length);
            const off = washer.size.depth / 2 + 0.02;
            placedWasher = { ...washer, position: { x: at.x + v.edge.inward.x * off, z: at.z + v.edge.inward.z * off }, rotation: v.edge.facing };
            vanities.delete(sinkId);
            void sink;
          }
        }
      }
      if (!piece) {
        // A column of its own where the machine stands.
        const wall = wallOf(washer, room);
        if (wall) {
          const stretch = freeStretch(room, wall.edge, wall.along, items, [washer.id], WASHER_COLUMN_DEPTH_M);
          if (stretch && stretch[1] - stretch[0] >= columnW - 0.01) {
            let from = Math.max(stretch[0], Math.min(stretch[1] - columnW, wall.along - columnW / 2));
            // At the end of the wall when that is a sliver away (BA-14).
            if (from - stretch[0] < JOINERY_SLIVER_M) from = stretch[0];
            else if (stretch[1] - (from + columnW) < JOINERY_SLIVER_M) from = stretch[1] - columnW;
            piece = cabinetPiece(`decor-${room.id}-joinery-${washer.id}`, room, wall.edge, from, [column], face);
            const at = pointOnEdge(wall.edge, (from + columnW / 2) / wall.edge.length);
            const off = washer.size.depth / 2 + 0.02;
            placedWasher = { ...washer, position: { x: at.x + wall.edge.inward.x * off, z: at.z + wall.edge.inward.z * off } };
          }
        }
      }
      if (piece) {
        decor.push(piece);
        items = items.map((i) => (i.id === washer.id ? placedWasher : i));
        if (dryerProduct) items.push(stackedDryer(placedWasher, dryerProduct));
      }
    }

    // The vanities that did not take a washer: a cabinet each.
    for (const [sinkId, v] of vanities) {
      decor.push(cabinetPiece(`decor-${room.id}-joinery-${sinkId}`, room, v.edge, v.from, [{ kind: 'basin', widthMm: mm(v.to - v.from), heightMm: mm(v.height), depthMm: mm(VANITY_DEPTH_M), itemId: sinkId }], face));
    }

    // --- the bath: boxed and tiled when built in, Vintage's enclosure; its mixer at its head ---
    for (const bath of items.filter((i) => i.roomId === room.id && i.slot === 'bathtub' && i.product)) {
      const wall = wallOf(bath, room);
      const boxed = vintage || isBuiltInBath(bath.product);
      if (wall && boxed) {
        const enclosure = bathEnclosure(room, wall.edge, wall.along, bath, items, catalog, vintage);
        if (enclosure) decor.push(enclosure);
      }
      const head = bathHead(room, bath, wall?.edge ?? null);
      const mixer = boxed && wall ? pick('bath_mixer', (p) => isWallTap(p)) ?? pick('bath_mixer', (p) => !isFloorTap(p)) : pick('bath_mixer', (p) => isFloorTap(p)) ?? pick('bath_mixer');
      if (mixer) items.push(bathMixerItem(room, bath, mixer, wall?.edge ?? null, head, boxed && !!wall && isWallTap(mixer)));
    }
  }
  return { items, decor };
}

const mm = (m: number) => Math.round(m * 1000);

function sized(product: CatalogProduct, fallback: { width: number; depth: number; height: number }) {
  return {
    width: product.widthCm ? product.widthCm / 100 : fallback.width,
    depth: product.depthCm ? product.depthCm / 100 : fallback.depth,
    height: product.heightCm ? product.heightCm / 100 : fallback.height,
  };
}

function newItem(room: PlanRoom, kind: string, id: string, product: CatalogProduct, position: PlacedItem['position'], rotation: number, elevationM: number, size: PlacedItem['size']): PlacedItem {
  return { id, roomId: room.id, slot: getArchetype(kind)!.slot, kind, position, rotation, elevationM: round3(elevationM), size, product: toSceneProduct(product, 1), origin: 'style' };
}

/**
 * A tap for a basin: a wall tap over the bowl, 12 cm over its rim; a deck tap behind the bowl on
 * the vanity's top (when there is room behind a vessel basin) or on a standing basin's top.
 */
function tapItem(room: PlanRoom, basin: PlacedItem, edge: PlanEdge, product: CatalogProduct, vanityTop: number | null): PlacedItem {
  const size = sized(product, getArchetype('tap')!.size);
  const along = (basin.position.x - edge.a.x) * edge.dir.x + (basin.position.z - edge.a.z) * edge.dir.z;
  const at = pointOnEdge(edge, along / edge.length);
  const rim = basin.elevationM + basin.size.height;
  const toBasinBack = (basin.position.x - at.x) * edge.inward.x + (basin.position.z - at.z) * edge.inward.z - basin.size.depth / 2;
  const deckRoom = vanityTop != null ? toBasinBack : 0;
  const wall = isWallTap(product) || (vanityTop != null && deckRoom < size.depth * 0.6);
  const off = wall ? size.depth / 2 + 0.005 : vanityTop != null ? Math.max(size.depth / 2 + 0.02, deckRoom / 2) : basin.size.depth * 0.18 + 0.02 + Math.max(0, toBasinBack);
  const elevation = wall ? rim + 0.12 : vanityTop != null && deckRoom >= size.depth * 0.6 ? vanityTop : rim - 0.01;
  return newItem(room, 'tap', `${basin.id}-tap`, product, { x: at.x + edge.inward.x * off, z: at.z + edge.inward.z * off }, edge.facing, elevation, size);
}

/** A dryer stacked on the washing machine inside its column, on the column's shelf. */
function stackedDryer(washer: PlacedItem, product: CatalogProduct): PlacedItem {
  const size = sized(product, getArchetype('dryer')!.size);
  const f = { x: Math.sin(washer.rotation), z: Math.cos(washer.rotation) };
  // Its back where the washer's is.
  const shift = (size.depth - washer.size.depth) / 2;
  return {
    id: `${washer.id}-dryer`,
    roomId: washer.roomId,
    slot: 'dryer',
    kind: 'dryer',
    position: { x: washer.position.x + f.x * shift, z: washer.position.z + f.z * shift },
    rotation: washer.rotation,
    elevationM: round3(washer.size.height + 0.03),
    size,
    product: toSceneProduct(product, 1),
    origin: 'style',
  };
}

/** The bath's head: the end with the wall (or, freestanding, the end further from the room's middle) — the mixer goes there. */
function bathHead(room: PlanRoom, bath: PlacedItem, edge: PlanEdge | null): 1 | -1 {
  const right = { x: Math.cos(bath.rotation), z: -Math.sin(bath.rotation) };
  const ends = [1, -1].map((s) => ({ s: s as 1 | -1, p: { x: bath.position.x + right.x * s * (bath.size.width / 2), z: bath.position.z + right.z * s * (bath.size.width / 2) } }));
  if (edge) {
    // The end nearer a corner of its wall.
    const along = (p: { x: number; z: number }) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z;
    const toCorner = (p: { x: number; z: number }) => Math.min(along(p), edge.length - along(p));
    return toCorner(ends[0].p) <= toCorner(ends[1].p) ? ends[0].s : ends[1].s;
  }
  const c = room.polygon.reduce((a, p) => ({ x: a.x + p.x / room.polygon.length, z: a.z + p.z / room.polygon.length }), { x: 0, z: 0 });
  const d = (p: { x: number; z: number }) => Math.hypot(p.x - c.x, p.z - c.z);
  return d(ends[0].p) >= d(ends[1].p) ? ends[0].s : ends[1].s;
}

/** The bath's mixer: on the wall over the head of a boxed bath, else standing on the floor just past its head. */
function bathMixerItem(room: PlanRoom, bath: PlacedItem, product: CatalogProduct, edge: PlanEdge | null, head: 1 | -1, onWall: boolean): PlacedItem {
  const size = sized(product, getArchetype('bath_mixer')!.size);
  const right = { x: Math.cos(bath.rotation), z: -Math.sin(bath.rotation) };
  const f = { x: Math.sin(bath.rotation), z: Math.cos(bath.rotation) };
  if (onWall && edge) {
    const lateral = head * (bath.size.width / 2 - 0.3);
    const back = -bath.size.depth / 2 + size.depth / 2 + 0.005;
    return newItem(room, 'bath_mixer', `${bath.id}-mixer`, product, { x: bath.position.x + right.x * lateral + f.x * back, z: bath.position.z + right.z * lateral + f.z * back }, bath.rotation, bath.size.height + 0.15, size);
  }
  // Freestanding: on the floor at the head, a hand's width off the bath, a little in from its back.
  const lateral = head * (bath.size.width / 2 - Math.min(0.25, bath.size.width * 0.15));
  const ahead = bath.size.depth / 2 + size.depth / 2 + 0.06;
  return newItem(room, 'bath_mixer', `${bath.id}-mixer`, product, { x: bath.position.x + right.x * lateral + f.x * ahead, z: bath.position.z + right.z * lateral + f.z * ahead }, bath.rotation + Math.PI, 0, size);
}

/**
 * A boxed bath's enclosure: a tiled block on the bath's wall, as long as the bath (run on to a corner
 * rather than leave a sliver), up to its rim and a little deeper than it; Vintage's a surround 10 cm
 * wider each side and 6 cm over the rim, round the freestanding bath standing in it.
 */
function bathEnclosure(room: PlanRoom, edge: PlanEdge, along: number, bath: PlacedItem, items: PlacedItem[], catalog: CatalogProduct[], vintage: boolean): DecorPiece | null {
  const stretch = freeStretch(room, edge, along, items, [bath.id, `${bath.id}-mixer`], bath.size.depth + 0.1);
  if (!stretch) return null;
  const extra = vintage ? 0.1 : 0.02;
  let from = Math.max(stretch[0], along - bath.size.width / 2 - extra);
  let to = Math.min(stretch[1], along + bath.size.width / 2 + extra);
  if (from - stretch[0] < JOINERY_SLIVER_M) from = stretch[0];
  if (stretch[1] - to < JOINERY_SLIVER_M) to = stretch[1];
  const gypsum = defaultDecorMaterial(catalog, ['gypsum']);
  const tile = defaultDecorMaterial(catalog, ['tile', 'stone']);
  return {
    id: `decor-${room.id}-bath-${bath.id}`,
    roomId: room.id,
    family: 'box',
    wallIndex: edge.index,
    span: { from: round3(from), to: round3(to) },
    // A built-in bath's rim just shows over its box; Vintage's surround stands 6 cm over the rim.
    height: { from: 0, to: round3(bath.size.height + (vintage ? 0.06 : -0.01)) },
    params: { depthMm: mm(bath.size.depth + (vintage ? 0.12 : 0.03)), full: false },
    materials: { ...(gypsum ? { body: decorMaterialFrom(gypsum) } : {}), ...(tile ? { face: decorMaterialFrom(tile) } : {}) },
    anchor: 'bath',
    itemId: bath.id,
  };
}
