'use client';

import Link from 'next/link';
import Image from '@/components/ui/image';
import { ArrowUpRight, BadgeCheck, MapPin, Star } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, localizedText, workerSpecialtyLabel } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';
import { fill } from '@/lib/admin/list';
import type { Worker } from '@/lib/db/schema';

/** Initials or photo as a soft rounded mark (a large rounded tile on the profile page), the way products get their plate. */
export function WorkerMark({ worker, size = 'md' }: { worker: Pick<Worker, 'nameKa' | 'nameEn' | 'nameRu' | 'avatarUrl'>; size?: 'md' | 'lg' }) {
  const locale = useLocale();
  const name = localizedName(locale, worker);
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  const box = size === 'lg' ? 'h-28 w-28 rounded-3xl text-4xl' : 'h-14 w-14 rounded-2xl text-lg';
  return (
    <span className={`relative grid ${box} shrink-0 place-items-center overflow-hidden bg-ink font-display text-lime`}>
      {worker.avatarUrl ? <Image src={worker.avatarUrl} alt={name} fill sizes="96px" className="object-cover" /> : initials}
    </span>
  );
}

/** Five stars, filled to the rating. */
export function Stars({ rating, className = 'h-3.5 w-3.5' }: { rating: number; className?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${n <= Math.round(rating) ? 'fill-sun text-sun' : 'fill-mist-dark text-mist-dark'}`} />
      ))}
    </span>
  );
}

/** A worker as a catalogue plate: mark, name, specialty, rating, city, price; the whole plate links to the profile. */
export function WorkerCard({ worker }: { worker: Worker }) {
  const t = useT();
  const locale = useLocale();
  const name = localizedName(locale, worker);
  const bio = localizedText(locale, worker.bio, worker.bioEn, worker.bioRu);
  const rating = Number(worker.rating);
  const price =
    worker.priceUnit === 'm2' && worker.pricePerM2
      ? `${formatGEL(Number(worker.pricePerM2))} ${t.workers.perM2Slash}`
      : worker.pricePerUnit
        ? `${formatGEL(Number(worker.pricePerUnit))} ${t.workers.perPieceSlash}`
        : t.workers.priceByAgreement;

  return (
    <Link href={`/workers/${worker.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-bg-surface transition-[border-color,box-shadow] hover:border-ink hover:shadow-cardHover">
      <div className="flex items-start gap-4 p-5">
        <WorkerMark worker={worker} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-display text-lg leading-tight text-ink">{name}</h3>
            {worker.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-success" aria-label={t.workers.verified} />}
          </div>
          <p className="mt-1 inline-flex max-w-full rounded-full bg-mist-light px-2.5 py-0.5 text-xs font-medium text-ink-soft"><span className="truncate">{locale === 'ka' ? worker.specialty : workerSpecialtyLabel(t, worker.specialtySlug)}</span></p>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-muted">
            <Stars rating={rating} />
            <span className="font-semibold tabular-nums text-ink">{rating.toFixed(1)}</span>
            <span className="tabular-nums">({worker.reviewCount})</span>
          </div>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mist-light text-ink transition-colors group-hover:bg-lime"><ArrowUpRight className="h-4 w-4" /></span>
      </div>
      {bio && <p className="line-clamp-2 px-5 text-sm leading-relaxed text-ink-soft">{bio}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-4 pt-4 text-xs text-ink-muted">
        {worker.city && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-ink-muted" />
            {worker.city}
          </span>
        )}
        {worker.experienceYears != null && <span>{fill(t.workers.experience, { n: worker.experienceYears })}</span>}
      </div>
      <div className="flex items-baseline justify-between bg-mist-light px-5 py-3">
        <span className="eyebrow">{t.workers.priceLabel}</span>
        <span className="font-display text-lg tabular-nums text-ink">{price}</span>
      </div>
    </Link>
  );
}
