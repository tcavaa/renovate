export type HomeState = 'black_frame' | 'white_frame' | 'green_frame';

export type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'toilet'
  | 'hallway'
  | 'balcony'
  | 'storage'
  | 'office';

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
