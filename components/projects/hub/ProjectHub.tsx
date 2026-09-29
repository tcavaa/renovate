import Link from 'next/link';
import { ChevronRight, FolderOpen, Images, Package } from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { HubTiles, type HubPick } from '@/components/projects/hub/HubTiles';
import { HubDate } from '@/components/projects/hub/HubDate';
import { HubRenders } from '@/components/projects/hub/HubRenders';
import { HubOrders } from '@/components/projects/hub/HubOrders';
import { CARD_FRAME, HubShell, ProjectThumbnail } from '@/components/projects/hub/HubShell';
import { ProjectCardMenu, type OtherJourney } from '@/components/projects/hub/ProjectCardMenu';
import { HubCachePrune } from '@/components/projects/hub/HubCachePrune';
import { LegacyWorkNotice } from '@/components/projects/hub/LegacyWorkNotice';
import { loadHubProjects, type HubProject } from '@/lib/projects/hub';
import { CALCULATOR_STEPS, calculatorEntryHref } from '@/lib/calculator/steps';
import { designEntryHref, designStepPosition } from '@/lib/design/steps';
import { getLocale, getT } from '@/lib/i18n/server';
import { calculatorStepLabels, formatM2L } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL } from '@/lib/utils';
import type { Dictionary } from '@/lib/i18n';
import type { StudioStep } from '@/store/designStore';

export type HubJourney = 'calculator' | 'design';
/** What the hub shows: the projects, the renders (`?view=renders`) or the orders (`?view=orders`). */
export type HubView = 'projects' | 'renders' | 'orders';

/** The hub's view from its `?view=`: the projects unless it names another. */
export function hubView(value: string | undefined): HubView {
  return value === 'renders' || value === 'orders' ? value : 'projects';
}

/**
 * A product's front page — `/calculator` and `/design` — and the only way into its steps: every
 * step opens inside a named project (`/<journey>/<id>/…`). Laid out the way a file manager's
 * "my files" is: a sidebar down the left — the projects, the renders — and, beside it, the
 * product and the list as a breadcrumb, the ways to start as round buttons (a new project —
 * whose first step asks for the plan, uploaded or drawn — and this product's half of a project
 * the other product has), and the projects as cards, most recently changed first: the drawing,
 * the name, when it changed, where it stands, its "…" menu. The renders are every photo and
 * render of the person's projects (`HubRenders`); the orders are every order, grouped by project,
 * with where each stands (`HubOrders`). A guest gets the introduction, a guide and a
 * way to sign in; a project needs an account to be kept in.
 *
 * A project with both halves is in both hubs: the calculator lists every project with a
 * calculation, the studio every one with a design (`projectKind`).
 */
