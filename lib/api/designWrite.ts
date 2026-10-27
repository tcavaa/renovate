import { isDesignPending, projectKind } from '@/lib/projects/saved';
import { projects, type Project } from '@/lib/db/schema';
import { planToCalculatorRooms, totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { decorProductIds } from '@/lib/design/decor/quantities';
import { isDecorUnit } from '@/lib/design/decor/materials';
import { priceScene } from '@/lib/design/pricing';
import { quantityFor } from '@/lib/design/matcher';
import { isCustomKitchenItem, kitchenFacadeM2 } from '@/lib/design/kitchen';
import { finishQuantity } from '@/lib/design/finishQuantity';
import { isTrimSurface } from '@/lib/design/trims';
import type { DesignScene, DesignVersion, FloorPlan } from '@/lib/design/types';
import type { HomeState } from '@/lib/calculator/types';
import { loadProductPrices, planProductIds, repriceFinishSnapshot, repriceItemSnapshot, repricePlan, repriceSnapshot } from '@/lib/api/productPrices';
import { loadRateBook } from '@/lib/api/rateBook';
import { calculatorPickIds, refusedSceneChange } from '@/lib/plans/sceneGuard';
import { featureAccess, type PlanAccount } from '@/lib/plans/server';
import type { PlanFeature, PlanId } from '@/lib/plans/plans';

/**
 * Writing a project's 3D design into its row, as one function for the two writers: the design's
 * save route (`POST /api/design/projects`, what the browser sends) and the server's generation job
 * (`lib/api/designJob`, the flat it laid out). Each checks its own revision and writes the columns
 * this returns; what is written is the same either way — every product repriced from the
 * catalogue, the budget worked out on the server, the columns the calculation owns left alone.
 */

export interface DesignWriteInput {
  plan: FloorPlan;
  scene: DesignScene;
  /** The studio's own choice: the calculation owns the home state when the project has one. */
  homeState: HomeState | null;
  floorPlanUrl: string | null;
  /** The kept versions, when they are to be written (a save that names none keeps the row's). */
  versions?: DesignVersion[];
  /** An autosave or a draft leaves the status alone; an explicit save confirms a draft. */
  draft: boolean;
}

export type DesignWrite = { ok: true; set: Partial<typeof projects.$inferInsert>; cost: ReturnType<typeof priceScene> } | { ok: false; error: string; status: number };

/**
 * The columns a design write sets (not the revision or the save id — the writer's own), or why it
 * cannot be written: a product the catalogue does not know, a finish on a room the plan has not got.
 *
 * The client's prices and quantities are a preview. Every product snapshot in the scene is
 * repriced from the catalogue and re-quantified from the slot or the room before anything is
 * summed or stored, so a figure edited in devtools never becomes the record. That goes for the
 * plan's snapshots as much as the scene's: a door, a socket and a radiator are order lines a store
 * is sent, exactly as a sofa is.
 */
export async function designWriteColumns(existing: Project, input: DesignWriteInput): Promise<DesignWrite> {
  // The home's condition belongs to the calculation when the project has one; the studio's own
  // choice counts only in a project designed first.
  const calculatorOwns = existing.selectedProducts != null;
  const calculatorDone = calculatorOwns && !projectKind(existing).calculatorPending;
  const homeState = (calculatorOwns ? existing.homeState : input.homeState) ?? null;
  const submittedPlan = input.plan;
  const submitted = input.scene;
  const roomsById = new Map(submittedPlan.rooms.map((r) => [r.id, r]));

  const known = await loadProductPrices([
    ...[...submitted.items.flatMap((i) => [i.product?.productId, i.kitchenMaterial?.productId]), ...submitted.finishes.map((f) => f.product?.productId)].filter((id): id is number => typeof id === 'number'),
    ...decorProductIds(submitted.decor),
    ...planProductIds(submittedPlan, submitted.electrical ?? []),
  ]);

  // Doors and windows are bought one apiece; a radiator by the section, as many as its room
  // calls for; a double socket is two plates and a strip is bought by the metre (`repricePlan`).
  const { plan, electrical, unknown: unknownProducts } = repricePlan(submittedPlan, submitted.electrical, known);
  if (unknownProducts.length > 0) return { ok: false, error: `Unknown product ${unknownProducts[0]}`, status: 400 };

  const scene: DesignScene = { ...submitted, items: [], finishes: [], ...(electrical ? { electrical } : {}), ...(submitted.decor ? { decor: [] } : {}) };
  for (const item of submitted.items) {
    // A made-to-measure kitchen's material is bought by the façade the piece has (`lib/design/kitchen`),
    // and only a product the catalogue sells by the m² is one: anything else is dropped, and the
    // kitchen is the joiner's estimate again rather than a per-piece price times square metres.
    let kitchenMaterial = item.kitchenMaterial;
    if (kitchenMaterial) {
      const repriced = repriceSnapshot(kitchenMaterial, known, kitchenFacadeM2(item));
      if (!repriced) return { ok: false, error: `Unknown product ${kitchenMaterial.productId}`, status: 400 };
      kitchenMaterial = known.get(kitchenMaterial.productId)?.unit === 'm2' ? { ...repriced, unit: 'm2' } : undefined;
    }
    const { kitchenMaterial: _sent, ...bare } = item;
    // A kitchen that was made to measure stays so with its material dropped — the estimate —
    // rather than turning into a shop's unit at its model's price (`isCustomKitchenItem`).
    const madeToMeasure = isCustomKitchenItem(item) ? { custom: true } : {};
    const withMaterial = kitchenMaterial ? { ...bare, ...madeToMeasure, kitchenMaterial } : { ...bare, ...madeToMeasure };
    if (!item.product) {
      scene.items.push(withMaterial);
      continue;
    }
    // In its material variant, if it has one: the catalogue's price and look for it (`lib/design/variants`).
    const product = repriceItemSnapshot(item.product, known, quantityFor(item));
    if (!product) return { ok: false, error: `Unknown product ${item.product.productId}`, status: 400 };
    scene.items.push({ ...withMaterial, product });
  }
  for (const finish of submitted.finishes) {
    if (!finish.product) {
      scene.finishes.push(finish);
      continue;
    }
    const room = roomsById.get(finish.roomId);
    if (!room) return { ok: false, error: `Unknown room ${finish.roomId}`, status: 400 };
    // What the finish covers decides the quantity (one wall, a strip, a zone, painted tiles,
    // the whole room); a moulding is sold by the metre at its own price, the rest per m².
    const quantity = finishQuantity(room, finish);
    const product = isTrimSurface(finish.surface) ? repriceSnapshot(finish.product, known, quantity) : repriceFinishSnapshot(finish.product, known, quantity);
    if (!product) return { ok: false, error: `Unknown product ${finish.product.productId}`, status: 400 };
    scene.finishes.push({ ...finish, product });
  }

  // Decor: each material is the catalogue's at its price and unit now — the budget measures how
  // much a piece uses from its geometry (`decorPurchases`), so only the unit price is taken from here.
  // A material the catalogue no longer sells by a unit decor can be measured in is dropped from its slot.
  for (const piece of submitted.decor ?? []) {
    if (!roomsById.has(piece.roomId)) continue;
    const materials: typeof piece.materials = {};
    for (const [slot, material] of Object.entries(piece.materials) as Array<[keyof typeof piece.materials, NonNullable<(typeof piece.materials)[keyof typeof piece.materials]>]>) {
      if (!material.product) {
        materials[slot] = material;
        continue;
      }
      const price = known.get(material.product.productId);
      const repriced = repriceSnapshot(material.product, known, 1);
      if (!price || !repriced) return { ok: false, error: `Unknown product ${material.product.productId}`, status: 400 };
      if (!isDecorUnit(price.unit)) continue;
      materials[slot] = { ...material, product: { ...repriced, unit: price.unit } };
    }
    scene.decor!.push({ ...piece, materials });
  }

  // Same rate book the studio's cost bar used, so a `full`-mode save matches the preview.
  const cost = priceScene(plan, scene, { homeState: homeState ?? undefined, book: await loadRateBook() });
  const rooms = planToCalculatorRooms(plan);

  const designColumns = {
    // The columns the two halves share are the calculation's once it exists: its home state,
    // its rooms and area, and — once it has been worked out — the renovation it makes of the
    // project. The design writes them only for a project designed first.
    ...(calculatorOwns ? {} : { homeState, totalM2: String(totalFloorAreaM2(plan)), rooms }),
    ...(calculatorDone ? {} : { mode: scene.mode }),
    styleId: scene.styleId,
    budgetGel: scene.budgetGel != null ? String(scene.budgetGel) : null,
    floorPlanUrl: input.floorPlanUrl ?? plan.imageUrl ?? null,
    plan,
    scene,
    // Versions are snapshots the person keeps to come back to; they are stored as sent (the
    // live scene above is the one that is repriced).
    ...(input.versions ? { versions: input.versions } : {}),
  };
  // Autosaved before it was generated: the flat and the choices so far are kept, but its
  // budget is not the project's total yet (in a renovation it would be the works alone).
  const pending = isDesignPending(scene);
  const costColumns = {
    totalMaterialsCost: String(cost.materialsTotal + cost.finishesTotal + cost.technicalTotal + cost.openingsTotal),
    totalFurnitureCost: String(cost.furnitureTotal),
    totalWorkersCost: String(cost.labourTotal),
    // What to plan with, as the calculator stores it: the sheet and a renovation's contingency.
    totalCost: String(Math.round((cost.grandTotal + cost.contingencyTotal) * 100) / 100),
  };
  const noCosts = { totalMaterialsCost: null, totalFurnitureCost: null, totalWorkersCost: null, totalCost: null };

  return {
    ok: true,
    cost,
    set: {
      ...designColumns,
      // A calculation already worked out keeps the scene a renovation, whatever this copy says.
      ...(calculatorDone && scene.mode !== 'full' ? { scene: { ...scene, mode: 'full' as const } } : {}),
      // A pending design leaves a finished calculation's totals where they are.
      ...(pending ? (calculatorDone ? {} : noCosts) : costColumns),
      // An explicit save confirms a draft; an autosave leaves the status as it is.
      ...(!input.draft && existing.status === 'draft' ? { status: 'saved' as const } : {}),
    },
  };
}

/**
 * The studio's locks on the server (docs/subscriptions.md): against the design stored, the change
 * the account's plan does not allow, or null. What happens by itself on every plan (a generation,
 * the designer's check, the calculator's picks, a wall moved) passes (`refusedSceneChange`).
 */
export async function refusedDesignChange(existing: Project, next: { plan: FloorPlan; scene: DesignScene }, account: PlanAccount): Promise<{ feature: PlanFeature; plan: PlanId | null } | null> {
  const access = await featureAccess(account);
  const catalog = access.has('catalog');
  const moveFurniture = access.has('moveFurniture');
  if (catalog && moveFurniture) return null;
  const refused = refusedSceneChange(
    { plan: existing.plan as FloorPlan | null, scene: existing.scene as DesignScene | null },
    next,
    { catalog, moveFurniture, picks: calculatorPickIds(existing.selectedProducts, existing.selectedFurniture) }
  );
  return refused ? { feature: refused, plan: access.needs(refused) } : null;
}
