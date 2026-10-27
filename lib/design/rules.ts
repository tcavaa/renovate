/**
 * The interior design and building rules the app follows, in one place: the owner's brief
 * (technical rules, layout rules, practical sizes — docs/design-studio/design-rules.md) as
 * named numbers, each with the range it came from, and where a kitchen run's sink, hob and
 * appliances are taken to stand.
 *
 * The fittings (`electrical.ts`), the technical points (`autoTechnical.ts`, `technical.ts`),
 * the radiators (`radiators.ts`) and the checks (`ruleChecks.ts`) read their numbers from here,
 * so a rule is changed once. A leaf module — plan geometry and types only — so any of them can
 * import it.
 */

import { isOpenEdge, isPassage, pointOnEdge, roomEdges, wallEdges, type PlanEdge } from './planGeometry';
import type { Opening, PlacedItem, PlanRoom, SlotKind, TechnicalPoint, Vec2 } from './types';

// ---------------------------------------------------------------------------
// Sockets and switches
// ---------------------------------------------------------------------------

/** A general socket: 30–45 cm. */
export const SOCKET_M = 0.45;
/** Beside a bed with no nightstand on that side: 30–45 cm. */
export const BEDSIDE_LOW_SOCKET_M = 0.35;
/** Beside a nightstand: just above its top, kept within 45–75 cm. */
export const NIGHTSTAND_SOCKET_ABOVE_M = 0.1;
export const NIGHTSTAND_SOCKET_RANGE_M = { min: 0.45, max: 0.75 } as const;
/** The worktop: 90 cm. Its sockets 10–20 cm above it, 100–110 cm — at 90 they would be hidden behind the counter. */
export const KITCHEN_WORKTOP_M = 0.9;
export const KITCHEN_SOCKET_M = 1.05;
/** Behind an appliance in the base units (dishwasher, oven, the hob's ignition). */
export const APPLIANCE_SOCKET_M = 0.3;
/** The fridge's: low, 30–50 cm. */
export const FRIDGE_SOCKET_M = 0.4;
/** The cooker hood's: high, 200–230 cm. */
export const HOOD_SOCKET_M = 2.15;
/** The under-cabinet LED's driver, inside the wall cabinets. */
export const CABINET_LIGHT_SOCKET_M = 1.7;
/** High sockets either side of a TV wall (a sound bar, a lamp on a shelf). */
export const HIGH_SOCKET_M = 1.7;
/** The TV's: 100–120 cm, behind the set. */
export const TV_SOCKET_M = 1.1;
/** A desk's: just above the desktop. */
export const DESK_SOCKET_ABOVE_M = 0.1;
/** Switches: 90–110 cm. */
export const SWITCH_M = 1.05;
/** A switch by the bed, part of a two-way pair with the door's. */
export const BEDSIDE_SWITCH_M = 0.9;
/**
 * From the edge of the opening to the switch's centre, on the handle side: the frame takes
 * about 5 cm, which leaves the 15–20 cm from the frame the brief asks for.
 */
export const SWITCH_FROM_OPENING_M = 0.2;
/** A hallway this long or longer is switched from both ends (two-way). */
export const TWO_WAY_CORRIDOR_M = 4;

// ---------------------------------------------------------------------------
// Heating
// ---------------------------------------------------------------------------

/** A radiator's bottom: 10–12 cm off the floor. */
export const RADIATOR_FLOOR_GAP_M = 0.12;
/** Its top: about 10 cm below the window's sill. */
export const RADIATOR_SILL_GAP_M = 0.1;
/** Its back: 3–5 cm off the wall. */
export const RADIATOR_WALL_GAP_M = 0.04;
/** How far in front of a radiator furniture is kept away (beyond the radiator's own depth). */
export const RADIATOR_KEEP_CLEAR_M = 0.3;
/** Room left at each end of a radiator when it is hung beside a window rather than under it. */
export const RADIATOR_BESIDE_WINDOW_M = 0.15;

/**
 * Where automatic placement hangs the flat's one boiler, in this order — always on an outside
 * wall, where its flue can leave: a utility (storage) room, else the balcony, else the kitchen,
 * else the bathroom. A storage room counts only with an outside wall; the others are taken
 * even without one when nothing better exists (the person moves it).
 */
export const BOILER_ROOMS: Array<PlanRoom['type']> = ['storage', 'balcony', 'kitchen', 'bathroom', 'studio'];

