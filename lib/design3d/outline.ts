import * as THREE from 'three';
import type { PlacedItem } from '@/lib/design/types';

/**
 * Selection and hover outlines for the studio.
 *
 * Shown as a wireframe box rather than by tinting the item's material: materials are shared
 * between every item that uses the same colour and finish, so highlighting through them would
 * light up *both* nightstands when you hovered one.
 */

/** A unit wireframe box, scaled and moved to whatever needs highlighting. */
export function makeOutline(): THREE.LineSegments {
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const material = new THREE.LineBasicMaterial({
    color: 0xe85d26,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const line = new THREE.LineSegments(geometry, material);
  line.visible = false;
  // Drawn last and without depth testing, so the outline is never hidden by the item itself.
  line.renderOrder = 999;
  return line;
}

export function applyOutline(
  line: THREE.LineSegments,
  item: PlacedItem | null | undefined,
  color: number
): void {
  if (!item) {
    line.visible = false;
    return;
  }
  const pad = 0.03;
  line.visible = true;
  line.position.set(item.position.x, item.elevationM + item.size.height / 2, item.position.z);
  line.rotation.y = item.rotation;
  line.scale.set(item.size.width + pad, item.size.height + pad, item.size.depth + pad);
  (line.material as THREE.LineBasicMaterial).color.setHex(color);
}

export function disposeOutline(line: THREE.LineSegments): void {
  line.geometry.dispose();
  (line.material as THREE.Material).dispose();
}
