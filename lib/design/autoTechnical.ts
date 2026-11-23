/**
 * Where the water, the drains, the panel, the gas, the extractors and the air conditioners
 * go, by the rules a fitter would use.
 *
 * Marking a flat's technical points by hand is the step people skip — it is the least
 * rewarding part of the journey and the easiest to get wrong, and a flat with none of them
 * is priced as though it needed no plumbing at all. So this places the ones that follow from
 * the plan: a bathroom needs water, a drain and an extractor, a kitchen needs water, waste
 * and gas, the panel goes by the front door, a living room and a bedroom get an air
 * conditioner, and one boiler serves the flat — in the hall's technical cupboard by the entrance,
 * else enclosed on the balcony, else in the bathroom clear of the shower and the bath
 * (`BOILER_ROOMS`). A
 * kitchen's pipes come to the end of the run the sink is taken to be at, its gas and its hood to
 * the hob (`kitchenRunZones`).
 *
 * It places what the rules can decide and **nothing else**. A point that would be a guess —
 * a second boiler, gas in a flat with no kitchen run, a drain in a room the plan does not
 * call a bathroom — is simply not placed; the person puts it where they know it is. Every
 * point comes out `origin: 'user'`, because asking for them is asking to pay for them.
 *
 * Pure geometry over the plan and the furniture; no React, no store.
 */

import { housedBoilerSpot } from './hall';
import { pointInPolygon, pointOnEdge, wallEdges, type PlanEdge } from './planGeometry';
import { openingWorldPoint } from './openings';
import { HOOD_ROOM_TYPES, TECHNICAL_KINDS, technicalElevation } from './technical';
import { equipmentCandidates, isEquipmentKind, withEquipmentProduct } from './equipment';
import type { CatalogProduct } from './matcher';
import { boilerCabinetSize } from './boilerCabinet';
import { dividerSegments, partRoom, studioParts } from './studio';
import { outsideEdges } from './radiators';
import { freeSpans } from './decor/layout';
import { clearOf, wallBlocks, type WallBlock } from './wallClear';
import { BATH_OR_SHOWER } from './kinds';
import { BOILER_CUPBOARD_M, BOILER_HALL_MIN_WIDTH_M, BOILER_PIPES_BELOW_M, BOILER_ROOMS, BOILER_WET_CLEAR_M, DISHWASHER_WATER, footprintQuad, KITCHEN_SINK_WATER, WATER_NEEDS, WATER_HEIGHT_REACH_M, WATER_PAIR_SPACING_M, WATER_POINT_REACH_M, alongWall, kitchenRunZones, underCeiling, type WaterNeed } from './rules';
import type { FloorPlan, PlacedItem, PlanRoom, StyleId, TechnicalKind, TechnicalPoint, Vec2, DecorPiece } from './types';

/** The least stretch of wall, clear of openings, a point with no fixture to go by is put on: a boiler's width and some. */
const CLEAR_WALL_M = 0.5;
/** How tall what hangs at a point is taken to be, when looking for wall clear of the furniture: a boiler, a panel, an air conditioner. */
const POINT_HEIGHT_M = 0.75;

/** How far inside the room a wall-mounted point stands, so it reads as *on* that wall. */
const OFF_WALL_M = 0.08;
/** A room smaller than this is a cupboard, not a room to service. */
const MIN_ROOM_M2 = 1.2;

/** What a room of this type gets, in the order it is placed. */
const BY_ROOM: Partial<Record<PlanRoom['type'], TechnicalKind[]>> = {
  bathroom: ['sewer', 'floor_drain', 'extractor'],
  toilet: ['sewer', 'extractor'],
  kitchen: ['sewer', 'gas', 'extractor'],
  living_room: ['ac_unit'],
  // A studio is serviced part by part (`servicedAreas`); this is only its fallback.
  studio: ['sewer', 'gas', 'extractor', 'ac_unit'],
  bedroom: ['ac_unit'],
  office: ['ac_unit'],
};

