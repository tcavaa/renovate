/**
 * The category tree.
 *
 * Every category is a row of `categories` with its parent (`parentId`, null at the top), so
 * the catalogue is one tree: "Furniture" → "Sofas & armchairs" → "Corner sofas". A product
 * sits in one category, at any level, and a category stands for its whole subtree — the
 * catalogue's "Sofas & armchairs" lists the corner sofas too, the calculator's "Sanitary" tab
 * the toilets and the sinks.
 *
 * The tree is at most `MAX_CATEGORY_DEPTH` deep (a top category is at depth 1); siblings go
 * in `sortOrder`, then by name. Pure: the server builds it from the rows it read, the admin's
 * tree page and the studio from the rows they were sent.
 */

export const MAX_CATEGORY_DEPTH = 3;

/** What the tree needs of a row. */
export interface TreeRow {
  id: number;
  parentId: number | null;
  sortOrder: number | null;
  nameKa: string;
}

export interface CategoryTree<T extends TreeRow> {
  byId: Map<number, T>;
  /** Each category's children in order; `null` holds the top categories. */
  children: Map<number | null, T[]>;
  roots: T[];
}

const bySiblingOrder = (a: TreeRow, b: TreeRow): number => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.nameKa.localeCompare(b.nameKa, 'ka') || a.id - b.id;

/**
 * The tree of these rows. A row whose parent is missing, or that sits in a loop (which the
 * routes never write, but a hand-edited database might hold), is put at the top rather than
 * lost: every row is somewhere in the tree.
 */
export function buildCategoryTree<T extends TreeRow>(rows: readonly T[]): CategoryTree<T> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const parentOf = (row: T): number | null => {
    if (row.parentId == null || !byId.has(row.parentId)) return null;
    // Walk up: a loop back to this row puts it at the top.
    const seen = new Set<number>([row.id]);
    let at: number | null = row.parentId;
    while (at != null) {
      if (seen.has(at)) return null;
      seen.add(at);
      const next: number | null = byId.get(at)?.parentId ?? null;
      at = next != null && byId.has(next) ? next : null;
    }
    return row.parentId;
  };
  const children = new Map<number | null, T[]>();
  for (const row of rows) {
    const parent = parentOf(row);
    const list = children.get(parent);
    if (list) list.push(row);
    else children.set(parent, [row]);
  }
  for (const list of children.values()) list.sort(bySiblingOrder);
  return { byId, children, roots: children.get(null) ?? [] };
}

/** The category's children in order (none for a leaf or an unknown id). */
export function childrenOf<T extends TreeRow>(tree: CategoryTree<T>, id: number | null): T[] {
  return tree.children.get(id) ?? [];
}

/** The chain from the top category down to this one, both included; empty for an unknown id. */
export function pathOf<T extends TreeRow>(tree: CategoryTree<T>, id: number): T[] {
  const path: T[] = [];
  const seen = new Set<number>();
  let at = tree.byId.get(id);
  while (at && !seen.has(at.id)) {
    seen.add(at.id);
    path.unshift(at);
    // Stop where the tree put the row at the top (a missing parent, a loop).
    if (!tree.children.get(at.parentId ?? null)?.includes(at)) break;
    at = at.parentId != null ? tree.byId.get(at.parentId) : undefined;
  }
  return path;
}

/** How deep a category sits: 1 at the top. */
export function depthOf<T extends TreeRow>(tree: CategoryTree<T>, id: number): number {
  return pathOf(tree, id).length;
}

/** The category and everything under it, depth first. */
export function subtreeIds<T extends TreeRow>(tree: CategoryTree<T>, id: number): number[] {
  if (!tree.byId.has(id)) return [];
  const out: number[] = [];
  const walk = (at: number) => {
    out.push(at);
    for (const child of childrenOf(tree, at)) walk(child.id);
  };
  walk(id);
  return out;
}

/** How many levels a category's subtree spans: 1 for a leaf. */
export function subtreeHeight<T extends TreeRow>(tree: CategoryTree<T>, id: number): number {
  const kids = childrenOf(tree, id);
  return 1 + (kids.length ? Math.max(...kids.map((k) => subtreeHeight(tree, k.id))) : 0);
}

/** Every category in reading order — each followed by its subtree — with its depth. */
export function flattenTree<T extends TreeRow>(tree: CategoryTree<T>): Array<{ row: T; depth: number }> {
  const out: Array<{ row: T; depth: number }> = [];
  const walk = (list: T[], depth: number) => {
    for (const row of list) {
      out.push({ row, depth });
      walk(childrenOf(tree, row.id), depth + 1);
    }
  };
  walk(tree.roots, 1);
  return out;
}

