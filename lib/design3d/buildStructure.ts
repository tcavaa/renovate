/**
 * The parts of the flat that are not a room shell: free-standing walls, columns, beams, the
 * electrical fittings, and the floor zones with their own finish. Built once per plan
 * change, like the room shells, and tagged so the viewer can pick them.
 *
 * The walls, columns, beams and zones are owned geometry (disposed with the group) built
 * from the plan; materials come from the style's factory and are shared. The electrical
 * fittings are models and nothing else — the point's product, or the kind's default from
 * `fixtureManifest` (a socket, a switch, a wall lamp, a bulb on a cord, a flush spot, a
 * tube for the strips) — so a fitting is an empty group at its point until its file
 * arrives, on the wall turned to face the room or hanging from the ceiling, and the viewer
 * moves the group and the store re-projects it onto its wall on release.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pointOnEdge, polygonBounds, polygonCentroid, roomEdges } from '@/lib/design/planGeometry';
import { orphanWallSegments, wallHeightFor } from '@/lib/design/walls';
import { ELECTRICAL_KINDS } from '@/lib/design/electrical';
import { cellPolygon } from '@/lib/design/paint';
import type { ElectricalKind, ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, StyleDefinition, SurfaceFinish, Vec2 } from '@/lib/design/types';
import { StyleMaterials } from './materials';
import { box, tag } from './primitives';
import { FIXTURE_MODELS, type FixtureModel } from './fixtureManifest';
import { loadFixture, loadModel } from './modelLoader';
import { alongX, instanced } from './instancing';
import type { SceneUserData } from './buildScene';
import { RADIATOR_MODELS } from './radiatorManifest';
import { EQUIPMENT_MODELS } from './equipmentManifest';
import { DEFAULT_SECTION_WIDTH_M, radiatorPoints, radiatorRoom, radiatorSections, radiatorWallSpot } from '@/lib/design/radiators';
import { clearOfOpenings, isEquipmentKind, pointProductKind } from '@/lib/design/equipment';
import { technicalElevation } from '@/lib/design/technical';

function own<T extends THREE.Mesh>(mesh: T): T {
  mesh.userData.ownsGeometry = true;
  return mesh;
}

/** A box from `a` to `b` in the plan, `width` across, `height` tall, its base at `baseY`. */
function slab(a: Vec2, b: Vec2, width: number, height: number, baseY: number, material: THREE.Material): THREE.Mesh {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const mesh = own(box(length, height, width, material, [(a.x + b.x) / 2, baseY + height / 2, (a.z + b.z) / 2]));
  mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  return mesh;
}

