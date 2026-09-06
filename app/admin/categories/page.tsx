import Link from 'next/link';
import { and, asc, count, desc, eq, like, or, type SQL } from 'drizzle-orm';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { categories, products } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader, AdminTable, EmptyRow, Pager, THead, Th, Tr } from '@/components/admin/AdminList';
import { getT, getLocale } from '@/lib/i18n/server';
import { pickLocalizedName } from '@/lib/i18n/labels';
import { parseListParams, type SearchParams } from '@/lib/admin/list';

export const dynamic = 'force-dynamic';

const SORTS = ['phase', 'name', 'products'] as const;
const PATH = '/admin/categories';
const PHASES = [...Array.from({ length: 18 }, (_, i) => i + 1), 20];

export default async function AdminCategoriesPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const ka = await getT();
  const locale = await getLocale();
  const p = parseListParams(searchParams, { sorts: SORTS, defaultSort: 'phase', defaultDir: 'asc', pageSize: 50 });

  const where: SQL[] = [];
  if (p.q) {
    const needle = `%${p.q}%`;
    where.push(or(like(categories.nameKa, needle), like(categories.nameEn, needle), like(categories.slug, needle))!);
  }
  if (p.num('phase') != null) where.push(eq(categories.phase, p.num('phase')!));
  if (p.get('type') === 'furniture') where.push(eq(categories.isFurniture, true));
  if (p.get('type') === 'material') where.push(eq(categories.isFurniture, false));
  if (p.get('visibility') === 'visible') where.push(eq(categories.isVisible, true));
  if (p.get('visibility') === 'hidden') where.push(eq(categories.isVisible, false));
  const filter = where.length ? and(...where) : undefined;

  const productCount = count(products.id);
  const orderBy =
    p.sort === 'name'
      ? [p.dir === 'desc' ? desc(categories.nameKa) : asc(categories.nameKa)]
      : p.sort === 'products'
        ? [p.dir === 'asc' ? asc(productCount) : desc(productCount)]
        : [p.dir === 'desc' ? desc(categories.phase) : asc(categories.phase), asc(categories.sortOrder)];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: categories.id,
        nameKa: categories.nameKa,
        nameEn: categories.nameEn,
        nameRu: categories.nameRu,
        slug: categories.slug,
        phase: categories.phase,
        calculationType: categories.calculationType,
        isFurniture: categories.isFurniture,
        isVisible: categories.isVisible,
        productCount,
      })
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .where(filter)
      .groupBy(categories.id)
      .orderBy(...orderBy)
      .limit(p.pageSize)
      .offset((p.page - 1) * p.pageSize),
    db.select({ total: count() }).from(categories).where(filter),
  ]);

  const f = ka.admin.filters;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={ka.admin.categories}
        subtitle={`${total}`}
        actions={
          <Button asChild>
            <Link href="/admin/categories/new">
              <Plus className="h-4 w-4" /> {ka.admin.actions.create}
            </Link>
          </Button>
        }
      />

      <FilterBar
        fields={[
          { name: 'q', type: 'search' },
          { name: 'phase', type: 'select', label: f.phase, options: PHASES.map((n) => ({ value: String(n), label: `${n}` })) },
          { name: 'type', type: 'select', label: f.type, options: [{ value: 'material', label: ka.admin.badges.material }, { value: 'furniture', label: ka.admin.badges.furniture }] },
          { name: 'visibility', type: 'select', label: f.visibility, options: [{ value: 'visible', label: f.visible }, { value: 'hidden', label: f.hidden }] },
        ]}
        sorts={[
          { value: 'phase:asc', label: f.sortPhase },
          { value: 'name:asc', label: f.sortName },
          { value: 'products', label: f.sortProducts },
        ]}
        defaultSort="phase:asc"
      />

      <AdminTable>
        <THead>
          <Th>{ka.admin.table.name}</Th>
          <Th>{ka.admin.table.slug}</Th>
          <Th>{ka.admin.table.phase}</Th>
          <Th>{ka.admin.table.calcType}</Th>
          <Th>{ka.admin.table.type}</Th>
          <Th right>{ka.admin.cols.products}</Th>
          <Th>{ka.admin.table.status}</Th>
          <Th right>{ka.admin.table.actions}</Th>
        </THead>
        <tbody>
          {rows.map((c) => (
            <Tr key={c.id}>
              <td className="px-4 py-2.5 font-medium">
                <Link href={`/admin/categories/${c.id}`} className="hover:text-brand">
                  {pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu)}
                </Link>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{c.slug}</td>
              <td className="px-4 py-2.5">
                <Badge>{c.phase}</Badge>
              </td>
              <td className="px-4 py-2.5 text-ink-muted">
                {ka.admin.forms.calcTypes[c.calculationType as keyof typeof ka.admin.forms.calcTypes] ?? c.calculationType}
              </td>
              <td className="px-4 py-2.5">
                {c.isFurniture ? <Badge variant="secondary">{ka.admin.badges.furniture}</Badge> : <Badge variant="outline">{ka.admin.badges.material}</Badge>}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                <Link href={`/admin/products?category=${c.id}`} className="hover:text-brand hover:underline">
                  {Number(c.productCount)}
                </Link>
              </td>
              <td className="px-4 py-2.5">
                {c.isVisible ? <Badge variant="success">{ka.admin.badges.visible}</Badge> : <Badge variant="secondary">{ka.admin.badges.hidden}</Badge>}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/categories/${c.id}`}>{ka.admin.actions.edit}</Link>
                </Button>
              </td>
            </Tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={8} text={p.hasFilters ? f.noResults : ka.admin.categoriesEmpty} />}
        </tbody>
      </AdminTable>

      <Pager t={ka} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={Number(total)} />
    </div>
  );
}
