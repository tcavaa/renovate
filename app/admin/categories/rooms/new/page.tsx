import { CategoryTabs } from '@/components/admin/CategoryTabs';
import { ShelfRoomForm } from '@/components/admin/ShelfRoomForm';
import { getLocale, getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { SHELF_ROOM_TYPES, loadShelfRoomData } from '@/lib/admin/shelfRoomPages';

export const dynamic = 'force-dynamic';

export default async function NewShelfRoomPage() {
  await requireAdminPage('categories');
  const [ka, locale] = await Promise.all([getT(), getLocale()]);
  const { categories } = await loadShelfRoomData(locale);
  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'categories'), sectionCrumb(ka, 'shelfRooms'), { label: ka.admin.shelfRooms.new }]} title={ka.admin.shelfRooms.new} />
      <CategoryTabs active="rooms" />
      <ShelfRoomForm categories={categories} roomTypes={SHELF_ROOM_TYPES} />
    </div>
  );
}
