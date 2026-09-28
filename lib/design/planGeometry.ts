/**
 * Turns parsed pixel regions into a metric `FloorPlan`, and provides the geometry the
 * layout engine and the 3D scene builder work against: edges, inward normals, wall segments,
 * doors and windows.
 *
 * Convention: the plan lies in the XZ plane, Y is up (Three.js). Polygons are stored
 * **counter-clockwise** (positive shoelace area), so the room interior is always to the
 * *left* of each directed edge and the inward normal of edge (dx, dz) is (-dz, dx).
 */

import type { Room, RoomType } from '@/lib/calculator/types';
import { ROOM_TYPES, WET_ROOM_TYPES } from '@/lib/calculator/constants';
import { computeRoomAreas } from '@/lib/calculator/materials';
import { effectiveSplit, roomPartsFor } from './studio';
import { roomTypeName, withRoomNames } from './roomNames';
import type {
  FloorPlan,
  Opening,
  ParsedRegion,
  ParseResult,
  PlanRoom,
  Vec2,
} from './types';

export const DEFAULT_WALL_THICKNESS_M = 0.12;
export const DEFAULT_CEILING_HEIGHT_M = 2.8;

// ---------------------------------------------------------------------------
// Polygon basics
// ---------------------------------------------------------------------------

export function signedArea(polygon: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

export function polygonAreaM2(polygon: Vec2[]): number {
  return Math.abs(signedArea(polygon));
}

export function polygonPerimeterM(polygon: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return sum;
}

/** Each edge's length, to the centimetre, in the polygon's own order: edge i runs from point i to the next — a room's walls by `wallIndex`. */
export function edgeLengthsM(polygon: Vec2[]): number[] {
  return polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return round2(Math.hypot(b.x - a.x, b.z - a.z));
  });
}

/** Rewinds a polygon counter-clockwise so interior-is-left holds. */
export function toCounterClockwise(polygon: Vec2[]): Vec2[] {
  return signedArea(polygon) < 0 ? [...polygon].reverse() : [...polygon];
}

