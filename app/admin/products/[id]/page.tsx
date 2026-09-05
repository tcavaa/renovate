import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, categories, stores } from '@/lib/db/schema';
import { ProductForm } from '@/components/admin/ProductForm';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const ka = getT();
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const [productRow, cats, storeRows] = await Promise.all([
    db.select().from(products).where(eq(products.id, id)).limit(1),
    db.select().from(categories).orderBy(asc(categories.nameKa)),
    db.select().from(stores).orderBy(asc(stores.nameKa)),
  ]);
  if (productRow.length === 0) notFound();

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">{ka.admin.actions.edit}</h1>
      <ProductForm product={productRow[0]} categories={cats} stores={storeRows} />
    </div>
  );
}
