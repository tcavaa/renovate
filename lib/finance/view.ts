import type { OrderEvent } from '@/lib/db/schema';
import type { OrderView } from './orders';
import type { CheckoutKind, OrderStatus } from './money';
import { orderStage, type OrderStage } from './orderFlow';

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
  /** As ordered; null on a line added afterwards. */
  originalQty: number | null;
  originalUnitPrice: number | null;
}

export interface OrderData {
  id: number;
  status: OrderStatus;
  partnerType: 'store' | 'worker' | 'team';
  subtotal: number;
  deliveryFee: number;
  /** The delivery as the order was placed. */
  originalDeliveryFee: number | null;
  commissionPct: number;
  commissionAmount: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerNote: string | null;
  partnerMessage: string | null;
  /** The agent's own note; null for everyone but the platform's people. */
  staffNote: string | null;
  createdAt: string;
  updatedAt: string;
  viewedAt: string | null;
  /** When the partner was given it; null while a store's order waits for the platform. */
  sentAt: string | null;
  confirmedAt: string | null;
  stage: OrderStage;
  items: OrderItemData[];
  partner: { id: number; nameKa: string; nameEn: string | null; nameRu: string | null; phone: string | null; email: string | null } | null;
  project: { id: number; nameKa: string | null; totalM2: number; isDesign: boolean } | null;
  checkout: { id: number; platformFee: number; feePerM2: number; kind: CheckoutKind } | null;
}

export function orderData(view: OrderView): OrderData {
  const { order } = view;
  const partner = view.store ?? view.team ?? view.worker;
  return {
    id: order.id,
    status: order.status,
    partnerType: order.partnerType,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    originalDeliveryFee: order.originalDeliveryFee == null ? null : Number(order.originalDeliveryFee),
    commissionPct: Number(order.commissionPct),
    commissionAmount: Number(order.commissionAmount),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    customerNote: order.customerNote,
    partnerMessage: order.partnerMessage,
    staffNote: order.staffNote,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    viewedAt: order.viewedAt ? order.viewedAt.toISOString() : null,
    sentAt: order.sentAt ? order.sentAt.toISOString() : null,
    confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
    stage: orderStage(order),
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
      originalQty: i.originalQty == null ? null : Number(i.originalQty),
      originalUnitPrice: i.originalUnitPrice == null ? null : Number(i.originalUnitPrice),
    })),
    partner: partner ? { id: partner.id, nameKa: partner.nameKa, nameEn: partner.nameEn, nameRu: partner.nameRu, phone: partner.phone, email: partner.email } : null,
    project: view.project ? { id: view.project.id, nameKa: view.project.nameKa, totalM2: Number(view.project.totalM2), isDesign: view.project.isDesign } : null,
    checkout: view.checkout ? { id: view.checkout.id, platformFee: Number(view.checkout.platformFee), feePerM2: Number(view.checkout.feePerM2), kind: view.checkout.kind } : null,
  };
}

/** One line of an order's history, as the timeline shows it. */
export interface OrderEventData {
  id: number;
  kind: OrderEvent['kind'];
  body: string | null;
  meta: Record<string, unknown> | null;
  actorName: string | null;
  actorRole: string | null;
  createdAt: string;
}

export function orderEventData(events: OrderEvent[]): OrderEventData[] {
  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    body: e.body,
    meta: (e.meta as Record<string, unknown> | null) ?? null,
    actorName: e.actorName,
    actorRole: e.actorRole,
    createdAt: e.createdAt.toISOString(),
  }));
}
