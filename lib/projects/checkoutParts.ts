import type { Room, SelectedProduct } from '@/lib/calculator/types';
import type { FloorPlan, PlacedItem, SurfaceFinish } from '@/lib/design/types';
import type { CheckoutPart } from '@/components/checkout/CheckoutDialog';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
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
      ...Object.values(selectedProducts).map((p, i) => ({ key: `m-${p.productId}-${i}`, productId: p.productId, name: localizedName(locale, p), qty: p.qty, total: p.totalPrice, where: p.roomId ? roomName.get(p.roomId) ?? null : null })),
      ...Object.entries(selectedFurniture).flatMap(([roomId, list]) =>
        list.map((p, i) => ({ key: `f-${roomId}-${p.productId}-${i}`, productId: p.productId, name: localizedName(locale, p), qty: p.qty, total: p.totalPrice, where: roomName.get(roomId) ?? null }))
      ),
    ],
  };
}

export function designCheckoutPart(plan: FloorPlan | null, items: PlacedItem[], finishes: SurfaceFinish[], feePerM2: number, locale: Locale): CheckoutPart | null {
  if (!plan) return null;
  const roomName = new Map(plan.rooms.map((r) => [r.id, r.name]));
  return {
    kind: 'design',
    totalM2: totalFloorAreaM2(plan),
    feePerM2,
    lines: [
      ...items.filter((i) => i.product).map((i) => ({ key: `i-${i.id}`, productId: i.product!.productId, name: localizedName(locale, i.product!), qty: i.product!.qty, total: i.product!.totalPrice, where: roomName.get(i.roomId) ?? null })),
      ...finishes.filter((f) => f.product).map((f) => ({ key: `s-${f.roomId}-${f.surface}`, productId: f.product!.productId, name: localizedName(locale, f.product!), qty: f.product!.qty, total: f.product!.totalPrice, where: roomName.get(f.roomId) ?? null })),
    ],
  };
}