export function polygonBounds(polygon: Vec2[]) {
  const xs = polygon.map((p) => p.x);
  const zs = polygon.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

export function polygonCentroid(polygon: Vec2[]): Vec2 {
  const a = signedArea(polygon);
  if (Math.abs(a) < 1e-9) {
    const b = polygonBounds(polygon);
    return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  }
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const cross = p.x * q.z - q.x * p.z;
    cx += (p.x + q.x) * cross;
    cz += (p.z + q.z) * cross;
  }
  return { x: cx / (6 * a), z: cz / (6 * a) };
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export interface PlanEdge {
  index: number;
  a: Vec2;
  b: Vec2;
  length: number;
  /** Unit vector along the edge, a → b. */
  dir: Vec2;
  /** Unit vector pointing into the room. */
  inward: Vec2;
  /** 'x' when the wall runs east-west, 'z' when it runs north-south. */
  axis: 'x' | 'z';
  /** Yaw for an object standing against this wall and facing into the room. */
  facing: number;
}

export function roomEdges(polygon: Vec2[]): PlanEdge[] {
  const edges: PlanEdge[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    const dir = { x: dx / length, z: dz / length };
    const inward = { x: -dir.z, z: dir.x };
    edges.push({
      index: i,
      a,
      b,
      length,
      dir,
      inward,
      axis: Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z',
      facing: Math.atan2(inward.x, inward.z),
    });
  }
  return edges;
}

/**
 * Whether a room's edge lies on a room separator (`PlanRoom.open`): open onto the next room,
 * no wall there — nothing measured, finished, fitted or hung on it.
 */
export function isOpenEdge(room: Pick<PlanRoom, 'open'>, index: number): boolean {
  return !!room.open?.includes(index);
}

/** A room's edges that are walls: all of them but the ones on a room separator. */
export function wallEdges(room: Pick<PlanRoom, 'polygon' | 'open'>): PlanEdge[] {
  const edges = roomEdges(room.polygon);
  return room.open?.length ? edges.filter((e) => !room.open!.includes(e.index)) : edges;
}

/** How far past an open edge to look for the room on its other side, metres. */
const ACROSS_M = 0.05;

/** Whether some room of `rooms` other than `room` lies just past this edge of it. */
function roomAcross(room: PlanRoom, edge: PlanEdge, rooms: readonly PlanRoom[]): PlanRoom | null {
  // Three points along the edge, not one: a separator can end on another part-way along.
  for (const t of [0.25, 0.5, 0.75]) {
    const probe = { x: edge.a.x + (edge.b.x - edge.a.x) * t - edge.inward.x * ACROSS_M, z: edge.a.z + (edge.b.z - edge.a.z) * t - edge.inward.z * ACROSS_M };
    const other = rooms.find((r) => r !== room && pointInPolygon(probe, r.polygon));
    if (other) return other;
  }
  return null;
}

/**
 * A room and every room joined to it across room separators, however many in a row: one open
 * space the plan divides into rooms for their names, finishes and budgets. A separator is a line
 * on the floor, not a wall — furniture stands over it (`lib/design/manipulate`) and a passage
 * runs on across it (`lib/design/clearance`). Just the room when it has no open edge.
 */
export function openFloor(room: PlanRoom, rooms: readonly PlanRoom[]): PlanRoom[] {
  if (!room.open?.length) return [room];
  const floor = [room];
  for (let i = 0; i < floor.length; i++) {
    const current = floor[i];
    for (const edge of roomEdges(current.polygon)) {
      if (!isOpenEdge(current, edge.index)) continue;
      const other = roomAcross(current, edge, rooms);
      if (other && !floor.includes(other)) floor.push(other);
    }
  }
  return floor;
}

/**
 * The edges that hold a piece in on a floor (`openFloor`): every edge of its rooms but an open
 * one with more of the floor across it. The rooms' walls, a partial wall that a separator carries
 * on from included — only the separator's own line is open. `of` narrows it to some of the
 * floor's rooms (a piece squares up to the walls of the room it is in, not to the far face of a
 * partial wall it happens to be near the end of).
 */
export function floorWalls(floor: readonly PlanRoom[], of: readonly PlanRoom[] = floor): PlanEdge[] {
  return of.flatMap((room) => roomEdges(room.polygon).filter((edge) => !isOpenEdge(room, edge.index) || !roomAcross(room, edge, floor)));
}

/** Metres of a room's outline that are walls: its perimeter less the edges on a room separator. */
export function wallPerimeterM(room: Pick<PlanRoom, 'polygon' | 'open' | 'perimeterM'>): number {
  if (!room.open?.length) return room.perimeterM;
  return round2(wallEdges(room).reduce((sum, e) => sum + e.length, 0));
}

export function pointOnEdge(edge: PlanEdge, t: number): Vec2 {
  return {
    x: edge.a.x + (edge.b.x - edge.a.x) * t,
    z: edge.a.z + (edge.b.z - edge.a.z) * t,
  };
}

// ---------------------------------------------------------------------------
// Regions → plan
// ---------------------------------------------------------------------------

export interface BuildPlanOptions {
  metresPerPixel: number;
  ceilingHeightM?: number;
  wallThicknessM?: number;
  imageUrl?: string | null;
  source?: FloorPlan['source'];
}

export function buildPlanFromRegions(
  parse: ParseResult,
  options: BuildPlanOptions
): FloorPlan {
  const mpp = options.metresPerPixel;
  const wallThicknessM = options.wallThicknessM ?? DEFAULT_WALL_THICKNESS_M;

  // Anchor the flat at the origin so the camera framing is predictable.
  const originX = Math.min(...parse.regions.flatMap((r) => r.polygonPx.map((p) => p.x)), 0);
  const originY = Math.min(...parse.regions.flatMap((r) => r.polygonPx.map((p) => p.y)), 0);

  const raw = parse.regions.map((region, i) => {
    const polygon = toCounterClockwise(
      region.polygonPx.map((p) => ({
        x: (p.x - originX) * mpp,
        z: (p.y - originY) * mpp,
      }))
    );
    return { polygon, region, index: i };
  });

  const types = classifyRooms(raw.map((r) => ({ polygon: r.polygon })));

  // Each room is called what it is, and numbered only when the flat has several of its kind
  // (`withRoomNames`) — in the order the plan is read.
  const rooms: PlanRoom[] = withRoomNames(raw.map((r, i) => {
    const type = types[i];
    const areaM2 = polygonAreaM2(r.polygon);
    return {
      id: `r${i + 1}`,
      type,
      name: roomTypeName(type),
      polygon: r.polygon,
      heightM: options.ceilingHeightM ?? ROOM_TYPES[type].defaultHeight,
      areaM2: round2(areaM2),
      perimeterM: round2(polygonPerimeterM(r.polygon)),
      openings: [],
      // A blobby region is usually a mis-trace; flag it so the editor nudges the user.
      lowConfidence: r.region.rectangularity < 0.72,
    };
  }));

  deriveOpenings(rooms, wallThicknessM);

  const allX = rooms.flatMap((r) => r.polygon.map((p) => p.x));
  const allZ = rooms.flatMap((r) => r.polygon.map((p) => p.z));

  return {
    rooms,
    metresPerPixel: mpp,
    bounds: {
      width: allX.length ? Math.max(...allX) - Math.min(...allX) : 0,
      depth: allZ.length ? Math.max(...allZ) - Math.min(...allZ) : 0,
    },
    source: options.source ?? 'parsed',
    imageUrl: options.imageUrl ?? null,
    wallThicknessM,
  };
}

/**
 * Derives the pixel→metre scale from a known total floor area.
 *
 * A drawing has no intrinsic units, so the user tells us one number they do know — the flat's
 * total m² — and everything else follows from it. `/design/plan` also lets them set the scale
 * by typing one room's real width instead.
 */
export function metresPerPixelFromArea(
  regions: ParsedRegion[],
  totalAreaM2: number
): number {
  // Scale against the *polygon* areas, not the raw pixel counts: the polygons are what the
  // rest of the app measures, and after rectilinearisation they differ from the pixel blobs
  // by a few percent. Using the same quantity on both sides makes the reported total land
  // exactly on the number the user typed.
  const totalPx = regions.reduce((sum, r) => sum + Math.abs(polygonAreaPx(r.polygonPx)), 0);
  if (totalPx <= 0 || totalAreaM2 <= 0) return 0.02;
  return Math.sqrt(totalAreaM2 / totalPx);
}

function polygonAreaPx(points: Array<{ x: number; y: number }>): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function metresPerPixelFromRoomWidth(
  region: ParsedRegion,
  realWidthM: number
): number {
  if (region.bboxPx.w <= 0 || realWidthM <= 0) return 0.02;
  return realWidthM / region.bboxPx.w;
}

// ---------------------------------------------------------------------------
// Room typing
// ---------------------------------------------------------------------------

/**
 * First-guess room types from geometry alone.
 *
 * There is no text recognition here, so this is heuristic by design: tiny rooms are wet
 * rooms, long thin ones are corridors, the biggest is the living room, and the rest are
 * bedrooms. The review step exists precisely because this guess is often only 70% right.
 */
export function classifyRooms(rooms: Array<{ polygon: Vec2[] }>): RoomType[] {
  const metrics = rooms.map((r) => {
    const area = polygonAreaM2(r.polygon);
    const b = polygonBounds(r.polygon);
    const long = Math.max(b.width, b.depth);
    const short = Math.min(b.width, b.depth) || 1;
    return { area, aspect: long / short };
  });

  const order = metrics.map((m, i) => i).sort((a, b) => metrics[b].area - metrics[a].area);

  const types: RoomType[] = new Array(rooms.length).fill('bedroom');
  let hasLiving = false;
  let hasKitchen = false;
  let hasBathroom = false;

  for (const i of order) {
    const { area, aspect } = metrics[i];

    if (area < 2.6) {
      types[i] = hasBathroom ? 'toilet' : 'bathroom';
      hasBathroom = true;
      continue;
    }
    if (area < 6 && aspect < 2.4) {
      types[i] = hasBathroom ? 'toilet' : 'bathroom';
      hasBathroom = true;
      continue;
    }
    if (aspect >= 2.6) {
      types[i] = 'hallway';
      continue;
    }
    if (!hasLiving) {
      types[i] = 'living_room';
      hasLiving = true;
      continue;
    }
    if (!hasKitchen && area >= 6 && area <= 18) {
      types[i] = 'kitchen';
      hasKitchen = true;
      continue;
    }
    types[i] = 'bedroom';
  }

  return types;
}

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

const DOOR_WIDTH_M = 0.85;
const DOOR_HEIGHT_M = 2.05;
const WINDOW_WIDTH_M = 1.4;
const WINDOW_HEIGHT_M = 1.4;
const WINDOW_SILL_M = 0.9;

/**
 * Places doors where two rooms share a wall, and windows on the remaining exterior walls.
 *
 * Real doorway positions are drawn as gaps in the plan, but the parser has already sealed
 * those gaps to stop the flood fill leaking — so rather than trying to recover them, doors
 * are placed at the middle of each shared wall run. That is right often enough to look
 * correct, and the user can drag them in the plan editor.
 */
export function deriveOpenings(rooms: PlanRoom[], wallThicknessM: number): void {
  for (const room of rooms) room.openings = [];

  const tolerance = Math.max(wallThicknessM * 2.5, 0.25);

  // --- interior doors on shared walls ---
  //
  // Not on *every* shared wall. A flat is a hallway or living room with private rooms hung
  // off it: a bedroom has one door, to the circulation space, and never opens into the
  // bedroom next door or the kitchen. Putting a door on every party wall — which is what
  // this used to do — left a 3.7 m bedroom with doors on three walls, a window on the fourth,
  // and no wall left for a bed.
  const shared = new Map<string, SharedRun>();
  const runOf = (a: PlanRoom, b: PlanRoom) => shared.get(`${a.id}|${b.id}`) ?? shared.get(`${b.id}|${a.id}`) ?? null;
  // Rooms a room separator divides are open onto each other already: no door between them,
  // and neither is sealed in while the other has a way out.
  const open = new Set<string>();
  const pairKey = (a: PlanRoom, b: PlanRoom) => [a.id, b.id].sort().join('|');
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const run = findSharedRun(rooms[i].polygon, rooms[j].polygon, tolerance);
      if (!run) continue;
      if (isOpenEdge(rooms[i], run.edgeA) || isOpenEdge(rooms[j], run.edgeB)) {
        open.add(pairKey(rooms[i], rooms[j]));
        continue;
      }
      if (run.length >= DOOR_WIDTH_M + 0.15) shared.set(`${rooms[i].id}|${rooms[j].id}`, run);
    }
  }
  const openTo = (r: PlanRoom) => [...open].some((k) => k.split('|').includes(r.id));

  // A studio is its living room and kitchen in one: circulation, ranked with the living room.
  const circulation = (r: PlanRoom) => r.type === 'hallway' || r.type === 'living_room' || r.type === 'studio' || r.type === 'kitchen';
  const rank = (r: PlanRoom) => (r.type === 'hallway' ? 0 : r.type === 'living_room' || r.type === 'studio' ? 1 : r.type === 'kitchen' ? 2 : 3);
  const neighbours = (r: PlanRoom) => rooms.filter((o) => o !== r && runOf(r, o));

  const pairs = new Set<string>();
  const connect = (a: PlanRoom, b: PlanRoom) => pairs.add([a.id, b.id].sort().join('|'));

  for (const room of rooms) {
    const around = neighbours(room);
    if (around.length === 0) continue;
    // A zone of an open space is reached through the space it opens onto.
    if (openTo(room) && !circulation(room)) continue;
    if (circulation(room)) {
      // Circulation spaces open into each other.
      for (const other of around) if (circulation(other)) connect(room, other);
      continue;
    }
    // A private room gets one door: to the best circulation neighbour, or failing that to the
    // neighbour that itself reaches one, or failing that to anything — never sealed in.
    const best = [...around].sort((x, y) => {
      const byRank = rank(x) - rank(y);
      if (byRank !== 0) return byRank;
      const reaches = (r: PlanRoom) => (neighbours(r).some(circulation) ? 0 : 1);
      if (reaches(x) !== reaches(y)) return reaches(x) - reaches(y);
      return runOf(room, y)!.length - runOf(room, x)!.length;
    })[0];
    connect(room, best);
  }

  // Nobody is sealed in. A kitchen whose only neighbours are bedrooms — a hallway the parser
  // merged away, usually — still needs a way in: through whichever neighbour reaches the rest.
  const doorsOf = (r: PlanRoom) => [...pairs, ...open].filter((k) => k.split('|').includes(r.id)).length;
  for (const room of rooms) {
    const around = neighbours(room);
    if (around.length === 0 || doorsOf(room) > 0) continue;
    const best = [...around].sort((x, y) => {
      const byRank = rank(x) - rank(y);
      if (byRank !== 0) return byRank;
      const byDoors = doorsOf(y) - doorsOf(x);
      if (byDoors !== 0) return byDoors;
      return runOf(room, y)!.length - runOf(room, x)!.length;
    })[0];
    connect(room, best);
  }

  for (const key of pairs) {
    const [idA, idB] = key.split('|');
    const a = rooms.find((r) => r.id === idA)!;
    const b = rooms.find((r) => r.id === idB)!;
    // The run was measured with the rooms in plan order; `a`/`b` are in id order. When the
    // two disagree, edgeA belongs to `b` — swapping keeps each door on its own room's wall.
    const stored = shared.get(`${a.id}|${b.id}`);
    const run: SharedRun = stored ?? (() => {
      const rev = shared.get(`${b.id}|${a.id}`)!;
      return { ...rev, edgeA: rev.edgeB, edgeB: rev.edgeA, tA: rev.tB, tB: rev.tA };
    })();
    {
      const shared = run;

      // A wide opening between a living room and a kitchen/hallway reads better as an archway.
      const openPair =
        (a.type === 'living_room' || b.type === 'living_room') &&
        (a.type === 'kitchen' ||
          b.type === 'kitchen' ||
          a.type === 'hallway' ||
          b.type === 'hallway');
      const kind = shared.length > 2.4 && openPair ? 'archway' : 'door';
      const width = kind === 'archway' ? Math.min(1.6, shared.length - 0.2) : DOOR_WIDTH_M;

      a.openings.push({
        id: `${a.id}-${b.id}-d`,
        kind,
        wallIndex: shared.edgeA,
        t: shared.tA,
        widthM: width,
        heightM: kind === 'archway' ? 2.2 : DOOR_HEIGHT_M,
        sillM: 0,
        roomId: a.id,
        connectsToRoomId: b.id,
        exterior: false,
        // One leaf, seen from two rooms: it hangs from the same jamb and swings into the
        // more private room (the one the door was made for, when the ranks differ).
        ...(kind === 'door' ? { hinge: 'left' as const, swing: (rank(a) >= rank(b) ? 'in' : 'out') as 'in' | 'out' } : {}),
      });
      b.openings.push({
        id: `${b.id}-${a.id}-d`,
        kind,
        wallIndex: shared.edgeB,
        t: shared.tB,
        widthM: width,
        heightM: kind === 'archway' ? 2.2 : DOOR_HEIGHT_M,
        sillM: 0,
        roomId: b.id,
        connectsToRoomId: a.id,
        exterior: false,
        ...(kind === 'door' ? { hinge: 'right' as const, swing: (rank(a) >= rank(b) ? 'out' : 'in') as 'in' | 'out' } : {}),
      });
    }
  }

  // --- windows on exterior walls ---
  const noWindows: RoomType[] = ['toilet', 'storage', 'hallway', 'closet'];

  for (const room of rooms) {
    if (noWindows.includes(room.type)) continue;

    const edges = wallEdges(room);
    const used = new Set(room.openings.map((o) => o.wallIndex));
    const candidates = edges
      .filter((e) => !used.has(e.index))
      .filter((e) => e.length >= WINDOW_WIDTH_M + 0.4)
      .filter((e) => !isSharedWithAnyRoom(room, e, rooms, tolerance))
      .sort((a, b) => b.length - a.length);

    const maxWindows = room.areaM2 > 18 ? 2 : 1;
    for (const edge of candidates.slice(0, maxWindows)) {
      const width = Math.min(edge.length - 0.6, room.areaM2 > 14 ? 1.8 : WINDOW_WIDTH_M);
      room.openings.push({
        id: `${room.id}-w${edge.index}`,
        kind: 'window',
        wallIndex: edge.index,
        t: 0.5,
        widthM: width,
        heightM: room.type === 'bathroom' ? 0.8 : WINDOW_HEIGHT_M,
        sillM: room.type === 'bathroom' ? 1.5 : WINDOW_SILL_M,
        roomId: room.id,
        connectsToRoomId: null,
        exterior: true,
      });
    }
  }

  // --- front door: on the hallway if there is one, else the living room or kitchen — a
  // flat is not entered through its smallest bedroom ---
  const entry =
    rooms.find((r) => r.type === 'hallway') ??
    rooms.find((r) => r.type === 'living_room' || r.type === 'studio') ??
    rooms.find((r) => r.type === 'kitchen') ??
    rooms.slice().sort((a, b) => a.areaM2 - b.areaM2)[0];

  if (entry) {
    const edges = roomEdges(entry.polygon);
    const used = new Set(entry.openings.map((o) => o.wallIndex));
    const free = edges
      .filter((e) => !used.has(e.index) && e.length >= 1.2)
      .filter((e) => !isSharedWithAnyRoom(entry, e, rooms, tolerance))
      .sort((a, b) => a.length - b.length)[0];

    if (free) {
      entry.openings.push({
        id: `${entry.id}-entry`,
        kind: 'door',
        wallIndex: free.index,
        t: 0.5,
        widthM: 0.95,
        heightM: DOOR_HEIGHT_M,
        sillM: 0,
        roomId: entry.id,
        connectsToRoomId: null,
        exterior: true,
      });
    }
  }
}

