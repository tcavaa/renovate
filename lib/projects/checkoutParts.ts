import type { DesignCost, FloorPlan } from '@/lib/design/types';
import type { CheckoutPart } from '@/components/checkout/CheckoutDialog';
import { orderedLines, type ProductLine } from '@/lib/design/pricing';
import { localizedName, type Locale } from '@/lib/i18n/labels';
import { orderedCalculationLines, type CalculationInput } from '@/lib/summary/calculatorSheet';

/**
 * The two halves of a project as the checkout dialog lists them. Both summary pages build the
 * same shapes, so a project ordered from either end shows the same rows: each line under the
 * building materials, or under the furniture when the budget counts it as furniture (its
 * `bucket` — a placed piece, a lamp standing in a room, a calculator's furniture pick).
 */
function partLine(line: ProductLine, i: number, locale: Locale): CheckoutPart['lines'][number] {
  return {
    // A product line's tick is its own and nobody else's (`lib/design/ticks`), which is
    // exactly what a list key has to be.
    key: line.tick ?? `p-${line.product.productId}-${i}`,
    productId: line.product.productId,
    name: localizedName(locale, line.product),
    qty: line.qty,
    unitPrice: line.unitPrice,
    total: line.total,
    where: line.roomName ?? null,
    furniture: line.bucket === 'furniture',
  };
}

/**
 * The calculator's half, read off the same priced, edited lines the orders are
 * (`orderedCalculationLines`), so the dialogue lists what the stores will be sent — the picks
 * and the doors, fittings and radiators on the board, at the quantity on the sheet.
 */
export function calculatorCheckoutPart(input: CalculationInput, locale: Locale): CheckoutPart {
  return { kind: 'calculator', lines: orderedCalculationLines(input).map((line, i) => partLine(line, i, locale)) };
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
export function designCheckoutPart(plan: FloorPlan | null, cost: Pick<DesignCost, 'lines'> | null, locale: Locale): CheckoutPart | null {
  if (!plan || !cost) return null;
  return { kind: 'design', lines: orderedLines(cost).map((line, i) => partLine(line, i, locale)) };
}
