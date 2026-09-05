/**
 * Small geometry helpers shared by every furniture builder.
 *
 * The whole furniture library is built from boxes, cylinders and lathes. That is a deliberate
 * constraint: it keeps each piece at a few hundred triangles so a fully furnished flat stays
 * interactive on a laptop, it needs no asset pipeline, and it recolours instantly when the
 * user swaps a product or a style.
 *
 * Convention matches the layout engine: local +Z is the direction a piece faces, +Y is up,
 * and every builder returns a group whose origin is the centre of its footprint at floor level.
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

/** Box resting *on* y — convenient when you know the height off the floor, not the centre. */
export function slab(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0]
): THREE.Mesh {
  return box(width, height, depth, material, [
    position[0],
    position[1] + height / 2,
    position[2],
  ]);
}

/**
 * A box with its vertical edges softened.
 *
 * Real upholstery has no sharp corners, and the difference between a hard box and a slightly
 * rounded one is most of what makes a procedural sofa read as a sofa. Built by extruding a
 * rounded rectangle rather than by subdivision, so it stays cheap.
 *
 * Like `slab`, the result **rests on** the given y rather than being centred on it.
 */
export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0]
): THREE.Mesh {
  const r = Math.min(radius, width / 2 - 0.001, depth / 2 - 0.001);
  const shape = new THREE.Shape();
  const w = width / 2;
  const d = depth / 2;

  shape.moveTo(-w + r, -d);
  shape.lineTo(w - r, -d);
  shape.quadraticCurveTo(w, -d, w, -d + r);
  shape.lineTo(w, d - r);
  shape.quadraticCurveTo(w, d, w - r, d);
  shape.lineTo(-w + r, d);
  shape.quadraticCurveTo(-w, d, -w, d - r);
  shape.lineTo(-w, -d + r);
  shape.quadraticCurveTo(-w, -d, -w + r, -d);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: Math.min(0.012, height / 4),
    bevelSize: Math.min(0.012, r / 2),
    bevelSegments: 2,
    curveSegments: 4,
  });
  // Extrude builds along +Z; stand it up so the extrusion becomes height.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, 0);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A soft slab — cushions, mattresses, seat pads. */
