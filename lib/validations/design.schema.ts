import { z } from 'zod';
import { homeStateEnum, roomSplitSchema, roomTypeEnum } from './room.schema';
import { sceneVariantSchema } from './variant.schema';

const vec2 = z.object({ x: z.number(), z: z.number() });

export const elementOriginSchema = z.enum(['existing', 'user', 'generated']);
export const buildMaterialSchema = z.enum(['concrete', 'brick', 'block', 'drywall', 'wood', 'metal', 'aluminium', 'pvc', 'glass']);

const sceneStoreSchema = z.object({
  id: z.number().int(),
  nameKa: z.string(),
  nameEn: z.string().nullable().optional(),
  nameRu: z.string().nullable().optional(),
  logoUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  rating: z.number().nullable(),
  deliveryDays: z.number().nullable(),
  // Optional: scenes saved before this field existed must still load.
  deliveryFeeGel: z.number().nullable().optional(),
});

const sceneProductSchema = z.object({
  productId: z.number().int(),
  nameKa: z.string(),
  nameEn: z.string().nullable().optional(),
  nameRu: z.string().nullable().optional(),
  slug: z.string(),
  brand: z.string().nullable(),
  pricePerUnit: z.number().min(0),
  unit: z.string(),
  qty: z.number().min(0),
  totalPrice: z.number().min(0),
  imageUrl: z.string().nullable(),
  colorHex: z.string().nullable(),
  textureUrl: z.string().nullable(),
  model3dUrl: z.string().nullable(),
  categorySlug: z.string().nullable(),
  store: sceneStoreSchema.nullable(),
  // A finish: what it is sold by — the catalogue's unit and price and a paint's coverage (`SceneProduct.sale`).
  sale: z.object({ unit: z.string().max(16), pricePerUnit: z.number().min(0), coveragePerUnit: z.number().positive().nullable() }).nullable().optional(),
  // A placed piece's material variant (`SceneProduct.variant`); the save rebuilds it from the catalogue.
  variant: sceneVariantSchema.nullable().optional(),
});

const openingSchema = z.object({
  id: z.string(),
  kind: z.enum(['door', 'window', 'archway', 'railing']),
  wallIndex: z.number().int().min(0),
  t: z.number().min(0).max(1),
  widthM: z.number().positive().max(12),
  heightM: z.number().positive().max(6),
  sillM: z.number().min(0).max(6),
  roomId: z.string(),
  connectsToRoomId: z.string().nullable().optional(),
  exterior: z.boolean(),
  material: buildMaterialSchema.optional(),
  hinge: z.enum(['left', 'right']).optional(),
  swing: z.enum(['in', 'out']).optional(),
  openAngleDeg: z.number().min(0).max(180).optional(),
  product: sceneProductSchema.nullable().optional(),
  origin: elementOriginSchema.optional(),
  locked: z.boolean().optional(),
});

export const wallSchema = z.object({
  id: z.string().min(1).max(64),
  a: vec2,
  b: vec2,
  // A room separator has no thickness (`Wall.separator`); a wall has at least 3 cm.
  thicknessM: z.number().min(0).max(1),
  heightM: z.number().min(1).max(8).optional(),
  material: buildMaterialSchema.optional(),
  origin: elementOriginSchema,
  locked: z.boolean().optional(),
  /** A partition already standing in a black frame: not built, not priced (`Wall.built`). */
  built: z.boolean().optional(),
  /** A room separator, not a wall (`Wall.separator`). */
  separator: z.boolean().optional(),
});

export const columnSchema = z.object({
  id: z.string().min(1).max(64),
  position: vec2,
  widthM: z.number().min(0.05).max(3),
  depthM: z.number().min(0.05).max(3),
  heightM: z.number().min(0.2).max(8).optional(),
  material: buildMaterialSchema.optional(),
  origin: elementOriginSchema,
  locked: z.boolean().optional(),
});

export const beamSchema = z.object({
  id: z.string().min(1).max(64),
  a: vec2,
  b: vec2,
  widthM: z.number().min(0.05).max(3),
  depthM: z.number().min(0.05).max(3),
  elevationM: z.number().min(0).max(8),
  material: buildMaterialSchema.optional(),
  origin: elementOriginSchema,
  locked: z.boolean().optional(),
});

export const technicalKindSchema = z.enum(['water_supply', 'sewer', 'floor_drain', 'electrical_panel', 'gas', 'radiator', 'ac_unit', 'extractor', 'boiler', 'heating_pipe']);