/**
 * The water a room gets before it is furnished: a kitchen's sink and a bathroom's basin take
 * cold and hot, a toilet's WC cold. Once it is furnished, every fixture gets its own (`WATER_NEEDS`).
 */
const ROOM_WATER: Partial<Record<PlanRoom['type'], WaterNeed>> = {
  kitchen: KITCHEN_SINK_WATER,
  bathroom: WATER_NEEDS.sink!,
  toilet: WATER_NEEDS.toilet!,
};

/** One per flat, in the first room of this list that the flat has. */
const ONE_PER_FLAT: Array<{ kind: TechnicalKind; rooms: Array<PlanRoom['type']> }> = [
  { kind: 'electrical_panel', rooms: ['hallway', 'living_room', 'studio', 'kitchen'] },
];

export interface AutoTechnicalResult {
  points: TechnicalPoint[];
  /** What was placed, by kind, for the message afterwards. */
  counts: Partial<Record<TechnicalKind, number>>;
}

/** A boiler's size, metres: its product's, when the style's is known (`boilerSizeFor`). */
type BoilerSize = { width: number; depth: number; height: number };

/**
 * The size of the boiler the style will buy — the first of the catalogue's for it
 * (`equipmentCandidates`, what `withEquipmentProducts` then gives the point) — or null with no
 * style, or no boiler of the catalogue's with all three sizes.
 */
function boilerSizeFor(catalog: CatalogProduct[], styleId: StyleId | undefined): BoilerSize | null {
  const product = styleId ? equipmentCandidates('boiler', catalog, styleId)[0] : undefined;
  if (!product) return null;
  return withEquipmentProduct({ id: '', kind: 'boiler', roomId: null, position: { x: 0, z: 0 }, origin: 'user' }, product).sizeM ?? null;
}

/**
 * The technical points the plan implies, leaving out every kind a room already has. Rooms
 * keep whatever is already marked: this fills the gaps, it does not tidy up after anyone.
 *
 * Given the style (`styleId`) and the catalogue, the boiler's cupboard is placed at the size of the
 * boiler the style will buy (`boilerSizeFor`, `boilerCabinetSize`); in a room with no stretch that
 * holds it, at a boiler's default size as before.
 */
