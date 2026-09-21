/**
 * Turns a `FloorPlan` + `DesignScene` into a Three.js scene graph.
 *
 * Walls are extruded from the room polygons with real holes cut for doors and windows, floors
 * and ceilings come from the same polygons, and every piece of furniture is a partner GLB.
 *
 * Nothing here is AI-generated or cached from a server: given the same plan and scene it
 * produces the same geometry every time, in a few milliseconds, entirely on the client.
 *
 * The graph is built in two halves that change at different rates:
 *
 *   - `buildRoomShells` — floors, walls, skirting, door and window trim. Depends on the plan,
 *     the finishes and the style; rebuilt only when one of those changes.
 *   - `syncPlacedItems` — the furniture. Reconciled in place against the item list, so a
 *     drag or a swap moves or replaces *one* wrapper instead of re-extruding every wall and
 *     re-cloning every model.
 *
 * Everything selectable carries `userData` so the viewer's raycaster can map a hit back to
 * the item or surface it belongs to.
 */

import * as THREE from 'three';
import { loadFixture, loadModel } from './modelLoader';
import { pointOnEdge, roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import { wallForEdge } from '@/lib/design/walls';
import { leafOnOtherSide } from '@/lib/design/openings';
import { wallFinishFor } from '@/lib/design/zones';
import { patchSpansOnWall, wallPatches, wallSpans } from '@/lib/design/paint';
import { STYLE_TRIMS, trimFor, trimOutline } from '@/lib/design/trims';
import { edgeWallKey, planEdgeWalls, type EdgeWall, type WallPiece } from '@/lib/design/wallPieces';
import { buildElectrical, buildPaintedCells, buildRadiators, buildStructure, buildZones, fixtureRole } from './buildStructure';
import { buildMouldingGeometry, buildWallGeometry, WALL_SLOT_BASE, WALL_SLOT_CAP, type WallFaceSpan, type WallHole } from './wallGeometry';
import type {
  DesignScene,
  FloorPlan,
  Opening,
  PlacedItem,
  PlanRoom,
  StyleDefinition,
  SurfaceFinish,
  TrimKind,
} from '@/lib/design/types';
import { WET_ROOM_TYPES } from '@/lib/calculator/constants';
import { StyleMaterials } from './materials';
import { box, tag } from './primitives';

export interface SceneUserData {
  pickKind: 'item' | 'surface' | 'opening' | 'wall' | 'column' | 'beam' | 'electrical' | 'zone' | 'technical';
  itemId?: string;
  openingId?: string;
  roomId: string;
  surface?: 'floor' | 'wall' | 'ceiling';
  /** Outward normal of a wall, for the doll's-house cutaway. Walls only. */
  outward?: { x: number; z: number };
  /** The plan's wall a wall face belongs to, so the build tool can pick it. */
  wallId?: string;
  /** The room edge a wall face is, for per-wall finishes. */
  wallIndex?: number;
  /**
   * Where a wall stands, for the viewer: the middle of its room face (the cutaway asks which
   * side of the wall the camera is on — the mesh itself sits at the origin, its geometry is
   * in world coordinates), its first corner and direction (a hit point becomes metres along
   * the wall, which is what a painted strip is), and who is behind each stretch of it (a
   * click on the far face belongs to that room's wall, not to this one).
   */
  wallFrame?: { mid: { x: number; z: number }; a: { x: number; z: number }; dir: { x: number; z: number }; length: number; behind: Array<{ from: number; to: number; roomId: string; wallIndex: number }> };
  columnId?: string;
  beamId?: string;
  electricalId?: string;
  /** A technical point drawn in 3D — a radiator. */
  technicalId?: string;
  zoneId?: string;
}

export interface BuildSceneOptions {
  /**
   * Ceilings are off by default and the studio does not currently expose a toggle for them:
   * a ceiling faces *down*, so from the doll's-house camera it is backface-culled and
   * invisible anyway. The option stays for the interior walk-through camera, which is the
   * only place it reads.
   */
  showCeiling?: boolean;
  /** Draw walls at all — off gives a doll's-house floor plan view. */
  showWalls?: boolean;
  /** Only build this room (used by the per-room camera focus). */
  onlyRoomId?: string | null;
}

/** The top and the cut ends of every wall: one neutral tone, so the section through the flat reads as one. */
const WALL_CUT_COLOR = '#D9D4CA';

// ---------------------------------------------------------------------------
// Top level
// ---------------------------------------------------------------------------

/** Room shells for every room in the plan (or the one focused room). */
export function buildRoomShells(
  plan: FloorPlan,
  finishes: SurfaceFinish[],
  style: StyleDefinition,
  materials: StyleMaterials,
  options: BuildSceneOptions = {}
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'rooms';

  // How every room edge's wall is cut up — mitred corners, half depth where it is shared —
  // worked out once for the whole flat, also when only one room of it is shown.
  const edgeWalls = options.showWalls !== false ? planEdgeWalls(plan) : new Map<string, EdgeWall>();
  for (const [index, room] of visibleRooms(plan, options).entries()) {
    root.add(buildRoomShell(room, index, plan, finishes, style, materials, options, edgeWalls));
  }
  // Free-standing walls, columns and beams, and the floor patches with their own finish.
  if (options.showWalls !== false && !options.onlyRoomId) root.add(buildStructure(plan, style, materials));
  const shown = visibleRoomIds(plan, options);
  root.add(buildZones(plan, finishes, materials, style, shown));
  root.add(buildPaintedCells(plan, finishes, materials, style, shown));
  return root;
}

/** Sockets, switches and light fittings; rebuilt when the electrical layer changes. */
export { buildElectrical };
/** The radiators; rebuilt when the plan's technical points change. */
export { buildRadiators };

/**
 * Whole scene in one group — shells plus furniture. The viewer keeps the two halves apart
 * so it can rebuild them independently; this is the convenience for anything that wants the
 * lot at once.
 */
export function buildScene(
  plan: FloorPlan,
  scene: DesignScene,
  style: StyleDefinition,
  materials: StyleMaterials,
  options: BuildSceneOptions = {}
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'flat';
  root.add(buildRoomShells(plan, scene.finishes, style, materials, options));

  const items = new THREE.Group();
  items.name = 'items';
  syncPlacedItems(items, scene.items, visibleRoomIds(plan, options));
  root.add(items);
  return root;
}

function visibleRooms(plan: FloorPlan, options: BuildSceneOptions): PlanRoom[] {
  return options.onlyRoomId ? plan.rooms.filter((r) => r.id === options.onlyRoomId) : plan.rooms;
}

/** Which rooms' furniture should be present, or `null` for all of it. */
export function visibleRoomIds(plan: FloorPlan, options: BuildSceneOptions): Set<string> | null {
  return options.onlyRoomId ? new Set(visibleRooms(plan, options).map((r) => r.id)) : null;
}

/**
 * Frees the GPU buffers of geometry this module created.
 *
 * Only *owned* geometry — walls, floors, trim — is disposed. Furniture meshes are clones that
 * share their buffers with the module-level model cache, and disposing those made every
 * model re-upload on the next rebuild. Three.js does not free GPU memory on its own, so this
 * has to be called when a shell group is dropped.
 */
export function disposeOwnedGeometry(root: THREE.Object3D): void {
  root.traverse((child) => {
    if ((child instanceof THREE.Mesh || child instanceof THREE.LineSegments) && child.userData.ownsGeometry) child.geometry.dispose();
  });
}

function own<T extends THREE.Mesh>(mesh: T): T {
  mesh.userData.ownsGeometry = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Room shell
// ---------------------------------------------------------------------------

function buildRoomShell(
  room: PlanRoom,
  index: number,
  plan: FloorPlan,
  finishes: SurfaceFinish[],
  style: StyleDefinition,
  materials: StyleMaterials,
  options: BuildSceneOptions,
  edgeWalls: Map<string, EdgeWall>
): THREE.Group {
  const group = new THREE.Group();
  group.name = `room-${room.id}`;

  const isWet = WET_ROOM_TYPES.includes(room.type);
  const edges = roomEdges(room.polygon);

  const floorFinish = findFinish(finishes, room.id, 'floor');
  const ceilingFinish = findFinish(finishes, room.id, 'ceiling');

  // --- floor ---
  const floorSpec = isWet ? style.surfaces.wetFloor : style.surfaces.floor;
  const floorMaterial = materials.metreSurface(floorSpec, finishOverrides(floorFinish));
  const floor = own(new THREE.Mesh(polygonGeometry(room.polygon, 'up'), floorMaterial));
  floor.receiveShadow = true;
  tag(floor, { pickKind: 'surface', roomId: room.id, surface: 'floor' } satisfies SceneUserData);
  group.add(floor);

  // --- ceiling ---
  if (options.showCeiling) {
    const ceilingMaterial = materials.metreSurface(style.surfaces.ceiling, finishOverrides(ceilingFinish));
    const ceiling = own(new THREE.Mesh(polygonGeometry(room.polygon, 'down'), ceilingMaterial));
    ceiling.position.y = room.heightM;
    tag(ceiling, { pickKind: 'surface', roomId: room.id, surface: 'ceiling' } satisfies SceneUserData);
    group.add(ceiling);
  }

  // --- walls ---
  if (options.showWalls !== false) {
    // A feature wall on the longest run gives each room one moment of contrast, which is
    // what the four styles are actually about.
    const featureIndex = pickFeatureWall(room, edges);
    const cut = materials.metreSurface({ colorHex: WALL_CUT_COLOR, roughness: 0.9 });
    const roomsById = new Map(plan.rooms.map((r) => [r.id, r]));
    // How high each side of the room stands: the wall's own height when it was given one in
    // the inspector, the room's otherwise. The wall is built to it, and so is whatever is
    // fixed to its top.
    const tops = edges.map((edge) => wallForEdge(plan, room, edge)?.heightM ?? room.heightM);

    edges.forEach((edge, order) => {
      const openings = room.openings.filter((o) => o.wallIndex === edge.index);
      const planWall = wallForEdge(plan, room, edge);
      const edgeWall = edgeWalls.get(edgeWallKey(room.id, edge.index));
      const thickness = edgeWall?.thickness ?? planWall?.thicknessM ?? plan.wallThicknessM;
      // Nudge each room's wall height by a hair so the two halves of a shared wall do not
      // z-fight along their top edge when seen from above.
      const height = tops[order] + index * 0.0006;
      const pieces: WallPiece[] = edgeWall?.pieces ?? [{ from: 0, to: edge.length, farFrom: 0, farTo: edge.length, depth: thickness, neighbour: null }];

      // One material slot per look: the wall's own finish, the cut, then whatever the far
      // faces and the painted strips need. See `lib/design3d/wallGeometry`.
      const slots: THREE.Material[] = [];
      slots[WALL_SLOT_BASE] = wallMaterialFor(room, edge, featureIndex, finishes, style, materials);
      slots[WALL_SLOT_CAP] = cut;
      const slotOf = (material: THREE.Material): number => {
        const found = slots.indexOf(material);
        return found >= 0 ? found : slots.push(material) - 1;
      };

      // Each room builds its own wall back from its polygon. Where another room stands
      // behind it the piece is half as deep, the two halves meeting in the middle of the
      // wall on a plane nobody sees while both stand; the far face there wears that room's
      // finish, so either half alone still looks like the whole wall (gotcha 13).
      const behind: NonNullable<SceneUserData['wallFrame']>['behind'] = [];
      const farSlots = pieces.map((piece) => {
        const neighbour = piece.neighbour ? roomsById.get(piece.neighbour.roomId) : undefined;
        const neighbourEdge = neighbour ? roomEdges(neighbour.polygon).find((e) => e.index === piece.neighbour!.wallIndex) : undefined;
        if (!neighbour || !neighbourEdge) return WALL_SLOT_CAP;
        behind.push({ from: piece.from, to: piece.to, roomId: neighbour.id, wallIndex: neighbourEdge.index });
        return slotOf(wallMaterialFor(neighbour, neighbourEdge, pickFeatureWall(neighbour, roomEdges(neighbour.polygon)), finishes, style, materials));
      });

      // What somebody painted on this wall on their own: metre-wide strips floor to
      // ceiling, and single square metres of it.
      const wallBase = isWet ? style.surfaces.wetWall : style.surfaces.wall;
      const spans: WallFaceSpan[] = wallSpans(finishes, room.id, edge.index).map((finish) => ({
        from: finish.span!.from,
        to: finish.span!.to,
        slot: slotOf(materials.metreSurface(wallBase, finishOverrides(finish))),
      }));
      for (const finish of wallPatches(finishes, room.id, edge.index)) {
        const slot = slotOf(materials.metreSurface(wallBase, finishOverrides(finish)));
        for (const patch of finish.cells ?? []) {
          // The room's grid, its top row running on to the top of this wall.
          const box = patchSpansOnWall(edge, room.heightM, tops[order], patch);
          if (box) spans.push({ from: box.along.from, to: box.along.to, bottom: box.up.from, top: box.up.to, slot });
        }
      }

      const holes: WallHole[] = [];
      for (const opening of openings) {
        const centre = opening.t * edge.length;
        const half = opening.widthM / 2;
        const hole = { left: Math.max(0.02, centre - half), right: Math.min(edge.length - 0.02, centre + half), bottom: Math.max(0, opening.sillM), top: Math.min(height - 0.02, opening.sillM + opening.heightM) };
        if (hole.right - hole.left >= 0.05 && hole.top - hole.bottom >= 0.05) holes.push(hole);
      }

      const wall = own(new THREE.Mesh(buildWallGeometry({ edge, height, pieces, holes, spans, farSlots }), slots));
      wall.castShadow = true;
      wall.receiveShadow = true;
      const outward = { x: -edge.inward.x, z: -edge.inward.z };
      const wallFrame = { mid: pointOnEdge(edge, 0.5), a: { x: edge.a.x, z: edge.a.z }, dir: { x: edge.dir.x, z: edge.dir.z }, length: edge.length, behind };
      const wallData = { pickKind: 'surface', roomId: room.id, surface: 'wall', outward, wallId: planWall?.id, wallIndex: edge.index, wallFrame } satisfies SceneUserData;
      tag(wall, wallData);
      group.add(wall);

      // The mouldings belong to their wall, so they hide and show with it — and the cornice
      // runs along the top of *this* wall, not at the room's ceiling height: a wall raised in
      // the inspector used to leave its cornice behind, a white line halfway up it.
      const before = (order - 1 + edges.length) % edges.length;
      const after = (order + 1) % edges.length;
      const corner = { top: tops[order], previousTop: tops[before], nextTop: tops[after] };
      for (const kind of ['skirting', 'cornice'] as const) {
        const trim = buildTrim(kind, room, edge, edges[before], edges[after], corner, openings, finishes, style, materials);
        if (!trim) continue;
        tag(trim, wallData);
        group.add(trim);
      }

      for (const opening of openings) {
        // The room on the other side of an interior door is not in a single-room view, so
        // this half has to draw the door.
        const twinShown = !opening.connectsToRoomId || !options.onlyRoomId || opening.connectsToRoomId === options.onlyRoomId;
        const trim = buildOpeningTrim(edge, opening, thickness, twinShown);
        trim.name = `opening-${opening.id}`;
        // Everything in the trim answers to the opening, so a click on a jamb picks the door.
        trim.traverse((child) => {
          if (child instanceof THREE.Mesh) tag(child, { pickKind: 'opening', roomId: room.id, openingId: opening.id } satisfies SceneUserData);
        });
        group.add(trim);
      }
    });
  }

  return group;
}

/**
 * The finish a room's wall wears: a wet room's tiles, the feature wall's accent, the room's
 * paper — or the finish the person gave this one wall. Also the face a neighbour's half of
 * a shared wall shows into this room. Tiled by the metre, like every surface.
 */
function wallMaterialFor(room: PlanRoom, edge: PlanEdge, featureIndex: number, finishes: SurfaceFinish[], style: StyleDefinition, materials: StyleMaterials): THREE.Material {
  const isWet = WET_ROOM_TYPES.includes(room.type);
  const wallFinish = findFinish(finishes, room.id, 'wall');
  const isFeature = edge.index === featureIndex && !isWet;
  // This wall's own finish, if the person gave it one; the room's otherwise.
  const edgeFinish = wallFinishFor(finishes, room.id, edge.index) ?? wallFinish;
  const ownFinish = edgeFinish !== wallFinish;
  const spec = isWet ? style.surfaces.wetWall : isFeature ? style.surfaces.featureWall : style.surfaces.wall;
  return materials.metreSurface(spec, isFeature && !edgeFinish?.product && !ownFinish ? {} : finishOverrides(edgeFinish));
}

/**
 * A skirting board or a cornice along one wall: the moulding's profile swept along the
 * edge, on the mitre at both corners, and — for a skirting board — broken where a door
 * passes through. The shape and colour come from the product the room was given, or from
 * the style when it was given none (`STYLE_TRIMS`; some styles have no cornice at all).
 */
function buildTrim(
  kind: TrimKind,
  room: PlanRoom,
  edge: PlanEdge,
  previous: PlanEdge,
  next: PlanEdge,
  /** How high this wall and the two it meets stand — where a cornice runs, and whether it has a partner to mitre with. */
  corner: { top: number; previousTop: number; nextTop: number },
  openings: Opening[],
  finishes: SurfaceFinish[],
  style: StyleDefinition,
  materials: StyleMaterials
): THREE.Group | null {
  const chosen = trimFor(finishes, room.id, kind);
  const fallback = STYLE_TRIMS[style.id][kind];
  const spec = chosen ? chosen.trim : fallback;
  if (!spec) return null;
  const colorHex = chosen ? chosen.colorHex : fallback?.colorHex;
  const material = materials.get('frame', { colorHex, roughness: 0.55, metalness: 0 });
  const outline = trimOutline(kind, spec);

  // Where the moulding runs: the whole edge, less the doorways for a skirting board
  // (windows start above it).
  const gaps =
    kind === 'skirting'
      ? openings
          .filter((o) => o.kind !== 'window')
          .map((o) => [o.t * edge.length - o.widthM / 2 - 0.03, o.t * edge.length + o.widthM / 2 + 0.03] as const)
          .sort((a, b) => a[0] - b[0])
      : [];
  const runs: Array<[number, number]> = [];
  let cursor = 0;
  for (const [start, end] of gaps) {
    if (start > cursor) runs.push([cursor, Math.min(start, edge.length)]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < edge.length) runs.push([cursor, edge.length]);

  // How much a run gives way, per metre it stands out from the wall, to meet the next
  // wall's moulding on the diagonal: 1 in a square inside corner, −1 round an outside one.
  const mitre = (from: PlanEdge, to: PlanEdge) => {
    const turn = Math.atan2(from.dir.x * to.dir.z - from.dir.z * to.dir.x, from.dir.x * to.dir.x + from.dir.z * to.dir.z);
    return Math.max(-3, Math.min(3, Math.tan(turn / 2)));
  };
  // A cornice only meets the next wall's on the diagonal when the two run at one height;
  // beside a wall that stands higher or lower it is cut square and stops at the corner.
  const level = (a: number, b: number) => kind === 'skirting' || Math.abs(a - b) < 0.005;
  const group = new THREE.Group();
  group.name = kind;
  for (const [from, to] of runs) {
    if (to - from < 0.05) continue;
    const startCut = from < 1e-6 && level(corner.top, corner.previousTop) ? mitre(previous, edge) : 0;
    const endCut = to > edge.length - 1e-6 && level(corner.top, corner.nextTop) ? mitre(edge, next) : 0;
    const mesh = own(new THREE.Mesh(buildMouldingGeometry(edge, from, to, kind === 'skirting' ? 0 : corner.top, outline, startCut, endCut), material));
    mesh.castShadow = kind === 'skirting';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group.children.length > 0 ? group : null;
}

/** Hidden by default; the viewer shows the slabs while doors and windows are being edited. */
export const OPENING_SLAB_NAME = 'opening-slab';
/** Layer the raycaster ignores. Cut-away walls and idle opening slabs go here. */
export const HIDDEN_LAYER = 1;

/**
 * What fills an opening: the product's model when it has one, the default door, window
 * or casing from `fixtureManifest` otherwise (see `attachOpeningModel`) — nothing is drawn
 * by hand; the hole stays bare for the beat the file takes to arrive. The one procedural
 * piece is the translucent slab the studio's openings mode uses as a handle.
 */
function buildOpeningTrim(
  edge: PlanEdge,
  opening: Opening,
  thickness: number,
  /** False when the room on the other side of this (interior) opening is left out of the view. */
  twinShown = true
): THREE.Group {
  const group = new THREE.Group();
  const point = pointOnEdge(edge, opening.t);
  const w = opening.widthM;
  const h = opening.heightM;
  const sill = opening.sillM;
  // The wall runs from the polygon edge outwards, so its middle is half a thickness out.
  const midWall = -thickness / 2;

  // A translucent slab the size of the opening: the thing you grab to slide a door along
  // its wall. Parked on the hidden layer until the studio enters its openings mode.
  const slab = own(box(w, h, thickness + 0.16, new THREE.MeshBasicMaterial({ color: 0xe85d26, transparent: true, opacity: 0.28, depthWrite: false })));
  slab.name = OPENING_SLAB_NAME;
  slab.renderOrder = 5;
  slab.layers.set(HIDDEN_LAYER);
  slab.position.set(point.x + edge.inward.x * midWall, sill + h / 2, point.z + edge.inward.z * midWall);
  slab.rotation.y = edge.facing;
  group.add(slab);

  // An interior door or archway exists in both rooms; one half draws it — for a door the
  // half it swings into (`leafOnOtherSide`), for an archway the room that sorts first —
  // unless the other room is the one left out of the view, and then this half does.
  const primary = !opening.connectsToRoomId || (opening.kind === 'door' ? !leafOnOtherSide(opening) : opening.roomId < opening.connectsToRoomId);
  if (primary || !twinShown) {
    const product = opening.product?.model3dUrl;
    const fallback = opening.kind === 'archway' ? fixtureRole('casing') : fixtureRole(opening.kind);
    const url = opening.kind !== 'archway' && product ? product : fallback?.url;
    if (url) attachOpeningModel(group, url, { edge, opening, thickness });
  }

  return group;
}

/**
 * A door or window model in the hole. The fixtures script frames these centred on the
 * opening's width, standing on its sill, centred in the wall, room side along +z, with a
 * door's leaf as the node `leaf` hung from x min (the plan's `hinge: 'left'`) and its
 * casing as `frame` — or the whole thing as `body` when it is one piece. The parts are
 * stretched to the opening; a leaf is re-hung on a pivot at its jamb so the open angle
 * still applies; a right-hinged door is the same model mirrored. A model that is a bare
 * leaf gets the default casing (`role: 'casing'`) around it, the leaf sized to the inside
 * of its jambs.
 */
function attachOpeningModel(group: THREE.Group, url: string, ctx: { edge: PlanEdge; opening: Opening; thickness: number }): void {
  const { edge, opening, thickness } = ctx;
  const point = pointOnEdge(edge, opening.t);
  const midWall = -thickness / 2;
  const data = { pickKind: 'opening', roomId: opening.roomId, openingId: opening.id } satisfies SceneUserData;

  /** A model root at the opening: centred in the hole, on the sill, mirrored for a right-hinged door. */
  const rootAt = (name: string) => {
    const root = new THREE.Group();
    root.name = name;
    root.position.set(point.x + edge.inward.x * midWall, opening.sillM, point.z + edge.inward.z * midWall);
    root.rotation.y = edge.facing;
    // A right-hinged door is the left-hinged model mirrored; three.js flips the face
    // culling for the negative determinant, so it renders right way out.
    root.scale.x = opening.kind === 'door' && opening.hinge === 'right' ? -1 : 1;
    return root;
  };

  /** Stretches a model's parts to `width` × `height`, its depth in proportion but never much more than the wall. */
  const scaleFor = (model: THREE.Object3D, width: number, height: number) => {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const sx = width / Math.max(size.x, 1e-6);
    const sy = height / Math.max(size.y, 1e-6);
    const sz = Math.min(Math.sqrt(sx * sy), (thickness + 0.06) / Math.max(size.z, 1e-6));
    return { sx, sy, sz };
  };

  const turn = (opening.swing === 'out' ? 1 : -1) * (((opening.openAngleDeg ?? 75) * Math.PI) / 180);

  /**
   * Puts the model's parts under `root`, the leaf on a pivot at its jamb. Every part keeps
   * the transform its file gave it — the compressed GLBs carry each node's quantisation
   * offset and scale there — and is stretched by a group of its own around it; setting the
   * scale on the node itself threw that transform away, which stood every leaf half in the
   * floor and made every window a third taller than its hole.
   */
  const mount = (model: THREE.Object3D, root: THREE.Group, width: number, height: number) => {
    const { sx, sy, sz } = scaleFor(model, width, height);
    for (const part of [...model.children]) {
      // A node the source left behind with no geometry in it.
      if (!Number.isFinite(new THREE.Box3().setFromObject(part).min.x)) continue;
      const scaled = new THREE.Group();
      scaled.scale.set(sx, sy, sz);
      scaled.add(part);
      if (opening.kind === 'door' && part.name === 'leaf') {
        // Re-hung on a pivot at the hinge edge (x min of the leaf, mid-depth), so the leaf
        // turns about its jamb; the scale sits under the pivot, so turning it does not
        // shear it.
        const bounds = new THREE.Box3().setFromObject(scaled);
        const hingeX = bounds.min.x;
        const hingeZ = (bounds.min.z + bounds.max.z) / 2;
        const pivot = new THREE.Group();
        pivot.name = 'opening-leaf';
        pivot.position.set(hingeX, 0, hingeZ);
        pivot.rotation.y = turn;
        scaled.position.set(-hingeX, 0, -hingeZ);
        pivot.add(scaled);
        root.add(pivot);
      } else {
        root.add(scaled);
      }
    }
    finishModel(root);
    tag(root, data);
    group.add(root);
  };

  loadFixture(url)
    .then((model) => {
      // Rebuilt while the model was in flight.
      if (!group.parent) return;
      const bareLeaf = opening.kind === 'door' && !model.getObjectByName('frame') && !model.getObjectByName('body') && !!model.getObjectByName('leaf');
      if (!bareLeaf) {
        mount(model, rootAt('opening-model'), opening.widthM, opening.heightM);
        return;
      }
      // A bare leaf hangs inside the default casing, sized to the inside of its jambs.
      const casing = fixtureRole('casing');
      const jamb = 0.045;
      mount(model, rootAt('opening-model'), opening.widthM - jamb * 2, opening.heightM - jamb);
      if (casing) {
        loadFixture(casing.url)
          .then((frame) => {
            if (!group.parent) return;
            mount(frame, rootAt('opening-casing'), opening.widthM, opening.heightM);
          })
          .catch((error: unknown) => console.warn(`[studio] casing failed to load: ${casing.url}`, error));
      }
    })
    .catch((error: unknown) => console.warn(`[studio] opening model failed to load: ${url}`, error));
}

/** The longest wall with no opening on it — or just the longest, if every wall has one. */
function pickFeatureWall(room: PlanRoom, edges: PlanEdge[]): number {
  const clear = edges.filter((e) => !room.openings.some((o) => o.wallIndex === e.index));
  const pool = clear.length > 0 ? clear : edges;
  return pool.reduce(
    (best, e) => (e.length > (edges[best]?.length ?? 0) ? e.index : best),
    pool[0]?.index ?? 0
  );
}

/**
 * Flat geometry for a room polygon.
 *
 * The plan lives in XZ, so the shape is built in XY and rotated down. Mirroring the z
 * coordinate before the rotation keeps the room the right way round *and* leaves the face
 * normal pointing the way we asked for.
 */
function polygonGeometry(polygon: Array<{ x: number; z: number }>, facing: 'up' | 'down') {
  const shape = new THREE.Shape();
  const sign = facing === 'up' ? -1 : 1;

  polygon.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, sign * p.z);
    else shape.lineTo(p.x, sign * p.z);
  });
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(facing === 'up' ? -Math.PI / 2 : Math.PI / 2);
  return geometry;
}

/**
 * What a finish overrides on the style's surface. A finish the user chose brings its own
 * maps and scale, so the style's normal map must not leak through under someone else's tile.
 */
function finishOverrides(finish: SurfaceFinish | undefined) {
  if (!finish) return {};
  const chosen = !!finish.product;
  return {
    colorHex: finish.colorHex,
    textureUrl: finish.textureUrl,
    textureScaleM: chosen ? finish.textureScaleM : undefined,
    normalUrl: chosen ? (finish.normalUrl ?? null) : finish.normalUrl ?? undefined,
    roughnessUrl: chosen ? (finish.roughnessUrl ?? null) : finish.roughnessUrl ?? undefined,
  };
}

/** The room's base finish for a surface — never a single wall's or a zone's. */
function findFinish(
  finishes: SurfaceFinish[],
  roomId: string,
  surface: SurfaceFinish['surface']
): SurfaceFinish | undefined {
  return finishes.find((f) => f.roomId === roomId && f.surface === surface && f.wallIndex == null && !f.zone);
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

/**
 * Brings `container` in line with `items`.
 *
 * A wrapper whose product and size are unchanged is moved into place; one whose model or
 * dimensions changed is replaced; wrappers for items that are gone (or whose room is not in
 * view) are removed. Nothing is disposed here — model geometry belongs to the cache.
 */
export function syncPlacedItems(
  container: THREE.Group,
  items: PlacedItem[],
  rooms: Set<string> | null
): void {
  const wanted = new Map<string, PlacedItem>();
  for (const item of items) {
    if (rooms && !rooms.has(item.roomId)) continue;
    wanted.set(item.id, item);
  }

  for (const child of [...container.children]) {
    const itemId = (child.userData as SceneUserData).itemId;
    const item = itemId ? wanted.get(itemId) : undefined;
    if (!item) {
      container.remove(child);
      continue;
    }
    if (child.userData.itemKey !== itemKey(item)) {
      container.remove(child);
      continue; // rebuilt below
    }
    child.position.set(item.position.x, item.elevationM, item.position.z);
    child.rotation.y = item.rotation;
    child.scale.x = item.mirrored ? -1 : 1;
    if ((child.userData as SceneUserData).roomId !== item.roomId) {
      tag(child, { pickKind: 'item', itemId: item.id, roomId: item.roomId } satisfies SceneUserData);
    }
    wanted.delete(item.id);
  }

  for (const item of wanted.values()) {
    const object = buildPlacedItem(item);
    if (object) container.add(object);
  }
}

/** What a wrapper was built from. If any of this changes the wrapper has to be rebuilt. */
function itemKey(item: PlacedItem): string {
  const s = item.size;
  return `${item.product?.productId ?? ''}|${item.product?.model3dUrl ?? ''}|${s.width}|${s.depth}|${s.height}`;
}

/**
 * One placed product.
 *
 * Every item is a partner model — there is no procedural furniture. The wrapper is created
 * empty and positioned immediately, so selection, dragging and the cost bar all work from the
 * first frame, and the mesh drops in when its GLB arrives. Most models are 100–400 KB, so that
 * is a beat, not a wait; the same URL is fetched once however many chairs share it.
 *
 * An item with no model is not drawn at all. That is deliberate: a room furnished with
 * stand-ins would show the customer things nobody sells. An item whose model *fails* to load
 * is the opposite case — a real product with a broken or missing file — and gets a
 * translucent ghost box in its colour plus a console warning, so the failure is seen and
 * fixed in admin rather than mistaken for an empty slot.
 */
export function buildPlacedItem(item: PlacedItem): THREE.Object3D | null {
  const modelUrl = item.product?.model3dUrl;
  if (!modelUrl) return null;

  const wrapper = new THREE.Group();
  wrapper.name = `item-${item.id}`;
  wrapper.position.set(item.position.x, item.elevationM, item.position.z);
  wrapper.rotation.y = item.rotation;
  // A mirrored piece is the same model flipped across its facing axis; three.js flips the
  // face culling for a negative determinant, so it renders right way out.
  wrapper.scale.x = item.mirrored ? -1 : 1;

  const data: SceneUserData = { pickKind: 'item', itemId: item.id, roomId: item.roomId };
  tag(wrapper, { ...data });
  wrapper.userData.itemKey = itemKey(item);

  loadModel(modelUrl)
    .then((model) => {
      // Swapped or deleted while the model was in flight.
      if (!wrapper.parent) return;
      fitToItem(model, item);
      finishModel(model);
      wrapper.add(model);
      // The wrapper's own roomId may have moved on while the model was loading.
      tag(model, { pickKind: 'item', itemId: item.id, roomId: (wrapper.userData as SceneUserData).roomId });
    })
    .catch((err: unknown) => {
      // Swapped or deleted while the model was in flight.
      if (!wrapper.parent) return;
      // The product exists and the cost bar counts it; only its picture failed. Say so.
      console.warn(`[studio] model failed to load for "${item.product?.nameKa ?? item.id}": ${modelUrl}`, err);
      const ghost = ghostFor(item);
      tag(ghost, { pickKind: 'item', itemId: item.id, roomId: (wrapper.userData as SceneUserData).roomId });
      wrapper.add(ghost);
    });

  return wrapper;
}

const ghostMaterials = new Map<string, THREE.MeshStandardMaterial>();
const ghostEdgeMaterial = new THREE.LineBasicMaterial({ color: 0x8a8378, transparent: true, opacity: 0.9 });

function ghostMaterial(colorHex: string | null | undefined): THREE.MeshStandardMaterial {
  const key = (colorHex ?? '#C9C4BA').toLowerCase();
  let material = ghostMaterials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: new THREE.Color(key), transparent: true, opacity: 0.4, roughness: 0.9, depthWrite: false });
    ghostMaterials.set(key, material);
  }
  return material;
}

