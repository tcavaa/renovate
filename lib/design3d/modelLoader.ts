/**
 * Loads partner and stock GLBs once per URL and hands out clones — shared by the furniture
 * (`buildScene`) and the electrical fixtures (`buildStructure`).
 *
 * The GLBs carry their own PBR materials — the partner's fabric, veneer or leather where the
 * archive had the maps, a base colour where it did not — so nothing is overridden here. What
 * they do not carry is normals (the source exports have `vn=0`), so those are computed on the
 * cached original rather than per instance.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACO_DECODER_PATH } from './draco';
import { registerFootprintMask } from '@/lib/design/footprintMasks';
import { footprintMaskOf } from './footprintFromModel';
import { plainGlass } from './glass';

interface CachedModel {
  object: THREE.Object3D;
  /** Extents as authored — unit-sized by the conversion script — for scaling instances. */
  size: THREE.Vector3;
}

// Geometry comes compressed one of two ways: Draco where that paid (the shipped models' larger
// pieces, uploads since the recipe writes it) and meshopt everywhere else.
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const dracoLoader = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH).setDecoderConfig({ type: 'wasm' });
// Only the 3D viewer loads this module: fetch the decoder beside the models, not after the
// first Draco one has arrived and waits for it.
if (typeof window !== 'undefined') dracoLoader.preload();
gltfLoader.setDRACOLoader(dracoLoader);
const modelCache = new Map<string, Promise<CachedModel>>();

/**
 * A clone of the model at `url`, standing on y = 0 and centred on x/z (see below), with its
 * authored size on `userData.authoredSize`. Rejects when the file cannot be loaded.
 */
export function loadModel(url: string): Promise<THREE.Object3D> {
  let entry = modelCache.get(url);
  if (!entry) {
    entry = gltfLoader.loadAsync(url).then((gltf) => {
      const object = gltf.scene;
      object.traverse((child) => {
        if (child instanceof THREE.Mesh && !child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals();
        }
      });
      // A transmissive part would make three draw the whole flat twice every frame.
      plainGlass(object);
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
      // The floor the model really covers, for the pieces that are not their whole box — a
      // corner sofa, an L-shaped desk — so that something can stand in the corner they leave
      // (`footprintMasks`). Read once per file; a model that fails here is simply its box.
      try {
        registerFootprintMask(url, footprintMaskOf(root, size));
      } catch {
        registerFootprintMask(url, null);
      }
      return { object: root, size };
    });
    remember(modelCache, url, entry);
  }
  return entry.then(({ object, size }) => {
    const clone = object.clone(true);
    clone.userData.authoredSize = size;
    return clone;
  });
}

/**
 * A clone of a fixture model exactly as its file is framed — the fixtures script already
 * puts a wall fixture's back on z = 0 and a ceiling fixture's top on y = 0 — so nothing is
 * re-centred here. A fixture casts no shadow of its own: a socket, a switch or a radiator
 * sits flat on its wall, where the sun's shadow of it cannot be seen, and would only be drawn
 * a second time in the shadow pass. What should cast one — a door, a window's frame, a
 * railing — gets it from `finishModel` in `buildScene`.
 */
export function loadFixture(url: string): Promise<THREE.Object3D> {
  let entry = fixtureCache.get(url);
  if (!entry) {
    entry = gltfLoader.loadAsync(url).then((gltf) => {
      const object = gltf.scene;
      object.traverse((child) => {
        if (child instanceof THREE.Mesh && !child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      });
      plainGlass(object);
      return object;
    });
    remember(fixtureCache, url, entry);
  }
  return entry.then((object) => object.clone(true));
}

const fixtureCache = new Map<string, Promise<THREE.Object3D>>();

/**
 * Keeps a load in its cache while it is on its way or done — and forgets it if it fails, so
 * the next placement asks again: one dropped request on a poor connection used to leave that
 * product a ghost box until the page was reloaded.
 */
function remember<T>(cache: Map<string, Promise<T>>, url: string, entry: Promise<T>): void {
  cache.set(url, entry);
  entry.catch(() => {
    if (cache.get(url) === entry) cache.delete(url);
  });
}
