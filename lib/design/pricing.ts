/**
 * Costs a design scene.
 *
 * In `design_only` mode this is just the furniture and the delivery charges. In `full` mode it
 * also folds in the existing calculator engine's bulk materials and labour, so a user who
 * arrived via the 3D studio gets the same numbers a user who arrived via the calculator would.
 */

import type { RateBook } from '@/lib/calculator/rates';
import {
  buildProjectSummary,
  calculateMaterials,
  calculateWorkerCosts,
  estimateMaterialsCost,
} from '@/lib/calculator/materials';
import type { HomeState, Room } from '@/lib/calculator/types';
import { planToCalculatorRooms } from './planGeometry';
import type {
  DesignCost,
  DesignScene,
  FloorPlan,
  SceneStore,
  StoreBasket,
} from './types';
import { getArchetype } from './catalog';

export interface PriceOptions {
  /** Only used in `full` mode; ignored for design-only projects. */
  homeState?: HomeState;
}

export function priceScene(
  plan: FloorPlan,
  scene: DesignScene,
  options: PriceOptions = {}
): DesignCost {
  const roomName = new Map(plan.rooms.map((r) => [r.id, r.name]));

  // --- furniture ---
  let furnitureTotal = 0;
  const perRoom = new Map<string, number>();
  const basketsByStore = new Map<number | 'none', StoreBasket>();

  for (const item of scene.items) {
    const product = item.product;
    if (!product) continue;

    furnitureTotal += product.totalPrice;
    perRoom.set(item.roomId, (perRoom.get(item.roomId) ?? 0) + product.totalPrice);

    const key = product.store?.id ?? 'none';
    let basket = basketsByStore.get(key);
    if (!basket) {
      basket = { store: product.store, lines: [], subtotal: 0, deliveryFee: 0 };
      basketsByStore.set(key, basket);
    }
    basket.lines.push({
      item: getArchetype(item.kind)?.labelKa ?? item.kind,
      roomName: roomName.get(item.roomId) ?? item.roomId,
      product,
    });
    basket.subtotal = round2(basket.subtotal + product.totalPrice);
  }

  // --- surface finishes ---
  // A default finish carries no product and costs nothing; one the user picked is a real
  // tile or paint with a price, in either mode — choosing it is asking for it.
  let finishesTotal = 0;
  {
    for (const finish of scene.finishes) {
      if (!finish.product) continue;
      finishesTotal += finish.product.totalPrice;
      perRoom.set(
        finish.roomId,
        (perRoom.get(finish.roomId) ?? 0) + finish.product.totalPrice
      );

      const key = finish.product.store?.id ?? 'none';
      let basket = basketsByStore.get(key);
      if (!basket) {
        basket = { store: finish.product.store, lines: [], subtotal: 0, deliveryFee: 0 };
        basketsByStore.set(key, basket);
      }
      basket.lines.push({
        item: surfaceLabel(finish.surface),
        roomName: roomName.get(finish.roomId) ?? finish.roomId,
        product: finish.product,
      });
      basket.subtotal = round2(basket.subtotal + finish.product.totalPrice);
    }
  }

  // --- renovation work, when this is not a design-only project ---
  let materialsTotal = 0;
  let labourTotal = 0;
  if (scene.mode === 'full') {
    const rooms: Room[] = planToCalculatorRooms(plan);
    const homeState = options.homeState ?? 'white_frame';
    materialsTotal = estimateMaterialsCost(calculateMaterials(rooms, homeState));
    labourTotal = calculateWorkerCosts(rooms, homeState).reduce((s, w) => s + w.totalGEL, 0);
  }

  // --- delivery, once per store ---
  const baskets = [...basketsByStore.values()].sort((a, b) => b.subtotal - a.subtotal);
  let deliveryTotal = 0;
  for (const basket of baskets) {
    basket.deliveryFee = deliveryFeeFor(basket.store, basket.subtotal);
    deliveryTotal += basket.deliveryFee;
  }

  const grandTotal = round2(
    furnitureTotal + finishesTotal + materialsTotal + labourTotal + deliveryTotal
  );

  return {
    furnitureTotal: round2(furnitureTotal),
    finishesTotal: round2(finishesTotal),
    materialsTotal: round2(materialsTotal),
    labourTotal: round2(labourTotal),
    deliveryTotal: round2(deliveryTotal),
    grandTotal,
    perRoom: plan.rooms.map((room) => ({
      roomId: room.id,
      roomName: room.name,
      total: round2(perRoom.get(room.id) ?? 0),
    })),
    baskets,
  };
}

/**
 * Delivery is charged once per store, and waived above a threshold — which is both how
 * Georgian furniture retail actually works and a real reason for the summary to group the
 * basket by partner rather than showing one flat list.
 */
export const FREE_DELIVERY_THRESHOLD_GEL = 2000;

function deliveryFeeFor(store: SceneStore | null, subtotal: number): number {
  if (!store) return 0;
  if (subtotal >= FREE_DELIVERY_THRESHOLD_GEL) return 0;
  return store.deliveryFeeGel ?? 50;
}

function surfaceLabel(surface: 'floor' | 'wall' | 'ceiling'): string {
  if (surface === 'floor') return 'იატაკის საფარი';
  if (surface === 'wall') return 'კედლის საფარი';
  return 'ჭერის საფარი';
}

/**
 * The full calculator summary, for `full`-mode projects that continue into the materials and
 * labour steps. Reuses the existing engine rather than duplicating any of its rates.
 */
export function fullProjectSummary(
  plan: FloorPlan,
  scene: DesignScene,
  homeState: HomeState,
  book?: RateBook
) {
  const rooms = planToCalculatorRooms(plan);
  const furniture = scene.items
    .map((item) => item.product)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      productId: p.productId,
      nameKa: p.nameKa,
      pricePerUnit: p.pricePerUnit,
      unit: p.unit as never,
      qty: p.qty,
      totalPrice: p.totalPrice,
      imageUrl: p.imageUrl,
      categorySlug: p.categorySlug ?? undefined,
    }));

  const finishes = scene.finishes
    .map((f) => f.product)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      productId: p.productId,
      nameKa: p.nameKa,
      pricePerUnit: p.pricePerUnit,
      unit: p.unit as never,
      qty: p.qty,
      totalPrice: p.totalPrice,
      imageUrl: p.imageUrl,
      categorySlug: p.categorySlug ?? undefined,
    }));

  return buildProjectSummary(rooms, homeState, finishes, furniture, book);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
