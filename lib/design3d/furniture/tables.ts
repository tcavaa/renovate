/**
 * Tables, desks and low storage.
 */

import * as THREE from 'three';
import { box, clutter, cylinder, frontPanels, legs, roundedBox, shelves, slab, sphere } from '../primitives';
import { legStyleFor, radiusFor, type BuildContext } from './context';

export function buildDiningTable(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const frame = style.id === 'industrial' ? materials.get('metal') : wood;
  const topThickness = style.id === 'industrial' ? 0.05 : 0.038;
  const legHeight = size.height - topThickness;

  group.add(
    roundedBox(size.width, topThickness, size.depth, radiusFor(style.id) * 0.5, wood, [
      0,
      legHeight,
      0,
    ])
  );

  if (style.id === 'industrial') {
    // Trestle: two A-frames joined by a stretcher.
    for (const sign of [1, -1]) {
      const x = (sign * (size.width - 0.5)) / 2;
      group.add(box(0.06, legHeight, 0.06, frame, [x, legHeight / 2, size.depth / 2 - 0.12]));
      group.add(box(0.06, legHeight, 0.06, frame, [x, legHeight / 2, -size.depth / 2 + 0.12]));
      group.add(box(0.05, 0.05, size.depth - 0.2, frame, [x, legHeight - 0.06, 0]));
    }
    group.add(box(size.width - 0.5, 0.045, 0.045, frame, [0, 0.14, 0]));
  } else {
    legs(group, size.width - 0.18, size.depth - 0.14, legHeight, frame, legStyleFor(style.id), 0.09);
    if (style.id === 'vintage') {
      group.add(box(size.width - 0.3, 0.05, 0.04, wood, [0, legHeight - 0.09, size.depth / 2 - 0.09]));
      group.add(box(size.width - 0.3, 0.05, 0.04, wood, [0, legHeight - 0.09, -size.depth / 2 + 0.09]));
    }
  }

  // A centrepiece, so an empty table does not read as a blank slab.
  group.add(cylinder(0.055, 0.07, 0.16, materials.get('ceramic'), [0, size.height + 0.08, 0], 10));
  group.add(sphere(0.09, materials.get('foliage'), [0, size.height + 0.22, 0], 8));

  return group;
}

export function buildCoffeeTable(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const glass = materials.get('glass');
  const metal = materials.get('metal');
  const topThickness = 0.035;
  const legHeight = size.height - topThickness;

  const topMaterial = style.id === 'modern' ? glass : wood;
  group.add(
    roundedBox(size.width, topThickness, size.depth, radiusFor(style.id), topMaterial, [
      0,
      legHeight,
      0,
    ])
  );

  if (style.id === 'modern') {
    // Glass on a metal frame.
    for (const sign of [1, -1]) {
      group.add(box(0.03, legHeight, size.depth - 0.1, metal, [(sign * (size.width - 0.14)) / 2, legHeight / 2, 0]));
    }
    group.add(box(size.width - 0.14, 0.028, 0.028, metal, [0, 0.06, 0]));
  } else {
    legs(group, size.width - 0.12, size.depth - 0.1, legHeight, style.id === 'industrial' ? metal : wood, legStyleFor(style.id), 0.08);
    // Lower shelf
    group.add(box(size.width - 0.2, 0.022, size.depth - 0.14, wood, [0, legHeight * 0.32, 0]));
  }

  // Books and a bowl.
  group.add(slab(0.26, 0.028, 0.2, materials.get('accent'), [-size.width * 0.22, size.height, 0.02]));
  group.add(slab(0.23, 0.024, 0.18, materials.get('textile'), [-size.width * 0.22, size.height + 0.028, -0.01]));
  group.add(cylinder(0.11, 0.08, 0.06, materials.get('ceramic'), [size.width * 0.2, size.height + 0.03, 0], 12));

  return group;
}

