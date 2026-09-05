/**
 * Lighting, soft goods and decoration.
 *
 * These are what make a rendered room look inhabited rather than like a furniture showroom,
 * and most of them are cheap — a rug is two triangles, a curtain is a folded plane.
 */

import * as THREE from 'three';
import { box, cylinder, roundedBox, slab, sphere } from '../primitives';
import type { BuildContext } from './context';

export function buildRug(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const base = materials.get('textile', { colorHex: ctx.colorHex });
  group.add(roundedBox(size.width, 0.018, size.depth, style.id === 'vintage' ? 0.02 : 0.05, base, [0, 0.002, 0]));

  // A border keeps a plain rug from reading as a painted rectangle.
  const accent = materials.get('accent');
  group.add(
    roundedBox(size.width - 0.16, 0.02, size.depth - 0.16, 0.04, accent, [0, 0.0205, 0])
  );
  group.add(
    roundedBox(size.width - 0.24, 0.022, size.depth - 0.24, 0.04, base, [0, 0.0215, 0])
  );

  if (style.id === 'vintage') {
    // Fringe at both ends.
    const fringe = materials.get('textile');
    for (let i = 0; i < 26; i++) {
      const x = -size.width / 2 + (i * size.width) / 25;
      for (const sign of [1, -1]) {
        group.add(box(0.012, 0.006, 0.06, fringe, [x, 0.006, (sign * (size.depth + 0.05)) / 2]));
      }
    }
  }

  return group;
}

export function buildFloorLamp(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const metal = materials.get('metal', { colorHex: ctx.colorHex });
  const shade = materials.get('lampshade');
  const poleHeight = size.height - 0.28;

  group.add(cylinder(size.width * 0.36, size.width * 0.4, 0.025, metal, [0, 0.012, 0], 16));

  if (style.id === 'industrial') {
    // Tripod.
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const leg = cylinder(0.012, 0.016, poleHeight, metal, [
        (Math.sin(angle) * size.width) / 5,
        poleHeight / 2,
        (Math.cos(angle) * size.width) / 5,
      ], 6);
      leg.rotation.z = -Math.sin(angle) * 0.16;
      leg.rotation.x = Math.cos(angle) * 0.16;
      group.add(leg);
    }
  } else {
    group.add(cylinder(0.016, 0.02, poleHeight, metal, [0, poleHeight / 2, 0], 8));
  }

  // Shade: a truncated cone, warm from inside.
  const shadeTop = style.id === 'modern' ? 0.15 : 0.11;
  group.add(cylinder(shadeTop, 0.19, 0.26, shade, [0, poleHeight + 0.13, 0], 16));
  group.add(sphere(0.05, materials.get('emissive'), [0, poleHeight + 0.1, 0], 8));

  return group;
}

export function buildPendant(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const metal = materials.get('metal', { colorHex: ctx.colorHex });
  const shade = materials.get('lampshade');
  const cordLength = 0.32;

  // The group's origin is at the ceiling; everything hangs below it.
  group.add(cylinder(0.05, 0.05, 0.02, metal, [0, -0.01, 0], 10));
  group.add(cylinder(0.006, 0.006, cordLength, metal, [0, -cordLength / 2, 0], 6));

  const y = -cordLength - size.height / 2;

  if (style.id === 'industrial') {
    // Enamel dome + visible bulb.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(size.width / 2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      metal
    );
    dome.rotation.x = Math.PI;
    dome.position.y = y;
    dome.castShadow = true;
    group.add(dome);
    group.add(sphere(0.055, materials.get('emissive'), [0, y - 0.09, 0], 10));
  } else if (style.id === 'vintage') {
    // Small chandelier: a ring of candle lights.
    group.add(cylinder(0.02, 0.02, 0.12, metal, [0, y + 0.06, 0], 8));
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const x = (Math.sin(angle) * size.width) / 2.4;
      const z = (Math.cos(angle) * size.width) / 2.4;
      const arm = cylinder(0.008, 0.008, size.width / 2.2, metal, [x / 2, y + 0.02, z / 2], 6);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -angle;
      group.add(arm);
      group.add(cylinder(0.018, 0.022, 0.1, shade, [x, y + 0.06, z], 8));
      group.add(sphere(0.026, materials.get('emissive'), [x, y + 0.13, z], 8));
    }
  } else {
    // Cone or dome shade.
    const top = style.id === 'modern' ? 0.04 : size.width / 3;
    group.add(cylinder(top, size.width / 2, size.height * 0.7, shade, [0, y, 0], 18));
    group.add(sphere(0.05, materials.get('emissive'), [0, y - size.height * 0.3, 0], 10));
  }

  return group;
}

