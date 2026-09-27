import { describe, expect, it } from 'vitest';
import {
  MAX_CATEGORY_DEPTH,
  buildCategoryTree,
  categoryForKind,
  childrenOf,
  depthOf,
  flattenTree,
  moveError,
  nearestSlug,
  pathOf,
  subtreeCounts,
  subtreeHeight,
  subtreeIds,
  subtreeOfSlugs,
  treeOptions,
} from '@/lib/catalog/tree';

/**
 * The category tree: one table, each row under its parent, three levels at most. A category
 * stands for its subtree; the code's own categories are found up the chain (`nearestSlug`).
 */

interface Row {
  id: number;
  parentId: number | null;
  sortOrder: number | null;
  nameKa: string;
  slug: string;
  model3dKind: string | null;
}
const row = (id: number, parentId: number | null, slug: string, sortOrder: number | null = id, model3dKind: string | null = null): Row => ({ id, parentId, sortOrder, nameKa: slug, slug, model3dKind });

//  furniture(1) ─ sofas(2) ─ corner(3) [sofa_corner]
//               └ beds(4)
//  sanitary(5) ─ toilets(6) [toilet]
//  decor(7)
const ROWS = [row(7, null, 'decor', 30), row(1, null, 'furniture', 10), row(5, null, 'sanitary', 20), row(2, 1, 'sofas', 10), row(4, 1, 'beds', 20), row(3, 2, 'corner', 10, 'sofa_corner'), row(6, 5, 'toilets', 10, 'toilet')];
const tree = buildCategoryTree(ROWS);

describe('the category tree', () => {
  it('orders siblings by their sort order, then by name', () => {
    expect(tree.roots.map((r) => r.slug)).toEqual(['furniture', 'sanitary', 'decor']);
    expect(childrenOf(tree, 1).map((r) => r.slug)).toEqual(['sofas', 'beds']);
    const tied = buildCategoryTree([row(1, null, 'b', 0), row(2, null, 'a', 0), row(3, null, 'c', null)]);
    expect(tied.roots.map((r) => r.slug)).toEqual(['a', 'b', 'c']);
  });

  it('reads paths, depths, subtrees and heights', () => {
    expect(pathOf(tree, 3).map((r) => r.slug)).toEqual(['furniture', 'sofas', 'corner']);
    expect(depthOf(tree, 3)).toBe(3);
    expect(depthOf(tree, 7)).toBe(1);
    expect(subtreeIds(tree, 1)).toEqual([1, 2, 3, 4]);
    expect(subtreeIds(tree, 99)).toEqual([]);
    expect(subtreeHeight(tree, 1)).toBe(3);
    expect(subtreeHeight(tree, 4)).toBe(1);
  });

  it('flattens in reading order, each followed by its subtree', () => {
    expect(flattenTree(tree).map(({ row, depth }) => `${depth}:${row.slug}`)).toEqual(['1:furniture', '2:sofas', '3:corner', '2:beds', '1:sanitary', '2:toilets', '1:decor']);
    expect(treeOptions(tree, (r) => r.slug).map((o) => o.label)).toEqual(['furniture', ' └ sofas', '  └ corner', ' └ beds', 'sanitary', ' └ toilets', 'decor']);
  });

  it('puts a row whose parent is missing, or that sits in a loop, at the top rather than losing it', () => {
    const odd = buildCategoryTree([row(1, 99, 'orphan'), row(2, 3, 'a'), row(3, 2, 'b')]);
    expect(odd.roots.map((r) => r.slug).sort()).toEqual(['a', 'b', 'orphan']);
    expect(flattenTree(odd)).toHaveLength(3);
  });

  it('counts products up the tree', () => {
    const counts = subtreeCounts(tree, new Map([[3, 2], [4, 1], [2, 5], [6, 4]]));
    expect(counts.get(1)).toBe(8);
    expect(counts.get(2)).toBe(7);
    expect(counts.get(5)).toBe(4);
    expect(counts.get(7)).toBe(0);
  });
});

describe('where a category may go', () => {
  it('lets a category go to the top or under another, within three levels', () => {
    expect(MAX_CATEGORY_DEPTH).toBe(3);
    expect(moveError(tree, null, null)).toBeNull();
    expect(moveError(tree, null, 2)).toBeNull();
    expect(moveError(tree, 4, 5)).toBeNull();
    expect(moveError(tree, 2, null)).toBeNull();
  });

  it('refuses a fourth level, counting what comes along', () => {
    expect(moveError(tree, null, 3)).toBe('CATEGORY_TOO_DEEP');
    // sofas carries corner with it: under beds it would reach a fourth level.
    expect(moveError(tree, 2, 4)).toBe('CATEGORY_TOO_DEEP');
    expect(moveError(tree, 2, 5)).toBeNull();
  });

  it('refuses a loop and a parent that does not exist', () => {
    expect(moveError(tree, 1, 3)).toBe('CATEGORY_CYCLE');
    expect(moveError(tree, 2, 2)).toBe('CATEGORY_CYCLE');
    expect(moveError(tree, 2, 99)).toBe('UNKNOWN_PARENT');
  });
});

describe('the categories the code knows by slug', () => {
  it('finds the nearest one up the chain', () => {
    const known = new Set(['sanitary', 'sofas']);
    expect(nearestSlug(tree, 6, known)).toBe('sanitary');
    expect(nearestSlug(tree, 3, known)).toBe('sofas');
    expect(nearestSlug(tree, 2, known)).toBe('sofas');
    expect(nearestSlug(tree, 4, known)).toBeNull();
  });

  it('gathers the subtrees of several slugs', () => {
    expect([...subtreeOfSlugs(tree, ['sofas', 'sanitary'])].sort()).toEqual([2, 3, 5, 6]);
    expect(subtreeOfSlugs(tree, ['nothing']).size).toBe(0);
  });

  it('files a product of a kind where that kind is taken, else under the fallback', () => {
    expect(categoryForKind(tree, 'sofa_corner', 'sofas')?.slug).toBe('corner');
    expect(categoryForKind(tree, 'armchair', 'sofas')?.slug).toBe('sofas');
    expect(categoryForKind(tree, null, 'decor')?.slug).toBe('decor');
    expect(categoryForKind(tree, 'armchair', 'missing')).toBeNull();
    // The shallowest of several that take the kind.
    const twice = buildCategoryTree([...ROWS, row(8, 7, 'more-toilets', 10, 'toilet'), row(9, null, 'top-toilets', 40, 'toilet')]);
    expect(categoryForKind(twice, 'toilet', null)?.slug).toBe('top-toilets');
  });
});
