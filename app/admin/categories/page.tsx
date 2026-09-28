import Link from 'next/link';
import { asc, count } from 'drizzle-orm';
import { Info, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { products, shelfRoomCategories, shelfRooms } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { CategoryTabs } from '@/components/admin/CategoryTabs';
import { CategoryTree, type CategoryTreeRow } from '@/components/admin/CategoryTree';
import { getT, getLocale } from '@/lib/i18n/server';
import { pickLocalizedName, productKindLabel } from '@/lib/i18n/labels';
import { fill, parseListParams, type SearchParams } from '@/lib/admin/list';
import { flattenTree, pathOf, subtreeCounts } from '@/lib/catalog/tree';
import { loadCategoryTree } from '@/lib/catalog/queries';
import { iconNodeFor } from '@/lib/catalog/iconNodes';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';

export const dynamic = 'force-dynamic';

const SHOWS = ['empty', 'hidden', 'calculator', 'studio', 'kind'] as const;
type Show = (typeof SHOWS)[number];

/**
 * The category tree: every category under its parent, what it holds and where it shows, and
 * the buttons to order, nest and edit it (`CategoryTree`). A search or a filter keeps the
 * categories that answer it and the ones above them, for context. The studio's rooms are the
 * other tab.
 */
export default async function AdminCategoriesPage(props: { searchParams: Promise<SearchParams> }) {
  await requireAdminPage('categories');
  const searchParams = await props.searchParams;
  const ka = await getT();
  const locale = await getLocale();
  const p = parseListParams(searchParams, { sorts: ['tree'] as const, defaultSort: 'tree', pageSize: 500 });
  const show = (SHOWS as readonly string[]).includes(p.get('show')) ? (p.get('show') as Show) : null;
  const c = ka.admin.catTree;

  const [tree, countRows, rooms, links] = await Promise.all([
    loadCategoryTree(),
    db.select({ categoryId: products.categoryId, n: count() }).from(products).groupBy(products.categoryId),
    db.select({ id: shelfRooms.id, nameKa: shelfRooms.nameKa, nameEn: shelfRooms.nameEn, nameRu: shelfRooms.nameRu }).from(shelfRooms).orderBy(asc(shelfRooms.sortOrder)),
    db.select().from(shelfRoomCategories),
  ]);
  const own = new Map(countRows.map((r) => [r.categoryId, Number(r.n)]));
  const totals = subtreeCounts(tree, own);
  const roomName = new Map(rooms.map((r) => [r.id, pickLocalizedName(locale, r.nameKa, r.nameEn, r.nameRu)]));
  const roomsOf = (id: number) =>
    links
      .filter((l) => l.categoryId === id)
      .map((l) => ({ id: l.shelfRoomId, name: roomName.get(l.shelfRoomId) ?? '' }))
      .sort((a, b) => rooms.findIndex((r) => r.id === a.id) - rooms.findIndex((r) => r.id === b.id));

  const flat = flattenTree(tree);
  const name = (row: (typeof flat)[number]['row']) => pickLocalizedName(locale, row.nameKa, row.nameEn, row.nameRu);
  const q = p.q.toLowerCase();
  const answers = (row: (typeof flat)[number]['row']): boolean => {
    if (q && ![row.nameKa, row.nameEn, row.nameRu, row.slug].some((v) => v?.toLowerCase().includes(q))) return false;
    if (show === 'empty') return (totals.get(row.id) ?? 0) === 0;
    if (show === 'hidden') return !row.isVisible;
    if (show === 'calculator') return row.inCalculator;
    if (show === 'studio') return links.some((l) => l.categoryId === row.id);
    if (show === 'kind') return !!row.model3dKind;
    return true;
  };
  const filtered = !!q || !!show;
  const matches = new Set(flat.filter(({ row }) => answers(row)).map(({ row }) => row.id));
  // A category that answers brings the ones above it along, so it is never shown out of place.
  const listed = new Set<number>();
  for (const id of matches) for (const node of pathOf(tree, id)) listed.add(node.id);

  const rows: CategoryTreeRow[] = flat
    .filter(({ row }) => !filtered || listed.has(row.id))
    .map(({ row, depth }) => ({
      id: row.id,
      parentId: row.parentId,
      depth,
      name: name(row),
      slug: row.slug,
      icon: iconNodeFor(row.icon),
      isVisible: row.isVisible,
      inCalculator: row.inCalculator,
      isFurniture: row.isFurniture,
      kindLabel: row.model3dKind ? productKindLabel(ka, locale, row.model3dKind) : null,
      own: own.get(row.id) ?? 0,
      total: totals.get(row.id) ?? 0,
      rooms: roomsOf(row.id),
      hasChildren: (tree.children.get(row.id)?.length ?? 0) > 0,
      match: !filtered || matches.has(row.id),
    }));

  return (
    <div className="space-y-5">
      <AdminPageHeader
        crumbs={[sectionCrumb(ka, 'categories', true)]}
        title={ka.admin.categories}
        subtitle={fill(c.subtitle, { n: tree.byId.size, top: tree.roots.length })}
        actions={
          <Button asChild>
            <Link href="/admin/categories/new">
              <Plus className="h-4 w-4" /> {ka.admin.actions.create}
            </Link>
          </Button>
        }
      />
      <CategoryTabs active="tree" />

      <details className="border border-line bg-bg-surface">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-ink">
          <Info className="h-4 w-4 text-ink-muted" aria-hidden />
          {c.howTitle}
        </summary>
        <ul className="list-disc space-y-1.5 border-t border-line py-4 pl-9 pr-4 text-sm text-ink-muted">
          {Object.values(c.how).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      <FilterBar
        fields={[
          { name: 'q', type: 'search' },
          { name: 'show', type: 'select', label: c.show, options: SHOWS.map((s) => ({ value: s, label: c.shows[s] })) },
        ]}
      />

      {/* A new search is a new tree: everything it found unfolded. The whole tree keeps the folds it was left with. */}
      <CategoryTree key={filtered ? `${q}|${show ?? ''}` : 'tree'} rows={rows} filtered={filtered} />
      {filtered && <p className="text-xs text-ink-muted">{fill(c.matchCount, { n: matches.size })}</p>}
    </div>
  );
}
