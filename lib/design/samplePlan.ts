/**
 * The sample flat ("სანიმუშო გეგმა") behind "try the sample plan" on step 1 of both halves: a
 * complete flat of about 117 m² with every kind of room the studio furnishes — a hallway with the
 * entrance, a living room and a kitchen, two bedrooms (the first with a closet), an office, a
 * bathroom and a separate toilet, and two balconies — so a test of the calculator, the studio, the
 * AI designer or the decor starts in a second, with or without an API key.
 *
 * It is a plan, not a picture to read: the rooms, their types and names, every door, archway,
 * window and balcony railing are given here and taken onto the board like any plan read
 * (`designStore.setPlan` → `ensureWalls` cuts the walls and the doors' twins). Pure.
 */

import { DEFAULT_CEILING_M } from '@/lib/calculator/constants';
import type { RoomType } from '@/lib/calculator/types';
import { refreshRoom, roomEdges } from './planGeometry';
import type { FloorPlan, Opening, OpeningKind, PlanRoom, Vec2 } from './types';

interface SampleRoom {
  id: string;
  type: RoomType;
  name: string;
  /** Outline in metres, any winding. */
  polygon: Array<[number, number]>;
}

/*
 *   z=-1.5         ┌ balcony 2 ┐               ┌── balcony 1 ──┐
 *   z=0   ┌────────┴───────────┴──┬────────────┴───────────────┴────┐
 *         │  bedroom 1            │  living room                      │
 *   z=4.2 ├──closet──┬─bathroom──┬┴──hallway──┬──── kitchen ─────────┤
 *   z=6.4 ├──────────┴───────────┤            ├──────────────────────┤
 *         │  bedroom 2           │            ├─toilet─┐  office      │
 *   z=9   └──────────────────────┴──entrance──┴────────┴──────────────┘
 *        x=0       2.0          4.4          6.4      8.0            12
 */
const ROOMS: SampleRoom[] = [
  { id: 'r1', type: 'hallway', name: 'დერეფანი', polygon: [[4.4, 4.2], [6.4, 4.2], [6.4, 9], [4.4, 9]] },
  { id: 'r2', type: 'living_room', name: 'მისაღები ოთახი', polygon: [[4.4, 0], [12, 0], [12, 4.2], [4.4, 4.2]] },
  { id: 'r3', type: 'kitchen', name: 'სამზარეულო', polygon: [[6.4, 4.2], [12, 4.2], [12, 6.4], [6.4, 6.4]] },
  { id: 'r4', type: 'bedroom', name: 'საძინებელი 1', polygon: [[0, 0], [4.4, 0], [4.4, 4.2], [0, 4.2]] },
  { id: 'r5', type: 'closet', name: 'გარდერობი', polygon: [[0, 4.2], [2, 4.2], [2, 6.4], [0, 6.4]] },
  { id: 'r6', type: 'bathroom', name: 'სააბაზანო', polygon: [[2, 4.2], [4.4, 4.2], [4.4, 6.4], [2, 6.4]] },
  { id: 'r7', type: 'bedroom', name: 'საძინებელი 2', polygon: [[0, 6.4], [4.4, 6.4], [4.4, 9], [0, 9]] },
  { id: 'r8', type: 'office', name: 'სამუშაო ოთახი', polygon: [[6.4, 6.4], [12, 6.4], [12, 9], [8, 9], [8, 7.4], [6.4, 7.4]] },
  { id: 'r9', type: 'toilet', name: 'ტუალეტი', polygon: [[6.4, 7.4], [8, 7.4], [8, 9], [6.4, 9]] },
  { id: 'r10', type: 'balcony', name: 'აივანი 1', polygon: [[7.2, -1.5], [10.8, -1.5], [10.8, 0], [7.2, 0]] },
  { id: 'r11', type: 'balcony', name: 'აივანი 2', polygon: [[0.8, -1.4], [3.6, -1.4], [3.6, 0], [0.8, 0]] },
];

interface SampleOpening {
  kind: OpeningKind;
  /** The room it is drawn in, and the one on the other side (null: the outside). */
  room: string;
  to: string | null;
  /** A point on the wall at the opening's middle. */
  at: [number, number];
  widthM: number;
  heightM?: number;
  sillM?: number;
}

const DOOR = { heightM: 2.05, sillM: 0 };
const WINDOW = { heightM: 1.4, sillM: 0.9 };