/** A translucent box the size and colour of the product, standing where its model should be. */
function ghostFor(item: PlacedItem): THREE.Object3D {
  const { width, depth, height } = item.size;
  const box = own(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), ghostMaterial(item.product?.colorHex)));
  box.position.y = height / 2;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), ghostEdgeMaterial);
  edges.userData.ownsGeometry = true;
  box.add(edges);
  const group = new THREE.Group();
  group.name = 'model-ghost';
  group.add(box);
  return group;
}

/**
 * Scales a model to the slot it was placed in.
 *
 * Usually uniformly: the product's dimensions were measured from this very geometry by the
 * conversion script, so the proportions already agree and stretching an axis would only
 * distort. The exception is a slot the layout engine sized itself — see below.
 */
function fitToItem(model: THREE.Object3D, item: PlacedItem): void {
  const authored = model.userData.authoredSize as THREE.Vector3 | undefined;
  const size = authored ?? new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const rx = item.size.width / Math.max(size.x, 1e-4);
  const ry = item.size.height / Math.max(size.y, 1e-4);
  const rz = item.size.depth / Math.max(size.z, 1e-4);
  const ratios = [rx, ry, rz];
  // A kitchen run is stretched to its wall and a rug to its table, so those slots are a
  // different shape from the product and each axis has to follow. Anything else keeps its
  // proportions; the tiny per-axis differences left are rounding in the stored dimensions.
  if (Math.max(...ratios) / Math.min(...ratios) > 1.25) {
    model.scale.set(rx, ry, rz);
  } else {
    model.scale.setScalar(Math.max(...ratios));
  }
}

/** Shadows on, materials as shipped. Cloned meshes share the cached geometry and materials. */
function finishModel(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

// ---------------------------------------------------------------------------
// Camera framing
// ---------------------------------------------------------------------------

/** A camera position and target that frames the whole flat, or one room of it. */
export function frameFor(
  plan: FloorPlan,
  roomId?: string | null
): { position: [number, number, number]; target: [number, number, number] } {
  const rooms = roomId ? plan.rooms.filter((r) => r.id === roomId) : plan.rooms;
  const points = rooms.flatMap((r) => r.polygon);

  if (points.length === 0) {
    return { position: [8, 8, 8], target: [0, 0, 0] };
  }

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minZ = Math.min(...points.map((p) => p.z));
  const maxZ = Math.max(...points.map((p) => p.z));

  const centre: [number, number, number] = [(minX + maxX) / 2, 1.1, (minZ + maxZ) / 2];
  const span = Math.max(maxX - minX, maxZ - minZ, 3);
  const distance = span * 1.15;

  return {
    position: [centre[0] + distance * 0.72, distance * 0.86 + 1.6, centre[2] + distance * 0.72],
    target: centre,
  };
}