export const technicalPointSchema = z.object({
  id: z.string().min(1).max(64),
  kind: technicalKindSchema,
  roomId: z.string().max(64).nullable(),
  position: vec2,
  elevationM: z.number().min(0).max(8).optional(),
  note: z.string().max(300).optional(),
  // A radiator: the product it is (sold by the section), what a section gives and measures,
  // and the sections set by hand.
  product: sceneProductSchema.nullable().optional(),
  radiator: z.object({ wattsPerSection: z.number().min(20).max(1000), sectionWidthM: z.number().min(0.02).max(0.5), heightM: z.number().min(0.1).max(2.5), depthM: z.number().min(0.02).max(0.5) }).optional(),
  sections: z.number().int().min(1).max(60).nullable().optional(),
  // A piece of equipment: its product's size, for the 3D view.
  sizeM: z.object({ width: z.number().min(0.01).max(5), depth: z.number().min(0.001).max(5), height: z.number().min(0.001).max(5) }).nullable().optional(),
  origin: elementOriginSchema,
});

export const technicalSetupSchema = z.object({
  points: z.array(technicalPointSchema).max(200),
  works: z.array(z.string().max(40)).max(40).optional(),
  existing: z.array(z.string().max(24)).max(24).optional(),
  choices: z.object({ floor: z.enum(['laminate', 'parquet']), ceiling: z.enum(['gypsum', 'barisol']) }).partial().optional(),
  checked: z.array(z.string().max(24)).max(12).optional(),
});

export const planRoomSchema = z.object({
  id: z.string().min(1).max(64),
  type: roomTypeEnum,
  name: z.string().max(120),
  polygon: z.array(vec2).min(3).max(64),
  heightM: z.number().min(1.8).max(6),
  areaM2: z.number().min(0).max(2000),
  perimeterM: z.number().min(0).max(500),
  openings: z.array(openingSchema).max(40),
  lowConfidence: z.boolean().optional(),
  wallIds: z.array(z.string().max(64)).max(64).optional(),
  origin: elementOriginSchema.optional(),
  split: roomSplitSchema.optional(),
  /** The edges on a room separator (`PlanRoom.open`). */
  open: z.array(z.number().int().min(0).max(63)).max(64).optional(),
  keepWhole: z.boolean().optional(),
});

export const floorPlanSchema = z.object({
  rooms: z.array(planRoomSchema).min(1).max(40),
  metresPerPixel: z.number().positive().nullable(),
  bounds: z.object({ width: z.number().min(0), depth: z.number().min(0) }),
  source: z.enum(['parsed', 'manual', 'calculator', 'sample']),
  imageUrl: z.string().max(500).nullable().optional(),
  wallThicknessM: z.number().min(0.02).max(1),
  wallHeightM: z.number().min(1).max(8).optional(),
  walls: z.array(wallSchema).max(400).optional(),
  columns: z.array(columnSchema).max(100).optional(),
  beams: z.array(beamSchema).max(100).optional(),
  technical: technicalSetupSchema.optional(),
});

export const itemOriginSchema = z.enum(['style', 'calculator', 'studio']);

export const placedItemSchema = z.object({
  id: z.string().max(80),
  roomId: z.string().max(64),
  slot: z.string().max(40),
  kind: z.string().max(64),
  position: vec2,
  elevationM: z.number().min(-1).max(10),
  rotation: z.number(),
  size: z.object({
    width: z.number().positive().max(20),
    depth: z.number().positive().max(20),
    height: z.number().positive().max(10),
  }),
  product: sceneProductSchema.nullable(),
  pinned: z.boolean().optional(),
  // A kitchen made to measure rather than bought at the model's price, and what it is made in.
  custom: z.boolean().optional(),
  kitchenMaterial: sceneProductSchema.nullable().optional(),
  kitchenMaterialChosen: z.boolean().optional(),
  origin: itemOriginSchema.optional(),
  mirrored: z.boolean().optional(),
  locked: z.boolean().optional(),
});

export const finishZoneSchema = z.object({
  id: z.string().min(1).max(64),
  polygon: z.array(vec2).min(3).max(64),
  name: z.string().max(80).optional(),
});

