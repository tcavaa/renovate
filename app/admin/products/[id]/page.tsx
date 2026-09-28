import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, categories, stores } from '@/lib/db/schema';
import { ProductForm } from '@/components/admin/ProductForm';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { canDeleteIn } from '@/lib/auth/roles';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';

export const dynamic = 'force-dynamic';

export default async function EditProductPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const session = await requireAdminPage('products');
  const params = await props.params;
  const ka = await getT();
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
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'products'), { label: productRow[0].nameKa }]} eyebrow={`${ka.admin.actions.edit} · #${productRow[0].id}${productRow[0].sku ? ` · ${productRow[0].sku}` : ''}`} title={productRow[0].nameKa} />
      <ProductForm product={productRow[0]} categories={cats} stores={storeRows} canDelete={canDeleteIn(session.user.role, 'products')} />
    </div>
  );
}
