import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { footprintMaskOf } from '@/lib/design3d/footprintFromModel';
import { clearFootprintMasks, registerFootprintMask, type MaskRect } from '@/lib/design/footprintMasks';
import { isPlacementValid } from '@/lib/design/manipulate';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { PlacedItem, PlanRoom, SceneProduct } from '@/lib/design/types';

/**
 * The whole chain on the files the studio really places: a model off the disk, the floor it
 * covers read off its triangles, and the layout rules asked whether a table may stand in the
 * corner an L-shaped sofa leaves empty. (Kenney's models carry no textures, so three's own
 * loader reads them in node as it does in the browser.)
 */

const CORNER_SOFA = '/models/stock/kk-loungeSofaCorner.glb';
const STRAIGHT_SOFA = '/models/stock/kk-loungeSofa.glb';

/** A model as `loadModel` leaves it: standing on y = 0, centred on x/z, with its size. */
async function load(url: string): Promise<{ root: THREE.Object3D; size: THREE.Vector3 }> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const file = readFileSync(`public${url}`);
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => loader.parse(bytes, '', resolve, reject));
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  pivot.add(gltf.scene);
  pivot.position.set(-centre.x, -box.min.y, -centre.z);
  const root = new THREE.Group();
  root.add(pivot);
  return { root, size };
}

const room: PlanRoom = refreshRoom({
  id: 'r1',
  type: 'living_room',
  name: 'living',
  polygon: [
    { x: 0, z: 0 },
    { x: 6, z: 0 },
    { x: 6, z: 5 },
    { x: 0, z: 5 },
  ],
  heightM: 2.8,
  areaM2: 0,
  perimeterM: 0,
  openings: [],
});

const product = (url: string): SceneProduct => ({ productId: 1, nameKa: 'p', slug: 'p', brand: null, pricePerUnit: 1, unit: 'piece', qty: 1, totalPrice: 1, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: url, categorySlug: 'sofas', store: null });

const piece = (id: string, kind: string, x: number, z: number, width: number, depth: number, url: string | null): PlacedItem => ({
  id,
  roomId: 'r1',
  slot: kind === 'coffee_table' ? 'coffee_table' : 'sofa',
  kind,
  position: { x, z },
  elevationM: 0,
  rotation: 0,
  size: { width, depth, height: 0.8 },
  product: url ? product(url) : null,
});

/** The share of the box a mask covers. */
const covered = (mask: MaskRect[]) => mask.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.z1 - r.z0), 0);

describe('the floor a real model covers', () => {
  let corner: MaskRect[] | null = null;
  let straight: MaskRect[] | null = null;

  beforeAll(async () => {
    const a = await load(CORNER_SOFA);
    corner = footprintMaskOf(a.root, a.size);
    const b = await load(STRAIGHT_SOFA);
    straight = footprintMaskOf(b.root, b.size);
  });
  afterAll(() => clearFootprintMasks());

  it('reads an L off a corner sofa and nothing off a straight one', () => {
    expect(straight).toBeNull();
    expect(corner).not.toBeNull();
    // An L: well over half of its box, well short of all of it.
    expect(covered(corner!)).toBeGreaterThan(0.5);
    expect(covered(corner!)).toBeLessThan(0.9);
  });

  it('lets a table stand in the corner the sofa leaves empty, and nowhere on the sofa', () => {
    registerFootprintMask(CORNER_SOFA, corner);
    const sofa = piece('sofa', 'sofa_corner', 3, 2.5, 2.7, 2.7, CORNER_SOFA);
    // The quarter of the box with the least of the sofa in it is the empty corner.
    const share = (qx: number, qz: number) =>
      corner!.reduce((sum, r) => sum + Math.max(0, Math.min(r.x1, qx + 0.5) - Math.max(r.x0, qx)) * Math.max(0, Math.min(r.z1, qz + 0.5) - Math.max(r.z0, qz)), 0);
    const quarters = [0, 0.5].flatMap((qx) => [0, 0.5].map((qz) => ({ qx, qz, share: share(qx, qz) }))).sort((p, q) => p.share - q.share);
    const empty = quarters[0];
    const full = quarters[quarters.length - 1];
    expect(empty.share).toBeLessThan(0.05);
    expect(full.share).toBeGreaterThan(0.2);

    const at = (q: { qx: number; qz: number }) => ({ x: sofa.position.x + (q.qx + 0.25 - 0.5) * 2.7, z: sofa.position.z + (q.qz + 0.25 - 0.5) * 2.7 });
    const inCorner = piece('table', 'coffee_table', at(empty).x, at(empty).z, 0.8, 0.8, null);
    const onSeat = piece('table', 'coffee_table', at(full).x, at(full).z, 0.8, 0.8, null);
    expect(isPlacementValid(room, inCorner, [sofa])).toBe(true);
    expect(isPlacementValid(room, onSeat, [sofa])).toBe(false);

    // Without the mask the sofa is its whole box again, and the corner is taken.
    clearFootprintMasks();
    expect(isPlacementValid(room, inCorner, [sofa])).toBe(false);
  });
});
