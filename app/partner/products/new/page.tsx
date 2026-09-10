import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, stores } from '@/lib/db/schema';
import { ProductForm } from '@/components/admin/ProductForm';
import { getT } from '@/lib/i18n/server';
import { loadPartnerContext } from '@/lib/partner/context';

export const dynamic = 'force-dynamic';

/** A store adding a product to its own shelf — the admin form, pinned to this store. */
export default async function PartnerNewProductPage() {
  const t = await getT();
  const ctx = await loadPartnerContext();
  if (!ctx || ctx.type !== 'store' || !ctx.ref.storeId || ctx.isAdmin) return null;
  const [cats, storeRows] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.nameKa)),
    db.select().from(stores).where(eq(stores.id, ctx.ref.storeId)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{ctx.name}</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">{t.partner.addProduct}</h1>
      </div>
      <ProductForm categories={cats} stores={storeRows} partner={{ storeId: ctx.ref.storeId, backHref: '/partner/products' }} />
    </div>
  );
}
