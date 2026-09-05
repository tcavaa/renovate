/**
 * Kitchen units and bathroom fittings.
 */

import * as THREE from 'three';
import { box, cylinder, frontPanels, roundedBox, slab, sphere } from '../primitives';
import type { BuildContext } from './context';

/** A run of base units with a worktop, plus wall cabinets above. */
export function buildKitchenRun(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const cabinet = materials.get('wood', { colorHex: ctx.colorHex });
  const worktop = materials.get('stone');
  const metal = materials.get('metal');
  const plinthHeight = 0.09;
  const carcassHeight = size.height - plinthHeight - 0.04;

  group.add(slab(size.width - 0.06, plinthHeight, size.depth - 0.06, materials.get('frame'), [0, 0, 0]));
  group.add(slab(size.width, carcassHeight, size.depth, cabinet, [0, plinthHeight, 0]));

  const doors = Math.max(3, Math.round(size.width / 0.6));
  frontPanels(group, doors, size.width, carcassHeight, size.depth, plinthHeight, cabinet, metal, 'vertical');

  // Worktop, slightly proud of the doors.
  group.add(slab(size.width, 0.04, size.depth + 0.02, worktop, [0, size.height - 0.04, 0.01]));

  // Sink and hob, placed a third and two thirds along the run.
  const sinkX = -size.width / 4;
  group.add(box(0.52, 0.02, 0.4, metal, [sinkX, size.height - 0.03, 0]));
  group.add(cylinder(0.016, 0.016, 0.26, metal, [sinkX, size.height + 0.11, -0.14], 8));
  const spout = cylinder(0.014, 0.014, 0.14, metal, [sinkX, size.height + 0.23, -0.08], 8);
  spout.rotation.x = Math.PI / 2;
  group.add(spout);

  const hobX = size.width / 4;
  group.add(box(0.58, 0.014, 0.46, materials.get('frame', { colorHex: '#1A1C1F' }), [hobX, size.height - 0.02, 0]));
  for (const [dx, dz] of [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.1], [0.14, 0.1]] as const) {
    group.add(cylinder(0.055, 0.055, 0.006, metal, [hobX + dx, size.height - 0.008, dz], 10));
  }

  // Wall cabinets, leaving the usual splashback gap.
  const upperY = size.height + 0.52;
  const upperHeight = 0.7;
  const upperWidth = size.width * 0.62;
  group.add(slab(upperWidth, upperHeight, 0.34, cabinet, [-size.width * 0.18, upperY, -size.depth / 2 + 0.17]));
  const uppers = new THREE.Group();
  frontPanels(uppers, Math.max(2, Math.round(upperWidth / 0.6)), upperWidth, upperHeight, 0.34, upperY, cabinet, metal, 'vertical');
  uppers.position.set(-size.width * 0.18, 0, -size.depth / 2 + 0.17);
  group.add(uppers);

  // Extractor hood over the hob.
  const hood = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.34, 0.3, 4),
    style.id === 'industrial' ? metal : materials.get('ceramic')
  );
  hood.position.set(hobX, upperY + 0.2, -size.depth / 2 + 0.22);
  hood.rotation.y = Math.PI / 4;
  hood.castShadow = true;
  group.add(hood);
  group.add(cylinder(0.09, 0.09, 0.5, metal, [hobX, upperY + 0.6, -size.depth / 2 + 0.22], 8));

  return group;
}

