import Image from 'next/image';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { categories, products } from '@/lib/db/schema';
import { getLocale, getT } from '@/lib/i18n/server';
import { loadPartnerContext, partnerHref } from '@/lib/partner/context';
import { localizedName, unitLabel } from '@/lib/i18n/labels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** What the store sells on the platform: its own shelf, with adding and editing in its own hands. */
export default async function PartnerProductsPage(props: { searchParams: Promise<{ store?: string; worker?: string }> }) {
  const search = await props.searchParams;
  const t = await getT();
  const locale = await getLocale();
  const ctx = await loadPartnerContext(search);
  if (!ctx || ctx.type !== 'store' || !ctx.ref.storeId) return null;

  const rows = await db
    .select({ id: products.id, nameKa: products.nameKa, nameEn: products.nameEn, nameRu: products.nameRu, slug: products.slug, pricePerUnit: products.pricePerUnit, unit: products.unit, imageUrl: products.imageUrl, isActive: products.isActive, model3dUrl: products.model3dUrl, categoryKa: categories.nameKa, categoryEn: categories.nameEn, categoryRu: categories.nameRu, categorySlug: categories.slug })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.storeId, ctx.ref.storeId))
    .orderBy(asc(categories.sortOrder), asc(products.nameKa));
  // Admin previewing a store edits its products in admin; the store edits them here.
  const editHref = (id: number) => (ctx.isAdmin ? `/admin/products/${id}` : `/partner/products/${id}`);

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
                <th className="px-4 py-3 text-right">{t.admin.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-line/70 last:border-b-0 hover:bg-bg-base/60">
                  <td className="px-4 py-2.5">
                    <Link href={editHref(p.id)} className="flex items-center gap-3 hover:text-brand">
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden border border-line bg-bg-base">{p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" />}</span>
                      <span className="min-w-0">
                        <span className="block font-medium">{localizedName(locale, p)}</span>
                        {p.model3dUrl && <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">3D</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{localizedName(locale, { nameKa: p.categoryKa, nameEn: p.categoryEn, nameRu: p.categoryRu })}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatGEL(Number(p.pricePerUnit))} <span className="text-xs text-ink-muted">/ {unitLabel(t, p.unit)}</span>
                  </td>
                  <td className="px-4 py-2.5">{p.isActive ? <Badge variant="success">{t.admin.filters.active}</Badge> : <Badge variant="outline">{t.partner.inactiveProduct}</Badge>}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={editHref(p.id)}>{t.partner.editProduct}</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