export function buildPlant(ctx: BuildContext): THREE.Object3D {
  const { size, materials } = ctx;
  const group = new THREE.Group();

  const pot = materials.get('ceramic', { colorHex: ctx.colorHex });
  const soil = materials.get('frame', { colorHex: '#3B2E26' });
  const leaf = materials.get('foliage');

  const potHeight = size.height * 0.28;
  group.add(cylinder(size.width * 0.4, size.width * 0.3, potHeight, pot, [0, potHeight / 2, 0], 14));
  group.add(cylinder(size.width * 0.37, size.width * 0.37, 0.02, soil, [0, potHeight, 0], 14));

  // A few stems, each ending in a cluster of leaves. Deterministic from the item seed.
  let state = ctx.seed * 7919 + 13;
  const rand = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };

  const stems = 5;
  for (let i = 0; i < stems; i++) {
    const angle = (i / stems) * Math.PI * 2 + rand() * 0.6;
    const lean = 0.12 + rand() * 0.22;
    const stemHeight = size.height * (0.5 + rand() * 0.25);
    const stem = cylinder(0.008, 0.012, stemHeight, leaf, [0, potHeight + stemHeight / 2, 0], 5);
    stem.rotation.z = Math.sin(angle) * lean;
    stem.rotation.x = Math.cos(angle) * lean;
    group.add(stem);

    const tipX = Math.sin(angle) * lean * stemHeight;
    const tipZ = Math.cos(angle) * lean * stemHeight;
    for (let j = 0; j < 3; j++) {
      const leafMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11 + rand() * 0.05, 8, 5), leaf);
      leafMesh.scale.set(1, 0.22, 0.62);
      leafMesh.position.set(
        tipX + (rand() - 0.5) * 0.16,
        potHeight + stemHeight - 0.05 + rand() * 0.12,
        tipZ + (rand() - 0.5) * 0.16
      );
      leafMesh.rotation.y = rand() * Math.PI;
      leafMesh.rotation.z = (rand() - 0.5) * 0.5;
      leafMesh.castShadow = true;
      group.add(leafMesh);
    }
  }

  return group;
}

export function buildArtwork(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const frameMaterial = style.id === 'vintage' ? materials.get('metal') : materials.get('frame');
  const canvas = materials.get('accent', { colorHex: ctx.colorHex });
  const frameWidth = style.id === 'vintage' ? 0.06 : 0.025;

  group.add(box(size.width, size.height, 0.02, frameMaterial, [0, 0, 0]));
  group.add(
    box(size.width - frameWidth * 2, size.height - frameWidth * 2, 0.024, canvas, [0, 0, 0.004])
  );

  // A couple of blocks of colour so it is not one flat rectangle.
  const inner = materials.get('textile');
  group.add(
    box((size.width - frameWidth * 2) * 0.42, (size.height - frameWidth * 2) * 0.55, 0.026, inner, [
      -size.width * 0.14,
      -size.height * 0.1,
      0.006,
    ])
  );

  return group;
}

export function buildMirror(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const frameMaterial = style.id === 'industrial' ? materials.get('metal') : materials.get('wood');
  const glass = materials.get('mirror');

  if (style.id === 'vintage' || style.id === 'scandinavian') {
    // Round mirror.
    const radius = Math.min(size.width, size.height) / 2;
    group.add(cylinder(radius, radius, 0.03, frameMaterial, [0, 0, 0], 28));
    const ring = group.children[0];
    ring.rotation.x = Math.PI / 2;
    group.add(cylinder(radius - 0.035, radius - 0.035, 0.032, glass, [0, 0, 0.006], 28));
    const face = group.children[1];
    face.rotation.x = Math.PI / 2;
  } else {
    group.add(box(size.width, size.height, 0.03, frameMaterial, [0, 0, 0]));
    group.add(box(size.width - 0.05, size.height - 0.05, 0.034, glass, [0, 0, 0.004]));
  }

  return group;
}

export function buildCurtain(ctx: BuildContext): THREE.Object3D {
  const { size, materials } = ctx;
  const group = new THREE.Group();

  const fabric = materials.get('textile', { colorHex: ctx.colorHex });
  const rod = materials.get('metal');

  group.add(cylinder(0.015, 0.015, size.width + 0.24, rod, [0, size.height, 0], 8));
  const bar = group.children[0];
  bar.rotation.z = Math.PI / 2;
  for (const sign of [1, -1]) {
    group.add(sphere(0.028, rod, [(sign * (size.width + 0.24)) / 2, size.height, 0], 8));
  }

  // Two gathered panels, one each side, drawn back from the glass.
  const panelWidth = size.width * 0.3;
  const folds = 5;
  for (const sign of [1, -1]) {
    for (let i = 0; i < folds; i++) {
      const t = i / (folds - 1);
      const x = sign * (size.width / 2 - panelWidth * t * 0.9);
      // Alternating depth is what makes flat planes read as folded cloth.
      const z = (i % 2 === 0 ? 0.02 : -0.02) - 0.01;
      const fold = cylinder(0.035, 0.045, size.height - 0.05, fabric, [x, (size.height - 0.05) / 2, z], 6);
      group.add(fold);
    }
  }

  return group;
}
