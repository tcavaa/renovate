/**
 * Glass drawn as plain transparency instead of three's physical "transmission".
 *
 * A glTF material with `KHR_materials_transmission` (a clock's cover glass, a chandelier's
 * crystals, a lamp's globe) makes three render every opaque object in the flat a second time
 * into a full-size target, every frame, whenever one such part is on screen — measured at
 * about half of the studio's GPU frame (docs/design-studio/3d-engine.md, "Performance"). Seen
 * across a room, what transmission adds — the slight bend and blur of what is behind the
 * glass — does not show, so the glass is turned into ordinary see-through glass on the cached
 * original as it loads, and every clone inherits it.
 *
 * No runtime import of three: the catalogue's turntable loads three on demand and uses this too.
 */

import type { Material, Mesh, Object3D } from 'three';

/** What is left of a fully transmissive part: this much of it covers what is behind. */
const CLEAR_GLASS_OPACITY = 0.3;

interface TransmissiveMaterial extends Material {
  transmission: number;
}

function isTransmissive(material: Material): material is TransmissiveMaterial {
  return typeof (material as Partial<TransmissiveMaterial>).transmission === 'number' && (material as TransmissiveMaterial).transmission > 0;
}

/**
 * Turns every transmissive material under `root` into plain transparency, in place: the more
 * a part let through, the clearer it stays. Returns how many materials it changed. Shared
 * materials are changed once.
 */
export function plainGlass(root: Object3D): number {
  const done = new Set<Material>();
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (done.has(material) || !isTransmissive(material)) continue;
      done.add(material);
      const through = Math.min(1, material.transmission);
      material.transmission = 0;
      material.transparent = true;
      material.opacity = Math.min(material.opacity, 1 - through * (1 - CLEAR_GLASS_OPACITY));
      // Glass must not hide what stands behind it in the depth buffer.
      material.depthWrite = false;
      material.needsUpdate = true;
    }
  });
  return done.size;
}
