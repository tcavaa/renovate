import type { Project } from '@/lib/db/schema';
import { CALCULATOR_STEPS, fromSevenSteps } from '@/lib/calculator/steps';
import { selectionKey } from '@/lib/calculator/quantities';
import { isBaseFinish } from '@/lib/design/zones';
import type { HomeState, Room, SelectedProduct } from '@/lib/calculator/types';
import type { DesignProgress, DesignScene, DesignVersion, FloorPlan, SceneProduct, SurfaceFinish } from '@/lib/design/types';
import type { CalculatorEdits } from '@/lib/summary/calculatorSheet';
import { DEFAULT_WALL_THICKNESS_M } from '@/lib/design/planGeometry';
import { DEFAULT_WALL_HEIGHT_M } from '@/lib/design/walls';

/**
 * The calculator's own drawing board as a project keeps it (`projects.calculator_board`): the
 * plan drawn or uploaded on its plan step, the image it was read from, and the finishes laid on
 * its placement step. Not `plan` — that column is the 3D design's, and its presence is what
 * says a project has one.
 */
export interface CalculatorBoard {
  plan: FloorPlan | null;
  floorPlanUrl: string | null;
  finishes: SurfaceFinish[];
}

/** How far the calculator got, and the page last open (`lib/flow/resume`). */
export interface CalculatorProgress {
  step: number;
  calculated: boolean;
  at?: number | null;
  /** Recorded in the six-step numbering (since 26 September 2026); without it the steps are the old seven (`fromSevenSteps`). */
  steps?: number;
}

/**
 * The whole of a project as the steps open it (`ProjectGate`) — both halves, whichever journey
 * is being opened, because each reads the other: the calculator's summary offers the design,
 * the design's budget orders the calculation with it. Serialisable, so a server layout can
 * pass it.
 */
export interface SavedProjectInput {
  id: number;
  nameKa: string;
  status: 'draft' | 'saved' | 'submitted';
  /** The row's last write (ms). */
  updatedAt: number;
  /** Each half's revision: what a browser's cache of it is compared with, and what a save is made from (`lib/flow/projectSync`). */
  calculatorRev: number;
  designRev: number;
  rooms: Room[];
  /** Null until the calculator's first step (or the design's "renovation + design") chose it. */
  homeState: HomeState | null;
  selectedProducts: Record<string, SelectedProduct>;
  selectedFurniture: Record<string, SelectedProduct[]>;
  /** What was ticked off the calculator's summary and the quantities changed on it. */
  calculatorEdits: CalculatorEdits | null;
  /** The calculator's drawing board, when it has saved one. */
  calculatorBoard: CalculatorBoard | null;
  /** The calculator has written its half (`selectedProducts IS NOT NULL`) — as opposed to a design-first project it has never opened. */
  calculatorStarted: boolean;
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
  calculatorProgress: CalculatorProgress;
  designProgress: DesignProgress;
}

export function savedProjectInput(p: Project): SavedProjectInput {
  const board = p.calculatorBoard as Partial<CalculatorBoard> | null;
  return {
    id: p.id,
    nameKa: p.nameKa ?? '',
    status: (p.status ?? 'draft') as SavedProjectInput['status'],
    updatedAt: new Date(p.updatedAt).getTime(),
    calculatorRev: p.calculatorRev ?? 0,
    designRev: p.designRev ?? 0,
    rooms: (p.rooms ?? []) as Room[],
    homeState: (p.homeState as HomeState | null) ?? null,
    selectedProducts: (p.selectedProducts ?? {}) as Record<string, SelectedProduct>,
    selectedFurniture: (p.selectedFurniture ?? {}) as Record<string, SelectedProduct[]>,
    calculatorEdits: (p.calculatorEdits as CalculatorEdits | null) ?? null,
    calculatorBoard: board ? { plan: board.plan ?? null, floorPlanUrl: board.floorPlanUrl ?? null, finishes: board.finishes ?? [] } : null,
    calculatorStarted: p.selectedProducts != null,
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
export function calculatorProgress(p: Pick<KindInput, 'calculatorEdits' | 'status' | 'selectedProducts' | 'selectedFurniture'>): CalculatorProgress {
  const recorded = (p.calculatorEdits as CalculatorEdits | null | undefined)?.progress;
  // Recorded before the placement step went (seven steps, no `steps: 6`): read in today's six.
  if (recorded) return recorded.steps === CALCULATOR_STEPS ? recorded : { ...recorded, step: fromSevenSteps(recorded.step), at: recorded.at != null ? fromSevenSteps(recorded.at) : recorded.at, steps: CALCULATOR_STEPS };
  if (p.status !== 'draft') return { step: CALCULATOR_STEPS, calculated: true };
  const picked = Object.keys((p.selectedProducts as object | null) ?? {}).length > 0 || Object.values((p.selectedFurniture as Record<string, unknown[]> | null) ?? {}).some((list) => list.length > 0);
  return picked ? { step: CALCULATOR_STEPS, calculated: true } : { step: 2, calculated: false };
}

/**
 * How far the design got, the same way: recorded with the scene, else a saved or ordered
 * project was generated, and a draft was when it has furniture in it (the generation is what
 * furnishes it) — otherwise it goes back to the step before the studio.
 */
export function designProgress(p: Pick<KindInput, 'scene' | 'status'>): DesignProgress {
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
 * item becomes that room's furniture, and each room's floor and walls (its whole-room finish,
 * when it has a product) become that room's floor and wall picks — the catalogue step's own
 * shape (`lib/calculator/roomFinishes`), counted from the room when the calculator opens it.
 * The calculator can then adjust rather than choose again, and its save writes the same
 * products back into the row.
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
  // A room's floor and walls are keyed by the room (`<slug>_room:<roomId>`), as the catalogue
  // step keys them; tiles, strips and zones of a product say nothing about the whole room.
  const selectedProducts: Record<string, SelectedProduct> = {};
  for (const finish of scene.finishes) {
    const slug = finish.product?.categorySlug;
    if (!finish.product || !slug || (finish.surface !== 'floor' && finish.surface !== 'wall') || !isBaseFinish(finish)) continue;
    selectedProducts[selectionKey(slug, finish.roomId)] = {
      ...toSelected(finish.product),
      roomId: finish.roomId,
      surface: finish.surface,
      slug: finish.product.slug || undefined,
      textureUrl: finish.textureUrl,
      colorHex: finish.colorHex,
    };
  }
  return { selectedProducts, selectedFurniture };
}

/**
 * The blank sheet a new design project starts on (`POST /api/projects/create`): no rooms, no
 * walls. `plan IS NOT NULL` is what lists a project in the design hub, so a design project has
 * one from the moment it is named; step 1 replaces it with the uploaded plan or keeps it to
 * draw on.
 */
export function emptyPlan(): FloorPlan {
  return { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM: DEFAULT_WALL_THICKNESS_M, wallHeightM: DEFAULT_WALL_HEIGHT_M, walls: [] };
}

/** The scene of a design project that has not left its first step: nothing in it, nothing answered. */
export function emptyScene(): DesignScene {
  return {
    styleId: 'scandinavian',
    mode: 'design_only',
    budgetGel: null,
    items: [],
    finishes: [],
    electrical: [],
    styleProfile: null,
    progress: { step: 1, generated: false, planFromCalculator: false, at: 1, modeChosen: false, emptyStart: false },
  };
}
