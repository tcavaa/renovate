/**
 * The arrows on a selected shower (the owner, 14 Nov 2026): one on each side of its tray that is
 * off a wall, one at its front and one on top of its glass, with a frame round the enclosure.
 * Dragged, an arrow resizes the tray or the glass (`dragShowerHandle` / `resizedShower` in
 * lib/design/shower.ts); the viewer moves the arrows and the frame with the pointer and the store
 * takes the new size on release — the same sizes the piece's card has as fields.
 *
 * Drawn last and without depth testing, like a decor piece's arrows (`decorHandles`). One group
 * for the viewer's lifetime: shown, placed and hidden, never rebuilt.
 */

import * as THREE from 'three';
import { showerHandleSpots, type ShowerHandle } from '@/lib/design/shower';
import type { PlacedItem, PlanRoom } from '@/lib/design/types';
import { HANDLE_COLOR, HANDLE_SCREEN_SCALE_PER_M, makeHandleArrow } from './decorHandles';

const HANDLES: ShowerHandle[] = ['left', 'right', 'front', 'top'];
/** How far outside the tray's edge (and over the glass's top) an arrow stands, clear of the glass. */
const OUTSIDE_M = 0.06;
const UP = new THREE.Vector3(0, 1, 0);

/** The arrows and the frame, hidden until a shower is selected. */
export function makeShowerHandles(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shower-handles';
  group.visible = false;
  const material = new THREE.MeshBasicMaterial({ color: HANDLE_COLOR, depthTest: false, transparent: true, opacity: 0.95 });
  const ring = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 });
  for (const handle of HANDLES) group.add(makeHandleArrow(`shower-handle-${handle}`, material, ring));
  const frame = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: HANDLE_COLOR, depthTest: false, transparent: true, opacity: 0.9 }));
  frame.name = 'shower-handle-frame';
  frame.renderOrder = 999;
  // Never picked: a line answers the pointer a long way round it and would take the arrows' press.
  frame.raycast = () => {};
  frame.userData.ownsGeometry = true;
  group.add(frame);
  return group;
}

/** Puts the arrows and the frame on a shower as it is (or as a drag would make it); false when it has no area. */
export function placeShowerHandles(group: THREE.Group, item: PlacedItem, room: Pick<PlanRoom, 'polygon'>): boolean {
  const found = showerHandleSpots(item, room);
  if (!found) return false;
  for (const handle of HANDLES) {
    const arrow = group.getObjectByName(`shower-handle-${handle}`);
    if (!arrow) continue;
    const spot = found.spots.find((s) => s.handle === handle);
    arrow.visible = !!spot;
    if (!spot) continue;
    const facing = spot.facing ? new THREE.Vector3(spot.facing.x, 0, spot.facing.z) : UP.clone();
    arrow.position.set(spot.at.x, spot.y, spot.at.z).addScaledVector(facing, OUTSIDE_M);
    arrow.quaternion.setFromUnitVectors(UP, facing);
    arrow.traverse((child) => {
      child.userData = { ...child.userData, pickKind: 'shower-handle', itemId: item.id, roomId: item.roomId, showerHandle: handle };
    });
  }
  const frame = group.getObjectByName('shower-handle-frame') as THREE.LineSegments | undefined;
  if (frame) {
    const low = found.ring.map((p) => new THREE.Vector3(p.x, 0.03, p.z));
    const high = found.ring.map((p) => new THREE.Vector3(p.x, found.heightM, p.z));
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) points.push(low[i], low[(i + 1) % 4], high[i], high[(i + 1) % 4], low[i], high[i]);
    frame.geometry.setFromPoints(points);
    frame.geometry.computeBoundingSphere();
  }
  group.visible = true;
  return true;
}

/** Each arrow scaled to its distance from the camera, so it stays the same size on screen. */
export function scaleShowerHandles(group: THREE.Group, camera: THREE.Vector3): void {
  for (const handle of HANDLES) {
    const arrow = group.getObjectByName(`shower-handle-${handle}`);
    if (arrow) arrow.scale.setScalar(Math.max(1, arrow.position.distanceTo(camera) * HANDLE_SCREEN_SCALE_PER_M));
  }
}

/** Hides the arrows; whether they were showing (a frame is then worth drawing). */
export function hideShowerHandles(group: THREE.Group): boolean {
  if (!group.visible) return false;
  group.visible = false;
  return true;
}
