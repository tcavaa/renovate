import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { CategoryForm } from '@/components/admin/CategoryForm';
import { CategoryTabs } from '@/components/admin/CategoryTabs';
import { getLocale, getT } from '@/lib/i18n/server';
import { pickLocalizedName } from '@/lib/i18n/labels';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { canDeleteIn } from '@/lib/auth/roles';
import { buildCategoryTree, pathOf, subtreeCounts } from '@/lib/catalog/tree';
import { loadCategoryFormData, productCountsByCategory, roomIdsOfCategory } from '@/lib/admin/categoryPages';

export const dynamic = 'force-dynamic';

export default async function EditCategoryPage(props: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage('categories');
  const params = await props.params;
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const [ka, locale] = await Promise.all([getT(), getLocale()]);
  const [rows, { all, rooms }, roomIds, own] = await Promise.all([db.select().from(categories).where(eq(categories.id, id)).limit(1), loadCategoryFormData(locale), roomIdsOfCategory(id), productCountsByCategory()]);
  if (rows.length === 0) notFound();
  const tree = buildCategoryTree(all);
  const path = pathOf(tree, id);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumbs={[
          sectionCrumb(ka, 'categories'),
          // The categories above it, each its own page: the path is the way back up the tree.
          ...path.slice(0, -1).map((c) => ({ label: pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu), href: `/admin/categories/${c.id}` })),
          { label: pickLocalizedName(locale, rows[0].nameKa, rows[0].nameEn, rows[0].nameRu) },
        ]}
        title={pickLocalizedName(locale, rows[0].nameKa, rows[0].nameEn, rows[0].nameRu)}
      />
      <CategoryTabs active="tree" />
      <CategoryForm category={rows[0]} all={all} rooms={rooms} roomIds={roomIds} counts={{ own: own.get(id) ?? 0, total: subtreeCounts(tree, own).get(id) ?? 0 }} canDelete={canDeleteIn(session.user.role, 'categories')} />
    </div>
  );
}
