import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, stores } from '@/lib/db/schema';
import { ProductForm } from '@/components/admin/ProductForm';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  await requireAdminPage('products');
  const ka = await getT();
  const [cats, storeRows] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.nameKa)),
    db.select().from(stores).orderBy(asc(stores.nameKa)),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'products'), { label: ka.admin.newItem.product }]} title={ka.admin.newItem.product} />
      <ProductForm categories={cats} stores={storeRows} />
    </div>
  );
}
