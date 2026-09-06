import type { Metadata } from 'next';
import { Noto_Sans_Georgian, Noto_Serif_Georgian } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { LocaleProvider } from '@/lib/i18n/client';
import { getLocale, getT } from '@/lib/i18n/server';

/**
 * Self-hosted through `next/font`: the files are downloaded at build time and served from
 * this origin with a preload, so there is no render-blocking round trip to Google and no
 * layout shift when the Georgian glyphs arrive. The CSS variables match `tailwind.config.ts`.
 * Neither family ships a Cyrillic subset, so the Russian UI falls back to the system stack.
 */
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
    icons: {
      icon: '/favicon.ico',
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dictionary = await getT();
  return (
    <html lang={locale} className={`${sans.variable} ${serif.variable}`}>
      <body>
        <LocaleProvider locale={locale} dictionary={dictionary}>
          <SessionProvider>{children}</SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
