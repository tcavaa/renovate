import type { Metadata } from 'next';
import { auth } from '@/auth';
import { Cormorant_Garamond, Jost, Noto_Sans_Georgian, Noto_Serif_Georgian } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { StoreOwnerGuard } from '@/components/providers/StoreOwnerGuard';
import { LocaleProvider } from '@/lib/i18n/client';
import { getLocale, getT } from '@/lib/i18n/server';

/**
 * Self-hosted through `next/font`: the files are downloaded at build time and served from
 * this origin with a preload, so there is no render-blocking round trip to Google and no
 * layout shift when the Georgian glyphs arrive. The CSS variables match `tailwind.config.ts`.
 * The brand faces come first in each stack — Jost (the wordmark's geometric sans) and Cormorant
 * Garamond (the serif) carry Latin and Cyrillic; neither has Georgian, so Georgian falls
 * through to Noto.
 */
const latinSans = Jost({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-latin-sans',
  display: 'swap',
});

const latinSerif = Cormorant_Garamond({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-latin-serif',
  display: 'swap',
});

const sans = Noto_Sans_Georgian({
  subsets: ['georgian', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Noto_Serif_Georgian({
  subsets: ['georgian', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-serif',
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
    <html lang={locale} className={`${latinSans.variable} ${latinSerif.variable} ${sans.variable} ${serif.variable}`}>
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
