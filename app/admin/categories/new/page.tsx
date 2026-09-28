import { CategoryForm } from '@/components/admin/CategoryForm';
import { CategoryTabs } from '@/components/admin/CategoryTabs';
import { getLocale, getT } from '@/lib/i18n/server';
import { pickLocalizedName } from '@/lib/i18n/labels';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { fill } from '@/lib/admin/list';
import { loadCategoryFormData } from '@/lib/admin/categoryPages';

export const dynamic = 'force-dynamic';

/** A new category — at the top, or under the one whose "+" was pressed (`?parent=`). */
export default async function NewCategoryPage(props: { searchParams: Promise<{ parent?: string }> }) {
  await requireAdminPage('categories');
  const search = await props.searchParams;
  const [ka, locale] = await Promise.all([getT(), getLocale()]);
  const { all, rooms } = await loadCategoryFormData(locale);
  const parent = all.find((c) => String(c.id) === search.parent) ?? null;
  const title = parent ? fill(ka.admin.catForm.newUnder, { parent: pickLocalizedName(locale, parent.nameKa, parent.nameEn, parent.nameRu) }) : ka.admin.catForm.newTop;
  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'categories'), { label: title }]} title={title} />
      <CategoryTabs active="tree" />
      <CategoryForm all={all} initialParentId={parent?.id ?? null} rooms={rooms} />
    </div>
  );
}
