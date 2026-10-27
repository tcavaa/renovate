import Image from '@/components/ui/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { formatGEL } from '@/lib/utils';
import type { Dictionary } from '@/lib/i18n';

export interface LandingProduct {
  id: number;
  name: string;
  price: number;
  imageUrl: string | null;
  slug: string;
  store: string | null;
  brand: string | null;
}

/**
 * The differentiator, shown rather than claimed: a wall of the actual products the studio
 * places, each with its price and the store it comes from. Cards stagger in as they scroll.
 */
export function ProductWall({ t, products }: { t: Dictionary; products: LandingProduct[] }) {
  return (
    <section className="relative overflow-clip bg-sand-light py-24 md:py-32">
      <div className="container">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end">
          <div>
            <p className="eyebrow reveal flex items-center gap-3">
              <span className="h-px w-8 bg-brand" aria-hidden />
              {t.landing.eyebrow}
            </p>
            <h2 className="display reveal mt-5 text-display-md tracking-[0.04em] text-ink">{t.landing.realTitle}</h2>
          </div>
          <div className="reveal md:pb-2">
            <p className="max-w-lg text-lg leading-relaxed text-ink-soft">{t.landing.realBody}</p>
            <Link
              href="/catalog"
              className="group mt-6 inline-flex h-11 items-center gap-2 rounded-full border border-ink/15 px-5 text-sm font-medium text-ink transition-colors hover:border-ink/40 hover:bg-bg-surface"
            >
              {t.landing.realCta}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <ul className="reveal-stagger mt-14 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
          {products.map((p, i) => (
            <li
              key={p.id}
              className={i % 4 === 1 || i % 4 === 2 ? 'md:translate-y-10' : undefined}
            >
              <Link
                href={`/catalog/${p.slug}`}
                className="group block overflow-hidden rounded-3xl border border-line bg-bg-surface shadow-card transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-cardHover"
              >
                <div className="relative m-2 aspect-square overflow-hidden rounded-2xl bg-bg-base">
                  {p.imageUrl && (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      fill
                      sizes="(min-width: 768px) 25vw, 50vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-bg-surface/90 px-3 py-1 text-xs font-semibold text-ink shadow-card backdrop-blur">{formatGEL(p.price)}</span>
                </div>
                <div className="flex items-start justify-between gap-3 px-4 pb-4 pt-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {t.design.soldBy} {p.store ?? p.brand ?? '—'}
                    </p>
                  </div>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sand text-ink-soft transition-colors group-hover:bg-brand group-hover:text-white">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
