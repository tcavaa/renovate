import Link from 'next/link';
import { Check } from 'lucide-react';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { getT } from '@/lib/i18n/server';
import Image from '@/components/ui/image';
import { Logo } from '@/components/layout/Logo';

/**
 * Auth pages as a brand spread: an olive panel on the left — the PLAYCE lockup, an arch with a
 * piece from the catalogue, the brand statement and the tagline as paper labels — and the form
 * on sand paper on the right. The right-hand header is only the lockup and the language marks.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const points = [t.design.landingPoint1, t.design.landingPoint2, t.design.landingPoint3];
  return (
    <div className="grid min-h-screen bg-bg-base lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative m-3 hidden flex-col justify-between overflow-hidden rounded-[28px] bg-olive p-10 text-sand-light lg:flex xl:p-14">
        <div className="grain absolute inset-0 opacity-60" />
        <Link href="/" className="relative" aria-label={t.app.name}>
          <Logo tagline={t.app.tagline} tone="sand" inverted />
        </Link>
        <div className="relative">
          {/* An arch with a chair from the catalogue in it. */}
          <div className="pointer-events-none relative mb-10 h-48 w-40 xl:h-56 xl:w-48" aria-hidden>
            <span className="arch absolute inset-0 overflow-hidden bg-sand">
              <Image src="/uploads/furniture/stock-ph-mid_century_lounge_chair.webp" alt="" fill sizes="200px" className="object-contain object-bottom p-[12%] pb-[4%] mix-blend-multiply" />
            </span>
            <span className="absolute -right-5 bottom-5 h-12 w-12 rounded-[6px] bg-brand" />
          </div>
          <p className="eyebrow text-sand-light/55">{t.landing.eyebrow}</p>
          <h2 className="display mt-4 max-w-md text-display-md text-white">{t.landing.designerTitle}</h2>
          <ul className="mt-8 space-y-3 border-t border-white/15 pt-6">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-sand-light/80">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-white">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex flex-wrap gap-1.5" aria-hidden>
          {t.app.tagline.split(' ').map((word, i) => (
            <span key={word} className="paper-label text-xs" style={{ transform: `rotate(${[-2, 1.5, -1, 2][i % 4]}deg)` }}>
              {word}
            </span>
          ))}
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex h-[72px] items-center justify-between px-6 md:px-10">
          <Link href="/" className="flex items-center lg:invisible" aria-label={t.app.name}>
            <Logo tagline={t.app.tagline} taglineClassName="hidden sm:block" />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="hidden h-9 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink-soft transition-colors hover:border-ink/40 hover:text-ink sm:inline-flex">
              {t.nav.backHome}
            </Link>
            <LanguageSwitcher variant="desktop" />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-6 py-14 md:px-10">{children}</main>
        <p className="px-6 py-4 text-xs text-ink-muted md:px-10">{t.auth.sideNote}</p>
      </div>
    </div>
  );
}
