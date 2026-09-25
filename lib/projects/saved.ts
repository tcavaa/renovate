import type { Project } from '@/lib/db/schema';
import type { HomeState, Room, SelectedProduct } from '@/lib/calculator/types';
import type { DesignScene, DesignVersion, FloorPlan, SceneProduct } from '@/lib/design/types';
import type { CalculatorEdits } from '@/lib/summary/calculatorSheet';

/** The slice of a saved project the studio needs to reopen it. Serialisable, so a server page can pass it. */
export interface SavedProjectInput {
  id: number;
  nameKa: string;
  /** A draft opens in the person's own journeys; a saved or ordered project in a workspace of its own (`lib/flow/workspace`). */
  status: 'draft' | 'saved' | 'submitted';
  rooms: Room[];
  homeState: HomeState;
  selectedProducts: Record<string, SelectedProduct>;
  selectedFurniture: Record<string, SelectedProduct[]>;
  /** What was ticked off the calculator's summary and the quantities changed on it. */
  calculatorEdits: CalculatorEdits | null;
  plan: FloorPlan | null;
  scene: DesignScene | null;
  floorPlanUrl: string | null;
  /** The kept versions of the flat, oldest first. */
  versions: DesignVersion[];
  hasCalculator: boolean;
  hasDesign: boolean;
  /** Autosaved before it was calculated (`projectKind`): shown and ordered without figures. */
  calculatorPending: boolean;
  /** Autosaved before it was generated. */
  designPending: boolean;
  /** Where each journey was left, for reopening it there (`calculatorProgress` / `designProgress`). */
  calculatorProgress: { step: number; calculated: boolean };
  designProgress: { step: number; generated: boolean; planFromCalculator?: boolean };
}

export function savedProjectInput(p: Project): SavedProjectInput {
  return {
    id: p.id,
    nameKa: p.nameKa ?? '',
    status: (p.status ?? 'draft') as SavedProjectInput['status'],
    rooms: (p.rooms ?? []) as Room[],
    homeState: p.homeState as HomeState,
    selectedProducts: (p.selectedProducts ?? {}) as Record<string, SelectedProduct>,
    selectedFurniture: (p.selectedFurniture ?? {}) as Record<string, SelectedProduct[]>,
    calculatorEdits: (p.calculatorEdits as CalculatorEdits | null) ?? null,
    plan: (p.plan as FloorPlan | null) ?? null,
    scene: (p.scene as DesignScene | null) ?? null,
    floorPlanUrl: p.floorPlanUrl ?? null,
    versions: Array.isArray(p.versions) ? (p.versions as DesignVersion[]) : [],
    ...projectKind(p),
    calculatorProgress: calculatorProgress(p),
    designProgress: designProgress(p),
  };
}

/**
 * Which halves a project has, and whether each is done. A calculator save writes
 * `selectedProducts` (an empty object when nothing was picked), a design save writes `plan`; a
 * row can have both — that is the point of writing the second journey into the first one's row.
 *
 * A half can exist and not be done yet: a calculation autosaved before "start the calculation"
 * was pressed, a design autosaved before it was generated. Its figures are not an estimate
 * anybody asked for, so a pending half is shown without them, is not stored as the project's
 * totals, and is not ordered (`calculatorPending` / `designPending`). Read from the progress
 * saved with each half; a project saved before that was recorded is done.
 */
export interface ProjectKind {
  hasCalculator: boolean;
  hasDesign: boolean;
  calculatorPending: boolean;
  designPending: boolean;
}

type KindInput = Pick<Project, 'plan' | 'selectedProducts' | 'mode'> & Partial<Pick<Project, 'calculatorEdits' | 'scene' | 'status' | 'selectedFurniture'>>;

export function projectKind(p: KindInput): ProjectKind {
  // A renovation + design project priced materials and labour against a home state in the
  // studio, so its calculation exists even when nothing was picked in the calculator itself.
  const hasCalculator = p.selectedProducts != null || p.mode === 'full';
  const hasDesign = p.plan != null;
  return {
    hasCalculator,
    hasDesign,
    calculatorPending: p.selectedProducts != null && !calculatorProgress(p).calculated,
    designPending: hasDesign && !designProgress(p).generated,
  };
}

/**
 * How far the calculator got. Recorded with every save since September 2026; before that it
 * was not, and a saved or ordered project was finished — but a *draft* could have been left
 * anywhere, so it counts as calculated only when products were already picked for it (they
 * are picked after the calculation), and otherwise goes back to the plan step: pressing
 * "start the calculation" again costs nothing, showing an estimate nobody asked for does.
 */
export function calculatorProgress(p: Pick<KindInput, 'calculatorEdits' | 'status' | 'selectedProducts' | 'selectedFurniture'>): { step: number; calculated: boolean } {
  const recorded = (p.calculatorEdits as CalculatorEdits | null | undefined)?.progress;
  if (recorded) return recorded;
  if (p.status !== 'draft') return { step: 7, calculated: true };
  const picked = Object.keys((p.selectedProducts as object | null) ?? {}).length > 0 || Object.values((p.selectedFurniture as Record<string, unknown[]> | null) ?? {}).some((list) => list.length > 0);
  return picked ? { step: 7, calculated: true } : { step: 2, calculated: false };
}

/**
 * How far the design got, the same way: recorded with the scene, else a saved or ordered
 * project was generated, and a draft was when it has furniture in it (the generation is what
 * furnishes it) — otherwise it goes back to the step before the studio.
 */
export function designProgress(p: Pick<KindInput, 'scene' | 'status'>): { step: number; generated: boolean; planFromCalculator?: boolean } {
  const scene = p.scene as DesignScene | null | undefined;
  if (scene?.progress) return scene.progress;
  if (p.status !== 'draft') return { step: 5, generated: true };
  return (scene?.items?.length ?? 0) > 0 ? { step: 5, generated: true } : { step: 4, generated: false };
}

/** A calculation saved before "start the calculation" was pressed, as the save routes see it: by what was sent. */
export function isCalculatorPending(edits: unknown): boolean {
  return (edits as CalculatorEdits | null | undefined)?.progress?.calculated === false;
}

/** A design saved before it was generated, as the save routes see it. */
export function isDesignPending(scene: unknown): boolean {
  return (scene as DesignScene | null | undefined)?.progress?.generated === false;
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
    nameKa: p.nameKa ?? '',
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
  // The materials step keys a category's pick as `<slug>_global`; the same key here is what
  // makes the studio's floor show as the chosen laminate there.
  const selectedProducts: Record<string, SelectedProduct> = {};
  for (const finish of scene.finishes) {
    const slug = finish.product?.categorySlug;
    if (!finish.product || !slug) continue;
    const key = `${slug}_global`;
    if (selectedProducts[key]) continue;
    selectedProducts[key] = toSelected(finish.product);
  }
  return { selectedProducts, selectedFurniture };
}
