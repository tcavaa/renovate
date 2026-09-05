import Link from 'next/link';
import Image from 'next/image';
import { asc, count, eq } from 'drizzle-orm';
import { Plus, Star } from 'lucide-react';
import { db } from '@/lib/db';
import { products, stores } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT } from '@/lib/i18n/server';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminStoresPage() {
  const ka = getT();

  const rows = await db
    .select({
      id: stores.id,
      nameKa: stores.nameKa,
      city: stores.city,
      phone: stores.phone,
      logoUrl: stores.logoUrl,
      rating: stores.rating,
      deliveryDays: stores.deliveryDays,
      deliveryFeeGel: stores.deliveryFeeGel,
      isActive: stores.isActive,
      // A left join + group by rather than a correlated subquery: Drizzle emits the latter
      // without correlating it to the outer row, so every store came back with zero.
      productCount: count(products.id),
    })
    .from(stores)
    .leftJoin(products, eq(products.storeId, stores.id))
    .groupBy(stores.id)
    .orderBy(asc(stores.nameKa));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold">{ka.admin.stores}</h1>
        <Button asChild>
          <Link href="/admin/stores/new">
            <Plus className="h-4 w-4" /> {ka.admin.actions.create}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.admin.table.name}</th>
                <th className="px-4 py-3">{ka.admin.forms.city}</th>
                <th className="px-4 py-3 text-right">{ka.admin.products}</th>
                <th className="px-4 py-3">{ka.admin.table.rating}</th>
                <th className="px-4 py-3">{ka.admin.forms.deliveryDays}</th>
                <th className="px-4 py-3">{ka.admin.table.status}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-line/40 last:border-0 hover:bg-bg-base/50"
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      {s.logoUrl && (
                        <Image
                          src={s.logoUrl}
                          alt={s.nameKa}
                          width={26}
                          height={26}
                          className="rounded-md"
                        />
                      )}
                      {s.nameKa}
                    </span>
                    {s.phone && <span className="text-xs text-ink-muted">{s.phone}</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{s.city ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(s.productCount)}</td>
                  <td className="px-4 py-3">
                    {s.rating != null ? (
                      <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                        {Number(s.rating).toFixed(1)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {s.deliveryDays ?? '—'}
                    {s.deliveryFeeGel != null && (
                      <span className="ml-2 text-xs">
                        {Number(s.deliveryFeeGel) === 0
                          ? ka.design.freeDelivery
                          : formatGEL(Number(s.deliveryFeeGel))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.isActive ? (
                      <Badge variant="success">{ka.admin.badges.active}</Badge>
                    ) : (
                      <Badge variant="secondary">{ka.admin.badges.inactive}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/stores/${s.id}`}>{ka.admin.actions.edit}</Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-ink-muted">
                    {ka.admin.storesEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