export function buildKitchenIsland(ctx: BuildContext): THREE.Object3D {
  const { size, materials } = ctx;
  const group = new THREE.Group();

  const cabinet = materials.get('wood', { colorHex: ctx.colorHex });
  const worktop = materials.get('stone');
  const metal = materials.get('metal');
  const plinthHeight = 0.09;
  const carcassHeight = size.height - plinthHeight - 0.05;
  const overhang = 0.3;

  group.add(slab(size.width - 0.06, plinthHeight, size.depth - 0.06, materials.get('frame'), [0, 0, 0]));
  group.add(slab(size.width, carcassHeight, size.depth - overhang, cabinet, [0, plinthHeight, -overhang / 2]));
  frontPanels(group, 3, size.width, carcassHeight, size.depth - overhang, plinthHeight, cabinet, metal, 'vertical');
  group.add(slab(size.width + 0.04, 0.05, size.depth, worktop, [0, size.height - 0.05, 0]));

  // Two bar stools tucked under the overhang.
  for (const sign of [1, -1]) {
    const stool = new THREE.Group();
    stool.add(cylinder(0.17, 0.17, 0.05, materials.get('upholstery'), [0, 0.66, 0], 12));
    stool.add(cylinder(0.03, 0.04, 0.64, metal, [0, 0.33, 0], 8));
    stool.add(cylinder(0.19, 0.19, 0.02, metal, [0, 0.01, 0], 12));
    stool.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 14), metal));
    const ring = stool.children[stool.children.length - 1];
    ring.position.y = 0.2;
    ring.rotation.x = Math.PI / 2;
    stool.position.set((sign * size.width) / 4, 0, size.depth / 2 + 0.12);
    group.add(stool);
  }

  return group;
}

export function buildFridge(ctx: BuildContext): THREE.Object3D {
  const { size, materials } = ctx;
  const group = new THREE.Group();

  const body = materials.get('metal', { colorHex: ctx.colorHex ?? '#C9CDD2', roughness: 0.34 });
  const seam = materials.get('frame');

  group.add(roundedBox(size.width, size.height, size.depth, 0.03, body, [0, 0, 0]));
  // Freezer/fridge split at a third.
  group.add(box(size.width + 0.004, 0.012, size.depth + 0.004, seam, [0, size.height * 0.34, 0]));
  for (const y of [size.height * 0.34 + 0.28, size.height * 0.34 - 0.28]) {
    const handle = cylinder(0.014, 0.014, 0.34, seam, [size.width / 2 - 0.09, y, size.depth / 2 + 0.02], 8);
    group.add(handle);
  }

  return group;
}

export function buildToilet(ctx: BuildContext): THREE.Object3D {
  const { size, materials } = ctx;
  const group = new THREE.Group();
  const ceramic = materials.get('ceramic');

  // Cistern against the wall (-Z), pan projecting forward.
  group.add(slab(size.width, 0.52, 0.16, ceramic, [0, 0.3, -size.depth / 2 + 0.08]));
  group.add(slab(size.width * 0.55, 0.3, size.depth * 0.55, ceramic, [0, 0, -size.depth / 2 + 0.24]));
  group.add(
    roundedBox(size.width, 0.14, size.depth * 0.72, 0.1, ceramic, [0, 0.3, size.depth * 0.1])
  );
  group.add(
    roundedBox(size.width - 0.02, 0.03, size.depth * 0.7, 0.1, materials.get('frame'), [
      0,
      0.44,
      size.depth * 0.1,
    ])
  );
  group.add(box(0.08, 0.02, 0.05, materials.get('metal'), [0, 0.83, -size.depth / 2 + 0.08]));
  return group;
}

export function buildSink(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const ceramic = materials.get('ceramic');
  const metal = materials.get('metal');
  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const vanityHeight = size.height - 0.16;

  if (style.id === 'modern' || style.id === 'scandinavian') {
    // Vanity unit with a basin on top.
    group.add(slab(size.width, vanityHeight, size.depth, wood, [0, 0.04, 0]));
    frontPanels(group, 2, size.width, vanityHeight, size.depth, 0.04, wood, metal, 'vertical');
    group.add(slab(size.width + 0.02, 0.04, size.depth + 0.01, materials.get('stone'), [0, size.height - 0.2, 0]));
    group.add(roundedBox(size.width * 0.62, 0.14, size.depth * 0.66, 0.05, ceramic, [0, size.height - 0.16, 0]));
  } else {
    // Pedestal basin.
    group.add(cylinder(0.11, 0.16, vanityHeight, ceramic, [0, vanityHeight / 2, 0], 12));
    group.add(roundedBox(size.width, 0.18, size.depth, 0.07, ceramic, [0, vanityHeight, 0]));
  }

  group.add(cylinder(0.016, 0.016, 0.2, metal, [0, size.height + 0.08, -size.depth / 2 + 0.08], 8));
  const spout = cylinder(0.013, 0.013, 0.13, metal, [0, size.height + 0.18, -size.depth / 2 + 0.14], 8);
  spout.rotation.x = Math.PI / 2;
  group.add(spout);

  return group;
}

