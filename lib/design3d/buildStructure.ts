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
import { pointOnEdge, roomEdges } from '@/lib/design/planGeometry';
import { orphanWallSegments, wallHeightFor } from '@/lib/design/walls';
import { ELECTRICAL_KINDS } from '@/lib/design/electrical';
import type { ElectricalKind, ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, StyleDefinition, SurfaceFinish, Vec2 } from '@/lib/design/types';
import { StyleMaterials } from './materials';
import { box, tag } from './primitives';
import { FIXTURE_MODELS, type FixtureModel } from './fixtureManifest';
import { loadFixture, loadModel } from './modelLoader';
import type { SceneUserData } from './buildScene';

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
  const wallMaterial = materials.surface(style.surfaces.wall, { u: 2, v: 2 });
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
  /** The furniture: a ceiling point under a hanging lamp product shows only its rose. */
  items?: PlacedItem[];
  /** A ghost riding on the pointer: one translucent material, no models. */
  preview?: boolean;
}

/** The model a kind is drawn with, when one exists. */
export function fixtureFor(kind: ElectricalKind): FixtureModel | null {
  return FIXTURE_MODELS.find((m) => m.kinds.includes(kind)) ?? null;
}

/**
 * What to draw for a point: its own product's model when it has one, the kind's default
 * fixture otherwise. A file under `/models/fixtures` is framed as a fixture already (back
 * on the wall, top on the ceiling); anything else — a product a partner uploaded — is a
 * furniture-framed model that is scaled to the product's size and turned to the wall here.
 */
function modelFor(point: ElectricalPoint): { url: string; framed: boolean; sizeM?: { width: number; depth: number; height: number } } | null {
  const url = point.product?.model3dUrl;
  if (url) return { url, framed: url.startsWith('/models/fixtures/'), sizeM: point.sizeM };
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

  /** Puts the model into its holder when it arrives, unless the piece is gone by then. */
  const attach = (holder: THREE.Group, spec: NonNullable<ReturnType<typeof modelFor>>, mount: 'wall' | 'ceiling', afterLoad?: (model: THREE.Object3D) => void) => {
    (spec.framed ? loadFixture(spec.url) : loadModel(spec.url).then((m) => reframe(m, mount, spec.sizeM)))
      .then((model) => {
        if (!piece.parent) return;
        if (ghost) ghostModel(model, ghost);
        else if (info.light && on) litModel(model, materials.style.lighting.lamp);
        holder.add(model);
        tag(model, { ...data() });
        afterLoad?.(model);
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
    const lampNearby = point.kind === 'light_ceiling' && options.items?.some((i) => i.roomId === room.id && i.slot === 'pendant' && Math.hypot(i.position.x - point.position.x, i.position.z - point.position.z) < LAMP_NEAR_M);
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
  for (let i = 0; i < count; i++) {
    const holder = new THREE.Group();
    holder.position.x = (i - (count - 1) / 2) * PLATE_M;
    piece.add(holder);
    attach(holder, spec, 'wall');
  }
  return piece;
}

/** Scales a model along its width so it spans `length` metres — a tube becomes a strip of any length. */
function stretchTo(model: THREE.Object3D, length: number): void {
  const width = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x;
  if (width > 1e-6) model.scale.x = length / width;
}

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

export interface SceneLight {
  id: string;
  position: [number, number, number];
  intensity: number;
  distance: number;
  color?: string;
}

/**
 * The lights the electrical layer turns on, as point lights for the viewer. Intensity
 * follows the category — a main light lights the room, a bedside lamp a corner.
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

/** Floor patches with their own finish, laid a hair above the room's floor. */
export function buildZones(plan: FloorPlan, finishes: SurfaceFinish[], materials: StyleMaterials, style: StyleDefinition): THREE.Group {
  const group = new THREE.Group();
  group.name = 'zones';
  for (const finish of finishes) {
    if (!finish.zone || finish.surface !== 'floor') continue;
    const room = plan.rooms.find((r) => r.id === finish.roomId);
    if (!room) continue;
    const shape = new THREE.Shape();
    finish.zone.polygon.forEach((p, i) => {
      if (i === 0) shape.moveTo(p.x, -p.z);
      else shape.lineTo(p.x, -p.z);
    });
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const xs = finish.zone.polygon.map((p) => p.x);
    const zs = finish.zone.polygon.map((p) => p.z);
    const material = materials.surface(style.surfaces.floor, { u: Math.max(...xs) - Math.min(...xs), v: Math.max(...zs) - Math.min(...zs) }, {
      colorHex: finish.colorHex,
      textureUrl: finish.textureUrl,
      textureScaleM: finish.textureScaleM,
      normalUrl: finish.normalUrl ?? null,
      roughnessUrl: finish.roughnessUrl ?? null,
    });
    const mesh = own(new THREE.Mesh(geometry, material));
    mesh.position.y = 0.004;
    mesh.receiveShadow = true;
    tag(mesh, { pickKind: 'zone', roomId: room.id, zoneId: finish.zone.id } satisfies SceneUserData);
    group.add(mesh);
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
