/**
 * The bathroom pass (the rulebook, 6 Nov 2026 — BA-7 to BA-18): once the layout engine has laid a
 * flat out and the matcher has put products in its slots, every bathroom and toilet is finished the
 * way a joiner and a plumber would finish it:
 *
 * - **The vanity** — in every style but Vintage, a basin set on a cabinet made to measure (`cabinet`
 *   decor, `joinery.ts`): the basin's top at 85 cm on it (`vanityTop`), as wide as the wall lets it grow
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

import { candidatesFor, MATCHED_ABOVE_GAP_M, matchProducts, settledElevation, toSceneProduct, type BudgetLevel, type CatalogProduct } from './matcher';
import { footprintOf, footprintsOverlap, inDoorway, isPlacementValid, type Footprint } from './manipulate';
import { floorTaken } from './shower';
import { getArchetype } from './catalog';
import { companionId } from './relations';
import { includesTap, isBuiltInBath, isFloorTap, isWallTap } from './productRoles';
import { weightedPick, type RoomRng, type Rng } from './random';
import { styleAffinity } from './styles';
import { styleRejects } from './styleGuide';
import { pointOnEdge, type PlanEdge } from './planGeometry';
import { BASIN_TOP_M, BASIN_TOP_TOLERANCE_M, COUNTERTOP_BASIN_MAX_M, WET_ROOM_TYPES } from './rules';
import type { CabinetSection, DecorPiece, PlacedItem, PlanRoom, SlotKind, StyleId } from './types';
import { VANITY_DEPTH_M, WASHER_COLUMN_DEPTH_M, cabinetPiece, decorFootprint, freeStretch, joineryFace, joineryMaterial, wallOf } from './decor/joinery';
import { bathBoxFor, columnSection, columnStart, vanitySpan, vanityTop } from './decor/housing';
import { alongWall } from './wallClear';
import { defaultDecorMaterial } from './decor/materials';
import type { RadiatorBody } from './radiators';
import { decorMaterialFrom } from './decor/resolve';

export interface BathroomInput {
  /** The rooms as laid out (under their ceilings). */
  rooms: readonly PlanRoom[];
  items: PlacedItem[];
  catalog: CatalogProduct[];
  styleId: StyleId;
  level: BudgetLevel;
  rng?: Rng;
  /** Per room, a stream of its own (`roomStreams`), in place of `rng`: each room's taps, mixers and dryer are drawn from its own. */
  roomRng?: RoomRng;
  /**
   * The floor the layout kept clear, per room (`generateScene`'s obstacles: the strips before the
   * radiators, the columns, the floor behind a partition): nothing is built or stood on it.
   */
  keepClear?: Record<string, Footprint[]>;
  /** The flat's radiators and towel rails (`radiatorBodies`): no joinery is built over one. */
  radiators?: readonly RadiatorBody[];
}

