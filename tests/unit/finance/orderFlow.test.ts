import { describe, expect, it } from 'vitest';
import { awaitsConfirmation, lineDiff, orderStage, partnerMayMove, partnerNextStatuses, summariseEdit, type FlowOrder } from '@/lib/finance/orderFlow';

const sent = new Date('2026-09-27T10:00:00Z');
const store = (patch: Partial<FlowOrder> = {}): FlowOrder => ({ status: 'new', partnerType: 'store', sentAt: null, ...patch });
const booking = (patch: Partial<FlowOrder> = {}): FlowOrder => ({ status: 'new', partnerType: 'team', sentAt: sent, ...patch });

describe('where an order stands', () => {
  it('keeps a store order with the platform until it is confirmed and sent', () => {
    expect(orderStage(store())).toBe('review');
    expect(awaitsConfirmation(store())).toBe(true);
    expect(orderStage(store({ status: 'confirmed', sentAt: sent }))).toBe('accepted');
    expect(awaitsConfirmation(store({ status: 'confirmed', sentAt: sent }))).toBe(false);
  });

  it('puts a booking in front of its partner at once, waiting for an answer', () => {
    expect(orderStage(booking())).toBe('awaiting_partner');
    expect(awaitsConfirmation(booking())).toBe(false);
  });

  it('names the later stages alike for every partner, and a cancelled order is out of the queue', () => {
    expect(orderStage(booking({ status: 'in_progress' }))).toBe('in_progress');
    expect(orderStage(store({ status: 'done', sentAt: sent }))).toBe('done');
    expect(orderStage(store({ status: 'cancelled' }))).toBe('cancelled');
    expect(awaitsConfirmation(store({ status: 'cancelled' }))).toBe(false);
    expect(awaitsConfirmation(store({ status: 'done' }))).toBe(false);
  });
});

describe('what a partner may do with its order', () => {
  it('may do nothing with a store order the platform has not sent', () => {
    expect(partnerNextStatuses(store())).toEqual([]);
    expect(partnerMayMove(store(), 'confirmed')).toBe(false);
  });

  it('answers a booking: accept or turn down — never skip to done', () => {
    expect(partnerNextStatuses(booking())).toEqual(['confirmed', 'cancelled']);
    expect(partnerMayMove(booking(), 'done')).toBe(false);
    expect(partnerMayMove(booking(), 'in_progress')).toBe(false);
  });

  it('lets a store deliver what the platform confirmed, but not back out of it', () => {
    const confirmed = store({ status: 'confirmed', sentAt: sent });
    expect(partnerNextStatuses(confirmed)).toEqual(['in_progress', 'done']);
    expect(partnerMayMove(confirmed, 'cancelled')).toBe(false);
  });

  it('lets a brigade start an accepted job or back out of it, then finish it', () => {
    expect(partnerNextStatuses(booking({ status: 'confirmed' }))).toEqual(['in_progress', 'cancelled']);
    expect(partnerNextStatuses(booking({ status: 'in_progress' }))).toEqual(['done']);
  });

  it('closes a done or cancelled order to its partner, and never moves one backwards', () => {
    expect(partnerNextStatuses(booking({ status: 'done' }))).toEqual([]);
    expect(partnerNextStatuses(booking({ status: 'cancelled' }))).toEqual([]);
    expect(partnerMayMove(store({ status: 'in_progress', sentAt: sent }), 'new')).toBe(false);
  });
});

describe('summariseEdit — the facts of an "edited" event', () => {
  const before = {
    items: [
      { id: 1, qty: 3, unitPrice: 10, removed: false },
      { id: 2, qty: 1, unitPrice: 50, removed: true },
      { id: 3, qty: 2, unitPrice: 20, removed: false },
    ],
    deliveryFee: 50,
  };

  it('counts struck, restored, re-counted, re-priced and added lines, and the delivery change', () => {
    expect(
      summariseEdit(before, {
        items: [
          { id: 1, removed: true },
          { id: 2, removed: false },
          { id: 3, qty: 4, unitPrice: 18 },
        ],
        addItems: [{}],
        deliveryFee: 0,
      })
    ).toEqual({ removed: 1, restored: 1, qtyChanged: 1, priceChanged: 1, added: 1, deliveryFrom: 50, deliveryTo: 0 });
  });

  it('is nothing when nothing an edit event is about changed', () => {
    expect(summariseEdit(before, {})).toBeNull();
    // The same values sent again, and a line that is not on the order.
    expect(summariseEdit(before, { items: [{ id: 1, qty: 3, unitPrice: 10, removed: false }, { id: 99, qty: 5 }], deliveryFee: 50 })).toBeNull();
  });
});

describe('lineDiff — what the customer sees changed', () => {
  const line = { qty: 3, unitPrice: 10, removed: false, originalQty: 3, originalUnitPrice: 10 };

  it('says nothing about a line as it was ordered', () => {
    expect(lineDiff(line)).toEqual({ kind: 'same' });
  });

  it('shows a struck line as removed, whatever else changed', () => {
    expect(lineDiff({ ...line, removed: true, qty: 1 })).toEqual({ kind: 'removed' });
  });

  it('shows a line with no original as an addition', () => {
    expect(lineDiff({ ...line, originalQty: null, originalUnitPrice: null })).toEqual({ kind: 'added' });
  });

  it('shows what a changed quantity or price was', () => {
    expect(lineDiff({ ...line, qty: 2 })).toEqual({ kind: 'changed', qtyFrom: 3, priceFrom: null });
    expect(lineDiff({ ...line, unitPrice: 12 })).toEqual({ kind: 'changed', qtyFrom: null, priceFrom: 10 });
    // An order placed before prices were kept has no original price to compare with.
    expect(lineDiff({ ...line, unitPrice: 12, originalUnitPrice: null })).toEqual({ kind: 'same' });
  });
});
