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
    <section className="relative overflow-clip py-24 md:py-28">
      <div className="container">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end">
          <div>
            <p className="reveal inline-flex items-center gap-2 rounded-full bg-mist-light py-1.5 pl-2.5 pr-3.5 text-xs font-semibold text-ink">
              <span className="h-2 w-2 bg-lime ring-1 ring-ink/10" aria-hidden />
              {t.landing.eyebrow}
            </p>
            <h2 className="display reveal mt-5 text-display-md text-ink">{t.landing.realTitle}</h2>
          </div>
          <div className="reveal md:pb-2">
            <p className="max-w-lg text-lg leading-relaxed text-ink-soft">{t.landing.realBody}</p>
            <Link
              href="/catalog"
              className="group mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-sm font-bold text-white transition-colors hover:bg-lime hover:text-ink"
            >
              {t.landing.realCta}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <ul className="reveal-stagger mt-12 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-5">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/catalog/${p.slug}`}
                className="group block"
              >
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-mist-light ring-1 ring-inset ring-line transition-shadow duration-300 group-hover:ring-2 group-hover:ring-ink">
                  {p.imageUrl && (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      fill
                      sizes="(min-width: 768px) 25vw, 50vw"
                      className="object-cover mix-blend-multiply transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  )}
                </div>
                <div className="flex items-start justify-between gap-3 px-1 pt-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold tracking-tight text-ink">{p.name}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {t.design.soldBy} {p.store ?? p.brand ?? '—'}
                    </p>
                    <p className="mt-1.5 font-display text-base tabular-nums text-ink">{formatGEL(p.price)}</p>
                  </div>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mist-light text-ink transition-colors group-hover:bg-lime">
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
