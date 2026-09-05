import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { products, categories } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT, getLocale } from '@/lib/i18n/server';
import { unitLabel, pickLocalizedName } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const ka = getT();
  const locale = getLocale();
  const rows = await db
    .select({
      id: products.id,
      nameKa: products.nameKa,
      pricePerUnit: products.pricePerUnit,
      unit: products.unit,
      isActive: products.isActive,
      isFeatured: products.isFeatured,
      categoryName: categories.nameKa,
      categoryNameEn: categories.nameEn,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .orderBy(desc(products.id))
    .limit(200);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold">{ka.admin.products}</h1>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus className="h-4 w-4" /> {ka.admin.actions.create}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.admin.table.name}</th>
                <th className="px-4 py-3">{ka.admin.table.category}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.price}</th>
                <th className="px-4 py-3">{ka.admin.table.unit}</th>
                <th className="px-4 py-3">{ka.admin.table.status}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-line/40 last:border-0 hover:bg-bg-base/50">
                  <td className="px-4 py-3 font-medium">{p.nameKa}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {p.categoryName
                      ? pickLocalizedName(locale, p.categoryName, p.categoryNameEn)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatGEL(Number(p.pricePerUnit))}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{unitLabel(ka, p.unit)}</td>
                  <td className="px-4 py-3">
                    {p.isActive ? (
                      <Badge variant="success">{ka.admin.badges.active}</Badge>
                    ) : (
                      <Badge variant="secondary">{ka.admin.badges.inactive}</Badge>
                    )}
                    {p.isFeatured && <Badge className="ml-1">{ka.admin.badges.best}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/products/${p.id}`}>{ka.admin.actions.edit}</Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-ink-muted">
                    {ka.admin.productsEmpty}
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