export function suggestTechnical(plan: FloorPlan, items: PlacedItem[], nextId: () => string, decor: readonly DecorPiece[] = [], catalog: CatalogProduct[] = [], styleId?: StyleId): AutoTechnicalResult {
  const existing = plan.technical?.points ?? [];
  const points: TechnicalPoint[] = [];
  const counts: Partial<Record<TechnicalKind, number>> = {};
  const has = (kind: TechnicalKind, roomId?: string) =>
    [...existing, ...points].some((p) => p.kind === kind && (roomId === undefined || p.roomId === roomId));

  const add = (room: PlanRoom, kind: TechnicalKind, position: Vec2, elevationM: number) => {
    points.push({ id: nextId(), kind, roomId: room.id, position, elevationM, origin: 'user' });
    counts[kind] = (counts[kind] ?? 0) + 1;
  };
  const place = (room: PlanRoom, kind: TechnicalKind, notOn: Array<[Vec2, Vec2]> = [], prefer: PlanEdge[] = []) => {
    if (has(kind, room.id)) return;
    const position = spotFor(plan, room, kind, items, notOn, [...existing, ...points], prefer, decor);
    if (!position) return;
    add(room, kind, position, technicalElevation(kind, underCeiling(room, plan)));
  };
  // A cold (and a hot) point on the wall at `s` along `edge`: hot on the left, cold on the right
  // as one faces the wall, 15 cm apart. One of the kind already within reach, at about that
  // height, counts as placed (a WC's pipe low on the wall is not the boiler's above it).
  const pipes = (room: PlanRoom, edge: PlanEdge, s: number, need: WaterNeed, elevationM = need.elevationM) => {
    const right = { x: edge.inward.z, z: -edge.inward.x };
    const sign = right.x * edge.dir.x + right.z * edge.dir.z >= 0 ? 1 : -1;
    const wanted: Array<[TechnicalKind, number]> = need.hot
      ? [
          ['water_supply', s + (sign * WATER_PAIR_SPACING_M) / 2],
          ['water_hot', s - (sign * WATER_PAIR_SPACING_M) / 2],
        ]
      : [['water_supply', s]];
    for (const [kind, at] of wanted) {
      const position = offInto(edge, Math.max(0.02, Math.min(0.98, at / edge.length)));
      const near = [...existing, ...points].some((p) => p.kind === kind && Math.hypot(p.position.x - position.x, p.position.z - position.z) < WATER_POINT_REACH_M && Math.abs((p.elevationM ?? 0) - elevationM) < WATER_HEIGHT_REACH_M);
      if (!near) add(room, kind, position, elevationM);
    }
  };
  // Every fixture its water (the brief's sanitary plan); a room not furnished yet, its sink's or
  // its WC's. A room that already has water of its own and no fixtures to go by is left alone.
  const water = (room: PlanRoom, notOn: Array<[Vec2, Vec2]> = []) => {
    const edges = wallEdges(room).filter((edge) => !notOn.some(([a, b]) => onSegment(pointOnEdge(edge, 0.5), a, b)));
    if (edges.length === 0) return;
    // A corner kitchen's leg is part of its run (`legOf`): the sink and the dishwasher are the run's.
    const here = items.filter((i) => i.roomId === room.id && !i.legOf && (WATER_NEEDS[i.slot] || i.slot === 'kitchen_run'));
    for (const item of here) {
      if (item.slot === 'kitchen_run') {
        const zones = kitchenRunZones(room, item, [...existing, ...points], items);
        if (!zones) continue;
        pipes(room, zones.edge, zones.sinkS, KITCHEN_SINK_WATER);
        if (zones.dishwasherS !== null) pipes(room, zones.edge, zones.dishwasherS, DISHWASHER_WATER);
        continue;
      }
      const edge = nearestEdge(edges, item.position);
      if (edge) pipes(room, edge, alongWall(edge, item.position), WATER_NEEDS[item.slot]!);
    }
    const need = ROOM_WATER[room.type];
    if (here.length > 0 || !need || has('water_supply', room.id)) return;
    const at = spotFor(plan, room, 'water_supply', items, notOn, [...existing, ...points], [], decor);
    const edge = at ? nearestEdge(edges, at) : null;
    if (at && edge) pipes(room, edge, alongWall(edge, at), need);
  };

  for (const room of plan.rooms) {
    if (room.areaM2 < MIN_ROOM_M2) continue;
    // A studio's kitchen half gets the kitchen's water and gas, its living half the living
    // room's air conditioner — each on a wall of its own half, never on the line between them.
    const parts = studioParts(room);
    if (parts) {
      for (const part of parts) {
        const area = partRoom(room, part);
        for (const kind of BY_ROOM[part.type] ?? []) place(area, kind, dividerSegments(room));
        water(area, dividerSegments(room));
      }
      continue;
    }
    for (const kind of BY_ROOM[room.type] ?? []) place(room, kind);
    // A washing machine drains wherever it stands — the hall, when the bathroom had no room for it.
    if (items.some((i) => i.roomId === room.id && i.slot === 'washer')) place(room, 'sewer');
    water(room);
  }

  for (const { kind, rooms } of ONE_PER_FLAT) {
    if (has(kind)) continue;
    // The first room of the preferred type that the flat actually has; none, and it is skipped.
    const room = rooms.map((type) => plan.rooms.find((r) => r.type === type && r.areaM2 >= MIN_ROOM_M2)).find(Boolean);
    if (room) place(room, kind);
  }

  if (!has('boiler')) {
    // In the hall wardrobe's boiler section when the flat has one (the rulebook, E-4): the
    // wardrobe is its cupboard, so it takes no cabinet of its own.
    const housed = housedBoilerSpot(plan.rooms, decor);
    const spot = housed ?? boilerSpot(plan, items, [...existing, ...points], decor, boilerSizeFor(catalog, styleId));
    if (spot) {
      add(spot.room, 'boiler', spot.position, technicalElevation('boiler', underCeiling(spot.room, plan)));
      if (housed) Object.assign(points[points.length - 1], { cabinet: null, housed: true });
    }
  }
  // The boiler's cold in and hot out, under it.
  for (const boiler of [...existing, ...points].filter((p) => p.kind === 'boiler')) {
    const room = plan.rooms.find((r) => r.id === boiler.roomId);
    const edge = room ? nearestEdge(wallEdges(room), boiler.position) : null;
    if (room && edge) pipes(room, edge, alongWall(edge, boiler.position), { hot: true, elevationM: 0 }, Math.max(0.3, Math.round(((boiler.elevationM ?? 1.6) - BOILER_PIPES_BELOW_M) * 100) / 100));
  }

  return { points, counts };
}

