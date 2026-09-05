/**
 * Sofas, armchairs and chairs.
 *
 * Local +Z is the direction the seat faces, so a sofa's back sits at -Z and the person sitting
 * on it looks towards +Z. The layout engine rotates the whole group to point into the room.
 */

import * as THREE from 'three';
import { box, cushion, cylinder, legs, roundedBox, slab } from '../primitives';
import { legStyleFor, radiusFor, type BuildContext } from './context';

const SEAT_HEIGHT = 0.42;

export function buildSofa(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const fabric = materials.get('upholstery', { colorHex: ctx.colorHex });
  const frame = materials.get('frame');
  const accent = materials.get('accent');
  const radius = radiusFor(style.id);
  const legHeight = style.id === 'industrial' ? 0.16 : 0.13;

  const armWidth = 0.18;
  const backDepth = 0.16;
  const seatWidth = size.width - armWidth * 2;
  const seatDepth = size.depth - backDepth;

  // Base
  group.add(
    roundedBox(size.width, SEAT_HEIGHT - legHeight, size.depth, radius, fabric, [
      0,
      legHeight,
      0,
    ])
  );

  // Seat cushions — one per ~0.7 m of width, which is how sofas are actually divided.
  const seats = Math.max(2, Math.round(seatWidth / 0.72));
  const seatSlot = seatWidth / seats;
  for (let i = 0; i < seats; i++) {
    const x = -seatWidth / 2 + (i + 0.5) * seatSlot;
    group.add(
      cushion(seatSlot - 0.03, 0.16, seatDepth - 0.06, fabric, [x, SEAT_HEIGHT, backDepth / 2])
    );
  }

  // Back cushions, leaning back a touch.
  for (let i = 0; i < seats; i++) {
    const x = -seatWidth / 2 + (i + 0.5) * seatSlot;
    const back = cushion(seatSlot - 0.04, 0.44, 0.18, fabric, [
      x,
      SEAT_HEIGHT + 0.12,
      -size.depth / 2 + backDepth / 2 + 0.04,
    ]);
    back.rotation.x = -0.09;
    group.add(back);
  }

  // Arms
  for (const sign of [1, -1]) {
    group.add(
      roundedBox(armWidth, 0.62 - legHeight, size.depth - 0.04, radius, fabric, [
        (sign * (size.width - armWidth)) / 2,
        legHeight,
        0,
      ])
    );
  }

  // One accent cushion per end — the cheapest way to stop upholstery reading as a grey block.
  for (const sign of [1, -1]) {
    const throwPillow = cushion(0.36, 0.12, 0.34, accent, [
      (sign * (seatWidth - 0.42)) / 2,
      SEAT_HEIGHT + 0.16,
      -size.depth / 2 + 0.34,
    ]);
    throwPillow.rotation.x = -0.55;
    group.add(throwPillow);
  }

  legs(group, size.width - 0.1, size.depth - 0.1, legHeight, frame, legStyleFor(style.id), 0.1);
  return group;
}

/** An L-shaped sofa: a main run plus a chaise on one end. */
export function buildCornerSofa(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const mainDepth = 0.92;
  const chaiseWidth = 0.95;

  // Main run occupies the back of the footprint.
  const main = buildSofa({
    ...ctx,
    size: { width: size.width, depth: mainDepth, height: size.height },
  });
  main.position.z = -(size.depth - mainDepth) / 2;
  group.add(main);

  // Chaise: a seat pad on a base, no back, running forward from one end.
  const fabric = materials.get('upholstery', { colorHex: ctx.colorHex });
  const frame = materials.get('frame');
  const radius = radiusFor(style.id);
  const legHeight = style.id === 'industrial' ? 0.16 : 0.13;
  const chaiseDepth = size.depth - mainDepth;
  const chaiseZ = size.depth / 2 - chaiseDepth / 2;
  const chaiseX = -(size.width - chaiseWidth) / 2;

  const chaise = new THREE.Group();
  chaise.add(
    roundedBox(chaiseWidth, SEAT_HEIGHT - legHeight, chaiseDepth, radius, fabric, [0, legHeight, 0])
  );
  chaise.add(cushion(chaiseWidth - 0.05, 0.16, chaiseDepth - 0.05, fabric, [0, SEAT_HEIGHT, 0]));
  chaise.add(
    roundedBox(0.18, 0.62 - legHeight, chaiseDepth, radius, fabric, [
      -(chaiseWidth - 0.18) / 2,
      legHeight,
      0,
    ])
  );
  legs(chaise, chaiseWidth - 0.1, chaiseDepth - 0.1, legHeight, frame, legStyleFor(style.id), 0.1);
  chaise.position.set(chaiseX, 0, chaiseZ);
  group.add(chaise);

  return group;
}