export async function ProjectHub({ journey, view = 'projects' }: { journey: HubJourney; view?: HubView }) {
  const [session, t, locale] = await Promise.all([auth(), getT(), getLocale()]);
  const userId = session?.user?.id ? Number(session.user.id) : null;
  const calculator = journey === 'calculator';

  const intro = (
    <header className="max-w-3xl">
      <p className="eyebrow">{calculator ? t.hub.calculatorEyebrow : t.hub.designEyebrow}</p>
      <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-muted">
        <span>{calculator ? t.nav.calculator : t.design.title}</span>
        <ChevronRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
        <span className="text-ink">{t.hub.breadcrumb}</span>
      </p>
      <h1 className="mt-4 font-serif text-3xl font-bold leading-[1.05] tracking-tight text-ink md:text-[2.75rem]">{calculator ? t.hub.calculatorTitle : t.hub.designTitle}</h1>
      <p className="mt-4 text-base leading-relaxed text-ink-muted">{calculator ? t.hub.calculatorLead : t.hub.designLead}</p>
    </header>
  );

  if (userId == null) {
    const back = encodeURIComponent(calculator ? '/calculator' : '/design');
    return (
      <div className="container max-w-6xl py-10 md:py-14">
        {intro}
        <section className="mt-10 flex flex-col gap-6 border border-line bg-bg-surface p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div className="max-w-xl">
            <h2 className="font-serif text-2xl font-semibold text-ink">{t.hub.guestTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t.hub.guestText}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ink" size="lg">
              <Link href={`/login?callbackUrl=${back}`}>{t.hub.guestSignIn}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={`/register?callbackUrl=${back}`}>{t.hub.guestRegister}</Link>
            </Button>
          </div>
        </section>
        <HubGuide t={t} journey={journey} />
      </div>
    );
  }

  const all = await loadHubProjects(userId);
  const listed = all.filter((p) => (calculator ? p.hasCalculator : p.hasDesign));
  const dateOf = (p: HubProject) => new Date(p.updatedAt).toLocaleDateString(dateLocaleFor(locale), { day: 'numeric', month: 'short', year: 'numeric' });
  // What the "from the other product" button offers: the projects that have the other half and
  // not this one, with something to start this one from.
  const picks: HubPick[] = all
    .filter((p) => (calculator ? p.hasDesign && !p.hasCalculator && p.planRooms > 0 : p.calculatorStarted && !p.hasDesign && p.calculationReady))
    .map((p) => ({
      id: p.id,
      name: p.name || t.profile.fallbackName,
      date: fill(t.hub.updated, { date: dateOf(p) }),
      href: calculator ? calculatorEntryHref(p.id) : designEntryHref(p.id),
      thumbnail: <ProjectThumbnail project={p} prefer={journey} small />,
    }));
  const base = calculator ? '/calculator' : '/design';
  const product = calculator ? t.nav.calculator : t.design.title;
  const title = view === 'renders' ? t.hub.navRenders : view === 'orders' ? t.hub.navOrders : t.hub.breadcrumb;

  return (
    <HubShell
      label={product}
      items={[
        { href: base, label: t.hub.breadcrumb, icon: FolderOpen, active: view === 'projects' },
        { href: `${base}?view=renders`, label: t.hub.navRenders, icon: Images, active: view === 'renders' },
        { href: `${base}?view=orders`, label: t.hub.navOrders, icon: Package, active: view === 'orders' },
      ]}
      crumb={{ label: product, href: base }}
      title={title}
    >
      <HubCachePrune userId={userId} projectIds={all.map((p) => p.id)} />
      {view === 'renders' ? (
        <HubRenders userId={userId} t={t} />
      ) : view === 'orders' ? (
        <HubOrders userId={userId} t={t} locale={locale} />
      ) : (
        <>
          <LegacyWorkNotice userId={userId} journey={journey} />

          <HubTiles journey={journey} defaultName={fill(t.hub.defaultName, { n: listed.length + 1 })} picks={picks} />

          <section className="mt-12" aria-labelledby="hub-projects">
            <h2 id="hub-projects" className="text-sm font-medium text-ink-muted">
              {t.hub.byDate}
            </h2>
            {listed.length === 0 ? (
              <p className="mt-5 rounded-[18px] border border-dashed border-line p-12 text-center text-sm text-ink-muted">{calculator ? t.hub.emptyCalculator : t.hub.emptyDesign}</p>
            ) : (
              <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
                {listed.map((p) => (
                  <li key={p.id}>
                    <ProjectCard project={p} journey={journey} t={t} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </HubShell>
  );
}

function ProjectCard({ project: p, journey, t }: { project: HubProject; journey: HubJourney; t: Dictionary }) {
  const calculator = journey === 'calculator';
  const href = calculator ? calculatorEntryHref(p.id) : designEntryHref(p.id);
  const name = p.name || t.profile.fallbackName;
  // The way into the other product from here: open the half the project has, or start it
  // from this one when there is something to start it from.
  let other: OtherJourney | null = null;
  if (calculator) {
    if (p.hasDesign) other = { href: designEntryHref(p.id), label: 'openIn3d' };
    else if (p.calculationReady) other = { href: designEntryHref(p.id), label: 'createIn3d' };
  } else if (p.hasCalculator && p.calculatorStarted) other = { href: calculatorEntryHref(p.id), label: 'openInCalculator' };
  else if (p.planRooms > 0) other = { href: calculatorEntryHref(p.id), label: 'calculateCosts' };
  const where = whereItStands(t, p, journey);
  const whereText = where ? [where.main, where.detail].filter(Boolean).join(' · ') : null;

  return (
    <article>
      {/* The drawing opens the project too, but the name is the link a keyboard reaches. */}
      <Link href={href} tabIndex={-1} aria-hidden className={CARD_FRAME}>
        <ProjectThumbnail project={p} prefer={journey} />
      </Link>
      <div className="mt-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={href} className="block truncate text-lg font-semibold leading-snug text-ink hover:text-brand">
            {name}
          </Link>
          <HubDate at={p.updatedAt} className="mt-0.5 block text-sm text-ink-muted" />
          {whereText && (
            <p title={whereText} className={cn('mt-0.5 truncate text-xs', where?.pending ? 'text-ink-faint' : 'font-medium tabular-nums text-ink-soft')}>
              {whereText}
            </p>
          )}
        </div>
        <ProjectCardMenu projectId={p.id} name={p.name} openHref={href} other={other} canDelete={p.status !== 'submitted'} />
      </div>
    </article>
  );
}

/**
 * Where a project stands in this hub's journey: a half that is not done yet says so and names
 * the step it was left on; a done one shows what the project comes to.
 */
function whereItStands(t: Dictionary, p: HubProject, journey: HubJourney): { main: string; detail: string | null; pending: boolean } | null {
  const area = p.totalM2 > 0 ? formatM2L(t, p.totalM2) : null;
  if (journey === 'calculator') {
    if (p.calculatorPending) {
      const labels = calculatorStepLabels(t);
      const step = clampStep(p.calculatorProgress.at ?? p.calculatorProgress.step, CALCULATOR_STEPS);
      return { main: t.hub.notCalculatedYet, detail: fill(t.hub.stepOf, { n: step, total: CALCULATOR_STEPS, label: labels[step - 1] }), pending: true };
    }
    // A design that has never been priced here: listed for its renovation, not calculated.
    if (!p.calculatorStarted && p.totalCost == null) return { main: t.hub.notCalculatedYet, detail: null, pending: true };
  } else if (p.designPending) {
    const labels: Record<StudioStep, string> = { 1: t.design.step1, 2: t.design.step2, 3: t.design.step3, 4: t.design.step4, 5: t.design.step5, 6: t.design.step6, 7: t.design.step7, 8: t.design.step8 };
    const step = clampStep(p.designProgress.at ?? p.designProgress.step, 8) as StudioStep;
    return { main: t.hub.notGeneratedYet, detail: fill(t.hub.stepOf, { n: designStepPosition(step, p.homeState, p.mode), total: 8, label: labels[step] }), pending: true };
  }
  if (p.totalCost == null) return area ? { main: area, detail: null, pending: true } : null;
  return { main: formatGEL(p.totalCost), detail: area, pending: false };
}

function clampStep(step: number, total: number): number {
  return Math.min(total, Math.max(1, Math.round(Number.isFinite(step) ? step : 1)));
}

/** How the product works, and how to give it a plan it can count on. */
function HubGuide({ t, journey }: { t: Dictionary; journey: HubJourney }) {
  const calculator = journey === 'calculator';
  const steps = calculator ? t.hub.calculatorSteps : t.hub.designSteps;
  const tips = calculator ? t.hub.tipsCalculator : t.hub.tipsDesign;
  return (
    <section className="mt-16 grid gap-10 border-t border-line pt-10 lg:grid-cols-2 lg:gap-14">
      <div>
        <h2 className="font-serif text-2xl font-semibold text-ink">{t.hub.howTitle}</h2>
        <ol className="mt-5 border-t border-line">
          {steps.map((text, i) => (
            <li key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 border-b border-line py-3 text-sm leading-relaxed">
              <span className="font-semibold tabular-nums text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
              <GuideLine text={text} />
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h2 className="font-serif text-2xl font-semibold text-ink">{calculator ? t.hub.tipsCalculatorTitle : t.hub.tipsDesignTitle}</h2>
        <ul className="mt-5 border-t border-line">
          {tips.map((text, i) => (
            <li key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 border-b border-line py-3 text-sm leading-relaxed text-ink-soft">
              <span className="text-brand" aria-hidden>
                —
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** "Materials — every phase counted…": the step's name is set in bold when the line has one. */
function GuideLine({ text }: { text: string }) {
  const at = text.indexOf(' — ');
  if (at <= 0) return <span className="text-ink-soft">{text}</span>;
  return (
    <span className="text-ink-soft">
      <strong className="font-semibold text-ink">{text.slice(0, at)}</strong>
      {text.slice(at)}
    </span>
  );
}
