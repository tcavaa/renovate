import { describe, expect, it } from 'vitest';
import { saveCalculatorSchema } from '@/lib/validations/calculatorSave.schema';
import { selectedProductSchema } from '@/lib/validations/project.schema';
import { csvCell } from '@/lib/admin/csv';

/** What a save may carry (S16 in docs/audit-checklist.md): measurements that are real, records of a sane size. */

const room = (patch: Record<string, unknown> = {}) => ({ id: 'r1', type: 'bedroom', nameKa: 'საძინებელი', width: 4, length: 3, height: 2.8, floorM2: 12, wallM2: 39, ceilingM2: 12, perimeterM: 14, isWetRoom: false, ...patch });
const save = (rooms: unknown[], extra: Record<string, unknown> = {}) => ({ projectId: 1, homeState: 'white_frame', rooms, ...extra });
const pick = { productId: 1, nameKa: 'ლამინატი', pricePerUnit: 30, unit: 'm2', qty: 12, totalPrice: 360 };

describe('a calculation’s save', () => {
  it('takes real rooms', () => {
    expect(saveCalculatorSchema.safeParse(save([room()])).success).toBe(true);
  });

  it('refuses a negative floor (it lowered the fee) and absurd sizes', () => {
    expect(saveCalculatorSchema.safeParse(save([room({ floorM2: -500 })])).success).toBe(false);
    expect(saveCalculatorSchema.safeParse(save([room({ width: 1e6 })])).success).toBe(false);
    expect(saveCalculatorSchema.safeParse(save(Array.from({ length: 81 }, (_, i) => room({ id: `r${i}` })))).success).toBe(false);
  });

  it('bounds the picks and what each carries', () => {
    expect(selectedProductSchema.safeParse(pick).success).toBe(true);
    expect(selectedProductSchema.safeParse({ ...pick, pricePerUnit: -1 }).success).toBe(false);
    expect(selectedProductSchema.safeParse({ ...pick, specs: { blob: 'x'.repeat(9000) } }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 601 }, (_, i) => [`k${i}`, pick]));
    expect(saveCalculatorSchema.safeParse(save([room()], { selectedProducts: many })).success).toBe(false);
  });
});

describe('a CSV cell', () => {
  it('shows a formula as text, keeps numbers numbers, and quotes what needs it', () => {
    expect(csvCell('=HYPERLINK("https://evil.example","click")')).toBe('"\'=HYPERLINK(""https://evil.example"",""click"")"');
    expect(csvCell('+995 555 12 34 56')).toBe("'+995 555 12 34 56");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell('Nino, Tbilisi')).toBe('"Nino, Tbilisi"');
    expect(csvCell(null)).toBe('');
  });
});