// ---------------------------------------------------------------------------
// Water (წყალმომარაგება): cold in blue, hot in red, a point per pipe at every fixture
// ---------------------------------------------------------------------------

/** What each fixture is fed: cold, and hot too where somebody washes under it. */
export interface WaterNeed {
  hot: boolean;
  /** The height the pipes come out of the wall for it. */
  elevationM: number;
}

/**
 * The brief's sanitary plan: a basin, a kitchen sink, a shower, a bath (and a bidet, which the
 * app has no piece for yet) take cold and hot; a WC, a washing machine and a dishwasher cold only.
 * The heights are the usual outlets: under a basin, behind a WC's cistern, a shower's and a
 * bath's mixer, a washing machine's tap above it.
 */
export const WATER_NEEDS: Partial<Record<SlotKind, WaterNeed>> = {
  sink: { hot: true, elevationM: 0.55 },
  shower: { hot: true, elevationM: 1.0 },
  bathtub: { hot: true, elevationM: 0.75 },
  toilet: { hot: false, elevationM: 0.2 },
  washer: { hot: false, elevationM: 0.9 },
};
/** A kitchen run's sink and dishwasher (`kitchenRunZones`). */
export const KITCHEN_SINK_WATER: WaterNeed = { hot: true, elevationM: 0.5 };
export const DISHWASHER_WATER: WaterNeed = { hot: false, elevationM: 0.3 };
/** A boiler takes cold in and gives hot out, under it. */
export const BOILER_PIPES_BELOW_M = 0.15;
/**
 * The two pipes of a pair, apart along the wall: a mixer's inlets are 15 cm apart. Hot is on the
 * left, cold on the right, as one stands facing the wall.
 */
export const WATER_PAIR_SPACING_M = 0.15;
/** A point already within this of where one would go, and within this of its height, counts as that one. */
export const WATER_POINT_REACH_M = 0.5;
export const WATER_HEIGHT_REACH_M = 0.2;

/**
 * The sewer point stands for the plumbing shaft: the WC, the kitchen's sink and the washing
 * machine go close to it (short pipes, a fall that drains). Further than this, a warning.
 */
export const SHAFT_MAX_DISTANCE_M = 2;
export const SHAFT_FIXTURES: SlotKind[] = ['toilet', 'washer', 'kitchen_run'];

// ---------------------------------------------------------------------------
// Doors and passages
// ---------------------------------------------------------------------------

/** A room's door: 80–90 cm; a bathroom's or toilet's at least 70 cm. */
export const ROOM_DOOR_MIN_M = 0.8;
export const WET_DOOR_MIN_M = 0.7;
export const WET_ROOM_TYPES: Array<PlanRoom['type']> = ['bathroom', 'toilet'];

/** The flat's own front door, when the app adds one. */
export const ENTRANCE_DOOR_M = 0.9;

/** The narrowest a door into a room of this type should be — and the width the app gives a new one. */
export function minDoorWidthM(type: PlanRoom['type']): number {
  return WET_ROOM_TYPES.includes(type) ? WET_DOOR_MIN_M : ROOM_DOOR_MIN_M;
}

/** A new door between two rooms: the narrower room's minimum (70 cm into a bathroom, 80 cm otherwise); to the outside, the entrance's. */
export function doorWidthFor(type: PlanRoom['type'], other: PlanRoom['type'] | null): number {
  return other === null ? ENTRANCE_DOOR_M : Math.min(minDoorWidthM(type), minDoorWidthM(other));
}

// ---------------------------------------------------------------------------
// Layout (the brief's part 2 and 3)
// ---------------------------------------------------------------------------