export const surfaceFinishSchema = z.object({
  roomId: z.string().max(64),
  surface: z.enum(['floor', 'wall', 'ceiling', 'skirting', 'cornice']),
  wallIndex: z.number().int().min(0).max(64).nullable().optional(),
  // A painted stretch of one wall, metres along its edge.
  span: z.object({ from: z.number().min(0).max(200), to: z.number().min(0).max(200) }).nullable().optional(),
  zone: finishZoneSchema.nullable().optional(),
  // Floor tiles painted one square metre at a time: grid indices within the room.
  cells: z.array(z.tuple([z.number().int().min(0).max(400), z.number().int().min(0).max(400)])).max(2000).nullable().optional(),
  // A floor two products share: this one's part of it (`SurfaceFinish.share`).
  share: z.number().min(0).max(1).nullable().optional(),
  // A skirting board or cornice: its cross-section.
  trim: z
    .object({ profile: z.enum(['flat', 'rounded', 'stepped', 'ogee', 'cove']), heightM: z.number().min(0.01).max(0.6), depthM: z.number().min(0.002).max(0.6) })
    .nullable()
    .optional(),
  colorHex: z.string().max(9),
  textureUrl: z.string().max(500).nullable(),
  textureScaleM: z.number().positive().max(20),
  // A chosen finish carries its own maps; dropping them here silently re-textured saved
  // scenes with the style's defaults when they were loaded again.
  normalUrl: z.string().max(500).nullable().optional(),
  roughnessUrl: z.string().max(500).nullable().optional(),
  product: sceneProductSchema.nullable(),
  origin: itemOriginSchema.optional(),
  // A style's finish: the kind of room it was laid for (`SurfaceFinish.laidFor`).
  laidFor: z.string().max(32).nullable().optional(),
});

export const electricalKindSchema = z.enum(['socket', 'socket_double', 'socket_high', 'socket_kitchen', 'switch', 'switch_two_way', 'tv', 'internet', 'light_ceiling', 'light_wall', 'light_spot', 'light_strip', 'light_furniture']);
export const lightCategorySchema = z.enum(['primary', 'secondary', 'furniture', 'bedside', 'indirect', 'decorative']);

export const electricalPointSchema = z.object({
  id: z.string().min(1).max(64),
  roomId: z.string().max(64),
  kind: electricalKindSchema,
  category: lightCategorySchema.optional(),
  position: vec2,
  elevationM: z.number().min(0).max(8),
  wallIndex: z.number().int().min(0).max(64).nullable().optional(),
  t: z.number().min(0).max(1).nullable().optional(),
  count: z.number().int().min(1).max(6).optional(),
  on: z.boolean().optional(),
  lengthM: z.number().min(0.1).max(30).optional(),
  product: sceneProductSchema.nullable().optional(),
  sizeM: z.object({ width: z.number().min(0.01).max(10), depth: z.number().min(0.01).max(10), height: z.number().min(0.01).max(10) }).optional(),
  origin: elementOriginSchema.optional(),
  locked: z.boolean().optional(),
});

