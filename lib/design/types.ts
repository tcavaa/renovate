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

/**
 * Who put an element there. `existing` came with the flat (the uploaded plan, or what the
 * person drew as the existing house), `user` was added or changed by the person later, and
 * `generated` was placed by the app — the 3D view and the layers panel colour-code the three.
 */
export type ElementOrigin = 'existing' | 'user' | 'generated';

/** What a door, a window, a column or a beam is made of. */
export type BuildMaterial = 'concrete' | 'brick' | 'block' | 'drywall' | 'wood' | 'metal' | 'aluminium' | 'pvc' | 'glass';

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
  /** What the frame and leaf are made of. */
  material?: BuildMaterial;
  /** Doors: which jamb the leaf hangs from, seen from inside the room, and which way it swings. */
  hinge?: 'left' | 'right';
  swing?: 'in' | 'out';
  /** Doors: how far the leaf stands open in the 3D view, degrees. 0 = closed. */
  openAngleDeg?: number;
  /**
   * The catalogue product this door or window is — a real one with a price, a photo and a
   * model the 3D view draws in the hole; null (or absent) while it is only an estimate. The
   * two halves of an interior door carry the same product.
   */
  product?: SceneProduct | null;
  origin?: ElementOrigin;
  locked?: boolean;
}

// ---------------------------------------------------------------------------
// Structure: walls, columns, beams
// ---------------------------------------------------------------------------

/**
 * A wall drawn as a line — its centreline from `a` to `b` — with a real thickness. Rooms are
 * the closed loops the walls make (`lib/design/walls.ts`); a wall that closes nothing is
 * still a wall and is drawn as one.
 */
export interface Wall {
  id: string;
  a: Vec2;
  b: Vec2;
  thicknessM: number;
  /** Height when it differs from the flat's `wallHeightM`. */
  heightM?: number;
  material?: BuildMaterial;
  origin: ElementOrigin;
  locked?: boolean;
}

/** A structural column: a box standing on the floor, `widthM` along x and `depthM` along z. */
export interface Column {
  id: string;
  position: Vec2;
  widthM: number;
  depthM: number;
  /** Full height unless set. */
  heightM?: number;
  material?: BuildMaterial;
  origin: ElementOrigin;
  locked?: boolean;
}

/** A beam under the ceiling from `a` to `b`: `widthM` across, `depthM` tall, its underside `elevationM` above the floor. */
export interface Beam {
  id: string;
  a: Vec2;
  b: Vec2;
  widthM: number;
  depthM: number;
  elevationM: number;
  material?: BuildMaterial;
  origin: ElementOrigin;
  locked?: boolean;
}

// ---------------------------------------------------------------------------
// Technical setup: what the building already provides, before anything is designed
// ---------------------------------------------------------------------------

export type TechnicalKind =
  | 'water_supply'
  | 'sewer'
  | 'floor_drain'
  | 'electrical_panel'
  | 'gas'
  | 'radiator'
  | 'ac_unit'
  | 'extractor'
  | 'boiler'
  | 'heating_pipe';

/**
 * A pipe, a drain, a panel, a radiator — where it is (or will be). The layout engine keeps
 * the toilet near the sewer and the sink near the water; the budget counts them.
 */
export interface TechnicalPoint {
  id: string;
  kind: TechnicalKind;
  roomId: string | null;
  position: Vec2;
  /** Height of the point above the floor, where it matters (a radiator, a panel). */
  elevationM?: number;
  note?: string;
  origin: ElementOrigin;
}

/** Keys of the works the renovation needs — see `WORK_ITEMS` in `lib/design/technical.ts`. */
export type WorkKey = string;

export interface TechnicalSetup {
  points: TechnicalPoint[];
  /** The works ticked on the technical step; when set they replace the home state's phases. */
  works?: WorkKey[];
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
  /** For a plan built from walls: the wall each polygon edge lies on, same order as `polygon`. */
  wallIds?: string[];
  origin?: ElementOrigin;
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
  /** Wall thickness used when extruding, metres — the default for walls without their own. */
  wallThicknessM: number;
  /** Default height of the walls, metres; rooms and walls may carry their own. */
  wallHeightM?: number;
  /** The walls as drawn. When present the rooms are derived from them (`roomsFromWalls`). */
  walls?: Wall[];
  columns?: Column[];
  beams?: Beam[];
  technical?: TechnicalSetup;
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
  /** Archetype this slot was laid out as. See ARCHETYPES in lib/design/catalog.ts. */
  kind: string;
  /** Resolved product, or null while the slot is still unfilled. */
  product: SceneProduct | null;
  /** True when the user moved/replaced this item, so re-suggesting must not clobber it. */
  pinned?: boolean;
  origin?: ItemOrigin;
  /** Mirrored across its own facing axis (a left-hand corner sofa from a right-hand model). */
  mirrored?: boolean;
  /** Locked pieces do not move on drag; the inspector unlocks them. */
  locked?: boolean;
}

/** The product data the 3D scene and its hover card need. Denormalised on purpose. */
export interface SceneProduct {
  productId: number;
  nameKa: string;
  nameEn?: string | null;
  nameRu?: string | null;
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
  nameEn?: string | null;
  nameRu?: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  rating: number | null;
  deliveryDays: number | null;
  deliveryFeeGel: number | null;
}