/** Free beside a double bed, each side: 60–70 cm. */
export const BED_SIDE_FREE_M = 0.6;
/** From the sofa to the screen: 2.5–3.5 m. */
export const SOFA_TV_M = { min: 2.5, max: 3.5 } as const;
/** The coffee table's edge from the sofa's front: 40–45 cm. */
export const COFFEE_TABLE_GAP_M = 0.42;
/** The TV's centre: seated eye level, 100–110 cm. */
export const TV_CENTRE_M = 1.05;
/** Width at a dining table per person. */
export const DINING_SEAT_M = 0.6;
/** Between a kitchen run and a counter facing it (an island): 120 cm. */
export const FACING_COUNTERS_M = 1.2;
/** Wall cabinets: 50–60 cm over the worktop. */
export const WALL_UNIT_OVER_WORKTOP_M = 0.55;
export const WALL_UNIT_BOTTOM_M = 0.9 + WALL_UNIT_OVER_WORKTOP_M;
/** A wardrobe's depth: 60 cm, or a shallow one 35–40 cm. */
export const WARDROBE_DEPTH_M = 0.6;
export const SHALLOW_WARDROBE_DEPTH_M = 0.38;
/** A shower: at least 80 × 80, preferably 90 × 90. */
export const SHOWER_MIN_M = 0.8;
/** A WC's centre from a side wall (or anything beside it): 40 cm. */
export const WC_SIDE_M = 0.4;
/** A basin's top: 85 cm (the check allows a few centimetres either way). */
export const BASIN_TOP_M = 0.85;
export const BASIN_TOP_TOLERANCE_M = 0.07;
/** A bathroom's splash zone round a shower or bath, where no socket goes. */
export const SPLASH_ZONE_M = 0.6;

/** A floor footprint, four corners. */
export type Quad = [Vec2, Vec2, Vec2, Vec2];

/** A piece's footprint on the floor, turned with it. */
export function footprintQuad(item: Pick<PlacedItem, 'position' | 'rotation' | 'size'>): Quad {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const right = { x: forward.z, z: -forward.x };
  const w = item.size.width / 2;
  const d = item.size.depth / 2;
  const at = (r: number, f: number): Vec2 => ({ x: item.position.x + right.x * r + forward.x * f, z: item.position.z + right.z * r + forward.z * f });
  return [at(-w, -d), at(w, -d), at(w, d), at(-w, d)];
}

/** Whether two convex outlines overlap by more than a centimetre (separating axes). */
export function quadsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const axis = { x: -(q.z - p.z), z: q.x - p.x };
      const len = Math.hypot(axis.x, axis.z) || 1;
      const project = (pts: Vec2[]) => pts.map((v) => (v.x * axis.x + v.z * axis.z) / len);
      const pa = project(a);
      const pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) + 0.01 || Math.max(...pb) <= Math.min(...pa) + 0.01) return false;
    }
  }
  return true;
}

/** How far from `from`, along the unit direction `dir`, the ray first meets the outline. */
export function rayToPolygon(from: Vec2, dir: Vec2, polygon: Vec2[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const denom = dir.x * ez - dir.z * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((a.x - from.x) * ez - (a.z - from.z) * ex) / denom;
    const u = ((a.x - from.x) * dir.z - (a.z - from.z) * dir.x) / denom;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && (best == null || t < best)) best = t;
  }
  return best;
}

/**
 * What one sees straight ahead coming through a doorway: a band as wide as the opening, from the
 * opening into the room until the far wall. "Not facing the door" means not in it — the WC, ideally
 * the bed, and the kitchen from the flat's entrance.
 */
export interface SightBand {
  roomId: string;
  quad: Quad;
  /** The opening it is seen through. */
  openingId: string;
}

export function doorSightBand(room: PlanRoom, opening: Opening): SightBand | null {
  const edge = roomEdges(room.polygon).find((e) => e.index === opening.wallIndex);
  if (!edge) return null;
  const centre = pointOnEdge(edge, opening.t);
  const start = { x: centre.x + edge.inward.x * 0.01, z: centre.z + edge.inward.z * 0.01 };
  const depth = Math.min(8, rayToPolygon(start, edge.inward, room.polygon) ?? 0);
  if (depth < 0.3) return null;
  const half = opening.widthM / 2;
  const side = (s: number, d: number): Vec2 => ({ x: centre.x + edge.dir.x * s + edge.inward.x * d, z: centre.z + edge.dir.z * s + edge.inward.z * d });
  return { roomId: room.id, openingId: opening.id, quad: [side(-half, 0), side(half, 0), side(half, depth), side(-half, depth)] };
}

/** The bands seen through every doorway of a room, from inside it. */
export function roomSightBands(room: PlanRoom): SightBand[] {
  return room.openings.filter(isPassage).flatMap((o) => doorSightBand(room, o) ?? []);
}

/**
 * What one sees coming in through the flat's front door (a door on an outside wall that is not
 * onto a balcony): the band in the room it opens into and, when that band ends at a doorway
 * straight ahead, the band carried on through it into the next room.
 */
