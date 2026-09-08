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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { pointOnEdge, polygonBounds, roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import type {
  DesignScene,
  FloorPlan,
  Opening,
  PlacedItem,
  PlanRoom,
  StyleDefinition,
  SurfaceFinish,
} from '@/lib/design/types';
import { WET_ROOM_TYPES } from '@/lib/calculator/constants';
import { StyleMaterials } from './materials';
import { box, cylinder, tag } from './primitives';

export interface SceneUserData {
  pickKind: 'item' | 'surface' | 'opening';
  itemId?: string;
  openingId?: string;
  roomId: string;
  surface?: 'floor' | 'wall' | 'ceiling';
  /** Outward normal of a wall, for the doll's-house cutaway. Walls only. */
  outward?: { x: number; z: number };
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

const BASEBOARD_HEIGHT = 0.09;
const BASEBOARD_DEPTH = 0.018;

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

  for (const [index, room] of visibleRooms(plan, options).entries()) {
    root.add(buildRoomShell(room, index, plan, finishes, style, materials, options));
  }
  return root;
}

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
  options: BuildSceneOptions
): THREE.Group {
  const group = new THREE.Group();
  group.name = `room-${room.id}`;

  const isWet = WET_ROOM_TYPES.includes(room.type);
  const bounds = polygonBounds(room.polygon);
  const edges = roomEdges(room.polygon);

  const floorFinish = findFinish(finishes, room.id, 'floor');
  const wallFinish = findFinish(finishes, room.id, 'wall');
  const ceilingFinish = findFinish(finishes, room.id, 'ceiling');

  // --- floor ---
  const floorSpec = isWet ? style.surfaces.wetFloor : style.surfaces.floor;
  const floorMaterial = materials.surface(
    floorSpec,
    { u: bounds.width, v: bounds.depth },
    finishOverrides(floorFinish)
  );
  const floor = own(new THREE.Mesh(polygonGeometry(room.polygon, 'up'), floorMaterial));
  floor.receiveShadow = true;
  tag(floor, { pickKind: 'surface', roomId: room.id, surface: 'floor' } satisfies SceneUserData);
  group.add(floor);

  // --- ceiling ---
  if (options.showCeiling) {
    const ceilingMaterial = materials.surface(
      style.surfaces.ceiling,
      { u: bounds.width, v: bounds.depth },
      finishOverrides(ceilingFinish)
    );
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

    for (const edge of edges) {
      const openings = room.openings.filter((o) => o.wallIndex === edge.index);
      const isFeature = edge.index === featureIndex && !isWet;

      const spec = isWet
        ? style.surfaces.wetWall
        : isFeature
          ? style.surfaces.featureWall
          : style.surfaces.wall;

      const wallMaterial = materials.surface(
        spec,
        { u: edge.length, v: room.heightM },
        isFeature && !wallFinish?.product ? {} : finishOverrides(wallFinish)
      );

      // Nudge each room's wall height by a hair so shared walls between two rooms do not
      // z-fight along their top edge when seen from above.
      const wall = buildWall(edge, room.heightM + index * 0.0006, plan.wallThicknessM, openings, wallMaterial);
      const outward = { x: -edge.inward.x, z: -edge.inward.z };
      tag(wall, { pickKind: 'surface', roomId: room.id, surface: 'wall', outward } satisfies SceneUserData);
      group.add(wall);

      const baseboard = buildBaseboard(edge, openings, materials.get('ceramic'));
      // Skirting belongs to its wall, so it hides and shows with it.
      tag(baseboard, { pickKind: 'surface', roomId: room.id, surface: 'wall', outward } satisfies SceneUserData);
      group.add(baseboard);

      for (const opening of openings) {
        const trim = buildOpeningTrim(edge, opening, plan.wallThicknessM, materials);
        trim.name = `opening-${opening.id}`;
        // Everything in the trim answers to the opening, so a click on a jamb picks the door.
        trim.traverse((child) => {
          if (child instanceof THREE.Mesh) tag(child, { pickKind: 'opening', roomId: room.id, openingId: opening.id } satisfies SceneUserData);
        });
        group.add(trim);
      }
    }
  }

  return group;
}

/**
 * A wall panel with door and window holes cut through it.
 *
 * Built as a 2D shape in (along-wall, height) space, holed, then extruded through the wall
 * thickness and rotated into place — which is far more robust than trying to assemble a wall
 * out of boxes around each opening.
 */
