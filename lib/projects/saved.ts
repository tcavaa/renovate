import type { Project } from '@/lib/db/schema';
import type { HomeState, Room, SelectedProduct } from '@/lib/calculator/types';
import type { DesignScene, FloorPlan } from '@/lib/design/types';

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
export function projectKind(p: Pick<Project, 'plan' | 'selectedProducts'>): { hasCalculator: boolean; hasDesign: boolean } {
  return { hasCalculator: p.selectedProducts != null, hasDesign: p.plan != null };
}
