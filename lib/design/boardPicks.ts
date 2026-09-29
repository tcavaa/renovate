/**
 * Products chosen for the whole flat, put on the flat: a door on every interior door (an
 * entrance door on the front door), a window on every window, a radiator on every radiator —
 * its sections counted from its room — a socket, switch or light on every fitting of its kind,
 * a skirting board or cornice round every room.
 *
 * One rule for both halves of a project. The calculator prices its board dressed this way
 * from its picks (`boardWithPicks`); the design puts the same picks on its plan, as the
 * catalogue's products (`applyBoardPicks`). Both count the same doors, radiators and fittings,
 * in the same products — and, the catalogue's products carrying their shops, both send each
 * one to the same shop, which is what its basket and its delivery are made of.
 */

import { FIXTURE_PRODUCT_KIND, withFixtureProduct } from './electrical';
import { toSceneProduct, type CatalogProduct } from './matcher';
import { withRadiatorProduct } from './radiators';
import { trimFromProduct } from './trims';
import type { ElectricalPoint, FloorPlan, SurfaceFinish } from './types';

/**
 * What a product chosen for the whole flat is put on: its kind of door, window, radiator or
 * fitting, or a moulding round every room. Null for what the plan has no place for — sanitary
 * ware, a pendant — which stays a line of its own.
 */
export type PickTarget = 'door' | 'entrance_door' | 'window' | 'radiator' | 'skirting' | 'cornice' | { fixture: string };

export function pickTarget(product: { model3dKind?: string | null; categorySlug?: string | null }): PickTarget | null {
  const kind = product.model3dKind ?? null;
  if (kind === 'door' || kind === 'entrance_door' || kind === 'window' || kind === 'radiator') return kind;
  if (kind && Object.values(FIXTURE_PRODUCT_KIND).includes(kind)) return { fixture: kind };
  if (product.categorySlug === 'skirting' || product.categorySlug === 'cornice') return product.categorySlug;
  // A product with no model of its own, chosen in the tab that says what it is.
  if (!kind && product.categorySlug === 'doors') return 'door';
  if (!kind && product.categorySlug === 'windows') return 'window';
  if (!kind && product.categorySlug === 'radiators') return 'radiator';
  return null;
}

export interface DressedBoard {
  plan: FloorPlan;
  electrical: ElectricalPoint[];
  /** The mouldings chosen for the whole flat, one per room. */
  trims: SurfaceFinish[];
  /** How many of the plan's elements each product was put on, by the key it came with; one missing here found none. */
  placed: Record<string, number>;
}

/** The plan and its fittings with each product on everything of its kind (see the module's note). */
export function dressBoard(board: FloorPlan, electrical: ElectricalPoint[], products: Array<{ key: string; product: CatalogProduct }>): DressedBoard {
  let plan = board;
  let fittings = electrical;
  const trims: SurfaceFinish[] = [];
  const placed: Record<string, number> = {};
  for (const { key, product } of products) {
    const target = pickTarget(product);
    if (!target) continue;
    let n = 0;
    if (target === 'door' || target === 'entrance_door' || target === 'window') {
      const wanted = (o: { kind: string; exterior: boolean }) => (target === 'window' ? o.kind === 'window' : o.kind === 'door' && o.exterior === (target === 'entrance_door'));
      const bought = toSceneProduct(product, 1);
      plan = {
        ...plan,
        rooms: plan.rooms.map((room) =>
          room.openings.some(wanted)
            ? {
                ...room,
                openings: room.openings.map((o) => {
                  if (!wanted(o)) return o;
                  // An interior door is two halves; it is one door.
                  if (!o.connectsToRoomId || room.id < o.connectsToRoomId) n += 1;
                  return { ...o, product: bought };
                }),
              }
            : room
        ),
      };
    } else if (target === 'radiator') {
      const points = plan.technical?.points ?? [];
      const hung = points.filter((p) => p.kind === 'radiator').length;
      if (hung > 0) {
        const staged = plan;
        plan = { ...plan, technical: { ...plan.technical, points: points.map((p) => (p.kind === 'radiator' ? withRadiatorProduct(staged, p, product) : p)) } };
        n = hung;
      }
    } else if (target === 'skirting' || target === 'cornice') {
      for (const room of plan.rooms) {
        trims.push(trimFromProduct(room, target, product, 'calculator'));
        n += 1;
      }
    } else {
      const ofKind = (p: ElectricalPoint) => FIXTURE_PRODUCT_KIND[p.kind] === target.fixture;
      n = fittings.filter(ofKind).length;
      if (n > 0) fittings = fittings.map((p) => (ofKind(p) ? withFixtureProduct(p, product) : p));
    }
    if (n > 0) placed[key] = n;
  }
  return { plan, electrical: fittings, trims, placed };
}
