import { notFound } from 'next/navigation';
import { CategoryTabs } from '@/components/admin/CategoryTabs';
import { ShelfRoomForm } from '@/components/admin/ShelfRoomForm';
import { getLocale, getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { canDeleteIn } from '@/lib/auth/roles';
import { SHELF_ROOM_TYPES, loadShelfRoomData } from '@/lib/admin/shelfRoomPages';

export const dynamic = 'force-dynamic';

export default async function EditShelfRoomPage(props: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage('categories');
  const { id } = await props.params;
  const [ka, locale] = await Promise.all([getT(), getLocale()]);
  const { categories, rooms } = await loadShelfRoomData(locale);
  const room = rooms.find((r) => String(r.id) === id);
  if (!room) notFound();
  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'categories'), sectionCrumb(ka, 'shelfRooms'), { label: room.name }]} title={room.name} />
      <CategoryTabs active="rooms" />
      <ShelfRoomForm
        room={{ id: room.id, slug: room.slug, nameKa: room.nameKa, nameEn: room.nameEn, nameRu: room.nameRu, icon: room.icon, roomTypes: room.roomTypes, isVisible: room.isVisible, categoryIds: room.categoryIds }}
        categories={categories}
        roomTypes={SHELF_ROOM_TYPES}
        canDelete={canDeleteIn(session.user.role, 'categories')}
      />
    </div>
  );
}
