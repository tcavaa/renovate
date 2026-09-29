import { calculationInput, projectKind } from '@/lib/projects/saved';
import type { Project } from '@/lib/db/schema';
import type { HomeState, SelectedProduct } from '@/lib/calculator/types';
import type { RateBook } from '@/lib/calculator/rates';
import { loadProductStores } from '@/lib/api/productPrices';
import { priceScene, type BudgetLine } from '@/lib/design/pricing';
import type { DesignScene, FloorPlan } from '@/lib/design/types';
import { basketLabels } from '@/lib/i18n/labels';
import type { Dictionary } from '@/lib/i18n/ka';
import type { Locale } from '@/lib/i18n';
import { calculatorSheet, type CalculatorSheet } from '@/lib/summary/calculatorSheet';

/**
 * A saved project as the two sheets it was summarised on — the calculator's and the
 * design's — each with what the person made of it laid over what was worked out.
 *
 * Nothing about "the original" is stored. The row keeps the rooms, the picks, the scene and
 * the edits (`calculatorEdits`, `scene.excluded`, `scene.quantities`); both the sheet as it
 * was left and the sheet as it was worked out are priced from those, here, with the rate
 * book of the day. That is why a project page can always show what was changed: a line
 * ticked off is still on the sheet, struck through, and a quantity that was changed still
 * has the calculated one beside it.
 */
export interface DesignSheet {
  lines: BudgetLine[];
  grandTotal: number;
  /** The renovation's contingency, when the design is one (`DesignCost.contingencyTotal`). */
  contingency: number;
  /** The grand total with no edit applied; absent when nothing was edited. */
  originalGrandTotal: number | null;
  /** The contingency of that unedited sheet. */
  originalContingency: number | null;
  excludedCount: number;
  changedCount: number;
}

export interface ProjectSheets {
  calculator: CalculatorSheet | null;
  design: DesignSheet | null;
  /** A half that was left before it was done (`projectKind`): it has no sheet, and says so. */
  calculatorPending: boolean;
  designPending: boolean;
}

export async function loadProjectSheets(project: Project, book: RateBook, t: Dictionary, locale: Locale): Promise<ProjectSheets> {
  // Null on a project still on its first step: no calculation to show, and a design prices without one.
  const homeState = (project.homeState ?? undefined) as HomeState | undefined;
  const hasDesign = project.plan != null && project.scene != null;
  // A half left before it was calculated or generated has no figures to show.
  const kind = projectKind(project);

  // The calculator's half: only when the calculator itself was used. A renovation designed
  // first also "has a calculation" (it priced works against a home state), but its materials
  // and labour are the design sheet's — shown there, not twice.
  let calculator: CalculatorSheet | null = null;
  if ((project.selectedProducts != null || !hasDesign) && !kind.calculatorPending && homeState) {
    // Priced as the design prices it (`calculationCost`): the board, its fittings, the picks.
    const selectedProducts = (project.selectedProducts ?? {}) as Record<string, SelectedProduct>;
    const selectedFurniture = (project.selectedFurniture ?? {}) as Record<string, SelectedProduct[]>;
    const shops = await loadProductStores([...Object.values(selectedProducts), ...Object.values(selectedFurniture).flat()].map((p) => p.productId));
    const input = calculationInput(project, { book, locale, storeOf: (id) => shops.get(id) ?? null, ...basketLabels(t) });
    if (input) calculator = calculatorSheet(input);
  }

  let design: DesignSheet | null = null;
  if (hasDesign && !kind.designPending) {
    const plan = project.plan as FloorPlan;
    const scene = project.scene as DesignScene;
    const options = { homeState, book, locale, ...basketLabels(t) };
    const cost = priceScene(plan, scene, options);
    const edited = (scene.excluded?.length ?? 0) > 0 || Object.keys(scene.quantities ?? {}).length > 0;
    const original = edited ? priceScene(plan, { ...scene, excluded: [], quantities: {} }, options) : null;
    design = {
      lines: cost.lines,
      grandTotal: cost.grandTotal,
      contingency: cost.contingencyTotal,
      originalGrandTotal: original ? original.grandTotal : null,
      originalContingency: original ? original.contingencyTotal : null,
      excludedCount: cost.lines.filter((l) => l.excluded).length,
      changedCount: cost.lines.filter((l) => l.originalQty != null && !l.excluded).length,
    };
  }
  return { calculator, design, calculatorPending: kind.calculatorPending, designPending: kind.designPending };
}
