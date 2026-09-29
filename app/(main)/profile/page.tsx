import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { Box, Calculator, FolderOpen, Images, Package, Shapes } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { products, users } from '@/lib/db/schema';
import { MyModels } from '@/components/profile/MyModels';
import { VerifyEmailBanner } from '@/components/profile/VerifyEmailBanner';
import { CARD_FRAME, HubShell, ProjectThumbnail, RoundLink } from '@/components/projects/hub/HubShell';
import { HubDate } from '@/components/projects/hub/HubDate';
import { HubRenders } from '@/components/projects/hub/HubRenders';
import { HubOrders } from '@/components/projects/hub/HubOrders';
import { ProjectCardMenu, type OtherJourney } from '@/components/projects/hub/ProjectCardMenu';
import { Button } from '@/components/ui/button';
import { loadHubProjects, type HubProject } from '@/lib/projects/hub';
import { getT, getLocale } from '@/lib/i18n/server';
import { formatM2L, homeStateLabel } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';
import { CALCULATOR_HUB_HREF, calculatorEntryHref } from '@/lib/calculator/steps';
import { DESIGN_HUB_HREF, designEntryHref } from '@/lib/design/steps';
import type { Dictionary } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

type ProfileView = 'projects' | 'renders' | 'orders' | 'models';

function profileView(value: string | undefined): ProfileView {
  return value === 'renders' || value === 'orders' || value === 'models' ? value : 'projects';
}

/**
 * The person's own page, in the hubs' frame (`HubShell`): the account at the head of a sidebar
 * of four lists — every project, whichever product it is in; every render; every order, grouped
 * by project; the furniture they uploaded — and, on the projects, the way into each product and
 * what their projects come to. A card opens the project's page.
 */
