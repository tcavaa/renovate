import Link from 'next/link';
import Image from 'next/image';
import { and, asc, count, desc, eq, isNotNull, like, or, type SQL } from 'drizzle-orm';
import { Plus, Star } from 'lucide-react';
import { db } from '@/lib/db';
import { products, stores } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader, AdminTable, EmptyRow, Pager, THead, Th, Tr } from '@/components/admin/AdminList';
import { getT } from '@/lib/i18n/server';
import { parseListParams, type SearchParams } from '@/lib/admin/list';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SORTS = ['name', 'products', 'rating', 'newest'] as const;
const PATH = '/admin/stores';

export default async function AdminStoresPage({ searchParams }: { searchParams: SearchParams }) {
  const ka = getT();
  const p = parseListParams(searchParams, { sorts: SORTS, defaultSort: 'name', defaultDir: 'asc' });

  const cities = await db
    .selectDistinct({ city: stores.city })
    .from(stores)
    .where(isNotNull(stores.city))
    .orderBy(asc(stores.city));

  const where: SQL[] = [];
  if (p.q) {
    const needle = `%${p.q}%`;
    where.push(or(like(stores.nameKa, needle), like(stores.city, needle), like(stores.phone, needle))!);
  }
  if (p.get('status') === 'active') where.push(eq(stores.isActive, true));
  if (p.get('status') === 'inactive') where.push(eq(stores.isActive, false));
  if (p.get('city')) where.push(eq(stores.city, p.get('city')));
  const filter = where.length ? and(...where) : undefined;

  const productCount = count(products.id);
  const orderBy =
    p.sort === 'products'
      ? [p.dir === 'asc' ? asc(productCount) : desc(productCount)]
      : p.sort === 'rating'
        ? [p.dir === 'asc' ? asc(stores.rating) : desc(stores.rating)]
        : p.sort === 'newest'
          ? [p.dir === 'asc' ? asc(stores.id) : desc(stores.id)]
          : [p.dir === 'desc' ? desc(stores.nameKa) : asc(stores.nameKa)];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stores.id,
        nameKa: stores.nameKa,
        city: stores.city,
        phone: stores.phone,
        websiteUrl: stores.websiteUrl,
        logoUrl: stores.logoUrl,
        rating: stores.rating,
        deliveryDays: stores.deliveryDays,
        deliveryFeeGel: stores.deliveryFeeGel,
        isActive: stores.isActive,
        // A left join + group by rather than a correlated subquery: Drizzle emits the latter
        // without correlating it to the outer row, so every store came back with zero.
        productCount,
      })
      .from(stores)
      .leftJoin(products, eq(products.storeId, stores.id))
      .where(filter)
      .groupBy(stores.id)
      .orderBy(...orderBy)
      .limit(p.pageSize)
      .offset((p.page - 1) * p.pageSize),
    db.select({ total: count() }).from(stores).where(filter),
  ]);

  const f = ka.admin.filters;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={ka.admin.stores}
        subtitle={`${total}`}
        actions={
          <Button asChild>
            <Link href="/admin/stores/new">
              <Plus className="h-4 w-4" /> {ka.admin.actions.create}
            </Link>
          </Button>
        }
      />

      <FilterBar
        fields={[
          { name: 'q', type: 'search' },
          { name: 'city', type: 'select', label: f.city, options: cities.filter((c) => c.city).map((c) => ({ value: c.city!, label: c.city! })) },
          { name: 'status', type: 'select', label: f.status, options: [{ value: 'active', label: f.active }, { value: 'inactive', label: f.inactive }] },
        ]}
        sorts={[
          { value: 'name:asc', label: f.sortName },
          { value: 'products', label: f.sortProducts },
          { value: 'rating', label: f.sortRating },
          { value: 'newest', label: f.sortNewest },
        ]}
        defaultSort="name:asc"
      />

      <AdminTable>
        <THead>
          <Th>{ka.admin.table.name}</Th>
          <Th>{ka.admin.forms.city}</Th>
          <Th right>{ka.admin.cols.products}</Th>
          <Th>{ka.admin.table.rating}</Th>
          <Th>{ka.admin.forms.deliveryDays}</Th>
          <Th>{ka.admin.table.status}</Th>
          <Th right>{ka.admin.table.actions}</Th>
        </THead>
        <tbody>
          {rows.map((s) => (
            <Tr key={s.id}>
              <td className="px-4 py-2.5">
                <Link href={`/admin/stores/${s.id}`} className="flex items-center gap-3">
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-line bg-bg-base">
                    {s.logoUrl && <Image src={s.logoUrl} alt="" fill sizes="36px" className="object-cover" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium hover:text-brand">{s.nameKa}</span>
                    <span className="block truncate text-xs text-ink-muted">{[s.phone, s.websiteUrl?.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ')}</span>
                  </span>
                </Link>
              </td>
              <td className="px-4 py-2.5 text-ink-muted">{s.city ?? '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                <Link href={`/admin/products?store=${s.id}`} className="hover:text-brand hover:underline">
                  {Number(s.productCount)}
                </Link>
              </td>
              <td className="px-4 py-2.5">
                {s.rating != null ? (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                    {Number(s.rating).toFixed(1)}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-2.5 text-ink-muted">
                {s.deliveryDays ?? '—'}
                {s.deliveryFeeGel != null && (
                  <span className="ml-2 text-xs">{Number(s.deliveryFeeGel) === 0 ? ka.design.freeDelivery : formatGEL(Number(s.deliveryFeeGel))}</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {s.isActive ? <Badge variant="success">{ka.admin.badges.active}</Badge> : <Badge variant="secondary">{ka.admin.badges.inactive}</Badge>}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/stores/${s.id}`}>{ka.admin.actions.edit}</Link>
                </Button>
              </td>
            </Tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={7} text={p.hasFilters ? f.noResults : ka.admin.storesEmpty} />}
        </tbody>
      </AdminTable>

      <Pager t={ka} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={Number(total)} />
    </div>
  );
}
