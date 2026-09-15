/**
 * The parts of the flat that are not a room shell: free-standing walls, columns, beams, the
 * electrical fittings, and the floor zones with their own finish. Built once per plan
 * change, like the room shells, and tagged so the viewer can pick them.
 *
 * Every procedural mesh here is owned geometry (disposed with the group); materials come
 * from the style's factory and are shared. The electrical fittings are real models where
 * one exists (`fixtureManifest`: a socket, a switch, a wall lamp, a bulb) and small
 * procedural pieces otherwise; a fitting is one group standing at its point — on the wall,
 * turned to face the room, or hanging from the ceiling — so the viewer moves the group and
 * the store re-projects it onto its wall on release.
 */

import * as THREE from 'three';
import { pointOnEdge, roomEdges } from '@/lib/design/planGeometry';
import { orphanWallSegments, wallHeightFor } from '@/lib/design/walls';
import { ELECTRICAL_KINDS } from '@/lib/design/electrical';
import type { ElectricalKind, ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, StyleDefinition, SurfaceFinish, Vec2 } from '@/lib/design/types';
import { StyleMaterials } from './materials';
import { box, cylinder, tag } from './primitives';
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

/**
 * One fitting as a group standing at its point: on a wall it is turned so local +x runs
 * along the wall and local +z into the room (`edge.facing`), with the plate a hair off the
 * plaster; under the ceiling it hangs from the point. Models arrive asynchronously and
 * replace the procedural stand-in under the same holder, so a socket is a socket the
 * moment it is placed and the real one a beat later.
 */
export function buildFitting(room: PlanRoom, point: ElectricalPoint, materials: StyleMaterials, options: ElectricalBuildOptions = {}): THREE.Group | null {
  const info = ELECTRICAL_KINDS[point.kind];
  const on = point.on !== false;
  const edge = point.wallIndex != null ? roomEdges(room.polygon).find((e) => e.index === point.wallIndex) : null;
  const piece = new THREE.Group();
  const ghost = options.preview ? new THREE.MeshBasicMaterial({ color: 0xe85d26, transparent: true, opacity: 0.55, depthWrite: false }) : null;
  const m = (role: Parameters<StyleMaterials['get']>[0], extra?: Parameters<StyleMaterials['get']>[1]) => ghost ?? materials.get(role, extra);
  const plate = m('ceramic', { roughness: 0.4 });
  const dark = m('frame', { colorHex: '#3A3733' });
  const shade = m('lampshade');
  const glow = m('emissive');
  const fixture = options.preview ? null : modelFor(point);
  const data = () => piece.userData as SceneUserData;

  /** Swaps a stand-in for the real model when it arrives, unless the piece is gone by then. */
  const attach = (holder: THREE.Group, spec: NonNullable<ReturnType<typeof modelFor>>, mount: 'wall' | 'ceiling', afterLoad?: (model: THREE.Object3D) => void) => {
    (spec.framed ? loadFixture(spec.url) : loadModel(spec.url).then((m) => reframe(m, mount, spec.sizeM)))
      .then((model) => {
        if (!piece.parent) return;
        for (const child of [...holder.children]) {
          holder.remove(child);
          if (child instanceof THREE.Mesh && child.userData.ownsGeometry) child.geometry.dispose();
        }
        holder.add(model);
        tag(model, { ...data() });
        afterLoad?.(model);
      })
      .catch((error: unknown) => console.warn(`[studio] fixture failed to load: ${spec.url}`, error));
  };

  if (info.placement === 'ceiling' || point.kind === 'light_spot') {
    const y = Math.min(room.heightM - 0.005, point.elevationM || room.heightM);
    piece.position.set(point.position.x, y, point.position.z);
    if (point.kind === 'light_spot') {
      // A recessed spot: a dark ring flush with the ceiling and a lit disc inside it — or
      // the product's own model when one was chosen.
      const holder = new THREE.Group();
      piece.add(holder);
      holder.add(own(cylinder(0.055, 0.055, 0.012, dark, [0, -0.006, 0], 24)));
      holder.add(own(cylinder(0.04, 0.04, 0.008, on ? glow : shade, [0, -0.012, 0], 20)));
      if (fixture && point.product) attach(holder, fixture, 'ceiling');
      return piece;
    }
    // The main light: a ceiling rose, and a bulb on a short cord unless a hanging lamp from
    // the catalogue already hangs here — then the lamp is the fitting and only the rose shows.
    piece.add(own(cylinder(0.05, 0.06, 0.03, plate, [0, -0.015, 0], 20)));
    const lampNearby = options.items?.some((i) => i.roomId === room.id && i.slot === 'pendant' && Math.hypot(i.position.x - point.position.x, i.position.z - point.position.z) < LAMP_NEAR_M);
    if (lampNearby) return piece;
    piece.add(own(cylinder(0.004, 0.004, 0.14, dark, [0, -0.1, 0], 8)));
    const holder = new THREE.Group();
    holder.position.y = -0.17;
    piece.add(holder);
    holder.add(own(cylinder(0.028, 0.018, 0.09, on ? glow : shade, [0, -0.05, 0], 14)));
    if (fixture) attach(holder, fixture, 'ceiling', () => { if (on) holder.add(own(new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 12), materials.get('emissive')).translateY(-0.06))); });
    return piece;
  }

  if (point.kind === 'light_strip' || !edge) {
    if (info.placement === 'wall' && !edge) return null;
    // An LED strip lying where it was put (under a bed, along a shelf), turned to its wall when it has one.
    const length = point.lengthM ?? 1.5;
    piece.position.set(point.position.x, point.elevationM, point.position.z);
    piece.rotation.y = edge ? edge.facing : 0;
    piece.add(own(box(length, 0.015, 0.012, on ? glow : dark)));
    return piece;
  }

  // On the wall: local +x along the wall, +z into the room; the point sits a hair off the plaster.
  const p = pointOnEdge(edge, point.t ?? 0.5);
  const inset = 0.006;
  piece.position.set(p.x + edge.inward.x * inset, point.elevationM, p.z + edge.inward.z * inset);
  piece.rotation.y = edge.facing;

  if (point.kind === 'light_furniture') {
    const length = point.lengthM ?? 1.5;
    piece.add(own(box(length, 0.02, 0.03, on ? glow : dark, [0, 0, 0.015])));
    return piece;
  }
  if (point.kind === 'light_wall') {
    const holder = new THREE.Group();
    piece.add(holder);
    holder.add(own(box(0.14, 0.18, 0.09, on ? glow : shade, [0, 0, 0.045])));
    if (fixture) attach(holder, fixture, 'wall');
    return piece;
  }
  // Sockets, switches, TV and data points: one plate per outlet, side by side.
  const single = point.kind === 'switch' || point.kind === 'tv' || point.kind === 'internet';
  const count = single ? 1 : Math.max(1, point.count ?? 1);
  for (let i = 0; i < count; i++) {
    const holder = new THREE.Group();
    holder.position.x = (i - (count - 1) / 2) * PLATE_M;
    piece.add(holder);
    holder.add(own(box(PLATE_M - 0.004, PLATE_M - 0.004, 0.01, plate, [0, 0, 0.005])));
    holder.add(own(box(point.kind === 'switch' ? 0.03 : 0.045, point.kind === 'switch' ? 0.045 : 0.03, 0.006, dark, [0, 0, 0.012])));
    if (fixture) attach(holder, fixture, 'wall');
  }
  return piece;
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