export function cushion(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0]
): THREE.Mesh {
  return roundedBox(width, height, depth, Math.min(0.07, height * 0.8), material, position);
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

export function sphere(
  radius: number,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  segments = 12
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, segments / 2),
    material
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export type LegStyle = 'square' | 'round' | 'tapered' | 'splayed' | 'plinth' | 'hairpin';

/**
 * Four legs under a piece of furniture, in whichever style the room calls for.
 *
 * Leg style is one of the strongest style cues there is — splayed tapered legs read
 * Scandinavian, black hairpins read industrial, a solid plinth reads modern — so every
 * builder takes it as a parameter rather than hard-coding one look.
 */
export function legs(
  group: THREE.Object3D,
  width: number,
  depth: number,
  height: number,
  material: THREE.Material,
  style: LegStyle = 'square',
  inset = 0.06
): void {
  if (style === 'plinth') {
    group.add(slab(width - inset * 2, height, depth - inset * 2, material, [0, 0, 0]));
    return;
  }

  const x = width / 2 - inset;
  const z = depth / 2 - inset;
  const corners: Array<[number, number]> = [
    [x, z],
    [-x, z],
    [x, -z],
    [-x, -z],
  ];

  for (const [cx, cz] of corners) {
    if (style === 'square') {
      group.add(slab(0.055, height, 0.055, material, [cx, 0, cz]));
    } else if (style === 'round') {
      group.add(cylinder(0.028, 0.028, height, material, [cx, height / 2, cz], 8));
    } else if (style === 'tapered') {
      group.add(cylinder(0.018, 0.032, height, material, [cx, height / 2, cz], 8));
    } else if (style === 'splayed') {
      const leg = cylinder(0.017, 0.03, height, material, [cx, height / 2, cz], 8);
      // Lean each leg outward from the centre.
      leg.rotation.z = cx > 0 ? -0.14 : 0.14;
      leg.rotation.x = cz > 0 ? 0.14 : -0.14;
      group.add(leg);
    } else if (style === 'hairpin') {
      const leg = cylinder(0.008, 0.008, height, material, [cx, height / 2, cz], 6);
      leg.rotation.z = cx > 0 ? -0.06 : 0.06;
      group.add(leg);
      const brace = cylinder(0.008, 0.008, height * 0.98, material, [
        cx + (cx > 0 ? -0.04 : 0.04),
        height / 2,
        cz,
      ], 6);
      brace.rotation.z = cx > 0 ? 0.09 : -0.09;
      group.add(brace);
    }
  }
}

/** Evenly spaced drawer or door fronts across the face of a carcass. */
export function frontPanels(
  group: THREE.Object3D,
  count: number,
  width: number,
  height: number,
  depth: number,
  yBase: number,
  material: THREE.Material,
  handleMaterial?: THREE.Material,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): void {
  const gap = 0.012;

  for (let i = 0; i < count; i++) {
    if (orientation === 'horizontal') {
      const panelHeight = height / count - gap;
      const y = yBase + (i + 0.5) * (height / count);
      group.add(box(width - gap * 2, panelHeight, 0.018, material, [0, y, depth / 2 + 0.009]));
      if (handleMaterial) {
        group.add(
          cylinder(0.008, 0.008, Math.min(0.22, width * 0.4), handleMaterial, [
            0,
            y,
            depth / 2 + 0.03,
          ], 6)
        );
        const handle = group.children[group.children.length - 1] as THREE.Mesh;
        handle.rotation.z = Math.PI / 2;
      }
    } else {
      const panelWidth = width / count - gap;
      const x = -width / 2 + (i + 0.5) * (width / count);
      group.add(
        box(panelWidth, height - gap * 2, 0.018, material, [x, yBase + height / 2, depth / 2 + 0.009])
      );
      if (handleMaterial) {
        const handle = cylinder(0.008, 0.008, Math.min(0.3, height * 0.35), handleMaterial, [
          x + (i % 2 === 0 ? panelWidth / 2 - 0.05 : -panelWidth / 2 + 0.05),
          yBase + height * 0.55,
          depth / 2 + 0.03,
        ], 6);
        group.add(handle);
      }
    }
  }
}

/** Open shelves inside a carcass. */
export function shelves(
  group: THREE.Object3D,
  count: number,
  width: number,
  height: number,
  depth: number,
  yBase: number,
  material: THREE.Material
): void {
  for (let i = 1; i <= count; i++) {
    const y = yBase + (i * height) / (count + 1);
    group.add(box(width - 0.04, 0.022, depth - 0.03, material, [0, y, 0]));
  }
}

/** Books and bits, so open shelving does not read as empty. */
export function clutter(
  group: THREE.Object3D,
  width: number,
  depth: number,
  y: number,
  materials: THREE.Material[],
  seed: number
): void {
  // Deterministic pseudo-random so a re-render never reshuffles the shelf.
  let state = seed * 9301 + 49297;
  const rand = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };

  let x = -width / 2 + 0.06;
  while (x < width / 2 - 0.08) {
    const bookWidth = 0.022 + rand() * 0.03;
    const bookHeight = 0.16 + rand() * 0.1;
    const material = materials[Math.floor(rand() * materials.length)];
    group.add(slab(bookWidth, bookHeight, depth * 0.62, material, [x, y, 0]));
    x += bookWidth + 0.004;
    if (rand() > 0.86) x += 0.05; // a gap where a book is missing
  }
}

/** Tags a whole subtree so raycasting can find the item it belongs to. */
export function tag(object: THREE.Object3D, data: Record<string, unknown>): void {
  object.traverse((child) => {
    child.userData = { ...child.userData, ...data };
  });
}