export function buildDesk(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const metal = materials.get('metal');
  const topThickness = 0.035;
  const legHeight = size.height - topThickness;

  group.add(roundedBox(size.width, topThickness, size.depth, 0.02, wood, [0, legHeight, 0]));

  // Drawer pedestal on one side.
  const pedestalWidth = Math.min(0.42, size.width * 0.32);
  group.add(
    slab(pedestalWidth, legHeight - 0.05, size.depth - 0.06, wood, [
      (size.width - pedestalWidth) / 2 - 0.04,
      0.05,
      0,
    ])
  );
  const pedestal = new THREE.Group();
  frontPanels(pedestal, 3, pedestalWidth, legHeight - 0.05, size.depth - 0.06, 0.05, wood, metal);
  pedestal.position.x = (size.width - pedestalWidth) / 2 - 0.04;
  group.add(pedestal);

  // Two legs on the open side.
  for (const z of [size.depth / 2 - 0.08, -size.depth / 2 + 0.08]) {
    group.add(
      style.id === 'industrial'
        ? box(0.045, legHeight, 0.045, metal, [-size.width / 2 + 0.08, legHeight / 2, z])
        : cylinder(0.02, 0.032, legHeight, wood, [-size.width / 2 + 0.08, legHeight / 2, z], 8)
    );
  }

  // Monitor + keyboard.
  const screen = materials.get('frame');
  group.add(cylinder(0.09, 0.09, 0.015, screen, [-size.width * 0.12, size.height + 0.008, -0.16], 10));
  group.add(box(0.05, 0.2, 0.04, screen, [-size.width * 0.12, size.height + 0.11, -0.16]));
  group.add(box(0.56, 0.34, 0.02, screen, [-size.width * 0.12, size.height + 0.32, -0.16]));
  group.add(box(0.36, 0.014, 0.13, materials.get('ceramic'), [-size.width * 0.12, size.height + 0.007, 0.06]));

  return group;
}

export function buildConsoleTable(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const metal = materials.get('metal');
  const topThickness = 0.032;
  const legHeight = size.height - topThickness;

  group.add(roundedBox(size.width, topThickness, size.depth, 0.02, wood, [0, legHeight, 0]));
  legs(group, size.width - 0.1, size.depth - 0.05, legHeight, style.id === 'industrial' ? metal : wood, legStyleFor(style.id), 0.06);
  group.add(box(size.width - 0.16, 0.02, size.depth - 0.08, wood, [0, legHeight * 0.28, 0]));

  // A tray for keys, and a vase.
  group.add(slab(0.24, 0.022, 0.16, materials.get('accent'), [size.width * 0.22, size.height, 0]));
  group.add(cylinder(0.045, 0.06, 0.22, materials.get('ceramic'), [-size.width * 0.24, size.height + 0.11, 0], 10));

  return group;
}

export function buildTvUnit(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const metal = materials.get('metal');
  const legHeight = style.id === 'modern' ? 0.03 : 0.14;
  const bodyHeight = size.height - legHeight;

  group.add(slab(size.width, bodyHeight, size.depth, wood, [0, legHeight, 0]));
  frontPanels(group, 3, size.width, bodyHeight, size.depth, legHeight, wood, metal, 'vertical');
  legs(group, size.width - 0.1, size.depth - 0.04, legHeight, metal, legStyleFor(style.id), 0.1);

  // The television it exists for. Facing +Z, same as the unit.
  const screenWidth = Math.min(size.width * 0.85, 1.35);
  const screenHeight = screenWidth * 0.56;
  const screen = materials.get('frame', { colorHex: '#14161A', roughness: 0.25 });
  group.add(box(0.34, 0.02, 0.2, screen, [0, size.height + 0.01, 0]));
  group.add(box(0.05, 0.14, 0.05, screen, [0, size.height + 0.08, 0]));
  group.add(box(screenWidth, screenHeight, 0.032, screen, [0, size.height + 0.15 + screenHeight / 2, 0]));

  return group;
}

export function buildShoeCabinet(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const metal = materials.get('metal');
  const legHeight = 0.09;
  const bodyHeight = size.height - legHeight;

  group.add(slab(size.width, bodyHeight, size.depth, wood, [0, legHeight, 0]));
  frontPanels(group, 3, size.width, bodyHeight, size.depth, legHeight, wood, metal);
  legs(group, size.width - 0.06, size.depth - 0.03, legHeight, metal, legStyleFor(style.id), 0.06);
  return group;
}

export function buildStorageShelf(ctx: BuildContext): THREE.Object3D {
  const { size, materials } = ctx;
  const group = new THREE.Group();
  const wood = materials.get('wood', { colorHex: ctx.colorHex });

  const shelfCount = Math.max(2, Math.floor(size.height / 0.4));
  for (const sign of [1, -1]) {
    group.add(slab(0.025, size.height, size.depth, wood, [(sign * (size.width - 0.025)) / 2, 0, 0]));
  }
  shelves(group, shelfCount, size.width, size.height, size.depth, 0, wood);
  group.add(slab(size.width, 0.025, size.depth, wood, [0, size.height - 0.025, 0]));

  const bookMaterials = [materials.get('accent'), materials.get('textile'), materials.get('frame')];
  for (let i = 1; i <= shelfCount; i++) {
    clutter(group, size.width - 0.05, size.depth, (i * size.height) / (shelfCount + 1) + 0.011, bookMaterials, ctx.seed + i);
  }
  return group;
}