export default async function ProfilePage(props: { searchParams: Promise<{ verified?: string; view?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await auth();
  const t = await getT();
  const locale = await getLocale();
  const userId = Number(session!.user.id);
  const view = profileView(searchParams.view);

  const [account] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt, hasPassword: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const needsVerification = !!account && !account.emailVerifiedAt && !!account.hasPassword;

  const title = view === 'renders' ? t.hub.navRenders : view === 'orders' ? t.hub.navOrders : view === 'models' ? t.profile.myModels : t.nav.projects;

  return (
    <HubShell
      label={t.nav.profile}
      account={{ name: session!.user.name ?? t.nav.user, email: session!.user.email ?? null }}
      items={[
        { href: '/profile', label: t.nav.projects, icon: FolderOpen, active: view === 'projects' },
        { href: '/profile?view=renders', label: t.hub.navRenders, icon: Images, active: view === 'renders' },
        { href: '/profile?view=orders', label: t.hub.navOrders, icon: Package, active: view === 'orders' },
        { href: '/profile?view=models', label: t.profile.myModels, icon: Shapes, active: view === 'models' },
      ]}
      crumb={{ label: t.nav.profile, href: '/profile' }}
      title={title}
    >
      {/* Air between the title and the banner, and nothing where there is no banner. */}
      <div className="mt-6 empty:hidden">
        <VerifyEmailBanner needsVerification={needsVerification} verifiedFlag={searchParams.verified} />
      </div>
      {view === 'renders' ? (
        <HubRenders userId={userId} t={t} />
      ) : view === 'orders' ? (
        <HubOrders userId={userId} t={t} locale={locale} />
      ) : view === 'models' ? (
        <OwnModels userId={userId} />
      ) : (
        <ProfileProjects userId={userId} t={t} />
      )}
    </HubShell>
  );
}

/** Every project of the person's, whichever product it is in, newest change first — with the way into each product and what they come to. */
async function ProfileProjects({ userId, t }: { userId: number; t: Dictionary }) {
  const all = await loadHubProjects(userId);
  const totalM2 = all.reduce((s, p) => s + p.totalM2, 0);
  const planned = all.reduce((s, p) => s + (p.totalCost ?? 0), 0);
  const figures = [
    { label: t.profile.statTotal, value: String(all.length) },
    { label: t.profile.statArea, value: formatM2L(t, totalM2) },
    { label: t.profile.statPlanned, value: formatGEL(planned), emphasis: true },
  ];

  return (
    <>
      {/* Each product's hub: its projects, and the way to start a new one. */}
      <div className="mt-8 flex flex-wrap items-start gap-x-8 gap-y-5">
        <RoundLink href={CALCULATOR_HUB_HREF} icon={<Calculator className="h-6 w-6" />} label={t.nav.calculator} className="bg-brand group-hover:bg-brand-dark" />
        <RoundLink href={DESIGN_HUB_HREF} icon={<Box className="h-6 w-6" />} label={t.design.title} className="bg-slate-deep group-hover:bg-ink" />
      </div>

      <dl className="mt-10 grid gap-4 sm:grid-cols-3">
        {figures.map((f) => (
          <div key={f.label} className="rounded-[18px] border border-line bg-bg-surface px-5 py-4">
            <dt className="text-xs font-medium text-ink-muted">{f.label}</dt>
            <dd className={f.emphasis ? 'mt-1.5 font-serif text-2xl font-semibold tabular-nums text-brand' : 'mt-1.5 font-serif text-2xl font-semibold tabular-nums text-ink'}>{f.value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-12" aria-labelledby="profile-projects">
        <h2 id="profile-projects" className="text-sm font-medium text-ink-muted">
          {t.hub.byDate}
        </h2>
        {all.length === 0 ? (
          <div className="mt-5 rounded-[18px] border border-dashed border-line p-12 text-center">
            <p className="text-sm text-ink-muted">{t.profile.emptyText}</p>
            <Button asChild variant="ink" className="mt-5">
              <Link href={CALCULATOR_HUB_HREF}>{t.profile.emptyCta}</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
            {all.map((p) => (
              <li key={p.id}>
                <ProfileProjectCard project={p} t={t} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/**
 * A project on the profile: its plan, its name, when it changed, which products it is in and
 * what it comes to; the drawing and the name open its page, and the "…" opens either half.
 */
function ProfileProjectCard({ project: p, t }: { project: HubProject; t: Dictionary }) {
  const href = `/profile/projects/${p.id}`;
  const name = p.name || t.profile.fallbackName;
  const others: OtherJourney[] = [];
  if (p.hasCalculator) others.push({ href: calculatorEntryHref(p.id), label: 'openInCalculator' });
  else if (p.thumbnail.rooms.length > 0 || p.planRooms > 0) others.push({ href: calculatorEntryHref(p.id), label: 'calculateCosts' });
  if (p.hasDesign) others.push({ href: designEntryHref(p.id), label: 'openIn3d' });
  else if (p.calculationReady) others.push({ href: designEntryHref(p.id), label: 'createIn3d' });
  const kinds = [p.hasCalculator ? t.profile.typeCalculator : null, p.hasDesign ? t.profile.typeDesign : null].filter(Boolean).join(' + ');
  const figure = p.totalCost != null ? formatGEL(p.totalCost) : t.profile.pendingShort;
  const facts = [kinds, p.homeState ? homeStateLabel(t, p.homeState) : null, p.totalM2 > 0 ? formatM2L(t, p.totalM2) : null].filter(Boolean).join(' · ');

  return (
    <article>
      <Link href={href} tabIndex={-1} aria-hidden className={CARD_FRAME}>
        <ProjectThumbnail project={p} prefer={p.hasDesign && !p.hasCalculator ? 'design' : 'calculator'} />
      </Link>
      <div className="mt-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={href} className="block truncate text-lg font-semibold leading-snug text-ink hover:text-brand">
            {name}
          </Link>
          <HubDate at={p.updatedAt} className="mt-0.5 block text-sm text-ink-muted" />
          <p className={p.totalCost != null ? 'mt-0.5 text-sm font-semibold tabular-nums text-ink' : 'mt-0.5 text-sm text-ink-faint'}>{figure}</p>
          {facts && (
            <p title={facts} className="mt-0.5 truncate text-xs text-ink-faint">
              {facts}
            </p>
          )}
        </div>
        <ProjectCardMenu projectId={p.id} name={p.name} openHref={href} other={others} canDelete={p.status !== 'submitted'} />
      </div>
    </article>
  );
}

/** The furniture the person uploaded themselves. */
async function OwnModels({ userId }: { userId: number }) {
  const models = await db
    .select({ id: products.id, name: products.nameKa, kind: products.model3dKind, imageUrl: products.imageUrl, status: products.model3dStatus })
    .from(products)
    .where(eq(products.ownerUserId, userId))
    .orderBy(desc(products.id));
  return <MyModels models={models} heading={false} />;
}