export function buildArmchair(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const fabric = materials.get('upholstery', { colorHex: ctx.colorHex });
  const frame = materials.get('frame');
  const radius = radiusFor(style.id);
  const legHeight = 0.16;
  const armWidth = 0.13;

  group.add(
    roundedBox(size.width, SEAT_HEIGHT - legHeight, size.depth, radius, fabric, [0, legHeight, 0])
  );
  group.add(
    cushion(size.width - armWidth * 2 - 0.03, 0.14, size.depth - 0.16, fabric, [
      0,
      SEAT_HEIGHT,
      0.04,
    ])
  );

  const back = cushion(size.width - 0.04, 0.5, 0.16, fabric, [
    0,
    SEAT_HEIGHT + 0.06,
    -size.depth / 2 + 0.1,
  ]);
  back.rotation.x = -0.13;
  group.add(back);

  for (const sign of [1, -1]) {
    group.add(
      roundedBox(armWidth, 0.6 - legHeight, size.depth - 0.06, radius, fabric, [
        (sign * (size.width - armWidth)) / 2,
        legHeight,
        0,
      ])
    );
  }

  legs(group, size.width - 0.08, size.depth - 0.08, legHeight, frame, legStyleFor(style.id), 0.09);
  return group;
}

export function buildDiningChair(ctx: BuildContext): THREE.Object3D {
  const { size, materials, style } = ctx;
  const group = new THREE.Group();

  const wood = materials.get('wood', { colorHex: ctx.colorHex });
  const frame = style.id === 'industrial' ? materials.get('metal') : wood;
  const pad = materials.get('upholstery');
  const seatHeight = 0.45;

  group.add(slab(size.width, 0.045, size.depth, wood, [0, seatHeight, 0]));
  group.add(cushion(size.width - 0.05, 0.035, size.depth - 0.05, pad, [0, seatHeight + 0.045, 0]));

  // Back: a slatted panel, tilted.
  const backHeight = size.height - seatHeight - 0.05;
  const backRest = new THREE.Group();
  if (style.id === 'vintage') {
    // Spindles read period without any extra cost.
    for (let i = 0; i < 4; i++) {
      const x = -size.width / 2 + 0.07 + (i * (size.width - 0.14)) / 3;
      backRest.add(cylinder(0.012, 0.012, backHeight, wood, [x, backHeight / 2, 0], 6));
    }
    backRest.add(slab(size.width - 0.02, 0.05, 0.04, wood, [0, backHeight - 0.05, 0]));
  } else {
    backRest.add(slab(size.width - 0.04, backHeight, 0.032, wood, [0, 0, 0]));
  }
  backRest.position.set(0, seatHeight + 0.05, -size.depth / 2 + 0.03);
  backRest.rotation.x = 0.1;
  group.add(backRest);

  // Legs: four uprights, back pair continuing into the backrest.
  const legStyle = style.id === 'industrial' ? 'round' : 'tapered';
  legs(group, size.width - 0.04, size.depth - 0.04, seatHeight, frame, legStyle, 0.045);

  return group;
}

export function buildOfficeChair(ctx: BuildContext): THREE.Object3D {
  const { size, materials } = ctx;
  const group = new THREE.Group();

  const fabric = materials.get('upholstery', { colorHex: ctx.colorHex });
  const metal = materials.get('metal');
  const seatHeight = 0.47;

  // Five-star base
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const arm = box(0.045, 0.03, size.width * 0.42, metal, [
      (Math.sin(angle) * size.width) / 4.6,
      0.035,
      (Math.cos(angle) * size.width) / 4.6,
    ]);
    arm.rotation.y = angle;
    group.add(arm);
    group.add(
      cylinder(0.026, 0.026, 0.05, metal, [
        (Math.sin(angle) * size.width) / 2.3,
        0.025,
        (Math.cos(angle) * size.width) / 2.3,
      ], 8)
    );
  }

  group.add(cylinder(0.035, 0.045, seatHeight - 0.1, metal, [0, (seatHeight - 0.1) / 2 + 0.05, 0], 10));
  group.add(cushion(size.width - 0.06, 0.09, size.depth - 0.08, fabric, [0, seatHeight, 0]));

  const back = cushion(size.width - 0.1, size.height - seatHeight - 0.16, 0.08, fabric, [
    0,
    seatHeight + 0.09,
    -size.depth / 2 + 0.07,
  ]);
  back.rotation.x = -0.12;
  group.add(back);

  for (const sign of [1, -1]) {
    group.add(
      box(0.04, 0.16, size.depth * 0.55, metal, [
        (sign * (size.width - 0.05)) / 2,
        seatHeight + 0.02,
        0,
      ])
    );
    group.add(
      box(0.06, 0.03, size.depth * 0.5, fabric, [
        (sign * (size.width - 0.05)) / 2,
        seatHeight + 0.11,
        0,
      ])
    );
  }

  return group;
}
