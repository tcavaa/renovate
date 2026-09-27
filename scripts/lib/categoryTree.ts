import { eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { categories } from '../../lib/db/schema';
import { DEFAULT_CATEGORY_TREE } from '../../lib/catalog/defaultTree';

/**
 * Where the seeds put a category they make: as the starting tree has it — under its parent,
 * with its icon, its place, its calculator tab and 3D kind (`lib/catalog/defaultTree.ts`,
 * which migration 0018 wrote into every existing database). A category the database already
 * has keeps its place: the tree is admin's once it exists.
 */
export async function defaultPlacement(slug: string) {
  const spec = DEFAULT_CATEGORY_TREE.find((c) => c.slug === slug);
  if (!spec) return { parentId: null, sortOrder: 0, inCalculator: true, icon: null, model3dKind: null };
  const [parent] = spec.parent ? await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, spec.parent)).limit(1) : [];
  return { parentId: parent?.id ?? null, sortOrder: spec.sortOrder, inCalculator: spec.inCalculator, icon: spec.icon, model3dKind: spec.model3dKind };
}