/**
 * Where the flat's boiler goes, in the order of `BOILER_ROOMS`: in a hall with the front door (any
 * hall when none has it) wide enough for the cupboard, on a stretch of wall clear of its doors as
 * near the entrance as the stretch allows; else on the balcony, on an outside wall where it can; else
 * in the bathroom on a wall clear of the shower and the bath by `BOILER_WET_CLEAR_M`; else the old
 * rooms. Null when the flat has nowhere. In each room its cupboard is measured at the size of the
 * boiler it will be (`size`) first; where that fits nowhere in the room, at a default boiler's, as
 * before — so the room it goes to is the one it went to.
 */
function boilerSpot(plan: FloorPlan, items: PlacedItem[], placed: TechnicalPoint[], decor: readonly DecorPiece[] = [], size: BoilerSize | null = null): { room: PlanRoom; position: Vec2 } | null {
  const sizes = size ? [size, null] : [null];
  for (const type of BOILER_ROOMS) {
    const rooms = plan.rooms.filter((r) => r.type === type && r.areaM2 >= MIN_ROOM_M2);
    if (rooms.length === 0) continue;
    if (type === 'hallway') {
      const entrance = (r: PlanRoom) => r.openings.some((o) => o.kind === 'door' && o.exterior);
      for (const room of [...rooms].sort((a, b) => Number(entrance(b)) - Number(entrance(a)) || b.areaM2 - a.areaM2)) {
        if (narrowSide(room) < BOILER_HALL_MIN_WIDTH_M) continue;
        const position = tierBySize(room, items, decor, placed, sizes, (tier, sized) =>
          hallCupboardSpot(room, [tier], sized ? Math.max(BOILER_CUPBOARD_M, cupboardWidthM(room, sized)) : BOILER_CUPBOARD_M),
        );
        if (position) return { room, position };
      }
      continue;
    }
    if (type === 'bathroom') {
      for (const room of [...rooms].sort((a, b) => b.areaM2 - a.areaM2)) {
        const position = tierBySize(room, items, decor, placed, sizes, (tier, sized) =>
          clearOfWet(room, items, [tier], sized ? Math.max(CLEAR_WALL_M, cupboardWidthM(room, sized)) : CLEAR_WALL_M),
        );
        if (position) return { room, position };
      }
      continue;
    }
    const best = rooms
      .map((room) => ({ room, outside: outsideEdges(plan, room) }))
      .sort((a, b) => Number(b.outside.length > 0) - Number(a.outside.length > 0) || b.room.areaM2 - a.room.areaM2)[0];
    if (type === 'storage' && best.outside.length === 0) continue;
    const position = (size ? spotFor(plan, best.room, 'boiler', items, [], placed, best.outside, decor, size) : null) ?? spotFor(plan, best.room, 'boiler', items, [], placed, best.outside, decor);
    if (position) return { room: best.room, position };
  }
  return null;
}

