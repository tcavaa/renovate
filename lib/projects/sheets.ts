import { inArray } from 'drizzle-orm';
import { projectKind } from '@/lib/projects/saved';
import { db } from '@/lib/db';
import { products, stores, type Project } from '@/lib/db/schema';
import { buildProjectSummary } from '@/lib/calculator/materials';
import type { HomeState, Room, SelectedProduct } from '@/lib/calculator/types';
import type { RateBook } from '@/lib/calculator/rates';
import { priceScene, type BudgetLine } from '@/lib/design/pricing';
import type { DesignScene, FloorPlan, SceneStore } from '@/lib/design/types';
import { basketLabels } from '@/lib/i18n/labels';
import type { Dictionary } from '@/lib/i18n/ka';
import type { Locale } from '@/lib/i18n';
import { calculatorSheet, type CalculatorEdits, type CalculatorSheet } from '@/lib/summary/calculatorSheet';

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
  /** The grand total with no edit applied; absent when nothing was edited. */
  originalGrandTotal: number | null;
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

/** The shops that sell these products, as the snapshots a sheet line carries. */
async function storesOf(productIds: number[]): Promise<Map<number, SceneStore>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: products.id, storeId: products.storeId }).from(products).where(inArray(products.id, ids));
  const storeIds = [...new Set(rows.map((r) => r.storeId).filter((id): id is number => id != null))];
  if (storeIds.length === 0) return new Map();
  const shops = await db.select().from(stores).where(inArray(stores.id, storeIds));
  const byId = new Map(
    shops.map((s): [number, SceneStore] => [
      s.id,
      { id: s.id, nameKa: s.nameKa, nameEn: s.nameEn, nameRu: s.nameRu, logoUrl: s.logoUrl, websiteUrl: s.websiteUrl, phone: s.phone, address: s.address, city: s.city, rating: s.rating == null ? null : Number(s.rating), deliveryDays: s.deliveryDays, deliveryFeeGel: s.deliveryFeeGel == null ? null : Number(s.deliveryFeeGel) },
    ])
  );
  const out = new Map<number, SceneStore>();
  for (const row of rows) {
    const shop = row.storeId != null ? byId.get(row.storeId) : undefined;
    if (shop) out.set(row.id, shop);
  }
  return out;
}

export async function loadProjectSheets(project: Project, book: RateBook, t: Dictionary, locale: Locale): Promise<ProjectSheets> {
  const rooms = (project.rooms ?? []) as Room[];
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
    const selectedProducts = (project.selectedProducts ?? {}) as Record<string, SelectedProduct>;
    const selectedFurniture = (project.selectedFurniture ?? {}) as Record<string, SelectedProduct[]>;
    const picks = [...Object.values(selectedProducts), ...Object.values(selectedFurniture).flat()];
    const shops = await storesOf(picks.map((p) => p.productId));
    const summary = buildProjectSummary(rooms, homeState, Object.values(selectedProducts), Object.values(selectedFurniture).flat(), book, { choices: (project.calculatorEdits as CalculatorEdits | null)?.choices });
    calculator = calculatorSheet(summary, { selectedProducts, selectedFurniture }, { rooms, edits: (project.calculatorEdits ?? null) as CalculatorEdits | null, storeOf: (id) => shops.get(id) ?? null });
  }

  let design: DesignSheet | null = null;
  if (hasDesign && !kind.designPending) {
    const plan = project.plan as FloorPlan;
    const scene = project.scene as DesignScene;
    const options = { homeState, book, locale, ...basketLabels(t) };
    const cost = priceScene(plan, scene, options);
    const edited = (scene.excluded?.length ?? 0) > 0 || Object.keys(scene.quantities ?? {}).length > 0;
    design = {
      lines: cost.lines,
      grandTotal: cost.grandTotal,
      originalGrandTotal: edited ? priceScene(plan, { ...scene, excluded: [], quantities: {} }, options).grandTotal : null,
      excludedCount: cost.lines.filter((l) => l.excluded).length,
      changedCount: cost.lines.filter((l) => l.originalQty != null && !l.excluded).length,
    };
  }
  return { calculator, design, calculatorPending: kind.calculatorPending, designPending: kind.designPending };
}
