import { describe, expect, it } from 'vitest';
import { dateRangeSummary, optionMatches, plainOptionLabel, rangeSummary, shortDate } from '@/lib/admin/filters';

describe('what a filter button says', () => {
  it('names a category option without its place in the tree, and searches by that name', () => {
    expect(plainOptionLabel('  └ კუთხის დივნები')).toBe('კუთხის დივნები');
    expect(plainOptionLabel('ავეჯი')).toBe('ავეჯი');
    expect(optionMatches(' └ Corner sofas', 'corner')).toBe(true);
    expect(optionMatches(' └ Corner sofas', '└')).toBe(false);
    expect(optionMatches('Beds', '  ')).toBe(true);
  });

  it('sums up a number range from either end or both', () => {
    expect(rangeSummary('10', '50', '₾')).toBe('10–50 ₾');
    expect(rangeSummary('10', '', '₾')).toBe('≥ 10 ₾');
    expect(rangeSummary('', '50')).toBe('≤ 50');
    expect(rangeSummary('', '')).toBeNull();
  });

  it('writes a period in few characters, the first year dropped when both ends share it', () => {
    expect(shortDate('2026-09-01')).toBe('01.09.2026');
    expect(shortDate('yesterday')).toBe('yesterday');
    expect(dateRangeSummary('2026-09-01', '2026-09-28')).toBe('01.09 – 28.09.2026');
    expect(dateRangeSummary('2025-12-20', '2026-01-10')).toBe('20.12.2025 – 10.01.2026');
    expect(dateRangeSummary('2026-09-01', '')).toBe('≥ 01.09.2026');
    expect(dateRangeSummary('', '')).toBeNull();
  });
});