export function entranceSightBands(rooms: PlanRoom[]): SightBand[] {
  const out: SightBand[] = [];
  for (const room of rooms) {
    if (room.type === 'balcony') continue;
    for (const door of room.openings) {
      if (door.kind !== 'door' || !door.exterior) continue;
      const band = doorSightBand(room, door);
      if (!band) continue;
      out.push(band);
      // A doorway on the far wall, inside the band: what is behind it is in sight too.
      const far = [band.quad[2], band.quad[3]];
      for (const ahead of room.openings) {
        if (ahead === door || !isPassage(ahead) || !ahead.connectsToRoomId) continue;
        const edge = roomEdges(room.polygon).find((e) => e.index === ahead.wallIndex);
        if (!edge) continue;
        const at = pointOnEdge(edge, ahead.t);
        const nearFar = Math.min(...far.map((p) => Math.hypot(p.x - at.x, p.z - at.z)));
        if (nearFar > door.widthM + ahead.widthM / 2) continue;
        const next = rooms.find((r) => r.id === ahead.connectsToRoomId);
        const twin = next?.openings.find((o) => o.connectsToRoomId === room.id && isPassage(o));
        const onward = next && twin ? doorSightBand(next, twin) : null;
        if (onward) out.push(onward);
      }
    }
  }
  return out;
}

/**
 * A room's niches: a stretch of wall set back from the room (the back of a recess) with walls
 * either side of it coming out to the room — a recess 30 cm to 1 m deep and 60 cm to 3 m wide. A
 * wardrobe goes into one first.
 */
export interface Niche {
  /** The recess's back wall. */
  back: PlanEdge;
  depthM: number;
  widthM: number;
}

export function roomNiches(room: PlanRoom): Niche[] {
  const edges = roomEdges(room.polygon);
  const n = edges.length;
  const out: Niche[] = [];
  if (n < 6) return out;
  for (let i = 0; i < n; i++) {
    const back = edges[i];
    const before = edges[(i - 1 + n) % n];
    const after = edges[(i + 1) % n];
    if ([back, before, after].some((e) => isOpenEdge(room, e.index))) continue;
    const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z;
    // The sides run square to the back, the one before towards it, the one after away — the room
    // in front of the back wall, the sides facing each other across the recess.
    const square = Math.abs(dot(before.dir, back.dir)) < 0.1 && Math.abs(dot(after.dir, back.dir)) < 0.1;
    const into = dot(before.dir, back.inward) < -0.9 && dot(after.dir, back.inward) > 0.9;
    const facing = dot(before.inward, back.dir) > 0.9 && dot(after.inward, back.dir) < -0.9;
    if (!square || !into || !facing) continue;
    // …and where each side meets the room, the room's wall carries on the way the back runs (both
    // corners turn out): that is what makes it a recess and not the end of a plain room or one
    // arm of an L. (A recess in a room's corner, open on one side only, cannot be told from the
    // arm of an L by its outline, so it is not taken for one.)
    const beyondBefore = edges[(i - 2 + n) % n];
    const beyondAfter = edges[(i + 2) % n];
    if (dot(beyondBefore.dir, back.dir) < 0.9 || dot(beyondAfter.dir, back.dir) < 0.9) continue;
    const depthM = Math.min(before.length, after.length);
    if (depthM < 0.3 || depthM > 1 || back.length < 0.6 || back.length > 3) continue;
    out.push({ back, depthM, widthM: back.length });
  }
  return out.sort((a, b) => b.widthM - a.widthM);
}

// ---------------------------------------------------------------------------
// The kitchen run
// ---------------------------------------------------------------------------

/** The units of a run, 60 cm each. */
const UNIT_M = 0.6;

/** Where, along a kitchen run, its parts are taken to stand. */
export interface KitchenRunZones {
  /** The wall the run stands against. */
  edge: PlanEdge;
  /** Metres along that wall (from `edge.a`) of each part's centre; the dishwasher's is null when the run is too short for one. */
  sinkS: number;
  dishwasherS: number | null;
  hobS: number;
  /** The worktop's free stretches, as [from, to] along the wall: the prep zone between sink and hob, then the coffee zone past the hob. */
  worktop: Array<[number, number]>;
  /** The run's far end from the sink, along the wall. */
  farEndS: number;
  /** World points of the sink and the hob. */
  sink: Vec2;
  hob: Vec2;
}

