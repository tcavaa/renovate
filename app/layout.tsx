import type { Metadata } from 'next';
import { auth } from '@/auth';
import { Inter_Tight, Noto_Sans_Georgian } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { StoreOwnerGuard } from '@/components/providers/StoreOwnerGuard';
import { LocaleProvider } from '@/lib/i18n/client';
import { getLocale, getT } from '@/lib/i18n/server';

/**
 * Self-hosted through `next/font`: the files are downloaded at build time and served from
 * this origin with a preload, so there is no render-blocking round trip to Google and no
 * layout shift when the Georgian glyphs arrive. The CSS variables match `tailwind.config.ts`.
 * One family does everything: Inter Tight carries Latin and Cyrillic and comes first in the stack;
 * it has no Georgian, so Georgian falls through to Noto Sans Georgian. Both are loaded up to the
 * heavy weights the headings use (800, 900).
 */
const latinSans = Inter_Tight({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-latin-sans',
  display: 'swap',
});

const sans = Noto_Sans_Georgian({
  subsets: ['georgian', 'latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-sans',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: {
      default: `${t.app.name} — ${t.app.tagline}`,
      template: `%s · ${t.app.name}`,
    },
    description: t.app.description,
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    openGraph: {
      title: `${t.app.name} — ${t.app.tagline}`,
      description: t.app.description,
      type: 'website',
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, dictionary, session] = await Promise.all([getLocale(), getT(), auth()]);
  return (
    <html lang={locale} className={`${latinSans.variable} ${sans.variable}`}>
      {/* Browser extensions write their own attributes on <body> before React hydrates
          (ColorZilla's `cz-shortcut-listen`, a VPN's `bis_register`). This silences the mismatch
          for <body>'s own attributes only — none are ours — not for anything inside it. */}
      <body suppressHydrationWarning>
        <LocaleProvider locale={locale} dictionary={dictionary}>
          <SessionProvider session={session}>
            <StoreOwnerGuard />
            {children}
          </SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
