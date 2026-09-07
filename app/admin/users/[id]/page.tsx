import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { ArrowLeft, Calendar, ChevronRight, Mail, Shield } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects, stores, users, workers } from '@/lib/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { UserForm } from '@/components/admin/UserForm';
import { getT, getLocale } from '@/lib/i18n/server';
import {
  formatM2L,
  homeStateShortLabel,
  roleLabel,
  statusLabel,
} from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await auth();
  const ka = await getT();
  const locale = await getLocale();
  const dateLocale = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US';
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const user = rows[0];
  if (!user) notFound();

  // The partner pickers on the role form: every store and worker, active or not, so a link
  // to a paused partner still shows what it points at.
  const [partnerStores, partnerWorkers] = await Promise.all([
    db.select({ id: stores.id, name: stores.nameKa }).from(stores).orderBy(stores.nameKa),
    db.select({ id: workers.id, name: workers.nameKa, specialty: workers.specialty }).from(workers).orderBy(workers.nameKa),
  ]);

  const userProjects = await db
    .select({
      id: projects.id,
      nameKa: projects.nameKa,
      homeState: projects.homeState,
      totalM2: projects.totalM2,
      totalCost: projects.totalCost,
      status: projects.status,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.userId, id))
    .orderBy(desc(projects.createdAt));

  const totalSpent = userProjects.reduce(
    (s, p) => s + (p.totalCost ? Number(p.totalCost) : 0),
    0
  );
  const totalM2 = userProjects.reduce((s, p) => s + Number(p.totalM2), 0);
  const isSelf = Number(session?.user?.id) === user.id;

  const initials = user.name
    .split(/\s+/)
    .map((s) => s.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" />
          {ka.admin.users}
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-bold">
          {user.name} <span className="text-ink-muted">#{user.id}</span>
        </h1>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-5 p-5">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand text-xl font-bold text-white">
            {initials}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-xl font-semibold">{user.name}</span>
              <Badge variant={user.role === 'admin' ? 'success' : user.role === 'user' ? 'outline' : 'secondary'}>{roleLabel(ka, user.role)}</Badge>
              {isSelf && <Badge variant="outline">{ka.admin.youBadge}</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4" /> {user.email}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {new Date(user.createdAt).toLocaleString(dateLocale)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Shield className="h-4 w-4" />
                {user.passwordHash ? 'Credentials' : 'OAuth'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={ka.admin.userDetail.stats.projects} value={`${userProjects.length}`} />
        <StatCard label={ka.admin.userDetail.stats.totalArea} value={formatM2L(ka, totalM2)} />
        <StatCard
          label={ka.admin.userDetail.stats.totalCost}
          value={formatGEL(totalSpent)}
          highlight
        />
      </div>

      <UserForm
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          storeId: user.storeId,
          workerId: user.workerId,
        }}
        isSelf={isSelf}
        stores={partnerStores}
        workers={partnerWorkers}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{ka.admin.projects}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.admin.table.id}</th>
                <th className="px-4 py-3">{ka.admin.table.name}</th>
                <th className="px-4 py-3">{ka.admin.table.state}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.m2Header}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.cost}</th>
                <th className="px-4 py-3">{ka.admin.table.status}</th>
                <th className="px-4 py-3">{ka.admin.table.date}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {userProjects.map((p) => (
                <tr
                  key={p.id}
                  className="group border-b border-line/40 transition-colors last:border-0 hover:bg-bg-base"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      #{p.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="hover:text-brand"
                    >
                      {p.nameKa ?? '—'}
                    </Link>
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
                      href={`/admin/projects/${p.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                    >
                      {ka.admin.table.details}
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {userProjects.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-muted">
                    {ka.admin.userDetail.noProjects}
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