/** A part of a floor that gets its own finish — half a bathroom in tile, a rug-sized parquet inlay. */
export interface FinishZone {
  id: string;
  /** Closed polygon in metres, inside the room. */
  polygon: Vec2[];
  name?: string;
}

/**
 * A finish applied to a room surface (floor / walls / ceiling). Without `wallIndex` or
 * `zone` it is the room's base finish for that surface; with `wallIndex` it covers one wall
 * only, with `zone` one patch of the floor — both sit on top of the base finish.
 */
export interface SurfaceFinish {
  roomId: string;
  surface: 'floor' | 'wall' | 'ceiling';
  /** One wall of the room (its polygon edge index) instead of all of them. */
  wallIndex?: number | null;
  /** One patch of the floor instead of all of it. */
  zone?: FinishZone | null;
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

// ---------------------------------------------------------------------------
// Electrical and lighting
// ---------------------------------------------------------------------------

export type ElectricalKind =
  | 'socket'
  | 'socket_double'
  | 'socket_high'
  | 'socket_kitchen'
  | 'switch'
  | 'tv'
  | 'internet'
  | 'light_ceiling'
  | 'light_wall'
  | 'light_spot'
  | 'light_strip'
  | 'light_furniture';

/** The lighting categories the plan distinguishes: primary, secondary, furniture, bedside, indirect, decorative. */
export type LightCategory = 'primary' | 'secondary' | 'furniture' | 'bedside' | 'indirect' | 'decorative';

/**
 * A socket, a switch, a light — on a wall (`wallIndex` + `t`, at `elevationM`), on the
 * ceiling (`light_ceiling`, no wall) or on the floor plan (a strip under a bed). Heights
 * default to the usual practice and are always editable.
 */
export interface ElectricalPoint {
  id: string;
  roomId: string;
  kind: ElectricalKind;
  category?: LightCategory;
  position: Vec2;
  /** Height of the point above the finished floor. Ceiling lights use the room height. */
  elevationM: number;
  /** For wall-mounted points: the room's polygon edge and the spot along it. */
  wallIndex?: number | null;
  t?: number | null;
  /** How many outlets in one plate (a double socket). */
  count?: number;
  /** Lights only: switched on in the 3D view. */
  on?: boolean;
  /** Width along the wall for strips and long fixtures, metres. */
  lengthM?: number;
  /** The catalogue product this fitting is — a real socket, switch or lamp with a price and a model; null while it is only an estimate. */
  product?: SceneProduct | null;
  /** The product's real size, metres, for drawing a model that is not framed as a fixture. */
  sizeM?: { width: number; depth: number; height: number };
  origin?: ElementOrigin;
  locked?: boolean;
}

export interface DesignScene {
  styleId: StyleId;
  mode: DesignMode;
  budgetGel: number | null;
  items: PlacedItem[];
  finishes: SurfaceFinish[];
  /** Sockets, switches and lights. Absent on scenes saved before the layer existed. */
  electrical?: ElectricalPoint[];
  /** How the style was chosen: the five answers of the style test, when it was taken. */
  styleProfile?: StyleProfile | null;
}

/** The result of the style test: one answer per question, and how each style scored. */
export interface StyleProfile {
  answers: Record<string, string>;
  scores: Record<StyleId, number>;
  /** Chosen directly from the four plates instead of through the questions. */
  direct?: boolean;
}

/**
 * A snapshot of the flat the person can always return to. Version 01 is the existing house
 * as it was defined; a new one is kept the first time the walls, doors or windows change,
 * and whenever the person asks for one.
 */
export interface DesignVersion {
  id: string;
  name: string;
  kind: 'existing' | 'auto' | 'manual';
  createdAt: string;
  plan: FloorPlan;
  scene: DesignScene;
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
  /** Every placed product — furniture, decor and the lamps (see `lightingTotal` for those alone). */
  furnitureTotal: number;
  /** The part of `furnitureTotal` that is lighting products. */
  lightingTotal: number;
  /** Floor/wall/ceiling finish products the person chose, in either mode. */
  finishesTotal: number;
  /** Labour from the existing calculator engine. Zero in design_only mode. */
  labourTotal: number;
  /** Bulk renovation materials from the existing engine. Zero in design_only mode. */
  materialsTotal: number;
  deliveryTotal: number;
  /** Doors and windows, estimated. */
  openingsTotal: number;
  /** Sockets, switches, lights, pipes, radiators, air conditioning — materials and their labour. */
  technicalTotal: number;
  grandTotal: number;
  perRoom: Array<{ roomId: string; roomName: string; total: number }>;
  baskets: StoreBasket[];
  /** Every row of the budget with its quantity — see `BudgetLine` in lib/design/pricing.ts. */
  lines: Array<{
    section: 'furniture' | 'lighting' | 'finishes' | 'openings' | 'electrical' | 'plumbing' | 'heating' | 'climate' | 'materials' | 'labour' | 'delivery';
    key: string;
    name?: string;
    roomName?: string;
    qty: number;
    unit: string;
    unitPrice: number;
    total: number;
    estimated: boolean;
  }>;
  /** Square metres per finish product across the flat. */
  coverage: Array<{ product: SceneProduct; areaM2: number; total: number; rooms: string[] }>;
}