interface SharedRun {
  edgeA: number;
  edgeB: number;
  tA: number;
  tB: number;
  length: number;
}

/** Longest collinear overlap between the two polygons' edges. */
function findSharedRun(
  polyA: Vec2[],
  polyB: Vec2[],
  tolerance: number
): SharedRun | null {
  const edgesA = roomEdges(polyA);
  const edgesB = roomEdges(polyB);
  let best: SharedRun | null = null;

  for (const ea of edgesA) {
    for (const eb of edgesB) {
      if (ea.axis !== eb.axis) continue;

      // Perpendicular distance between the two wall lines.
      const gap =
        ea.axis === 'x' ? Math.abs(ea.a.z - eb.a.z) : Math.abs(ea.a.x - eb.a.x);
      if (gap > tolerance) continue;

      // Overlap along the shared axis.
      const key = ea.axis === 'x' ? 'x' : 'z';
      const a0 = Math.min(ea.a[key], ea.b[key]);
      const a1 = Math.max(ea.a[key], ea.b[key]);
      const b0 = Math.min(eb.a[key], eb.b[key]);
      const b1 = Math.max(eb.a[key], eb.b[key]);
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      const overlap = hi - lo;
      if (overlap <= 0) continue;

      if (!best || overlap > best.length) {
        const mid = (lo + hi) / 2;
        best = {
          edgeA: ea.index,
          edgeB: eb.index,
          tA: paramAt(ea, key, mid),
          tB: paramAt(eb, key, mid),
          length: overlap,
        };
      }
    }
  }

  return best;
}

