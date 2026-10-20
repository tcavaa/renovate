import { describe, expect, it } from 'vitest';
import { normalizeSearch, searchOptions, type SearchOption } from '@/lib/optionSearch';

const KINDS: SearchOption[] = [
  { value: 'none', label: 'არ არის' },
  { value: 'coffee_table', label: 'ჟურნალის მაგიდა', keywords: ['Coffee table', 'Журнальный столик', 'coffee_table'] },
  { value: 'dining_table', label: 'სასადილო მაგიდა', keywords: ['Dining table', 'Обеденный стол', 'dining_table'] },
  { value: 'sofa', label: 'დივანი', keywords: ['Sofa', 'Диван', 'sofa'] },
  { value: 'switch', label: '⚡ ჩამრთველი', keywords: ['Switch', 'switch'] },
];

// Furniture › Tables › Coffee tables, Furniture › Sofas, Lighting
const TREE: SearchOption[] = [
  { value: '1', label: 'ავეჯი', depth: 0, keywords: ['Furniture'] },
  { value: '2', label: 'მაგიდები', depth: 1, keywords: ['Tables'] },
  { value: '3', label: 'ჟურნალის მაგიდები', depth: 2, keywords: ['Coffee tables'] },
  { value: '4', label: 'დივნები', depth: 1, keywords: ['Sofas'] },
  { value: '5', label: 'განათება', depth: 0, keywords: ['Lighting'] },
];

const values = (hits: ReturnType<typeof searchOptions>) => hits.map((hit) => hit.option.value);

describe('searching a select', () => {
  it('shows everything for an empty search', () => {
    expect(values(searchOptions(KINDS, '  '))).toEqual(['none', 'coffee_table', 'dining_table', 'sofa', 'switch']);
  });

  it('finds an option by its Georgian label, its English name and its key', () => {
    expect(values(searchOptions(KINDS, 'ჟურნალის'))).toEqual(['coffee_table']);
    expect(values(searchOptions(KINDS, 'Coffee'))).toEqual(['coffee_table']);
    expect(values(searchOptions(KINDS, 'dining_'))).toEqual(['dining_table']);
    expect(values(searchOptions(KINDS, 'მაგიდა'))).toEqual(['coffee_table', 'dining_table']);
  });

  it('finds a Georgian label typed in Latin letters from the start of a word, and Russian', () => {
    expect(values(searchOptions(KINDS, 'magida'))).toEqual(['coffee_table', 'dining_table']);
    expect(values(searchOptions(KINDS, 'zhurn mag'))).toEqual(['coffee_table']);
    expect(values(searchOptions(KINDS, 'chamr'))).toEqual(['switch']);
    // chamrtveli: not from the middle of a word.
    expect(values(searchOptions(KINDS, 'tv'))).toEqual([]);
    expect(values(searchOptions(KINDS, 'диван'))).toEqual(['sofa']);
  });

  it('needs every word, in any order', () => {
    expect(values(searchOptions(KINDS, 'table coffee'))).toEqual(['coffee_table']);
    expect(values(searchOptions(KINDS, 'table sofa'))).toEqual([]);
  });

  it('shows a match in a tree with its parents, which are marked as not matching', () => {
    const hits = searchOptions(TREE, 'coffee');
    expect(values(hits)).toEqual(['1', '2', '3']);
    expect(hits.map((hit) => hit.match)).toEqual([false, false, true]);
    expect(values(searchOptions(TREE, 'Sofas'))).toEqual(['1', '4']);
    expect(values(searchOptions(TREE, 'განათება'))).toEqual(['5']);
  });

  it('shows a matching parent once, with its matching child', () => {
    const hits = searchOptions(TREE, 'მაგიდ');
    expect(values(hits)).toEqual(['1', '2', '3']);
    expect(hits.map((hit) => hit.match)).toEqual([false, true, true]);
  });

  it('ignores case, accents and extra spaces', () => {
    expect(normalizeSearch('  Café   OSLO ')).toBe('cafe oslo');
  });
});