function buildWall(
  edge: PlanEdge,
  height: number,
  thickness: number,
  openings: Opening[],
  material: THREE.Material
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(edge.length, 0);
  shape.lineTo(edge.length, height);
  shape.lineTo(0, height);
  shape.closePath();

  for (const opening of openings) {
    const centre = opening.t * edge.length;
    const half = opening.widthM / 2;
    const left = Math.max(0.02, centre - half);
    const right = Math.min(edge.length - 0.02, centre + half);
    const bottom = Math.max(0, opening.sillM);
    const top = Math.min(height - 0.02, opening.sillM + opening.heightM);
    if (right - left < 0.05 || top - bottom < 0.05) continue;

    const hole = new THREE.Path();
    hole.moveTo(left, bottom);
    hole.lineTo(left, top);
    hole.lineTo(right, top);
    hole.lineTo(right, bottom);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });

  // Shape space (x along the wall, y up, z through the wall) → world.
  // Using the inward normal as the extrusion axis keeps the basis right-handed; the wall is
  // then pushed back out so its inner face lands exactly on the room polygon.
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(edge.dir.x, 0, edge.dir.z),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(edge.inward.x, 0, edge.inward.z)
  );
  basis.setPosition(edge.a.x - edge.inward.x * thickness, 0, edge.a.z - edge.inward.z * thickness);
  geometry.applyMatrix4(basis);

  const mesh = own(new THREE.Mesh(geometry, material));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Skirting along the foot of a wall, broken where a door passes through.
 *
 * `edge.facing` is the rotation that puts a box's **width** along the wall and its **depth**
 * through it — which is what every wall-mounted element wants. Rotating by the edge direction
 * instead lays them across the wall at right angles.
 */
