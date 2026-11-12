import Link from 'next/link';
import { Check } from 'lucide-react';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { getT } from '@/lib/i18n/server';
import Image from '@/components/ui/image';
import { Logo } from '@/components/layout/Logo';

/**
 * Auth pages as a brand spread: a black panel on the left — the white ROOMIT wordmark, a collage
 * of colour blocks with a piece from the catalogue standing in it, the brand statement and the
 * brand line on lime — and the form on the white page on the right. The right-hand header is
 * only the wordmark and the language marks.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const points = [t.design.landingPoint1, t.design.landingPoint2, t.design.landingPoint3];
  return (
    <div className="grid min-h-screen bg-bg-base lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative m-3 hidden flex-col justify-between overflow-hidden rounded-3xl bg-ink p-10 text-white lg:flex xl:p-14">
        <Link href="/" className="relative" aria-label={t.app.name}>
          <Logo inverted />
        </Link>
        <div className="relative">
          {/* Colour blocks with a chair from the catalogue standing on them. */}
          <div className="pointer-events-none relative mb-10 h-48 w-64 xl:h-56 xl:w-72" aria-hidden>
            <span className="absolute bottom-0 left-0 h-full w-[38%] bg-lilac" />
            <span className="absolute bottom-0 right-0 h-[78%] w-[52%] rounded-t-full bg-tangerine" />
            <span className="absolute bottom-0 left-[26%] grid h-[46%] w-[32%] place-items-center bg-coral">
              <span className="h-[40%] w-[40%] bg-sun" />
            </span>
            <span className="absolute -right-4 top-0 h-9 w-9 bg-lime" />
            <span className="absolute bottom-0 left-[4%] h-[92%] w-[58%]">
              <Image src="/uploads/furniture/stock-ph-mid_century_lounge_chair.webp" alt="" fill sizes="200px" className="object-contain object-bottom mix-blend-multiply" />
            </span>
          </div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
            <span className="h-2 w-2 bg-lime" aria-hidden />
            {t.landing.eyebrow}
          </p>
          <h2 className="display mt-5 max-w-md text-display-md text-white">{t.landing.designerTitle}</h2>
          <ul className="mt-8 space-y-3 border-t border-white/15 pt-6">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm font-medium text-white/80">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-lime text-ink">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-lg font-extrabold tracking-tight text-ink" aria-hidden>
          <span className="mark">{t.app.tagline}</span>
        </p>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex h-[72px] items-center justify-between px-6 md:px-10">
          <Link href="/" className="flex items-center lg:invisible" aria-label={t.app.name}>
            <Logo />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="hidden h-9 items-center rounded-full bg-mist-light px-4 text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-white sm:inline-flex">
              {t.nav.backHome}
            </Link>
            <LanguageSwitcher variant="desktop" />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-6 py-14 md:px-10">{children}</main>
        <p className="px-6 py-4 text-xs font-medium text-ink-muted md:px-10">{t.auth.sideNote}</p>
      </div>
    </div>
  );
}
