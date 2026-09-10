import { z } from 'zod';
import { calculatorPicksPayloadSchema } from './project.schema';

const vec2 = z.object({ x: z.number(), z: z.number() });

const openingSchema = z.object({
  id: z.string(),
  kind: z.enum(['door', 'window', 'archway']),
  wallIndex: z.number().int().min(0),
  t: z.number().min(0).max(1),
  widthM: z.number().positive().max(12),
  heightM: z.number().positive().max(6),
  sillM: z.number().min(0).max(6),
  roomId: z.string(),
  connectsToRoomId: z.string().nullable().optional(),
  exterior: z.boolean(),
});

export const planRoomSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum([
    'living_room',
    'bedroom',
    'kitchen',
    'bathroom',
    'toilet',
    'hallway',
    'balcony',
    'storage',
    'office',
  ]),
  name: z.string().max(120),
  polygon: z.array(vec2).min(3).max(64),
  heightM: z.number().min(1.8).max(6),
  areaM2: z.number().min(0).max(2000),
  perimeterM: z.number().min(0).max(500),
  openings: z.array(openingSchema).max(40),
  lowConfidence: z.boolean().optional(),
});

export const floorPlanSchema = z.object({
  rooms: z.array(planRoomSchema).min(1).max(40),
  metresPerPixel: z.number().positive().nullable(),
  bounds: z.object({ width: z.number().min(0), depth: z.number().min(0) }),
  source: z.enum(['parsed', 'manual', 'calculator', 'sample']),
  imageUrl: z.string().max(500).nullable().optional(),
  wallThicknessM: z.number().min(0.02).max(1),
});

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
  origin: itemOriginSchema.optional(),
});

export const surfaceFinishSchema = z.object({
  roomId: z.string().max(64),
  surface: z.enum(['floor', 'wall', 'ceiling']),
  colorHex: z.string().max(9),
  textureUrl: z.string().max(500).nullable(),
  textureScaleM: z.number().positive().max(20),
  // A chosen finish carries its own maps; dropping them here silently re-textured saved
  // scenes with the style's defaults when they were loaded again.
  normalUrl: z.string().max(500).nullable().optional(),
  roughnessUrl: z.string().max(500).nullable().optional(),
  product: sceneProductSchema.nullable(),
  origin: itemOriginSchema.optional(),
});

export const designSceneSchema = z.object({
  styleId: z.enum(['modern', 'scandinavian', 'industrial', 'vintage']),
  mode: z.enum(['full', 'design_only']),
  budgetGel: z.number().min(0).max(10_000_000).nullable(),
  items: z.array(placedItemSchema).max(600),
  finishes: z.array(surfaceFinishSchema).max(200),
});

export const saveDesignSchema = z.object({
  nameKa: z.string().min(1).max(255).default('ჩემი დიზაინი'),
  homeState: z
    .enum(['black_frame', 'white_frame', 'green_frame'])
    .default('green_frame'),
  plan: floorPlanSchema,
  scene: designSceneSchema,
  floorPlanUrl: z.string().max(500).nullable().optional(),
  /** An existing project of the caller's to write into, so a calculation and a design share one row. */
  projectId: z.number().int().positive().optional(),
  /** The calculator's picks when the design came out of a calculation that was never saved. */
  calculator: calculatorPicksPayloadSchema.optional(),
  /** An autosave: keeps the row a draft (or whatever it already is) instead of marking it saved. */
  draft: z.boolean().optional(),
});

export type SaveDesignInput = z.infer<typeof saveDesignSchema>;
