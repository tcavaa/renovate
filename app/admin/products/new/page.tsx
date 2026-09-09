import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, stores } from '@/lib/db/schema';
import { ProductForm } from '@/components/admin/ProductForm';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const ka = await getT();
  const [cats, storeRows] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.nameKa)),
    db.select().from(stores).orderBy(asc(stores.nameKa)),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">{ka.admin.actions.create}</h1>
      <ProductForm categories={cats} stores={storeRows} />
    </div>
  );
}
