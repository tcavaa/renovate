/**
 * The arrows on a selected wall decor piece (the owner's notes of 29 Oct 2026): one at each side,
 * one on top and one at the bottom, standing just in front of the piece, and a frame round it.
 * Dragged, an arrow resizes the piece along its wall or up it (`dragDecorHandle` in
 * lib/design/decor/resize.ts); the viewer moves the arrows and the frame with the pointer and the
 * store takes the new size on release.
 *
 * Drawn last and without depth testing, like the selection outline, so the piece never hides them.
 * One group for the viewer's lifetime: shown, placed and hidden, never rebuilt.
 */

import * as THREE from 'three';
import type { DecorHandle, DecorExtent } from '@/lib/design/decor/resize';
import type { PlanEdge } from '@/lib/design/planGeometry';

const HANDLES: DecorHandle[] = ['left', 'right', 'top', 'bottom'];
const ARROW_COLOR = 0xb5462b;
/** How far in front of the piece's face the arrows stand. */
const IN_FRONT_M = 0.04;
const UP = new THREE.Vector3(0, 1, 0);

/** The arrows and the frame, hidden until a piece is placed. */
export function makeDecorHandles(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'decor-handles';
  group.visible = false;
  const material = new THREE.MeshBasicMaterial({ color: ARROW_COLOR, depthTest: false, transparent: true, opacity: 0.95 });
  const ring = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 });
  for (const handle of HANDLES) {
    const arrow = new THREE.Group();
    arrow.name = `decor-handle-${handle}`;
    // A white disc to grab, and the terracotta head pointing the way the piece grows.
    const disc = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10), ring);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 16), material);
    head.position.y = 0.07;
    for (const mesh of [disc, head]) {
      mesh.renderOrder = 1000;
      mesh.userData.ownsGeometry = true;
    }
    arrow.add(disc, head);
    group.add(arrow);
  }
  const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: ARROW_COLOR, depthTest: false, transparent: true, opacity: 0.9 }));
  frame.name = 'decor-handle-frame';
  frame.renderOrder = 999;
  frame.userData.ownsGeometry = true;
  group.add(frame);
  return group;
}

/**
 * Puts the arrows on a piece: `extent` on its wall (`edge`), `depth` how far its face stands off
 * the wall. Each arrow is tagged as a decor handle of the piece, so the viewer can grab it.
 */
export function placeDecorHandles(group: THREE.Group, piece: { id: string; roomId: string }, edge: PlanEdge, extent: DecorExtent, depth: number): void {
  const out = depth + IN_FRONT_M;
  const at = (along: number, up: number) => new THREE.Vector3(edge.a.x + edge.dir.x * along + edge.inward.x * out, up, edge.a.z + edge.dir.z * along + edge.inward.z * out);
  const { span, height } = extent;
  const middle = (span.from + span.to) / 2;
  const level = (height.from + height.to) / 2;
  const dir = new THREE.Vector3(edge.dir.x, 0, edge.dir.z);
  const spots: Record<DecorHandle, { position: THREE.Vector3; facing: THREE.Vector3 }> = {
    left: { position: at(span.from, level), facing: dir.clone().negate() },
    right: { position: at(span.to, level), facing: dir.clone() },
    top: { position: at(middle, height.to), facing: UP.clone() },
    bottom: { position: at(middle, height.from), facing: UP.clone().negate() },
  };
  for (const handle of HANDLES) {
    const arrow = group.getObjectByName(`decor-handle-${handle}`);
    if (!arrow) continue;
    arrow.position.copy(spots[handle].position);
    arrow.quaternion.setFromUnitVectors(UP, spots[handle].facing);
    arrow.traverse((child) => {
      child.userData = { ...child.userData, pickKind: 'decor-handle', decorId: piece.id, roomId: piece.roomId, handle };
    });
  }
  const frame = group.getObjectByName('decor-handle-frame') as THREE.LineLoop | undefined;
  if (frame) {
    const corners = [at(span.from, height.from), at(span.to, height.from), at(span.to, height.to), at(span.from, height.to)];
    frame.geometry.setFromPoints(corners);
    frame.geometry.computeBoundingSphere();
  }
  group.visible = true;
}

/** How big an arrow is drawn per metre the camera is from it: about 16 px across in the studio's view. */
const SCREEN_SCALE_PER_M = 0.35;

/** Each arrow scaled to its distance from the camera, so it stays the same size on screen (never smaller than its own). */
export function scaleDecorHandles(group: THREE.Group, camera: THREE.Vector3): void {
  for (const handle of HANDLES) {
    const arrow = group.getObjectByName(`decor-handle-${handle}`);
    if (arrow) arrow.scale.setScalar(Math.max(1, arrow.position.distanceTo(camera) * SCREEN_SCALE_PER_M));
  }
}

/** Hides the arrows; whether they were showing (a frame is then worth drawing). */
export function hideDecorHandles(group: THREE.Group): boolean {
  if (!group.visible) return false;
  group.visible = false;
  return true;
}

/** How far a built piece's face stands off its wall: the farthest of its corners along the wall's inward normal. */
export function decorDepth(built: THREE.Object3D | undefined, edge: PlanEdge): number {
  if (!built) return 0.05;
  const box = new THREE.Box3().setFromObject(built);
  if (box.isEmpty()) return 0.05;
  let depth = 0;
  for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) depth = Math.max(depth, (x - edge.a.x) * edge.inward.x + (z - edge.a.z) * edge.inward.z);
  return Math.min(Math.max(depth, 0.01), 0.6);
}
