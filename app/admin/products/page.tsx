import Link from 'next/link';
import Image from 'next/image';
import { and, asc, count, desc, eq, gte, isNotNull, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm';
import { Box, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { categories, products, stores } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader, AdminTable, EmptyRow, Pager, THead, Th, Tr } from '@/components/admin/AdminList';
import { getT, getLocale } from '@/lib/i18n/server';
import { unitLabel, pickLocalizedName, styleLabel } from '@/lib/i18n/labels';
import { parseListParams, type SearchParams } from '@/lib/admin/list';
import { STYLE_IDS } from '@/lib/design/styles';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SORTS = ['newest', 'name', 'price'] as const;
const PATH = '/admin/products';

export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const ka = getT();
  const locale = getLocale();
  const p = parseListParams(searchParams, { sorts: SORTS, defaultSort: 'newest' });

  const [cats, storeRows] = await Promise.all([
    db.select({ id: categories.id, nameKa: categories.nameKa, nameEn: categories.nameEn, slug: categories.slug }).from(categories).orderBy(asc(categories.phase), asc(categories.sortOrder)),
    db.select({ id: stores.id, nameKa: stores.nameKa }).from(stores).orderBy(asc(stores.nameKa)),
  ]);

  const where: SQL[] = [];
  if (p.q) {
    const needle = `%${p.q}%`;
    where.push(or(like(products.nameKa, needle), like(products.sku, needle), like(products.brand, needle), like(products.slug, needle))!);
  }
  if (p.num('category')) where.push(eq(products.categoryId, p.num('category')!));
  if (p.get('store') === 'none') where.push(isNull(products.storeId));
  else if (p.num('store')) where.push(eq(products.storeId, p.num('store')!));
  if (p.get('status') === 'active') where.push(eq(products.isActive, true));
  if (p.get('status') === 'inactive') where.push(eq(products.isActive, false));
  if (p.get('featured') === '1') where.push(eq(products.isFeatured, true));
  if (p.get('model') === 'has') where.push(isNotNull(products.model3dUrl));
  if (p.get('model') === 'none') where.push(isNull(products.model3dUrl));
  if (p.get('style')) where.push(sql`JSON_CONTAINS(${products.styleTags}, ${JSON.stringify(p.get('style'))})`);
  if (p.num('priceMin') != null) where.push(gte(products.pricePerUnit, String(p.num('priceMin'))));
  if (p.num('priceMax') != null) where.push(lte(products.pricePerUnit, String(p.num('priceMax'))));
  const filter = where.length ? and(...where) : undefined;

  const orderBy =
    p.sort === 'name'
      ? [p.dir === 'desc' ? desc(products.nameKa) : asc(products.nameKa)]
      : p.sort === 'price'
        ? [p.dir === 'asc' ? asc(products.pricePerUnit) : desc(products.pricePerUnit)]
        : [p.dir === 'asc' ? asc(products.id) : desc(products.id)];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: products.id,
        nameKa: products.nameKa,
        brand: products.brand,
        sku: products.sku,
        imageUrl: products.imageUrl,
        pricePerUnit: products.pricePerUnit,
        unit: products.unit,
        isActive: products.isActive,
        isFeatured: products.isFeatured,
        model3dUrl: products.model3dUrl,
        model3dKind: products.model3dKind,
        styleTags: products.styleTags,
        categoryName: categories.nameKa,
        categoryNameEn: categories.nameEn,
        storeName: stores.nameKa,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(stores, eq(products.storeId, stores.id))
      .where(filter)
      .orderBy(...orderBy)
      .limit(p.pageSize)
      .offset((p.page - 1) * p.pageSize),
    db.select({ total: count() }).from(products).where(filter),
  ]);

  const f = ka.admin.filters;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={ka.admin.products}
        subtitle={`${total} ${ka.admin.cols.products}`}
        actions={
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus className="h-4 w-4" /> {ka.admin.actions.create}
            </Link>
          </Button>
        }
      />

      <FilterBar
        fields={[
          { name: 'q', type: 'search', placeholder: `${f.search} (${ka.admin.forms.nameKa}, SKU, ${ka.admin.forms.brand})`, className: 'w-72' },
          { name: 'category', type: 'select', label: f.category, options: cats.map((c) => ({ value: String(c.id), label: pickLocalizedName(locale, c.nameKa, c.nameEn) })) },
          { name: 'store', type: 'select', label: f.store, options: [{ value: 'none', label: f.noStore }, ...storeRows.map((s) => ({ value: String(s.id), label: s.nameKa }))] },
          { name: 'style', type: 'select', label: f.style, options: STYLE_IDS.map((id) => ({ value: id, label: styleLabel(ka, id) })) },
          { name: 'status', type: 'select', label: f.status, options: [{ value: 'active', label: f.active }, { value: 'inactive', label: f.inactive }] },
          { name: 'model', type: 'select', label: f.model, options: [{ value: 'has', label: f.has3d }, { value: 'none', label: f.no3d }] },
          { name: 'featured', type: 'select', label: f.featured, options: [{ value: '1', label: f.featuredOnly }] },
          { name: 'priceMin', type: 'number', placeholder: f.priceFrom, min: 0 },
          { name: 'priceMax', type: 'number', placeholder: f.priceTo, min: 0 },
        ]}
        sorts={[
          { value: 'newest', label: f.sortNewest },
          { value: 'newest:asc', label: f.sortOldest },
          { value: 'name:asc', label: f.sortName },
          { value: 'price:asc', label: f.sortPriceAsc },
          { value: 'price', label: f.sortPriceDesc },
        ]}
        defaultSort="newest"
      />

      <AdminTable>
        <THead>
          <Th>{ka.admin.cols.product}</Th>
          <Th>{ka.admin.table.category}</Th>
          <Th>{ka.admin.cols.store}</Th>
          <Th right>{ka.admin.table.price}</Th>
          <Th>{ka.admin.cols.style}</Th>
          <Th>{ka.admin.cols.model3d}</Th>
          <Th>{ka.admin.table.status}</Th>
          <Th right>{ka.admin.table.actions}</Th>
        </THead>
        <tbody>
          {rows.map((r) => {
            const styles = Array.isArray(r.styleTags) ? (r.styleTags as string[]) : [];
            return (
              <Tr key={r.id}>
                <td className="px-4 py-2.5">
                  <Link href={`/admin/products/${r.id}`} className="flex items-center gap-3">
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-bg-base">
                      {r.imageUrl ? (
                        <Image src={r.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                      ) : (
                        <Box className="absolute inset-0 m-auto h-4 w-4 text-ink-muted" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium hover:text-brand">{r.nameKa}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {[r.brand, r.sku].filter(Boolean).join(' · ') || `#${r.id}`}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-ink-muted">{r.categoryName ? pickLocalizedName(locale, r.categoryName, r.categoryNameEn) : '—'}</td>
                <td className="px-4 py-2.5 text-ink-muted">{r.storeName ?? '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatGEL(Number(r.pricePerUnit))}
                  <span className="text-xs text-ink-muted"> / {unitLabel(ka, r.unit)}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex flex-wrap gap-1">
                    {styles.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">
                        {styleLabel(ka, s)}
                      </Badge>
                    ))}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {r.model3dUrl ? (
                    <Badge variant="success" title={r.model3dKind ?? undefined}>
                      3D
                    </Badge>
                  ) : r.model3dKind ? (
                    <Badge variant="secondary" title={r.model3dKind}>
                      —
                    </Badge>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {r.isActive ? <Badge variant="success">{ka.admin.badges.active}</Badge> : <Badge variant="secondary">{ka.admin.badges.inactive}</Badge>}
                  {r.isFeatured && <Badge className="ml-1">{ka.admin.badges.best}</Badge>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/products/${r.id}`}>{ka.admin.actions.edit}</Link>
                  </Button>
                </td>
              </Tr>
            );
          })}
          {rows.length === 0 && <EmptyRow colSpan={8} text={p.hasFilters ? f.noResults : ka.admin.productsEmpty} />}
        </tbody>
      </AdminTable>

      <Pager t={ka} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={Number(total)} />
    </div>
  );
}
