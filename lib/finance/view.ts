import type { OrderView } from './orders';
import type { CheckoutKind, OrderStatus } from './money';

/**
 * An order as the client components see it: numbers instead of decimal strings, ISO dates
 * instead of `Date`s, and the partner already named — so the editor and the badges do no
 * conversion of their own.
 */
export interface OrderItemData {
  id: number;
  productId: number | null;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  categorySlug: string | null;
  roomName: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  total: number;
  removed: boolean;
  note: string | null;
}

export interface OrderData {
  id: number;
  status: OrderStatus;
  partnerType: 'store' | 'worker';
  subtotal: number;
  deliveryFee: number;
  commissionPct: number;
  commissionAmount: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerNote: string | null;
  partnerMessage: string | null;
  createdAt: string;
  updatedAt: string;
  viewedAt: string | null;
  items: OrderItemData[];
  partner: { id: number; nameKa: string; nameEn: string | null; nameRu: string | null; phone: string | null; email: string | null } | null;
  project: { id: number; nameKa: string | null; totalM2: number; isDesign: boolean } | null;
  checkout: { id: number; platformFee: number; feePerM2: number; kind: CheckoutKind } | null;
}

export function orderData(view: OrderView): OrderData {
  const { order } = view;
  const partner = view.store ?? view.worker;
  return {
    id: order.id,
    status: order.status,
    partnerType: order.partnerType,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    commissionPct: Number(order.commissionPct),
    commissionAmount: Number(order.commissionAmount),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    customerNote: order.customerNote,
    partnerMessage: order.partnerMessage,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    viewedAt: order.viewedAt ? order.viewedAt.toISOString() : null,
    items: view.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      nameKa: i.nameKa,
      nameEn: i.nameEn,
      nameRu: i.nameRu,
      categorySlug: i.categorySlug,
      roomName: i.roomName,
      unit: i.unit,
      qty: Number(i.qty),
      unitPrice: Number(i.unitPrice),
      total: Number(i.total),
      removed: i.removed,
      note: i.note,
    })),
    partner: partner ? { id: partner.id, nameKa: partner.nameKa, nameEn: partner.nameEn, nameRu: partner.nameRu, phone: partner.phone, email: partner.email } : null,
    project: view.project ? { id: view.project.id, nameKa: view.project.nameKa, totalM2: Number(view.project.totalM2), isDesign: view.project.isDesign } : null,
    checkout: view.checkout ? { id: view.checkout.id, platformFee: Number(view.checkout.platformFee), feePerM2: Number(view.checkout.feePerM2), kind: view.checkout.kind } : null,
  };
}
