import Image from 'next/image';
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
    <section className="relative overflow-hidden bg-sand-light py-24 md:py-32">
      <div className="container">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end">
          <div>
            <p className="eyebrow reveal">{t.landing.eyebrow}</p>
            <h2 className="reveal mt-4 text-display-md font-bold text-ink">{t.landing.realTitle}</h2>
          </div>
          <div className="reveal md:pb-2">
            <p className="max-w-lg text-lg leading-relaxed text-ink-soft">{t.landing.realBody}</p>
            <Link href="/catalog" className="group mt-5 inline-flex items-center gap-2 text-sm font-medium text-ink hover:text-brand">
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
                className="group block overflow-hidden rounded-2xl border border-line bg-white shadow-card transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-cardHover"
              >
                <div className="relative aspect-square overflow-hidden bg-bg-base">
                  {p.imageUrl && (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      fill
                      sizes="(min-width: 768px) 25vw, 50vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  )}
                  <span className="glass absolute left-3 top-3 px-2.5 py-1 text-xs font-semibold text-ink">{formatGEL(p.price)}</span>
                </div>
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {t.design.soldBy} {p.store ?? p.brand ?? '—'}
                    </p>
                  </div>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