/** Walls that bound no room, columns and beams. */
export function buildStructure(plan: FloorPlan, style: StyleDefinition, materials: StyleMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'structure';
  const wallMaterial = materials.metreSurface(style.surfaces.wall);
  const concrete = materials.get('stone', { roughness: 0.75 });

  for (const { wall, a, b } of orphanWallSegments(plan)) {
    const mesh = slab(a, b, wall.thicknessM, wallHeightFor(plan, wall), 0, wallMaterial);
    tag(mesh, { pickKind: 'wall', roomId: '', wallId: wall.id } satisfies SceneUserData);
    group.add(mesh);
  }

  for (const column of plan.columns ?? []) {
    const room = plan.rooms.find((r) => pointIn(column.position, r.polygon));
    const height = column.heightM ?? room?.heightM ?? plan.wallHeightM ?? 2.8;
    const material = column.material === 'wood' ? materials.get('wood') : column.material === 'metal' ? materials.get('metal') : concrete;
    const mesh = own(box(column.widthM, height, column.depthM, material, [column.position.x, height / 2, column.position.z]));
    tag(mesh, { pickKind: 'column', roomId: room?.id ?? '', columnId: column.id } satisfies SceneUserData);
    group.add(mesh);
  }

  for (const beam of plan.beams ?? []) {
    const material = beam.material === 'wood' ? materials.get('wood') : beam.material === 'metal' ? materials.get('metal') : concrete;
    const mesh = slab(beam.a, beam.b, beam.widthM, beam.depthM, beam.elevationM, material);
    tag(mesh, { pickKind: 'beam', roomId: '', beamId: beam.id } satisfies SceneUserData);
    group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Electrical fittings
// ---------------------------------------------------------------------------

export interface ElectricalBuildOptions {
  /** Only these rooms' points (a room in focus); every point otherwise. */
  rooms?: Set<string> | null;
  /** Where the furniture's hanging lamps hang: a ceiling point under one shows only its rose. */
  hangingLamps?: HangingLamp[];
  /** A ghost riding on the pointer: one translucent material, no models. */
  preview?: boolean;
}

/** A hanging lamp from the catalogue, as much of it as the fittings read: its room and where it hangs. */
export interface HangingLamp {
  roomId: string;
  x: number;
  z: number;
}

/**
 * The furniture's hanging lamps as a key. The fittings read nothing else of the furniture, so
 * the viewer builds them again when this changes and not when a sofa moves: every drop used to
 * clone every socket, switch and lamp in the flat anew. `JSON.parse` of the key is the lamps.
 */
export function hangingLampsKey(items: readonly PlacedItem[]): string {
  return JSON.stringify(items.filter((item) => item.slot === 'pendant').map((item): HangingLamp => ({ roomId: item.roomId, x: item.position.x, z: item.position.z })));
}

/** The model a kind is drawn with, when one exists. */
export function fixtureFor(kind: ElectricalKind): FixtureModel | null {
  return FIXTURE_MODELS.find((m) => m.kinds.includes(kind)) ?? null;
}

/**
 * What to draw for a point: its own product's model when it has one, the kind's default
 * fixture otherwise. A file under `/models/fixtures` is framed as a fixture already (back
 * on the wall, top on the ceiling), and so is an equipment model framed as a fitting (the TV
 * and data sockets); anything else — a product a partner uploaded — is a furniture-framed
 * model that is scaled to the product's size and turned to the wall here.
 */
function modelFor(point: ElectricalPoint): { url: string; framed: boolean; sizeM?: { width: number; depth: number; height: number } } | null {
  const url = point.product?.model3dUrl;
  if (url) return { url, framed: url.startsWith('/models/fixtures/') || EQUIPMENT_MODELS.some((m) => m.url === url && m.frame === 'fitting'), sizeM: point.sizeM };
  const fixture = fixtureFor(point.kind);
  return fixture ? { url: fixture.url, framed: true } : null;
}

/** A furniture-framed model (standing on y = 0, centred on x/z) refitted as a fixture of `sizeM`. */
function reframe(model: THREE.Object3D, mount: 'wall' | 'ceiling', sizeM?: { width: number; depth: number; height: number }): THREE.Object3D {
  const authored = (model.userData.authoredSize as THREE.Vector3 | undefined) ?? new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const target = sizeM ?? { width: 0.08, depth: 0.02, height: 0.08 };
  const scale = Math.max(target.width, target.height) / Math.max(authored.x, authored.y, 1e-6);
  const wrapper = new THREE.Group();
  model.scale.setScalar(scale);
  const height = authored.y * scale;
  const depth = authored.z * scale;
  // Standing on y = 0 and centred: a wall fixture hangs from its centre with its back on
  // the wall (+z into the room); a ceiling fixture hangs from its top.
  model.position.set(0, mount === 'wall' ? -height / 2 : -height, mount === 'wall' ? depth / 2 : 0);
  wrapper.add(model);
  return wrapper;
}

/** Sockets, switches and light fittings as small pieces on the walls and ceilings. */
export function buildElectrical(plan: FloorPlan, points: ElectricalPoint[], materials: StyleMaterials, options: ElectricalBuildOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = 'electrical';
  for (const point of points) {
    if (options.rooms && !options.rooms.has(point.roomId)) continue;
    const room = plan.rooms.find((r) => r.id === point.roomId);
    if (!room) continue;
    const piece = buildFitting(room, point, materials, options);
    if (!piece) continue;
    piece.name = `electrical-${point.id}`;
    tag(piece, { pickKind: 'electrical', roomId: room.id, electricalId: point.id } satisfies SceneUserData);
    group.add(piece);
  }
  return group;
}

/** The width of one socket plate, and the pitch of a double or triple. */
const PLATE_M = 0.08;
/** A hanging lamp product this close to a ceiling point is that point's fitting. */
const LAMP_NEAR_M = 0.5;
/** Materials of a lamp model that stand for the light itself, lit when the point is on. */
const LIT_MATERIAL = /light|lamp|glow|bulb|emiss|led|tube|shade/i;

/** The model the studio draws for a role when nothing is chosen (see `FixtureModel.role`). */
export function fixtureRole(role: NonNullable<FixtureModel['role']>): FixtureModel | null {
  return FIXTURE_MODELS.find((m) => m.role === role) ?? null;
}

/**
 * One fitting as a group standing at its point: on a wall it is turned so local +x runs
 * along the wall and local +z into the room (`edge.facing`), a hair off the plaster; under
 * the ceiling it hangs from the point. The group holds nothing but the model — the point's
 * product or the kind's default — which arrives asynchronously into a holder per plate, so
 * a double socket is two of the same plate side by side and a strip is one tube stretched
 * to its length. A ceiling point under a hanging lamp from the catalogue shows only the
 * rose. A preview (the ghost that rides on the pointer) is the same model in one
 * translucent material; a light that is on has its lamp materials glowing.
 */
export function buildFitting(room: PlanRoom, point: ElectricalPoint, materials: StyleMaterials, options: ElectricalBuildOptions = {}): THREE.Group | null {
  const info = ELECTRICAL_KINDS[point.kind];
  const on = point.on !== false;
  const edge = point.wallIndex != null ? roomEdges(room.polygon).find((e) => e.index === point.wallIndex) : null;
  const piece = new THREE.Group();
  const ghost = options.preview ? new THREE.MeshBasicMaterial({ color: 0xe85d26, transparent: true, opacity: 0.55, depthWrite: false }) : null;
  const data = () => piece.userData as SceneUserData;

  /**
   * Puts the model into its holder when it arrives, unless the piece is gone by then.
   * `prepare` runs while the model still stands alone, in its own frame: anything that
   * measures it (`stretchTo`) has to happen before it hangs under the piece, because a
   * bounding box is taken in world space and the piece is turned to its wall — on a wall
   * that runs north–south a tube's thickness was read as its length, and the strip came out
   * fifty times too long, a white bar across the whole flat.
   */
  const attach = (holder: THREE.Group, spec: NonNullable<ReturnType<typeof modelFor>>, mount: 'wall' | 'ceiling', prepare?: (model: THREE.Object3D) => void, placements?: THREE.Matrix4[]) => {
    (spec.framed ? loadFixture(spec.url) : loadModel(spec.url).then((m) => reframe(m, mount, spec.sizeM)))
      .then((model) => {
        if (!piece.parent) return;
        if (ghost) ghostModel(model, ghost);
        else if (info.light && on) litModel(model, materials.style.lighting.lamp);
        prepare?.(model);
        // Several plates of one point are one instanced run (`instancing.ts`).
        const drawn = placements ? instanced(model, placements) : model;
        holder.add(drawn);
        tag(drawn, { ...data() });
      })
      .catch((error: unknown) => console.warn(`[studio] fixture failed to load: ${spec.url}`, error));
  };

  if (info.placement === 'ceiling' || point.kind === 'light_spot') {
    const y = Math.min(room.heightM - 0.005, point.elevationM || room.heightM);
    piece.position.set(point.position.x, y, point.position.z);
    const holder = new THREE.Group();
    piece.add(holder);
    // A hanging lamp from the catalogue already hangs here: the lamp is the fitting and the
    // point shows only its rose.
    const lampNearby = point.kind === 'light_ceiling' && options.hangingLamps?.some((lamp) => lamp.roomId === room.id && Math.hypot(lamp.x - point.position.x, lamp.z - point.position.z) < LAMP_NEAR_M);
    const rose = lampNearby ? fixtureRole('rose') : null;
    const spec = rose ? { url: rose.url, framed: true } : modelFor(point);
    if (spec) attach(holder, spec, 'ceiling');
    return piece;
  }

  if (point.kind === 'light_strip' || !edge) {
    if (info.placement === 'wall' && !edge) return null;
    // A strip lying where it was put (under a bed, along a shelf), turned to its wall when it
    // has one, its one tube stretched to the length of the point.
    const length = point.lengthM ?? 1.5;
    piece.position.set(point.position.x, point.elevationM, point.position.z);
    piece.rotation.y = edge ? edge.facing : 0;
    const holder = new THREE.Group();
    piece.add(holder);
    const spec = modelFor(point);
    if (spec) attach(holder, spec, 'wall', (model) => stretchTo(model, length));
    return piece;
  }

  // On the wall: local +x along the wall, +z into the room; the point sits a hair off the plaster.
  const p = pointOnEdge(edge, point.t ?? 0.5);
  const inset = 0.006;
  piece.position.set(p.x + edge.inward.x * inset, point.elevationM, p.z + edge.inward.z * inset);
  piece.rotation.y = edge.facing;
  const spec = modelFor(point);
  if (!spec) return piece;

  if (point.kind === 'light_furniture') {
    const holder = new THREE.Group();
    piece.add(holder);
    attach(holder, spec, 'wall', (model) => stretchTo(model, point.lengthM ?? 1.5));
    return piece;
  }
  // Sockets, switches, TV and data points: one plate per outlet, side by side; a wall lamp is one.
  const single = point.kind === 'switch' || point.kind === 'tv' || point.kind === 'internet' || point.kind === 'light_wall';
  const count = single ? 1 : Math.max(1, point.count ?? 1);
  const holder = new THREE.Group();
  piece.add(holder);
  attach(holder, spec, 'wall', undefined, count > 1 ? Array.from({ length: count }, (_, i) => alongX((i - (count - 1) / 2) * PLATE_M)) : undefined);
  return piece;
}

/**
 * Scales a model along its width so it spans `length` metres — a tube becomes a strip of any
 * length. Measured in the model's own frame, so it must not have a parent yet (see `attach`).
 */
function stretchTo(model: THREE.Object3D, length: number): void {
  // Out of whatever it hangs under for the measurement, so the box is in its own frame.
  const parent = model.parent;
  parent?.remove(model);
  model.scale.x = 1;
  model.updateMatrixWorld(true);
  const width = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x;
  if (width > 1e-6 && Number.isFinite(length) && length > 0) model.scale.x = Math.min(length, MAX_STRIP_M) / width;
  parent?.add(model);
}

/** No strip is longer than the longest wall anyone draws; a bad length must not cross the flat. */
const MAX_STRIP_M = 12;

/** Every mesh in one translucent material: the ghost of a fitting riding on the pointer. */
function ghostModel(model: THREE.Object3D, material: THREE.Material): void {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) child.material = material;
  });
}

