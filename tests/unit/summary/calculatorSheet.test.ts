import { describe, expect, it } from 'vitest';
import { buildProjectSummary, computeRoomAreas } from '@/lib/calculator/materials';
import { calculatorSheet, furnitureTicks } from '@/lib/summary/calculatorSheet';
import { tickFor } from '@/lib/design/ticks';
import type { Room, SelectedProduct } from '@/lib/calculator/types';
import type { SceneStore } from '@/lib/design/types';

const room = (id: string, nameKa: string, type: Room['type'] = 'bedroom'): Room => computeRoomAreas({ id, nameKa, width: 4, length: 3, height: 2.7, type });
const pick = (productId: number, price: number, qty = 1, extra: Partial<SelectedProduct> = {}): SelectedProduct => ({ productId, nameKa: `p${productId}`, pricePerUnit: price, unit: 'piece', qty, totalPrice: price * qty, imageUrl: null, ...extra });
const store: SceneStore = { id: 5, nameKa: 'Domus', logoUrl: null, websiteUrl: null, phone: null, address: null, city: null, rating: null, deliveryDays: 3, deliveryFeeGel: 40 };

const rooms = [room('r1', 'საძინებელი 1'), room('r2', 'აბაზანა', 'bathroom')];
const picks = {
  selectedProducts: { 'floor-tiles_global': pick(3, 45, 12, { unit: 'm2', categorySlug: 'floor-tiles' }), 'paint_room:r1': pick(21, 18, 9, { unit: 'liter', roomId: 'r1' }) },
  selectedFurniture: { r1: [pick(7, 2450), pick(7, 2450), pick(8, 300)] },
};
const summary = buildProjectSummary(rooms, 'black_frame', Object.values(picks.selectedProducts), Object.values(picks.selectedFurniture).flat());
const options = { rooms, storeOf: (id: number) => (id === 7 ? store : null) };

describe('calculatorSheet', () => {
  it('lists the whole estimate once, every line with a key of its own, and adds up to the engine’s totals', () => {
    const sheet = calculatorSheet(summary, picks, options);
    expect(sheet.original).toBeNull();
    // To within a few tetri: the sheet rounds each line and adds the lines up, so that what
    // is read down the page comes to the figure under it; the engine rounds the sum once.
    expect(sheet.grandTotal).toBeCloseTo(summary.grandTotal, 1);
    expect(sheet.grandTotalWithMargin).toBeCloseTo(summary.grandTotalWithMargin, 1);
    expect(sheet.subtotalWorkers).toBeCloseTo(summary.subtotalWorkers, 2);
    const ticks = sheet.lines.map((l) => l.tick);
    expect(ticks.every(Boolean)).toBe(true);
    expect(new Set(ticks).size).toBe(ticks.length);
    // The same bed picked twice for one room is two lines with two keys.
    expect(furnitureTicks(picks.selectedFurniture).map((f) => f.tick)).toEqual([tickFor.furniture('r1', 7, 0), tickFor.furniture('r1', 7, 1), tickFor.furniture('r1', 8, 0)]);
    // A pick a shop sells carries the shop; the room pick names its room.
    expect(sheet.lines.filter((l) => l.product?.store?.id === 5)).toHaveLength(2);
    expect(sheet.lines.find((l) => l.tick === tickFor.pick('paint_room:r1'))?.roomName).toBe('საძინებელი 1');
  });

  it('takes any kind of line out — a material, a labour phase, one of two beds — and keeps the original beside', () => {
    const material = summary.materials[0];
    const labour = summary.workerCosts[0];
    const sheet = calculatorSheet(summary, picks, { ...options, edits: { excluded: [tickFor.material(material.key), tickFor.labour(labour.key), tickFor.furniture('r1', 7, 1)] } });
    expect(sheet.excludedCount).toBe(3);
    expect(sheet.original?.grandTotal).toBeCloseTo(summary.grandTotal, 1);
    expect(sheet.subtotalFurniture).toBeCloseTo(summary.subtotalFurniture - 2450, 2);
    expect(sheet.subtotalWorkers).toBeCloseTo(summary.subtotalWorkers - labour.totalGEL, 2);
    expect(sheet.subtotalMaterials).toBeCloseTo(summary.subtotalMaterials - material.qty * (material.estimatedPriceGEL ?? 0), 1);
    // Still on the sheet, where it stood.
    expect(sheet.lines.map((l) => l.tick)).toEqual(calculatorSheet(summary, picks, options).lines.map((l) => l.tick));
  });

  it('counts a quantity the person set, shows the one that was worked out, and lets a tick outrank it', () => {
    const tiles = tickFor.pick('floor-tiles_global');
    const sheet = calculatorSheet(summary, picks, { ...options, edits: { quantities: { [tiles]: 10 } } });
    const line = sheet.lines.find((l) => l.tick === tiles)!;
    expect(line.qty).toBe(10);
    expect(line.originalQty).toBe(12);
    expect(line.total).toBe(450);
    expect(sheet.changedCount).toBe(1);
    expect(sheet.subtotalProducts).toBeCloseTo(summary.subtotalProducts - 90, 2);
    const both = calculatorSheet(summary, picks, { ...options, edits: { quantities: { [tiles]: 10 }, excluded: [tiles] } });
    expect(both.subtotalProducts).toBeCloseTo(summary.subtotalProducts - 540, 2);
  });

  it('reads a pick flagged by the first version of the summary as ticked off', () => {
    const flagged = { ...picks, selectedProducts: { ...picks.selectedProducts, 'floor-tiles_global': { ...picks.selectedProducts['floor-tiles_global'], excluded: true } } };
    expect(calculatorSheet(summary, flagged, options).lines.find((l) => l.tick === tickFor.pick('floor-tiles_global'))?.excluded).toBe(true);
  });
});