/**
 * A cupboard's spot in a room, the strictest tier first (`cupboardTiers`) and, within each tier,
 * the boiler's own size before a default one's: so a cupboard is put through the furniture at the
 * style's size only where no stretch clear of it holds even a default boiler's — where one does,
 * it goes there as it did before the style's size was known.
 */
function tierBySize(room: PlanRoom, items: readonly PlacedItem[], decor: readonly DecorPiece[], placed: readonly TechnicalPoint[], sizes: ReadonlyArray<BoilerSize | null>, spot: (tier: CupboardBlocks | null, size: BoilerSize | null) => Vec2 | null): Vec2 | null {
  const tiers = sizes.map((sized) => cupboardTiers(room, items, decor, placed, sized));
  for (let t = 0; t < tiers[0].length; t++) {
    for (let i = 0; i < sizes.length; i++) {
      const position = spot(tiers[i][t], sizes[i]);
      if (position) return position;
    }
  }
  return null;
}

/** How wide a boiler's cupboard is in this room: the boiler's width and the cabinet's clearance (`boilerCabinetSize`). */
function cupboardWidthM(room: PlanRoom, size: BoilerSize | null): number {
  return boilerCabinetSize(size ? { sizeM: size } : {}, room).width;
}

/** The shorter side of a room's bounding box. */
function narrowSide(room: PlanRoom): number {
  const xs = room.polygon.map((p) => p.x);
  const zs = room.polygon.map((p) => p.z);
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
}

/** What is in the way of a boiler's cupboard on one wall, the height it takes — it stands on the floor and reaches over the boiler — and how wide it is. */
interface CupboardBlocks {
  of: (edge: PlanEdge) => WallBlock[];
  band: { bottom: number; top: number };
  widthM: number;
}

/**
 * What a boiler's cupboard must stand clear of in a room: the furniture and the joinery at each
 * wall (`wallBlocks`), and the equipment already hung there — the panel, an air conditioner, a
 * fan — each at its own spot, as wide as its product when it has one. The cupboard is as wide and
 * as tall as it will be round a boiler of `size` (`boilerCabinetSize`); with none, a default
 * boiler's width and what hangs at a point's height.
 */
function cupboardBlocks(room: PlanRoom, items: readonly PlacedItem[], decor: readonly DecorPiece[], placed: readonly TechnicalPoint[], size: BoilerSize | null = null): CupboardBlocks {
  const edges = wallEdges(room);
  const hung = placed.filter((p) => p.roomId === room.id && p.kind !== 'boiler' && isEquipmentKind(p.kind) && TECHNICAL_KINDS[p.kind].placement === 'wall');
  const cabinet = size ? boilerCabinetSize({ sizeM: size }, room) : null;
  return {
    band: cabinet ? { bottom: cabinet.bottom, top: cabinet.bottom + cabinet.height } : { bottom: 0, top: technicalElevation('boiler', room) + POINT_HEIGHT_M },
    widthM: cupboardWidthM(room, size),
    of: (edge) => [
      ...wallBlocks(room, edge, items, decor),
      ...hung
        .filter((p) => nearestEdge(edges, p.position)?.index === edge.index)
        .map((p) => {
          const s = alongWall(edge, p.position);
          const half = (p.sizeM?.width ?? 0) / 2;
          const bottom = p.elevationM ?? technicalElevation(p.kind, room);
          return { from: s - half, to: s + half, bottom, top: bottom + (p.sizeM?.height ?? 0) };
        }),
    ],
  };
}

/**
 * What a boiler's cupboard is kept clear of, strictest first: everything that stands or hangs at
 * the wall; when the room has no such stretch, the equipment hung there alone (never on the panel,
 * though behind a mirror); then the openings alone, as in a bare room.
 */
function cupboardTiers(room: PlanRoom, items: readonly PlacedItem[], decor: readonly DecorPiece[], placed: readonly TechnicalPoint[], size: BoilerSize | null = null): Array<CupboardBlocks | null> {
  return [cupboardBlocks(room, items, decor, placed, size), cupboardBlocks(room, [], [], placed, size), null];
}

