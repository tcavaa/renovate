/**
 * Design Studio domain types.
 *
 * Everything here is plain data — it round-trips through JSON into `projects.plan` /
 * `projects.scene`, and is shared by the parser, the layout engine, the 3D scene builder
 * and the pricing code. No React, no THREE, no `window`.
 *
 * Units: all geometry is in **metres**, all money in **GEL**. Angles are radians.
 * The plan lives in the XZ ground plane (x = east, z = south), Y is up — same as Three.js.
 */

import type { RoomType } from '@/lib/calculator/types';

export type DesignMode = 'full' | 'design_only';

export interface Vec2 {
  x: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Floor plan
// ---------------------------------------------------------------------------

export type OpeningKind = 'door' | 'window' | 'archway';

export interface Opening {
  id: string;
  kind: OpeningKind;
  /** Index of the polygon edge (from `roomId`'s outline) this opening sits on. */
  wallIndex: number;
  /** Position along that edge, 0..1, measured at the opening's centre. */
  t: number;
  widthM: number;
  heightM: number;
  /** Height of the opening's sill above the floor. 0 for doors. */
  sillM: number;
  /** Room this opening was authored against. */
  roomId: string;
  /** For interior doors: the room on the other side, when known. */
  connectsToRoomId?: string | null;
  /** True when the wall it sits on faces outside the flat. */
  exterior: boolean;
}

export interface PlanRoom {
  id: string;
  type: RoomType;
  /** User-editable label. Free text, not translated. */
  name: string;
  /**
   * Closed, counter-clockwise, axis-aligned polygon in metres. First point is NOT repeated.
   * Rectangular rooms have 4 points; L-shaped rooms have 6 or 8.
   */
  polygon: Vec2[];
  heightM: number;
  /** Derived — kept on the object so the UI doesn't recompute constantly. */
  areaM2: number;
  perimeterM: number;
  openings: Opening[];
  /** Set by the parser when it is unsure; drives the "please check this" hint in the editor. */
  lowConfidence?: boolean;
}

export interface FloorPlan {
  rooms: PlanRoom[];
  /** Metres per source-image pixel. Null until the user confirms a scale. */
  metresPerPixel: number | null;
  /** Bounding size of the whole flat, metres. */
  bounds: { width: number; depth: number };
  /** Where the plan came from — shown in the UI, and drives the "please check" nudge. */
  source: 'parsed' | 'manual' | 'calculator' | 'sample';
  imageUrl?: string | null;
  /** Wall thickness used when extruding, metres. */
  wallThicknessM: number;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export interface ParsedRegion {
  /** Axis-aligned rectilinear outline in **pixels** of the source image. */
  polygonPx: Array<{ x: number; y: number }>;
  areaPx: number;
  bboxPx: { x: number; y: number; w: number; h: number };
  /** areaPx / bbox area — 1.0 means a perfect rectangle. */
  rectangularity: number;
}

export interface ParseResult {
  regions: ParsedRegion[];
  imageWidth: number;
  imageHeight: number;
  /** Fraction of pixels classified as wall. Sanity signal for the UI. */
  wallRatio: number;
  /** Human-readable reason when nothing usable was found. */
  warning?: string;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

/** Where a piece of furniture belongs in a room — produced by the layout engine. */
export type SlotKind =
  | 'bed'
  | 'nightstand'
  | 'wardrobe'
  | 'dresser'
  | 'sofa'
  | 'armchair'
  | 'coffee_table'
  | 'tv_unit'
  | 'bookshelf'
  | 'dining_table'
  | 'dining_chair'
  | 'kitchen_run'
  | 'kitchen_island'
  | 'fridge'
  | 'desk'
  | 'office_chair'
  | 'toilet'
  | 'sink'
  | 'shower'
  | 'bathtub'
  | 'washer'
  | 'console'
  | 'shoe_cabinet'
  | 'mirror'
  | 'rug'
  | 'floor_lamp'
  | 'pendant'
  | 'plant'
  | 'artwork'
  | 'curtain';

/** A single object placed in the 3D scene. */
/** Who put this product here: the style matcher, the user in the calculator, or the user in the studio. */
export type ItemOrigin = 'style' | 'calculator' | 'studio';

export interface PlacedItem {
  id: string;
  roomId: string;
  slot: SlotKind;
  /** Centre of the item's footprint, metres, in world space. */
  position: Vec2;
  /** Y offset of the item's base. 0 = on the floor; used for wall- and ceiling-mounted items. */
  elevationM: number;
  /** Yaw around Y, radians. 0 = the item faces +Z. */
  rotation: number;
  /** Footprint and height actually used, metres — from the product when known. */
  size: { width: number; depth: number; height: number };
  /** Procedural archetype to draw. See lib/design3d/furniture. */
  kind: string;
  /** Resolved product, or null while the slot is still unfilled. */
  product: SceneProduct | null;
  /** True when the user moved/replaced this item, so re-suggesting must not clobber it. */
  pinned?: boolean;
  origin?: ItemOrigin;
}

/** The product data the 3D scene and its hover card need. Denormalised on purpose. */
export interface SceneProduct {
  productId: number;
  nameKa: string;
  slug: string;
  brand: string | null;
  pricePerUnit: number;
  unit: string;
  qty: number;
  totalPrice: number;
  imageUrl: string | null;
  colorHex: string | null;
  textureUrl: string | null;
  model3dUrl: string | null;
  categorySlug: string | null;
  store: SceneStore | null;
}

export interface SceneStore {
  id: number;
  nameKa: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  rating: number | null;
  deliveryDays: number | null;
  deliveryFeeGel: number | null;
}

/** A finish applied to a room surface (floor / walls / ceiling). */
export interface SurfaceFinish {
  roomId: string;
  surface: 'floor' | 'wall' | 'ceiling';
  /** Fallback colour when no product/texture is chosen. */
  colorHex: string;
  textureUrl: string | null;
  /** How many metres of real surface one texture tile covers. */
  textureScaleM: number;
  /** Maps that belong to the chosen texture; null means none, even if the style has one. */
  normalUrl?: string | null;
  roughnessUrl?: string | null;
  product: SceneProduct | null;
  origin?: ItemOrigin;
}

export interface DesignScene {
  styleId: StyleId;
  mode: DesignMode;
  budgetGel: number | null;
  items: PlacedItem[];
  finishes: SurfaceFinish[];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export type StyleId = 'modern' | 'scandinavian' | 'industrial' | 'vintage';

export interface StyleSurface {
  colorHex: string;
  textureUrl?: string;
  normalUrl?: string;
  roughnessUrl?: string;
  /** Metres covered by one tile of the texture. */
  textureScaleM?: number;
  roughness?: number;
  metalness?: number;
}

export interface StyleDefinition {
  id: StyleId;
  /** Matches the folder names in the partner asset drop. */
  assetFolder: 'MODERN' | 'SCANDINAVIAN' | 'INDUSTRIAL' | 'VINTAGE';
  /** Product tags that count as "this style" when scoring the catalogue. */
  tags: string[];
  swatches: string[];
  palette: {
    /** Frames, legs, structure. */
    frame: string;
    /** Upholstery and soft goods. */
    upholstery: string;
    /** Wood surfaces. */
    wood: string;
    /** Metal fittings. */
    metal: string;
    /** The one colour allowed to shout. */
    accent: string;
    /** Rugs, curtains, cushions. */
    textile: string;
  };
  surfaces: {
    floor: StyleSurface;
    wall: StyleSurface;
    /** Applied to one wall per living space, for a feature wall. */
    featureWall: StyleSurface;
    ceiling: StyleSurface;
    wetFloor: StyleSurface;
    wetWall: StyleSurface;
  };
  lighting: {
    /** Ambient light colour and intensity. */
    ambient: string;
    ambientIntensity: number;
    /** Colour of the artificial lights in the room. */
    lamp: string;
    /** Sun colour through the windows. */
    sun: string;
    sunIntensity: number;
  };
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

export interface StoreBasket {
  store: SceneStore | null;
  lines: Array<{
    item: string;
    roomName: string;
    product: SceneProduct;
  }>;
  subtotal: number;
  deliveryFee: number;
}

export interface DesignCost {
  /** Furniture and decor only. */
  furnitureTotal: number;
  /** Floor/wall/ceiling finish products. Zero in design_only mode. */
  finishesTotal: number;
  /** Labour from the existing calculator engine. Zero in design_only mode. */
  labourTotal: number;
  /** Bulk renovation materials from the existing engine. Zero in design_only mode. */
  materialsTotal: number;
  deliveryTotal: number;
  grandTotal: number;
  perRoom: Array<{ roomId: string; roomName: string; total: number }>;
  baskets: StoreBasket[];
}