/** The ceiling a dryer needs over the machine (two machines and the column's top). */
const DRYER_CEILING_M = 2.2;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function fitBathrooms(input: BathroomInput): { items: PlacedItem[]; decor: DecorPiece[] } {
  const { rooms, catalog, styleId, level, rng, keepClear } = input;
  const radiators = input.radiators ?? [];
  let items = [...input.items];
  const decor: DecorPiece[] = [];
  const vintage = styleId === 'vintage';
  const material = joineryMaterial(catalog, styleId, items);
  const face = joineryFace(material);
  // A box is plasterboard, tiled (`decor/housing`'s bath box, `decor/wcBox`).
  const gypsum = defaultDecorMaterial(catalog, ['gypsum']);
  const tile = defaultDecorMaterial(catalog, ['tile', 'stone']);
  const boxMaterials = { ...(gypsum ? { body: decorMaterialFrom(gypsum) } : {}), ...(tile ? { face: decorMaterialFrom(tile) } : {}) };
  const pickWith = (draw: Rng | undefined) => (kind: string, keep: (p: CatalogProduct) => boolean = () => true): CatalogProduct | null => {
    const all = candidatesFor(kind, catalog, styleId).filter(keep);
    const kept = all.filter((p) => !styleRejects(p, styleId));
    const pool = kept.length > 0 ? kept : all;
    if (pool.length === 0) return null;
    return draw ? weightedPick(pool, (p) => [1, 3, 10][styleAffinity(styleId, p.styleTags, p.tags)] ?? 1, draw) ?? pool[0] : pool[0];
  };

  for (const room of rooms) {
    // The room's own draw, where generation hands one per room.
    const pick = pickWith(input.roomRng ? input.roomRng(room.id) : rng);
    const wet = WET_ROOM_TYPES.includes(room.type);
    const vanities = new Map<string, Vanity>();

    // --- the basins: a vanity under each (but Vintage's), and a tap on each that has none ---
    for (const sink of items.filter((i) => i.roomId === room.id && i.slot === 'sink' && i.product)) {
      let wall = wallOf(sink, room);
      let basin = sink;
      const vanity = wall && wet && !vintage && sink.size.height < COUNTERTOP_BASIN_MAX_M ? vanityFor(room, sink, wall, items, radiators) : null;
      // A basin the matcher lifted for a vanity that cannot be built here would hang in the air: it
      // gives way to a basin that stands on the floor, at a basin's height, where one fits; with
      // none it stays. One a vanity holds stays on it, too tall for it or not (its height is a
      // rule check's, not this pass's to change by swapping the product).
      const standing = !vanity && sink.elevationM > 0 ? standingBasin(sink, room, items, catalog, styleId, level, keepClear?.[room.id]) : null;
      if (standing) {
        basin = standing;
        items = items.map((i) => (i.id === sink.id ? standing : i));
        wall = wallOf(standing, room);
      } else if (vanity && wall) {
        vanities.set(sink.id, vanity);
        // The basin on the vanity's top, in the middle of its depth.
        const at = pointOnEdge(wall.edge, Math.min(vanity.to - sink.size.width / 2, Math.max(vanity.from + sink.size.width / 2, wall.along)) / wall.edge.length);
        const off = Math.max(sink.size.depth / 2 + 0.03, VANITY_DEPTH_M / 2);
        basin = { ...sink, elevationM: vanity.height, position: { x: at.x + wall.edge.inward.x * off, z: at.z + wall.edge.inward.z * off } };
        items = items.map((i) => (i.id === sink.id ? basin : i));
      }
      if (!wall) continue;
      if (!includesTap(basin.product)) {
        const vanityTop = vanities.get(sink.id)?.height ?? null;
        let tap = pick('tap', (p) => !isFloorTap(p) && (vintage ? isWallTap(p) : true)) ?? (vintage ? pick('tap', (p) => !isFloorTap(p)) : null);
        // A tap that goes on the wall (no deck behind the basin) is a wall tap where the catalogue
        // has one — a deck mixer is not hung on a wall at its full height.
        if (tap && !isWallTap(tap) && tapSpot(basin, wall.edge, tap, vanityTop).wall) tap = pick('tap', (p) => isWallTap(p)) ?? tap;
        if (tap) items.push(tapItem(room, basin, wall.edge, tap, vanityTop));
      }
    }

    // The mirror over a basin hangs clear of it and of the tap now on it.
    items = items.map((i) => (i.roomId === room.id && i.slot === 'mirror' ? hungClearOfBasin(i, room, items) : i));

    // --- the washing machine's column (and the dryer on it) ---
    for (const washer of items.filter((i) => i.roomId === room.id && i.slot === 'washer' && i.product)) {
      if (vintage) continue;
      const dryerProduct = level === 'premium' && room.heightM >= DRYER_CEILING_M ? pick('dryer') : null;
      // The column the studio builds for the same machine (`columnSection`), the dryer as it is stacked.
      const column = columnSection(washer, dryerProduct ? sized(dryerProduct, getArchetype('dryer')!.size).height : null, room.heightM);
      const columnW = column.widthMm / 1000;
      const columnH = column.heightMm / 1000;
      const tapIds = items.filter((i) => i.roomId === room.id && i.slot === 'tap').map((i) => i.id);
      // What hangs on the wall over the column, lower than its top (a mirror wider than its basin):
      // the dryer stacked in it would run into it.
      const underHung = (at: PlacedItem, except: readonly string[] = []) => hungOver(footprintOf(at.position, at.size, at.rotation), columnH, room, items, [washer.id, ...except]);
      const spots: ColumnSpot[] = [];

      // Beside a vanity on the same wall, the column at the wall's end, the gap between filled at the vanity's height.
      const vanityEntry = [...vanities.entries()].find(([, v]) => !!v);
      if (vanityEntry) {
        const [sinkId, v] = vanityEntry;
        const stretch = freeStretch(room, v.edge, (v.from + v.to) / 2, items, [sinkId, washer.id, ...tapIds], WASHER_COLUMN_DEPTH_M, [], [], { radiators, strict: true });
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
            // The gap between: a cupboard of its own, or — narrower than one — the vanity's (`cabinetPiece`
            // folds it in), so the column stays at the stretch's end, round the machine moved there.
            const fill: CabinetSection[] = fillTo - fillFrom > 0.0005 ? [{ kind: 'doors', widthMm: mm(fillTo - fillFrom), heightMm: vanityH, depthMm: mm(VANITY_DEPTH_M) }] : [];
            const sections = side === 'right' ? [basin, ...fill, column] : [column, ...fill, basin];
            const start = side === 'right' ? v.from : colFrom;
            const mid = colFrom + columnW / 2;
            const at = pointOnEdge(v.edge, mid / v.edge.length);
            const off = washer.size.depth / 2 + 0.02;
            const moved = { ...washer, position: { x: at.x + v.edge.inward.x * off, z: at.z + v.edge.inward.z * off }, rotation: v.edge.facing };
            // Moved there only where it stands clear; else it keeps the spot the engine gave it.
            if (standsClear(moved, room, items, decor, keepClear?.[room.id], [sinkId, ...tapIds])) {
              spots.push({ piece: cabinetPiece(`decor-${room.id}-joinery-${sinkId}`, room, v.edge, start, sections, face), washer: moved, vanity: sinkId, underHung: underHung(moved, tapIds) });
            }
          }
        }
      }
      // A column of its own where the machine stands — stopped at the vanities still to be built on
      // the walls round it (round a corner a basin's vanity reaches past where the column would
      // start; one on its own wall gives way to the column, `clearOfBuilt`).
      const wall = wallOf(washer, room);
      const planned = [...vanities].filter(([, v]) => v.edge.index !== wall?.edge.index).map(([sinkId, v]) => cabinetPiece(`decor-${room.id}-joinery-${sinkId}`, room, v.edge, v.from, [{ kind: 'basin', widthMm: mm(v.to - v.from), heightMm: mm(v.height), depthMm: mm(VANITY_DEPTH_M), itemId: sinkId }], face));
      const stretch = wall && freeStretch(room, wall.edge, wall.along, items, [washer.id], WASHER_COLUMN_DEPTH_M, planned, [], { radiators, strict: true });
      // Round the machine, at the end of the wall when that is a sliver away (BA-14).
      const from = wall && stretch ? columnStart(stretch, wall.along, columnW) : null;
      if (wall && stretch && from != null) {
        // Where the machine is moved to stands clear, else the column is built round it where it is.
        const columnAt = (start: number) => {
          const at = pointOnEdge(wall.edge, (start + columnW / 2) / wall.edge.length);
          const off = washer.size.depth / 2 + 0.02;
          return { ...washer, position: { x: at.x + wall.edge.inward.x * off, z: at.z + wall.edge.inward.z * off } };
        };
        const here = wall.along - columnW / 2;
        const own = (start: number, at: PlacedItem): ColumnSpot => ({ piece: cabinetPiece(`decor-${room.id}-joinery-${washer.id}`, room, wall.edge, start, [column], face), washer: at, underHung: underHung(at) });
        const moved = columnAt(from);
        const fromSpot = standsClear(moved, room, items, decor, keepClear?.[room.id]) ? own(from, moved) : null;
        const hereSpot = here >= stretch[0] - 1e-6 && here + columnW <= stretch[1] + 1e-6 ? own(here, washer) : null;
        // The spot clear of what hangs over it first, then as before: moved where it stands clear, else where it is.
        const clearOwn = [fromSpot, hereSpot].find((spot) => spot && !spot.underHung) ?? fromSpot ?? hereSpot;
        if (clearOwn) spots.push(clearOwn);
      }
      // Beside the vanity, else a column of its own — but a spot where the column and its dryer stand
      // clear of what hangs on the wall over them before one where they would not.
      const chosen = spots.find((spot) => !spot.underHung) ?? spots[0];
      const piece = chosen?.piece ?? null;
      const placedWasher = chosen?.washer ?? washer;
      if (chosen?.vanity) vanities.delete(chosen.vanity);
      if (piece) {
        decor.push(piece);
        items = items.map((i) => (i.id === washer.id ? placedWasher : i));
        if (dryerProduct) items.push(stackedDryer(placedWasher, dryerProduct));
      }
    }

    // A mirror the column and its dryer could stand nowhere clear of gives way to one the catalogue
    // has that hangs clear of them (and of the basin and its tap); with none, it stays as it hung.
    items = items.map((i) => (i.roomId === room.id && i.slot === 'mirror' ? mirrorClearOfColumn(i, room, items, catalog, styleId) : i));

    // The vanities that did not take a washer: a cabinet each — stopped at a washer's column built
    // on its wall since it was planned (the column is wider than the machine the vanity stopped at).
    for (const [sinkId, planned] of vanities) {
      const basin = items.find((i) => i.id === sinkId);
      const v = basin ? clearOfBuilt(planned, basin, room, decor) : planned;
      decor.push(cabinetPiece(`decor-${room.id}-joinery-${sinkId}`, room, v.edge, v.from, [{ kind: 'basin', widthMm: mm(v.to - v.from), heightMm: mm(v.height), depthMm: mm(VANITY_DEPTH_M), itemId: sinkId }], face));
    }

    // --- the bath: boxed and tiled when built in, Vintage's enclosure; its mixer at its head ---
    for (const bath of items.filter((i) => i.roomId === room.id && i.slot === 'bathtub' && i.product)) {
      const wall = wallOf(bath, room);
      const boxed = vintage || isBuiltInBath(bath.product);
      if (wall && boxed) {
        // Stopped at the joinery built beside it (a washer's column is wider than its machine), as the studio's is.
        const enclosure = bathBoxFor(bath, room, wall, items, vintage, boxMaterials, `decor-${room.id}-bath-${bath.id}`, { decor, stretch: { radiators, strict: true } });
        if (enclosure) decor.push(enclosure);
      }
      const head = bathHead(room, bath, wall?.edge ?? null);
      const mixer = boxed && wall ? pick('bath_mixer', (p) => isWallTap(p)) ?? pick('bath_mixer', (p) => !isFloorTap(p)) : pick('bath_mixer', (p) => isFloorTap(p)) ?? pick('bath_mixer');
      if (!mixer) continue;
      const onWall = boxed && !!wall && isWallTap(mixer);
      const placed = bathMixerItem(room, bath, mixer, wall?.edge ?? null, head, onWall);
      if (onWall) {
        items.push(placed);
        continue;
      }
      // One standing on the floor stands clear — at the head, else at the other end; else a mixer
      // on the wall over the head where the bath has a wall; else where it was put.
      const clear = (m: PlacedItem) => standsClear(m, room, items, decor, keepClear?.[room.id], [bath.id]);
      const other = bathMixerItem(room, bath, mixer, wall?.edge ?? null, head === 1 ? -1 : 1, false);
      const wallMixer = wall ? pick('bath_mixer', (p) => isWallTap(p)) : null;
      items.push(clear(placed) ? placed : clear(other) ? other : wallMixer && wall ? bathMixerItem(room, bath, wallMixer, wall.edge, head, true) : placed);
    }
  }
  return { items, decor };
}

