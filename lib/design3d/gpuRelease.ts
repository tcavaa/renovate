/**
 * Lets a renderer that is going away let go of resources that outlive it.
 *
 * three's `WebGLRenderer` hangs a `dispose` listener on every geometry, material and texture
 * the first time it draws one, and takes it off only when that thing is disposed. The model
 * caches (`modelLoader.ts`) and the ghost materials (`buildScene.ts`) live for the whole page
 * and every studio view draws them, so each cached material ended up holding a listener of
 * every renderer that had ever drawn it — and through it that renderer's canvas, the canvas's
 * listeners, the old React closures and the whole old flat: about 8 000 meshes and 30 MB of
 * heap for every time the studio was opened again in the same tab.
 *
 * `dispose()` on a geometry, material or texture only tells the renderers to free their GPU
 * copies; the object itself stays whole, and the next renderer to draw it uploads it again —
 * which a new viewer (a new WebGL context) has to do anyway. So this runs as a viewer unmounts,
 * never while one is drawing (gotcha: never dispose a shared resource under a live renderer).
 */

import * as THREE from 'three';

export function releaseMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
  material.dispose();
}

/** Every geometry, material and texture under `root`, released (see above). */
export function releaseObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const drawn = child as Partial<THREE.Mesh>;
    if (drawn.geometry instanceof THREE.BufferGeometry) drawn.geometry.dispose();
    const material = drawn.material;
    if (Array.isArray(material)) material.forEach(releaseMaterial);
    else if (material instanceof THREE.Material) releaseMaterial(material);
  });
}