/** A wall's stretches clear of its openings (10 cm round each) — and, given them, of what is in a cupboard's way. */
function cupboardSpans(room: PlanRoom, edge: PlanEdge, blocks: CupboardBlocks | null): Array<[number, number]> {
  const open = freeSpans(edge, room.openings, 0, edge.length, 0.1);
  return blocks ? clearOf(open, blocks.of(edge), blocks.band) : open;
}

/**
 * The boiler's place in the hall's technical cupboard: on a stretch of wall `lengthM` long or more
 * (`BOILER_CUPBOARD_M`, or the cupboard's own width where that is more), clear of the doors, the
 * cupboard's middle as near the front door as the stretch allows (the middle of the longest
 * stretch in a hall with no front door). A stretch clear of the furniture, the joinery and the
 * panel too when the hall has one (`tiers`, strictest first); one clear of the doors alone only
 * when it has none.
 */
function hallCupboardSpot(room: PlanRoom, tiers: ReadonlyArray<CupboardBlocks | null> = [null], lengthM = BOILER_CUPBOARD_M): Vec2 | null {
  const door = room.openings.find((o) => o.kind === 'door' && o.exterior);
  const doorAt = door ? openingWorldPoint(room, door) : null;
  const half = lengthM / 2;
  for (const blocks of tiers) {
    let best: { position: Vec2; score: number } | null = null;
    for (const edge of wallEdges(room)) {
      for (const [a, b] of cupboardSpans(room, edge, blocks)) {
        if (b - a < lengthM) continue;
        const s = doorAt ? Math.min(b - half, Math.max(a + half, alongWall(edge, doorAt))) : (a + b) / 2;
        const position = offInto(edge, s / edge.length);
        const score = doorAt ? Math.hypot(position.x - doorAt.x, position.z - doorAt.z) : -(b - a);
        if (!best || score < best.score) best = { position, score };
      }
    }
    if (best) return best.position;
  }
  return null;
}

/**
 * A boiler's place in a bathroom: on a stretch of wall clear of its door and window, and
 * `BOILER_WET_CLEAR_M` from a shower or a bath — the spot farthest from them. On wall clear of the
 * WC, the basin, what is built there and the fan too when the bathroom has such a spot (`tiers`);
 * clear of the openings and the wet alone only when it has none. Null when no wall has a spot.
 */
function clearOfWet(room: PlanRoom, items: PlacedItem[], tiers: ReadonlyArray<CupboardBlocks | null> = [null], bareWidthM = CLEAR_WALL_M): Vec2 | null {
  const wet = items.filter((i) => i.roomId === room.id && BATH_OR_SHOWER.has(i.slot));
  const near = (p: Vec2) =>
    wet.some((item) => pointInPolygon(p, footprintQuad({ ...item, size: { ...item.size, width: item.size.width + 2 * BOILER_WET_CLEAR_M, depth: item.size.depth + 2 * BOILER_WET_CLEAR_M } })));
  const distance = (p: Vec2) => Math.min(Infinity, ...wet.map((i) => Math.hypot(i.position.x - p.x, i.position.z - p.z)));
  for (const blocks of tiers) {
    // Clear of what stands there, the whole cupboard is; clear of the openings alone, a boiler's width
    // and some — the cupboard's, when the boiler's size is known (`bareWidthM`).
    const width = blocks ? Math.max(CLEAR_WALL_M, blocks.widthM) : bareWidthM;
    let best: { position: Vec2; distance: number } | null = null;
    for (const edge of wallEdges(room)) {
      for (const [a, b] of cupboardSpans(room, edge, blocks)) {
        if (b - a < width) continue;
        for (let s = a + width / 2; s <= b - width / 2 + 1e-6; s += 0.1) {
          const position = offInto(edge, s / edge.length);
          if (near(position)) continue;
          const d = distance(position);
          if (!best || d > best.distance) best = { position, distance: d };
        }
      }
    }
    if (best) return best.position;
  }
  return null;
}

