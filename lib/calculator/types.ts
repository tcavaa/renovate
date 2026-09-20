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
  | 'closet';

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
  /** Set when the product was chosen for one room (a finish), not for the whole flat. */
  roomId?: string;
  /**
   * Ticked off the order on the summary: still part of the estimate — it is what the work
   * costs — but not something the person is buying through the platform. The budget, the
   * baskets and the checkout all leave it out.
   */
  excluded?: boolean;
}

export interface CalculatorState {
  homeState: HomeState | null;
  rooms: Room[];
  selectedProducts: Record<string, SelectedProduct>;
  selectedFurniture: Record<string, SelectedProduct[]>;
  step: 1 | 2 | 3 | 4 | 5;
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
