/**
 * One model drawn at several places as one `InstancedMesh` per mesh of it: a radiator's
 * sections, a double socket's plates, a railing's metre modules. A clone per copy was a draw
 * call per copy per mesh (a ten-section radiator of a two-mesh model: twenty); instanced, the
 * whole run is as many draw calls as the model has meshes.
 *
 * The meshes share the model's geometry and materials (the loader's cache): only the instance
 * buffers belong to the result, and `disposeOwnedGeometry` frees them with the group they are in.
 */

import * as THREE from 'three';

const scratch = new THREE.Matrix4();

/**
 * `model` drawn at each of `placements` — matrices in the frame the model itself would stand
 * in (a holder's offset, scale and all). The model's own node transforms are kept as they
 * are: the compressed GLBs carry each node's quantisation offset and scale there (3d-engine
 * gotcha 19). The model is only read, never attached.
 */
export function instanced(model: THREE.Object3D, placements: THREE.Matrix4[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'instanced';
  if (placements.length === 0) return group;
  model.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(model.parent ? model.parent.matrixWorld : new THREE.Matrix4()).invert();
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Where the mesh stands in the model's frame, whatever the model hangs under.
    const local = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    const copies = new THREE.InstancedMesh(mesh.geometry, mesh.material, placements.length);
    copies.name = mesh.name;
    placements.forEach((placement, i) => copies.setMatrixAt(i, scratch.multiplyMatrices(placement, local)));
    copies.instanceMatrix.needsUpdate = true;
    copies.castShadow = mesh.castShadow;
    copies.receiveShadow = mesh.receiveShadow;
    copies.renderOrder = mesh.renderOrder;
    copies.visible = mesh.visible;
    copies.computeBoundingBox();
    copies.computeBoundingSphere();
    group.add(copies);
  });
  return group;
}

/** A placement `x` metres along the local x axis — the usual run of sections or plates. */
export function alongX(x: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, 0, 0);
}
