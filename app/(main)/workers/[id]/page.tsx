import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { BadgeCheck, ChevronRight, MapPin, Phone } from 'lucide-react';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workerReviews, workerWorks, workers } from '@/lib/db/schema';
import { Stars, WorkerMark } from '@/components/workers/WorkerCard';
import { Button } from '@/components/ui/button';
import { getLocale, getT } from '@/lib/i18n/server';
import { localizedName, localizedText, workerSpecialtyLabel } from '@/lib/i18n/labels';
import { formatGEL, formatM2 } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function loadWorker(idParam: string) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = await db.select().from(workers).where(eq(workers.id, id)).limit(1);
  const worker = rows[0];
  return worker && worker.isActive ? worker : null;
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const worker = await loadWorker(id);
  if (!worker) return {};
  const locale = await getLocale();
  return { title: localizedName(locale, worker), description: localizedText(locale, worker.bio, worker.bioEn, worker.bioRu) ?? undefined };
}

/**
 * A worker's profile: who they are and what they charge in a sticky column, then the bio,
 * the portfolio of finished jobs and the client reviews with a rating breakdown.
 */
export default async function WorkerProfilePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const worker = await loadWorker(id);
  if (!worker) notFound();
  const t = await getT();
  const locale = await getLocale();

  const [works, reviews] = await Promise.all([
    db.select().from(workerWorks).where(eq(workerWorks.workerId, worker.id)).orderBy(asc(workerWorks.sortOrder)),
    db.select().from(workerReviews).where(eq(workerReviews.workerId, worker.id)).orderBy(desc(workerReviews.createdAt)),
  ]);

  const name = localizedName(locale, worker);
  const bio = localizedText(locale, worker.bio, worker.bioEn, worker.bioRu);
  const specialty = locale === 'ka' ? worker.specialty : workerSpecialtyLabel(t, worker.specialtySlug);
  const rating = Number(worker.rating);
  const price =
    worker.priceUnit === 'm2' && worker.pricePerM2
      ? `${formatGEL(Number(worker.pricePerM2))} ${t.workers.perM2Slash}`
      : worker.pricePerUnit
        ? `${formatGEL(Number(worker.pricePerUnit))} ${t.workers.perPieceSlash}`
        : t.workers.priceByAgreement;
  const breakdown = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.rating === n).length }));
  const dateLocale = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-GB';

  return (
    <div className="container py-8 md:py-12">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
        <Link href="/workers" className="hover:text-ink">
          {t.nav.workers}
        </Link>
        <ChevronRight className="h-3 w-3 text-ink-faint" />
        <Link href={`/workers?specialty=${encodeURIComponent(worker.specialtySlug)}`} className="hover:text-ink">
          {workerSpecialtyLabel(t, worker.specialtySlug)}
        </Link>
        <ChevronRight className="h-3 w-3 text-ink-faint" />
        <span className="text-ink">{name}</span>
      </nav>

      <header className="mt-6 flex flex-col gap-6 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div className="flex items-start gap-5">
          <WorkerMark worker={worker} size="lg" />
          <div>
            <p className="eyebrow">{t.workers.profileEyebrow}</p>
            <h1 className="mt-2 flex items-center gap-2 font-serif text-3xl font-bold leading-[1.05] tracking-tight text-ink md:text-4xl">
              {name}
              {worker.isVerified && <BadgeCheck className="h-6 w-6 shrink-0 text-success" aria-label={t.workers.verified} />}
            </h1>
            <p className="mt-2 text-base text-ink-soft">{specialty}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-2">
                <Stars rating={rating} className="h-4 w-4" />
                <span className="font-semibold tabular-nums text-ink">{rating.toFixed(1)}</span>
                <span className="tabular-nums">
                  ({worker.reviewCount} {t.workers.reviews})
                </span>
              </span>
              {worker.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {worker.city}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {worker.phone && (
            <Button asChild variant="ink" size="lg">
              <a href={`tel:${worker.phone}`}>
                <Phone className="h-4 w-4" />
                {t.workers.callNow}
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="lg">
            <Link href="/calculator">{t.workers.book}</Link>
          </Button>
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-14">
          {bio && (
            <section>
              <p className="eyebrow">{t.workers.about}</p>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft">{bio}</p>
            </section>
          )}

          <section>
            <div className="flex items-baseline justify-between border-b border-line pb-3">
              <h2 className="font-serif text-2xl font-semibold text-ink">{t.workers.portfolio}</h2>
              <span className="text-sm tabular-nums text-ink-muted">{works.length}</span>
            </div>
            {works.length === 0 ? (
              <p className="mt-6 text-sm text-ink-muted">{t.workers.noWorks}</p>
            ) : (
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {works.map((w) => {
                  const title = localizedText(locale, w.titleKa, w.titleEn, w.titleRu) ?? w.titleKa;
                  const description = localizedText(locale, w.descriptionKa, w.descriptionEn, w.descriptionRu);
                  return (
                    <li key={w.id} className="flex flex-col border border-line bg-bg-surface">
                      <div className="relative aspect-[4/3] overflow-hidden bg-sand-light">
                        {w.imageUrl && <Image src={w.imageUrl} alt={title} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover" />}
                        {w.year && <span className="absolute left-3 top-3 bg-ink px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">{w.year}</span>}
                      </div>
                      <div className="flex flex-1 flex-col gap-1 border-t border-line p-4">
                        <h3 className="font-serif text-lg font-semibold leading-snug text-ink">{title}</h3>
                        {description && <p className="text-sm leading-relaxed text-ink-muted">{description}</p>}
                        <p className="mt-auto flex flex-wrap gap-x-3 pt-3 text-xs text-ink-muted">
                          {w.areaM2 && <span className="tabular-nums">{formatM2(Number(w.areaM2))}</span>}
                          {w.city && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {w.city}
                            </span>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between border-b border-line pb-3">
              <h2 className="font-serif text-2xl font-semibold text-ink">{t.workers.reviewsTitle}</h2>
              <span className="text-sm tabular-nums text-ink-muted">{reviews.length}</span>
            </div>
            {reviews.length === 0 ? (
              <p className="mt-6 text-sm text-ink-muted">{t.workers.noReviews}</p>
            ) : (
              <div className="mt-6 grid gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="self-start border border-line bg-bg-surface p-5">
                  <p className="font-serif text-5xl font-semibold leading-none tabular-nums text-ink">{rating.toFixed(1)}</p>
                  <p className="mt-2 text-xs text-ink-muted">{t.workers.ratingOutOf}</p>
                  <Stars rating={rating} className="mt-2 h-4 w-4" />
                  <ul className="mt-5 space-y-1.5">
                    {breakdown.map((b) => (
                      <li key={b.n} className="flex items-center gap-2 text-xs text-ink-muted">
                        <span className="w-3 tabular-nums">{b.n}</span>
                        <span className="h-1.5 flex-1 bg-line">
                          <span className="block h-full bg-accent" style={{ width: `${reviews.length ? (b.count / reviews.length) * 100 : 0}%` }} />
                        </span>
                        <span className="w-5 text-right tabular-nums">{b.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <ul className="border-t border-line">
                  {reviews.map((r) => {
                    const text = localizedText(locale, r.textKa, r.textEn, r.textRu);
                    const job = localizedText(locale, r.jobKa, r.jobEn, r.jobRu);
                    return (
                      <li key={r.id} className="border-b border-line py-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <span className="grid h-8 w-8 place-items-center bg-sand text-xs font-semibold text-ink">{r.authorName.charAt(0)}</span>
                            <div>
                              <p className="text-sm font-semibold text-ink">{r.authorName}</p>
                              {job && <p className="text-xs text-ink-muted">{job}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-ink-muted">
                            <Stars rating={r.rating} />
                            <time dateTime={r.createdAt.toISOString()}>{r.createdAt.toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
                          </div>
                        </div>
                        {text && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{text}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="border border-line bg-bg-surface">
            <div className="border-b border-line px-4 py-3">
              <p className="eyebrow">{t.workers.priceLabel}</p>
            </div>
            <p className="px-4 py-4 font-serif text-3xl font-semibold tabular-nums text-ink">{price}</p>
          </div>
          <div className="border border-line bg-bg-surface">
            <div className="border-b border-line px-4 py-3">
              <p className="eyebrow">{t.workers.facts}</p>
            </div>
            <dl className="divide-y divide-line text-sm">
              <Fact label={t.workers.specialty} value={specialty} />
              {worker.city && <Fact label={t.workers.city} value={worker.city} />}
              {worker.experienceYears != null && <Fact label={t.admin.forms.experienceYears} value={String(worker.experienceYears)} />}
              {worker.completedJobs != null && <Fact label={t.admin.forms.completedJobs} value={String(worker.completedJobs)} />}
              <Fact label={t.workers.verified} value={worker.isVerified ? '✓' : '—'} />
            </dl>
          </div>
          <Link href="/workers" className="bracket-link inline-block text-sm font-medium text-ink-soft hover:text-ink">
            {t.workers.backToWorkers}
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
