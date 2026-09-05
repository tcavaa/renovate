import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import {
  ChevronRight,
  Mail,
  Plus,
  User as UserIcon,
  Calendar,
  Home as HomeIcon,
} from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects, users } from '@/lib/db/schema';
import { VerifyEmailBanner } from '@/components/profile/VerifyEmailBanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { getT, getLocale } from '@/lib/i18n/server';
import { formatM2L, homeStateLabel, statusLabel } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: { verified?: string } }) {
  const session = await auth();
  const ka = getT();
  const locale = getLocale();
  const userId = Number(session!.user.id);

  const [account] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt, hasPassword: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const needsVerification = !!account && !account.emailVerifiedAt && !!account.hasPassword;

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));

  const totalSpent = rows.reduce(
    (s, p) => s + (p.totalCost ? Number(p.totalCost) : 0),
    0
  );
  const totalM2 = rows.reduce((s, p) => s + Number(p.totalM2), 0);

  return (
    <div className="space-y-8">
      <VerifyEmailBanner needsVerification={needsVerification} verifiedFlag={searchParams.verified} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold">{ka.nav.profile}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {ka.profile.subtitle}
          </p>
        </div>
        <Button asChild>
          <Link href="/calculator">
            <Plus className="h-4 w-4" />
            {ka.profile.newProject}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
          <InfoRow
            icon={UserIcon}
            label={ka.profile.fieldName}
            value={session!.user.name ?? '—'}
          />
          <InfoRow icon={Mail} label={ka.profile.fieldEmail} value={session!.user.email ?? '—'} />
          <InfoRow
            icon={Calendar}
            label={ka.profile.fieldProjects}
            value={`${rows.length}`}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={ka.profile.statTotal} value={`${rows.length}`} />
        <StatCard label={ka.profile.statArea} value={formatM2L(ka, totalM2)} />
        <StatCard
          label={ka.profile.statPlanned}
          value={formatGEL(totalSpent)}
          highlight
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">{ka.nav.projects}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.profile.colName}</th>
                <th className="px-4 py-3">{ka.profile.colState}</th>
                <th className="px-4 py-3 text-right">{ka.units.m2}</th>
                <th className="px-4 py-3 text-right">{ka.profile.colCost}</th>
                <th className="px-4 py-3">{ka.profile.colStatus}</th>
                <th className="px-4 py-3">{ka.profile.colDate}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className="group border-b border-line/40 transition-colors last:border-0 hover:bg-bg-base"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/profile/projects/${p.id}`}
                      className="hover:text-brand"
                    >
                      {p.nameKa ?? '—'}
                    </Link>
                    <p className="text-xs text-ink-muted">#{p.id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <HomeIcon className="h-3.5 w-3.5 text-ink-muted" />
                      {homeStateLabel(ka, p.homeState)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatM2L(ka, Number(p.totalM2))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
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
                    {new Date(p.createdAt).toLocaleDateString(
                      locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/profile/projects/${p.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                    >
                      {ka.profile.details}
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-16 text-center text-sm text-ink-muted"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <p>{ka.profile.emptyText}</p>
                      <Button asChild>
                        <Link href="/calculator">
                          <Plus className="h-4 w-4" />
                          {ka.profile.emptyCta}
                        </Link>
                      </Button>
                    </div>
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

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