/**
 * Where one point goes in one room: at the fixture it serves when the room has one, and
 * otherwise on the wall a fitter would choose — the longest one with no door in it, so the
 * pipe or the duct has a clear run. A boiler of a known `size` goes only on a stretch its cupboard
 * fits, bare or furnished — null where the room has none, for the caller to place it as before.
 */
function spotFor(plan: FloorPlan, room: PlanRoom, kind: TechnicalKind, items: PlacedItem[], notOn: Array<[Vec2, Vec2]> = [], placed: TechnicalPoint[] = [], prefer: PlanEdge[] = [], decor: readonly DecorPiece[] = [], size: BoilerSize | null = null): Vec2 | null {
  const info = TECHNICAL_KINDS[kind];
  // A studio's dividing line is not a wall: nothing is fixed to it.
  // Nor is a room separator (`wallEdges`).
  const edges = wallEdges(room).filter((edge) => !notOn.some(([a, b]) => onSegment(pointOnEdge(edge, 0.5), a, b)));
  if (edges.length === 0) return null;

  // The fixture this kind serves, biggest first — a bath before a basin. A kitchen's extractor
  // is a cooker hood (`lib/design/equipment`): it serves the run, the hob being on it.
  const hood = isHood(room, kind);
  // A corner kitchen's leg has no sink and no hob of its own: the run it turns off is what is served.
  const served = items
    .filter((i) => i.roomId === room.id && !i.legOf && (info.attracts.includes(i.kind) || (hood && i.kind === 'kitchen_run')))
    .sort((a, b) => b.size.width * b.size.depth - a.size.width * a.size.depth)[0];

  if (served && served.slot === 'kitchen_run') {
    // A kitchen run is one piece: its water and waste go to the sink's end, its gas and its hood
    // to the hob (`kitchenRunZones` — the same order the run's sockets are placed by).
    const zones = kitchenRunZones(room, served, placed, items);
    if (zones) {
      const s = kind === 'water_supply' || kind === 'water_hot' || kind === 'sewer' ? zones.sinkS : zones.hobS;
      return offInto(zones.edge, s / zones.edge.length);
    }
  }

  if (served) {
    // Waste and drains sit under the fixture; everything else comes to the wall behind it.
    if (info.placement !== 'wall') return round(served.position);
    const edge = nearestEdge(edges, served.position);
    return edge ? offInto(edge, projectOnto(edge, served.position)) : round(served.position);
  }

  if (info.placement === 'floor') return round(centroid(room.polygon));
  // On a stretch of wall clear of its doors, windows and railings — a balcony's outside walls are
  // often railing their whole length, and its boiler was hung on the railing. A wall with no such
  // stretch only when no wall has one, and never one with a railing in it.
  // In a furnished room, clear of the furniture, the joinery and decorated wall too at the height
  // it hangs at (the owner's notes of 13 Nov 2026) — a wall with no such stretch only when no wall has one.
  // A boiler is in a cupboard that stands on the floor: clear from the floor up, and of the
  // equipment already hung on the wall (`cupboardBlocks`).
  const cupboard = kind === 'boiler' ? cupboardBlocks(room, items, decor, placed, size) : null;
  const elevation = technicalElevation(kind, room);
  const band = cupboard?.band ?? { bottom: Math.max(0, elevation - 0.15), top: elevation + POINT_HEIGHT_M };
  const bare = new Map(edges.map((e) => [e.index, widestClear(room, e, [], undefined, size && cupboard ? cupboard.widthM : CLEAR_WALL_M)]));
  const furnished = new Map(edges.map((e) => [e.index, widestClear(room, e, cupboard ? cupboard.of(e) : wallBlocks(room, e, items, decor), band, cupboard?.widthM)]));
  const clear = edges.some((e) => furnished.get(e.index)) ? furnished : bare;
  const usable = edges.filter((e) => clear.get(e.index));
  if (size && usable.length === 0) return null;
  const walls = usable.length > 0 ? usable : edges.filter((e) => !room.openings.some((o) => o.kind === 'railing' && o.wallIndex === e.index));
  // An outside wall when the kind wants one (the boiler's flue) and the room has one.
  const outside = walls.filter((e) => prefer.some((p) => p.index === e.index));
  const edge = bestWall(room, outside.length > 0 ? outside : walls, kind);
  if (!edge) return null;
  const span = clear.get(edge.index);
  return offInto(edge, span ? (span[0] + span[1]) / 2 / edge.length : 0.5);
}

