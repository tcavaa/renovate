import { describe, expect, it } from 'vitest';
import { joinLines, materialLinesByStore, MATERIAL_SLUG_PREFIX, type OrderLineDraft } from '@/lib/finance/money';

const material = (key: string, qty: number, unitPrice: number): OrderLineDraft => ({
  productId: null,
  nameKa: key,
  nameEn: null,
  nameRu: null,
  categorySlug: `${MATERIAL_SLUG_PREFIX}${key}`,
  roomName: null,
  unit: 'm2',
  qty,
  unitPrice,
  total: Math.round(qty * unitPrice * 100) / 100,
});

describe('materialLinesByStore — the construction materials of a checkout', () => {
  it('sends every material line to the supplier', () => {
    const lines = [material('wall_putty', 233.34, 5), material('ceiling_board', 86.02, 12)];
    const out = materialLinesByStore(lines, 13);
    expect([...out.groups.keys()]).toEqual([13]);
    expect(out.groups.get(13)).toEqual(lines);
    expect(out.unassigned).toEqual([]);
    expect(out.skipped).toBe(0);
  });

  it('reports the lines as unassigned when no store supplies materials', () => {
    const out = materialLinesByStore([material('plaster_mix', 10, 12)], null);
    expect(out.groups.size).toBe(0);
    expect(out.unassigned).toHaveLength(1);
  });

  it('takes off what an earlier checkout of the project already sent, material by material', () => {
    const out = materialLinesByStore([material('wall_putty', 100, 5), material('plaster_mix', 50, 12)], 13, { 'material:wall_putty': 100, 'material:plaster_mix': 20 });
    // All the putty went last time; thirty more square metres of plaster mix go now.
    expect(out.skipped).toBe(1);
    expect(out.groups.get(13)).toEqual([{ ...material('plaster_mix', 30, 12) }]);
  });

  it('leaves out lines with nothing to send', () => {
    expect(materialLinesByStore([material('wall_putty', 0, 5)], 13).groups.size).toBe(0);
  });
});

describe('joinLines', () => {
  it('puts the materials on the same store order when that store also sells products', () => {
    const product: OrderLineDraft = { ...material('x', 1, 100), productId: 7, categorySlug: 'floor-tiles' };
    const joined = joinLines({ groups: new Map([[13, [product]], [4, [product]]]), unassigned: [] }, { groups: new Map([[13, [material('wall_putty', 2, 5)]]]), unassigned: [material('a', 1, 1)] });
    expect(joined.groups.get(13)?.map((l) => l.categorySlug)).toEqual(['floor-tiles', 'material:wall_putty']);
    expect(joined.groups.get(4)).toHaveLength(1);
    expect(joined.unassigned).toHaveLength(1);
  });
});