const mm = (m: number) => Math.round(m * 1000);

/**
 * Whether a piece the pass stands on the floor or moves fits where it is put: inside its room and
 * clear of the other pieces (`isPlacementValid` — a shower as the tray it takes, `floorTaken`; a
 * floor mixer as the solid it is, though its archetype is a ghost), of
 * the joinery and boxes built (but the one built for it), of a door's way (`inDoorway`) and of the
 * floor the layout kept clear (the strips before the radiators, the columns, a partition's floor).
 */
function standsClear(piece: PlacedItem, room: PlanRoom, items: readonly PlacedItem[], decor: readonly DecorPiece[], keepClear: readonly Footprint[] = [], except: readonly string[] = []): boolean {
  const others = items.filter((i) => i.roomId === room.id && i.id !== piece.id && !except.includes(i.id)).map((i) => ({ ...i, ...floorTaken(i) }));
  if (!isPlacementValid(room, piece, others, undefined, true) || inDoorway(piece, room)) return false;
  const box = footprintOf(piece.position, piece.size, piece.rotation);
  if (keepClear.some((k) => footprintsOverlap(box, k))) return false;
  return !decor.some((d) => {
    if (d.roomId !== room.id || d.itemId === piece.id || (d.params.sections ?? []).some((s) => s.itemId === piece.id)) return false;
    const corners = decorFootprint(d, room);
    if (!corners) return false;
    const xs = corners.map((c) => c.x);
    const zs = corners.map((c) => c.z);
    return footprintsOverlap(box, { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
  });
}

/**
 * Whether anything hangs on the room's walls over a floor `box` lower than `top` — a mirror, a
 * cabinet, a TV (`except` left out): what a piece that tall would run into there.
 */
function hungOver(box: Footprint, top: number, room: PlanRoom, items: readonly PlacedItem[], except: readonly string[]): boolean {
  return items.some((i) => i.roomId === room.id && !except.includes(i.id) && i.elevationM >= 0.05 && i.elevationM < top - 0.02 && footprintsOverlap(box, footprintOf(i.position, { ...i.size, depth: Math.max(i.size.depth, 0.05) }, i.rotation), 0.01));
}

/**
 * The gap a hung piece keeps over what is under it once matched (`settledElevation`: the
 * archetype's `aboveGapM`, else 12 cm) — the matcher's, read from the mirror's archetype.
 */
function mirrorGap(): number {
  const rule = getArchetype('mirror')?.placement;
  return (rule?.type === 'wall-mounted' ? rule.aboveGapM : undefined) ?? MATCHED_ABOVE_GAP_M;
}

/** What a mirror over a basin hangs clear of first: the basin and the tap put on it. */
const BASIN_AND_TAP: readonly SlotKind[] = ['sink', 'tap'];

/**
 * A mirror over a basin raised clear of the basin and of its tap — the tap is put on after the
 * matcher hung the mirror, at the rim and over it — by the gap the matcher keeps over what stands
 * under a hung piece. Never lowered; left where it is when clearing them would take it through the
 * ceiling.
 */
function hungClearOfBasin(mirror: PlacedItem, room: PlanRoom, items: readonly PlacedItem[]): PlacedItem {
  const box = footprintOf(mirror.position, { width: mirror.size.width, depth: Math.max(mirror.size.depth, 0.05) }, mirror.rotation);
  const under = items.filter((i) => i.roomId === room.id && BASIN_AND_TAP.includes(i.slot) && footprintsOverlap(box, footprintOf(i.position, i.size, i.rotation), 0));
  if (under.length === 0) return mirror;
  const bottom = round3(Math.max(...under.map((i) => i.elevationM + i.size.height)) + mirrorGap());
  if (bottom <= mirror.elevationM || bottom + mirror.size.height > room.heightM) return mirror;
  return { ...mirror, elevationM: bottom };
}

/** Whether a hung piece runs into another piece: their floor overlaps and so do their heights. */
function hangsInto(hung: PlacedItem, other: PlacedItem): boolean {
  const box = footprintOf(hung.position, { width: hung.size.width, depth: Math.max(hung.size.depth, 0.05) }, hung.rotation);
  return (
    footprintsOverlap(box, footprintOf(other.position, other.size, other.rotation), 0.01) &&
    hung.elevationM < other.elevationM + other.size.height - 0.02 &&
    other.elevationM < hung.elevationM + hung.size.height - 0.02
  );
}

/**
 * A mirror that runs into the washer or the dryer stacked on it (a column that could be built
 * nowhere clear of it) swapped for the best mirror of the style the catalogue has that, hung where
 * the matcher hangs it (`settledElevation`) and clear of the basin and the tap as the pass hangs any
 * (`hungClearOfBasin`), runs into none of them and stays under the ceiling. With none, the mirror is
 * kept as it hung: whether a mirror or the dryer gives way is the owner's rule, not this pass's.
 */
function mirrorClearOfColumn(mirror: PlacedItem, room: PlanRoom, items: readonly PlacedItem[], catalog: CatalogProduct[], styleId: StyleId): PlacedItem {
  const column = items.filter((i) => i.roomId === room.id && (i.slot === 'washer' || i.slot === 'dryer'));
  if (!column.some((c) => hangsInto(mirror, c))) return mirror;
  const under = items.filter((i) => i.roomId === room.id && (BASIN_AND_TAP.includes(i.slot) || i.slot === 'washer' || i.slot === 'dryer'));
  const rest = items.filter((i) => i.id !== mirror.id);
  const all = candidatesFor('mirror', catalog, styleId).filter((p) => p.id !== mirror.product?.productId);
  const kept = all.filter((p) => !styleRejects(p, styleId));
  for (const product of kept.length > 0 ? kept : all) {
    const size = sized(product, mirror.size);
    const slot = { ...mirror, size, elevationM: settledElevation(mirror, size, product, rest), product: toSceneProduct(product, 1) };
    const hung = hungClearOfBasin(slot, room, items);
    if (hung.elevationM + size.height <= room.heightM && !under.some((u) => hangsInto(hung, u))) return hung;
  }
  return mirror;
}

type Vanity = { edge: PlanEdge; from: number; to: number; height: number };

/**
 * A vanity planned before the joinery beside it was built, cut back to that joinery on the side it
 * stands — a washer's own column, wider than the machine the vanity's stretch stopped at, is built
 * where it stands and the vanity gives way to it. The vanity as planned where the cut would leave
 * it no longer 5 cm wider than its basin (`vanitySpan`'s least).
 */
function clearOfBuilt(v: Vanity, basin: PlacedItem, room: PlanRoom, decor: readonly DecorPiece[]): Vanity {
  const middle = (basin.position.x - v.edge.a.x) * v.edge.dir.x + (basin.position.z - v.edge.a.z) * v.edge.dir.z;
  let { from, to } = v;
  for (const piece of decor) {
    if (piece.roomId !== room.id) continue;
    const corners = decorFootprint(piece, room);
    const seen = corners && alongWall(v.edge, corners, VANITY_DEPTH_M - 1e-6);
    if (!seen || seen[1] <= from + 1e-6 || seen[0] >= to - 1e-6) continue;
    if (seen[1] <= middle) from = seen[1];
    else if (seen[0] >= middle) to = seen[0];
  }
  return to - from >= basin.size.width + 0.05 - 1e-6 ? { ...v, from, to } : v;
}

/** Where a washer's column may be built: the joinery, the machine as it then stands, the vanity it joins, and whether something hangs in its way. */
type ColumnSpot = { piece: DecorPiece; washer: PlacedItem; vanity?: string; underHung: boolean };

/**
 * The vanity a countertop basin's wall can take: the basin's top at 85 cm on it, as wide as the wall lets it grow
 * (from the basin's width and 40 cm, to 1.8 m), run on to a corner rather than leave a sliver —
 * and under a window only where the window's sill is over the basin's rim. Null where the free
 * stretch round the basin is not 5 cm wider than it.
 */
function vanityFor(room: PlanRoom, sink: PlacedItem, wall: { edge: PlanEdge; along: number }, items: readonly PlacedItem[], radiators: readonly RadiatorBody[]): Vanity | null {
  const height = vanityTop(sink);
  const stretch = freeStretch(room, wall.edge, wall.along, items, [sink.id], VANITY_DEPTH_M, [], [], { top: height + sink.size.height, radiators, strict: true });
  const span = stretch ? vanitySpan(stretch, wall.along, sink.size.width) : null;
  return span ? { edge: wall.edge, from: span[0], to: span[1], height } : null;
}

/**
 * A basin that stands on the floor (a pedestal or a vanity product: one the matcher does not lift,
 * `settledElevation`) with its top at a basin's height (`BASIN_TOP_M`), for a lifted basin's slot,
 * given by the matcher as it gives any slot its product — the fit test, the door's way and the
 * floor kept clear — with the room's other pieces where they stand. Null when none fits.
 */
function standingBasin(sink: PlacedItem, room: PlanRoom, items: PlacedItem[], catalog: CatalogProduct[], styleId: StyleId, level: BudgetLevel, keepClear: Footprint[] | undefined): PlacedItem | null {
  const slot: PlacedItem = { ...sink, product: null, elevationM: 0, pinned: false };
  const standing = candidatesFor('sink', catalog, styleId).filter((p) => {
    const height = (p.heightCm ?? 0) / 100;
    return settledElevation(slot, { width: (p.widthCm ?? 0) / 100, depth: (p.depthCm ?? 0) / 100, height }, p, []) === 0 && Math.abs(height - BASIN_TOP_M) <= BASIN_TOP_TOLERANCE_M;
  });
  if (standing.length === 0) return null;
  const others = items.filter((i) => i.roomId === room.id && i.id !== sink.id && i.product).map((i) => ({ ...i, pinned: true }));
  const matched = matchProducts([...others, slot], standing, { styleId, level, rooms: [room], ...(keepClear ? { keepClear: { [room.id]: keepClear } } : {}) }).find((i) => i.id === sink.id);
  return matched?.product ? { ...matched, pinned: sink.pinned } : null;
}

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
  const { at, toBasinBack, deckRoom, wall } = tapSpot(basin, edge, product, vanityTop);
  const rim = basin.elevationM + basin.size.height;
  const off = wall ? size.depth / 2 + 0.005 : vanityTop != null ? Math.max(size.depth / 2 + 0.02, deckRoom / 2) : basin.size.depth * 0.18 + 0.02 + Math.max(0, toBasinBack);
  const elevation = wall ? rim + 0.12 : vanityTop != null && deckRoom >= size.depth * 0.6 ? vanityTop : rim - 0.01;
  return newItem(room, 'tap', companionId(basin.id, 'tap'), product, { x: at.x + edge.inward.x * off, z: at.z + edge.inward.z * off }, edge.facing, elevation, size);
}

/**
 * Where a basin's tap goes: on the wall over the bowl for a wall tap, and for any tap on a vanity
 * whose basin leaves no deck behind it (less than 60% of the tap's depth); else on the deck.
 */
function tapSpot(basin: PlacedItem, edge: PlanEdge, product: CatalogProduct, vanityTop: number | null) {
  const size = sized(product, getArchetype('tap')!.size);
  const along = (basin.position.x - edge.a.x) * edge.dir.x + (basin.position.z - edge.a.z) * edge.dir.z;
  const at = pointOnEdge(edge, along / edge.length);
  const toBasinBack = (basin.position.x - at.x) * edge.inward.x + (basin.position.z - at.z) * edge.inward.z - basin.size.depth / 2;
  const deckRoom = vanityTop != null ? toBasinBack : 0;
  const wall = isWallTap(product) || (vanityTop != null && deckRoom < size.depth * 0.6);
  return { at, toBasinBack, deckRoom, wall };
}

/** A dryer stacked on the washing machine inside its column, on the column's shelf. */
function stackedDryer(washer: PlacedItem, product: CatalogProduct): PlacedItem {
  const size = sized(product, getArchetype('dryer')!.size);
  const f = { x: Math.sin(washer.rotation), z: Math.cos(washer.rotation) };
  // Its back where the washer's is.
  const shift = (size.depth - washer.size.depth) / 2;
  return {
    id: companionId(washer.id, 'dryer'),
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
    return newItem(room, 'bath_mixer', companionId(bath.id, 'bath_mixer'), product, { x: bath.position.x + right.x * lateral + f.x * back, z: bath.position.z + right.z * lateral + f.z * back }, bath.rotation, bath.size.height + 0.15, size);
  }
  // Freestanding: on the floor at the head, a hand's width off the bath, a little in from its back.
  const lateral = head * (bath.size.width / 2 - Math.min(0.25, bath.size.width * 0.15));
  const ahead = bath.size.depth / 2 + size.depth / 2 + 0.06;
  return newItem(room, 'bath_mixer', companionId(bath.id, 'bath_mixer'), product, { x: bath.position.x + right.x * lateral + f.x * ahead, z: bath.position.z + right.z * lateral + f.z * ahead }, bath.rotation + Math.PI, 0, size);
}
