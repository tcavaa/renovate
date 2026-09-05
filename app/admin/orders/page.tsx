import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { ChevronRight } from 'lucide-react';
import { db } from '@/lib/db';
import { projects, users } from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT, getLocale } from '@/lib/i18n/server';
import {
  formatM2L,
  homeStateShortLabel,
  statusLabel,
} from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminProjectsPage() {
  const ka = getT();
  const locale = getLocale();
  const dateLocale = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US';
  const rows = await db
    .select({
      id: projects.id,
      nameKa: projects.nameKa,
      homeState: projects.homeState,
      totalM2: projects.totalM2,
      totalCost: projects.totalCost,
      status: projects.status,
      createdAt: projects.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .orderBy(desc(projects.createdAt))
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">{ka.admin.projects}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {ka.admin.projectsList.subtitle.replace('{n}', String(rows.length))}
        </p>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.admin.table.id}</th>
                <th className="px-4 py-3">{ka.admin.table.name}</th>
                <th className="px-4 py-3">{ka.admin.table.user}</th>
                <th className="px-4 py-3">{ka.admin.table.state}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.m2Header}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.cost}</th>
                <th className="px-4 py-3">{ka.admin.table.status}</th>
                <th className="px-4 py-3">{ka.admin.table.date}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className="group border-b border-line/40 transition-colors last:border-0 hover:bg-bg-base"
                >
                  <td className="px-4 py-3 text-ink-muted">
                    <Link
                      href={`/admin/orders/${p.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      #{p.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/orders/${p.id}`}
                      className="hover:text-brand"
                    >
                      {p.nameKa ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {p.userName ? (
                      <span>
                        {p.userName}
                        <span className="ml-1 text-xs text-ink-muted">
                          ({p.userEmail})
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs italic">{ka.admin.guestUser}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{homeStateShortLabel(ka, p.homeState)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatM2L(ka, Number(p.totalM2))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.totalCost ? formatGEL(Number(p.totalCost)) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {p.status === 'saved' ? (
                      <Badge variant="success">{statusLabel(ka, p.status ?? 'draft')}</Badge>
                    ) : (
                      <Badge variant="outline">{statusLabel(ka, p.status ?? 'draft')}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(p.createdAt).toLocaleDateString(dateLocale)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/orders/${p.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                    >
                      {ka.admin.table.details}
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-ink-muted">
                    {ka.admin.projectsEmpty}
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
