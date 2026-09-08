import type { Project } from '@/lib/db/schema';
import type { HomeState, Room, SelectedProduct } from '@/lib/calculator/types';
import type { DesignScene, FloorPlan, SceneProduct } from '@/lib/design/types';

/** The slice of a saved project the studio needs to reopen it. Serialisable, so a server page can pass it. */
export interface SavedProjectInput {
  id: number;
  rooms: Room[];
  homeState: HomeState;
  selectedProducts: Record<string, SelectedProduct>;
  selectedFurniture: Record<string, SelectedProduct[]>;
  plan: FloorPlan | null;
  scene: DesignScene | null;
  floorPlanUrl: string | null;
  hasCalculator: boolean;
  hasDesign: boolean;
}

export function savedProjectInput(p: Project): SavedProjectInput {
  return {
    id: p.id,
    rooms: (p.rooms ?? []) as Room[],
    homeState: p.homeState as HomeState,
    selectedProducts: (p.selectedProducts ?? {}) as Record<string, SelectedProduct>,
    selectedFurniture: (p.selectedFurniture ?? {}) as Record<string, SelectedProduct[]>,
    plan: (p.plan as FloorPlan | null) ?? null,
    scene: (p.scene as DesignScene | null) ?? null,
    floorPlanUrl: p.floorPlanUrl ?? null,
    ...projectKind(p),
  };
}

/**
 * Which halves a project has. A calculator save writes `selectedProducts` (an empty object
 * when nothing was picked), a design save writes `plan`; a row can have both — that is the
 * point of writing the second journey into the first one's row.
 */
export function projectKind(p: Pick<Project, 'plan' | 'selectedProducts' | 'mode'>): { hasCalculator: boolean; hasDesign: boolean } {
  // A renovation + design project priced materials and labour against a home state in the
  // studio, so its calculation exists even when nothing was picked in the calculator itself.
  return { hasCalculator: p.selectedProducts != null || p.mode === 'full', hasDesign: p.plan != null };
}

/**
 * The studio's products as the calculator's picks, for a project designed first: every placed
 * item becomes that room's furniture, the first finish of each category becomes the
 * category's material. The calculator can then adjust rather than choose again, and its
 * save writes the same products back into the row.
 */
export function picksFromScene(scene: DesignScene): { selectedProducts: Record<string, SelectedProduct>; selectedFurniture: Record<string, SelectedProduct[]> } {
  const toSelected = (p: SceneProduct): SelectedProduct => ({
    productId: p.productId,
    nameKa: p.nameKa,
    nameEn: p.nameEn ?? null,
    nameRu: p.nameRu ?? null,
    pricePerUnit: p.pricePerUnit,
    unit: p.unit as SelectedProduct['unit'],
    qty: p.qty,
    totalPrice: p.totalPrice,
    imageUrl: p.imageUrl,
    categorySlug: p.categorySlug ?? undefined,
  });
  const selectedFurniture: Record<string, SelectedProduct[]> = {};
  for (const item of scene.items) {
    if (!item.product) continue;
    (selectedFurniture[item.roomId] ??= []).push(toSelected(item.product));
  }
  const selectedProducts: Record<string, SelectedProduct> = {};
  for (const finish of scene.finishes) {
    const slug = finish.product?.categorySlug;
    if (!finish.product || !slug || selectedProducts[slug]) continue;
    selectedProducts[slug] = toSelected(finish.product);
  }
  return { selectedProducts, selectedFurniture };
}
