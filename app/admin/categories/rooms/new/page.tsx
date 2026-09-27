import { CategoryTabs } from '@/components/admin/CategoryTabs';
import { ShelfRoomForm } from '@/components/admin/ShelfRoomForm';
import { getLocale, getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { SHELF_ROOM_TYPES, loadShelfRoomData } from '@/lib/admin/shelfRoomPages';

export const dynamic = 'force-dynamic';

export default async function NewShelfRoomPage() {
  await requireAdminPage('categories');
  const [ka, locale] = await Promise.all([getT(), getLocale()]);
  const { categories } = await loadShelfRoomData(locale);
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">{ka.admin.shelfRooms.new}</h1>
      <CategoryTabs t={ka} active="rooms" />
      <ShelfRoomForm categories={categories} roomTypes={SHELF_ROOM_TYPES} />
    </div>
  );
}
