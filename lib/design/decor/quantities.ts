/**
 * How much of each material a decor piece uses, and what that comes to — measured from the same
 * fit the 3D view draws (`layout.ts`), so the budget buys what the person sees. Pure: the
 * studio's cost bar, the summary sheet and the save route (which never trusts the client's
 * figures) all measure with it.
 */

import type { DecorPiece, DecorSlot, PlanRoom, SceneProduct } from '@/lib/design/types';
import { hasLed } from './families';
import { decorDepth, decorWall, fitField, fitLight, fitMoulding, fitNiche, fitSlats, paramsOf } from './layout';
import { isDecorUnit, type DecorUnit } from './materials';

/** What one slot of a piece uses, in each of the units a material may be sold by. */
export interface DecorUse {
  slot: DecorSlot;
  m2: number;
  m: number;
  pcs: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Every slot the piece measures, whether or not a material is chosen for it yet. */
export function decorUses(piece: DecorPiece, room: PlanRoom): DecorUse[] {
  const params = paramsOf(piece);
  const led = hasLed(piece.family, params);
  const uses: DecorUse[] = [];
  const record = (slot: DecorSlot, m2: number, m = 0, pcs = 0) => uses.push({ slot, m2: round2(m2), m: round2(m), pcs });

  if (piece.family === 'light') {
    const fit = fitLight(piece, room, params);
    record('led', 0, fit.ledM);
    if (fit.panelM2 > 0) record('body', fit.panelM2);
    return uses;
  }
  const wall = decorWall(piece, room);
  if (!wall) return uses;

  switch (piece.family) {
    case 'slats': {
      const fit = fitSlats(params, wall);
      record('face', wall.width * wall.height, fit.xs.length * wall.height, fit.xs.length);
      if (fit.backing > 0) record('backing', wall.width * wall.height);
      if (led) record('led', 0, fit.ledM);
      break;
    }
    case 'moulding': {
      const profileMm = piece.materials.profile?.specs?.profileMm;
      const fit = fitMoulding(params, wall, room.openings, profileMm);
      record('profile', 0, fit.profileM, fit.frames.length);
      break;
    }
    case 'box': {
      // Its front, its sides and (half height) its top, which is a shelf: the plasterboard, and
      // the tiles over it when it is tiled rather than painted.
      const depth = decorDepth(piece);
      const full = wall.y1 >= wall.roomHeight - 0.01;
      const m2 = wall.width * wall.height + 2 * depth * wall.height + (full ? 0 : wall.width * depth);
      record('body', m2);
      if (piece.materials.face?.product) record('face', m2);
      break;
    }
    case 'niche': {
      const fit = fitNiche(params, wall);
      record('body', fit.bodyM2);
      if (fit.shelfCount > 0) record('shelf', fit.shelves.reduce((s, sh) => s + sh.w * (fit.depth - 0.02), 0), fit.shelves.reduce((s, sh) => s + sh.w, 0), fit.shelfCount);
      if (fit.mantel) record('surround', fit.surroundM2);
      if (led) record('led', 0, fit.ledM);
      break;
    }
    default: {
      const fit = fitField(piece.family, params, wall);
      record('face', fit.faceM2, 0, (fit.seamsX.length + 1) * (fit.seamsY.length + 1));
      if (fit.border) record('border', fit.borderM * (fit.border.y1 - fit.border.y0), fit.borderM);
      record('trim', 0, fit.trimM);
      if (led) record('led', 0, fit.ledM);
    }
  }
  return uses;
}

/**
 * What is bought of a use in a material's unit: square metres and metres with the cutting
 * waste, rounded up to a tenth; pieces whole. A material sold by the piece on a field is bought
 * by its modules (a slat, a slab, a panel).
 */
export const DECOR_WASTE: Record<DecorUnit, number> = { m2: 1.1, linear_m: 1.05, piece: 1 };

export function quantityIn(use: DecorUse, unit: DecorUnit): number {
  const raw = unit === 'm2' ? use.m2 : unit === 'linear_m' ? use.m : use.pcs;
  if (raw <= 0) return 0;
  if (unit === 'piece') return Math.ceil(raw - 1e-9);
  return Math.ceil(raw * DECOR_WASTE[unit] * 10 - 1e-9) / 10;
}

/** One material of one piece as bought: the product, how much, what it comes to. */
export interface DecorPurchaseLine {
  pieceId: string;
  slot: DecorSlot;
  product: SceneProduct;
  qty: number;
  unit: DecorUnit;
  total: number;
}

/** Every material a piece buys (slots with a product sold in a unit the budget can measure). */
export function piecePurchases(piece: DecorPiece, room: PlanRoom): DecorPurchaseLine[] {
  const lines: DecorPurchaseLine[] = [];
  for (const use of decorUses(piece, room)) {
    const product = piece.materials[use.slot]?.product;
    if (!product || !isDecorUnit(product.unit)) continue;
    const qty = quantityIn(use, product.unit);
    if (qty <= 0) continue;
    lines.push({ pieceId: piece.id, slot: use.slot, product, qty, unit: product.unit, total: round2(qty * product.pricePerUnit) });
  }
  return lines;
}

/** What a piece costs in its materials. */
export function pieceCost(piece: DecorPiece, room: PlanRoom): number {
  return round2(piecePurchases(piece, room).reduce((sum, line) => sum + line.total, 0));
}

/** A material bought across the whole flat: every piece's use of it folded into one line. */
export interface DecorPurchase {
  product: SceneProduct;
  qty: number;
  unit: DecorUnit;
  total: number;
  pieceIds: string[];
}

/**
 * The flat's decor as purchases, one per material product — the same oak in three rooms is one
 * order — in the order the pieces first use them. Each piece's quantity is rounded on its own
 * (it is cut on its own), then summed.
 */
export function decorPurchases(decor: DecorPiece[] | undefined, rooms: PlanRoom[]): DecorPurchase[] {
  const byRoom = new Map(rooms.map((r) => [r.id, r]));
  const folded = new Map<number, DecorPurchase>();
  for (const piece of decor ?? []) {
    const room = byRoom.get(piece.roomId);
    if (!room) continue;
    for (const line of piecePurchases(piece, room)) {
      const id = line.product.productId;
      const seen = folded.get(id);
      if (!seen) {
        folded.set(id, { product: line.product, qty: line.qty, unit: line.unit, total: line.total, pieceIds: [piece.id] });
        continue;
      }
      seen.qty = round2(seen.qty + line.qty);
      seen.total = round2(seen.qty * seen.product.pricePerUnit);
      if (!seen.pieceIds.includes(piece.id)) seen.pieceIds.push(piece.id);
    }
  }
  return [...folded.values()];
}

/** Every decor material product id a scene refers to — for the save route's repricing. */
export function decorProductIds(decor: DecorPiece[] | undefined): number[] {
  const ids = new Set<number>();
  for (const piece of decor ?? []) for (const material of Object.values(piece.materials)) if (material?.product) ids.add(material.product.productId);
  return [...ids];
}