/**
 * A kitchen run is one piece: the app does not know where its sink, hob and appliances are.
 * It takes the order a kitchen is usually built in — the sink at one end with the dishwasher
 * beside it, a prep zone, the hob (with the oven under it) towards the middle, the rest of the
 * worktop past it for the kettle and the coffee machine. The sink's end is the one nearer the
 * water or the drain; with neither marked, the one nearer the fridge (fridge → sink → prep →
 * hob is the work flow); with no fridge either, the wall's first end.
 *
 * `points` are the room's technical points. Null when the run stands against no wall.
 */
export function kitchenRunZones(room: PlanRoom, run: PlacedItem, points: TechnicalPoint[] = [], items: PlacedItem[] = []): KitchenRunZones | null {
  const edge = backWallOf(room, run);
  if (!edge) return null;
  const centreS = alongWall(edge, run.position);
  const width = Math.min(run.size.width, edge.length);
  const low = Math.max(0, centreS - width / 2);
  const high = Math.min(edge.length, centreS + width / 2);
  const span = high - low;

  const ends = [low, high].map((s) => ({ s, at: pointOnEdge(edge, s / edge.length) }));
  const pipes = points.filter((p) => p.roomId === room.id && (p.kind === 'water_supply' || p.kind === 'water_hot' || p.kind === 'sewer')).map((p) => p.position);
  const fridge = items.find((i) => i.roomId === room.id && i.slot === 'fridge');
  const lure = pipes.length > 0 ? pipes : fridge ? [fridge.position] : [];
  const distance = (at: Vec2) => (lure.length === 0 ? 0 : Math.min(...lure.map((p) => Math.hypot(p.x - at.x, p.z - at.z))));
  const sinkAtLow = lure.length === 0 || distance(ends[0].at) <= distance(ends[1].at);
  const sign = sinkAtLow ? 1 : -1;
  const from = sinkAtLow ? low : high;
  const s = (u: number) => from + sign * Math.max(0, Math.min(span, u));

  const sinkU = Math.min(UNIT_M / 2, span / 2);
  const hasDishwasher = span >= 3.5 * UNIT_M;
  const dishwasherU = hasDishwasher ? 1.5 * UNIT_M : null;
  const afterSinkU = hasDishwasher ? 2 * UNIT_M : UNIT_M;
  // The hob towards the middle, with at least a unit's prep space after the sink's units.
  const hobU = Math.max(UNIT_M / 2, Math.min(span - UNIT_M / 2, Math.max(span / 2, afterSinkU + UNIT_M / 2 + UNIT_M / 2)));
  const prep: [number, number] = [Math.min(afterSinkU, hobU - UNIT_M / 2), hobU - UNIT_M / 2];
  const coffee: [number, number] = [hobU + UNIT_M / 2, span];
  const worktop = [prep, coffee]
    .filter(([a, b]) => b - a >= 0.25)
    .map(([a, b]): [number, number] => {
      const p = s(a);
      const q = s(b);
      return [Math.min(p, q), Math.max(p, q)];
    });

  return {
    edge,
    sinkS: s(sinkU),
    dishwasherS: dishwasherU === null ? null : s(dishwasherU),
    hobS: s(hobU),
    worktop,
    farEndS: s(span),
    sink: pointOnEdge(edge, s(sinkU) / edge.length),
    hob: pointOnEdge(edge, s(hobU) / edge.length),
  };
}

/** Metres along an edge (from `edge.a`) of the foot of a point on it. */
export function alongWall(edge: PlanEdge, point: Vec2): number {
  return (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z;
}

/** The wall an item stands against: the wall edge nearest the middle of its back, within 45 cm. */
export function backWallOf(room: PlanRoom, item: PlacedItem): PlanEdge | null {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const back = { x: item.position.x - forward.x * (item.size.depth / 2), z: item.position.z - forward.z * (item.size.depth / 2) };
  let best: { edge: PlanEdge; distance: number } | null = null;
  for (const edge of wallEdges(room)) {
    const s = Math.max(0, Math.min(edge.length, alongWall(edge, back)));
    const distance = Math.hypot(back.x - (edge.a.x + edge.dir.x * s), back.z - (edge.a.z + edge.dir.z * s));
    if (distance <= 0.45 && (!best || distance < best.distance)) best = { edge, distance };
  }
  return best?.edge ?? null;
}
