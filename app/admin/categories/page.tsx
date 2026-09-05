import Link from 'next/link';
import { asc } from 'drizzle-orm';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT, getLocale } from '@/lib/i18n/server';
import { pickLocalizedName } from '@/lib/i18n/labels';

export const dynamic = 'force-dynamic';

export default async function AdminCategoriesPage() {
  const ka = getT();
  const locale = getLocale();
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.phase), asc(categories.sortOrder));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold">{ka.admin.categories}</h1>
        <Button asChild>
          <Link href="/admin/categories/new">
            <Plus className="h-4 w-4" /> {ka.admin.actions.create}
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.admin.table.name}</th>
                <th className="px-4 py-3">{ka.admin.table.slug}</th>
                <th className="px-4 py-3">{ka.admin.table.phase}</th>
                <th className="px-4 py-3">{ka.admin.table.calcType}</th>
                <th className="px-4 py-3">{ka.admin.table.type}</th>
                <th className="px-4 py-3">{ka.admin.table.status}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-line/40 last:border-0 hover:bg-bg-base/50"
                >
                  <td className="px-4 py-3 font-medium">
                    {pickLocalizedName(locale, c.nameKa, c.nameEn)}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{c.slug}</td>
                  <td className="px-4 py-3">
                    <Badge>{c.phase}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {ka.admin.forms.calcTypes[
                      c.calculationType as keyof typeof ka.admin.forms.calcTypes
                    ] ?? c.calculationType}
                  </td>
                  <td className="px-4 py-3">
                    {c.isFurniture ? (
                      <Badge variant="secondary">{ka.admin.badges.furniture}</Badge>
                    ) : (
                      <Badge variant="outline">{ka.admin.badges.material}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.isVisible ? (
                      <Badge variant="success">{ka.admin.badges.visible}</Badge>
                    ) : (
                      <Badge variant="secondary">{ka.admin.badges.hidden}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/categories/${c.id}`}>
                        {ka.admin.actions.edit}
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-ink-muted">
                    {ka.admin.categoriesEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
