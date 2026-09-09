import Image from 'next/image';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products } from '@/lib/db/schema';
import { getLocale, getT } from '@/lib/i18n/server';
import { loadPartnerContext } from '@/lib/partner/context';
import { localizedName, unitLabel } from '@/lib/i18n/labels';
import { Badge } from '@/components/ui/badge';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** What the store sells on the platform — read-only for now; adding goes through admin. */
export default async function PartnerProductsPage(props: { searchParams: Promise<{ store?: string; worker?: string }> }) {
  const search = await props.searchParams;
  const t = await getT();
  const locale = await getLocale();
  const ctx = await loadPartnerContext(search);
  if (!ctx || ctx.type !== 'store' || !ctx.ref.storeId) return null;

  const rows = await db
    .select({ id: products.id, nameKa: products.nameKa, nameEn: products.nameEn, nameRu: products.nameRu, slug: products.slug, pricePerUnit: products.pricePerUnit, unit: products.unit, imageUrl: products.imageUrl, isActive: products.isActive, categoryKa: categories.nameKa, categoryEn: categories.nameEn, categoryRu: categories.nameRu, categorySlug: categories.slug })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.storeId, ctx.ref.storeId))
    .orderBy(asc(categories.sortOrder), asc(products.nameKa));

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{ctx.name}</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">{t.partner.myProducts}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t.partner.productsHint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="border border-dashed border-line p-12 text-center text-sm text-ink-muted">{t.partner.noProducts}</p>
      ) : (
        <div className="overflow-x-auto border border-line bg-bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                <th className="px-4 py-3">{t.partner.colProduct}</th>
                <th className="px-4 py-3">{t.admin.table.category}</th>
                <th className="px-4 py-3 text-right">{t.partner.colPrice}</th>
                <th className="px-4 py-3">{t.partner.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-line/70 last:border-b-0 hover:bg-bg-base/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/catalog/${p.categorySlug}?q=${encodeURIComponent(p.nameKa)}`} className="flex items-center gap-3 hover:text-brand">
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden border border-line bg-bg-base">{p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" />}</span>
                      <span className="font-medium">{localizedName(locale, p)}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{localizedName(locale, { nameKa: p.categoryKa, nameEn: p.categoryEn, nameRu: p.categoryRu })}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatGEL(Number(p.pricePerUnit))} <span className="text-xs text-ink-muted">/ {unitLabel(t, p.unit)}</span>
                  </td>
                  <td className="px-4 py-2.5">{p.isActive ? <Badge variant="success">{t.admin.filters.active}</Badge> : <Badge variant="outline">{t.partner.inactiveProduct}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
