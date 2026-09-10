import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products, stores } from '@/lib/db/schema';
import { ProductForm } from '@/components/admin/ProductForm';
import { getT } from '@/lib/i18n/server';
import { loadPartnerContext } from '@/lib/partner/context';

export const dynamic = 'force-dynamic';

/** A store editing one of its own products. Someone else's product is simply not found. */
export default async function PartnerEditProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const t = await getT();
  const ctx = await loadPartnerContext();
  if (!ctx || ctx.type !== 'store' || !ctx.ref.storeId || ctx.isAdmin) return null;
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const [productRow, cats, storeRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.id, id), eq(products.storeId, ctx.ref.storeId))).limit(1),
    db.select().from(categories).orderBy(asc(categories.nameKa)),
    db.select().from(stores).where(eq(stores.id, ctx.ref.storeId)),
  ]);
  if (productRow.length === 0) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{ctx.name}</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">{t.partner.editProduct}</h1>
      </div>
      <ProductForm product={productRow[0]} categories={cats} stores={storeRows} partner={{ storeId: ctx.ref.storeId, backHref: '/partner/products' }} />
    </div>
  );
}
