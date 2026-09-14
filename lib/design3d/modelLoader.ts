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
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

interface CachedModel {
  object: THREE.Object3D;
  /** Extents as authored — unit-sized by the conversion script — for scaling instances. */
  size: THREE.Vector3;
}

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
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
 * A clone of a fixture model exactly as its file is framed — the fixtures script already
 * puts a wall fixture's back on z = 0 and a ceiling fixture's top on y = 0 — so nothing is
 * re-centred here.
 */
export function loadFixture(url: string): Promise<THREE.Object3D> {
  let entry = fixtureCache.get(url);
  if (!entry) {
    entry = gltfLoader.loadAsync(url).then((gltf) => {
      const object = gltf.scene;
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
          child.castShadow = true;
        }
      });
      return object;
    });
    fixtureCache.set(url, entry);
  }
  return entry.then((object) => object.clone(true));
}

const fixtureCache = new Map<string, Promise<THREE.Object3D>>();
