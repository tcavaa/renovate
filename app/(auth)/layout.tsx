import Link from 'next/link';
import { Check } from 'lucide-react';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { getT } from '@/lib/i18n/server';

/**
 * Auth pages as an editorial spread: the brand statement on an ink panel on the left, the
 * form on paper on the right. The header is only the wordmark and the language marks.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const points = [t.design.landingPoint1, t.design.landingPoint2, t.design.landingPoint3];
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-white lg:flex xl:p-14">
        <div className="grain absolute inset-0 opacity-60" />
        <Link href="/" className="relative flex items-center gap-2.5" aria-label={t.app.name}>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[11px] font-bold text-ink">რ</span>
          <span className="font-serif text-lg font-bold tracking-tight">{t.app.name}</span>
        </Link>
        <div className="relative">
          <p className="eyebrow text-white/50">{t.landing.eyebrow}</p>
          <h2 className="display mt-4 text-display-md text-white">{t.landing.designerTitle}</h2>
          <ul className="mt-8 space-y-3 border-t border-white/15 pt-6">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-white/75">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">{t.app.tagline}</p>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex h-[72px] items-center justify-between border-b border-line px-6 md:px-10">
          <Link href="/" className="flex items-center gap-2.5 lg:invisible" aria-label={t.app.name}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">რ</span>
            <span className="font-serif text-lg font-bold tracking-tight">{t.app.name}</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="bracket-link hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              {t.nav.backHome}
            </Link>
            <LanguageSwitcher variant="desktop" />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-6 py-14 md:px-10">{children}</main>
        <p className="border-t border-line px-6 py-4 text-xs text-ink-muted md:px-10">{t.auth.sideNote}</p>
      </div>
    </div>
  );
}