const OPENINGS: SampleOpening[] = [
  // The entrance, and every room off the hallway.
  { kind: 'door', room: 'r1', to: null, at: [5.4, 9], widthM: 0.95, ...DOOR },
  { kind: 'archway', room: 'r1', to: 'r2', at: [5.4, 4.2], widthM: 1.4, heightM: 2.2, sillM: 0 },
  { kind: 'door', room: 'r1', to: 'r3', at: [6.4, 5.3], widthM: 0.85, ...DOOR },
  { kind: 'door', room: 'r1', to: 'r6', at: [4.4, 5.3], widthM: 0.75, ...DOOR },
  { kind: 'door', room: 'r1', to: 'r7', at: [4.4, 7.4], widthM: 0.85, ...DOOR },
  { kind: 'door', room: 'r1', to: 'r8', at: [6.4, 6.9], widthM: 0.8, ...DOOR },
  { kind: 'door', room: 'r1', to: 'r9', at: [6.4, 8.2], widthM: 0.7, ...DOOR },
  // The bedroom off the living room, its closet off it; the kitchen open to the living room.
  { kind: 'door', room: 'r2', to: 'r4', at: [4.4, 3.3], widthM: 0.85, ...DOOR },
  { kind: 'door', room: 'r4', to: 'r5', at: [1, 4.2], widthM: 0.75, ...DOOR },
  { kind: 'archway', room: 'r2', to: 'r3', at: [9.6, 4.2], widthM: 1.6, heightM: 2.2, sillM: 0 },
  // The balconies: a door out from the living room and from the bedroom, a railing along each front.
  { kind: 'door', room: 'r2', to: 'r10', at: [9, 0], widthM: 0.9, heightM: 2.2, sillM: 0 },
  { kind: 'door', room: 'r4', to: 'r11', at: [2.2, 0], widthM: 0.9, heightM: 2.2, sillM: 0 },
  { kind: 'railing', room: 'r10', to: null, at: [9, -1.5], widthM: 3.6, heightM: 1.05, sillM: 0 },
  { kind: 'railing', room: 'r11', to: null, at: [2.2, -1.4], widthM: 2.8, heightM: 1.05, sillM: 0 },
  // Windows on the outside walls.
  { kind: 'window', room: 'r2', to: null, at: [5.8, 0], widthM: 1.6, ...WINDOW },
  { kind: 'window', room: 'r2', to: null, at: [12, 2.1], widthM: 1.8, ...WINDOW },
  { kind: 'window', room: 'r3', to: null, at: [12, 5.3], widthM: 1.4, ...WINDOW },
  { kind: 'window', room: 'r4', to: null, at: [0, 2.1], widthM: 1.6, ...WINDOW },
  { kind: 'window', room: 'r7', to: null, at: [0, 7.7], widthM: 1.4, ...WINDOW },
  { kind: 'window', room: 'r7', to: null, at: [2.2, 9], widthM: 1.4, ...WINDOW },
  { kind: 'window', room: 'r8', to: null, at: [12, 7.7], widthM: 1.4, ...WINDOW },
  { kind: 'window', room: 'r8', to: null, at: [10, 9], widthM: 1.6, ...WINDOW },
];

/** The wall of a room a point lies on, and where along it (0..1). */
function onWall(room: PlanRoom, point: Vec2): { wallIndex: number; t: number } {
  let best = { wallIndex: 0, t: 0.5, d: Infinity };
  for (const edge of roomEdges(room.polygon)) {
    const s = (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z;
    const clamped = Math.min(edge.length, Math.max(0, s));
    const d = Math.hypot(edge.a.x + edge.dir.x * clamped - point.x, edge.a.z + edge.dir.z * clamped - point.z);
    if (d < best.d) best = { wallIndex: edge.index, t: clamped / edge.length, d };
  }
  return { wallIndex: best.wallIndex, t: best.t };
}

/** The sample flat as a plan, ready for `setPlan`. A new object each call. */
export function samplePlan(): FloorPlan {
  const rooms = ROOMS.map((r) =>
    refreshRoom({
      id: r.id,
      type: r.type,
      name: r.name,
      polygon: r.polygon.map(([x, z]) => ({ x, z })),
      heightM: DEFAULT_CEILING_M,
      areaM2: 0,
      perimeterM: 0,
      openings: [],
    })
  );
  const byId = new Map(rooms.map((r) => [r.id, r]));
  OPENINGS.forEach((o, i) => {
    const room = byId.get(o.room)!;
    const { wallIndex, t } = onWall(room, { x: o.at[0], z: o.at[1] });
    const opening: Opening = {
      id: `${o.room}-${o.to ?? 'out'}-${o.kind}-${i}`,
      kind: o.kind,
      wallIndex,
      t,
      widthM: o.widthM,
      heightM: o.heightM ?? DOOR.heightM,
      sillM: o.sillM ?? 0,
      roomId: room.id,
      // The room behind is found, and its half of the opening cut, when the plan is taken onto
      // the board (`withOpeningTwins`); `to` is for the reader of this file.
      exterior: o.to == null,
      ...(o.kind === 'door' ? { hinge: 'left' as const, swing: 'in' as const } : {}),
    };
    room.openings.push(opening);
  });
  const xs = rooms.flatMap((r) => r.polygon.map((p) => p.x));
  const zs = rooms.flatMap((r) => r.polygon.map((p) => p.z));
  return {
    rooms,
    metresPerPixel: null,
    bounds: { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs) },
    source: 'sample',
    imageUrl: null,
    wallThicknessM: 0.12,
    wallHeightM: DEFAULT_CEILING_M,
  };
}