function paramAt(edge: PlanEdge, key: 'x' | 'z', value: number): number {
  const span = edge.b[key] - edge.a[key];
  if (Math.abs(span) < 1e-6) return 0.5;
  return clamp01((value - edge.a[key]) / span);
}

export function isSharedWithAnyRoom(
  room: PlanRoom,
  edge: PlanEdge,
  rooms: PlanRoom[],
  tolerance: number
): boolean {
  // Sample just inside the neighbouring side of the wall; if that point lands in another
  // room, this edge is interior.
  const mid = pointOnEdge(edge, 0.5);
  const probe = {
    x: mid.x - edge.inward.x * tolerance,
    z: mid.z - edge.inward.z * tolerance,
  };
  return rooms.some((other) => other.id !== room.id && pointInPolygon(probe, other.polygon));
}

// ---------------------------------------------------------------------------
// Bridge to the existing calculator engine
// ---------------------------------------------------------------------------

/**
 * Converts plan rooms into the `Room` shape the materials/labour engine already consumes.
 *
 * The engine models rooms as width × length boxes, so `width`/`length` come from the bounding
 * box — but the *derived* areas are taken from the true polygon, so an L-shaped room is
 * costed on its real floor area rather than its bounding rectangle.
 */
export function planToCalculatorRooms(plan: FloorPlan): Room[] {
  return plan.rooms.map((r) => {
    const b = polygonBounds(r.polygon);
    const floorM2 = round2(r.areaM2);
    // What is walled: an edge on a room separator is open onto the next room, and no wall is plastered or painted there.
    const perimeterM = round2(wallPerimeterM(r));
    return {
      id: r.id,
      type: r.type,
      nameKa: r.name,
      width: round2(b.width),
      length: round2(b.depth),
      height: r.heightM,
      floorM2,
      wallM2: round2(perimeterM * r.heightM),
      ceilingM2: floorM2,
      perimeterM,
      isWetRoom: WET_ROOM_TYPES.includes(r.type),
      // Where the room sits on the plan, so the calculator's layout editor shows the flat as
      // drawn rather than a strip of rectangles.
      x: round2(b.minX),
      z: round2(b.minZ),
      ...studioFields(r),
    };
  });
}

