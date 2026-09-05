/**
 * Beds and bedroom storage.
 *
 * Local +Z is the foot of the bed: the headboard sits at -Z, against the wall.
 */

import * as THREE from 'three';
import { box, clutter, cushion, cylinder, frontPanels, legs, roundedBox, shelves, slab } from '../primitives';
import { legStyleFor, radiusFor, type BuildContext } from './context';

export function buildBed(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const frame = materials.get('frame');
  const linen = materials.get('textile');
  const accent = materials.get('accent');
  const radius = radiusFor(style.id);

  const legHeight = style.id === 'modern' ? 0.08 : 0.16;
  const baseHeight = 0.24;
  const mattressHeight = 0.26;
  const mattressY = legHeight + baseHeight;

  // Base
  group.add(slab(size.width, baseHeight, size.depth, wood, [0, legHeight, 0]));

  // Mattress
  group.add(
    roundedBox(size.width - 0.05, mattressHeight, size.depth - 0.05, 0.05, linen, [
      0,
      mattressY,
      0,
    ])
  );

  // Duvet: covers the lower two thirds, sitting slightly proud of the mattress.
  const duvetDepth = size.depth * 0.66;
  group.add(
    roundedBox(size.width + 0.04, 0.1, duvetDepth, 0.06, linen, [
      0,
      mattressY + mattressHeight - 0.02,
      size.depth / 2 - duvetDepth / 2,
    ])
  );

  // Pillows
  const pillowCount = size.width > 1.2 ? 2 : 1;
  const pillowWidth = Math.min(0.62, (size.width - 0.12) / pillowCount);
  for (let i = 0; i < pillowCount; i++) {
    const x =
      pillowCount === 1 ? 0 : -((pillowCount - 1) * (pillowWidth + 0.05)) / 2 + i * (pillowWidth + 0.05);
    const pillow = cushion(pillowWidth, 0.13, 0.36, linen, [
      x,
      mattressY + mattressHeight - 0.01,
      -size.depth / 2 + 0.3,
    ]);
    pillow.rotation.x = -0.18;
    group.add(pillow);
  }

  // A folded throw across the foot — small detail, big difference to how "made" the bed looks.
  group.add(
    roundedBox(size.width + 0.06, 0.07, 0.42, 0.04, accent, [
      0,
      mattressY + mattressHeight,
      size.depth / 2 - 0.34,
    ])
  );

  // Headboard
  const headboardHeight = size.height - mattressY - mattressHeight + 0.18;
  if (style.id === 'industrial') {
    // Slim metal frame with vertical bars.
    const barMaterial = materials.get('metal');
    for (let i = 0; i <= 6; i++) {
      const x = -size.width / 2 + (i * size.width) / 6;
      group.add(cylinder(0.014, 0.014, headboardHeight, barMaterial, [
        x,
        mattressY + headboardHeight / 2,
        -size.depth / 2 + 0.03,
      ], 6));
    }
    group.add(
      box(size.width, 0.035, 0.05, barMaterial, [
        0,
        mattressY + headboardHeight,
        -size.depth / 2 + 0.03,
      ])
    );
  } else if (style.id === 'vintage') {
    group.add(
      roundedBox(size.width, headboardHeight, 0.09, 0.12, materials.get('upholstery'), [
        0,
        mattressY - 0.08,
        -size.depth / 2 + 0.05,
      ])
    );
  } else {
    group.add(
      roundedBox(size.width, headboardHeight, 0.07, radius, wood, [
        0,
        mattressY - 0.1,
        -size.depth / 2 + 0.04,
      ])
    );
  }

  legs(group, size.width - 0.06, size.depth - 0.06, legHeight, frame, legStyleFor(style.id), 0.08);
  return group;
}