/**
 * Lights up the parts of a lamp model that stand for the light — the materials named for
 * it — on this instance alone: the loader hands out clones that share the cached file's
 * materials, so each lit one is copied before it is tinted (gotcha 7).
 */
function litModel(model: THREE.Object3D, colorHex: string): void {
  const lit = new Map<THREE.Material, THREE.Material>();
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const replaced = sources.map((source) => {
      if (!(source instanceof THREE.MeshStandardMaterial) || !LIT_MATERIAL.test(source.name)) return source;
      let copy = lit.get(source);
      if (!copy) {
        const clone = source.clone();
        clone.emissive = new THREE.Color(colorHex);
        clone.emissiveIntensity = 0.9;
        lit.set(source, clone);
        copy = clone;
      }
      return copy;
    });
    child.material = Array.isArray(child.material) ? replaced : replaced[0];
  });
}

// ---------------------------------------------------------------------------
// Radiators
// ---------------------------------------------------------------------------

/** How far a radiator hangs off the plaster, and how far a wall's end it keeps from a corner. */
const RADIATOR_WALL_GAP_M = 0.03;
const RADIATOR_END_MARGIN_M = 0.1;

/**
 * The central-heating radiators, each one its section model repeated side by side along
 * the wall it hangs on — as many sections as its room's heat calls for (`radiatorSections`),
 * which is also what the budget buys. The model is the point's product, or the style's own
 * radiator from the manifest while it has none. A file under `/models/radiators` is framed
 * as one section (its back on z = 0, exactly one pitch wide); anything else — a whole
 * radiator a partner uploaded — is drawn once and stretched to the run.
 */