export function buildShower(ctx: BuildContext): THREE.Object3D {
  const { size, materials } = ctx;
  const group = new THREE.Group();

  const glass = materials.get('glass');
  const metal = materials.get('metal');
  const tray = materials.get('ceramic');

  group.add(slab(size.width, 0.09, size.depth, tray, [0, 0, 0]));

  // Two glass panels on the open corner, framed.
  const panelHeight = size.height - 0.12;
  group.add(box(size.width, panelHeight, 0.012, glass, [0, 0.09 + panelHeight / 2, size.depth / 2]));
  group.add(box(0.012, panelHeight, size.depth, glass, [size.width / 2, 0.09 + panelHeight / 2, 0]));
  for (const [x, z] of [[size.width / 2, size.depth / 2], [-size.width / 2, size.depth / 2], [size.width / 2, -size.depth / 2]] as const) {
    group.add(cylinder(0.016, 0.016, panelHeight, metal, [x, 0.09 + panelHeight / 2, z], 6));
  }

  // Rain head on the wall side.
  group.add(cylinder(0.015, 0.015, 0.36, metal, [0, size.height - 0.3, -size.depth / 2 + 0.05], 8));
  const arm = cylinder(0.013, 0.013, 0.22, metal, [0, size.height - 0.12, -size.depth / 2 + 0.16], 8);
  arm.rotation.x = Math.PI / 2;
  group.add(arm);
  group.add(cylinder(0.11, 0.11, 0.025, metal, [0, size.height - 0.14, -size.depth / 2 + 0.27], 12));

  return group;
}

export function buildBathtub(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const ceramic = materials.get('ceramic');
  const metal = materials.get('metal');
  const water = materials.get('glass');

  if (style.id === 'vintage') {
    // Freestanding, on feet.
    group.add(roundedBox(size.width, size.height - 0.1, size.depth, 0.22, ceramic, [0, 0.1, 0]));
    for (const [x, z] of [[0.6, 0.24], [-0.6, 0.24], [0.6, -0.24], [-0.6, -0.24]] as const) {
      group.add(cylinder(0.035, 0.05, 0.1, metal, [(x * size.width) / 1.7, 0.05, (z * size.depth) / 0.75], 8));
    }
  } else {
    group.add(roundedBox(size.width, size.height, size.depth, 0.06, ceramic, [0, 0, 0]));
  }

  // Hollow it out visually with an inner water surface.
  group.add(
    roundedBox(size.width - 0.14, 0.02, size.depth - 0.14, 0.14, water, [0, size.height - 0.09, 0])
  );
  group.add(cylinder(0.014, 0.014, 0.18, metal, [-size.width / 2 + 0.14, size.height + 0.09, 0], 8));

  return group;
}

export function buildWasher(ctx: BuildContext): THREE.Object3D {
  const { size, materials } = ctx;
  const group = new THREE.Group();

  const body = materials.get('ceramic');
  const metal = materials.get('metal');
  const glass = materials.get('glass');

  group.add(roundedBox(size.width, size.height, size.depth, 0.02, body, [0, 0, 0]));
  group.add(cylinder(0.16, 0.16, 0.04, metal, [0, size.height * 0.48, size.depth / 2], 16));
  const door = group.children[group.children.length - 1];
  door.rotation.x = Math.PI / 2;
  group.add(cylinder(0.13, 0.13, 0.02, glass, [0, size.height * 0.48, size.depth / 2 + 0.015], 16));
  const window = group.children[group.children.length - 1];
  window.rotation.x = Math.PI / 2;
  group.add(box(size.width - 0.08, 0.07, 0.015, metal, [0, size.height - 0.08, size.depth / 2 + 0.008]));
  group.add(sphere(0.022, metal, [size.width / 2 - 0.08, size.height - 0.08, size.depth / 2 + 0.02], 8));

  return group;
}