export type TreeMoveError = 'UNKNOWN_PARENT' | 'CATEGORY_CYCLE' | 'CATEGORY_TOO_DEEP';

/**
 * Whether a category may sit under this parent (null: at the top). Refused: a parent that
 * does not exist, the category itself or anything under it (a loop), and a place so deep
 * that the category's own subtree would pass `MAX_CATEGORY_DEPTH`. `id` is null for a
 * category not made yet — a leaf.
 */
export function moveError<T extends TreeRow>(tree: CategoryTree<T>, id: number | null, parentId: number | null): TreeMoveError | null {
  if (parentId == null) return id != null && subtreeHeight(tree, id) > MAX_CATEGORY_DEPTH ? 'CATEGORY_TOO_DEEP' : null;
  if (!tree.byId.has(parentId)) return 'UNKNOWN_PARENT';
  if (id != null && subtreeIds(tree, id).includes(parentId)) return 'CATEGORY_CYCLE';
  const height = id != null && tree.byId.has(id) ? subtreeHeight(tree, id) : 1;
  return depthOf(tree, parentId) + height > MAX_CATEGORY_DEPTH ? 'CATEGORY_TOO_DEEP' : null;
}

/**
 * The nearest category up the chain (the category itself first) whose slug is one of
 * `slugs`, or null. The code knows a few categories by slug — the calculator's finishes, the
 * studio's mouldings — and a product in a subcategory of one of them is still, to that code,
 * a product of it: a toilet in "Toilets" is sanitary ware.
 */
export function nearestSlug<T extends TreeRow & { slug: string }>(tree: CategoryTree<T>, id: number, slugs: ReadonlySet<string>): string | null {
  const path = pathOf(tree, id);
  for (let i = path.length - 1; i >= 0; i--) if (slugs.has(path[i].slug)) return path[i].slug;
  return null;
}

/** Every category under (and including) the ones with these slugs. */
export function subtreeOfSlugs<T extends TreeRow & { slug: string }>(tree: CategoryTree<T>, slugs: Iterable<string>): Set<number> {
  const wanted = new Set(slugs);
  const out = new Set<number>();
  for (const row of tree.byId.values()) if (wanted.has(row.slug)) for (const id of subtreeIds(tree, row.id)) out.add(id);
  return out;
}

/**
 * How many products each category holds counting its whole subtree, from the counts of the
 * products sitting in each category itself.
 */
export function subtreeCounts<T extends TreeRow>(tree: CategoryTree<T>, own: ReadonlyMap<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  const count = (id: number): number => {
    const known = out.get(id);
    if (known != null) return known;
    const total = (own.get(id) ?? 0) + childrenOf(tree, id).reduce((sum, child) => sum + count(child.id), 0);
    out.set(id, total);
    return total;
  };
  for (const id of tree.byId.keys()) count(id);
  return out;
}

/**
 * The category a product of this 3D kind belongs in: the one that takes the kind
 * (`categories.model3dKind` — the shallowest, then the first in order, if several do), else
 * the one with `fallbackSlug` (the archetype's own category), else null. Where the model
 * pipeline and people's own uploads file a product.
 */
export function categoryForKind<T extends TreeRow & { slug: string; model3dKind: string | null }>(tree: CategoryTree<T>, kind: string | null | undefined, fallbackSlug?: string | null): T | null {
  if (kind) {
    const taking = flattenTree(tree)
      .filter(({ row }) => row.model3dKind === kind)
      .sort((a, b) => a.depth - b.depth)[0];
    if (taking) return taking.row;
  }
  if (!fallbackSlug) return null;
  return [...tree.byId.values()].find((row) => row.slug === fallbackSlug) ?? null;
}

/**
 * The tree as options for a plain select: every category in reading order, indented by its
 * depth ("└ Corner sofas" under "Sofas & armchairs"), for filters and pickers.
 */
export function treeOptions<T extends TreeRow>(tree: CategoryTree<T>, name: (row: T) => string): Array<{ value: string; label: string }> {
  return flattenTree(tree).map(({ row, depth }) => ({ value: String(row.id), label: `${'\u2003'.repeat(depth - 1)}${depth > 1 ? '└ ' : ''}${name(row)}` }));
}