/**
 * The widest stretch of a wall clear of its openings (10 cm round each) — and of what stands
 * against it in a band of height, when given — if one is `CLEAR_WALL_M` or more (`widthM` or more
 * for what is wider: a boiler's cupboard).
 */
function widestClear(room: PlanRoom, edge: PlanEdge, blocks: readonly WallBlock[] = [], band: { bottom: number; top: number } = { bottom: 0, top: 0 }, widthM = CLEAR_WALL_M): [number, number] | null {
  const open = freeSpans(edge, room.openings, 0, edge.length, 0.1);
  const spans = (blocks.length > 0 ? clearOf(open, blocks, band) : open).filter(([a, b]) => b - a >= Math.max(CLEAR_WALL_M, widthM));
  return spans.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0] ?? null;
}

/**
 * The wall a fitter would run it to: no door in it, and as long as possible. A bathroom's fan
 * and an air conditioner prefer an outside wall, which is where the duct and the pipes go; a
 * cooker hood is hung over a hob, which is not put under a window.
 */
function bestWall(room: PlanRoom, edges: PlanEdge[], kind: TechnicalKind): PlanEdge | null {
  const doored = new Set(room.openings.filter((o) => o.kind !== 'window').map((o) => o.wallIndex));
  const windowed = new Set(room.openings.filter((o) => o.kind === 'window').map((o) => o.wallIndex));
  const hood = isHood(room, kind);
  const outside = (kind === 'extractor' && !hood) || kind === 'ac_unit';
  const score = (edge: PlanEdge) => edge.length + (doored.has(edge.index) ? -20 : 0) + (windowed.has(edge.index) ? (outside ? 6 : hood ? -6 : 0) : 0);
  return [...edges].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** An extractor in a kitchen (or a studio's kitchen half) is a cooker hood. */
function isHood(room: PlanRoom, kind: TechnicalKind): boolean {
  return kind === 'extractor' && HOOD_ROOM_TYPES.includes(room.type);
}

function onSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-9) return false;
  const s = ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / length;
  const d = Math.abs((p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x)) / length;
  return d < 0.01 && s >= -0.01 && s <= length + 0.01;
}

function nearestEdge(edges: PlanEdge[], point: Vec2): PlanEdge | null {
  let best: { edge: PlanEdge; distance: number } | null = null;
  for (const edge of edges) {
    const s = Math.max(0, Math.min(edge.length, (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z));
    const distance = Math.hypot(point.x - (edge.a.x + edge.dir.x * s), point.z - (edge.a.z + edge.dir.z * s));
    if (!best || distance < best.distance) best = { edge, distance };
  }
  return best?.edge ?? null;
}

/** Where along an edge a point falls, as 0..1. */
function projectOnto(edge: PlanEdge, point: Vec2): number {
  const s = (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z;
  return Math.max(0.05, Math.min(0.95, s / Math.max(edge.length, 1e-6)));
}

/** A spot on a wall, pushed just inside the room so it reads as standing on that wall. */
function offInto(edge: PlanEdge, t: number): Vec2 {
  const at = pointOnEdge(edge, t);
  return round({ x: at.x + edge.inward.x * OFF_WALL_M, z: at.z + edge.inward.z * OFF_WALL_M });
}

function centroid(polygon: Vec2[]): Vec2 {
  return { x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length, z: polygon.reduce((s, p) => s + p.z, 0) / polygon.length };
}

function round(p: Vec2): Vec2 {
  return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
}