export function buildRadiators(plan: FloorPlan, style: StyleDefinition, rooms?: Set<string> | null): THREE.Group {
  const group = new THREE.Group();
  group.name = 'radiators';
  for (const point of radiatorPoints(plan)) {
    const spot = radiatorWallSpot(plan, point);
    if (!spot || (rooms && !rooms.has(spot.room.id))) continue;
    const fallback = RADIATOR_MODELS.find((m) => m.styles[0] === style.id) ?? RADIATOR_MODELS.find((m) => m.styles.includes(style.id)) ?? RADIATOR_MODELS[0];
    const url = point.product?.model3dUrl ?? fallback?.url;
    if (!url) continue;
    const sectional = url.startsWith('/models/radiators/');
    const known = RADIATOR_MODELS.find((m) => m.url === url);
    const pitch = point.radiator?.sectionWidthM ?? (known ? known.sectionWidthCm / 100 : DEFAULT_SECTION_WIDTH_M);
    const sections = radiatorSections(plan, point);
    const run = sections * pitch;

    // Centred on its point, but never past the end of its wall.
    const half = Math.min(run / 2 + RADIATOR_END_MARGIN_M, spot.edge.length / 2);
    const along = Math.max(half, Math.min(spot.edge.length - half, spot.s));
    const at = pointOnEdge(spot.edge, along / spot.edge.length);
    const piece = new THREE.Group();
    piece.name = `radiator-${point.id}`;
    piece.position.set(at.x + spot.edge.inward.x * RADIATOR_WALL_GAP_M, point.elevationM ?? 0.12, at.z + spot.edge.inward.z * RADIATOR_WALL_GAP_M);
    piece.rotation.y = spot.edge.facing;
    const data = { pickKind: 'technical', roomId: spot.room.id, technicalId: point.id } satisfies SceneUserData;
    tag(piece, data);

    if (sectional) {
      // The sections side by side as one instanced run: a draw call per mesh of the section
      // model for the whole radiator, not one per section.
      loadFixture(url)
        .then((model) => {
          if (!piece.parent) return;
          const run = instanced(model, Array.from({ length: sections }, (_, i) => alongX((i - (sections - 1) / 2) * pitch)));
          piece.add(run);
          tag(run, data);
        })
        .catch((error: unknown) => console.warn(`[studio] radiator failed to load: ${url}`, error));
    } else {
      loadModel(url)
        .then((model) => {
          if (!piece.parent) return;
          // Stands on y = 0, centred on x/z: stretched to the run, its back put on the wall.
          const size = (model.userData.authoredSize as THREE.Vector3 | undefined) ?? new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
          const heightM = point.radiator?.heightM ?? 0.6;
          const k = heightM / Math.max(size.y, 1e-6);
          const wrapper = new THREE.Group();
          wrapper.scale.set(run / Math.max(size.x, 1e-6), k, k);
          wrapper.position.z = (size.z * k) / 2;
          wrapper.add(model);
          piece.add(wrapper);
          tag(wrapper, data);
        })
        .catch((error: unknown) => console.warn(`[studio] radiator failed to load: ${url}`, error));
    }
    group.add(piece);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/** How far a wall-hung piece of equipment stands off the plaster (its bracket). */
const EQUIPMENT_WALL_GAP_M = 0.01;
/** How far a floor drain's grate stands proud of the floor; the rest of it is in the slab. */
const DRAIN_PROUD_M = 0.003;

/**
 * The technical points bought as equipment (`lib/design/equipment`): the electrical panel, the
 * boiler, the air conditioner, a cooker hood or a fan — each its product's model on the nearest
 * wall of its room, its bottom at the point's height, its back on the plaster and its front to
 * the room, slid along the wall off any window or door it would cover (`clearOfOpenings`) — and
 * a floor drain set into the floor at its point, its grate flush. The model is
 * the point's product, or the manifest's first of the kind while it has none (the radiators'
 * rule). Any file will do — the loader stands a model on y = 0 centred on x/z — and it is drawn
 * at the product's size when the product has one (`TechnicalPoint.sizeM`), else at its own.
 */
export function buildEquipment(plan: FloorPlan, rooms?: Set<string> | null): THREE.Group {
  const group = new THREE.Group();
  group.name = 'equipment';
  for (const point of plan.technical?.points ?? []) {
    if (!isEquipmentKind(point.kind)) continue;
    const productKind = pointProductKind(plan, point);
    const url = point.product?.model3dUrl ?? EQUIPMENT_MODELS.find((m) => m.kind === productKind)?.url;
    if (!url) continue;
    // What it measures: its product's size, else the manifest's for its model.
    const known = EQUIPMENT_MODELS.find((m) => m.url === url);
    const dims = point.sizeM ?? (known ? { width: known.widthCm / 100, depth: known.depthCm / 100, height: known.heightCm / 100 } : null);
    const floor = point.kind === 'floor_drain';
    const spot = floor ? null : radiatorWallSpot(plan, point);
    const room = spot?.room ?? radiatorRoom(plan, point);
    if (!room || (!floor && !spot) || (rooms && !rooms.has(room.id))) continue;

    const piece = new THREE.Group();
    piece.name = `equipment-${point.id}`;
    const data = { pickKind: 'technical', roomId: room.id, technicalId: point.id } satisfies SceneUserData;
    tag(piece, data);
    if (spot) {
      // At its point along the wall, off the windows and doors, never past the wall's end.
      const bottom = point.elevationM ?? technicalElevation(point.kind, room);
      const along = clearOfOpenings(spot.room.openings, spot.edge, spot.s, dims?.width ?? 0.4, bottom, dims?.height ?? 0);
      const at = pointOnEdge(spot.edge, along / spot.edge.length);
      piece.position.set(at.x + spot.edge.inward.x * EQUIPMENT_WALL_GAP_M, bottom, at.z + spot.edge.inward.z * EQUIPMENT_WALL_GAP_M);
      piece.rotation.y = spot.edge.facing;
    } else {
      piece.position.set(point.position.x, 0, point.position.z);
    }

    loadModel(url)
      .then((model) => {
        if (!piece.parent) return;
        const authored = (model.userData.authoredSize as THREE.Vector3 | undefined) ?? new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        const size = point.sizeM ?? { width: authored.x, depth: authored.z, height: authored.y };
        const wrapper = new THREE.Group();
        wrapper.scale.set(size.width / Math.max(authored.x, 1e-6), size.height / Math.max(authored.y, 1e-6), size.depth / Math.max(authored.z, 1e-6));
        // On a wall its back is on the plaster (the model is centred on z); in the floor only the grate shows.
        if (floor) wrapper.position.y = DRAIN_PROUD_M - size.height;
        else wrapper.position.z = size.depth / 2;
        wrapper.add(model);
        piece.add(wrapper);
        tag(wrapper, data);
      })
      .catch((error: unknown) => console.warn(`[studio] equipment failed to load: ${url}`, error));
    group.add(piece);
  }
  return group;
}

export interface SceneLight {
  id: string;
  position: [number, number, number];
  intensity: number;
  distance: number;
  color?: string;
}

/**
 * The lights the electrical layer turns on, one per fitting. Intensity follows the category — a
 * main light lights the room, a bedside lamp a corner. The viewer lights rooms, not fittings
 * (`nightLights` merges these room by room).
 */
export function lightsFrom(plan: FloorPlan, points: ElectricalPoint[], rooms?: Set<string> | null): SceneLight[] {
  const out: SceneLight[] = [];
  for (const point of points) {
    const info = ELECTRICAL_KINDS[point.kind];
    if (!info.light || point.on === false) continue;
    if (rooms && !rooms.has(point.roomId)) continue;
    const room = plan.rooms.find((r) => r.id === point.roomId);
    if (!room) continue;
    const primary = point.kind === 'light_ceiling';
    const y = info.placement === 'ceiling' ? Math.max(1.6, room.heightM - 0.25) : point.elevationM;
    out.push({
      id: point.id,
      position: [point.position.x, y, point.position.z],
      intensity: primary ? 4 + room.areaM2 * 0.6 : point.kind === 'light_strip' || point.kind === 'light_furniture' ? 2.5 : 3,
      distance: primary ? Math.max(4, Math.sqrt(room.areaM2) * 2.2) : 3.5,
    });
  }
  return out;
}

/** A room's light after dusk (`nightLights`). */
export interface NightLight extends SceneLight {
  /**
   * A lamp the room is lent because none of the flat's own lights is on: sized to the room and
   * dimmed with the hour like the evening, where a fitting's light holds up through the night.
   */
  standIn: boolean;
}

/**
 * The flat's lights after dusk: one point light for each room in view that has lights of its
 * own. A point light is paid for on every lit pixel, and three compiles the number of them into
 * every material's shader — one added or taken away recompiles every material in the flat, a
 * stutter at each switch. So the fittings switched on in a room light it together, from where
 * their light is centred (each weighted by how bright it is), as bright as they are together and
 * reaching as far as the furthest of them did; with all of them off the room keeps its light at
 * zero. A switch changes intensities, never the count, and a flat lit fitting by fitting — a
 * dozen point lights for five rooms — is lit room by room. The fittings that are on still glow
 * where they hang (`litModel`). With no light on anywhere every room in view is lent a lamp under
 * its ceiling, sized to it.
 */
export function nightLights(plan: FloorPlan, points: ElectricalPoint[], rooms?: Set<string> | null): NightLight[] {
  const inView = plan.rooms.filter((room) => !rooms || rooms.has(room.id));
  const roomOf = new Map(points.map((point) => [point.id, point.roomId]));
  const on = new Map<string, SceneLight[]>();
  for (const light of lightsFrom(plan, points, rooms)) {
    const roomId = roomOf.get(light.id);
    if (roomId) on.set(roomId, [...(on.get(roomId) ?? []), light]);
  }
  if (on.size === 0) return inView.map(standInLamp);
  const lightRooms = new Set(points.filter((point) => ELECTRICAL_KINDS[point.kind].light).map((point) => point.roomId));
  return inView
    .filter((room) => lightRooms.has(room.id))
    .map((room): NightLight => {
      const lights = on.get(room.id);
      if (!lights) return { ...standInLamp(room), intensity: 0, distance: 1, standIn: false };
      const total = lights.reduce((sum, light) => sum + light.intensity, 0);
      const position = [0, 1, 2].map((axis) => lights.reduce((sum, light) => sum + light.position[axis] * light.intensity, 0) / total) as [number, number, number];
      const distance = Math.max(...lights.map((light) => light.distance + Math.hypot(light.position[0] - position[0], light.position[1] - position[1], light.position[2] - position[2])));
      return { id: room.id, position, intensity: total, distance, standIn: false };
    });
}

/** A room's own lamp when the flat has none on: under the ceiling at its centre, sized to it so a hallway is not lit like a living room. */
function standInLamp(room: PlanRoom): NightLight {
  const centre = polygonCentroid(room.polygon);
  const bounds = polygonBounds(room.polygon);
  const span = Math.max(bounds.width, bounds.depth, 2);
  return { id: room.id, position: [centre.x, Math.max(1.8, room.heightM - 0.35), centre.z], distance: span * 1.6, intensity: 6 + room.areaM2 * 0.9, standIn: true };
}

/** A flat patch of floor from a plan polygon, facing up; its UVs are the plan's metres. */
function floorPatch(polygon: Vec2[]): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  polygon.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function floorFinishMaterial(finish: SurfaceFinish, materials: StyleMaterials, style: StyleDefinition): THREE.Material {
  return materials.metreSurface(style.surfaces.floor, {
    colorHex: finish.colorHex,
    textureUrl: finish.textureUrl,
    textureScaleM: finish.textureScaleM,
    normalUrl: finish.normalUrl ?? null,
    roughnessUrl: finish.roughnessUrl ?? null,
  });
}

/** Floor patches with their own finish, laid a hair above the room's floor. */
export function buildZones(plan: FloorPlan, finishes: SurfaceFinish[], materials: StyleMaterials, style: StyleDefinition, rooms?: Set<string> | null): THREE.Group {
  const group = new THREE.Group();
  group.name = 'zones';
  for (const finish of finishes) {
    if (!finish.zone || finish.surface !== 'floor') continue;
    if (rooms && !rooms.has(finish.roomId)) continue;
    const room = plan.rooms.find((r) => r.id === finish.roomId);
    if (!room) continue;
    const mesh = own(new THREE.Mesh(floorPatch(finish.zone.polygon), floorFinishMaterial(finish, materials, style)));
    mesh.position.y = 0.004;
    mesh.receiveShadow = true;
    tag(mesh, { pickKind: 'zone', roomId: room.id, zoneId: finish.zone.id } satisfies SceneUserData);
    group.add(mesh);
  }
  return group;
}

/**
 * The floor tiles painted one at a time (`lib/design/paint`): each tile its own patch,
 * clipped to the room, a hair above the zones. They answer to the pointer as the room's
 * floor — a click on a painted tile paints it again — not as a thing of their own. All the
 * tiles of one finish are one mesh: a square metre is what the brush lays, and a floor
 * painted tile by tile was a draw call for every metre of it.
 */
export function buildPaintedCells(plan: FloorPlan, finishes: SurfaceFinish[], materials: StyleMaterials, style: StyleDefinition, rooms?: Set<string> | null): THREE.Group {
  const group = new THREE.Group();
  group.name = 'painted-cells';
  for (const finish of finishes) {
    if (!finish.cells || finish.surface !== 'floor') continue;
    if (rooms && !rooms.has(finish.roomId)) continue;
    const room = plan.rooms.find((r) => r.id === finish.roomId);
    if (!room) continue;
    const patches: THREE.BufferGeometry[] = [];
    for (const cell of finish.cells) {
      const polygon = cellPolygon(room, cell);
      if (polygon.length >= 3) patches.push(floorPatch(polygon));
    }
    if (patches.length === 0) continue;
    const merged = patches.length > 1 ? mergeGeometries(patches) : null;
    if (merged) patches.forEach((patch) => patch.dispose());
    const material = floorFinishMaterial(finish, materials, style);
    // Patches that could not be merged (never so far: they are all the same kind) stay apart.
    for (const geometry of merged ? [merged] : patches) {
      const mesh = own(new THREE.Mesh(geometry, material));
      mesh.position.y = 0.006;
      mesh.receiveShadow = true;
      tag(mesh, { pickKind: 'surface', roomId: room.id, surface: 'floor' } satisfies SceneUserData);
      group.add(mesh);
    }
  }
  return group;
}

function pointIn(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > point.z !== b.z > point.z && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
