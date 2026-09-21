import type { Room, SelectedProduct } from '@/lib/calculator/types';
import type { DesignCost, FloorPlan } from '@/lib/design/types';
import type { CheckoutPart } from '@/components/checkout/CheckoutDialog';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { orderedLines } from '@/lib/design/pricing';
import { localizedName, type Locale } from '@/lib/i18n/labels';

/**
 * The two halves of a project as the checkout dialog summarises them. Both summary pages
 * build the same shapes, so a project ordered from either end shows the same quick summary.
 */
export function calculatorCheckoutPart(
  rooms: Room[],
  selectedProducts: Record<string, SelectedProduct>,
  selectedFurniture: Record<string, SelectedProduct[]>,
  feePerM2: number,
  locale: Locale
): CheckoutPart {
  const roomName = new Map(rooms.map((r) => [r.id, r.nameKa]));
  return {
    kind: 'calculator',
    totalM2: rooms.reduce((s, r) => s + r.floorM2, 0),
    feePerM2,
    lines: [
      ...Object.values(selectedProducts)
        .filter((p) => !p.excluded)
        .map((p, i) => ({ key: `m-${p.productId}-${i}`, productId: p.productId, name: localizedName(locale, p), qty: p.qty, unitPrice: p.pricePerUnit, total: p.totalPrice, where: p.roomId ? roomName.get(p.roomId) ?? null : null })),
      ...Object.entries(selectedFurniture).flatMap(([roomId, list]) =>
        list
          .filter((p) => !p.excluded)
          .map((p, i) => ({ key: `f-${roomId}-${p.productId}-${i}`, productId: p.productId, name: localizedName(locale, p), qty: p.qty, unitPrice: p.pricePerUnit, total: p.totalPrice, where: roomName.get(roomId) ?? null }))
      ),
    ],
  };
}

/**
 * The design half, from the design as priced (`priceScene`) rather than from the scene: the
 * dialogue lists the budget's product lines that are still ticked — the same list
 * `sceneLinesByStore` turns into orders, so what it shows is what the stores are sent. It
 * used to walk the furniture and the finishes itself, and a flat whose budget said 31 873 ₾
 * of products was offered 29 697 ₾ of them to order: the doors, the windows, the sockets
 * and the radiators had a price and a tick on the sheet and no line here.
 *
 * The caller prices with the project's own home state, as the server will.
 */
export function designCheckoutPart(plan: FloorPlan | null, cost: Pick<DesignCost, 'lines'> | null, feePerM2: number, locale: Locale): CheckoutPart | null {
  if (!plan || !cost) return null;
  return {
    kind: 'design',
    totalM2: totalFloorAreaM2(plan),
    feePerM2,
    // A product line's tick is its own and nobody else's (`lib/design/ticks`), which is
    // exactly what a list key has to be.
    lines: orderedLines(cost).map((line, i) => ({ key: line.tick ?? `p-${line.product.productId}-${i}`, productId: line.product.productId, name: localizedName(locale, line.product), qty: line.qty, unitPrice: line.unitPrice, total: line.total, where: line.roomName ?? null })),
  };
}
