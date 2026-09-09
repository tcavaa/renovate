/**
 * The few geometry helpers the room shell is built from.
 *
 * Furniture is partner GLBs, not procedural meshes, so this file only needs to cover what
 * `buildScene` draws itself: skirting boards, door leaves and frames, window glazing.
 *
 * Convention matches the layout engine: local +Z is the direction a piece faces, +Y is up.
 */

import * as THREE from 'three';

/** Box centred at (x, y, z), where y is measured to the box's centre. */
export function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0]
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  segments = 12
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Tags a whole subtree so raycasting can find the item it belongs to. */
export function tag(object: THREE.Object3D, data: Record<string, unknown>): void {
  object.traverse((child) => {
    child.userData = { ...child.userData, ...data };
  });
}
