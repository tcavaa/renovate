import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { ArrowUpRight, Calculator, Plus } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects, users } from '@/lib/db/schema';
import { VerifyEmailBanner } from '@/components/profile/VerifyEmailBanner';
import { OpenIn3dButton } from '@/components/projects/OpenIn3dButton';
import { projectKind, savedProjectInput } from '@/lib/projects/saved';
import { CalculateCostsButton } from '@/components/projects/CalculateCostsButton';
import { ProjectKindTags } from '@/components/projects/ProjectKindTags';
import { DeleteDraftsButton, DeleteProjectButton } from '@/components/projects/DeleteProjectButton';
import { Figure } from '@/components/calculator/MaterialsTable';
import { Button } from '@/components/ui/button';
import { getT, getLocale } from '@/lib/i18n/server';
import { formatM2L, homeStateLabel, statusLabel } from '@/lib/i18n/labels';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { formatGEL, cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProfilePage(props: { searchParams: Promise<{ verified?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await auth();
  const t = await getT();
  const locale = await getLocale();
  const userId = Number(session!.user.id);

  const [account] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt, hasPassword: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const needsVerification = !!account && !account.emailVerifiedAt && !!account.hasPassword;

  const rows = await db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
  const totalSpent = rows.reduce((s, p) => s + (p.totalCost ? Number(p.totalCost) : 0), 0);
  const totalM2 = rows.reduce((s, p) => s + Number(p.totalM2), 0);
  const draftIds = rows.filter((p) => p.status === 'draft').map((p) => p.id);

  return (
    <div className="py-4 md:py-8">
      <VerifyEmailBanner needsVerification={needsVerification} verifiedFlag={searchParams.verified} />

      <header className="flex flex-col gap-6 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">{t.nav.profile}</p>
          <h1 className="mt-3 font-serif text-3xl font-bold leading-[1.05] tracking-tight text-ink md:text-[2.75rem]">{session!.user.name ?? t.nav.user}</h1>
          <p className="mt-3 text-sm text-ink-muted">{session!.user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="lg">
            <Link href="/calculator">
              <Calculator className="h-4 w-4" />
              {t.nav.calculator}
            </Link>
          </Button>
          <Button asChild variant="ink" size="lg" className="group">
            <Link href="/design">
              <Plus className="h-4 w-4" />
              {t.profile.newProject}
            </Link>
          </Button>
        </div>
      </header>

      <div className="mt-8 grid border-l border-t border-line sm:grid-cols-3">
        <Figure label={t.profile.statTotal} value={String(rows.length)} />
        <Figure label={t.profile.statArea} value={formatM2L(t, totalM2)} />
        <Figure label={t.profile.statPlanned} value={formatGEL(totalSpent)} emphasis />
      </div>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <h2 className="font-serif text-2xl font-semibold text-ink">
            {t.nav.projects} <span className="ml-2 text-base font-normal tabular-nums text-ink-muted">{rows.length}</span>
          </h2>
          <DeleteDraftsButton ids={draftIds} />
        </div>
        {draftIds.length > 0 && <p className="mt-3 text-xs text-ink-muted">{t.profile.draftHint}</p>}

        {rows.length === 0 ? (
          <div className="mt-6 border border-dashed border-line p-16 text-center">
            <p className="text-sm text-ink-muted">{t.profile.emptyText}</p>
            <Button asChild variant="ink" className="mt-5">
              <Link href="/calculator">{t.profile.emptyCta}</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-2">
            {rows.map((p) => {
              return (
                <li key={p.id} className="grid items-center gap-x-6 gap-y-3 border-b border-line py-5 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ProjectKindTags t={t} kind={projectKind(p)} />
                      <span className={cn('border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]', p.status === 'saved' ? 'border-success/50 text-success' : 'border-line text-ink-muted')}>{statusLabel(t, p.status ?? 'draft')}</span>
                      <span className="text-xs tabular-nums text-ink-faint">#{p.id}</span>
                    </div>
                    <Link href={`/profile/projects/${p.id}`} className="group mt-2 inline-flex items-center gap-2 font-serif text-xl font-semibold text-ink hover:text-brand">
                      {p.nameKa ?? t.profile.fallbackName}
                      <ArrowUpRight className="h-4 w-4 text-ink-faint transition-colors group-hover:text-brand" />
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                      <span>{homeStateLabel(t, p.homeState)}</span>
                      <span className="text-ink-faint">·</span>
                      <span className="tabular-nums">{formatM2L(t, Number(p.totalM2))}</span>
                      <span className="text-ink-faint">·</span>
                      <span className="tabular-nums">{new Date(p.createdAt).toLocaleDateString(dateLocaleFor(locale))}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
                    <span className="font-serif text-xl font-semibold tabular-nums text-ink">{p.totalCost ? formatGEL(Number(p.totalCost)) : '—'}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <CalculateCostsButton project={savedProjectInput(p)} size="sm" />
                      <OpenIn3dButton project={savedProjectInput(p)} size="sm" />
                      {p.status !== 'submitted' && <DeleteProjectButton projectId={p.id} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
