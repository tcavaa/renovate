/**
 * What the quantity dropdown on a summary line offers.
 *
 * The sheet works every quantity out, and the person may still know better: three of the
 * four beds, a tenth more tile for cutting, half the paint because there are tins in the
 * cellar. The edit is a *choice*, not a free field — a list around the figure that was
 * worked out — because a typed "300" where "30.0" was meant is an order somebody then has to
 * unpick with a shop.
 *
 *  - Things counted apiece run 1, 2, 3… up to at least ten and at least double the original.
 *  - Things measured (m², metres, litres, kilos) run from half the original to half as much
 *    again in steps of five per cent, each rounded the way that unit is sold, with the
 *    percentage beside it. A long count (120 sheets of plasterboard) is offered the same way:
 *    nobody scrolls to 97.
 *
 * The original is always in the list, marked, and so is whatever is set now.
 */

export interface QuantityOption {
  value: number;
  /** Per cent off the original: −10, +15… Absent for a plain count and for the original itself. */
  percent?: number;
  original?: boolean;
}

/** Units sold apiece. Anything else is measured. */
const COUNTED = new Set(['piece', 'unit', 'section', 'set', 'pair', 'pack', 'bag', 'roll', 'sheet', 'box']);
const LONG_COUNT = 40;

export function isCountedUnit(unit: string): boolean {
  return COUNTED.has(unit);
}

export function quantityOptions(original: number, unit: string, current?: number): QuantityOption[] {
  const base = Number.isFinite(original) && original > 0 ? original : 1;
  const counted = isCountedUnit(unit) && Number.isInteger(base);
  const options = new Map<number, QuantityOption>();

  if (counted && base <= LONG_COUNT) {
    const top = Math.max(10, base * 2);
    for (let n = 1; n <= top; n++) options.set(n, { value: n });
  } else {
    const round = counted ? (v: number) => Math.max(1, Math.round(v)) : base >= 100 ? (v: number) => Math.round(v) : (v: number) => Math.round(v * 10) / 10;
    for (let percent = -50; percent <= 50; percent += 5) {
      if (percent === 0) continue;
      const value = round(base * (1 + percent / 100));
      if (value > 0 && Math.abs(value - base) > 1e-9 && !options.has(value)) options.set(value, { value, percent });
    }
  }

  options.set(base, { value: base, original: true });
  if (current != null && Number.isFinite(current) && current > 0 && !options.has(current)) {
    options.set(current, { value: current, percent: Math.round((current / base - 1) * 100) });
  }
  return [...options.values()].sort((a, b) => a.value - b.value);
}
