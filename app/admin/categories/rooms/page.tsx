import Link from 'next/link';
import { Info, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { CategoryTabs } from '@/components/admin/CategoryTabs';
import { ShelfRoomList } from '@/components/admin/ShelfRoomList';
import { getLocale, getT } from '@/lib/i18n/server';
import { roomTypeLabel } from '@/lib/i18n/labels';
import { requireAdminPage } from '@/lib/admin/guard';
import { iconNodeFor } from '@/lib/catalog/iconNodes';
import { loadShelfRoomData } from '@/lib/admin/shelfRoomPages';

export const dynamic = 'force-dynamic';

/** The studio's rooms — the furniture shelf's top row — in order, with the categories each lists. */
export default async function ShelfRoomsPage() {
  await requireAdminPage('categories');
  const [ka, locale] = await Promise.all([getT(), getLocale()]);
  const s = ka.admin.shelfRooms;
  const { categories, rooms } = await loadShelfRoomData(locale);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const name = (c: (typeof categories)[number]) => (locale === 'en' ? c.nameEn || c.nameKa : locale === 'ru' ? c.nameRu || c.nameEn || c.nameKa : c.nameKa);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={ka.admin.categories}
        subtitle={s.subtitle}
        actions={
          <Button asChild>
            <Link href="/admin/categories/rooms/new">
              <Plus className="h-4 w-4" /> {s.new}
            </Link>
          </Button>
        }
      />
      <CategoryTabs t={ka} active="rooms" />
      <p className="flex items-start gap-2 border border-line bg-bg-surface px-4 py-3 text-sm text-ink-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {s.how}
      </p>
      <ShelfRoomList
        rows={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          icon: iconNodeFor(r.icon),
          isVisible: r.isVisible,
          roomTypes: r.roomTypes.map((type) => roomTypeLabel(ka, type)),
          categories: r.categoryIds.flatMap((id) => {
            const c = byId.get(id);
            return c ? [{ id, name: name(c), icon: c.icon }] : [];
          }),
          products: r.products,
        }))}
      />
    </div>
  );
}
