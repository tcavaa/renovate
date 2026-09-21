import { describe, expect, it } from 'vitest';
import { quantityOptions } from '@/lib/summary/quantity';

describe('quantityOptions', () => {
  it('counts pieces from one, to at least ten and at least double', () => {
    const one = quantityOptions(1, 'piece');
    expect(one.map((o) => o.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(one.find((o) => o.original)?.value).toBe(1);
    expect(quantityOptions(8, 'section').at(-1)?.value).toBe(16);
  });

  it('offers a measure from half to half as much again, in fives, with the original marked', () => {
    const options = quantityOptions(30, 'm2');
    expect(options[0]).toEqual({ value: 15, percent: -50 });
    expect(options.at(-1)).toEqual({ value: 45, percent: 50 });
    expect(options.find((o) => o.original)).toEqual({ value: 30, original: true });
    expect(options.find((o) => o.value === 33)?.percent).toBe(10);
    // Sorted, and no value twice.
    const values = options.map((o) => o.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it('rounds a small measure to a decimal and a large one to whole units', () => {
    expect(quantityOptions(2.4, 'm2').find((o) => o.percent === 10)?.value).toBe(2.6);
    expect(quantityOptions(412.37, 'm2').find((o) => o.percent === 10)?.value).toBe(454);
  });

  it('offers a long count by per cent rather than one by one', () => {
    const options = quantityOptions(120, 'sheet');
    expect(options.length).toBeLessThan(25);
    expect(options.every((o) => Number.isInteger(o.value))).toBe(true);
    expect(options.find((o) => o.original)?.value).toBe(120);
  });

  it('keeps whatever is set now in the list, even when it is none of the steps', () => {
    const options = quantityOptions(30, 'm2', 31.3);
    expect(options.some((o) => o.value === 31.3)).toBe(true);
    expect(quantityOptions(2, 'piece', 25).some((o) => o.value === 25)).toBe(true);
  });

  it('survives a line worked out at nothing', () => {
    expect(quantityOptions(0, 'piece').find((o) => o.original)?.value).toBe(1);
  });
});
