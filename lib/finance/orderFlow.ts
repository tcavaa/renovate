import type { OrderStatus } from './money';

/**
 * How an order moves, and who moves it — pure, so the routes, the pages and the tests share
 * one set of rules.
 *
 * **A store's order goes through the platform first.** The checkout writes it with no
 * `sentAt`: the orders agent (or admin) rings the customer, keeps or strikes lines, corrects
 * quantities and the delivery, and confirms it — and only then is it sent to the store, with the
 * lines still ticked. **A brigade's or a worker's booking is sent at once**: the customer chose
 * that partner on the last step, and the partner answers it (accept or turn down).
 *
 * **What a partner may do** is move its own order along: answer a booking, start the work,
 * finish it. Lines, prices and the delivery are the platform's to change — a partner who cannot
 * supply something says so in a comment. A done or cancelled order is closed to the partner;
 * the platform's people can reopen it.
 */

export type PartnerType = 'store' | 'worker' | 'team';

export interface FlowOrder {
  status: OrderStatus;
  partnerType: PartnerType;
  /** When the partner was given the order; null while it is with the platform. */
  sentAt: Date | string | null;
}

/** Where an order stands, as the people on it describe it. */
export type OrderStage = 'review' | 'awaiting_partner' | 'accepted' | 'in_progress' | 'done' | 'cancelled';

export const ORDER_STAGES: readonly OrderStage[] = ['review', 'awaiting_partner', 'accepted', 'in_progress', 'done', 'cancelled'];

export function orderStage(order: FlowOrder): OrderStage {
  if (order.status === 'cancelled') return 'cancelled';
  if (order.status === 'done') return 'done';
  if (order.status === 'in_progress') return 'in_progress';
  if (!order.sentAt) return 'review';
  return order.status === 'new' ? 'awaiting_partner' : 'accepted';
}

/** A store order still with the platform: what the orders agent's queue is made of. */
export function awaitsConfirmation(order: FlowOrder): boolean {
  return order.partnerType === 'store' && !order.sentAt && order.status !== 'cancelled' && order.status !== 'done';
}

/** The statuses a partner may move its order to from where it is — none before it is theirs. */
export function partnerNextStatuses(order: FlowOrder): OrderStatus[] {
  if (!order.sentAt) return [];
  switch (order.status) {
    // Only a booking reaches its partner still new: accepted or turned down.
    case 'new':
      return ['confirmed', 'cancelled'];
    // A store delivers what the platform confirmed; a brigade may still back out of a job.
    case 'confirmed':
      return order.partnerType === 'store' ? ['in_progress', 'done'] : ['in_progress', 'cancelled'];
    case 'in_progress':
      return ['done'];
    default:
      return [];
  }
}

export function partnerMayMove(order: FlowOrder, next: OrderStatus): boolean {
  return partnerNextStatuses(order).includes(next);
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export interface EditedLine {
  id: number;
  qty: number;
  unitPrice: number;
  removed: boolean;
}

export interface LineEdit {
  id: number;
  qty?: number;
  unitPrice?: number;
  removed?: boolean;
}

export interface EditSummary {
  removed: number;
  restored: number;
  qtyChanged: number;
  priceChanged: number;
  added: number;
  deliveryFrom?: number;
  deliveryTo?: number;
}

/**
 * What an edit changed, counted — the facts of the order's "edited" event. Null when it changed
 * nothing that event is about (a message or a status is an event of its own).
 */
export function summariseEdit(before: { items: EditedLine[]; deliveryFee: number }, edit: { items?: LineEdit[]; addItems?: unknown[]; deliveryFee?: number }): EditSummary | null {
  const s: EditSummary = { removed: 0, restored: 0, qtyChanged: 0, priceChanged: 0, added: edit.addItems?.length ?? 0 };
  for (const change of edit.items ?? []) {
    const line = before.items.find((i) => i.id === change.id);
    if (!line) continue;
    if (change.removed !== undefined && change.removed !== line.removed) {
      if (change.removed) s.removed++;
      else s.restored++;
    }
    if (change.qty !== undefined && change.qty !== line.qty) s.qtyChanged++;
    if (change.unitPrice !== undefined && change.unitPrice !== line.unitPrice) s.priceChanged++;
  }
  if (edit.deliveryFee !== undefined && edit.deliveryFee !== before.deliveryFee) {
    s.deliveryFrom = before.deliveryFee;
    s.deliveryTo = edit.deliveryFee;
  }
  const changed = s.removed + s.restored + s.qtyChanged + s.priceChanged + s.added > 0 || s.deliveryTo !== undefined;
  return changed ? s : null;
}

// ---------------------------------------------------------------------------
// What the customer sees changed
// ---------------------------------------------------------------------------

export type LineDiff =
  | { kind: 'same' }
  | { kind: 'removed' }
  | { kind: 'added' }
  | { kind: 'changed'; qtyFrom: number | null; priceFrom: number | null };

/**
 * A line against what was ordered: struck out, added afterwards (no original quantity), or
 * changed in quantity or price — so the customer's page can show "3 → 2" rather than a number
 * that silently moved.
 */
export function lineDiff(line: { qty: number; unitPrice: number; removed: boolean; originalQty: number | null; originalUnitPrice: number | null }): LineDiff {
  if (line.removed) return { kind: 'removed' };
  if (line.originalQty == null) return { kind: 'added' };
  const qtyFrom = Math.abs(line.qty - line.originalQty) > 0.001 ? line.originalQty : null;
  const priceFrom = line.originalUnitPrice != null && Math.abs(line.unitPrice - line.originalUnitPrice) > 0.001 ? line.originalUnitPrice : null;
  return qtyFrom == null && priceFrom == null ? { kind: 'same' } : { kind: 'changed', qtyFrom, priceFrom };
}
