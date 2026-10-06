import Image from '@/components/ui/image';
import Link from 'next/link';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, like, ne, or, sql, type SQL } from 'drizzle-orm';
import { Box, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { categories, orderItems, orders, products } from '@/lib/db/schema';
import { getLocale, getT } from '@/lib/i18n/server';
import { loadPartnerContext, partnerHref } from '@/lib/partner/context';
import { storeCatalogueHealth } from '@/lib/partner/analytics';
import { localizedName, unitLabel } from '@/lib/i18n/labels';
import { fill, hrefWith, parseListParams, type SearchParams } from '@/lib/admin/list';
import { pathOf, subtreeIds, treeOptions } from '@/lib/catalog/tree';
import { loadCategoryTree } from '@/lib/catalog/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/admin/FilterBar';
import { Pager } from '@/components/admin/AdminList';
import { BulkAllCheckbox, BulkBar, BulkCheckbox, BulkProvider } from '@/components/admin/BulkSelect';
import { ProductRowActions } from '@/components/admin/ProductRowActions';
import { cn, formatGEL, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PATH = '/partner/products';
const SORTS = ['newest', 'name', 'price', 'sold', 'revenue'] as const;

/**
 * What the store sells on the platform: its own shelf, in its own hands. The counts at the top
 * are links (shown, hidden, missing a photo or a 3D model); search, filters and sorting — best
 * sellers included — live in the URL like the admin's lists; rows are hidden, shown or deleted
 * one at a time or ticked and done together. Every figure of what sold counts only orders the
 * store was sent, cancelled ones and struck lines left out.
 */
export default async function PartnerProductsPage(props: { searchParams: Promise<SearchParams> }) {
  const search = await props.searchParams;
  const t = await getT();
  const locale = await getLocale();
  const ctx = await loadPartnerContext({ store: typeof search.store === 'string' ? search.store : undefined });
  if (!ctx || ctx.type !== 'store' || !ctx.ref.storeId) return null;
  const storeId = ctx.ref.storeId;
  const p = parseListParams(search, { sorts: SORTS, defaultSort: 'newest' });
  const pp = t.partnerProducts;
  const f = t.admin.filters;

  // What each product of this store sold: a derived table joined on, so the list can sort by it.
  const sales = db
    .select({
      productId: orderItems.productId,
      units: sql<number>`SUM(${orderItems.qty})`.as('units'),
      revenue: sql<number>`SUM(${orderItems.total})`.as('revenue'),
      orderCount: sql<number>`COUNT(DISTINCT ${orderItems.orderId})`.as('order_count'),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.storeId, storeId), isNotNull(orders.sentAt), ne(orders.status, 'cancelled'), eq(orderItems.removed, false)))
    .groupBy(orderItems.productId)
    .as('sales');

  const tree = await loadCategoryTree();
  const where: SQL[] = [eq(products.storeId, storeId), isNull(products.ownerUserId)];
  if (p.q) {
    const needle = `%${p.q}%`;
    where.push(or(like(products.nameKa, needle), like(products.nameEn, needle), like(products.sku, needle), like(products.brand, needle))!);
  }
  // A category stands for everything under it: "Furniture" lists the store's sofas and beds.
  if (p.num('category')) {
    const ids = subtreeIds(tree, p.num('category')!);
    where.push(inArray(products.categoryId, ids.length ? ids : [-1]));
  }
  if (p.get('status') === 'shown') where.push(eq(products.isActive, true));
  if (p.get('status') === 'hidden') where.push(eq(products.isActive, false));
  if (p.get('model') === 'has') where.push(isNotNull(products.model3dUrl));
  if (p.get('model') === 'none') where.push(isNull(products.model3dUrl));
  if (p.get('photo') === 'has') where.push(sql`${products.imageUrl} IS NOT NULL AND ${products.imageUrl} <> ''`);
  if (p.get('photo') === 'none') where.push(sql`(${products.imageUrl} IS NULL OR ${products.imageUrl} = '')`);
  const filter = and(...where);

  const orderBy =
    p.sort === 'name'
      ? [p.dir === 'desc' ? desc(products.nameKa) : asc(products.nameKa)]
      : p.sort === 'price'
        ? [p.dir === 'asc' ? asc(products.pricePerUnit) : desc(products.pricePerUnit)]
        : p.sort === 'sold'
          ? [desc(sql`COALESCE(${sales.units}, 0)`), desc(products.id)]
          : p.sort === 'revenue'
            ? [desc(sql`COALESCE(${sales.revenue}, 0)`), desc(products.id)]
            : [p.dir === 'asc' ? asc(products.id) : desc(products.id)];

  const [rows, [{ total }], cats, health] = await Promise.all([
    db
      .select({
        id: products.id,
        nameKa: products.nameKa,
        nameEn: products.nameEn,
        nameRu: products.nameRu,
        sku: products.sku,
        brand: products.brand,
        pricePerUnit: products.pricePerUnit,
        unit: products.unit,
        imageUrl: products.imageUrl,
        isActive: products.isActive,
        model3dUrl: products.model3dUrl,
        categoryKa: categories.nameKa,
        categoryEn: categories.nameEn,
        categoryRu: categories.nameRu,
        units: sales.units,
        revenue: sales.revenue,
        orderCount: sales.orderCount,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(sales, eq(sales.productId, products.id))
      .where(filter)
      .orderBy(...orderBy)
      .limit(p.pageSize)
      .offset((p.page - 1) * p.pageSize),
    db.select({ total: count() }).from(products).where(filter),
    // The categories this store sells in: a filter with only its own.
    db
      .selectDistinct({ id: categories.id, nameKa: categories.nameKa, nameEn: categories.nameEn, nameRu: categories.nameRu })
      .from(categories)
      .innerJoin(products, eq(products.categoryId, categories.id))
      .where(and(eq(products.storeId, storeId), isNull(products.ownerUserId)))
      .orderBy(asc(categories.nameKa)),
    storeCatalogueHealth(storeId),
  ]);
  // The categories this store sells in, with the ones above them, as the tree has them.
  const onPath = new Set(cats.flatMap((c) => pathOf(tree, c.id).map((node) => node.id)));
  const categoryOptions = treeOptions(tree, (c) => localizedName(locale, c)).filter((o) => onPath.has(Number(o.value)));

  // Admin previewing a store edits its products in admin; the store edits them here.
  const editHref = (id: number) => (ctx.isAdmin ? `/admin/products/${id}` : `/partner/products/${id}`);
  // Which count is the view: a missing photo or model wins over the visibility filter.
  const activeChip = p.get('photo') === 'none' ? 'photo:none' : p.get('model') === 'none' ? 'model:none' : `status:${p.get('status') || 'all'}`;
  const chip = (key: string, value: string | undefined, label: string, n: number) => {
    const active = activeChip === `${key}:${value ?? 'all'}`;
    return (
      <Link key={`${key}-${value ?? 'all'}`} href={hrefWith(PATH, { ...p.raw }, { status: undefined, photo: undefined, model: undefined, page: undefined, [key]: value })} className={cn('border px-3 py-1.5 text-xs font-medium transition-colors', active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-ink')}>
        {label} · {n}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{ctx.name}</p>
          <h1 className="mt-2 font-serif text-3xl font-bold">{t.partner.myProducts}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t.partner.productsHintOwn}</p>
        </div>
        <Button asChild variant="ink">
          <Link href={ctx.isAdmin ? '/admin/products/new' : partnerHref('/partner/products/new', ctx)}>
            <Plus className="h-4 w-4" />
            {t.partner.addProduct}
          </Link>
        </Button>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label={pp.visibility}>
        {chip('status', undefined, pp.all, health.total)}
        {chip('status', 'shown', pp.shown, health.shown)}
        {chip('status', 'hidden', pp.hidden, health.hidden)}
        {chip('photo', 'none', pp.noPhoto, health.noPhoto)}
        {chip('model', 'none', pp.no3d, health.no3d)}
      </nav>

      <FilterBar
        fields={[
          { name: 'q', type: 'search', placeholder: pp.searchPlaceholder },
          { name: 'category', type: 'select', label: pp.category, options: categoryOptions },
          { name: 'status', type: 'select', label: pp.visibility, options: [{ value: 'shown', label: pp.shown }, { value: 'hidden', label: pp.hidden }] },
          { name: 'model', type: 'select', label: f.model, options: [{ value: 'has', label: f.has3d }, { value: 'none', label: f.no3d }] },
          { name: 'photo', type: 'select', label: pp.photo, options: [{ value: 'has', label: pp.withPhoto }, { value: 'none', label: pp.noPhoto }] },
        ]}
        sorts={[
          { value: 'newest', label: f.sortNewest },
          { value: 'sold', label: pp.sortBestSelling },
          { value: 'revenue', label: pp.sortRevenue },
          { value: 'name:asc', label: f.sortName },
          { value: 'price:asc', label: f.sortPriceAsc },
          { value: 'price', label: f.sortPriceDesc },
        ]}
        defaultSort="newest"
      />

      {health.hidden > 0 && <p className="text-xs text-ink-muted">{pp.hiddenHint}</p>}

      {rows.length === 0 ? (
        <p className="border border-dashed border-line p-12 text-center text-sm text-ink-muted">{p.hasFilters ? pp.emptyFiltered : t.partner.noProducts}</p>
      ) : (
        <BulkProvider>
          <BulkBar endpoint="/api/products/bulk" />
          <div className="overflow-x-auto border border-line bg-bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  <th className="w-10 px-4 py-3">
                    <BulkAllCheckbox ids={rows.map((r) => r.id)} />
                  </th>
                  <th className="px-4 py-3">{t.partner.colProduct}</th>
                  <th className="px-4 py-3">{t.admin.table.category}</th>
                  <th className="px-4 py-3 text-right">{t.partner.colPrice}</th>
                  <th className="px-4 py-3 text-right">{pp.sold}</th>
                  <th className="px-4 py-3">{t.partner.colStatus}</th>
                  <th className="px-4 py-3 text-right">{t.admin.table.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={cn('border-b border-line/70 last:border-b-0 hover:bg-bg-base/60', !row.isActive && 'opacity-70')}>
                    <td className="px-4 py-2.5">
                      <BulkCheckbox id={row.id} label={row.nameKa} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={editHref(row.id)} className="flex items-center gap-3 hover:text-brand">
                        <span className="relative h-10 w-10 shrink-0 overflow-hidden border border-line bg-bg-base">
                          {row.imageUrl ? <Image src={row.imageUrl} alt="" fill sizes="40px" className="object-cover" /> : <Box className="absolute inset-0 m-auto h-4 w-4 text-ink-muted" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium">{localizedName(locale, row)}</span>
                          <span className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                            {[row.brand, row.sku].filter(Boolean).join(' · ')}
                            {row.model3dUrl && <span className="font-semibold uppercase tracking-[0.12em]">3D</span>}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{localizedName(locale, { nameKa: row.categoryKa, nameEn: row.categoryEn, nameRu: row.categoryRu })}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatGEL(Number(row.pricePerUnit))} <span className="text-xs text-ink-muted">/ {unitLabel(t, row.unit)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {row.units ? (
                        <>
                          {formatGEL(Number(row.revenue ?? 0))}
                          <span className="block text-xs text-ink-muted">
                            {fill(pp.soldUnits, { n: formatNumber(Number(row.units)) })} · {fill(pp.soldOrders, { n: Number(row.orderCount ?? 0) })}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-ink-faint">{pp.notSold}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{row.isActive ? <Badge variant="success">{pp.shown}</Badge> : <Badge variant="outline">{pp.hidden}</Badge>}</td>
                    <td className="px-4 py-2.5">
                      <ProductRowActions id={row.id} isActive={row.isActive} editHref={editHref(row.id)} canDelete />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BulkProvider>
      )}

      <Pager t={t} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={Number(total)} />
    </div>
  );
}
