/**
 * The procedural furniture registry.
 *
 * Every archetype in `lib/design/catalog.ts` maps to a builder here. This is what makes the
 * studio work with a real catalogue on day one: a partner does not have to supply a GLB for
 * their sofa, because the app already knows how to draw a sofa in four styles at whatever
 * dimensions the product actually is. When a GLB *does* arrive
 * (`products.model3dUrl`), the scene builder loads it instead and this becomes the fallback.
 */

import * as THREE from 'three';
import { buildArmchair, buildCornerSofa, buildDiningChair, buildOfficeChair, buildSofa } from './seating';
import {
  buildBed,
  buildBookshelf,
  buildDresser,
  buildNightstand,
  buildWardrobe,
} from './sleeping';
import {
  buildConsoleTable,
  buildCoffeeTable,
  buildDesk,
  buildDiningTable,
  buildShoeCabinet,
  buildStorageShelf,
  buildTvUnit,
} from './tables';
import {
  buildBathtub,
  buildFridge,
  buildKitchenIsland,
  buildKitchenRun,
  buildShower,
  buildSink,
  buildToilet,
  buildWasher,
} from './kitchenBath';
import {
  buildArtwork,
  buildCurtain,
  buildFloorLamp,
  buildMirror,
  buildPendant,
  buildPlant,
  buildRug,
} from './decor';
import type { BuildContext, FurnitureBuilder } from './context';

export const FURNITURE_BUILDERS: Record<string, FurnitureBuilder> = {
  // sleeping
  bed_double: buildBed,
  bed_single: buildBed,
  nightstand: buildNightstand,
  wardrobe: buildWardrobe,
  dresser: buildDresser,

  // living
  sofa_3seat: buildSofa,
  sofa_corner: buildCornerSofa,
  armchair: buildArmchair,
  coffee_table: buildCoffeeTable,
  tv_unit: buildTvUnit,
  bookshelf: buildBookshelf,

  // dining
  dining_table: buildDiningTable,
  dining_chair: buildDiningChair,

  // kitchen
  kitchen_run: buildKitchenRun,
  kitchen_island: buildKitchenIsland,
  fridge: buildFridge,

  // work
  desk: buildDesk,
  office_chair: buildOfficeChair,

  // bathroom
  toilet: buildToilet,
  sink: buildSink,
  shower: buildShower,
  bathtub: buildBathtub,
  washer: buildWasher,

  // hallway
  console_table: buildConsoleTable,
  shoe_cabinet: buildShoeCabinet,
  mirror: buildMirror,

  // decor
  rug: buildRug,
  rug_bed: buildRug,
  floor_lamp: buildFloorLamp,
  pendant: buildPendant,
  plant: buildPlant,
  artwork: buildArtwork,
  curtain: buildCurtain,

  // generic
  storage_shelf: buildStorageShelf,
};

/**
 * Builds one piece of furniture.
 *
 * Falls back to a plain box at the item's real dimensions rather than returning nothing —
 * an unknown archetype should still occupy the space it was allocated, so the room reads
 * correctly and the hover card still works.
 */
export function buildFurniture(kind: string, ctx: BuildContext): THREE.Object3D {
  const builder = FURNITURE_BUILDERS[kind];
  if (builder) {
    try {
      return builder(ctx);
    } catch (error) {
      console.error(`furniture builder "${kind}" failed`, error);
    }
  }
  return placeholderBox(ctx);
}

function placeholderBox(ctx: BuildContext): THREE.Object3D {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(ctx.size.width, ctx.size.height, ctx.size.depth),
    ctx.materials.get('frame', { colorHex: ctx.colorHex })
  );
  mesh.position.y = ctx.size.height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

export function hasBuilder(kind: string): boolean {
  return kind in FURNITURE_BUILDERS;
}

export type { BuildContext, FurnitureBuilder };
export { legStyleFor, radiusFor } from './context';