export function buildNightstand(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const metal = materials.get('metal');
  const legHeight = style.id === 'modern' ? 0.02 : 0.14;
  const bodyHeight = size.height - legHeight;

  group.add(slab(size.width, bodyHeight, size.depth, wood, [0, legHeight, 0]));
  frontPanels(group, 2, size.width, bodyHeight, size.depth, legHeight, wood, metal);
  legs(group, size.width - 0.04, size.depth - 0.04, legHeight, metal, legStyleFor(style.id), 0.05);

  // A book and a small lamp, so bedside tables are not bare slabs.
  group.add(slab(0.14, 0.03, 0.1, materials.get('accent'), [0.08, size.height, 0]));
  group.add(cylinder(0.03, 0.045, 0.14, metal, [-0.08, size.height + 0.07, 0], 8));
  group.add(
    cylinder(0.075, 0.095, 0.11, materials.get('lampshade'), [-0.08, size.height + 0.19, 0], 10)
  );

  return group;
}

export function buildWardrobe(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const metal = materials.get('metal');
  const plinthHeight = style.id === 'vintage' ? 0.1 : 0.05;
  const bodyHeight = size.height - plinthHeight;

  group.add(slab(size.width - 0.06, plinthHeight, size.depth - 0.04, metal, [0, 0, 0]));
  group.add(slab(size.width, bodyHeight, size.depth, wood, [0, plinthHeight, 0]));

  const doors = size.width > 1.4 ? 3 : 2;
  frontPanels(group, doors, size.width, bodyHeight, size.depth, plinthHeight, wood, metal, 'vertical');

  // Cornice on the traditional styles.
  if (style.id === 'vintage' || style.id === 'scandinavian') {
    group.add(slab(size.width + 0.05, 0.05, size.depth + 0.03, wood, [0, size.height - 0.05, 0]));
  }

  return group;
}

export function buildDresser(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const metal = materials.get('metal');
  const legHeight = style.id === 'modern' ? 0.04 : 0.16;
  const bodyHeight = size.height - legHeight;

  group.add(slab(size.width, bodyHeight, size.depth, wood, [0, legHeight, 0]));
  frontPanels(group, 3, size.width, bodyHeight, size.depth, legHeight, wood, metal);
  legs(group, size.width - 0.06, size.depth - 0.04, legHeight, metal, legStyleFor(style.id), 0.07);

  group.add(slab(size.width + 0.02, 0.03, size.depth + 0.01, wood, [0, size.height - 0.03, 0]));
  return group;
}

export function buildBookshelf(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const structure = style.id === 'industrial' ? materials.get('metal') : wood;
  const plinthHeight = 0.06;
  const inner = size.height - plinthHeight;

  // Sides, top, bottom, back.
  for (const sign of [1, -1]) {
    group.add(
      slab(0.028, inner, size.depth, structure, [(sign * (size.width - 0.028)) / 2, plinthHeight, 0])
    );
  }
  group.add(slab(size.width, 0.028, size.depth, structure, [0, plinthHeight, 0]));
  group.add(slab(size.width, 0.028, size.depth, structure, [0, size.height - 0.028, 0]));
  group.add(
    box(size.width, inner, 0.014, wood, [0, plinthHeight + inner / 2, -size.depth / 2 + 0.007])
  );

  const shelfCount = Math.max(3, Math.floor(inner / 0.36));
  shelves(group, shelfCount, size.width, inner, size.depth, plinthHeight, structure);

  const bookMaterials = [
    materials.get('accent'),
    materials.get('textile'),
    materials.get('upholstery'),
    materials.get('frame'),
  ];
  for (let i = 1; i <= shelfCount; i++) {
    const y = plinthHeight + (i * inner) / (shelfCount + 1) + 0.011;
    clutter(group, size.width - 0.06, size.depth, y, bookMaterials, ctx.seed + i);
  }

  legs(group, size.width - 0.05, size.depth - 0.05, plinthHeight, structure, style.id === 'industrial' ? 'round' : 'square', 0.06);
  return group;
}