const decorMaterialSchema = z.object({
  product: sceneProductSchema.nullable(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  specs: z
    .object({
      textureScaleM: z.number().min(0.05).max(20).optional(),
      tintable: z.boolean().optional(),
      cct: z.number().min(1500).max(8000).optional(),
      profileMm: z.number().min(5).max(200).optional(),
      roughness: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
});

const decorSlotEnum = z.enum(['face', 'backing', 'led', 'profile', 'body', 'shelf', 'surround', 'border', 'trim']);

/** A custom wall decor piece (`lib/design/decor`): where it stands, its knobs, its materials. */
export const decorPieceSchema = z.object({
  id: z.string().min(1).max(64),
  roomId: z.string().max(64),
  family: z.enum(['slats', 'moulding', 'niche', 'slab', 'light', 'panel', 'cladding', 'mural', 'tile']),
  wallIndex: z.number().int().min(0).max(64).nullable(),
  span: z.object({ from: z.number().min(-1).max(100), to: z.number().min(-1).max(100) }),
  height: z.object({ from: z.number().min(0).max(20), to: z.number().min(0).max(20) }),
  params: z
    .object({
      slatWidthMm: z.number().min(5).max(200).optional(),
      gapMm: z.number().min(0).max(200).optional(),
      depthMm: z.number().min(5).max(600).optional(),
      backing: z.boolean().optional(),
      led: z.enum(['none', 'bottom', 'top', 'halo', 'inside']).optional(),
      dadoMm: z.number().min(300).max(2000).optional(),
      bayWidthMm: z.number().min(200).max(3000).optional(),
      upper: z.boolean().optional(),
      lower: z.boolean().optional(),
      rail: z.boolean().optional(),
      shape: z.enum(['arch', 'rect']).optional(),
      count: z.number().int().min(1).max(6).optional(),
      nicheWidthMm: z.number().min(200).max(3000).optional(),
      nicheHeightMm: z.number().min(200).max(4000).optional(),
      shelves: z.number().int().min(0).max(8).optional(),
      mantel: z.boolean().optional(),
      moduleWidthMm: z.number().min(10).max(5000).optional(),
      moduleHeightMm: z.number().min(10).max(5000).optional(),
      jointMm: z.number().min(0).max(50).optional(),
      thicknessMm: z.number().min(0).max(200).optional(),
      standoffMm: z.number().min(0).max(1500).optional(),
      style: z.enum(['upholstered', 'fluted', 'flat']).optional(),
      border: z.boolean().optional(),
      path: z.enum(['cove', 'line']).optional(),
    })
    .strip(),
  materials: z.record(decorSlotEnum, decorMaterialSchema),
  reference: z.object({ entryId: z.string().max(64), concept: z.string().max(300) }).nullable().optional(),
  note: z.string().max(600).nullable().optional(),
  origin: z.enum(['ai', 'studio']).optional(),
  anchor: z.enum(['bed', 'tv', 'sofa', 'desk', 'dining', 'kitchen', 'wall', 'room']).nullable().optional(),
});

/** How the flat was generated: by the engine or by the AI designer, with its per-room notes. */
export const generationRecordSchema = z.object({
  by: z.enum(['engine', 'ai']),
  model: z.string().max(64).nullable().optional(),
  at: z.string().max(40),
  notes: z.record(z.string().max(64), z.string().max(1200)).optional(),
  aiCount: z.number().int().min(0).max(1000).optional(),
  reviewed: z.number().int().min(0).max(1000).optional(),
});

const styleIdSchema = z.enum(['modern', 'scandinavian', 'industrial', 'vintage']);

export const styleProfileSchema = z.object({
  answers: z.record(z.string().max(40)),
  scores: z.object({ modern: z.number(), scandinavian: z.number(), industrial: z.number(), vintage: z.number() }),
  direct: z.boolean().optional(),
});

export const designSceneSchema = z.object({
  styleId: styleIdSchema,
  mode: z.enum(['full', 'design_only']),
  budgetGel: z.number().min(0).max(10_000_000).nullable(),
  items: z.array(placedItemSchema).max(600),
  finishes: z.array(surfaceFinishSchema).max(800),
  decor: z.array(decorPieceSchema).max(200).optional(),
  generation: generationRecordSchema.nullable().optional(),
  electrical: z.array(electricalPointSchema).max(600).optional(),
  styleProfile: styleProfileSchema.nullable().optional(),
  /** Ticked-off budget lines: `item:<id>`, `finish:<productId>`… — or a bare product id from an older scene. */
  excluded: z.array(z.union([z.number().int().positive(), z.string().min(3).max(96)])).max(1200).optional(),
  /** Quantities the person set themselves on the budget, by line key. */
  quantities: z.record(z.string().min(3).max(96), z.number().min(0).max(1_000_000)).optional(),
  progress: z
    .object({
      step: z.number().int().min(1).max(8),
      generated: z.boolean(),
      planFromCalculator: z.boolean().optional(),
      at: z.number().int().min(1).max(8).nullable().optional(),
      modeChosen: z.boolean().optional(),
      emptyStart: z.boolean().optional(),
    })
    .optional(),
});

/**
 * A plan as a project holds it while it is being drawn: a blank sheet, or walls that do not
 * enclose a room yet, are a plan too. Versions and the checks on a finished design keep
 * asking for rooms (`floorPlanSchema`).
 */
export const draftPlanSchema = floorPlanSchema.extend({ rooms: z.array(planRoomSchema).max(40) });

/** A kept version of the flat: the plan and scene as they were, with a name. */
export const designVersionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  kind: z.enum(['existing', 'auto', 'manual']),
  createdAt: z.string().max(40),
  plan: floorPlanSchema,
  scene: designSceneSchema,
});

export const MAX_VERSIONS = 12;

export const saveDesignSchema = z.object({
  /** What the studio chose itself — null for a design-only project; the calculation owns it when there is one. */
  homeState: homeStateEnum.nullable().optional(),
  /** A blank sheet or a plan still being drawn is saved too: the project keeps its step. */
  plan: draftPlanSchema,
  scene: designSceneSchema,
  floorPlanUrl: z.string().max(500).nullable().optional(),
  /** The caller's project this design is written into — made before its first step. */
  projectId: z.number().int().positive(),
  /** The design's revision this save was made from; an older one than the row's is refused (409). */
  baseRev: z.number().int().min(0).optional(),
  /** The person chose to keep this copy over one saved elsewhere since. */
  force: z.boolean().optional(),
  /** This save's id, and the previous one's when its answer never came back (`projects.design_save_id`). */
  saveId: z.string().min(1).max(64).optional(),
  prevSaveId: z.string().min(1).max(64).nullable().optional(),
  /** An autosave: keeps the row a draft (or whatever it already is) instead of marking it saved. */
  draft: z.boolean().optional(),
  /** The kept versions of the flat, oldest first. */
  versions: z.array(designVersionSchema).max(MAX_VERSIONS).optional(),
});

export type SaveDesignInput = z.infer<typeof saveDesignSchema>;
