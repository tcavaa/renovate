/**
 * Where the home stands today, in the order the selector offers them: the most work first.
 * `old_renovation` is a lived-in flat whose old finishes are stripped out (phase 0) before
 * everything a black frame needs. The list is the source for the Zod enums and the filters.
 */
export const HOME_STATE_VALUES = ['old_renovation', 'black_frame', 'white_frame', 'green_frame'] as const;

export type HomeState = (typeof HOME_STATE_VALUES)[number];

export type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'toilet'
  | 'hallway'
  | 'balcony'
  | 'storage'
  | 'office'
  | 'closet'
  /** An open-plan room — most often a kitchen and a living room — divided by a line into two parts (`RoomSplit`). */
  | 'studio';

/**
 * How a studio is divided: a straight line across the room, at right angles to `axis` — `x`
 * is a line running up the plan at an x, `z` one running across it at a z — placed at the
 * fraction `t` of the room's extent along that axis, so it moves and stretches with the room.
 * `parts[0]` is what lies on the lower side of the line, `parts[1]` the higher. Only read
 * when the room's type is `studio`.
 */
export interface RoomSplit {
  axis: 'x' | 'z';
  t: number;
  parts: [RoomType, RoomType];
}

/** One part of a divided studio, measured: what the estimate prices it as. */
export interface RoomPart {
  type: RoomType;
  floorM2: number;
  /** Its share of the room's walls — the dividing line is not a wall. */
  wallM2: number;
  perimeterM: number;
}

/**
 * The two works that come in two kinds: the floor laid as laminate or parquet, the ceiling as
 * plasterboard (filled and painted) or a stretch ceiling. See `lib/calculator/constants`.
 */
export interface WorkChoices {
  floor: 'laminate' | 'parquet';
  ceiling: 'gypsum' | 'barisol';
}

export type UnitType = 'm2' | 'linear_m' | 'piece' | 'liter' | 'kg' | 'm3' | 'pack' | 'set';

export interface Room {
  id: string;
  type: RoomType;
  nameKa: string;
  width: number;
  length: number;
  height: number;
  floorM2: number;
  wallM2: number;
  ceilingM2: number;
  perimeterM: number;
  isWetRoom: boolean;
  /** Top-left corner on the flat's plan, metres. Set by the plan or the layout editor. */
  x?: number;
  z?: number;
  /** A studio's dividing line, as drawn on the plan. */
  split?: RoomSplit;
  /** A studio's two parts, measured off the plan; the estimate prices each as its own type. */
  parts?: RoomPart[];
}

export interface MaterialItem {
  key: string;
  labelKa: string;
  qty: number;
  unit: UnitType;
  estimatedPriceGEL: number | null;
  linkedCategorySlug: string | null;
}

export interface SelectedProduct {
  productId: number;
  nameKa: string;
  nameEn?: string | null;
  nameRu?: string | null;
  pricePerUnit: number;
  unit: UnitType;
  qty: number;
  totalPrice: number;
  imageUrl: string | null;
  categorySlug?: string;
  /** Set when the product was chosen for one room (its floor or its walls), not for the whole flat. */
  roomId?: string;
  /**
   * A floor or wall material (`lib/calculator/roomFinishes`): which surface of its room it
   * covers, and what the drawing board and the 3D studio need to show it — the texture, the
   * colour, the coverage of one unit and the surface specs — carried from the catalogue row,
   * so neither has to fetch the catalogue to draw it.
   */
  surface?: 'floor' | 'wall';
  slug?: string;
  textureUrl?: string | null;
  colorHex?: string | null;
  coveragePerUnit?: number | null;
  specs?: unknown;
  /**
   * Ticked off the order on the summary: still part of the estimate — it is what the work
   * costs — but not something the person is buying through the platform. The budget, the
   * baskets and the checkout all leave it out.
   */
  excluded?: boolean;
}

/** The calculator's steps: the way in, the plan, the materials, the catalogue (each room's floor and walls, and the rest), the furniture, the summary. */
export type CalculatorStepNumber = 1 | 2 | 3 | 4 | 5 | 6;

export interface CalculatorState {
  homeState: HomeState | null;
  rooms: Room[];
  selectedProducts: Record<string, SelectedProduct>;
  selectedFurniture: Record<string, SelectedProduct[]>;
  step: CalculatorStepNumber;
}

export interface WorkerCost {
  key: string;
  labelKa: string;
  qty: number;
  qtyUnit: 'm2' | 'unit';
  pricePerQty: number;
  totalGEL: number;
}

export interface ProjectSummary {
  rooms: Room[];
  materials: MaterialItem[];
  products: SelectedProduct[];
  furniture: SelectedProduct[];
  workerCosts: WorkerCost[];
  subtotalMaterials: number;
  subtotalProducts: number;
  subtotalFurniture: number;
  subtotalWorkers: number;
  grandTotal: number;
  grandTotalWithMargin: number;
}