/** A studio's line and its two parts as measured on the plan, for the calculator's room. */
function studioFields(room: PlanRoom): Pick<Room, 'split' | 'parts'> {
  if (room.type !== 'studio') return {};
  return { split: effectiveSplit(room), parts: roomPartsFor(room) };
}

/** Builds a plan from rooms already entered in the calculator, laid out in a simple strip. */
/**
 * The calculator's rooms, read off a plan: width and depth from the outline (an L-shape
 * keeps its width and takes the depth that gives the right area), height and type as drawn.
 * Room ids are kept, so furniture picked per room in the calculator lands in the same room
 * in 3D.
 */
export function calculatorRoomsFromPlan(plan: FloorPlan): Room[] {
  return plan.rooms.map((room) => {
    const xs = room.polygon.map((p) => p.x);
    const zs = room.polygon.map((p) => p.z);
    const width = round2(Math.max(...xs) - Math.min(...xs));
    const depth = round2(Math.max(...zs) - Math.min(...zs));
    const length = room.polygon.length > 4 ? round2(room.areaM2 / Math.max(width, 0.1)) : depth;
    const areas = computeRoomAreas({
      id: room.id,
      type: room.type,
      nameKa: room.name,
      width,
      length,
      height: room.heightM,
    });
    // An edge on a room separator is open onto the next room: no wall there to plaster, paint or tile.
    const open = round2(room.perimeterM - wallPerimeterM(room));
    return {
      ...areas,
      ...(open > 0 ? { perimeterM: round2(Math.max(0, areas.perimeterM - open)), wallM2: round2(Math.max(0, areas.wallM2 - open * room.heightM)) } : {}),
      x: round2(Math.min(...xs)),
      z: round2(Math.min(...zs)),
      ...studioFields(room),
      // The walls one by one, as the board has them — what the catalogue step lists; an open edge measures nothing.
      walls: edgeLengthsM(room.polygon).map((l, i) => (isOpenEdge(room, i) ? 0 : l)),
    };
  });
}