function buildBaseboard(edge: PlanEdge, openings: Opening[], material: THREE.Material): THREE.Group {
  const group = new THREE.Group();

  // Build the list of gaps (doors only — windows start above the skirting).
  const gaps = openings
    .filter((o) => o.kind !== 'window')
    .map((o) => {
      const centre = o.t * edge.length;
      return [centre - o.widthM / 2 - 0.03, centre + o.widthM / 2 + 0.03] as const;
    })
    .sort((a, b) => a[0] - b[0]);

  let cursor = 0;
  const segments: Array<[number, number]> = [];
  for (const [start, end] of gaps) {
    if (start > cursor) segments.push([cursor, Math.min(start, edge.length)]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < edge.length) segments.push([cursor, edge.length]);

  for (const [start, end] of segments) {
    const length = end - start;
    if (length < 0.05) continue;
    const midT = (start + length / 2) / edge.length;
    const point = pointOnEdge(edge, midT);
    const board = own(
      box(length, BASEBOARD_HEIGHT, BASEBOARD_DEPTH, material, [
        point.x + edge.inward.x * (BASEBOARD_DEPTH / 2),
        BASEBOARD_HEIGHT / 2,
        point.z + edge.inward.z * (BASEBOARD_DEPTH / 2),
      ])
    );
    board.rotation.y = edge.facing;
    group.add(board);
  }

  return group;
}

/** Hidden by default; the viewer shows the slabs while doors and windows are being edited. */
export const OPENING_SLAB_NAME = 'opening-slab';
/** Layer the raycaster ignores. Cut-away walls and idle opening slabs go here. */
export const HIDDEN_LAYER = 1;

/** Frame around an opening, plus glazing for windows and a swung leaf for doors. */
function buildOpeningTrim(
  edge: PlanEdge,
  opening: Opening,
  thickness: number,
  materials: StyleMaterials
): THREE.Group {
  const group = new THREE.Group();
  const point = pointOnEdge(edge, opening.t);
  const frameMaterial = materials.get('ceramic', { roughness: 0.6 });

  // Local +X runs along the wall and local +Z through it, so a box reads as
  // (width along the opening, height, thickness through the wall).
  const yaw = edge.facing;

  const place = (mesh: THREE.Mesh, alongOffset: number, y: number, depthOffset: number) => {
    mesh.position.set(
      point.x + edge.dir.x * alongOffset + edge.inward.x * depthOffset,
      y,
      point.z + edge.dir.z * alongOffset + edge.inward.z * depthOffset
    );
    mesh.rotation.y = yaw;
    group.add(own(mesh));
  };

  const w = opening.widthM;
  const h = opening.heightM;
  const sill = opening.sillM;
  const frame = 0.055;
  // The wall runs from the polygon edge outwards, so its middle is half a thickness out.
  const midWall = -thickness / 2;

  // Jambs
  for (const sign of [1, -1]) {
    place(box(frame, h, thickness + 0.02, frameMaterial), (sign * (w + frame)) / 2, sill + h / 2, midWall);
  }
  // Head
  place(box(w + frame * 2, frame, thickness + 0.02, frameMaterial), 0, sill + h + frame / 2, midWall);

  // A translucent slab the size of the opening: the thing you grab to slide a door along
  // its wall. Parked on the hidden layer until the studio enters its openings mode.
  const slab = own(box(w, h, thickness + 0.16, new THREE.MeshBasicMaterial({ color: 0xe85d26, transparent: true, opacity: 0.28, depthWrite: false })));
  slab.name = OPENING_SLAB_NAME;
  slab.renderOrder = 5;
  slab.layers.set(HIDDEN_LAYER);
  place(slab, 0, sill + h / 2, midWall);

  if (opening.kind === 'window') {
    // Sill, glazing, and one bar so it reads as a window rather than a hole.
    place(box(w + frame * 2, 0.04, thickness + 0.09, frameMaterial), 0, sill - 0.02, midWall + 0.02);
    place(box(w, h, 0.012, materials.get('glass')), 0, sill + h / 2, midWall);
    place(box(0.03, h, 0.022, frameMaterial), 0, sill + h / 2, midWall);
    place(box(w, 0.03, 0.022, frameMaterial), 0, sill + h / 2, midWall);
  } else if (opening.kind === 'door') {
    // The leaf hangs from one jamb and swings into the room.
    //
    // It has to rotate about the hinge, not about its own middle, so the leaf is a child of a
    // pivot placed at the jamb and offset half its width along the wall. Rotating the leaf
    // itself would spin it around its centre like a revolving door.
    const leafWidth = w - 0.03;
    const leafHeight = h - 0.03;
    const openAngle = Math.PI * 0.42; // ~75°, clearly open without lying flat on the wall

    const pivot = new THREE.Group();
    pivot.position.set(
      point.x - edge.dir.x * (w / 2) + edge.inward.x * midWall,
      0,
      point.z - edge.dir.z * (w / 2) + edge.inward.z * midWall
    );
    pivot.rotation.y = yaw + openAngle;

    const leaf = own(box(leafWidth, leafHeight, 0.04, materials.get('wood')));
    leaf.position.set(leafWidth / 2, sill + leafHeight / 2, 0);
    pivot.add(leaf);

    // Handle on the far edge from the hinge, at the usual height.
    const handle = own(
      cylinder(0.017, 0.017, 0.11, materials.get('metal'), [leafWidth - 0.07, sill + 1.05, 0.05], 8)
    );
    handle.rotation.x = Math.PI / 2;
    pivot.add(handle);

    group.add(pivot);
  }

  return group;
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

function findFinish(
  finishes: SurfaceFinish[],
  roomId: string,
  surface: SurfaceFinish['surface']
): SurfaceFinish | undefined {
  return finishes.find((f) => f.roomId === roomId && f.surface === surface);
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

// ---------------------------------------------------------------------------
// Partner GLB models
// ---------------------------------------------------------------------------

interface CachedModel {
  object: THREE.Object3D;
  /** Extents as authored — unit-sized by the conversion script — for scaling instances. */
  size: THREE.Vector3;
}

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const modelCache = new Map<string, Promise<CachedModel>>();

/**
 * Loads a partner model once per URL and hands out clones.
 *
 * The GLBs carry their own PBR materials — the partner's fabric, veneer or leather where the
 * archive had the maps, a base colour where it did not — so nothing is overridden here. What
 * they do not carry is normals (the source exports have `vn=0`), so those are computed on the
 * cached original rather than per instance.
 */
function loadModel(url: string): Promise<THREE.Object3D> {
  let entry = modelCache.get(url);
  if (!entry) {
    entry = gltfLoader.loadAsync(url).then((gltf) => {
      const object = gltf.scene;
      object.traverse((child) => {
        if (child instanceof THREE.Mesh && !child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals();
        }
      });
      // A wrapper sits at the centre of the item's footprint, on the floor, so the model has
      // to stand on y = 0 centred on x/z. The converters export exactly that; a file uploaded
      // in admin comes with whatever origin its tool chose — Meshy centres on the bounding
      // box, so half the piece sat below the floor. Shift once here, on a pivot above the
      // file's own transform, and every clone inherits it.
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.add(object);
      pivot.position.set(-centre.x, -box.min.y, -centre.z);
      const root = new THREE.Group();
      root.add(pivot);
      return { object: root, size };
    });
    modelCache.set(url, entry);
  }
  return entry.then(({ object, size }) => {
    const clone = object.clone(true);
    clone.userData.authoredSize = size;
    return clone;
  });
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