/**
 * Builds a plan from the calculator's rooms. Rooms the user placed (every room carries `x`/`z`
 * from the layout editor or the plan they came from) keep those positions; rooms typed
 * without positions are laid out in a simple strip.
 */
export function planFromCalculatorRooms(rooms: Room[]): FloorPlan {
  const planRooms: PlanRoom[] = [];
  const placed = rooms.length > 0 && rooms.every((r) => typeof r.x === 'number' && typeof r.z === 'number');
  const originX = placed ? Math.min(...rooms.map((r) => r.x as number)) : 0;
  const originZ = placed ? Math.min(...rooms.map((r) => r.z as number)) : 0;
  let cursorX = 0;
  let rowZ = 0;
  let rowDepth = 0;
  const maxRowWidth = 12;

  for (const room of rooms) {
    const w = Math.max(1.5, room.width);
    const d = Math.max(1.5, room.length);
    if (placed) {
      cursorX = (room.x as number) - originX;
      rowZ = (room.z as number) - originZ;
    } else if (cursorX > 0 && cursorX + w > maxRowWidth) {
      cursorX = 0;
      rowZ += rowDepth;
      rowDepth = 0;
    }
    const polygon = toCounterClockwise([
      { x: cursorX, z: rowZ },
      { x: cursorX + w, z: rowZ },
      { x: cursorX + w, z: rowZ + d },
      { x: cursorX, z: rowZ + d },
    ]);
    planRooms.push({
      id: room.id,
      type: room.type,
      name: room.nameKa,
      polygon,
      heightM: room.height,
      areaM2: round2(polygonAreaM2(polygon)),
      perimeterM: round2(polygonPerimeterM(polygon)),
      openings: [],
      ...(room.type === 'studio' && room.split ? { split: room.split } : {}),
    });
    if (!placed) {
      cursorX += w;
      rowDepth = Math.max(rowDepth, d);
    }
  }

  deriveOpenings(planRooms, DEFAULT_WALL_THICKNESS_M);

  const allX = planRooms.flatMap((r) => r.polygon.map((p) => p.x));
  const allZ = planRooms.flatMap((r) => r.polygon.map((p) => p.z));

  return {
    rooms: planRooms,
    metresPerPixel: null,
    bounds: {
      width: allX.length ? Math.max(...allX) - Math.min(...allX) : 0,
      depth: allZ.length ? Math.max(...allZ) - Math.min(...allZ) : 0,
    },
    source: 'calculator',
    imageUrl: null,
    wallThicknessM: DEFAULT_WALL_THICKNESS_M,
  };
}

/** Recomputes the cached derived fields after the user edits a room in the plan editor. */
export function refreshRoom(room: PlanRoom): PlanRoom {
  const polygon = toCounterClockwise(room.polygon);
  return {
    ...room,
    polygon,
    areaM2: round2(polygonAreaM2(polygon)),
    perimeterM: round2(polygonPerimeterM(polygon)),
  };
}

export function totalFloorAreaM2(plan: FloorPlan): number {
  return round2(plan.rooms.reduce((s, r) => s + r.areaM2, 0));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
